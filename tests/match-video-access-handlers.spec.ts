import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  planAlignment,
  type SourcePoint,
  type SourceShot,
} from "@/lib/match-video/alignment";
import {
  matchVideoError,
  type MatchVideoErrorCode,
} from "@/lib/match-video/types";
import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import {
  handleUpdateAlignment,
  parseUpdateAlignmentBody,
  type CorrectAlignmentInput,
  type CorrectedAlignment,
  type UpdateAlignmentDeps,
} from "@/lib/services/match-video/alignment";
import type { CleanupDeps } from "@/lib/services/match-video/cleanup";
import type { HttpResult } from "@/lib/services/match-video/http";
import {
  handleGetPlayback,
  type PlaybackAttachmentRow,
  type PlaybackDeps,
} from "@/lib/services/match-video/playback";
import {
  handleRemoveAttachment,
  type RemoveAttachmentDeps,
  type RemovedAttachment,
} from "@/lib/services/match-video/remove";
import type { Workspace } from "@/lib/workspace/types";

/**
 * `PATCH /api/matches/[matchId]/video/alignment` (T11), run against fakes.
 *
 * Every seam in `UpdateAlignmentDeps` is a stub: no session cookie, no
 * Supabase, no workspace lookup — and, the point of the whole endpoint, no
 * storage seam to stub, because the type has none. Nothing in this file
 * imports `storage.ts`, `probe.ts` or `@azure/storage-blob`, and the last
 * section asserts the route file does not either.
 *
 * `FakeCorrections` is an in-memory model of T4's
 * `match_video_correct_alignment`: match scoping, the active-state gate, the
 * expected-version CAS, then the offset recomputed from the source rows and
 * the SAVED verified duration through T1's `planAlignment` — the very
 * function the SQL is a twin of. Two things it records so the tests can
 * assert them rather than infer them: every row write, and the fact that the
 * imported source rows are frozen, so a write to one throws instead of
 * passing unnoticed.
 */

const SITE = "http://localhost:3000";
const CREATOR = randomUUID();
const OTHER_USER = randomUUID();
const PROGRAM = randomUUID();
const OTHER_PROGRAM = randomUUID();
const PERSONAL_MATCH = randomUUID();
const TEAM_MATCH = randomUUID();
const VENDOR_MATCH = randomUUID();
/** A SwingVision import whose final point has no duration. */
const UNTIMED_MATCH = randomUUID();

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const MATCHES: Record<string, VisibleMatchRow> = {
  [PERSONAL_MATCH]: {
    id: PERSONAL_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "swing-vision",
  },
  [TEAM_MATCH]: {
    id: TEAM_MATCH,
    created_by: CREATOR,
    program_id: PROGRAM,
    source_provider: "swing-vision",
  },
  [VENDOR_MATCH]: {
    id: VENDOR_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "splitstep",
  },
  [UNTIMED_MATCH]: {
    id: UNTIMED_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "swing-vision",
  },
};

/**
 * The anchor is the FIRST point by number, at ten source seconds; the final
 * point ends at 105. Frozen, because nothing in a correction may write them.
 */
const TIMED_POINTS: readonly SourcePoint[] = Object.freeze([
  Object.freeze({ pointNumber: 1, videoTime: 10, duration: 4 }),
  Object.freeze({ pointNumber: 2, videoTime: 40, duration: 6 }),
  Object.freeze({ pointNumber: 3, videoTime: 100, duration: 5 }),
]) as readonly SourcePoint[];

const TIMED_SHOTS: readonly SourceShot[] = Object.freeze([
  Object.freeze({ videoTime: 10.4 }),
  Object.freeze({ videoTime: 101.2 }),
]) as readonly SourceShot[];

/** Same match, but the last point has no duration: no known end at all. */
const UNTIMED_POINTS: readonly SourcePoint[] = Object.freeze([
  Object.freeze({ pointNumber: 1, videoTime: 10, duration: 4 }),
  Object.freeze({ pointNumber: 2, videoTime: 100, duration: null }),
]) as readonly SourcePoint[];

const ANCHOR_SECONDS = 10;
/** What the server measured when the file was published. Never re-probed. */
const VERIFIED_DURATION = 120;

function personal(userId: string): Pick<Workspace, "id" | "kind"> {
  return { id: userId, kind: "personal" };
}

function team(programId: string): Pick<Workspace, "id" | "kind"> {
  return { id: programId, kind: "team" };
}

function rpcRefusal(code: MatchVideoErrorCode, detail: string) {
  return { ok: false as const, error: matchVideoError(code, detail) };
}

/* -------------------------------------------------------------------------
 * In-memory T4
 * ---------------------------------------------------------------------- */

interface AttachmentRow {
  id: string;
  matchId: string;
  state: "pending" | "active" | "retired";
  version: number;
  offsetSeconds: number;
  confirmedVideoTimeSeconds: number;
  /** The duration saved at publication. The only one a correction may use. */
  verifiedDurationSeconds: number;
  contentType: string;
  filename: string;
}

class FakeCorrections {
  rows = new Map<string, AttachmentRow>();
  /** Every row this fake wrote, in order. Source tables never appear. */
  writes: string[] = [];

  /** The imported timeline, per match. Frozen — a write would throw. */
  source: Record<
    string,
    { points: readonly SourcePoint[]; shots: readonly SourceShot[] }
  > = {
    [PERSONAL_MATCH]: { points: TIMED_POINTS, shots: TIMED_SHOTS },
    [TEAM_MATCH]: { points: TIMED_POINTS, shots: TIMED_SHOTS },
    [VENDOR_MATCH]: { points: TIMED_POINTS, shots: TIMED_SHOTS },
    [UNTIMED_MATCH]: { points: UNTIMED_POINTS, shots: [] },
  };

  activate(
    matchId: string,
    overrides: Partial<AttachmentRow> = {},
  ): AttachmentRow {
    const confirmed = overrides.confirmedVideoTimeSeconds ?? 5;
    const row: AttachmentRow = {
      id: randomUUID(),
      matchId,
      state: "active",
      version: 1,
      confirmedVideoTimeSeconds: confirmed,
      offsetSeconds: ANCHOR_SECONDS - confirmed,
      verifiedDurationSeconds: VERIFIED_DURATION,
      contentType: "video/mp4",
      filename: "match.mp4",
      ...overrides,
    };
    this.rows.set(row.id, row);
    return row;
  }

  seed(matchId: string, state: "pending" | "retired"): AttachmentRow {
    const row = this.activate(matchId);
    row.state = state;
    return row;
  }

  /** T4's `match_video_correct_alignment`, predicate for predicate. */
  correct(input: CorrectAlignmentInput): HttpResult<CorrectedAlignment> {
    const row = this.rows.get(input.attachmentId);
    if (!row || row.matchId !== input.access.match.id) {
      return rpcRefusal("match_not_found", "no_such_attachment");
    }
    if (row.state !== "active") {
      return rpcRefusal("mode_conflict", `attachment_${row.state}`);
    }
    if (row.version !== input.expectedVersion) {
      return rpcRefusal("stale_attachment", "active_version_changed");
    }

    // From the source clock and the SAVED duration, every single time.
    const source = this.source[row.matchId];
    const plan = planAlignment({
      points: source.points,
      shots: source.shots,
      confirmedVideoTime: input.confirmedVideoTimeSeconds,
      videoDurationSeconds: row.verifiedDurationSeconds,
    });
    if (!plan.ok) return { ok: false, error: plan.error };

    if (
      row.confirmedVideoTimeSeconds === plan.value.confirmedVideoTimeSeconds &&
      row.offsetSeconds === plan.value.offsetSeconds
    ) {
      return { ok: true, value: this.toRpcRow(row, false) };
    }

    row.confirmedVideoTimeSeconds = plan.value.confirmedVideoTimeSeconds;
    row.offsetSeconds = plan.value.offsetSeconds;
    row.version += 1;
    this.writes.push(`match_video_attachments:${row.id}`);
    return { ok: true, value: this.toRpcRow(row, true) };
  }

  private toRpcRow(row: AttachmentRow, changed: boolean): CorrectedAlignment {
    return {
      attachment_id: row.id,
      version: row.version,
      offset_seconds: row.offsetSeconds,
      confirmed_video_time_seconds: row.confirmedVideoTimeSeconds,
      duration_seconds: row.verifiedDurationSeconds,
      content_type: row.contentType,
      filename: row.filename,
      changed,
    };
  }
}

/* -------------------------------------------------------------------------
 * Harness
 * ---------------------------------------------------------------------- */

interface Harness {
  deps: UpdateAlignmentDeps;
  events: string[];
  correctCalls: CorrectAlignmentInput[];
  store: FakeCorrections;
}

interface HarnessOptions {
  userId?: string | null;
  workspace?: Pick<Workspace, "id" | "kind"> | null;
  visible?: string[];
  readError?: string;
  store?: FakeCorrections;
  correct?: UpdateAlignmentDeps["correct"];
}

function harness(options: HarnessOptions = {}): Harness {
  const events: string[] = [];
  const correctCalls: CorrectAlignmentInput[] = [];
  const store = options.store ?? new FakeCorrections();
  const userId = options.userId === undefined ? CREATOR : options.userId;
  const workspace =
    options.workspace === undefined ? personal(CREATOR) : options.workspace;

  const deps: UpdateAlignmentDeps = {
    async currentUserId() {
      events.push("auth");
      return userId;
    },
    async loadVisibleMatch(matchId: string) {
      events.push(`read:${matchId}`);
      if (options.readError) return { match: null, error: options.readError };
      const row = MATCHES[matchId];
      const visible = options.visible
        ? options.visible.includes(matchId)
        : Boolean(row);
      return { match: visible ? row : null, error: null };
    },
    async activeWorkspace() {
      events.push("workspace");
      return workspace;
    },
    allowedOrigins: [SITE],
    async correct(input) {
      events.push("correct");
      correctCalls.push(input);
      if (options.correct) return options.correct(input);
      return store.correct(input);
    },
  };

  return { deps, events, correctCalls, store };
}

interface RequestOptions {
  origin?: string | null;
  contentType?: string | null;
  body?: string;
}

function patchRequest(
  matchId: string,
  body: unknown,
  options: RequestOptions = {},
): Request {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? SITE);
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  return new Request(`${SITE}/api/matches/${matchId}/video/alignment`, {
    method: "PATCH",
    headers,
    body: options.body ?? JSON.stringify(body),
  });
}

async function align(
  h: Harness,
  matchId: string,
  body: unknown,
  options?: RequestOptions,
) {
  const response = await handleUpdateAlignment(
    patchRequest(matchId, body, options),
    matchId,
    h.deps,
  );
  const json = (await response.json()) as Record<string, unknown>;
  return { response, json };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    attachmentId: randomUUID(),
    expectedVersion: 1,
    confirmedVideoTimeSeconds: 4,
    ...overrides,
  };
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

/** The refusal assertion: nothing was corrected and no row was written. */
function expectNoCorrection(h: Harness) {
  expect(h.events).not.toContain("correct");
  expect(h.correctCalls).toHaveLength(0);
  expect(h.store.writes).toEqual([]);
}

function attachmentOf(json: Record<string, unknown>) {
  return json.attachment as Record<string, unknown>;
}

/* =========================================================================
 * The edge
 * ====================================================================== */

test("a cross-origin correction is refused before anything is read", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
    { origin: "https://evil.example" },
  );
  expect(response.status).toBe(403);
  expect(json.code).toBe("cross_origin");
  expectNoStore(response);
  expect(h.events).toEqual([]);
  expectNoCorrection(h);
});

test("a correction with no Origin header is refused", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
    { origin: null },
  );
  expect(response.status).toBe(403);
  expect(json.detail).toBe("no_origin");
  expectNoCorrection(h);
});

test("a body that is not JSON is refused before access is asked", async () => {
  const h = harness();
  const { response, json } = await align(h, PERSONAL_MATCH, null, {
    contentType: "text/plain",
    body: "attachmentId=1",
  });
  expect(response.status).toBe(400);
  expect(json.code).toBe("invalid_request");
  expect(json.detail).toBe("content_type");
  expect(h.events).toEqual(["auth"]);
  expectNoCorrection(h);
});

test("an oversized body is refused without being buffered", async () => {
  const h = harness();
  const { response, json } = await align(h, PERSONAL_MATCH, null, {
    body: JSON.stringify({ attachmentId: "x".repeat(8192) }),
  });
  expect(response.status).toBe(413);
  expect(json.code).toBe("request_too_large");
  expectNoCorrection(h);
});

/* =========================================================================
 * Body shape — the three fields, strictly
 * ====================================================================== */

test("the body parser accepts exactly the three contract fields", () => {
  const id = randomUUID();
  const parsed = parseUpdateAlignmentBody({
    attachmentId: id.toUpperCase(),
    expectedVersion: 3,
    confirmedVideoTimeSeconds: "00:01:02.500",
  });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  // The id is normalised: a UUID that differs only in case is the same row.
  expect(parsed.value.attachmentId).toBe(id.toLowerCase());
  expect(parsed.value.expectedVersion).toBe(3);
  expect(parsed.value.confirmedVideoTimeSeconds).toBe(62.5);
});

test("a body field the server owns is refused by name, not ignored", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, offsetSeconds: 0 }),
  );
  expect(response.status).toBe(400);
  expect(json.detail).toBe("unexpected_field:offsetSeconds");
  expectNoCorrection(h);
  // And the saved alignment is exactly as it was.
  expect(row.offsetSeconds).toBe(ANCHOR_SECONDS - 5);
});

test("a missing expected version is refused rather than defaulted", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const body = validBody({ attachmentId: row.id });
  delete (body as Record<string, unknown>).expectedVersion;
  const { response, json } = await align(h, PERSONAL_MATCH, body);
  expect(response.status).toBe(400);
  expect(json.detail).toBe("expected_version_missing");
  expectNoCorrection(h);
});

test("a malformed attachment id is refused before access is asked", async () => {
  const h = harness();
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: "not-a-uuid" }),
  );
  expect(response.status).toBe(400);
  expect(json.detail).toBe("attachment_id");
  expect(h.events).toEqual(["auth"]);
  expectNoCorrection(h);
});

test("a malformed time is invalid_alignment, never the too-short copy", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, confirmedVideoTimeSeconds: "1:90:00" }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("invalid_alignment");
  expect(json.detail).toBe("confirmed_time_minutes_overflow");
  expect(json.error).toBe("Enter a time inside this video, as hh:mm:ss.sss.");
  expectNoCorrection(h);
});

/* =========================================================================
 * Access — visibility, then creator, then the exact workspace
 * ====================================================================== */

test("an expired session is refused before the body is read", async () => {
  const h = harness({ userId: null });
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(401);
  expect(json.code).toBe("unauthenticated");
  expectNoStore(response);
  expect(h.events).toEqual(["auth"]);
  expectNoCorrection(h);
});

test("an invisible match is a 404, not a 403", async () => {
  const h = harness({ visible: [] });
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: randomUUID() }),
  );
  expect(response.status).toBe(404);
  expect(json.code).toBe("match_not_found");
  expect(json.detail).toBe("not_visible");
  expectNoCorrection(h);
});

test("a visible noncreator is refused: watching is never permission to write", async () => {
  const h = harness({
    userId: OTHER_USER,
    workspace: personal(OTHER_USER),
  });
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(403);
  expect(json.code).toBe("forbidden");
  expect(json.detail).toBe("not_creator");
  expectNoStore(response);
  expectNoCorrection(h);
  // The creator's alignment is untouched.
  expect(row.version).toBe(1);
  expect(row.offsetSeconds).toBe(ANCHOR_SECONDS - 5);
});

test("a vendor-analysed match has no alignment to correct", async () => {
  const h = harness();
  const row = h.store.activate(VENDOR_MATCH);
  const { response, json } = await align(
    h,
    VENDOR_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(403);
  expect(json.detail).toBe("not_swingvision");
  expectNoCorrection(h);
});

test("a workspace switched since the editor opened refuses the correction", async () => {
  const h = harness({ workspace: team(PROGRAM) });
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(403);
  expect(json.code).toBe("workspace_mismatch");
  expect(json.detail).toBe("team_match_in_personal_workspace");
  expectNoCorrection(h);
});

test("a team match in another program's workspace is refused", async () => {
  const h = harness({ workspace: team(OTHER_PROGRAM) });
  const row = h.store.activate(TEAM_MATCH);
  const { response, json } = await align(
    h,
    TEAM_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(403);
  expect(json.detail).toBe("match_in_other_program");
  expectNoCorrection(h);
});

test("a team match in its own program's workspace is corrected", async () => {
  const h = harness({ workspace: team(PROGRAM) });
  const row = h.store.activate(TEAM_MATCH);
  const { response } = await align(
    h,
    TEAM_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(200);
  expect(h.correctCalls[0].access.workspace).toEqual({
    kind: "team",
    id: PROGRAM,
  });
});

test("a failed visibility read is a 503, not a 404", async () => {
  const h = harness({ readError: "connection reset" });
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: randomUUID() }),
  );
  expect(response.status).toBe(503);
  expect(json.code).toBe("storage_unavailable");
  expectNoCorrection(h);
});

/* =========================================================================
 * Correction — recomputed from the anchor and the SAVED duration
 * ====================================================================== */

test("a correction moves the offset and bumps the version, with no upload", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);

  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, confirmedVideoTimeSeconds: 4 }),
  );
  expect(response.status).toBe(200);
  expectNoStore(response);

  const attachment = attachmentOf(json);
  expect(attachment.id).toBe(row.id);
  expect(attachment.version).toBe(2);
  // anchor (10) - confirmed (4).
  expect(attachment.offsetSeconds).toBe(6);
  expect(attachment.confirmedVideoTimeSeconds).toBe(4);
  // The duration is the one saved at publication; nothing re-probed it.
  expect(attachment.durationSeconds).toBe(VERIFIED_DURATION);
  expect(attachment.contentType).toBe("video/mp4");
  expect(attachment.filename).toBe("match.mp4");

  // Exactly one row written, and it is the attachment.
  expect(h.store.writes).toEqual([`match_video_attachments:${row.id}`]);
  // No upload credential, key or URL anywhere in the answer.
  expect(JSON.stringify(json)).not.toContain("sig=");
  expect(json).not.toHaveProperty("uploadUrl");
  expect(json).not.toHaveProperty("playbackUrl");
});

test("a no-op correction leaves the version alone", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH, {
    confirmedVideoTimeSeconds: 5,
  });

  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, confirmedVideoTimeSeconds: 5 }),
  );
  expect(response.status).toBe(200);
  const attachment = attachmentOf(json);
  // `changed = false` in T4: a second tab holding version 1 stays valid.
  expect(attachment.version).toBe(1);
  expect(attachment.offsetSeconds).toBe(5);
  expect(h.store.writes).toEqual([]);
  expect(row.version).toBe(1);
});

test("a no-op stated as a clock string is still a no-op", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH, {
    confirmedVideoTimeSeconds: 5,
  });
  const { json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      confirmedVideoTimeSeconds: "00:00:05.000",
    }),
  );
  expect(attachmentOf(json).version).toBe(1);
  expect(h.store.writes).toEqual([]);
});

test("repeated corrections never accumulate the offset", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH, {
    confirmedVideoTimeSeconds: 5,
  });

  // Nudge earlier, then later, then back to the first position. If the
  // offset were adjusted by a delta instead of recomputed from the anchor,
  // the last answer would not be the first one again.
  const first = await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 1,
      confirmedVideoTimeSeconds: 4,
    }),
  );
  expect(attachmentOf(first.json).offsetSeconds).toBe(6);
  expect(attachmentOf(first.json).version).toBe(2);

  const second = await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 2,
      confirmedVideoTimeSeconds: 8,
    }),
  );
  expect(attachmentOf(second.json).offsetSeconds).toBe(2);
  expect(attachmentOf(second.json).version).toBe(3);

  const third = await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 3,
      confirmedVideoTimeSeconds: 4,
    }),
  );
  // Identical to the first correction: derived, not accumulated.
  expect(attachmentOf(third.json).offsetSeconds).toBe(6);
  expect(attachmentOf(third.json).confirmedVideoTimeSeconds).toBe(4);
  expect(attachmentOf(third.json).version).toBe(4);

  // Three writes, three versions, one row — and the duration never moved.
  expect(h.store.writes).toHaveLength(3);
  expect(row.verifiedDurationSeconds).toBe(VERIFIED_DURATION);
});

test("correcting back to the original position is a no-op again", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH, {
    confirmedVideoTimeSeconds: 5,
  });
  await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 1,
      confirmedVideoTimeSeconds: 4,
    }),
  );
  await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 2,
      confirmedVideoTimeSeconds: 5,
    }),
  );
  const repeat = await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 3,
      confirmedVideoTimeSeconds: 5,
    }),
  );
  expect(attachmentOf(repeat.json).version).toBe(3);
  expect(h.store.writes).toHaveLength(2);
});

/* =========================================================================
 * Refusals from inside the transaction
 * ====================================================================== */

test("a stale expected version is a 409, and the row does not move", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  // A second tab corrected it first.
  await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 1,
      confirmedVideoTimeSeconds: 4,
    }),
  );

  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({
      attachmentId: row.id,
      expectedVersion: 1,
      confirmedVideoTimeSeconds: 7,
    }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("stale_attachment");
  expect(json.detail).toBe("active_version_changed");
  expect(json.error).toBe("The video changed. Reload and try again.");
  expectNoStore(response);
  expect(row.version).toBe(2);
  expect(row.offsetSeconds).toBe(6);
  expect(h.store.writes).toHaveLength(1);
});

test("an attachment belonging to another match is not found", async () => {
  const h = harness();
  const row = h.store.activate(TEAM_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(404);
  expect(json.detail).toBe("no_such_attachment");
  expect(h.store.writes).toEqual([]);
});

test("a pending attempt has no alignment to correct", async () => {
  const h = harness();
  const row = h.store.seed(PERSONAL_MATCH, "pending");
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("mode_conflict");
  expect(json.detail).toBe("attachment_pending");
  expect(h.store.writes).toEqual([]);
});

test("a retired attachment is never re-aligned", async () => {
  const h = harness();
  const row = h.store.seed(PERSONAL_MATCH, "retired");
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(409);
  expect(json.detail).toBe("attachment_retired");
});

test("only insufficient coverage says the video is not long enough", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  // The final point ends at source 105. Confirming the first serve at 30
  // puts that end at 125, past the 120-second file.
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, confirmedVideoTimeSeconds: 30 }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("insufficient_coverage");
  expect(json.detail).toBe("coverage_past_end");
  expect(json.error).toBe("This video is not long enough.");
  expect(h.store.writes).toEqual([]);
  expect(row.version).toBe(1);
});

test("a match with no usable timing says so, not that the file is short", async () => {
  const h = harness();
  const row = h.store.activate(UNTIMED_MATCH);
  const { response, json } = await align(
    h,
    UNTIMED_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("missing_source_timing");
  expect(json.detail).toBe("missing_final_point_duration");
  expect(json.error).toBe(
    "This match is missing the timing data needed to align a video.",
  );
  expect(json.error).not.toContain("long enough");
});

test("a time past the end of the file is invalid_alignment, not coverage", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, confirmedVideoTimeSeconds: 200 }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("invalid_alignment");
  expect(json.detail).toBe("confirmed_time_past_end");
  expect(json.error).not.toContain("long enough");
});

test("a seam that throws answers 500 and leaves the alignment saved", async () => {
  const h = harness({
    correct() {
      throw new Error("connection reset");
    },
  });
  const row = h.store.activate(PERSONAL_MATCH);
  const { response, json } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id }),
  );
  expect(response.status).toBe(500);
  expect(json.code).toBe("internal_error");
  expectNoStore(response);
  expect(row.version).toBe(1);
  expect(row.offsetSeconds).toBe(ANCHOR_SECONDS - 5);
});

/* =========================================================================
 * No upload, no source-row write — structurally
 * ====================================================================== */

test("correction has no storage seam to upload through", async () => {
  const h = harness();
  // `UpdateAlignmentDeps` is the complete list of what this path may call.
  // There is no signer, no blob client, no probe and no copy in it.
  expect(Object.keys(h.deps).sort()).toEqual([
    "activeWorkspace",
    "allowedOrigins",
    "correct",
    "currentUserId",
    "loadVisibleMatch",
  ]);
});

test("the alignment route file imports no storage module", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "src/app/api/matches/[matchId]/video/alignment/route.ts",
    "utf8",
  );
  expect(source).not.toContain("match-video/storage");
  expect(source).not.toContain("match-video/probe");
  expect(source).not.toContain("@azure/storage-blob");
  expect(source).not.toContain("azure-sas");
});

test("the alignment service module reaches no storage module", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "src/lib/services/match-video/alignment.ts",
    "utf8",
  );
  const imports = source.matchAll(/from\s+"([^"]+)"/g);
  for (const [, specifier] of imports) {
    expect(specifier).not.toContain("storage");
    expect(specifier).not.toContain("probe");
    expect(specifier).not.toContain("azure");
  }
});

test("a correction writes no imported source row", async () => {
  const h = harness();
  const row = h.store.activate(PERSONAL_MATCH);
  const before = JSON.stringify(h.store.source[PERSONAL_MATCH]);

  const { response } = await align(
    h,
    PERSONAL_MATCH,
    validBody({ attachmentId: row.id, confirmedVideoTimeSeconds: 4 }),
  );
  expect(response.status).toBe(200);

  // The imported timeline is byte-identical, and frozen besides: the points
  // and shots this offset was derived from cannot have been rewritten, in
  // this fake or in T4, whose migration asserts the same over the SQL.
  expect(JSON.stringify(h.store.source[PERSONAL_MATCH])).toBe(before);
  expect(Object.isFrozen(h.store.source[PERSONAL_MATCH].points)).toBe(true);
  expect(Object.isFrozen(h.store.source[PERSONAL_MATCH].points[0])).toBe(true);
  expect(Object.isFrozen(h.store.source[PERSONAL_MATCH].shots[0])).toBe(true);
  // Every write this path made names the attachment table, nothing else.
  expect(
    h.store.writes.every((w) => w.startsWith("match_video_attachments:")),
  ).toBe(true);
});

test("the migration forbids source-row writes in the correction function", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(
    "supabase/migrations/20260919052002_match_video_attachment_activation.sql",
    "utf8",
  );
  // The assertion block T4 ships covers `match_video_correct_alignment` by
  // name; if it is ever dropped from that list, this test says so.
  const assertion = sql.slice(sql.indexOf("-- 7. Assertions"));
  expect(assertion).toContain("match_video_correct_alignment");
  expect(assertion).toContain("writes an imported-data table");
});

/* =========================================================================
 * `GET /api/matches/[matchId]/video` (T12) — the playback half of step 8
 *
 * The same access module, asked the OTHER question. Every test below drives
 * `handleGetPlayback` through `PlaybackDeps`, whose seams are a row read, a
 * blob existence check and a read-only signer — there is no upload seam to
 * stub, and the last section proves it of the serialized response as well as
 * of the type.
 * ====================================================================== */

const FINAL_KEY = `match-video/${PERSONAL_MATCH}/final.mp4`;
const STAGED_KEY = `match-video/${PERSONAL_MATCH}/staged.mp4`;
/** What a read-only SAS looks like: `sp=r`, never `sp=cw`. */
const READ_SAS = `https://acct.blob.core.windows.net/videos/${FINAL_KEY}?sp=r&sig=READONLY`;

interface PlaybackRowState {
  row: PlaybackAttachmentRow;
  /** Whether the final object is actually in storage. */
  objectPresent: boolean;
}

class FakePlayback {
  /** At most one active row per match, exactly as the partial index allows. */
  active = new Map<string, PlaybackRowState>();
  /** Rows that exist but are not active. A viewer must never see these. */
  inactive: PlaybackAttachmentRow[] = [];
  reads: string[] = [];
  minted: string[] = [];

  publish(
    matchId: string,
    overrides: Partial<PlaybackAttachmentRow> = {},
  ): PlaybackAttachmentRow {
    const row: PlaybackAttachmentRow = {
      id: randomUUID(),
      version: 1,
      offset_seconds: ANCHOR_SECONDS - 5,
      confirmed_video_time_seconds: 5,
      verified_duration_seconds: VERIFIED_DURATION,
      verified_content_type: "video/mp4",
      filename: "match.mp4",
      final_blob_key: FINAL_KEY,
      ...overrides,
    };
    this.active.set(matchId, { row, objectPresent: true });
    return row;
  }

  /** A pending or retired attempt: present in the table, absent from playback. */
  seedInactive(matchId: string): PlaybackAttachmentRow {
    const row = this.publish(matchId);
    this.active.delete(matchId);
    this.inactive.push(row);
    return row;
  }
}

interface PlaybackHarness {
  deps: PlaybackDeps;
  events: string[];
  store: FakePlayback;
}

interface PlaybackHarnessOptions {
  userId?: string | null;
  workspace?: Pick<Workspace, "id" | "kind"> | null;
  visible?: string[];
  readError?: string;
  store?: FakePlayback;
  loadActiveAttachment?: PlaybackDeps["loadActiveAttachment"];
  finalObjectExists?: PlaybackDeps["finalObjectExists"];
  mintPlayback?: PlaybackDeps["mintPlayback"];
}

function playbackHarness(
  options: PlaybackHarnessOptions = {},
): PlaybackHarness {
  const events: string[] = [];
  const store = options.store ?? new FakePlayback();
  const userId = options.userId === undefined ? CREATOR : options.userId;
  const workspace =
    options.workspace === undefined ? personal(CREATOR) : options.workspace;

  const deps: PlaybackDeps = {
    async currentUserId() {
      events.push("auth");
      return userId;
    },
    async loadVisibleMatch(matchId: string) {
      events.push(`read:${matchId}`);
      if (options.readError) return { match: null, error: options.readError };
      const row = MATCHES[matchId];
      const visible = options.visible
        ? options.visible.includes(matchId)
        : Boolean(row);
      return { match: visible ? row : null, error: null };
    },
    async activeWorkspace() {
      // Playback never asks this. The tests assert the event never appears.
      events.push("workspace");
      return workspace;
    },
    async loadActiveAttachment(matchId) {
      events.push("load");
      store.reads.push(matchId);
      if (options.loadActiveAttachment) {
        return options.loadActiveAttachment(matchId);
      }
      const state = store.active.get(matchId);
      return { ok: true as const, value: state ? state.row : null };
    },
    async finalObjectExists(row) {
      events.push("head");
      if (options.finalObjectExists) return options.finalObjectExists(row);
      const state = [...store.active.values()].find(
        (candidate) => candidate.row.id === row.id,
      );
      return { ok: true as const, value: state?.objectPresent ?? false };
    },
    mintPlayback(row) {
      events.push("mint");
      if (options.mintPlayback) return options.mintPlayback(row);
      store.minted.push(row.final_blob_key);
      return {
        ok: true as const,
        value: {
          playbackUrl: READ_SAS,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      };
    },
  };

  return { deps, events, store };
}

async function watch(h: PlaybackHarness, matchId: string) {
  const request = new Request(`${SITE}/api/matches/${matchId}/video`, {
    method: "GET",
  });
  const response = await handleGetPlayback(request, matchId, h.deps);
  const text = await response.text();
  return {
    response,
    text,
    json: JSON.parse(text) as Record<string, unknown>,
  };
}

/** No credential, no key, no write verb — asserted on the raw body text. */
function expectNoUploadCredential(text: string) {
  expect(text).not.toContain("uploadUrl");
  expect(text).not.toContain("uploadExpiresAt");
  expect(text).not.toContain(STAGED_KEY);
  expect(text).not.toContain("staged");
  // `sp=` is the SAS permission set. A write credential carries `cw`.
  expect(text).not.toContain("sp=cw");
  expect(text).not.toContain("sp=rcw");
  expect(text).not.toContain("sp=w");
}

/* -------------------------------------------------------------------------
 * Access — who may watch
 * ---------------------------------------------------------------------- */

test("playback refuses an expired session before reading anything", async () => {
  const h = playbackHarness({ userId: null });
  h.store.publish(PERSONAL_MATCH);
  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(401);
  expect(json.code).toBe("unauthenticated");
  expect(json.detail).toBe("no_session");
  expectNoStore(response);
  expect(h.events).not.toContain("load");
  expect(h.events).not.toContain("mint");
});

test("playback of an inaccessible match is a 404, and names no attachment", async () => {
  const h = playbackHarness({ userId: OTHER_USER, visible: [] });
  h.store.publish(PERSONAL_MATCH);
  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(404);
  expect(json.code).toBe("match_not_found");
  expect(json.detail).toBe("not_visible");
  // Absent and invisible answer alike, and neither leaks that a video exists.
  expect(h.store.reads).toEqual([]);
  expect(h.events).not.toContain("mint");
});

test("a malformed match id is refused before the attachment table is touched", async () => {
  const h = playbackHarness();
  const { response, json } = await watch(h, "not-a-uuid");
  expect(response.status).toBe(404);
  expect(json.detail).toBe("malformed_match_id");
  expect(h.store.reads).toEqual([]);
});

test("a failed visibility read is a 503, not an empty match", async () => {
  const h = playbackHarness({ readError: "connection reset" });
  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(503);
  expect(json.code).toBe("storage_unavailable");
  expect(json.detail).toBe("match_read_failed");
  expect(json).not.toHaveProperty("attachment");
  expect(h.store.reads).toEqual([]);
});

test("a visible noncreator may watch, and still may not write", async () => {
  // One person, one match, two questions. This is the distinction the whole
  // access module exists to draw: a teammate who can SEE a match gets its
  // video; the same teammate gets 403 from every route that changes it.
  const store = new FakePlayback();
  const row = store.publish(TEAM_MATCH);
  const viewer = playbackHarness({
    userId: OTHER_USER,
    workspace: personal(OTHER_USER),
    visible: [TEAM_MATCH],
    store,
  });

  const watched = await watch(viewer, TEAM_MATCH);
  expect(watched.response.status).toBe(200);
  const playable = attachmentOf(watched.json);
  expect(playable.id).toBe(row.id);
  expect(playable.playbackUrl).toBe(READ_SAS);
  expectNoUploadCredential(watched.text);

  // The same identity, against the mutation half of step 8.
  const writer = harness({
    userId: OTHER_USER,
    workspace: personal(OTHER_USER),
    visible: [TEAM_MATCH],
  });
  const aligning = writer.store.activate(TEAM_MATCH);
  const refused = await align(
    writer,
    TEAM_MATCH,
    validBody({ attachmentId: aligning.id }),
  );
  expect(refused.response.status).toBe(403);
  expect(refused.json.code).toBe("forbidden");
  expect(refused.json.detail).toBe("not_creator");
  expectNoCorrection(writer);
});

test("playback never asks which workspace is active", async () => {
  // A coach looking at a team match from their personal workspace is watching,
  // not writing: the workspace rule belongs to mutations, and asking it here
  // would blank the player for anyone who had switched.
  const h = playbackHarness({
    userId: OTHER_USER,
    workspace: personal(OTHER_USER),
    visible: [TEAM_MATCH],
  });
  h.store.publish(TEAM_MATCH);
  const { response } = await watch(h, TEAM_MATCH);
  expect(response.status).toBe(200);
  expect(h.events).not.toContain("workspace");
});

/* -------------------------------------------------------------------------
 * The empty answer
 * ---------------------------------------------------------------------- */

test("a match with no video answers 200 and a null attachment", async () => {
  const h = playbackHarness();
  const { response, json, text } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(200);
  expect(json).toEqual({ attachment: null });
  expectNoStore(response);
  // Not an error, and not a suggestion to make one: no mode, no reservation
  // hint, no credential — nothing a client could read as "create a second".
  expect(json).not.toHaveProperty("error");
  expect(json).not.toHaveProperty("code");
  expect(json).not.toHaveProperty("mode");
  expect(json).not.toHaveProperty("canUpload");
  expect(json).not.toHaveProperty("attachmentId");
  expectNoUploadCredential(text);
  expect(h.events).not.toContain("mint");
});

test("a pending or retired attempt is not playable and is not disclosed", async () => {
  const h = playbackHarness();
  const hidden = h.store.seedInactive(PERSONAL_MATCH);
  const { response, json, text } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(200);
  expect(json).toEqual({ attachment: null });
  // Someone else's in-progress upload is not a viewer's business.
  expect(text).not.toContain(hidden.id);
});

/* -------------------------------------------------------------------------
 * The populated answer, and the refresh contract
 * ---------------------------------------------------------------------- */

test("playback returns id, version, duration, offset, URL and expiry", async () => {
  const h = playbackHarness();
  const row = h.store.publish(PERSONAL_MATCH, {
    confirmed_video_time_seconds: 4,
    offset_seconds: 6,
    filename: "quarterfinal.mp4",
  });

  const { response, json, text } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(200);
  expectNoStore(response);

  const attachment = attachmentOf(json);
  expect(attachment.id).toBe(row.id);
  expect(attachment.version).toBe(1);
  expect(attachment.offsetSeconds).toBe(6);
  expect(attachment.confirmedVideoTimeSeconds).toBe(4);
  // The duration measured at publication — nothing re-probes a played file.
  expect(attachment.durationSeconds).toBe(VERIFIED_DURATION);
  expect(attachment.contentType).toBe("video/mp4");
  expect(attachment.filename).toBe("quarterfinal.mp4");
  expect(attachment.playbackUrl).toBe(READ_SAS);
  expect(Date.parse(attachment.playbackExpiresAt as string)).toBeGreaterThan(
    Date.now(),
  );
  expectNoUploadCredential(text);
  // Only the final key was ever signed.
  expect(h.store.minted).toEqual([FINAL_KEY]);
});

test("a replaced video changes the id; a corrected one only the version", async () => {
  const h = playbackHarness();
  const first = h.store.publish(PERSONAL_MATCH);
  const before = attachmentOf((await watch(h, PERSONAL_MATCH)).json);

  // An alignment correction: same row, same bytes, higher version. A client
  // holding `before` keeps its source and shifts its timeline.
  h.store.active.get(PERSONAL_MATCH)!.row.version = 2;
  h.store.active.get(PERSONAL_MATCH)!.row.offset_seconds = 6;
  const corrected = attachmentOf((await watch(h, PERSONAL_MATCH)).json);
  expect(corrected.id).toBe(before.id);
  expect(corrected.version).toBe(2);
  expect(corrected.offsetSeconds).toBe(6);

  // A replacement: a different row entirely. The player must reload its src.
  const second = h.store.publish(PERSONAL_MATCH);
  const replaced = attachmentOf((await watch(h, PERSONAL_MATCH)).json);
  expect(replaced.id).toBe(second.id);
  expect(replaced.id).not.toBe(first.id);
});

/* -------------------------------------------------------------------------
 * Storage — a vanished object and an unreachable store are different answers
 * ---------------------------------------------------------------------- */

test("an active attachment whose blob is gone is a 409, never a null attachment", async () => {
  const h = playbackHarness();
  h.store.publish(PERSONAL_MATCH);
  h.store.active.get(PERSONAL_MATCH)!.objectPresent = false;

  const { response, json, text } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(409);
  expect(json.code).toBe("stale_attachment");
  expect(json.detail).toBe("final_object_missing");
  expectNoStore(response);
  // Not `{attachment: null}`: telling a creator their active match has no
  // video is exactly the answer that gets a duplicate uploaded over it.
  expect(json).not.toHaveProperty("attachment");
  expect(h.store.minted).toEqual([]);
  expectNoUploadCredential(text);
});

test("a storage outage is a 503, and says something different from a missing blob", async () => {
  const h = playbackHarness({
    async finalObjectExists() {
      return {
        ok: false,
        error: matchVideoError("storage_unavailable", "properties_failed"),
      };
    },
  });
  h.store.publish(PERSONAL_MATCH);

  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(503);
  expect(json.code).toBe("storage_unavailable");
  expect(json.detail).toBe("properties_failed");
  // Retryable, and distinct from the 409 above in status, code and copy.
  expect(json.error).not.toBe(matchVideoError("stale_attachment", "x").message);
  expect(h.store.minted).toEqual([]);
});

test("a signer that cannot sign is a 503, not a URL that will not play", async () => {
  const h = playbackHarness({
    mintPlayback() {
      return {
        ok: false,
        error: matchVideoError("storage_unavailable", "storage_not_configured"),
      };
    },
  });
  h.store.publish(PERSONAL_MATCH);
  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(503);
  expect(json.detail).toBe("storage_not_configured");
  expect(json).not.toHaveProperty("attachment");
});

test("a failed attachment read is a 500, distinct from a missing video", async () => {
  const h = playbackHarness({
    async loadActiveAttachment() {
      return {
        ok: false,
        error: {
          code: "internal_error" as const,
          status: 500,
          message: "Something went wrong on our side. Try again in a moment.",
          detail: "attachment_read_failed",
        },
      };
    },
  });
  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(500);
  expect(json.detail).toBe("attachment_read_failed");
  expect(json).not.toHaveProperty("attachment");
});

test("a seam that throws answers 500 rather than a half-built body", async () => {
  const h = playbackHarness({
    async loadActiveAttachment() {
      throw new Error("connection reset");
    },
  });
  const { response, json } = await watch(h, PERSONAL_MATCH);
  expect(response.status).toBe(500);
  expect(json.code).toBe("internal_error");
  expect(json.detail).toBe("unhandled");
  expectNoStore(response);
});

/* -------------------------------------------------------------------------
 * No write credential — structurally
 * ---------------------------------------------------------------------- */

test("playback has no seam that could produce an upload credential", async () => {
  const h = playbackHarness();
  // `PlaybackDeps` is the complete list. A row read, one properties call, one
  // read-only signature — and `activeWorkspace`, which it never consults.
  expect(Object.keys(h.deps).sort()).toEqual([
    "activeWorkspace",
    "currentUserId",
    "finalObjectExists",
    "loadActiveAttachment",
    "loadVisibleMatch",
    "mintPlayback",
  ]);
});

test("the playback service module never reaches the upload signer", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "src/lib/services/match-video/playback.ts",
    "utf8",
  );
  // The two things that mint or name a writable object.
  expect(source).not.toContain("mintAttachmentUploadCredential");
  expect(source).not.toContain("mintUploadSas");
  expect(source).not.toContain("beginPublication");
  // The staged key appears only as the word in prose, never as a column read.
  expect(source).not.toContain("row.staged_blob_key");
});

test("the playback route exposes GET, the removal DELETE, and no creator write", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "src/app/api/matches/[matchId]/video/route.ts",
    "utf8",
  );
  expect(source).toContain("export async function GET");
  // T5: removal is the one write here, and it is not the creator gate.
  expect(source).toContain("export async function DELETE");
  for (const verb of ["POST", "PUT", "PATCH"]) {
    expect(source).not.toContain(`export async function ${verb}`);
  }
  expect(source).not.toContain("authorizeMatchVideoMutation");
  expect(source).toContain("matchVideoAccessDeps");
  expect(source).toContain("matchVideoRemovalAccessDeps");
  expect(source).toContain("handleRemoveAttachment");
});

/* =========================================================================
 * DELETE /api/matches/[matchId]/video — removing an active video (T5)
 *
 * `FakeRemovals` is an in-memory twin of `match_video_remove_attachment`:
 * rows found by `id AND match_id`, the uploader-or-program-lead rule against
 * a `program_members` map, pending refused, retired returned as it stands,
 * active retired with `retired_reason = 'removed'`. The access half reads the
 * same map through `loadProgramRole`, so the two layers are asked the same
 * question — and one test drifts them apart on purpose to prove the RPC's
 * refusal still reaches the caller.
 *
 * Visibility is modelled the way RLS answers it: a team match is visible to
 * members of ITS program; a personal match to its creator only.
 * ====================================================================== */

const R_PROGRAM = randomUUID();
const R_OTHER_PROGRAM = randomUUID();
const R_OWNER = randomUUID();
const R_COACH = randomUUID();
const R_STAFF = randomUUID();
const R_PLAYER = randomUUID();
const R_TEAMMATE = randomUUID();
const R_OTHER_COACH = randomUUID();
const R_STRANGER = randomUUID();
/** Created (and uploaded to) by R_PLAYER. */
const R_PLAYER_MATCH = randomUUID();
/** Created (and uploaded to) by R_TEAMMATE. */
const R_TEAMMATE_MATCH = randomUUID();
/** Created (and uploaded to) by R_STAFF. */
const R_STAFF_MATCH = randomUUID();
/** R_PLAYER's personal match. */
const R_PERSONAL_MATCH = randomUUID();

const R_MATCHES: Record<string, VisibleMatchRow> = {
  [R_PLAYER_MATCH]: {
    id: R_PLAYER_MATCH,
    created_by: R_PLAYER,
    program_id: R_PROGRAM,
    source_provider: "swing-vision",
  },
  [R_TEAMMATE_MATCH]: {
    id: R_TEAMMATE_MATCH,
    created_by: R_TEAMMATE,
    program_id: R_PROGRAM,
    source_provider: "swing-vision",
  },
  [R_STAFF_MATCH]: {
    id: R_STAFF_MATCH,
    created_by: R_STAFF,
    program_id: R_PROGRAM,
    source_provider: "swing-vision",
  },
  [R_PERSONAL_MATCH]: {
    id: R_PERSONAL_MATCH,
    created_by: R_PLAYER,
    program_id: null,
    source_provider: "swing-vision",
  },
};

type MemberRole = "owner" | "coach" | "staff" | "player";

interface RemovalRow {
  id: string;
  match_id: string;
  uploaded_by: string | null;
  state: "pending" | "active" | "retired";
  retired_reason: string | null;
  retired_at: string | null;
}

class FakeRemovals {
  /** program id → user id → role. */
  members = new Map<string, Map<string, MemberRole>>([
    [
      R_PROGRAM,
      new Map<string, MemberRole>([
        [R_OWNER, "owner"],
        [R_COACH, "coach"],
        [R_STAFF, "staff"],
        [R_PLAYER, "player"],
        [R_TEAMMATE, "player"],
      ]),
    ],
    [R_OTHER_PROGRAM, new Map<string, MemberRole>([[R_OTHER_COACH, "coach"]])],
  ]);
  rows = new Map<string, RemovalRow>();
  /** Every RPC call, by attachment id. */
  calls: string[] = [];

  seed(
    matchId: string,
    uploadedBy: string,
    state: RemovalRow["state"] = "active",
  ): RemovalRow {
    const row: RemovalRow = {
      id: randomUUID(),
      match_id: matchId,
      uploaded_by: uploadedBy,
      state,
      retired_reason: null,
      retired_at: state === "retired" ? new Date().toISOString() : null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  roleOf(programId: string, userId: string): MemberRole | null {
    return this.members.get(programId)?.get(userId) ?? null;
  }

  visibleTo(userId: string, matchId: string): boolean {
    const match = R_MATCHES[matchId];
    if (!match) return false;
    if (match.created_by === userId) return true;
    return (
      match.program_id !== null &&
      this.roleOf(match.program_id, userId) !== null
    );
  }

  /** The SQL function, rule for rule. */
  remove(
    actorId: string,
    matchId: string,
    attachmentId: string,
  ): HttpResult<RemovedAttachment> {
    this.calls.push(attachmentId);
    const match = R_MATCHES[matchId];
    if (!match) return rpcRefusal("match_not_found", "no_such_match");
    const row = this.rows.get(attachmentId);
    if (!row || row.match_id !== matchId) {
      return rpcRefusal("match_not_found", "no_such_attachment");
    }
    const role =
      match.program_id === null ? null : this.roleOf(match.program_id, actorId);
    if (row.uploaded_by !== actorId && role !== "owner" && role !== "coach") {
      return rpcRefusal("forbidden", "not_uploader_or_program_lead");
    }
    if (row.state === "pending") {
      return rpcRefusal("mode_conflict", "attachment_pending");
    }
    if (row.state === "active") {
      row.state = "retired";
      row.retired_reason = "removed";
      row.retired_at = new Date().toISOString();
    }
    return {
      ok: true,
      value: {
        id: row.id,
        state: row.state,
        retired_reason: row.retired_reason,
      },
    };
  }
}

interface RemovalHarness {
  deps: RemoveAttachmentDeps;
  events: string[];
  store: FakeRemovals;
}

function removalHarness(
  userId: string | null,
  options: {
    store?: FakeRemovals;
    /** Replaces the access layer's role read — to drift it from the RPC's. */
    roleOverride?: MemberRole | null;
    scheduleThrows?: boolean;
  } = {},
): RemovalHarness {
  const events: string[] = [];
  const store = options.store ?? new FakeRemovals();

  // The worker's database seam: records that the run happened and claims
  // nothing, so no storage call is ever made.
  const cleanup: CleanupDeps = {
    database: {
      async claim() {
        events.push("claim");
        return { ok: true as const, value: [] };
      },
      async confirm() {
        throw new Error("nothing was claimed");
      },
      async fail() {
        throw new Error("nothing was claimed");
      },
    },
    storage: {
      pendingCopyAt: () => Promise.reject(new Error("no storage in a spec")),
      abortPublication: () => Promise.reject(new Error("no storage in a spec")),
      deleteStaged: () => Promise.reject(new Error("no storage in a spec")),
      deleteFinal: () => Promise.reject(new Error("no storage in a spec")),
    },
  };

  const deps: RemoveAttachmentDeps = {
    allowedOrigins: [SITE],
    async currentUserId() {
      events.push("auth");
      return userId;
    },
    async loadVisibleMatch(matchId) {
      events.push(`read:${matchId}`);
      const visible = userId !== null && store.visibleTo(userId, matchId);
      return { match: visible ? R_MATCHES[matchId] : null, error: null };
    },
    async activeWorkspace() {
      // Removal is not workspace-exact. The tests assert this never runs.
      events.push("workspace");
      return null;
    },
    async loadAttachmentUploader(matchId, attachmentId) {
      events.push("attachment");
      const row = store.rows.get(attachmentId);
      return {
        attachment:
          row && row.match_id === matchId
            ? { uploaded_by: row.uploaded_by }
            : null,
        error: null,
      };
    },
    async loadProgramRole(programId, actorId) {
      events.push("role");
      expect(actorId).toBe(userId);
      const role =
        options.roleOverride !== undefined
          ? options.roleOverride
          : store.roleOf(programId, actorId);
      return { role, error: null };
    },
    async remove(access) {
      events.push("remove");
      return store.remove(
        access.actor.id,
        access.match.id,
        access.attachmentId,
      );
    },
    cleanup,
    async schedule(task) {
      events.push("schedule");
      if (options.scheduleThrows) throw new Error("no request scope");
      await task();
    },
  };

  return { deps, events, store };
}

async function removeVideo(
  h: RemovalHarness,
  matchId: string,
  body: unknown,
  init: { origin?: string | null; contentType?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": init.contentType ?? "application/json",
  };
  if (init.origin !== null) headers.origin = init.origin ?? SITE;
  const request = new Request(`${SITE}/api/matches/${matchId}/video`, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });
  const response = await handleRemoveAttachment(request, matchId, h.deps);
  return {
    response,
    json: (await response.json()) as Record<string, unknown>,
  };
}

function expectNotRemoved(h: RemovalHarness) {
  expect(h.events).not.toContain("remove");
  expect(h.events).not.toContain("schedule");
  expect(h.events).not.toContain("claim");
  expect(h.store.calls).toEqual([]);
}

/* -------------------------------------------------------------------------
 * Who may remove
 * ---------------------------------------------------------------------- */

test("removal: a player removes their own video — visibility, removal check, RPC, then cleanup", async () => {
  const h = removalHarness(R_PLAYER);
  const row = h.store.seed(R_PLAYER_MATCH, R_PLAYER);

  const { response, json } = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(200);
  expectNoStore(response);
  expect(json).toEqual({
    attachmentId: row.id,
    state: "retired",
    retiredReason: "removed",
  });
  expect(h.store.rows.get(row.id)!.state).toBe("retired");

  // The four steps, in order. The uploader needs no role read. (The session
  // is asked twice: once at the edge, before the body is read, and again by
  // the visibility check, exactly as the cancel route does.)
  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${R_PLAYER_MATCH}`,
    "attachment",
    "remove",
    "schedule",
    "claim",
  ]);
});

test("removal: a player removing someone else's video is a 403, and the RPC is never called", async () => {
  const h = removalHarness(R_PLAYER);
  const row = h.store.seed(R_TEAMMATE_MATCH, R_TEAMMATE);

  const { response, json } = await removeVideo(h, R_TEAMMATE_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(403);
  expect(json.code).toBe("forbidden");
  expect(json.detail).toBe("not_uploader_or_program_lead");
  // Not the creator-only sentence: a coach COULD remove this.
  expect(json.error).toBe(
    "Only the person who uploaded this video, or a team owner or coach, can remove it.",
  );
  expectNotRemoved(h);
  expect(h.store.rows.get(row.id)!.state).toBe("active");
});

test("removal: staff remove only their own videos", async () => {
  const theirs = removalHarness(R_STAFF);
  const other = theirs.store.seed(R_TEAMMATE_MATCH, R_TEAMMATE);
  const refused = await removeVideo(theirs, R_TEAMMATE_MATCH, {
    attachmentId: other.id,
  });
  expect(refused.response.status).toBe(403);
  expect(refused.json.detail).toBe("not_uploader_or_program_lead");
  expectNotRemoved(theirs);

  const own = removalHarness(R_STAFF);
  const mine = own.store.seed(R_STAFF_MATCH, R_STAFF);
  const removed = await removeVideo(own, R_STAFF_MATCH, {
    attachmentId: mine.id,
  });
  expect(removed.response.status).toBe(200);
  expect(own.store.rows.get(mine.id)!.retired_reason).toBe("removed");
});

for (const [label, actor] of [
  ["coach", R_COACH],
  ["owner", R_OWNER],
] as const) {
  test(`removal: a team ${label} removes any video in the team`, async () => {
    const h = removalHarness(actor);
    const players = h.store.seed(R_PLAYER_MATCH, R_PLAYER);
    const staffs = h.store.seed(R_STAFF_MATCH, R_STAFF);

    for (const [matchId, row] of [
      [R_PLAYER_MATCH, players],
      [R_STAFF_MATCH, staffs],
    ] as const) {
      const { response, json } = await removeVideo(h, matchId, {
        attachmentId: row.id,
      });
      expect(response.status, `${label} → ${matchId}`).toBe(200);
      expect(json.retiredReason).toBe("removed");
      expect(h.store.rows.get(row.id)!.state).toBe("retired");
    }
    // Not the uploader, so the role was asked — and the workspace never was.
    expect(h.events).toContain("role");
    expect(h.events).not.toContain("workspace");
  });
}

test("removal: a coach of another program gets a 404 and learns nothing about the video", async () => {
  const h = removalHarness(R_OTHER_COACH);
  const row = h.store.seed(R_PLAYER_MATCH, R_PLAYER);
  const { response, json } = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(404);
  expect(json.code).toBe("match_not_found");
  expect(json.detail).toBe("not_visible");
  expect(h.events).not.toContain("attachment");
  expect(h.events).not.toContain("role");
  expectNotRemoved(h);
});

test("removal: a stranger gets a 404, for a team match and a personal one alike", async () => {
  for (const matchId of [R_PLAYER_MATCH, R_PERSONAL_MATCH]) {
    const h = removalHarness(R_STRANGER);
    const row = h.store.seed(matchId, R_PLAYER);
    const { response, json } = await removeVideo(h, matchId, {
      attachmentId: row.id,
    });
    expect(response.status).toBe(404);
    expect(json.detail).toBe("not_visible");
    expect(h.events).not.toContain("attachment");
    expectNotRemoved(h);
  }
});

test("removal: a personal match has no program lead — only its uploader may remove", async () => {
  const h = removalHarness(R_PLAYER);
  const row = h.store.seed(R_PERSONAL_MATCH, R_PLAYER);
  const { response } = await removeVideo(h, R_PERSONAL_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(200);
  expect(h.events).not.toContain("role");
});

test("removal: the RPC's own refusal reaches the caller when the role changed after the check", async () => {
  // The access layer still believes R_PLAYER is a coach; the database does
  // not. The RPC is the gate that holds.
  const h = removalHarness(R_PLAYER, { roleOverride: "coach" });
  const row = h.store.seed(R_TEAMMATE_MATCH, R_TEAMMATE);
  const { response, json } = await removeVideo(h, R_TEAMMATE_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(403);
  expect(json.detail).toBe("not_uploader_or_program_lead");
  expect(json.error).toContain("team owner or coach");
  expect(h.events).toContain("remove");
  expect(h.events).not.toContain("schedule");
  expect(h.store.rows.get(row.id)!.state).toBe("active");
});

/* -------------------------------------------------------------------------
 * Edge, body and state
 * ---------------------------------------------------------------------- */

test("removal: a cross-origin request and a missing session are refused before any read", async () => {
  const cross = removalHarness(R_PLAYER);
  const row = cross.store.seed(R_PLAYER_MATCH, R_PLAYER);
  const refused = await removeVideo(
    cross,
    R_PLAYER_MATCH,
    { attachmentId: row.id },
    { origin: "https://evil.example" },
  );
  expect(refused.response.status).toBe(403);
  expect(refused.json.code).toBe("cross_origin");
  expect(cross.events).toEqual([]);

  const anonymous = removalHarness(null);
  const signedOut = await removeVideo(anonymous, R_PLAYER_MATCH, {
    attachmentId: row.id,
  });
  expect(signedOut.response.status).toBe(401);
  expect(anonymous.events).toEqual(["auth"]);
});

test("removal: the body is exactly { attachmentId } — other keys are refused by name", async () => {
  const h = removalHarness(R_PLAYER);
  const row = h.store.seed(R_PLAYER_MATCH, R_PLAYER);

  const extra = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: row.id,
    uploadedBy: R_PLAYER,
  });
  expect(extra.response.status).toBe(400);
  expect(extra.json.detail).toBe("unexpected_field:uploadedBy");

  const missing = await removeVideo(h, R_PLAYER_MATCH, {});
  expect(missing.response.status).toBe(400);
  expect(missing.json.detail).toBe("attachment_id_type");

  const notJson = await removeVideo(
    h,
    R_PLAYER_MATCH,
    { attachmentId: row.id },
    { contentType: "text/plain" },
  );
  expect(notJson.response.status).toBe(400);

  const malformed = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: "not-a-uuid",
  });
  expect(malformed.response.status).toBe(404);
  expect(malformed.json.detail).toBe("malformed_attachment_id");

  expectNotRemoved(h);
});

test("removal: an attachment filed under another match is a 404", async () => {
  const h = removalHarness(R_COACH);
  const row = h.store.seed(R_TEAMMATE_MATCH, R_TEAMMATE);
  const { response, json } = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(404);
  expect(json.detail).toBe("no_such_attachment");
  expectNotRemoved(h);
});

test("removal: a second DELETE is harmless and answers the same", async () => {
  const h = removalHarness(R_PLAYER);
  const row = h.store.seed(R_PLAYER_MATCH, R_PLAYER);
  const first = await removeVideo(h, R_PLAYER_MATCH, { attachmentId: row.id });
  const retiredAt = h.store.rows.get(row.id)!.retired_at;
  const second = await removeVideo(h, R_PLAYER_MATCH, { attachmentId: row.id });
  expect(first.response.status).toBe(200);
  expect(second.response.status).toBe(200);
  expect(second.json).toEqual(first.json);
  expect(h.store.rows.get(row.id)!.retired_at).toBe(retiredAt);
});

test("removal: a pending attempt is cancelled, not removed — 409", async () => {
  const h = removalHarness(R_PLAYER);
  const row = h.store.seed(R_PLAYER_MATCH, R_PLAYER, "pending");
  const { response, json } = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(409);
  expect(json.code).toBe("mode_conflict");
  expect(json.detail).toBe("attachment_pending");
  expect(h.events).not.toContain("schedule");
  expect(h.store.rows.get(row.id)!.state).toBe("pending");
});

test("removal: a cleanup that cannot be scheduled never fails the removal", async () => {
  const h = removalHarness(R_PLAYER, { scheduleThrows: true });
  const row = h.store.seed(R_PLAYER_MATCH, R_PLAYER);
  const { response } = await removeVideo(h, R_PLAYER_MATCH, {
    attachmentId: row.id,
  });
  expect(response.status).toBe(200);
  expect(h.store.rows.get(row.id)!.state).toBe("retired");
  expect(h.events).not.toContain("claim");
});
