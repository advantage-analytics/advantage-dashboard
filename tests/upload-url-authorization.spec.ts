import { expect, test } from "@playwright/test";

import {
  athleteOnRow,
  handleUploadUrl,
  type UploadUrlDeps,
  type UploadUrlMatch,
} from "@/app/api/splitstep/upload-url/handler";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";
import { PENDING_APPROVAL_NOTICE } from "@/lib/workspace/upload-eligibility";
import {
  NO_BILLING_WORKSPACE_REFUSAL,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * `/api/splitstep/upload-url`'s refusal ladder, run against fixtures.
 *
 * The handler takes its I/O as `UploadUrlDeps`, and every dep here is a fake:
 * no Supabase, no workspace cookie, and — the one that matters — no Azure.
 * `mintUploadSas` is a stub that returns a sentinel string and counts its
 * calls. Nothing in this file imports `azure-sas.ts`, reads an
 * `AZURE_STORAGE_*` variable, or can produce a `sig=`; the assertions at the
 * bottom of each denial are that the stub was never reached, and the one
 * success assertion is that the sentinel came back unchanged.
 *
 * Under test, in the handler's order: sign-in, ownership (an existing match
 * created by somebody else), the match's workspace (not the switcher's), the
 * upload contract on the ROW — a pending program, a subject from another
 * program's roster, a staff-only login as the athlete — and then the video
 * question the route already asked. Personal uploads and valid roster
 * uploads, new and existing, keep minting.
 */

const VIEWER = "u-coach";
const OTHER_USER = "u-someone-else";
const PROGRAM = "p-westfield";
const OTHER_PROGRAM = "p-eastside";
const STUB_URL = "stub://upload-credential/not-a-sas";

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

function match(overrides: Partial<UploadUrlMatch> = {}): UploadUrlMatch {
  return {
    id: "m-1",
    created_by: VIEWER,
    program_id: PROGRAM,
    player1_id: AVA.playerId,
    event_entry_id: null,
    ...overrides,
  };
}

interface Harness {
  deps: UploadUrlDeps;
  minted: string[];
  recorded: Array<{ matchId: string; blobName: string }>;
  rosterReads: string[];
}

function harness(input: {
  userId?: string | null;
  match?: UploadUrlMatch | null;
  matchError?: string;
  workspaces?: Workspace[];
  roster?: readonly RosterIdentity[] | null;
  mintThrows?: boolean;
}): Harness {
  const minted: string[] = [];
  const recorded: Array<{ matchId: string; blobName: string }> = [];
  const rosterReads: string[] = [];
  const deps: UploadUrlDeps = {
    currentUserId: async () =>
      input.userId === undefined ? VIEWER : input.userId,
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
      rosterReads.push(programId);
      return input.roster === undefined ? ROSTER : input.roster;
    },
    mintUploadSas: ({ blobName }) => {
      if (input.mintThrows) throw new Error("AZURE_STORAGE_ACCOUNT is unset");
      minted.push(blobName);
      return {
        uploadUrl: STUB_URL,
        expiresAt: new Date("2026-09-12T12:00:00Z"),
      };
    },
    recordBlobName: async (matchId, blobName) => {
      recorded.push({ matchId, blobName });
      return { error: null };
    },
  };
  return { deps, minted, recorded, rosterReads };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/splitstep/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = { matchId: "m-1", fileName: "final.mp4" };

async function call(h: Harness, body: unknown = VALID_BODY) {
  const res = await handleUploadUrl(post(body), h.deps);
  const json = (await res.json()) as {
    error?: string;
    uploadUrl?: string;
    videoObjectKey?: string;
  };
  // No response — allowed or refused — ever carries a signature.
  expect(JSON.stringify(json)).not.toContain("sig=");
  return { status: res.status, json };
}

function expectDenied(h: Harness, status: number, result: { status: number }) {
  expect(result.status).toBe(status);
  expect(h.minted).toEqual([]);
  expect(h.recorded).toEqual([]);
}

// ── Request shape and sign-in ─────────────────────────────────────────────

test("no session → 401 before anything else is read", async () => {
  const h = harness({ userId: null });
  const r = await call(h);
  expectDenied(h, 401, r);
  expect(h.rosterReads).toEqual([]);
});

test("malformed body and missing fields → 400", async () => {
  const h = harness({});
  expectDenied(h, 400, await call(h, "{not json"));
  expectDenied(h, 400, await call(h, { matchId: "m-1" }));
  expectDenied(h, 400, await call(h, { fileName: "x.mp4" }));
});

// ── Ownership ─────────────────────────────────────────────────────────────

test("a match that does not exist → 404", async () => {
  const h = harness({ match: null });
  expectDenied(h, 404, await call(h));
});

test("an existing match somebody else created → the same 404", async () => {
  const h = harness({ match: match({ created_by: OTHER_USER }) });
  const r = await call(h);
  expectDenied(h, 404, r);
  expect(r.json.error).toBe("No such match");
});

test("a match load failure → 500, nothing minted", async () => {
  const h = harness({ matchError: "connection reset" });
  expectDenied(h, 500, await call(h));
});

// ── The match's workspace, not the switcher's ─────────────────────────────

test("a match under a program the caller is not in → 403, the shared sentence", async () => {
  const h = harness({
    match: match({ program_id: OTHER_PROGRAM }),
    workspaces: [personal(), team()],
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toBe(NO_BILLING_WORKSPACE_REFUSAL);
  expect(h.rosterReads).toEqual([]);
});

test("the roster read is the match's program, whichever workspace is active", async () => {
  // Two team workspaces; the match belongs to the second. The handler never
  // sees an "active" workspace at all — it resolves from the match.
  const eastside = team({ id: OTHER_PROGRAM, name: "Eastside" });
  const h = harness({
    match: match({ program_id: OTHER_PROGRAM }),
    workspaces: [personal(), team(), eastside],
  });
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(h.rosterReads).toEqual([OTHER_PROGRAM]);
});

// ── Personal uploads keep minting ─────────────────────────────────────────

test("a personal match attributed to the uploader mints the stub credential", async () => {
  const h = harness({ match: match({ program_id: null, player1_id: VIEWER }) });
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(r.json.uploadUrl).toBe(STUB_URL);
  // `videoObjectKey()` names the blob, not the file: the extension is kept.
  expect(r.json.videoObjectKey).toBe("videos/u-coach/m-1/original.mp4");
  expect(h.minted).toEqual([r.json.videoObjectKey]);
  expect(h.recorded).toEqual([
    { matchId: "m-1", blobName: r.json.videoObjectKey },
  ]);
  // A personal workspace has no roster; none is read.
  expect(h.rosterReads).toEqual([]);
});

test("a personal match with no athlete on the row is still the uploader's", async () => {
  const h = harness({ match: match({ program_id: null, player1_id: null }) });
  expect((await call(h)).status).toBe(200);
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

// ── Valid roster uploads keep minting, new and existing ───────────────────

test("a coach's match for a claimed roster profile mints", async () => {
  const h = harness({ match: match({ player1_id: AVA.playerId }) });
  const r = await call(h);
  expect(r.status).toBe(200);
  expect(r.json.uploadUrl).toBe(STUB_URL);
  expect(h.minted).toHaveLength(1);
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

test("an existing match on a scheduled line, recorded by staff, mints", async () => {
  const h = harness({
    match: match({ player1_id: AVA.playerId, event_entry_id: "e-line-1" }),
  });
  expect((await call(h)).status).toBe(200);
});

test("an older row carrying the claimed player's login id is still that player", async () => {
  const h = harness({ match: match({ player1_id: AVA.userId! }) });
  expect((await call(h)).status).toBe(200);
});

test("a player sending their own match under 'everyone' with the switch on mints", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({ role: "player", myPlayerId: CAM.playerId }),
    ],
    match: match({ created_by: VIEWER, player1_id: CAM.playerId }),
  });
  expect((await call(h)).status).toBe(200);
});

// ── The guard this task adds: the row's athlete and the program's state ───

test("a pending program is refused before a credential exists — new match", async () => {
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

test("a pending program is refused for an existing line match too", async () => {
  const h = harness({
    workspaces: [
      personal(),
      team({ programStatus: "claim_pending", canSubmitVideo: false }),
    ],
    match: match({ event_entry_id: "e-line-1" }),
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toBe(PENDING_APPROVAL_NOTICE);
});

test("a suspended program → 403 with its own sentence, not the pending one", async () => {
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
  // `matches_block_client_regraft` lets it through, and `Workspace.myPlayerId`
  // is null for staff, so it is on no roster row either.
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

test("a roster that could not be read → 503 with a retry, nothing minted", async () => {
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

// ── The video question the route already asked, retained ──────────────────

test("a player whose 'Can send video' switch is off → 403", async () => {
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

test("a coach under an owner-only policy → 403", async () => {
  const h = harness({
    workspaces: [personal(), team({ uploadPolicy: "owner" })],
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toMatch(/limits uploads to owner only/);
});

test("a video seam refusal the contract did not catch still stops the mint", async () => {
  // `canSubmitVideo` false on an otherwise active-looking workspace: the
  // contract reads `programStatus` and passes; `explainVideoRefusal()` reads
  // the boolean and refuses. Both layers stay in place.
  const h = harness({
    workspaces: [personal(), team({ canSubmitVideo: false })],
  });
  const r = await call(h);
  expectDenied(h, 403, r);
  expect(r.json.error).toMatch(/still being confirmed/);
});

// ── After authorization ───────────────────────────────────────────────────

test("an unsupported container → 400, nothing minted", async () => {
  // Not `.avi` — that is an accepted container. The vendor takes anything
  // ffmpeg can decode, so the allowlist covers the common camera and phone
  // containers; this fixture has to be something genuinely outside it.
  const h = harness({});
  expectDenied(
    h,
    400,
    await call(h, { matchId: "m-1", fileName: "final.txt" }),
  );
});

test("a minter that throws (storage unconfigured) → 503", async () => {
  const h = harness({ mintThrows: true });
  const r = await call(h);
  expect(r.status).toBe(503);
  expect(h.recorded).toEqual([]);
});

// ── athleteOnRow ──────────────────────────────────────────────────────────

test("athleteOnRow: personal rows are self unless they name somebody else", () => {
  expect(athleteOnRow({ program_id: null, player1_id: null }, VIEWER)).toEqual({
    kind: "self",
  });
  expect(
    athleteOnRow({ program_id: null, player1_id: VIEWER }, VIEWER),
  ).toEqual({ kind: "self" });
  expect(
    athleteOnRow({ program_id: null, player1_id: OTHER_USER }, VIEWER),
  ).toEqual({
    kind: "roster",
    playerId: OTHER_USER,
  });
});

test("athleteOnRow: team rows name whoever the row names — the viewer's own login included", () => {
  expect(
    athleteOnRow({ program_id: PROGRAM, player1_id: null }, VIEWER),
  ).toBeNull();
  expect(
    athleteOnRow({ program_id: PROGRAM, player1_id: VIEWER }, VIEWER),
  ).toEqual({
    kind: "roster",
    playerId: VIEWER,
  });
});
