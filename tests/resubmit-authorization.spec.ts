import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SplitStepJobRequest } from "@/lib/services/splitstep/job-request";
import {
  resubmitJob,
  type ResubmitIo,
  type ResubmitResult,
} from "@/lib/services/splitstep/resubmit-job";
import type { QuotaReservation } from "@/lib/services/splitstep/quota";
import {
  LINE_REQUIRES_STAFF_REFUSAL,
  PENDING_APPROVAL_NOTICE,
  type RosterIdentity,
} from "@/lib/workspace/upload-eligibility";
import {
  NO_BILLING_WORKSPACE_REFUSAL,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * `resubmitJob()`'s ladder, run against fixtures — the T17 gap.
 *
 * The function owns two Postgres tables and reaches everything else through
 * `ResubmitIo`; here the tables are an in-memory fake and every seam is a
 * stub. No Supabase, no Azure HEAD, no session cookie, and — the two that
 * matter — no quota RPC and no vendor: `reserveQuota` records what it was
 * asked and answers from the fixture, `submitToVendor` records the body and
 * answers a canned acceptance. Nothing here imports `quota.ts`'s runtime or
 * `azure-sas.ts`, and nothing `fetch`es. Every refusal asserts both stubs went
 * unreached AND that no row was written; the accepted paths assert the child
 * row, the reservation and the vendor body.
 *
 * Under test, in the function's order: the upload contract on the MANUAL path
 * — a pending program, a staff login as the athlete, a stranger's profile, a
 * scheduled line retried by a player, a roster that would not load — sitting
 * BEFORE the child row, the reservation and the vendor; the AUTO path, which
 * never reads a roster and instead re-derives the membership at retry time;
 * and the state contract — a refusal leaves the parent `failed` and creates
 * nothing, while only a failure past the reservation marks the CHILD failed.
 */

const VIEWER = "u-coach";
const PROGRAM = "p-westfield";
const WEBHOOK = "https://app.example.test/api/webhooks/splitstep";
const VENDOR_URL = "stub://vendor-read-credential/not-a-sas";
const VIDEO_KEY = "videos/u-coach/m-1/original.mp4";

function team(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: PROGRAM,
    kind: "team",
    name: "Westfield University",
    team: "mens",
    orgType: "college",
    timeZone: "UTC",
    role: "coach",
    mark: "W",
    canSubmitVideo: true,
    programStatus: "active",
    playersCanUpload: true,
    uploadPolicy: "everyone",
    memberUploadEnabled: true,
    myPlayerId: null,
    ...overrides,
  };
}

function personal(): Workspace {
  return {
    id: VIEWER,
    kind: "personal",
    name: "Personal",
    team: null,
    orgType: null,
    timeZone: "UTC",
    role: "owner",
    mark: "V",
    canSubmitVideo: true,
    programStatus: null,
    playersCanUpload: false,
    uploadPolicy: "everyone",
    memberUploadEnabled: true,
    myPlayerId: null,
  };
}

/** A claimed profile, a coach-managed one, and an arm-3 login-as-player. */
const AVA: RosterIdentity = { playerId: "pp-ava", userId: "u-ava" };
const BEN: RosterIdentity = { playerId: "pp-ben", userId: null };
const CAM: RosterIdentity = { playerId: "u-cam", userId: "u-cam" };
const ROSTER: readonly RosterIdentity[] = [AVA, BEN, CAM];

type Row = Record<string, unknown>;
type StoredRow = Row & { id: string };
type DbResult = { data: unknown; error: DbError | null };

function parentJob(overrides: Row = {}): Row {
  return {
    id: "j-parent",
    match_id: "m-1",
    created_by: VIEWER,
    status: "failed",
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

function matchRow(overrides: Row = {}): Row {
  return {
    id: "m-1",
    player1_name: "Ava Adams",
    player2_name: "Riley Rival",
    score: { player1: [7, 6], player2: [6, 4] },
    match_type: "singles",
    program_id: PROGRAM,
    player1_id: AVA.playerId,
    event_entry_id: null,
    format: { ad_scoring: false },
    fixed_camera: true,
    initial_top_player_is_player1: false,
    ...overrides,
  };
}

/** What `resolveAutoRetryWorkspace()` reads for the uploader, at retry time. */
function membership(overrides: Row = {}): Row {
  return {
    program_id: PROGRAM,
    user_id: VIEWER,
    role: "coach",
    upload_enabled: true,
    programs: {
      status: "active",
      players_can_upload: true,
      upload_policy: "everyone",
      org_type: "college",
    },
    ...overrides,
  };
}

// ── A fake of the four PostgREST shapes resubmitJob() uses ────────────────

type DbError = { code?: string; message: string };
type Filter = { kind: "eq" | "in" | "notin"; col: string; value: unknown };

class FakeDb {
  tables: Record<string, Row[]>;
  /** `"table.op"` → the error that op answers with. */
  failures: Record<string, DbError> = {};
  inserts: Array<{ table: string; row: StoredRow }> = [];
  updates: Array<{ table: string; ids: unknown[]; patch: Row }> = [];
  deletes: Array<{ table: string; ids: unknown[] }> = [];
  private seq = 0;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  nextId(): string {
    this.seq += 1;
    return `j-child-${this.seq}`;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
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
  not(col: string, operator: string, value: string): this {
    if (operator !== "in")
      throw new Error(`fake: .not(${operator}) unsupported`);
    // PostgREST's "(a,b,c)" spelling, as the live query writes it.
    const list = value.replace(/^\(|\)$/g, "").split(",");
    this.filters.push({ kind: "notin", col, value: list });
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

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col];
      if (f.kind === "eq") return v === f.value;
      if (f.kind === "in") return (f.value as unknown[]).includes(v);
      return !(f.value as unknown[]).includes(v);
    });
  }

  private async run(): Promise<{ data: unknown; error: DbError | null }> {
    const failure = this.db.failures[`${this.table}.${this.op}`];
    if (failure) return { data: null, error: failure };

    const rows = (this.db.tables[this.table] ??= []);
    const hit = rows.filter((r) => this.matches(r));

    switch (this.op) {
      case "select": {
        if (this.mode === "many") return { data: hit, error: null };
        if (this.mode === "single" && hit.length === 0) {
          return { data: null, error: { message: "no rows" } };
        }
        return { data: hit[0] ?? null, error: null };
      }
      case "insert": {
        const row: StoredRow = { ...this.payload, id: this.db.nextId() };
        rows.push(row);
        this.db.inserts.push({ table: this.table, row });
        return { data: this.mode === "many" ? [row] : row, error: null };
      }
      case "update": {
        for (const r of hit) Object.assign(r, this.payload);
        this.db.updates.push({
          table: this.table,
          ids: hit.map((r) => r.id),
          patch: this.payload ?? {},
        });
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

// ── The seams ─────────────────────────────────────────────────────────────

interface Harness {
  db: FakeDb;
  io: Partial<ResubmitIo>;
  /** The parent's status as fixtured — a refusal must leave it exactly so. */
  parentStatus: string;
  /** Every `reserveQuota` call — a non-empty list means a second was spent. */
  reserved: Array<{ jobId: string; workspaceId: string; seconds: number }>;
  released: string[];
  /** Every body handed to the vendor stub. */
  sent: SplitStepJobRequest[];
  rosterReads: Array<{ programId: string; userId: string }>;
  blobChecks: string[];
  minted: string[];
  retired: string[];
}

function harness(input: {
  job?: Row;
  match?: Row;
  members?: Row[];
  roster?: readonly RosterIdentity[] | null;
  /** Omit `loadRoster` from the io entirely, so the default (session-bound) one answers. */
  noRosterSeam?: boolean;
  reservation?: QuotaReservation;
  vendor?: { ok: boolean; status: number; text: string };
  blobExists?: boolean;
}): Harness {
  const parent = input.job ?? parentJob();
  const db = new FakeDb({
    processing_jobs: [parent],
    matches: [input.match ?? matchRow()],
    program_members: input.members ?? [membership()],
  });
  const h: Harness = {
    db,
    parentStatus: parent.status as string,
    reserved: [],
    released: [],
    sent: [],
    rosterReads: [],
    blobChecks: [],
    minted: [],
    retired: [],
    io: {
      deploymentConfig: () => ({
        ok: true,
        webhookUrl: WEBHOOK,
        apiUrl: "stub://vendor/jobs",
        apiKey: "stub-key",
      }),
      blobExists: async (objectKey) => {
        h.blobChecks.push(objectKey);
        return input.blobExists ?? true;
      },
      reserveQuota: async ({ jobId, workspace, seconds }) => {
        h.reserved.push({ jobId, workspaceId: workspace.id, seconds });
        return (
          input.reservation ?? {
            ok: true,
            usedSeconds: seconds,
            capSeconds: 7200,
          }
        );
      },
      releaseQuota: async (jobId) => {
        h.released.push(jobId);
      },
      mintVendorUrl: async ({ objectKey }) => {
        h.minted.push(objectKey);
        return { url: VENDOR_URL, expiresAt: new Date("2026-09-26T12:00:00Z") };
      },
      markUrlRetired: async (jobId) => {
        h.retired.push(jobId);
      },
      submitToVendor: async ({ body }) => {
        h.sent.push(body);
        return (
          input.vendor ?? {
            ok: true,
            status: 200,
            text: JSON.stringify({ job_id: "vendor-778912d7" }),
          }
        );
      },
      adoptOrphanedDeliveries: async () => ({
        adopted: 0,
        jobStatus: null,
        errorCode: null,
        errorStep: null,
        owedResultsDownload: false,
      }),
    },
  };
  if (!input.noRosterSeam) {
    h.io.loadRoster = async (programId, userId) => {
      h.rosterReads.push({ programId, userId });
      return input.roster === undefined ? ROSTER : input.roster;
    };
  }
  return h;
}

/** The manual path, as the route calls it: a session and a billing workspace. */
function manual(
  h: Harness,
  workspace: Workspace | undefined = team(),
): Promise<ResubmitResult> {
  return resubmitJob({
    supabase: h.db.asClient(),
    jobId: "j-parent",
    auto: false,
    workspace,
    // Any object — the injected roster seam is what reads through it, and the
    // one test that omits the seam omits this too.
    session: h.db.asClient(),
    io: h.io,
  });
}

/** The auto path, as the webhook and reconciler call it: no session, no workspace. */
function auto(h: Harness): Promise<ResubmitResult> {
  return resubmitJob({
    supabase: h.db.asClient(),
    jobId: "j-parent",
    auto: true,
    io: h.io,
  });
}

/**
 * The refusal contract: nothing reserved, nothing minted, nothing sent, and
 * NO row written — no child inserted, no update, no delete. The parent is
 * still the `failed` row it was found as, so "Retry analysis" stays on offer.
 */
function expectRefused(
  h: Harness,
  result: ResubmitResult,
  reason: string,
): asserts result is Extract<ResubmitResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toBe(reason);
  expect(h.reserved).toEqual([]);
  expect(h.minted).toEqual([]);
  expect(h.sent).toEqual([]);
  expect(h.released).toEqual([]);
  expect(h.db.inserts).toEqual([]);
  expect(h.db.updates).toEqual([]);
  expect(h.db.deletes).toEqual([]);
  expect(h.db.row("processing_jobs", "j-parent")?.status).toBe(h.parentStatus);
  // No refusal carries the vendor credential.
  expect(JSON.stringify(result)).not.toContain(VENDOR_URL);
}

// ── The upload contract, on the manual path ───────────────────────────────

test("a program still awaiting approval → not_eligible, before any row exists", async () => {
  const h = harness({});
  const r = await manual(h, team({ programStatus: "claim_pending" }));
  expectRefused(h, r, "not_eligible");
  expect(r.message).toBe(PENDING_APPROVAL_NOTICE);
});

test("a match under a program the caller is not in → not_eligible", async () => {
  // `billingWorkspaceFor()` answers `undefined` for such a program; the route
  // refuses on that itself, and the function refuses again if asked anyway.
  const h = harness({});
  const r = await resubmitJob({
    supabase: h.db.asClient(),
    jobId: "j-parent",
    auto: false,
    workspace: undefined,
    session: h.db.asClient(),
    io: h.io,
  });
  expectRefused(h, r, "not_eligible");
  expect(r.message).toBe(NO_BILLING_WORKSPACE_REFUSAL);
});

test("the coach's own login as the athlete on a team match → not_eligible", async () => {
  // Ownership proves the caller created the job; it does not make their login
  // a roster athlete. The same row `/api/splitstep/jobs` refuses.
  const h = harness({ match: matchRow({ player1_id: VIEWER }) });
  const r = await manual(h);
  expectRefused(h, r, "not_eligible");
  expect(r.message).toMatch(/isn't on Westfield University's roster/);
  expect(h.rosterReads).toEqual([{ programId: PROGRAM, userId: VIEWER }]);
});

test("an id from another program's roster → not_eligible", async () => {
  const h = harness({
    match: matchRow({ player1_id: "pp-eastside-stranger" }),
  });
  const r = await manual(h);
  expectRefused(h, r, "not_eligible");
  expect(r.message).toMatch(/isn't on Westfield University's roster/);
});

test("a match on a scheduled line, retried by a player → not_eligible", async () => {
  const h = harness({ match: matchRow({ event_entry_id: "e-line-1" }) });
  const r = await manual(
    h,
    team({ role: "player", memberUploadEnabled: true }),
  );
  expectRefused(h, r, "not_eligible");
  expect(r.message).toBe(LINE_REQUIRES_STAFF_REFUSAL);
});

test("a player whose 'Can send video' switch is off → not_eligible, not quota", async () => {
  // The contract's role question is asked before `reserveQuota()` gets to ask
  // its own — so the reservation stub never sees this at all.
  const h = harness({});
  const r = await manual(
    h,
    team({ role: "player", memberUploadEnabled: false }),
  );
  expectRefused(h, r, "not_eligible");
  expect(r.message).toMatch(/isn't switched on for your account/);
});

test("a roster that would not load → eligibility_unknown, nothing spent", async () => {
  const h = harness({ roster: null });
  const r = await manual(h);
  expectRefused(h, r, "eligibility_unknown");
  expect(r.message).toMatch(/couldn't load Westfield University's roster/);
});

test("a manual team retry with no session client is undecided, never passed", async () => {
  // The default roster seam answers `null` without a session — the contract
  // then refuses with a retry. It does not fall through to "eligible".
  const h = harness({ noRosterSeam: true });
  const r = await resubmitJob({
    supabase: h.db.asClient(),
    jobId: "j-parent",
    auto: false,
    workspace: team(),
    io: h.io,
  });
  expectRefused(h, r, "eligibility_unknown");
});

// ── The contract sits before the child row, the reservation and the vendor ─

test("an eligible manual retry inserts the child, reserves for it, then submits", async () => {
  const h = harness({});
  const r = await manual(h);
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  expect(h.rosterReads).toEqual([{ programId: PROGRAM, userId: VIEWER }]);
  expect(h.blobChecks).toEqual([VIDEO_KEY]);

  // One child, linked to its parent, carrying the parent's own answers.
  expect(h.db.inserts).toHaveLength(1);
  const child = h.db.inserts[0].row;
  expect(child.resubmitted_from_job_id).toBe("j-parent");
  expect(child.auto_resubmitted).toBe(false);
  expect(child.created_by).toBe(VIEWER);
  expect(child.initial_top_player_is_player1).toBe(true);
  expect(r.jobId).toBe(child.id);

  // Reserved for the CHILD, against the match's program, for the trim window.
  expect(h.reserved).toEqual([
    { jobId: child.id, workspaceId: PROGRAM, seconds: 5182 },
  ]);

  // Sent once, with the stub credential, the job row's orientation (true —
  // the failed attempt's own answer beats the match row's false).
  expect(h.sent).toHaveLength(1);
  expect(h.sent[0].VideoUrl).toBe(VENDOR_URL);
  expect(h.sent[0].InitialTopPlayer).toBe("Ava Adams");
  expect(h.sent[0].SetGameScores).toEqual([
    [7, 6],
    [6, 4],
  ]);
  expect(h.minted).toEqual([VIDEO_KEY]);

  // The child went submitting → queued; the parent never moved.
  expect(h.db.row("processing_jobs", child.id)?.status).toBe("queued");
  expect(h.db.row("processing_jobs", child.id)?.external_job_id).toBe(
    "vendor-778912d7",
  );
  expect(h.db.row("processing_jobs", "j-parent")?.status).toBe("failed");
  expect(h.released).toEqual([]);
});

test("a coach-managed profile and an arm-3 login are both roster athletes", async () => {
  for (const playerId of [BEN.playerId, CAM.playerId]) {
    const h = harness({ match: matchRow({ player1_id: playerId }) });
    expect((await manual(h)).ok).toBe(true);
  }
});

test("an older row carrying the claimed player's login id is still that player", async () => {
  const h = harness({ match: matchRow({ player1_id: AVA.userId }) });
  expect((await manual(h)).ok).toBe(true);
  // Checked, not rewritten: nothing touched the match row.
  expect(h.db.updates.every((u) => u.table === "processing_jobs")).toBe(true);
});

test("a line match retried by staff submits", async () => {
  const h = harness({ match: matchRow({ event_entry_id: "e-line-1" }) });
  expect((await manual(h)).ok).toBe(true);
});

test("a personal match is the uploader's own: no roster read, personal ledger", async () => {
  const h = harness({
    match: matchRow({ program_id: null, player1_id: VIEWER }),
  });
  const r = await manual(h, personal());
  expect(r.ok).toBe(true);
  expect(h.rosterReads).toEqual([]);
  expect(h.reserved[0].workspaceId).toBe(VIEWER);
});

// ── The auto path never asks the contract ─────────────────────────────────

test("an automatic retry reads no roster and re-derives membership at retry time", async () => {
  // A row the MANUAL path refuses (the coach's own login as the athlete) still
  // auto-retries: the athlete was fixed on the row when the parent was first
  // submitted through the T16 gate, and nothing under the service role can
  // ask the session-bound roster. What IS re-asked is the membership, fresh.
  const h = harness({ match: matchRow({ player1_id: VIEWER }) });
  const r = await auto(h);
  expect(r.ok).toBe(true);
  expect(h.rosterReads).toEqual([]);
  expect(h.reserved).toEqual([
    { jobId: h.db.inserts[0].row.id, workspaceId: PROGRAM, seconds: 5182 },
  ]);
  expect(h.sent).toHaveLength(1);
  expect(h.db.inserts[0].row.auto_resubmitted).toBe(true);
});

test("an automatic retry for an uploader no longer in the program is declined", async () => {
  // The retry-time re-derivation at work: no membership row, no workspace,
  // no spend — and the child that had to exist for the ledger is removed
  // again rather than left as a phantom attempt.
  const h = harness({ members: [] });
  const r = await auto(h);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("quota");
  expect(r.message).toMatch(/no longer has permission/);
  expect(h.reserved).toEqual([]);
  expect(h.sent).toEqual([]);
  expect(h.db.deletes).toEqual([
    { table: "processing_jobs", ids: [h.db.inserts[0].row.id] },
  ]);
  expect(h.db.row("processing_jobs", "j-parent")?.status).toBe("failed");
});

// ── What a refusal does to the job, versus what a failed submit does ──────

test("a quota refusal removes the child and leaves the parent failed", async () => {
  const h = harness({
    reservation: {
      ok: false,
      usedSeconds: 7000,
      capSeconds: 7200,
      message: "Monthly allowance exhausted.",
    },
  });
  const r = await manual(h);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("quota");
  expect(h.sent).toEqual([]);
  expect(h.db.tables.processing_jobs.map((j) => j.id)).toEqual(["j-parent"]);
});

test("only a failure PAST the reservation marks the child failed — never the contract", async () => {
  const h = harness({ vendor: { ok: false, status: 500, text: "boom" } });
  const r = await manual(h);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("submit_failed");
  const child = h.db.inserts[0].row;
  expect(h.released).toEqual([child.id]);
  expect(h.retired).toEqual([child.id]);
  expect(h.db.row("processing_jobs", child.id)?.status).toBe("failed");
  expect(h.db.row("processing_jobs", "j-parent")?.status).toBe("failed");
});

// ── The guards that already stood, still standing ─────────────────────────

test("a parent that is not failed, or has no video, is refused before the contract", async () => {
  const running = harness({ job: parentJob({ status: "queued" }) });
  expectRefused(running, await manual(running), "not_failed");
  const noVideo = harness({ job: parentJob({ video_object_key: null }) });
  expectRefused(noVideo, await manual(noVideo), "video_unavailable");
  expect(running.rosterReads).toEqual([]);
  expect(noVideo.rosterReads).toEqual([]);
});

test("a source blob that is gone → video_unavailable, nothing spent", async () => {
  const h = harness({ blobExists: false });
  expectRefused(h, await manual(h), "video_unavailable");
});
