import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The reconciler's results sweep (`recoverUndeliveredResults`), run against an
 * in-memory `processing_jobs` table with every side effect injected.
 *
 * The sweep recovers jobs at `status = completed` with no results key and no
 * derivation — a webhook whose download failed. Under test:
 *
 *  - a fresh row is claimed (last_polled_at stamped), secured, graded, then
 *    derived, in that order, under the webhook's own storage key;
 *  - an expired strokes url marks RESULTS_DELIVERY_LOST without a download;
 *  - a first failed download waits; a second one marks the job lost;
 *  - a row whose status changed mid-sweep is left alone (0-row update);
 *  - a row another sweep claimed first is skipped (0-row claim);
 *  - no more than 2 rows per read;
 *  - reconcileBeforePageRead schedules the sweep with after() and does not
 *    await it.
 */

const NOW = new Date("2026-09-28T12:00:00.000Z");
const iso = (minutesAgo: number) =>
  new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
const FUTURE = "2026-10-05T00:00:00.000Z";

type Row = Record<string, unknown> & { id: string };

function jobRow(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    match_id: `m-${id}`,
    created_by: "u-1",
    external_job_id: `ext-${id}`,
    status: "completed",
    results_object_key: null,
    derivation_version: null,
    sas_url: `https://vendor.blob.core.windows.net/r/${id}.json?se=2026-10-05T00%3A00%3A00Z&sig=x`,
    sas_expires_at: FUTURE,
    completed_at: iso(30),
    last_polled_at: null,
    ...overrides,
  };
}

type Filter = (row: Row) => boolean;

/**
 * Just enough of PostgREST's builder for the sweep: eq / is / lt / in / the
 * one `or` shape it sends, order, limit, and update(...).select().
 * `onUpdate` runs before an update's filters are evaluated, so a test can
 * move a row underneath the sweep.
 */
function fakeSupabase(
  rows: Row[],
  onUpdate?: (patch: Record<string, unknown>, rows: Row[]) => void,
) {
  const updates: Record<string, unknown>[] = [];
  const limits: number[] = [];

  function builder(mode: "select" | "update", patch?: Record<string, unknown>) {
    const filters: Filter[] = [];
    let limit = Infinity;
    let orderCol: string | null = null;
    const b = {
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return b;
      },
      is(col: string, v: null) {
        filters.push((r) => r[col] === v);
        return b;
      },
      lt(col: string, v: string) {
        filters.push((r) => typeof r[col] === "string" && r[col] < v);
        return b;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return b;
      },
      or(expr: string) {
        const m = /^(\w+)\.is\.null,\1\.lt\.(.+)$/.exec(expr);
        if (!m) throw new Error(`unexpected or() ${expr}`);
        const [, col, v] = m;
        filters.push(
          (r) => r[col] === null || (typeof r[col] === "string" && r[col] < v),
        );
        return b;
      },
      order(col: string) {
        orderCol = col;
        return b;
      },
      limit(n: number) {
        limits.push(n);
        limit = n;
        return b;
      },
      select() {
        return b;
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          if (mode === "update") {
            updates.push(patch!);
            onUpdate?.(patch!, rows);
            const hit = rows.filter((r) => filters.every((f) => f(r)));
            for (const r of hit) Object.assign(r, patch);
            resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
          } else {
            let hit = rows.filter((r) => filters.every((f) => f(r)));
            if (orderCol) {
              const c = orderCol;
              hit = [...hit].sort((a, z) =>
                String(a[c]).localeCompare(String(z[c])),
              );
            }
            resolve({
              data: hit.slice(0, limit).map((r) => ({ ...r })),
              error: null,
            });
          }
        } catch (e) {
          reject(e);
        }
      },
    };
    return b;
  }

  const client = {
    from(table: string) {
      if (table !== "processing_jobs")
        throw new Error(`unexpected table ${table}`);
      return {
        select: () => builder("select"),
        update: (patch: Record<string, unknown>) => builder("update", patch),
      };
    },
  };
  return { client, updates, limits };
}

interface Calls {
  log: string[];
  secure: { jobId: string; strokesUrl: string; objectKey: string }[];
}

function fakeIo(opts: { secureOk?: boolean } = {}) {
  const calls: Calls = { log: [], secure: [] };
  const io = {
    resultsKeyFor: (job: { id: string; match_id: string }) =>
      `results/u-1/${job.match_id}/${job.id}.json`,
    secureResults: async (p: {
      jobId: string;
      strokesUrl: string;
      objectKey: string;
    }) => {
      calls.log.push(`secure:${p.jobId}`);
      calls.secure.push({
        jobId: p.jobId,
        strokesUrl: p.strokesUrl,
        objectKey: p.objectKey,
      });
      return opts.secureOk === false
        ? { resultsSecured: false, error: "Vendor returned 403 Forbidden" }
        : {
            resultsSecured: true,
            objectKey: p.objectKey,
            bytes: 10,
            body: "{}",
          };
    },
    gradeResults: async (p: { jobId: string; objectKey: string }) => {
      calls.log.push(`grade:${p.jobId}:${p.objectKey}`);
      return { ok: true };
    },
    deriveAndPublish: async (p: { jobId: string; deadline?: number }) => {
      calls.log.push(`derive:${p.jobId}:${typeof p.deadline}`);
      return { ok: true };
    },
    releaseQuota: async (_s: unknown, jobId: string) => {
      calls.log.push(`release:${jobId}`);
    },
    notifyAnalysisOutcome: async (p: { jobId: string; outcome: string }) => {
      calls.log.push(`mail:${p.jobId}:${p.outcome}`);
    },
  };
  return { io, calls };
}

function load() {
  const scheduled: (() => Promise<void>)[] = [];
  const loader = createLoader({
    globals: { Error, URL },
    stubs: {
      "next/server": {
        after: (fn: () => Promise<void>) => {
          scheduled.push(fn);
        },
      },
      "./webhook-payload": {
        normaliseKey: (k: string) => k,
        parseWebhookPayload: () => ({}),
      },
      "./quota": { releaseQuota: async () => undefined },
      "./resubmit-job": {
        isDownloadFailure: () => false,
        resubmitJob: async () => ({ ok: false }),
      },
      "@/lib/services/notifications/analysis-mail": {
        notifyAnalysisOutcome: async () => undefined,
      },
      // The poll half skips on an unconfigured deployment.
      "./deployment-config": {
        resolveSplitstepVendorApiConfig: () => ({ ok: false }),
      },
    },
  });
  const mod = loader.load("src/lib/services/splitstep/reconcile.ts");
  return {
    sweep: mod.recoverUndeliveredResults as (p: {
      supabase: unknown;
      matchIds?: string[];
      now?: () => Date;
      io?: unknown;
    }) => Promise<{ claimed: number; recovered: number; lost: number }>,
    reconcileBeforePageRead: mod.reconcileBeforePageRead as (
      ids: string[],
      tag: string,
    ) => Promise<void>,
    scheduled,
    loader,
  };
}

const quiet = { log: console.log, warn: console.warn, error: console.error };
test.beforeEach(() => {
  console.log = console.warn = console.error = () => undefined;
});
test.afterEach(() => Object.assign(console, quiet));

const now = () => NOW;

test("a fresh row is claimed, secured, graded, then derived", async () => {
  const rows = [jobRow("j1")];
  const { client } = fakeSupabase(rows);
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });

  expect(out).toEqual({ claimed: 1, recovered: 1, lost: 0 });
  expect(calls.log).toEqual([
    "secure:j1",
    "grade:j1:results/u-1/m-j1/j1.json",
    "derive:j1:number",
  ]);
  expect(calls.secure[0]).toEqual({
    jobId: "j1",
    strokesUrl: rows[0].sas_url,
    objectKey: "results/u-1/m-j1/j1.json",
  });
  // The claim stamped the row; status is left for deriveAndPublish to move.
  expect(rows[0].last_polled_at).toBe(NOW.toISOString());
  expect(rows[0].status).toBe("completed");
});

test("rows completed under 10 minutes ago, or already keyed, are not selected", async () => {
  const rows = [
    jobRow("recent", { completed_at: iso(5) }),
    jobRow("keyed", { results_object_key: "results/x.json" }),
    jobRow("derived", { derivation_version: "v3" }),
    jobRow("recently-tried", { last_polled_at: iso(3), completed_at: iso(40) }),
  ];
  const { client } = fakeSupabase(rows);
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });
  expect(out.claimed).toBe(0);
  expect(calls.log).toEqual([]);
});

test("an expired sas_expires_at marks RESULTS_DELIVERY_LOST without a download", async () => {
  const rows = [jobRow("j1", { sas_expires_at: iso(1) })];
  const { client } = fakeSupabase(rows);
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });

  expect(out).toEqual({ claimed: 1, recovered: 0, lost: 1 });
  expect(calls.secure).toEqual([]);
  expect(rows[0]).toMatchObject({
    status: "failed",
    error_code: "RESULTS_DELIVERY_LOST",
    error_category: "internal",
    error_step: null,
    error_message:
      "The analysis finished, but its results never arrived. Retry the analysis.",
    completed_at: NOW.toISOString(),
  });
  expect(calls.log).toEqual(["release:j1", "mail:j1:failed"]);
});

test("with no sas_expires_at, the SAS token's own se= expiry is honoured", async () => {
  const rows = [
    jobRow("j1", {
      sas_expires_at: null,
      sas_url:
        "https://vendor.blob.core.windows.net/r/j1.json?se=2026-09-20T00%3A00%3A00Z&sig=x",
    }),
  ];
  const { client } = fakeSupabase(rows);
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });
  expect(out.lost).toBe(1);
  expect(calls.secure).toEqual([]);
  expect(rows[0].error_code).toBe("RESULTS_DELIVERY_LOST");
});

test("a first failed download waits; the second marks the job lost", async () => {
  // First attempt: never tried before.
  const rows = [jobRow("j1")];
  const { client } = fakeSupabase(rows);
  const first = fakeIo({ secureOk: false });
  const { sweep } = load();

  const out1 = await sweep({ supabase: client, now, io: first.io });
  expect(out1).toEqual({ claimed: 1, recovered: 0, lost: 0 });
  expect(rows[0].status).toBe("completed");
  expect(rows[0].last_polled_at).toBe(NOW.toISOString());
  expect(first.calls.log).toEqual(["secure:j1"]);

  // Second attempt, past the 10-minute gap: the stamp is later than
  // completed_at, so this failure is the one that decides.
  const later = new Date(NOW.getTime() + 11 * 60_000);
  const second = fakeIo({ secureOk: false });
  const out2 = await sweep({
    supabase: client,
    now: () => later,
    io: second.io,
  });
  expect(out2).toEqual({ claimed: 1, recovered: 0, lost: 1 });
  expect(rows[0]).toMatchObject({
    status: "failed",
    error_code: "RESULTS_DELIVERY_LOST",
  });
  expect(second.calls.log).toEqual([
    "secure:j1",
    "release:j1",
    "mail:j1:failed",
  ]);
});

test("a status-poll stamp from before completion is not a previous attempt", async () => {
  const rows = [
    jobRow("j1", { completed_at: iso(30), last_polled_at: iso(45) }),
  ];
  const { client } = fakeSupabase(rows);
  const { io } = fakeIo({ secureOk: false });
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });
  expect(out.lost).toBe(0);
  expect(rows[0].status).toBe("completed");
});

test("a row whose status changed mid-sweep is left alone", async () => {
  // Expired url, so the sweep goes straight to marking lost — but between the
  // claim and that write, something else (a derivation) moves the row.
  const rows = [jobRow("j1", { sas_expires_at: iso(1) })];
  const { client, updates } = fakeSupabase(rows, (patch, all) => {
    if (patch.status === "failed") all[0].status = "deriving";
  });
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });

  expect(out.lost).toBe(0);
  // The conditional update was sent and matched nothing.
  expect(updates.some((u) => u.status === "failed")).toBe(true);
  expect(rows[0].status).toBe("deriving");
  expect(rows[0].error_code).toBeUndefined();
  // No refund, no mail for a job the sweep did not settle.
  expect(calls.log).toEqual([]);
});

test("a row another sweep claimed first is skipped", async () => {
  const rows = [jobRow("j1")];
  // The rival's stamp lands between this sweep's read and its claim.
  const { client } = fakeSupabase(rows, (patch, all) => {
    if ("last_polled_at" in patch && !("status" in patch))
      all[0].last_polled_at = "2026-09-28T11:59:59.000Z";
  });
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });

  expect(out).toEqual({ claimed: 0, recovered: 0, lost: 0 });
  expect(calls.log).toEqual([]);
});

test("no more than 2 rows are swept per read, oldest first", async () => {
  const rows = [
    jobRow("j1", { completed_at: iso(20) }),
    jobRow("j2", { completed_at: iso(60) }),
    jobRow("j3", { completed_at: iso(40) }),
  ];
  const { client, limits } = fakeSupabase(rows);
  const { io, calls } = fakeIo();
  const { sweep } = load();

  const out = await sweep({ supabase: client, now, io });

  expect(limits).toEqual([2]);
  expect(out.claimed).toBe(2);
  expect(calls.secure.map((s) => s.jobId)).toEqual(["j2", "j3"]);
  expect(rows[0].last_polled_at).toBeNull();
});

test("matchIds scopes the sweep; an empty list sweeps nothing", async () => {
  const rows = [jobRow("j1"), jobRow("j2")];
  const { client } = fakeSupabase(rows);
  const { io, calls } = fakeIo();
  const { sweep } = load();

  expect(
    (await sweep({ supabase: client, now, io, matchIds: [] })).claimed,
  ).toBe(0);
  await sweep({ supabase: client, now, io, matchIds: ["m-j2"] });
  expect(calls.secure.map((s) => s.jobId)).toEqual(["j2"]);
});

test("reconcileBeforePageRead schedules the sweep with after() and does not await it", async () => {
  const { reconcileBeforePageRead, scheduled } = load();

  await reconcileBeforePageRead(["m-1"], "matches");

  // Returned with the sweep still pending in after().
  expect(scheduled).toHaveLength(1);
});

test("an error inside the scheduled sweep is logged, never thrown", async () => {
  const scheduled: (() => Promise<void>)[] = [];
  const loader = createLoader({
    globals: { Error, URL },
    stubs: {
      "next/server": {
        after: (fn: () => Promise<void>) => scheduled.push(fn),
      },
      "@/lib/supabase/admin": {
        createAdminClient: () => {
          throw new Error("no service key");
        },
      },
      "./deployment-config": {
        resolveSplitstepVendorApiConfig: () => ({ ok: false }),
      },
      "@/lib/services/notifications/analysis-mail": {
        notifyAnalysisOutcome: async () => undefined,
      },
      "./resubmit-job": {
        isDownloadFailure: () => false,
        resubmitJob: async () => ({ ok: false }),
      },
    },
  });
  const mod = loader.load("src/lib/services/splitstep/reconcile.ts");
  const read = mod.reconcileBeforePageRead as (
    ids: string[],
    tag: string,
  ) => Promise<void>;

  await read(["m-1"], "match-detail");
  expect(scheduled).toHaveLength(1);
  await expect(scheduled[0]()).resolves.toBeUndefined();
});
