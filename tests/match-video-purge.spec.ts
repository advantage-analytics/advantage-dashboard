import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import { runMatchVideoCleanup } from "@/lib/services/match-video/cleanup";
import {
  describeRun,
  purgeMatchAttachments,
  type AttachmentPurgeDeps,
} from "@/lib/services/match-video/purge";
import { RESULTS_BUCKET } from "@/lib/services/splitstep/config";
import { MATCH_DATA_BUCKET } from "@/lib/services/upload/storage.service";

import {
  at,
  clock,
  harness,
  HOUR,
  MINUTE,
  resetClock,
} from "./fixtures/match-video-cleanup-fakes";

/**
 * Plan step 10 — match and account deletion against the attachment table.
 *
 * Each test runs the real deletion sequence in order: `purgeMatchStorage`
 * (before the rows go, as both callers do), then the match delete — modelled
 * as the foreign key's `on delete set null` on the fake table — then the
 * post-delete run the purge scheduled, then the daily sweep. Outcomes are
 * read from the fake table and container, never inferred from a report.
 *
 * The fake Supabase client here is the CALLER's client: what `purgeMatchStorage`
 * reads `processing_jobs`, `match_files` and `matches` through and removes
 * Supabase Storage objects with. The attachment lane's service-role reads
 * are the injected `listAttachments`; the worker runs over the same fakes
 * as `tests/match-video-cleanup.spec.ts`.
 */

test.beforeEach(() => {
  resetClock();
});

/* -------------------------------------------------------------------------
 * The caller's Supabase client
 * ---------------------------------------------------------------------- */

interface Tables {
  matches?: Array<{ id: string }>;
  processing_jobs?: Array<{
    match_id: string;
    video_object_key: string | null;
    trimmed_object_key: string | null;
    results_object_key: string | null;
  }>;
  match_files?: Array<{ match_id: string; storage_path: string | null }>;
}

function fakeCaller(tables: Tables, options: { matchesError?: string } = {}) {
  const reads: string[] = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const client = {
    from(table: keyof Tables) {
      return {
        select() {
          return {
            async in(column: string, ids: string[]) {
              reads.push(table);
              if (table === "matches" && options.matchesError) {
                return { data: null, error: { message: options.matchesError } };
              }
              const rows = (tables[table] ?? []) as Array<
                Record<string, unknown>
              >;
              return {
                data: rows.filter((r) => ids.includes(r[column] as string)),
                error: null,
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          async remove(paths: string[]) {
            removed.push({ bucket, paths });
            return { error: null };
          },
        };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, reads, removed };
}

/* -------------------------------------------------------------------------
 * The attachment lane's seams
 * ---------------------------------------------------------------------- */

function purgeDeps(overrides: Partial<AttachmentPurgeDeps> = {}) {
  const h = harness();
  const scheduled: Array<() => Promise<void>> = [];
  const listed: string[][] = [];
  const deps: AttachmentPurgeDeps = {
    async listAttachments(matchIds) {
      listed.push(matchIds);
      return h.db
        .forMatches(matchIds)
        .map((r) => ({ id: r.id, state: r.state }));
    },
    cleanup: h.deps,
    async schedule(task) {
      scheduled.push(task);
    },
    ...overrides,
  };
  /** What `after()` does once the response — and the delete — are done. */
  const runScheduled = async () => {
    const tasks = scheduled.splice(0);
    for (const task of tasks) await task();
    return tasks.length;
  };
  return { ...h, deps, scheduled, listed, runScheduled };
}

const originalLog = console.log;
test.beforeEach(() => {
  console.log = () => {};
});
test.afterEach(() => {
  console.log = originalLog;
});

/* =========================================================================
 * Match deletion
 * ====================================================================== */

test("match delete: the rows are orphaned by the delete and the scheduled run collects them; a live upload credential defers its row to the sweep", async () => {
  const p = purgeDeps();
  const matchId = randomUUID();
  const published = p.seed({
    match_id: matchId,
    state: "active",
    retired_at: null,
  });
  // A second attempt mid-upload: its browser still holds a SAS for an hour.
  const uploading = p.seed({
    match_id: matchId,
    state: "pending",
    retired_at: null,
    upload_sas_expires_at: at(HOUR),
    last_attempt_at: clock.now,
  });
  const caller = fakeCaller({ matches: [{ id: matchId }] });

  await purgeMatchStorage(caller.client, [matchId], "match delete", {
    attachments: p.deps,
  });

  // Before the delete nothing is touched: no storage call, no state change.
  expect(p.container.events).toEqual([]);
  expect(p.db.get(published.id).state).toBe("active");
  expect(p.listed).toEqual([[matchId]]);
  expect(p.scheduled).toHaveLength(1);

  // The delete commits; the foreign key nulls match_id.
  p.db.orphan(matchId);
  expect(await p.runScheduled()).toBe(1);

  // The published asset was collectible at once: retired by the claim, both
  // objects gone, closed.
  const gone = p.db.get(published.id);
  expect(gone.state).toBe("retired");
  expect(gone.cleaned_up_at).not.toBeNull();
  expect(p.container.blobs.has(published.final_blob_key)).toBe(false);
  expect(p.container.blobs.has(published.staged_blob_key)).toBe(false);

  // The one still under a live credential was not: its object is untouched
  // and its row still names it.
  const held = p.db.get(uploading.id);
  expect(held.cleaned_up_at).toBeNull();
  expect(held.staged_blob_key).toBe(uploading.staged_blob_key);
  expect(p.container.blobs.has(uploading.staged_blob_key)).toBe(true);
  expect(p.container.ops("delete", uploading.staged_blob_key)).toHaveLength(0);

  // ...but it is fenced already: a late completion cannot find its match.
  expect(p.db.lateActivation(uploading.id, matchId)).toBe("match_not_found");

  // Once the credential is dead plus five minutes, the sweep takes it.
  clock.now = at(HOUR + 6 * MINUTE);
  const sweep = await runMatchVideoCleanup(p.deps.cleanup);
  expect(sweep.outcomes.cleaned_up).toBe(1);
  expect(p.db.get(uploading.id).state).toBe("retired");
  expect(p.db.get(uploading.id).cleaned_up_at).not.toBeNull();
  expect(p.container.blobs.has(uploading.staged_blob_key)).toBe(false);
});

test("a match with no attachment costs one read and schedules nothing", async () => {
  const p = purgeDeps();
  const matchId = randomUUID();
  const caller = fakeCaller({ matches: [{ id: matchId }] });

  const report = await purgeMatchAttachments({
    caller: caller.client,
    matchIds: [matchId],
    label: "match delete",
    deps: p.deps,
  });

  expect(report).toEqual({
    authorizedMatchIds: [matchId],
    attachments: [],
    scheduled: false,
  });
  expect(p.listed).toEqual([[matchId]]);
  expect(p.scheduled).toHaveLength(0);
});

test("authorization narrows: an id the caller's client cannot read never reaches the service-role read", async () => {
  const p = purgeDeps();
  const mine = randomUUID();
  const theirs = randomUUID();
  p.seed({ match_id: theirs, state: "active", retired_at: null });
  p.seed({ match_id: mine, state: "active", retired_at: null });
  // RLS shows the caller only their own match.
  const caller = fakeCaller({ matches: [{ id: mine }] });

  const report = await purgeMatchAttachments({
    caller: caller.client,
    matchIds: [mine, theirs],
    label: "match delete",
    deps: p.deps,
  });

  expect(report.authorizedMatchIds).toEqual([mine]);
  expect(p.listed).toEqual([[mine]]);
  expect(report.attachments).toHaveLength(1);

  // And with nothing visible, nothing is read or scheduled at all.
  const blind = fakeCaller({ matches: [] });
  const none = await purgeMatchAttachments({
    caller: blind.client,
    matchIds: [theirs],
    label: "match delete",
    deps: p.deps,
  });
  expect(none.scheduled).toBe(false);
  expect(p.listed).toEqual([[mine]]);
});

/* =========================================================================
 * Isolation — the attachment lane cannot take the other three with it
 * ====================================================================== */

const OTHER_LANES = {
  processing_jobs: [
    {
      match_id: "",
      video_object_key: null,
      trimmed_object_key: null,
      results_object_key: "results/job/strokes.json",
    },
  ],
  match_files: [{ match_id: "", storage_path: "uploads/match.xlsx" }],
};

function otherLanes(matchId: string): Tables {
  return {
    matches: [{ id: matchId }],
    processing_jobs: OTHER_LANES.processing_jobs.map((j) => ({
      ...j,
      match_id: matchId,
    })),
    match_files: OTHER_LANES.match_files.map((f) => ({
      ...f,
      match_id: matchId,
    })),
  };
}

function expectOtherLanesRan(caller: ReturnType<typeof fakeCaller>) {
  expect(caller.reads).toContain("processing_jobs");
  expect(caller.reads).toContain("match_files");
  expect(caller.removed).toContainEqual({
    bucket: RESULTS_BUCKET,
    paths: ["results/job/strokes.json"],
  });
  expect(caller.removed).toContainEqual({
    bucket: MATCH_DATA_BUCKET,
    paths: ["uploads/match.xlsx"],
  });
}

for (const failure of [
  {
    name: "the service-role attachment read throws",
    overrides: (): Partial<AttachmentPurgeDeps> => ({
      async listAttachments() {
        throw new Error("attachments table unreachable");
      },
    }),
  },
  {
    name: "scheduling the post-delete run throws",
    overrides: (): Partial<AttachmentPurgeDeps> => ({
      async schedule() {
        throw new Error("after() unavailable");
      },
    }),
  },
  {
    name: "the caller's authorization read fails",
    overrides: (): Partial<AttachmentPurgeDeps> => ({}),
    matchesError: "connection reset",
  },
]) {
  test(`provider-file and job cleanup still complete when ${failure.name}`, async () => {
    const p = purgeDeps(failure.overrides());
    const matchId = randomUUID();
    const row = p.seed({
      match_id: matchId,
      state: "active",
      retired_at: null,
    });
    const caller = fakeCaller(otherLanes(matchId), {
      matchesError: failure.matchesError,
    });
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(String(args[0]));

    try {
      await expect(
        purgeMatchStorage(caller.client, [matchId], "match delete", {
          attachments: p.deps,
        }),
      ).resolves.toBeUndefined();
    } finally {
      console.error = originalError;
    }

    expectOtherLanesRan(caller);
    expect(errors.some((e) => e.includes("attachment cleanup threw"))).toBe(
      true,
    );
    // Nothing about the attachment row was lost by the failure: the delete
    // still orphans it and the next sweep still collects it.
    p.db.orphan(matchId);
    expect(
      (await runMatchVideoCleanup(p.deps.cleanup)).outcomes.cleaned_up,
    ).toBe(1);
    expect(p.container.blobs.has(row.final_blob_key)).toBe(false);
  });
}

/* =========================================================================
 * Account deletion — personal matches only; the team keeps its footage
 * ====================================================================== */

test("account deletion's personal-match filter is unchanged in the server action", async () => {
  // The policy lives in `deleteAccount()`; this pins the two clauses that
  // hand `purgeMatchStorage` only the caller's personal matches.
  const source = readFileSync(
    "src/components/dashboard/settings/actions.ts",
    "utf8",
  );
  const start = source.indexOf("export async function deleteAccount");
  const body = source.slice(start, source.indexOf("purgeMatchStorage(", start));
  expect(body).toMatch(
    /\.eq\("created_by", user\.id\)\s*\.is\("program_id", null\)/,
  );
  expect(source.slice(start)).toContain(
    'purgeMatchStorage(adminClient, matchIds, "account delete")',
  );
});

test("account delete: the personal match's video is collected; the retained team match keeps its playable video when the uploader goes null", async () => {
  const p = purgeDeps();
  const user = randomUUID();
  const personal = randomUUID();
  const team = randomUUID();
  const own = p.seed({
    match_id: personal,
    uploaded_by: user,
    state: "active",
    retired_at: null,
  });
  const retained = p.seed({
    match_id: team,
    uploaded_by: user,
    state: "active",
    retired_at: null,
    version: 2,
  });
  // The admin client sees everything; the ACTION passes only personal ids.
  const admin = fakeCaller({ matches: [{ id: personal }, { id: team }] });

  await purgeMatchStorage(admin.client, [personal], "account delete", {
    attachments: p.deps,
  });
  expect(p.listed).toEqual([[personal]]);

  // The personal match is deleted (FK null); the auth user is deleted last
  // (`uploaded_by` FK null on every row the person uploaded).
  p.db.orphan(personal);
  for (const row of p.db.rows.values()) {
    if (row.uploaded_by === user) row.uploaded_by = null;
  }
  await p.runScheduled();

  expect(p.db.get(own.id).cleaned_up_at).not.toBeNull();
  expect(p.container.blobs.has(own.final_blob_key)).toBe(false);

  // The team's asset: staged shed, final kept, row active, keys and version
  // intact — and it stays that way through the daily sweeps.
  const kept = p.db.get(retained.id);
  expect(kept.state).toBe("active");
  expect(kept.match_id).toBe(team);
  expect(kept.uploaded_by).toBeNull();
  expect(kept.final_blob_key).toBe(retained.final_blob_key);
  expect(kept.version).toBe(2);
  expect(kept.cleaned_up_at).toBeNull();
  expect(p.container.blobs.has(retained.final_blob_key)).toBe(true);
  expect(p.container.ops("delete", retained.final_blob_key)).toHaveLength(0);

  clock.now = at(72 * HOUR);
  await runMatchVideoCleanup(p.deps.cleanup);
  expect(p.db.get(retained.id).state).toBe("active");
  expect(p.container.blobs.has(retained.final_blob_key)).toBe(true);
});

/* =========================================================================
 * Failure and retry — durable keys
 * ====================================================================== */

test("a failed deletion keeps the keys and the retry metadata; the next sweep finishes the job", async () => {
  const p = purgeDeps();
  const matchId = randomUUID();
  const row = p.seed({ match_id: matchId, state: "active", retired_at: null });
  p.container.failDelete.add(row.final_blob_key);
  const caller = fakeCaller({ matches: [{ id: matchId }] });

  await purgeMatchStorage(caller.client, [matchId], "match delete", {
    attachments: p.deps,
  });
  p.db.orphan(matchId);
  await p.runScheduled();

  const failed = p.db.get(row.id);
  expect(failed.state).toBe("retired"); // fenced by the claim, even so
  expect(failed.cleaned_up_at).toBeNull();
  expect(failed.cleanup_attempts).toBe(1);
  expect(failed.cleanup_last_error).toContain("final:");
  expect(failed.cleanup_next_attempt_at!.getTime()).toBeGreaterThan(
    clock.now.getTime(),
  );
  expect(failed.staged_blob_key).toBe(row.staged_blob_key);
  expect(failed.final_blob_key).toBe(row.final_blob_key);
  expect(failed.cleanup_lease_token).toBeNull();
  expect(p.container.blobs.has(row.final_blob_key)).toBe(true);

  // Not before its backoff.
  expect((await runMatchVideoCleanup(p.deps.cleanup)).claimed).toBe(0);

  p.container.failDelete.clear();
  clock.now = at(HOUR);
  const retry = await runMatchVideoCleanup(p.deps.cleanup);
  expect(retry.outcomes.cleaned_up).toBe(1);
  expect(p.db.get(row.id).cleaned_up_at).not.toBeNull();
  expect(p.container.blobs.has(row.final_blob_key)).toBe(false);
  expect(p.container.blobs.has(row.staged_blob_key)).toBe(false);
});

/* =========================================================================
 * Late upload / copy activity after the match is gone
 * ====================================================================== */

test("a copy in flight when the match is deleted: activation is refused, the copy is aborted before the delete, and settling it recreates nothing", async () => {
  const p = purgeDeps();
  const matchId = randomUUID();
  // Completion (T10) holds the row and its copy is running.
  const row = p.db.add({
    match_id: matchId,
    state: "pending",
    retired_at: null,
    copy_id: "copy-1",
    copy_status: "pending",
    finalize_lease_until: at(10 * MINUTE),
    last_attempt_at: clock.now,
  });
  p.container.put(row.staged_blob_key);
  p.container.startPendingCopy(row.final_blob_key, "copy-1");
  const caller = fakeCaller({ matches: [{ id: matchId }] });

  await purgeMatchStorage(caller.client, [matchId], "match delete", {
    attachments: p.deps,
  });
  p.db.orphan(matchId);
  await p.runScheduled();

  // Under a live finalization lease the orphan is left alone this run...
  expect(p.db.get(row.id).state).toBe("pending");
  expect(p.container.ops("abort")).toHaveLength(0);
  // ...but the completion that comes back cannot activate it.
  expect(p.db.lateActivation(row.id, matchId)).toBe("match_not_found");
  expect(p.db.get(row.id).state).toBe("pending");

  // The lease lapses; the sweep retires the orphan, aborts its copy, then
  // deletes both objects.
  clock.now = at(15 * MINUTE);
  const sweep = await runMatchVideoCleanup(p.deps.cleanup);
  expect(sweep.outcomes.cleaned_up).toBe(1);
  const ops = p.container.events.map((e) => e.op);
  expect(ops.indexOf("abort")).toBeLessThan(ops.indexOf("delete"));
  expect(p.db.get(row.id).state).toBe("retired");
  expect(p.db.lateActivation(row.id, matchId)).toBe("match_not_found");

  // Azure finishing the (aborted) copy afterwards writes nothing back.
  p.container.settleCopies();
  expect(p.container.blobs.has(row.final_blob_key)).toBe(false);
  expect(p.container.blobs.has(row.staged_blob_key)).toBe(false);
});

test("a late upload under a still-valid credential is fenced at once and collected once the credential dies", async () => {
  const p = purgeDeps();
  const matchId = randomUUID();
  const row = p.seed({
    match_id: matchId,
    state: "pending",
    retired_at: null,
    upload_sas_expires_at: at(30 * MINUTE),
    last_attempt_at: clock.now,
  });
  const caller = fakeCaller({ matches: [{ id: matchId }] });

  await purgeMatchStorage(caller.client, [matchId], "match delete", {
    attachments: p.deps,
  });
  p.db.orphan(matchId);
  await p.runScheduled();

  // The browser can still write the staged object; the worker must not pull
  // it away, and no completion can ever publish it.
  expect(p.container.ops("delete")).toHaveLength(0);
  expect(p.db.lateActivation(row.id, matchId)).toBe("match_not_found");

  clock.now = at(36 * MINUTE);
  expect((await runMatchVideoCleanup(p.deps.cleanup)).outcomes.cleaned_up).toBe(
    1,
  );
  expect(p.container.blobs.has(row.staged_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * The post-delete log line
 * ---------------------------------------------------------------------- */

test("describeRun counts this delete's rows as collected, retrying or deferred and ignores the rest of the batch", () => {
  const ids = new Set(["a", "b", "c"]);
  const report = describeRun(ids, {
    workerToken: "w",
    claimed: 3,
    outcomes: {
      cleaned_up: 2,
      staged_shed: 0,
      rescheduled: 0,
      lease_lost: 0,
      version_changed: 0,
      failed: 1,
      unsettled: 0,
    },
    rows: [
      {
        attachmentId: "a",
        state: "retired",
        outcome: "cleaned_up",
        stagedDeleted: true,
        finalDeleted: true,
      },
      {
        attachmentId: "b",
        state: "retired",
        outcome: "failed",
        detail: "final:x",
        stagedDeleted: false,
        finalDeleted: false,
      },
      {
        attachmentId: "other",
        state: "retired",
        outcome: "cleaned_up",
        stagedDeleted: true,
        finalDeleted: true,
      },
    ],
  });
  expect(report).toEqual({ collected: 1, retrying: 1, deferred: 1 });
});
