import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  adminResubmitFailedAnalysis,
  VERIFIED_MATCH_REFUSAL,
  type AdminResubmitDeps,
  type AdminResubmitInput,
  type AdminResubmitResult,
} from "@/lib/services/splitstep/admin-resubmit";
import type { SplitStepJobRequest } from "@/lib/services/splitstep/job-request";
import {
  resubmitJob,
  type ResubmitIo,
} from "@/lib/services/splitstep/resubmit-job";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The admin's retry of a failed analysis (T5) — `adminResubmitFailedAnalysis()`
 * and the server action that wires it, `resubmitFailedAnalysisAction`.
 *
 * Offline, in the shape `resubmit-authorization.spec.ts` uses: the tables are
 * an in-memory fake and every seam `resubmitJob()` reaches through is a stub,
 * so no session is read, no quota RPC runs, no SAS is minted and the vendor is
 * never called — `reserveQuota` and `submitToVendor` record what they were
 * asked. The REAL `resubmitJob()` runs underneath, so what is asserted about
 * billing and refusals is what production would do with the same rows.
 *
 * Under test: a signed-out or non-admin caller is refused before the
 * service-role client exists or anything is read; a failed job is retried
 * without `reprocess`, with no roster read, billed to the MATCH's workspace
 * and never one of the admin's; a verified match, a job that is not failed
 * and the attempt ceiling are refused with the sentences the existing paths
 * use; every refusal is `{ ok: false, error, code }`; and each attempt is
 * logged with the admin's id.
 */

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPLOADER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROGRAM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MATCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OLDER_JOB = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const VIDEO_KEY = `videos/${UPLOADER}/${MATCH}/original.mp4`;

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };
type DbResult = { data: unknown; error: DbError | null };
type Filter = { kind: "eq" | "in" | "notin"; col: string; value: unknown };

function job(overrides: Row = {}): Row {
  return {
    id: JOB,
    match_id: MATCH,
    created_by: UPLOADER,
    status: "failed",
    created_at: "2026-11-10T12:00:00Z",
    error_category: null,
    error_code: null,
    error_step: null,
    video_object_key: VIDEO_KEY,
    start_time_seconds: 90,
    end_time_seconds: 5271.5,
    initial_top_player_is_player1: true,
    ad_scoring: false,
    fixed_camera: true,
    resubmitted_from_job_id: null,
    auto_resubmitted: false,
    ...overrides,
  };
}

function match(overrides: Row = {}): Row {
  return {
    id: MATCH,
    player1_name: "Ava Adams",
    player2_name: "Riley Rival",
    score: { player1: [7, 6], player2: [6, 4] },
    match_type: "singles",
    program_id: PROGRAM,
    // The uploader's own login as the athlete: a row the athlete's manual
    // path refuses on the roster, so a pass here proves the roster went unread.
    player1_id: UPLOADER,
    event_entry_id: null,
    format: { ad_scoring: false },
    fixed_camera: true,
    initial_top_player_is_player1: false,
    verified: false,
    ...overrides,
  };
}

/** What `resolveAutoRetryWorkspace()` reads for the UPLOADER, at retry time. */
function membership(overrides: Row = {}): Row {
  return {
    program_id: PROGRAM,
    user_id: UPLOADER,
    role: "coach",
    upload_enabled: true,
    programs: {
      status: "active",
      players_can_upload: true,
      upload_policy: "everyone",
      org_type: "college",
      pilot_eligible: false,
    },
    ...overrides,
  };
}

// ── The PostgREST shapes the two functions use, in memory ─────────────────

class FakeDb {
  reads: string[] = [];
  inserts: Array<{ table: string; row: Row }> = [];
  updates: Array<{ table: string; patch: Row }> = [];
  deletes: Array<{ table: string; ids: unknown[] }> = [];
  failures: Record<string, DbError> = {};
  private seq = 0;

  constructor(public tables: Record<string, Row[]>) {}

  from(table: string): FakeQuery {
    this.reads.push(table);
    return new FakeQuery(this, table);
  }
  nextId(): string {
    this.seq += 1;
    return `child-${this.seq}`;
  }
  row(table: string, id: string): Row | undefined {
    return (this.tables[table] ?? []).find((r) => r.id === id);
  }
  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class FakeQuery implements PromiseLike<DbResult> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private payload: Row | null = null;
  private mode: "many" | "maybeSingle" | "single" = "many";
  private sort: { col: string; ascending: boolean } | null = null;
  private cap: number | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push({ kind: "eq", col, value });
    return this;
  }
  in(col: string, value: unknown[]): this {
    this.filters.push({ kind: "in", col, value });
    return this;
  }
  not(col: string, operator: string, value: string | null): this {
    if (operator === "is" && value === null) {
      this.filters.push({ kind: "notin", col, value: [null, undefined] });
      return this;
    }
    if (operator !== "in" || value === null)
      throw new Error(`fake: .not(${operator}) unsupported`);
    this.filters.push({
      kind: "notin",
      col,
      value: value.replace(/^\(|\)$/g, "").split(","),
    });
    return this;
  }
  order(col: string, options?: { ascending?: boolean }): this {
    this.sort ??= { col, ascending: options?.ascending !== false };
    return this;
  }
  limit(count: number): this {
    this.cap = count;
    return this;
  }
  insert(row: Row): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }

  then<A = DbResult, B = never>(
    onFulfilled?: ((value: DbResult) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.run().then(onFulfilled, onRejected);
  }

  private async run(): Promise<DbResult> {
    const failure = this.db.failures[`${this.table}.${this.op}`];
    if (failure) return { data: null, error: failure };

    const rows = (this.db.tables[this.table] ??= []);
    let hit = rows.filter((row) =>
      this.filters.every((f) => {
        const v = row[f.col];
        if (f.kind === "eq") return v === f.value;
        if (f.kind === "in") return (f.value as unknown[]).includes(v);
        return !(f.value as unknown[]).includes(v);
      }),
    );

    switch (this.op) {
      case "select": {
        const sort = this.sort;
        if (sort) {
          hit = [...hit].sort(
            (a, b) =>
              String(a[sort.col]).localeCompare(String(b[sort.col])) *
              (sort.ascending ? 1 : -1),
          );
        }
        if (this.cap !== null) hit = hit.slice(0, this.cap);
        if (this.mode === "many") return { data: hit, error: null };
        if (this.mode === "single" && hit.length === 0) {
          return { data: null, error: { message: "no rows" } };
        }
        return { data: hit[0] ?? null, error: null };
      }
      case "insert": {
        const row: Row = { ...this.payload, id: this.db.nextId() };
        rows.push(row);
        this.db.inserts.push({ table: this.table, row });
        return { data: this.mode === "many" ? [row] : row, error: null };
      }
      case "update": {
        for (const r of hit) Object.assign(r, this.payload);
        this.db.updates.push({ table: this.table, patch: this.payload ?? {} });
        return { data: null, error: null };
      }
      case "delete": {
        const ids = hit.map((r) => r.id);
        this.db.tables[this.table] = rows.filter((r) => !ids.includes(r.id));
        this.db.deletes.push({ table: this.table, ids });
        return { data: null, error: null };
      }
    }
  }
}

// ── The harness ───────────────────────────────────────────────────────────

type ResubmitArgs = Parameters<typeof resubmitJob>[0];

interface Harness {
  db: FakeDb;
  deps: AdminResubmitDeps;
  /** How many times the service-role client was asked for. */
  adminClients: number;
  /** Every argument object handed to `resubmitJob`. */
  resubmits: ResubmitArgs[];
  reserved: Array<{
    jobId: string;
    userId: string;
    workspaceId: string;
    workspaceKind: string;
    seconds: number;
  }>;
  released: string[];
  minted: string[];
  sent: SplitStepJobRequest[];
  rosterReads: number;
  logged: Array<{ level: string; message: string; detail: unknown }>;
  run(input?: AdminResubmitInput): Promise<AdminResubmitResult>;
}

function harness(
  input: {
    caller?: "admin" | "non-admin" | "signed-out";
    jobs?: Row[];
    match?: Row;
    members?: Row[];
  } = {},
): Harness {
  const db = new FakeDb({
    processing_jobs: input.jobs ?? [job()],
    matches: [input.match ?? match()],
    program_members: input.members ?? [membership()],
    users: [
      { id: UPLOADER, is_admin: false, individual_pilot: false },
      { id: ADMIN, is_admin: true, individual_pilot: false },
    ],
  });
  const caller = input.caller ?? "admin";

  const io: Partial<ResubmitIo> = {
    deploymentConfig: () => ({
      ok: true,
      webhookUrl: "https://app.example.test/api/webhooks/splitstep",
      apiUrl: "stub://vendor/jobs",
      apiKey: "stub-key",
    }),
    blobExists: async () => true,
    loadRoster: async () => {
      h.rosterReads += 1;
      return [];
    },
    reserveQuota: async ({ jobId, userId, workspace, seconds }) => {
      h.reserved.push({
        jobId,
        userId,
        workspaceId: workspace.id,
        workspaceKind: workspace.kind,
        seconds,
      });
      return { ok: true, usedSeconds: seconds, capSeconds: 7200 };
    },
    releaseQuota: async (jobId) => {
      h.released.push(jobId);
    },
    mintVendorUrl: async ({ objectKey }) => {
      h.minted.push(objectKey);
      return {
        url: "stub://vendor-read-credential/not-a-sas",
        expiresAt: new Date("2026-11-27T12:00:00Z"),
      };
    },
    markUrlRetired: async () => {},
    submitToVendor: async ({ body }) => {
      h.sent.push(body);
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({ job_id: "vendor-778912d7" }),
      };
    },
    adoptOrphanedDeliveries: async () => ({
      adopted: 0,
      jobStatus: null,
      errorCode: null,
      errorStep: null,
      owedResultsDownload: false,
    }),
  };

  const record =
    (level: string) =>
    (message: string, detail?: unknown): void => {
      h.logged.push({ level, message, detail });
    };

  const h: Harness = {
    db,
    adminClients: 0,
    resubmits: [],
    reserved: [],
    released: [],
    minted: [],
    sent: [],
    rosterReads: 0,
    logged: [],
    deps: {
      checkAdmin: async () =>
        caller === "admin"
          ? { ok: true, id: ADMIN }
          : { ok: false, status: caller === "signed-out" ? 401 : 403 },
      createAdminClient: () => {
        h.adminClients += 1;
        return db.asClient();
      },
      resubmit: (args) => {
        h.resubmits.push(args);
        return resubmitJob(args);
      },
      io,
      log: { log: record("log"), warn: record("warn"), error: record("error") },
    },
    run: (target = { jobId: JOB }) =>
      adminResubmitFailedAnalysis(target, h.deps),
  };
  return h;
}

/** Nothing reached the ledger, the signer or the vendor, and no row changed. */
function expectNothingSent(h: Harness) {
  expect(h.reserved).toEqual([]);
  expect(h.released).toEqual([]);
  expect(h.minted).toEqual([]);
  expect(h.sent).toEqual([]);
  expect(h.db.inserts).toEqual([]);
  expect(h.db.updates).toEqual([]);
  expect(h.db.deletes).toEqual([]);
}

/** Refused before the service-role client exists: no read, no call. */
function expectUnreached(h: Harness) {
  expect(h.adminClients).toBe(0);
  expect(h.db.reads).toEqual([]);
  expect(h.resubmits).toEqual([]);
  expectNothingSent(h);
}

// ── Who may call ──────────────────────────────────────────────────────────

test("a signed-out caller is refused before any job read or vendor call", async () => {
  const h = harness({ caller: "signed-out" });
  expect(await h.run()).toEqual({
    ok: false,
    error: "Sign in as an admin.",
    code: "unauthorized",
  });
  expectUnreached(h);
});

test("a signed-in non-admin is refused before any job read or vendor call", async () => {
  const h = harness({ caller: "non-admin" });
  expect(await h.run({ matchId: MATCH })).toEqual({
    ok: false,
    error: "Admins only.",
    code: "forbidden",
  });
  expectUnreached(h);
});

test("the admin check comes before the target is looked at", async () => {
  const h = harness({ caller: "non-admin" });
  const result = await h.run({ jobId: "not-a-uuid" });
  expect(result).toMatchObject({ ok: false, code: "forbidden" });
  expectUnreached(h);
});

test("a target that is not one uuid is refused with nothing read", async () => {
  for (const target of [
    { jobId: "not-a-uuid" },
    { matchId: "1 or 1=1" },
    { jobId: JOB, matchId: MATCH },
    {},
  ] as unknown as AdminResubmitInput[]) {
    const h = harness();
    expect(await h.run(target)).toEqual({
      ok: false,
      error: "Give one job id or one match id.",
      code: "invalid_request",
    });
    expectUnreached(h);
  }
});

// ── The retry itself ──────────────────────────────────────────────────────

test("a failed job is retried without reprocess, and the reservation is against the match's workspace", async () => {
  const h = harness();
  const result = await h.run();

  const child = h.db.inserts[0].row;
  expect(result).toEqual({
    ok: true,
    jobId: child.id,
    externalJobId: "vendor-778912d7",
  });

  // The call: the manual path plus the one named parameter, and nothing that
  // could name a workspace or a session of the admin's.
  expect(h.resubmits).toHaveLength(1);
  const args = h.resubmits[0];
  expect(args.auto).toBe(false);
  expect(args.reprocess).toBeUndefined();
  expect(args.adminRetry).toEqual({ requestedBy: ADMIN });
  expect(args.workspace).toBeUndefined();
  expect(args.session).toBeUndefined();

  // Billing: the match's program, for the uploader — not the admin.
  expect(h.reserved).toEqual([
    {
      jobId: child.id,
      userId: UPLOADER,
      workspaceId: PROGRAM,
      workspaceKind: "team",
      seconds: 5182,
    },
  ]);
  expect(JSON.stringify(h.reserved)).not.toContain(ADMIN);

  // Only the session-bound roster read was skipped: the row is one the
  // athlete's own retry refuses on the roster, and it went through unread.
  expect(h.rosterReads).toBe(0);

  // A person asked, so the chain's one automatic attempt is still unspent.
  expect(child).toMatchObject({
    match_id: MATCH,
    created_by: UPLOADER,
    resubmitted_from_job_id: JOB,
    auto_resubmitted: false,
  });
  expect(h.sent).toHaveLength(1);
  expect(h.released).toEqual([]);
});

test("a personal match bills the uploader's own allowance, never the admin's", async () => {
  const h = harness({ match: match({ program_id: null }), members: [] });
  const result = await h.run();

  expect(result.ok).toBe(true);
  expect(h.reserved).toHaveLength(1);
  expect(h.reserved[0]).toMatchObject({
    userId: UPLOADER,
    workspaceId: UPLOADER,
    workspaceKind: "personal",
  });
  expect(h.rosterReads).toBe(0);
});

test("a match id resolves to the match's newest job", async () => {
  const h = harness({
    jobs: [
      job({
        id: OLDER_JOB,
        status: "cancelled",
        created_at: "2026-11-01T09:00:00Z",
      }),
      job({ created_at: "2026-11-10T12:00:00Z" }),
    ],
  });
  const result = await h.run({ matchId: MATCH });

  expect(result.ok).toBe(true);
  expect(h.resubmits[0].jobId).toBe(JOB);
  expect(h.db.inserts[0].row.resubmitted_from_job_id).toBe(JOB);
});

test("an uploader no longer in the program is not billed, and nothing is sent", async () => {
  const h = harness({ members: [] });
  const result = await h.run();

  expect(result).toEqual({
    ok: false,
    error:
      "The uploader no longer has permission to submit video for this program.",
    code: "quota",
  });
  expect(h.reserved).toEqual([]);
  expect(h.sent).toEqual([]);
  // The child that had to exist for the ledger is removed again.
  expect(h.db.deletes).toEqual([
    { table: "processing_jobs", ids: [h.db.inserts[0].row.id] },
  ]);
  expect(h.db.row("processing_jobs", JOB)?.status).toBe("failed");
});

// ── Refusals, in the existing paths' own sentences ────────────────────────

test("a match Verified by Advantage is refused before resubmitJob", async () => {
  const h = harness({ match: match({ verified: true }) });

  expect(await h.run()).toEqual({
    ok: false,
    error:
      "This match is Verified by Advantage, so it can't be analysed again.",
    code: "verified",
  });
  expect(VERIFIED_MATCH_REFUSAL).toBe(
    "This match is Verified by Advantage, so it can't be analysed again.",
  );
  expect(h.resubmits).toEqual([]);
  expectNothingSent(h);
});

test("a job that is not failed is refused, and an admin retry is never a reprocess", async () => {
  for (const status of ["completed", "queued", "derivation_failed"]) {
    const h = harness({ jobs: [job({ status })] });

    expect(await h.run()).toEqual({
      ok: false,
      error: `Only a failed or cancelled analysis can be sent again; this one is ${status}.`,
      code: "not_failed",
    });
    expectNothingSent(h);
    expect(h.db.row("processing_jobs", JOB)?.status).toBe(status);
  }
});

test("an athlete's cancel is not undone by an admin", async () => {
  const h = harness({ jobs: [job({ status: "cancelled" })] });

  expect(await h.run()).toEqual({
    ok: false,
    error: "A cancelled analysis is only sent again by the athlete.",
    code: "not_failed",
  });
  expectNothingSent(h);
});

test("the attempt ceiling, the duplicate check and the missing-video check still apply", async () => {
  const ceiling = harness({
    jobs: [
      job({ id: "j-a", created_at: "2026-11-01T00:00:00Z" }),
      job({
        id: "j-b",
        created_at: "2026-11-02T00:00:00Z",
        resubmitted_from_job_id: "j-a",
      }),
      job({ resubmitted_from_job_id: "j-b" }),
    ],
  });
  expect(await ceiling.run()).toMatchObject({
    ok: false,
    code: "attempt_ceiling",
  });
  expectNothingSent(ceiling);

  const duplicate = harness({
    jobs: [
      job(),
      job({
        id: OLDER_JOB,
        status: "processing",
        created_at: "2026-11-11T00:00:00Z",
      }),
    ],
  });
  expect(await duplicate.run()).toEqual({
    ok: false,
    error: "An analysis for this match is already in progress.",
    code: "in_flight_duplicate",
  });
  expectNothingSent(duplicate);

  const noVideo = harness({ jobs: [job({ video_object_key: null })] });
  expect(await noVideo.run()).toMatchObject({
    ok: false,
    code: "video_unavailable",
  });
  expectNothingSent(noVideo);
});

test("a job or match that cannot be found or read is refused with a code", async () => {
  const missingJob = harness({ jobs: [] });
  expect(await missingJob.run()).toEqual({
    ok: false,
    error: "Job not found.",
    code: "not_found",
  });
  expect(await missingJob.run({ matchId: MATCH })).toEqual({
    ok: false,
    error: "This match has no analysis to retry.",
    code: "not_found",
  });
  expect(missingJob.resubmits).toEqual([]);

  const unreadable = harness();
  unreadable.db.failures["matches.select"] = { message: "connection reset" };
  expect(await unreadable.run()).toEqual({
    ok: false,
    error: "Could not load the match. Try again.",
    code: "read_failed",
  });
  expect(unreadable.resubmits).toEqual([]);
  expectNothingSent(unreadable);
});

// ── The log ───────────────────────────────────────────────────────────────

test("every attempt is logged with the admin's id, sent or refused", async () => {
  const sent = harness();
  await sent.run();
  expect(sent.logged).toEqual([
    {
      level: "log",
      message: "[admin-resubmit] attempt",
      detail: { adminId: ADMIN, jobId: JOB },
    },
    {
      level: "log",
      message: "[admin-resubmit] sent",
      detail: {
        adminId: ADMIN,
        matchId: MATCH,
        parentJobId: JOB,
        childJobId: sent.db.inserts[0].row.id,
        externalJobId: "vendor-778912d7",
      },
    },
  ]);

  const refused = harness({ match: match({ verified: true }) });
  await refused.run({ matchId: MATCH });
  expect(refused.logged).toEqual([
    {
      level: "log",
      message: "[admin-resubmit] attempt",
      detail: { adminId: ADMIN, matchId: MATCH },
    },
    {
      level: "warn",
      message: "[admin-resubmit] refused — verified",
      detail: { adminId: ADMIN, matchId: MATCH, jobId: JOB },
    },
  ]);
});

test("resubmitJob logs the skipped upload contract by name, with the admin's id", async () => {
  const lines: Array<{ message: string; detail: unknown }> = [];
  const original = console.log;
  console.log = (message: string, detail?: unknown) => {
    lines.push({ message, detail });
  };
  try {
    await harness().run();
  } finally {
    console.log = original;
  }

  expect(lines).toContainEqual({
    message:
      "[splitstep-resubmit] admin retry — upload contract skipped (its roster read needs the uploader's session)",
    detail: { parentId: JOB, matchId: MATCH, requestedBy: ADMIN },
  });
});

test("adminRetry never rides with auto or reprocess", async () => {
  for (const extra of [{ auto: true }, { auto: false, reprocess: true }]) {
    const h = harness({ jobs: [job({ status: "completed" })] });
    const result = await resubmitJob({
      supabase: h.db.asClient(),
      jobId: JOB,
      adminRetry: { requestedBy: ADMIN },
      io: h.deps.io,
      ...extra,
    });
    expect(result).toEqual({
      ok: false,
      reason: "not_failed",
      message: "An admin retry is only ever a retry of a failed analysis.",
    });
    expect(h.db.reads).toEqual([]);
    expectNothingSent(h);
  }
});

// ── The server action's wiring ────────────────────────────────────────────

test.describe("resubmitFailedAnalysisAction", () => {
  function loadAction(caller: "admin" | "non-admin" | "signed-out") {
    const calls = {
      adminChecks: 0,
      adminClients: 0,
      reads: [] as string[],
      resubmits: [] as Row[],
      revalidated: [] as unknown[][],
    };
    const client = {
      from(table: string) {
        calls.reads.push(table);
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () =>
            table === "processing_jobs"
              ? { data: { id: JOB, match_id: MATCH }, error: null }
              : { data: { verified: false }, error: null },
        };
        return builder;
      },
    };

    const loader = createLoader({
      stubs: {
        "next/cache": {
          revalidatePath: (...args: unknown[]) => calls.revalidated.push(args),
        },
        "@/lib/services/programs/admin-guard": {
          checkAdmin: async () => {
            calls.adminChecks += 1;
            return caller === "admin"
              ? { ok: true, id: ADMIN }
              : { ok: false, status: caller === "signed-out" ? 401 : 403 };
          },
        },
        "@/lib/supabase/admin": {
          createAdminClient: () => {
            calls.adminClients += 1;
            return client;
          },
        },
        "@/lib/services/splitstep/resubmit-job": {
          resubmitJob: async (args: Row) => {
            calls.resubmits.push(args);
            return { ok: true, jobId: "child-1", externalJobId: "ext-1" };
          },
        },
      },
    });

    const action = loader.load("src/app/admin/matches/resubmit-action.ts")
      .resubmitFailedAnalysisAction as (
      input: AdminResubmitInput,
    ) => Promise<AdminResubmitResult>;
    return { action, calls };
  }

  test("checks is_admin itself, and a refused caller builds no service-role client", async () => {
    for (const caller of ["signed-out", "non-admin"] as const) {
      const { action, calls } = loadAction(caller);
      const result = await action({ jobId: JOB });

      expect(result).toMatchObject({
        ok: false,
        code: caller === "signed-out" ? "unauthorized" : "forbidden",
      });
      expect(calls.adminChecks).toBe(1);
      expect(calls.adminClients).toBe(0);
      expect(calls.reads).toEqual([]);
      expect(calls.resubmits).toEqual([]);
      expect(calls.revalidated).toEqual([]);
    }
  });

  test("an admin's call reaches resubmitJob as an admin retry, never a reprocess", async () => {
    const { action, calls } = loadAction("admin");
    const result = await action({ jobId: JOB });

    expect(result).toEqual({
      ok: true,
      jobId: "child-1",
      externalJobId: "ext-1",
    });
    expect(calls.adminChecks).toBe(1);
    expect(calls.resubmits).toHaveLength(1);
    const args = calls.resubmits[0];
    expect(args.jobId).toBe(JOB);
    expect(args.auto).toBe(false);
    expect(args.adminRetry).toEqual({ requestedBy: ADMIN });
    expect(args.reprocess).toBeUndefined();
    expect(args.workspace).toBeUndefined();
    expect(args.session).toBeUndefined();
    expect(calls.revalidated).toEqual([["/admin", "layout"]]);
  });
});
