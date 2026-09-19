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
import type { HttpResult } from "@/lib/services/match-video/http";
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
