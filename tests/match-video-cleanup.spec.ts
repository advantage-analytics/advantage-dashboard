import { expect, test } from "@playwright/test";

import { matchVideoError } from "@/lib/match-video/types";
import {
  authorizeCronRequest,
  CLEANUP_CRON_PATH,
  CLEANUP_CRON_REASON,
  handleCleanupCron,
  type CleanupCronDeps,
} from "@/lib/services/match-video/cleanup-schedule";
import {
  CLEANUP_BATCH_LIMIT,
  CLEANUP_CONCURRENCY,
  requestBestEffortCleanup,
  runMatchVideoCleanup,
} from "@/lib/services/match-video/cleanup";

import {
  at,
  clock,
  harness,
  HOUR,
  INFINITY,
  MINUTE,
  resetClock,
  rest,
  type Row,
} from "./fixtures/match-video-cleanup-fakes";

/**
 * The cleanup worker (T14) against fakes that keep T13's semantics — the
 * fake table and container live in `fixtures/match-video-cleanup-fakes.ts`,
 * shared with the deletion-integration spec (T16).
 *
 * Every claim is read from the store afterwards — keys, state, attempts,
 * `cleaned_up_at` — never inferred from the summary alone.
 */

test.beforeEach(() => {
  resetClock();
});

/* -------------------------------------------------------------------------
 * Happy path and duplicate sweeps
 * ---------------------------------------------------------------------- */

test("a retired row loses both objects and is closed; a second sweep finds nothing", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed();

  const first = await runMatchVideoCleanup(deps);
  expect(first.claimed).toBe(1);
  expect(first.outcomes.cleaned_up).toBe(1);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(container.blobs.has(row.final_blob_key)).toBe(false);

  const stored = db.get(row.id);
  expect(stored.cleaned_up_at).toEqual(clock.now);
  expect(stored.cleanup_lease_token).toBeNull();
  expect(stored.state).toBe("retired");
  // Keys are metadata the row keeps; only the objects go.
  expect(stored.staged_blob_key).toBe(row.staged_blob_key);

  const second = await runMatchVideoCleanup(deps);
  expect(second.claimed).toBe(0);
  expect(container.ops("delete")).toHaveLength(2);
});

test("two sweeps at once: the lease gives each row to one worker and each object is deleted once", async () => {
  const { db, container, deps, seed } = harness();
  const rows = Array.from({ length: 6 }, () => seed());

  const [a, b] = await Promise.all([
    runMatchVideoCleanup(deps),
    runMatchVideoCleanup(deps),
  ]);
  expect(a.workerToken).not.toBe(b.workerToken);
  expect(a.claimed + b.claimed).toBe(rows.length);
  expect(a.outcomes.cleaned_up + b.outcomes.cleaned_up).toBe(rows.length);
  expect(a.outcomes.lease_lost + b.outcomes.lease_lost).toBe(0);

  for (const row of rows) {
    expect(container.ops("delete", row.staged_blob_key)).toHaveLength(1);
    expect(container.ops("delete", row.final_blob_key)).toHaveLength(1);
    expect(db.get(row.id).cleaned_up_at).not.toBeNull();
  }
});

test("absence is success: a row whose objects are already gone is closed without an error", async () => {
  const { db, deps } = harness();
  const row = db.add(); // nothing put in the container

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(run.rows[0]).toMatchObject({
    stagedDeleted: false,
    finalDeleted: false,
    outcome: "cleaned_up",
  });
  expect(db.get(row.id).cleaned_up_at).not.toBeNull();
  expect(db.get(row.id).cleanup_attempts).toBe(0);
});

/* -------------------------------------------------------------------------
 * Copy races
 * ---------------------------------------------------------------------- */

test("a copy still in flight is aborted BEFORE the final delete, and settling it afterwards recreates nothing", async () => {
  const { db, container, deps } = harness();
  const row = db.add({ copy_id: "copy-live", copy_status: "pending" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-live");

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);

  const finalOps = container.events.filter((e) => e.key === row.final_blob_key);
  expect(finalOps.map((e) => e.op)).toEqual(["abort", "delete"]);
  expect(finalOps[0].copyId).toBe("copy-live");

  // Azure finishes what it was doing. An aborted copy writes nothing.
  container.settleCopies();
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(db.get(row.id).cleaned_up_at).not.toBeNull();
});

test("the abort-first order holds even on a backend that would allow the delete mid-copy", async () => {
  const { container, deps, db } = harness();
  container.strictPendingDelete = false;
  const row = db.add({ copy_id: "copy-live", copy_status: "pending" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-live");

  await runMatchVideoCleanup(deps);
  container.settleCopies();

  // Without the abort the lenient backend would have let the delete through
  // and the settle would have written the object back. It did not.
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
  expect(container.inFlight.size).toBe(0);
});

test("a pending copy the row never learned about (retry after a lost response) is found on the object and aborted", async () => {
  const { db, container, deps } = harness();
  // The row persisted a copy that failed; T10 discarded it and started
  // another whose id never reached the database.
  const row = db.add({ copy_id: "copy-old", copy_status: "failed" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-new");

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);

  const finalOps = container.events
    .filter((e) => e.key === row.final_blob_key)
    .map((e) => `${e.op}${e.copyId ? ":" + e.copyId : ""}`);
  expect(finalOps).toEqual([
    "abort:copy-old", // idempotent: nothing pending under that id
    "delete", // 409 PendingCopyOperation
    "head", // learn the live id
    "abort:copy-new",
    "delete",
  ]);
  container.settleCopies();
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
});

test("a copy that cannot be aborted leaves the key in place with a short retry", async () => {
  const { db, container, deps } = harness();
  const row = db.add({ copy_id: "copy-live", copy_status: "pending" });
  container.put(row.staged_blob_key);
  container.startPendingCopy(row.final_blob_key, "copy-live");
  // The abort call itself fails at the service.
  const realAbort = container.abortCopy.bind(container);
  container.abortCopy = async (key, copyId) => {
    container.events.push({ op: "abort", key, copyId });
    throw rest(500, "InternalError");
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.failed).toBe(1);
  expect(run.rows[0].detail).toBe("abort:abort_copy_failed");
  expect(container.ops("delete")).toHaveLength(0);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(container.blobs.has(row.staged_blob_key)).toBe(true);

  const stored = db.get(row.id);
  expect(stored.cleaned_up_at).toBeNull();
  expect(stored.cleanup_attempts).toBe(1);
  expect(stored.cleanup_last_error).toBe("abort:abort_copy_failed");

  // Service recovers; the next sweep starts again from the abort.
  container.abortCopy = realAbort;
  clock.now = at(HOUR);
  const retry = await runMatchVideoCleanup(deps);
  expect(retry.outcomes.cleaned_up).toBe(1);
  container.settleCopies();
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * Partial deletion, outage, retry
 * ---------------------------------------------------------------------- */

test("partial deletion keeps the keys and retry metadata; the retry finishes the job", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed();
  container.failDelete.add(row.staged_blob_key);

  const first = await runMatchVideoCleanup(deps);
  expect(first.outcomes.failed).toBe(1);
  expect(first.rows[0]).toMatchObject({
    outcome: "failed",
    finalDeleted: true,
    stagedDeleted: false,
    detail: "staged:delete_failed",
  });
  expect(db.events.filter((e) => e.fn === "confirm")).toHaveLength(0);

  const stored = db.get(row.id);
  expect(stored.cleaned_up_at).toBeNull();
  expect(stored.cleanup_attempts).toBe(1);
  expect(stored.cleanup_last_error).toBe("staged:delete_failed");
  expect(stored.cleanup_next_attempt_at!.getTime()).toBeGreaterThan(
    clock.now.getTime(),
  );
  expect(stored.cleanup_lease_token).toBeNull();
  expect(stored.staged_blob_key).toBe(row.staged_blob_key);
  expect(stored.final_blob_key).toBe(row.final_blob_key);

  // Not due yet: an immediate sweep leaves it alone.
  expect((await runMatchVideoCleanup(deps)).claimed).toBe(0);

  container.failDelete.clear();
  clock.now = at(HOUR);
  const retry = await runMatchVideoCleanup(deps);
  expect(retry.outcomes.cleaned_up).toBe(1);
  // The final was already gone: absence read as success, no error.
  expect(retry.rows[0]).toMatchObject({
    finalDeleted: false,
    stagedDeleted: true,
  });
  expect(db.get(row.id).cleaned_up_at).not.toBeNull();
  expect(db.get(row.id).cleanup_last_error).toBeNull();
  expect(db.get(row.id).cleanup_attempts).toBe(1);
});

test("a storage outage fails every row into backoff, removes nothing and never confirms", async () => {
  const { db, container, deps, seed } = harness();
  const rows = Array.from({ length: 5 }, () => seed());
  container.outage = true;

  const run = await runMatchVideoCleanup(deps);
  expect(run.claimed).toBe(5);
  expect(run.outcomes.failed).toBe(5);
  expect(db.events.filter((e) => e.fn === "confirm")).toHaveLength(0);
  expect(container.blobs.size).toBe(10);
  for (const row of rows) {
    const stored = db.get(row.id);
    expect(stored.cleanup_attempts).toBe(1);
    expect(stored.cleaned_up_at).toBeNull();
    expect(stored.cleanup_lease_token).toBeNull();
  }
});

test("a seam that throws fails that row and the batch keeps going", async () => {
  const { db, container, deps, seed } = harness();
  const boom = seed();
  const fine = seed();
  const realDelete = container.deleteIfExists.bind(container);
  container.deleteIfExists = async (key) => {
    if (key === boom.final_blob_key) throw new TypeError("socket hang up");
    return realDelete(key);
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.failed).toBe(1);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(db.get(boom.id).cleanup_last_error).toBe("final:delete_failed");
  expect(db.get(fine.id).cleaned_up_at).not.toBeNull();
});

test("a database that cannot claim yields an empty run with the error and touches no storage", async () => {
  const { db, container, deps, seed } = harness();
  seed();
  db.claimError = new Error("connection refused");

  await expect(runMatchVideoCleanup(deps)).rejects.toThrow(
    "connection refused",
  );
  expect(container.events).toHaveLength(0);

  // The best-effort entry never rejects.
  const run = await requestBestEffortCleanup(deps);
  expect(run.claimed).toBe(0);
  expect(run.claimError?.detail).toBe("best_effort_threw");
  expect(container.events).toHaveLength(0);
});

/* -------------------------------------------------------------------------
 * Abandoned uploads and live writers
 * ---------------------------------------------------------------------- */

test("pending work idle a day with a dead credential is retired by the claim and collected", async () => {
  const { db, container, deps, seed } = harness();
  const abandoned = seed({
    state: "pending",
    retired_at: null,
    last_attempt_at: at(-25 * HOUR),
    upload_sas_expires_at: at(-19 * HOUR),
  });
  const recent = seed({
    state: "pending",
    retired_at: null,
    last_attempt_at: at(-2 * HOUR),
    upload_sas_expires_at: at(-1 * HOUR),
  });
  const liveWriter = seed({
    state: "pending",
    retired_at: null,
    last_attempt_at: at(-30 * HOUR),
    // Renewed: the credential is still valid, whatever the idle time says.
    upload_sas_expires_at: at(2 * HOUR),
  });

  const run = await runMatchVideoCleanup(deps);
  expect(run.claimed).toBe(1);
  expect(run.outcomes.cleaned_up).toBe(1);

  expect(db.get(abandoned.id).state).toBe("retired");
  expect(db.get(abandoned.id).cleaned_up_at).not.toBeNull();
  expect(container.blobs.has(abandoned.staged_blob_key)).toBe(false);
  expect(container.blobs.has(abandoned.final_blob_key)).toBe(false);

  for (const untouched of [recent, liveWriter]) {
    expect(db.get(untouched.id).state).toBe("pending");
    expect(container.blobs.has(untouched.staged_blob_key)).toBe(true);
    expect(container.blobs.has(untouched.final_blob_key)).toBe(true);
  }
});

test("a retired row whose last upload credential is still valid is not touched until it dies", async () => {
  const { container, deps, seed } = harness();
  const row = seed({ upload_sas_expires_at: at(10 * MINUTE) });

  expect((await runMatchVideoCleanup(deps)).claimed).toBe(0);
  expect(container.blobs.has(row.staged_blob_key)).toBe(true);

  clock.now = at(16 * MINUTE); // expiry + five minutes
  expect((await runMatchVideoCleanup(deps)).outcomes.cleaned_up).toBe(1);
});

/* -------------------------------------------------------------------------
 * Active rows: staging only, final never
 * ---------------------------------------------------------------------- */

test("an active team asset with no uploader sheds its staging and keeps its final object and metadata", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({
    state: "active",
    retired_at: null,
    uploaded_by: null,
    version: 3,
  });

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.staged_shed).toBe(1);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(container.ops("delete", row.final_blob_key)).toHaveLength(0);
  expect(container.ops("abort")).toHaveLength(0);

  const stored = db.get(row.id);
  expect(stored.state).toBe("active");
  expect(stored.final_blob_key).toBe(row.final_blob_key);
  expect(stored.version).toBe(3);
  expect(stored.cleaned_up_at).toBeNull();
  expect(stored.cleanup_next_attempt_at).toEqual(INFINITY);
  const confirm = db.events.find((e) => e.fn === "confirm");
  expect(confirm?.collectedFinal).toBe(false);

  // Parked: the daily sweep does not keep re-deleting a blob that is gone.
  clock.now = at(48 * HOUR);
  expect((await runMatchVideoCleanup(deps)).claimed).toBe(0);
});

test("the worker refuses a claim that asks for an active row's final key", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null });
  db.mutateClaim = (claim) => ({ ...claim, collect_final: true });

  const run = await runMatchVideoCleanup(deps);
  // Had it obeyed, the fake `confirm` would have thrown 22023 like the SQL.
  expect(run.outcomes.staged_shed).toBe(1);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(container.ops("delete", row.final_blob_key)).toHaveLength(0);
  expect(db.events.find((e) => e.fn === "confirm")?.collectedFinal).toBe(false);
});

test("an orphaned active row (match deleted) is retired by the claim and fully collected", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null, match_id: null });

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(db.get(row.id).state).toBe("retired");
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * Settle races
 * ---------------------------------------------------------------------- */

test("a version change between claim and confirm records nothing and releases the lease", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null, version: 1 });
  db.beforeConfirm = (r) => {
    r.version = 2; // an alignment correction landed mid-sweep
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.version_changed).toBe(1);
  // The staged delete had already happened (it is harmless to the final);
  // the row is simply re-evaluated by the next claim.
  expect(container.blobs.has(row.staged_blob_key)).toBe(false);
  const stored = db.get(row.id);
  expect(stored.cleanup_next_attempt_at).toBeNull();
  expect(stored.cleanup_lease_token).toBeNull();
  expect(stored.cleaned_up_at).toBeNull();

  db.beforeConfirm = undefined;
  const again = await runMatchVideoCleanup(deps);
  expect(again.outcomes.staged_shed).toBe(1);
});

test("a lease that lapsed during the run is reported as lost and nothing is recorded", async () => {
  const { db, deps, seed } = harness();
  const row = seed();
  db.beforeConfirm = () => {
    clock.now = at(HOUR); // longer than the lease
  };

  const run = await runMatchVideoCleanup(deps, { leaseSeconds: 60 });
  expect(run.outcomes.lease_lost).toBe(1);
  expect(db.get(row.id).cleaned_up_at).toBeNull();
});

test("a row retired mid-sweep after only its staging was collected is rescheduled for its final key", async () => {
  const { db, container, deps, seed } = harness();
  const row = seed({ state: "active", retired_at: null });
  db.beforeConfirm = (r) => {
    r.state = "retired"; // cancel/replace landed while the worker ran
    r.retired_at = clock.now;
  };

  const run = await runMatchVideoCleanup(deps);
  expect(run.outcomes.rescheduled).toBe(1);
  expect(container.blobs.has(row.final_blob_key)).toBe(true);
  expect(db.get(row.id).cleanup_next_attempt_at).toEqual(clock.now);

  db.beforeConfirm = undefined;
  const again = await runMatchVideoCleanup(deps);
  expect(again.outcomes.cleaned_up).toBe(1);
  expect(container.blobs.has(row.final_blob_key)).toBe(false);
});

/* -------------------------------------------------------------------------
 * Concurrency and the best-effort entry
 * ---------------------------------------------------------------------- */

test("a full batch runs at most CLEANUP_CONCURRENCY rows at once", async () => {
  const { container, deps, seed } = harness();
  for (let i = 0; i < 50; i++) seed();

  const run = await runMatchVideoCleanup(deps);
  expect(run.claimed).toBe(50);
  expect(run.outcomes.cleaned_up).toBe(50);
  expect(container.maxConcurrent).toBeLessThanOrEqual(CLEANUP_CONCURRENCY);
  expect(container.maxConcurrent).toBeGreaterThan(1);
  expect(run.rows).toHaveLength(50);
});

test("the batch limit is honoured and the rest waits for the next sweep", async () => {
  const { deps, seed } = harness();
  for (let i = 0; i < 7; i++) seed();

  const first = await runMatchVideoCleanup(deps, { limit: 5 });
  expect(first.claimed).toBe(5);
  const second = await runMatchVideoCleanup(deps, { limit: 5 });
  expect(second.claimed).toBe(2);
});

test("replacement can request a best-effort run: same worker, smaller batch, never throws", async () => {
  const { db, container, deps, seed } = harness();
  // A just-replaced row whose upload credential is still valid: T3/T4 seed
  // its schedule at the expiry, and the SQL will not hand it out yet.
  const justRetired = seed({
    retired_at: clock.now,
    upload_sas_expires_at: at(3 * HOUR),
    cleanup_next_attempt_at: at(3 * HOUR),
  });
  // And one that is due.
  const due = seed();

  const run = await requestBestEffortCleanup(deps, {
    reason: `replace:${justRetired.match_id}`,
  });
  expect(run.claimed).toBe(1);
  expect(run.outcomes.cleaned_up).toBe(1);
  expect(db.get(due.id).cleaned_up_at).not.toBeNull();
  expect(db.get(justRetired.id).cleaned_up_at).toBeNull();
  expect(container.blobs.has(justRetired.final_blob_key)).toBe(true);

  // Once the credential is dead the daily sweep takes it.
  clock.now = at(4 * HOUR);
  expect((await runMatchVideoCleanup(deps)).outcomes.cleaned_up).toBe(1);
});

test("best-effort leases a small batch by default", async () => {
  const { deps, seed } = harness();
  for (let i = 0; i < 15; i++) seed();
  const run = await requestBestEffortCleanup(deps);
  expect(run.claimed).toBe(10);
});

/* =========================================================================
 * T15 — the schedule and its gate
 *
 * `GET /api/cron/cleanup-match-videos` is reachable by anyone who can make
 * an HTTP request: it carries no session cookie and is excluded from the
 * proxy's matcher, so the bearer check is the whole of its security. Every
 * refusal below therefore asserts THREE things — the status, that
 * `runCleanup` was never invoked, and that neither the fake table nor the
 * fake container recorded a single call. A 401 with a sweep behind it would
 * pass the first assertion alone.
 * ====================================================================== */

const CRON_SECRET_VALUE = "9f2c1a7d4b6e8035c1d9f7a2b4e60813";
const CRON_ORIGIN = "https://app.example.test";

function cronRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${CRON_ORIGIN}${CLEANUP_CRON_PATH}`, {
    method: "GET",
    headers,
  });
}

function bearer(value: string): Record<string, string> {
  return { authorization: `Bearer ${value}` };
}

/** The worker behind a counter, so "never invoked" is a measurement. */
function cronHarness(...configured: [] | [string | undefined]) {
  // Variadic on purpose: `cronHarness(undefined)` must mean "CRON_SECRET is
  // unset", which a default parameter would silently turn back into the
  // secret — and the fail-closed cases would then pass by sweeping.
  const secret = configured.length ? configured[0] : CRON_SECRET_VALUE;
  const h = harness();
  const calls: string[] = [];
  const cron: CleanupCronDeps = {
    readSecret: () => secret,
    runCleanup: async () => {
      calls.push("run");
      return runMatchVideoCleanup(h.deps, { reason: CLEANUP_CRON_REASON });
    },
    expire: async () => {
      calls.push("expire");
      return { expired: 0 };
    },
    warn: async () => {
      calls.push("warn");
      return { warned: 0, emailed: 0, skipped: 0, failed: 0 };
    },
  };
  return { ...h, cron, calls };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const REFUSALS: Array<{
  name: string;
  headers: Record<string, string>;
  secret?: string | undefined;
}> = [
  { name: "no Authorization header at all", headers: {} },
  { name: "a bearer with the wrong secret", headers: bearer("not-it") },
  {
    name: "a bearer with a prefix of the secret",
    headers: bearer(CRON_SECRET_VALUE.slice(0, 16)),
  },
  {
    name: "a bearer with the secret plus a suffix",
    headers: bearer(`${CRON_SECRET_VALUE}x`),
  },
  { name: "an empty bearer", headers: bearer("") },
  {
    name: "the raw secret with no Bearer scheme",
    headers: { authorization: CRON_SECRET_VALUE },
  },
  {
    name: "the secret under Basic",
    headers: { authorization: `Basic ${CRON_SECRET_VALUE}` },
  },
  {
    name: "the secret in a header of its own",
    headers: { "x-cron-secret": CRON_SECRET_VALUE },
  },
  {
    name: "the right bearer while CRON_SECRET is unset (fails closed)",
    headers: bearer(CRON_SECRET_VALUE),
    secret: undefined,
  },
  {
    name: "an empty bearer while CRON_SECRET is unset (fails closed)",
    headers: bearer(""),
    secret: undefined,
  },
  {
    name: "a blank CRON_SECRET matched by a blank bearer (fails closed)",
    headers: { authorization: "Bearer    " },
    secret: "   ",
  },
];

for (const refusal of REFUSALS) {
  test(`cleanup is refused, and never runs, for ${refusal.name}`, async () => {
    const h = "secret" in refusal ? cronHarness(refusal.secret) : cronHarness();
    h.seed();

    const response = await handleCleanupCron(
      cronRequest(refusal.headers),
      h.cron,
    );

    expect(response.status).toBe(401);
    // The worker, the database and storage were all left alone.
    expect(h.calls).toEqual([]);
    expect(h.db.events).toEqual([]);
    expect(h.container.events).toEqual([]);
    expect([...h.container.blobs.keys()]).toHaveLength(2);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "unauthorized" });
    // Nothing about the secret is echoed, in the body or in a header.
    const echoed = JSON.stringify([text, [...response.headers]]);
    expect(echoed).not.toContain(CRON_SECRET_VALUE);
    expect(echoed).not.toContain(CRON_SECRET_VALUE.slice(0, 8));
  });
}

test("a refused request never reaches the secret through a timing-unsafe compare", () => {
  // `authorizeCronRequest` is the whole decision and it is pure: the same
  // answer for every wrong credential, whatever its length.
  for (const presented of [
    "",
    "a",
    "a".repeat(4096),
    CRON_SECRET_VALUE + "!",
  ]) {
    expect(
      authorizeCronRequest(cronRequest(bearer(presented)), CRON_SECRET_VALUE),
    ).toEqual({
      ok: false,
      refusal: presented === "" ? "empty_credential" : "credential_mismatch",
    });
  }
  expect(
    authorizeCronRequest(cronRequest(bearer(CRON_SECRET_VALUE)), undefined),
  ).toEqual({ ok: false, refusal: "secret_not_configured" });
});

test("the matching bearer sweeps, and the scheme is matched case-insensitively", async () => {
  const h = cronHarness();
  const row = h.seed();

  const response = await handleCleanupCron(
    cronRequest({ authorization: `bEaReR ${CRON_SECRET_VALUE}` }),
    h.cron,
  );

  expect(response.status).toBe(200);
  expect(h.calls).toEqual(["expire", "warn", "run"]);
  const body = await bodyOf(response);
  expect(body.ok).toBe(true);
  expect(body.reason).toBe(CLEANUP_CRON_REASON);
  expect(body.claimed).toBe(1);
  expect(body.rpcFailures).toBe(0);
  expect((body.outcomes as Record<string, number>).cleaned_up).toBe(1);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  // Read from the store, not the summary: the objects really went.
  expect(h.container.blobs.has(row.staged_blob_key)).toBe(false);
  expect(h.db.get(row.id).cleaned_up_at).not.toBeNull();
});

test("an authorized sweep uses the bounded worker — one batch, not the backlog", async () => {
  const h = cronHarness();
  for (let i = 0; i < CLEANUP_BATCH_LIMIT + 10; i++) h.seed();

  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    h.cron,
  );

  expect(response.status).toBe(200);
  const body = await bodyOf(response);
  expect(body.claimed).toBe(CLEANUP_BATCH_LIMIT);
  expect(h.calls).toEqual(["expire", "warn", "run"]);
  // One claim, and the rest of the backlog untouched until tomorrow.
  expect(h.db.events.filter((e) => e.fn === "claim")).toHaveLength(1);
  expect(
    [...h.db.rows.values()].filter((r) => r.cleaned_up_at === null),
  ).toHaveLength(10);
  expect(h.container.maxConcurrent).toBeLessThanOrEqual(CLEANUP_CONCURRENCY);
});

test("a worker that throws is this route's own 500, and says nothing about why", async () => {
  const h = cronHarness();
  h.seed();
  h.db.claimError = new Error("connect ECONNREFUSED 10.0.0.1:5432");

  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    h.cron,
  );

  expect(response.status).toBe(500);
  expect(h.calls).toEqual(["expire", "warn", "run"]);
  expect(await bodyOf(response)).toEqual({
    ok: false,
    error: "cleanup_failed",
  });
});

test("a claim the database refused is reported as a failed run, not an empty success", async () => {
  const h = cronHarness();
  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    {
      ...h.cron,
      runCleanup: async () => ({
        workerToken: "t",
        claimed: 0,
        outcomes: {
          cleaned_up: 0,
          staged_shed: 0,
          rescheduled: 0,
          lease_lost: 0,
          version_changed: 0,
          failed: 0,
          unsettled: 0,
        },
        rows: [],
        claimError: matchVideoError("storage_unavailable", "rpc_57014"),
      }),
    },
  );

  expect(response.status).toBe(500);
  const body = await bodyOf(response);
  expect(body.ok).toBe(false);
  expect(body.error).toBe("claim_failed");
  expect(body.claimed).toBe(0);
});

test("rows the database refused at settle are counted apart from storage failures", async () => {
  const h = cronHarness();
  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    {
      ...h.cron,
      runCleanup: async () => ({
        workerToken: "t",
        claimed: 3,
        outcomes: {
          cleaned_up: 1,
          staged_shed: 0,
          rescheduled: 0,
          lease_lost: 0,
          version_changed: 0,
          failed: 1,
          unsettled: 1,
        },
        rows: [
          {
            attachmentId: "a",
            state: "retired",
            outcome: "cleaned_up" as const,
            stagedDeleted: true,
            finalDeleted: true,
          },
          {
            attachmentId: "b",
            state: "retired",
            outcome: "failed" as const,
            detail: "final:storage_unavailable",
            stagedDeleted: false,
            finalDeleted: false,
          },
          {
            attachmentId: "c",
            state: "retired",
            outcome: "unsettled" as const,
            // T14's `rpcFailure` maps SQLSTATE P0002 — an attachment gone
            // between claim and settle — to a retryable failure, which the
            // outcome counts alone would hide.
            detail: "rpc_P0002",
            stagedDeleted: true,
            finalDeleted: true,
          },
        ],
      }),
    },
  );

  expect(response.status).toBe(200);
  const body = await bodyOf(response);
  expect(body.ok).toBe(true);
  expect(body.rpcFailures).toBe(1);
  expect(typeof body.durationMs).toBe("number");
});

/* -------------------------------------------------------------------------
 * Add video T9 — retention runs before the sweep
 * ---------------------------------------------------------------------- */

test("an authorized run expires, then warns, then sweeps — and reports the expired and warned counts", async () => {
  const h = cronHarness();
  const row = h.seed();
  // Each step records the order it ran in AND what the table looked like:
  // expire must see nothing swept yet, and the sweep must come last.
  const seen: string[] = [];
  const response = await handleCleanupCron(
    cronRequest(bearer(CRON_SECRET_VALUE)),
    {
      ...h.cron,
      expire: async () => {
        seen.push(`expire:${h.db.get(row.id).cleaned_up_at === null}`);
        return { expired: 3 };
      },
      warn: async () => {
        seen.push(`warn:${h.db.get(row.id).cleaned_up_at === null}`);
        return { warned: 2, emailed: 1, skipped: 1, failed: 0 };
      },
      runCleanup: async () => {
        seen.push("run");
        return runMatchVideoCleanup(h.deps, { reason: CLEANUP_CRON_REASON });
      },
    },
  );

  expect(response.status).toBe(200);
  expect(seen).toEqual(["expire:true", "warn:true", "run"]);
  const body = await bodyOf(response);
  expect(body).toMatchObject({
    ok: true,
    expired: 3,
    warned: 2,
    emailed: 1,
    claimed: 1,
  });
  expect(h.db.get(row.id).cleaned_up_at).not.toBeNull();
});

test("a refused request calls none of expire, warn or the sweep", async () => {
  const h = cronHarness();
  h.seed();

  const response = await handleCleanupCron(
    cronRequest(bearer("not-it")),
    h.cron,
  );

  expect(response.status).toBe(401);
  expect(h.calls).toEqual([]);
  expect(h.db.events).toEqual([]);
});

for (const failing of ["expire", "warn"] as const) {
  test(`a ${failing} step that throws is a 500, and the sweep still runs`, async () => {
    const h = cronHarness();
    const row = h.seed();

    const response = await handleCleanupCron(
      cronRequest(bearer(CRON_SECRET_VALUE)),
      {
        ...h.cron,
        [failing]: async () => {
          h.calls.push(failing);
          throw new Error("rpc 57014 with a secret-looking detail");
        },
      },
    );

    expect(response.status).toBe(500);
    expect(h.calls).toEqual(["expire", "warn", "run"]);
    const body = await bodyOf(response);
    expect(body.ok).toBe(false);
    expect(body.error).toBe(
      failing === "expire" ? "expiry_failed" : "warning_failed",
    );
    expect(body[failing === "expire" ? "expired" : "warned"]).toBe(0);
    expect(JSON.stringify(body)).not.toContain("secret-looking");
    // Abandoned uploads are not held hostage by the retention job.
    expect(h.db.get(row.id).cleaned_up_at).not.toBeNull();
  });
}

/* -------------------------------------------------------------------------
 * Configuration — the schedule, the secret, the proxy
 * ---------------------------------------------------------------------- */

test("vercel.json schedules this endpoint daily at 05:00 UTC and keeps what was there", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  // Pre-existing configuration is preserved, not replaced.
  expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  expect(config.crons).toEqual([
    { path: CLEANUP_CRON_PATH, schedule: "0 5 * * *" },
  ]);
  // The scheduled path must be a route that exists.
  const { existsSync } = await import("node:fs");
  expect(existsSync(`src/app${CLEANUP_CRON_PATH}/route.ts`)).toBe(true);
});

test(".env.example documents CRON_SECRET once and embeds no value", async () => {
  const { readFile } = await import("node:fs/promises");
  const env = await readFile(".env.example", "utf8");

  const declarations = env
    .split("\n")
    .filter((line) => /^\s*CRON_SECRET\s*=/.test(line));
  expect(declarations).toEqual(["CRON_SECRET="]);
  expect(env).toContain(CLEANUP_CRON_PATH);
  expect(env).toContain("05:00 UTC");
});

test("the cron route is excluded from the proxy's session refresh", async () => {
  const { readFile } = await import("node:fs/promises");
  const proxy = await readFile("src/proxy.ts", "utf8");
  // A cron call carries no cookie; more to the point, this route must not
  // depend on anything the proxy does for its authentication.
  expect(proxy).toContain("api/cron");
});

test("the route file delegates the gate and builds nothing before it", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(`src/app${CLEANUP_CRON_PATH}/route.ts`, "utf8");
  expect(source).toContain("handleCleanupCron");
  expect(source).toContain('export const runtime = "nodejs"');
  // No second copy of the comparison, and no secret read outside the handler.
  expect(source).not.toContain("process.env");
  expect(source).not.toContain("timingSafeEqual");
  // The admin client is constructed inside the callbacks the handler
  // invokes only after the bearer matched — never at module load or before
  // the gate.
  const starts = ["runCleanup:", "expire:", "warn:"]
    .map((key) => {
      expect(source).toContain(key);
      return source.indexOf(key);
    })
    .sort((a, b) => a - b);
  expect(source.slice(0, starts[0])).not.toContain("createAdminClient()");
  starts.forEach((from, i) => {
    const to = starts[i + 1] ?? source.indexOf("});", from);
    expect(source.slice(from, to)).toContain("createAdminClient()");
  });
});
