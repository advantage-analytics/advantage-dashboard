import { expect, test } from "@playwright/test";

import {
  handleSubmitJob,
  type SubmitJobDeps,
  type SubmitJobMatch,
  type SubmitJobPatch,
  type SubmitJobRow,
} from "@/app/api/splitstep/jobs/handler";
import type { SplitStepJobRequest } from "@/lib/services/splitstep/job-request";
import type { QuotaReservation } from "@/lib/services/splitstep/quota";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";
import { PENDING_APPROVAL_NOTICE } from "@/lib/workspace/upload-eligibility";
import {
  NO_BILLING_WORKSPACE_REFUSAL,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * `/api/splitstep/jobs`'s ladder, run against fixtures.
 *
 * The handler takes its I/O as `SubmitJobDeps`, and every dep here is a fake:
 * no Supabase, no workspace cookie, and — the two that matter — no quota RPC
 * and no vendor. `reserveQuota` is a stub that records what it was asked and
 * answers from the fixture; `submitToVendor` records the body it was handed
 * and answers a canned acceptance. Nothing in this file imports `quota.ts`'s
 * runtime, `azure-sas.ts`, or `fetch`es anything; every denial asserts that
 * both stubs went unreached, and the one accepted path asserts the exact body
 * the vendor would have received.
 *
 * Under test, in the handler's order: sign-in, ownership, submittability, the
 * upload contract on the ROW (T16 — a pending program, a subject from another
 * program's roster, a staff-only login as the athlete, an older row carrying a
 * login id), then the quota question the route already asked. Valid jobs keep
 * the vendor payload's three load-bearing invariants (top-player ordering,
 * game counts, trim-derived billing), bill the MATCH's workspace whichever
 * one is active, and — criterion 4 — a refusal leaves an `uploaded` job
 * untouched while a failure past the reservation still marks it `failed`.
 */

const VIEWER = "u-coach";
const OTHER_USER = "u-someone-else";
const PROGRAM = "p-westfield";
const OTHER_PROGRAM = "p-eastside";
const WEBHOOK = "https://app.example.test/api/webhooks/splitstep";
const VENDOR_URL = "stub://vendor-read-credential/not-a-sas";

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
    eventsPolicy: "staff",
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
    eventsPolicy: "staff",
    memberUploadEnabled: true,
    myPlayerId: null,
  };
}

/** A claimed profile, a coach-managed one, and an arm-3 login-as-player. */
const AVA: RosterIdentity = { playerId: "pp-ava", userId: "u-ava" };
const BEN: RosterIdentity = { playerId: "pp-ben", userId: null };
const CAM: RosterIdentity = { playerId: "u-cam", userId: "u-cam" };
const ROSTER: readonly RosterIdentity[] = [AVA, BEN, CAM];

function job(overrides: Partial<SubmitJobRow> = {}): SubmitJobRow {
  return {
    id: "j-1",
    match_id: "m-1",
    created_by: VIEWER,
    status: "uploaded",
    external_job_id: null,
    video_object_key: "videos/u-coach/m-1/original.mp4",
    start_time_seconds: 90,
    end_time_seconds: 5271.5,
    attempt_count: null,
    initial_top_player_is_player1: null,
    ad_scoring: null,
    fixed_camera: null,
    ...overrides,
  };
}

function match(overrides: Partial<SubmitJobMatch> = {}): SubmitJobMatch {
  return {
    id: "m-1",
    player1_name: "Ava Adams",
    player2_name: "Riley Rival",
    // A 7-6 set is the GAME count. The 6-4 keeps ordering observable.
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

interface Harness {
  deps: SubmitJobDeps;
  /** Every `reserveQuota` call — a non-empty list means a second was spent. */
  reserved: Array<{ jobId: string; workspaceId: string; seconds: number }>;
  released: string[];
  /** Every body handed to the vendor stub. */
  sent: SplitStepJobRequest[];
  /** Every job-row patch, in order. */
  patches: Array<{ jobId: string; patch: SubmitJobPatch }>;
  rosterReads: string[];
  minted: string[];
  retired: string[];
  scheduled: Array<{ jobId: string; externalJobId: string }>;
}

function harness(input: {
  userId?: string | null;
  configured?: boolean;
  job?: SubmitJobRow | null;
  jobError?: string;
  match?: SubmitJobMatch | null;
  matchError?: string;
  workspaces?: Workspace[];
  roster?: readonly RosterIdentity[] | null;
  reservation?: QuotaReservation;
  vendor?: { ok: boolean; status: number; text: string };
  mintThrows?: boolean;
}): Harness {
  const h: Harness = {
    reserved: [],
    released: [],
    sent: [],
    patches: [],
    rosterReads: [],
    minted: [],
    retired: [],
    scheduled: [],
    deps: {
      currentUserId: async () =>
        input.userId === undefined ? VIEWER : input.userId,
      deploymentConfig: () =>
        input.configured === false
          ? { ok: false, missing: "SPLITSTEP_API_KEY" }
          : { ok: true, webhookUrl: WEBHOOK },
      loadJob: async () => ({
        job: input.jobError
          ? null
          : input.job === undefined
            ? job()
            : input.job,
        error: input.jobError ?? null,
      }),
      loadMatch: async () => ({
        match: input.matchError
          ? null
          : input.match === undefined
            ? match()
            : input.match,
        error: input.matchError ?? null,
      }),
      availableWorkspaces: async () => input.workspaces ?? [personal(), team()],
      loadRoster: async (programId) => {
        h.rosterReads.push(programId);
        return input.roster === undefined ? ROSTER : input.roster;
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
      updateJob: async (jobId, patch) => {
        h.patches.push({ jobId, patch });
        return { error: null };
      },
      mintVendorUrl: async ({ objectKey }) => {
        if (input.mintThrows) throw new Error("AZURE_STORAGE_ACCOUNT is unset");
        h.minted.push(objectKey);
        return { url: VENDOR_URL, expiresAt: new Date("2026-09-13T12:00:00Z") };
      },
      markUrlRetired: async (jobId) => {
        h.retired.push(jobId);
      },
      submitToVendor: async (body) => {
        h.sent.push(body);
        return (
          input.vendor ?? {
            ok: true,
            status: 200,
            text: JSON.stringify({ job_id: "vendor-778912d7" }),
          }
        );
      },
      afterSubmitted: (entry) => {
        h.scheduled.push(entry);
      },
    },
  };
  return h;
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/splitstep/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** What the wizard sends on a first submit. */
const FIRST_SUBMIT = {
  jobId: "j-1",
  initialTopPlayerIsPlayer1: true,
  adScoring: false,
  fixedCamera: true,
};

/** What "Try again" sends — the job id and nothing else. */
const RETRY = { jobId: "j-1" };

async function call(h: Harness, body: unknown = FIRST_SUBMIT) {
  const res = await handleSubmitJob(post(body), h.deps);
  const json = (await res.json()) as {
    error?: string;
    details?: string[];
    externalJobId?: string;
    billableSeconds?: number;
    status?: string;
  };
  // No response — allowed or refused — ever carries the vendor credential.
  expect(JSON.stringify(json)).not.toContain(VENDOR_URL);
  return { status: res.status, json };
}

/**
 * The denial contract, and criterion 4 in one place: nothing reserved,
 * nothing sent, and the job row NOT written — not `submitting`, not `failed`,
 * not even an `attempt_count` bump. An `uploaded` job stays `uploaded`.
 */
function expectDenied(h: Harness, status: number, result: { status: number }) {
  expect(result.status).toBe(status);
  expect(h.reserved).toEqual([]);
  expect(h.sent).toEqual([]);
  expect(h.minted).toEqual([]);
  expect(h.patches).toEqual([]);
  expect(h.released).toEqual([]);
}

// ── Request shape, sign-in, deployment ────────────────────────────────────

test("no session → 401 before anything else is read", async () => {
  const h = harness({ userId: null });
  expectDenied(h, 401, await call(h));
  expect(h.rosterReads).toEqual([]);
});

test("malformed body and a missing jobId → 400", async () => {
  const h = harness({});
  expectDenied(h, 400, await call(h, "{not json"));
  expectDenied(h, 400, await call(h, { adScoring: true }));
});

test("an unconfigured deployment → 503, before the job is even loaded", async () => {
  const h = harness({ configured: false });
  expectDenied(h, 503, await call(h));
});

// ── Ownership and submittability ──────────────────────────────────────────

test("a job that does not exist and somebody else's job → the same 404", async () => {
  expectDenied(harness({ job: null }), 404, await call(harness({ job: null })));
  const h = harness({ job: job({ created_by: OTHER_USER }) });
  const r = await call(h);
  expectDenied(h, 404, r);
  expect(r.json.error).toBe("Job not found");
});

test("a job lookup failure → 500, nothing spent", async () => {
  const h = harness({ jobError: "connection reset" });
  expectDenied(h, 500, await call(h));
});

test("already submitted, still uploading, no video, no trim → 409", async () => {
  expectDenied(
    harness({ job: job({ external_job_id: "vendor-1" }) }),
    409,
    await call(harness({ job: job({ external_job_id: "vendor-1" }) })),
  );
  const uploading = harness({ job: job({ status: "uploading" }) });
  const r = await call(uploading);
  expectDenied(uploading, 409, r);
  expect(r.json.error).toMatch(/still uploading/);
  expectDenied(
    harness({ job: job({ video_object_key: null }) }),
    409,
    await call(harness({ job: job({ video_object_key: null }) })),
  );
  expectDenied(
    harness({ job: job({ end_time_seconds: null }) }),
    409,
    await call(harness({ job: job({ end_time_seconds: null }) })),
  );
});

test("a match load failure → 500, nothing spent", async () => {
  const h = harness({ matchError: "connection reset" });
  expectDenied(h, 500, await call(h));
});

// ── The three vendor answers, and the payload (criterion 3) ───────────────

test("a retry with no orientation anywhere → 400, never defaulted", async () => {
  const h = harness({ match: match({ initial_top_player_is_player1: null }) });
  const r = await call(h, RETRY);
  expectDenied(h, 400, r);
  expect(r.json.error).toMatch(/initialTopPlayerIsPlayer1/);
});

test("a doubles match → 422 with the builder's field list, nothing spent", async () => {
  const h = harness({ match: match({ match_type: "doubles" }) });
  const r = await call(h);
  expectDenied(h, 422, r);
  expect(r.json.details).toContain(
    "Video analysis supports singles matches only.",
  );
});

test("player1 at the top: names and set scores go player1-first", async () => {
  const h = harness({});
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(h.sent).toHaveLength(1);
  const body = h.sent[0];
  expect(body.InitialTopPlayer).toBe("Ava Adams");
  expect(body.InitialBottomPlayer).toBe("Riley Rival");
  // GAME counts, and a 7-6 set stays [7, 6] — never the tiebreak points.
  expect(body.SetGameScores).toEqual([
    [7, 6],
    [6, 4],
  ]);
  expect(body.Ad).toBe(false);
  expect(body.FixedCamera).toBe(true);
  expect(body.MatchID).toBe("m-1");
  expect(body.WebhookUrl).toBe(WEBHOOK);
  expect(body.VideoUrl).toBe(VENDOR_URL);
});

test("player1 at the bottom: names swap and every set is reordered top-first", async () => {
  const h = harness({});
  const r = await call(h, {
    ...FIRST_SUBMIT,
    initialTopPlayerIsPlayer1: false,
  });
  expect(r.status).toBe(200);
  const body = h.sent[0];
  expect(body.InitialTopPlayer).toBe("Riley Rival");
  expect(body.InitialBottomPlayer).toBe("Ava Adams");
  expect(body.SetGameScores).toEqual([
    [6, 7],
    [4, 6],
  ]);
});

test("the trim window is what is sent AND what is billed, rounded up", async () => {
  const h = harness({});
  const r = await call(h);
  const body = h.sent[0];
  expect(body.StartTime).toBe(90);
  expect(body.EndTime).toBe(5271.5);
  // ceil(5271.5 - 90) — the reservation, the row and the response all agree.
  expect(r.json.billableSeconds).toBe(5182);
  expect(h.reserved).toEqual([
    { jobId: "j-1", workspaceId: PROGRAM, seconds: 5182 },
  ]);
  expect(h.patches[0].patch.billable_seconds).toBe(5182);
});

test("a retry takes the three answers from the row, most-specific-first", async () => {
  // The job row (what the last attempt used) beats the match row (what was
  // originally answered); the body, absent on a retry, would beat both.
  const h = harness({
    job: job({ initial_top_player_is_player1: false, ad_scoring: true }),
    match: match({
      initial_top_player_is_player1: true,
      format: { ad_scoring: false },
      fixed_camera: false,
    }),
  });
  const r = await call(h, RETRY);
  expect(r.status).toBe(200);
  const body = h.sent[0];
  expect(body.InitialTopPlayer).toBe("Riley Rival");
  expect(body.Ad).toBe(true);
  // fixed_camera is null on the job, so the match answers.
  expect(body.FixedCamera).toBe(false);
});

test("an accepted submission records what was sent, then queued, and schedules adoption", async () => {
  const h = harness({ job: job({ attempt_count: 2 }) });
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(r.json.externalJobId).toBe("vendor-778912d7");
  expect(r.json.status).toBe("queued");
  expect(h.patches.map((p) => p.patch.status)).toEqual([
    "submitting",
    "queued",
  ]);
  // Counted, not pinned.
  expect(h.patches[0].patch.attempt_count).toBe(3);
  expect(h.patches[0].patch.initial_top_player_is_player1).toBe(true);
  expect(h.patches[1].patch.external_job_id).toBe("vendor-778912d7");
  expect(h.minted).toEqual(["videos/u-coach/m-1/original.mp4"]);
  expect(h.scheduled).toEqual([
    { jobId: "j-1", externalJobId: "vendor-778912d7" },
  ]);
  expect(h.released).toEqual([]);
});

// ── The match's workspace, not the switcher's ─────────────────────────────

test("a match under a program the caller is not in → 403, nothing reserved", async () => {
  const h = harness({ match: match({ program_id: OTHER_PROGRAM }) });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toBe(NO_BILLING_WORKSPACE_REFUSAL);
  expect(h.rosterReads).toEqual([]);
});

test("the budget charged is the match's program, whichever workspace is active", async () => {
  // Two team workspaces; the match belongs to the second and the roster read
  // and the reservation both name it. There is no "active" workspace here at
  // all — the handler never sees one.
  const eastside = team({ id: OTHER_PROGRAM, name: "Eastside" });
  const h = harness({
    match: match({ program_id: OTHER_PROGRAM }),
    workspaces: [personal(), team(), eastside],
  });
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(h.rosterReads).toEqual([OTHER_PROGRAM]);
  expect(h.reserved[0].workspaceId).toBe(OTHER_PROGRAM);
});

// ── Personal and valid roster jobs keep submitting ────────────────────────

test("a personal match attributed to the uploader submits and bills the personal ledger", async () => {
  const h = harness({ match: match({ program_id: null, player1_id: VIEWER }) });
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(h.rosterReads).toEqual([]);
  expect(h.reserved[0].workspaceId).toBe(VIEWER);
});

test("a personal match with no athlete on the row is still the uploader's", async () => {
  const h = harness({ match: match({ program_id: null, player1_id: null }) });
  expect((await call(h)).status).toBe(200);
});

test("a coach-managed profile and an arm-3 login are both roster athletes", async () => {
  expect(
    (await call(harness({ match: match({ player1_id: BEN.playerId }) })))
      .status,
  ).toBe(200);
  expect(
    (await call(harness({ match: match({ player1_id: CAM.playerId }) })))
      .status,
  ).toBe(200);
});

test("an older row carrying the claimed player's login id is still that player", async () => {
  const h = harness({ match: match({ player1_id: AVA.userId! }) });
  const r = await call(h);
  expect(r.status).toBe(200);
  // Checked, not rewritten: no patch touches the match, and the vendor body
  // is built from the row as it stands.
  expect(h.sent[0].InitialTopPlayer).toBe("Ava Adams");
});

test("a match on a scheduled line, submitted by staff, submits", async () => {
  const h = harness({ match: match({ event_entry_id: "e-line-1" }) });
  expect((await call(h)).status).toBe(200);
});

test("a player sending their own match under 'everyone' with the switch on submits", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({ role: "player", myPlayerId: CAM.playerId }),
    ],
    match: match({ player1_id: CAM.playerId }),
  });
  expect((await call(h)).status).toBe(200);
});

// ── The guard this task adds: the row's athlete and the program's state ───

test("a pending program is refused before quota is reserved", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({ programStatus: "claim_pending", canSubmitVideo: false }),
    ],
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toBe(PENDING_APPROVAL_NOTICE);
});

test("a suspended program → 403 with its own sentence", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({ programStatus: "suspended", canSubmitVideo: false }),
    ],
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toContain("suspended");
});

test("a staff-only login as the athlete → 403 (the trigger accepts it; this must not)", async () => {
  // The coach's own login on the row: a member of the program, so the live
  // `matches_block_client_regraft` lets it through — and the service-role
  // client this route reads with skips that trigger anyway.
  const h = harness({ match: match({ player1_id: VIEWER }) });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toMatch(/isn't on Westfield University's roster/);
});

test("a subject from another program's roster → 403", async () => {
  const h = harness({ match: match({ player1_id: "pp-eastside-player" }) });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toMatch(/isn't on Westfield University's roster/);
});

test("a team match with no athlete on the row → 403, never the uploader", async () => {
  const h = harness({ match: match({ player1_id: null }) });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toMatch(/Choose who played/);
});

test("staff who hold a live profile pass through it, because the loader lists it", async () => {
  const OWN: RosterIdentity = { playerId: "pp-coach-self", userId: VIEWER };
  const h = harness({
    workspaces: [personal(), team({ role: "owner" })],
    roster: [...ROSTER, OWN],
    match: match({ player1_id: OWN.playerId }),
  });
  expect((await call(h)).status).toBe(200);
});

test("a roster that could not be read → 503, and the job stays uploaded for the retry", async () => {
  const h = harness({ roster: null });
  const r = await call(h);
  expectDenied(h, 503, r);
  expect(r.json.error).toMatch(/Try again/);
});

test("a player attached to a scheduled line → 403, staff only", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({ role: "player", myPlayerId: CAM.playerId }),
    ],
    match: match({ player1_id: CAM.playerId, event_entry_id: "e-line-1" }),
  });
  expectDenied(h, 403, await call(h));
});

test("a personal match naming somebody else as the athlete → 403", async () => {
  const h = harness({
    match: match({ program_id: null, player1_id: OTHER_USER }),
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toBe(
    "A personal match is recorded against your own account.",
  );
});

// ── The quota question the route already asked, retained and unchanged ────

test("a player whose 'Can send video' switch is off → 403 from the contract, never reaching quota", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({
        role: "player",
        memberUploadEnabled: false,
        myPlayerId: CAM.playerId,
      }),
    ],
    match: match({ player1_id: CAM.playerId }),
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toMatch(/isn't switched on for your account/);
});

test("a permission refusal from reserveQuota → 403 in its own words, nothing sent", async () => {
  // `canSubmitVideo` false on an otherwise active-looking workspace: the
  // contract reads `programStatus` and passes; `reserveQuota()` is the layer
  // that refuses. It is asked, and its answer is the response.
  const h = harness({
    workspaces: [personal(), team({ canSubmitVideo: false })],
    reservation: {
      ok: false,
      usedSeconds: 0,
      capSeconds: 0,
      message: "Westfield University is still being confirmed.",
      permission: true,
    },
  });
  const r = await call(h);
  expect(r.status).toBe(403);
  expect(r.json.error).toMatch(/still being confirmed/);
  expect(h.reserved).toHaveLength(1);
  expect(h.sent).toEqual([]);
  expect(h.patches).toEqual([]);
});

test("an exhausted allowance → 429, nothing sent, the job untouched", async () => {
  const h = harness({
    reservation: {
      ok: false,
      usedSeconds: 7000,
      capSeconds: 7200,
      message: "This match needs 86 min of analysis but only 3 min is left.",
    },
  });
  const r = await call(h);
  expect(r.status).toBe(429);
  expect(h.reserved).toHaveLength(1);
  expect(h.sent).toEqual([]);
  expect(h.patches).toEqual([]);
  expect(h.released).toEqual([]);
});

// ── Past the reservation: the existing lifecycle, unchanged ───────────────

test("a vendor rejection past the reservation hands quota back and marks the job failed", async () => {
  const h = harness({ vendor: { ok: false, status: 500, text: "boom" } });
  const r = await call(h);
  expect(r.status).toBe(502);
  expect(h.sent).toHaveLength(1);
  expect(h.released).toEqual(["j-1"]);
  expect(h.retired).toEqual(["j-1"]);
  expect(h.patches.map((p) => p.patch.status)).toEqual([
    "submitting",
    "failed",
  ]);
  expect(h.scheduled).toEqual([]);
});

test("a vendor acceptance with no job id is a failure, not an orphan", async () => {
  const h = harness({ vendor: { ok: true, status: 200, text: "{}" } });
  const r = await call(h);
  expect(r.status).toBe(502);
  expect(h.released).toEqual(["j-1"]);
  expect(h.patches.at(-1)?.patch.status).toBe("failed");
});

test("a minter that throws past the reservation still releases and marks failed", async () => {
  const h = harness({ mintThrows: true });
  const r = await call(h);
  expect(r.status).toBe(502);
  expect(h.sent).toEqual([]);
  expect(h.released).toEqual(["j-1"]);
  expect(h.patches.at(-1)?.patch.status).toBe("failed");
});
