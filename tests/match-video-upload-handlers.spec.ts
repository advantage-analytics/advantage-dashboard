import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  authorizeMatchVideoMutation,
  authorizeMatchVisibility,
  type MatchVideoAccessDeps,
  type VisibleMatchRow,
} from "@/lib/services/match-video/access";
import {
  checkSameOrigin,
  MUTATION_BODY_MAX_BYTES,
  readBoundedJson,
} from "@/lib/services/match-video/http";
import { matchVideoRpcError } from "@/lib/services/match-video/rpc-errors";
import type { AttachmentStorageRow } from "@/lib/services/match-video/storage";
import {
  handlePrepareUpload,
  parseReserveUploadBody,
  type PrepareUploadDeps,
  type ReservedAttachment,
  type ReserveUploadInput,
} from "@/lib/services/match-video/uploads";
import { MATCH_VIDEO_MAX_BYTES } from "@/lib/match-video/limits";
import type { Workspace } from "@/lib/workspace/types";

/**
 * `POST /api/matches/[matchId]/video/uploads` (T8), run against fakes.
 *
 * Every seam in `PrepareUploadDeps` is a stub: no session cookie, no
 * Supabase, no workspace lookup, and — the one that matters — no Azure.
 * `reserve` is an in-memory model of T3's `match_video_reserve_upload`
 * (reality before request id; identical retry reuses; anything else under
 * the same request id, or other pending work, conflicts) and
 * `mintUploadCredential` returns a sentinel and counts. Nothing in this file
 * imports `azure-sas.ts` or can produce a `sig=`.
 *
 * The claim under test, for every refusal: the storage seam was never
 * reached AND nothing was reserved. Both are asserted from the recorded
 * event log, not inferred from the status code.
 */

const SITE = "http://localhost:3000";
const CREATOR = randomUUID();
const OTHER_USER = randomUUID();
const PROGRAM = randomUUID();
const OTHER_PROGRAM = randomUUID();
const PERSONAL_MATCH = randomUUID();
const TEAM_MATCH = randomUUID();
const VENDOR_MATCH = randomUUID();
const STUB_URL = "stub://upload-credential/not-a-sas";
const NOW = new Date("2026-09-18T12:00:00.000Z");

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
};

function personal(userId: string): Pick<Workspace, "id" | "kind"> {
  return { id: userId, kind: "personal" };
}

function team(programId: string): Pick<Workspace, "id" | "kind"> {
  return { id: programId, kind: "team" };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    filename: "match.mp4",
    sizeBytes: 1_234_567,
    contentType: "video/mp4",
    clientRequestId: randomUUID(),
    expectedActive: null,
    ...overrides,
  };
}

interface RequestOptions {
  origin?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  body?: string;
}

function post(
  matchId: string,
  body: unknown,
  options: RequestOptions = {},
): Request {
  const headers = new Headers(options.headers ?? {});
  if (options.origin !== null) headers.set("origin", options.origin ?? SITE);
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  return new Request(`${SITE}/api/matches/${matchId}/video/uploads`, {
    method: "POST",
    headers,
    body: options.body ?? JSON.stringify(body),
  });
}

/**
 * In-memory T3. Keyed the way the RPC is: an active row per match, and
 * pending attempts by (uploader, client request id). Checks reality
 * BEFORE the request-id lookup, which is the precedence T3 recorded.
 */
class FakeReservations {
  rows = new Map<
    string,
    {
      id: string;
      matchId: string;
      uploadedBy: string;
      state: "pending" | "active" | "retired";
      version: number;
      filename: string;
      sizeBytes: number;
      contentType: string;
      clientRequestId: string;
      expectedActiveId: string | null;
      expectedActiveVersion: number | null;
      uploadSasExpiresAt: Date;
    }
  >();

  activate(matchId: string, id: string, version: number) {
    this.rows.set(id, {
      id,
      matchId,
      uploadedBy: CREATOR,
      state: "active",
      version,
      filename: "old.mp4",
      sizeBytes: 1,
      contentType: "video/mp4",
      clientRequestId: randomUUID(),
      expectedActiveId: null,
      expectedActiveVersion: null,
      uploadSasExpiresAt: NOW,
    });
  }

  reserve(input: ReserveUploadInput): ReturnType<PrepareUploadDeps["reserve"]> {
    const { access, request, uploadSasExpiresAt } = input;
    const matchId = access.match.id;
    const actorId = access.actor.id;

    const active = [...this.rows.values()].find(
      (r) => r.matchId === matchId && r.state === "active",
    );
    const expected = request.expectedActive;
    if (
      (active?.id ?? null) !== (expected?.id ?? null) ||
      (active?.version ?? null) !== (expected?.version ?? null)
    ) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "stale_attachment",
          status: 409,
          message: "The video changed. Reload and try again.",
          detail: active
            ? "active_attachment_replaced"
            : "no_active_attachment",
        },
      });
    }

    const existing = [...this.rows.values()].find(
      (r) =>
        r.uploadedBy === actorId &&
        r.clientRequestId === request.clientRequestId,
    );
    if (existing) {
      const same =
        existing.state === "pending" &&
        existing.matchId === matchId &&
        existing.filename === request.filename &&
        existing.sizeBytes === request.sizeBytes &&
        existing.contentType === request.contentType &&
        existing.expectedActiveId === (expected?.id ?? null) &&
        existing.expectedActiveVersion === (expected?.version ?? null);
      if (!same) {
        return Promise.resolve({
          ok: false,
          error: {
            code: "pending_attempt_conflict",
            status: 409,
            message:
              "Another video upload for this match is already in progress.",
            detail: "request_id_metadata_changed",
          },
        });
      }
      if (uploadSasExpiresAt > existing.uploadSasExpiresAt) {
        existing.uploadSasExpiresAt = uploadSasExpiresAt;
      }
      return Promise.resolve({
        ok: true,
        value: this.toRow(existing.id, true),
      });
    }

    const otherPending = [...this.rows.values()].some(
      (r) =>
        r.matchId === matchId &&
        r.uploadedBy === actorId &&
        r.state === "pending",
    );
    if (otherPending) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "pending_attempt_conflict",
          status: 409,
          message:
            "Another video upload for this match is already in progress.",
          detail: "other_pending_attempt",
        },
      });
    }

    const id = randomUUID();
    this.rows.set(id, {
      id,
      matchId,
      uploadedBy: actorId,
      state: "pending",
      version: 0,
      filename: request.filename,
      sizeBytes: request.sizeBytes,
      contentType: request.contentType,
      clientRequestId: request.clientRequestId,
      expectedActiveId: expected?.id ?? null,
      expectedActiveVersion: expected?.version ?? null,
      uploadSasExpiresAt,
    });
    return Promise.resolve({ ok: true, value: this.toRow(id, false) });
  }

  private toRow(id: string, reused: boolean): ReservedAttachment {
    const row = this.rows.get(id)!;
    return {
      id,
      staged_blob_key: `match-video/${row.matchId}/${id}/staged.mp4`,
      final_blob_key: `match-video/${row.matchId}/${id}/final.mp4`,
      source_etag: null,
      upload_sas_expires_at: row.uploadSasExpiresAt.toISOString(),
      reused,
    };
  }
}

interface Harness {
  deps: PrepareUploadDeps;
  events: string[];
  reserveCalls: ReserveUploadInput[];
  mintCalls: { row: AttachmentStorageRow; notAfter: Date }[];
  store: FakeReservations;
}

function harness(
  options: {
    userId?: string | null;
    workspace?: Pick<Workspace, "id" | "kind"> | null;
    /** Which matches RLS lets this viewer see. Default: all fixtures. */
    visible?: string[];
    readError?: string;
    store?: FakeReservations;
    mint?: PrepareUploadDeps["mintUploadCredential"];
    reserve?: PrepareUploadDeps["reserve"];
  } = {},
): Harness {
  const events: string[] = [];
  const reserveCalls: ReserveUploadInput[] = [];
  const mintCalls: Harness["mintCalls"] = [];
  const store = options.store ?? new FakeReservations();
  const userId = options.userId === undefined ? CREATOR : options.userId;
  const workspace =
    options.workspace === undefined ? personal(CREATOR) : options.workspace;

  const deps: PrepareUploadDeps = {
    async currentUserId() {
      events.push("auth");
      return userId;
    },
    async loadVisibleMatch(matchId) {
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
    now: () => NOW,
    async reserve(input) {
      events.push("reserve");
      reserveCalls.push(input);
      return options.reserve ? options.reserve(input) : store.reserve(input);
    },
    mintUploadCredential(row, notAfter) {
      events.push("mint");
      mintCalls.push({ row, notAfter });
      if (options.mint) return options.mint(row, notAfter);
      return {
        ok: true,
        value: {
          uploadUrl: `${STUB_URL}/${row.staged_blob_key}`,
          expiresAt: new Date(notAfter.getTime() - 1000),
        },
      };
    },
  };

  return { deps, events, reserveCalls, mintCalls, store };
}

async function run(
  h: Harness,
  matchId: string,
  body: unknown,
  options?: RequestOptions,
) {
  const response = await handlePrepareUpload(
    post(matchId, body, options),
    matchId,
    h.deps,
  );
  const json = (await response.json()) as Record<string, unknown>;
  return { response, json };
}

/** The assertion behind every denial: no reservation, no credential. */
function expectNoSideEffects(h: Harness) {
  expect(h.events).not.toContain("reserve");
  expect(h.events).not.toContain("mint");
  expect(h.reserveCalls).toHaveLength(0);
  expect(h.mintCalls).toHaveLength(0);
  expect(h.store.rows.size).toBe(0);
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

/* -------------------------------------------------------------------------
 * Same-origin and body bounds — before sign-in is even asked
 * ---------------------------------------------------------------------- */

test("a cross-origin request is refused before anything is read", async () => {
  const h = harness();
  const { response, json } = await run(h, PERSONAL_MATCH, validBody(), {
    origin: "https://evil.example",
  });
  expect(response.status).toBe(403);
  expect(json.code).toBe("cross_origin");
  expectNoStore(response);
  expect(h.events).toEqual([]);
  expectNoSideEffects(h);
});

test("a request with no Origin header is refused", async () => {
  const h = harness();
  const { response, json } = await run(h, PERSONAL_MATCH, validBody(), {
    origin: null,
  });
  expect(response.status).toBe(403);
  expect(json.detail).toBe("no_origin");
  expect(h.events).toEqual([]);
});

test("Sec-Fetch-Site: cross-site is refused even with a matching Origin", async () => {
  const h = harness();
  const { response, json } = await run(h, PERSONAL_MATCH, validBody(), {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(response.status).toBe(403);
  expect(json.detail).toBe("sec_fetch_site_cross-site");
  expect(h.events).toEqual([]);
});

test("the configured site origin is allowed when it differs from the request URL", () => {
  const request = new Request("http://127.0.0.1:3000/api/x", {
    method: "POST",
    headers: { origin: "https://app.example.com" },
  });
  expect(checkSameOrigin(request, [])).not.toBeNull();
  expect(checkSameOrigin(request, ["https://app.example.com/"])).toBeNull();
  // A garbage site URL widens nothing.
  expect(checkSameOrigin(request, ["not a url"])).not.toBeNull();
});

test("an unauthenticated caller gets 401 with nothing read or reserved", async () => {
  const h = harness({ userId: null });
  const { response, json } = await run(h, PERSONAL_MATCH, validBody());
  expect(response.status).toBe(401);
  expect(json.code).toBe("unauthenticated");
  expectNoStore(response);
  expect(h.events).toEqual(["auth"]);
  expectNoSideEffects(h);
});

test("malformed JSON is a 400 and never reaches the database", async () => {
  const h = harness();
  const { response, json } = await run(h, PERSONAL_MATCH, null, {
    body: "{not json",
  });
  expect(response.status).toBe(400);
  expect(json.code).toBe("invalid_request");
  expect(json.detail).toBe("malformed_json");
  expect(h.events).toEqual(["auth"]);
  expectNoSideEffects(h);
});

test("a non-JSON content type is refused", async () => {
  const h = harness();
  const { response, json } = await run(h, PERSONAL_MATCH, validBody(), {
    contentType: "text/plain",
  });
  expect(response.status).toBe(400);
  expect(json.detail).toBe("content_type");
  expectNoSideEffects(h);
});

test("an oversized body is cut off by the stream cap, not buffered", async () => {
  const h = harness();
  const padding = "x".repeat(MUTATION_BODY_MAX_BYTES * 4);
  const { response, json } = await run(
    h,
    PERSONAL_MATCH,
    validBody({ filename: `${padding}.mp4` }),
  );
  expect(response.status).toBe(413);
  expect(json.code).toBe("request_too_large");
  expect(json.detail).toBe("body_stream");
  expectNoSideEffects(h);
});

test("a declared Content-Length over the cap is refused before reading", async () => {
  const request = new Request(`${SITE}/api/x`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(MUTATION_BODY_MAX_BYTES + 1),
    },
    body: "{}",
  });
  const result = await readBoundedJson(request);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.detail).toBe("content_length");
});

/* -------------------------------------------------------------------------
 * The body may not carry authority
 * ---------------------------------------------------------------------- */

const FORGED_FIELDS: Record<string, unknown> = {
  attachmentId: randomUUID(),
  id: randomUUID(),
  stagedBlobKey: "match-video/x/y/staged.mp4",
  staged_blob_key: "match-video/x/y/staged.mp4",
  finalBlobKey: "match-video/x/y/final.mp4",
  uploadUrl: "https://account.blob.core.windows.net/c/k?sig=x",
  blobUrl: "https://account.blob.core.windows.net/c/k",
  container: "videos",
  offsetSeconds: 12.5,
  confirmedVideoTimeSeconds: 3,
  durationSeconds: 5400,
  workspaceId: OTHER_PROGRAM,
  workspaceKind: "team",
  programId: OTHER_PROGRAM,
  userId: OTHER_USER,
  actorId: OTHER_USER,
  uploadedBy: OTHER_USER,
  createdBy: OTHER_USER,
  matchId: TEAM_MATCH,
  uploadSasExpiresAt: "2099-01-01T00:00:00Z",
  version: 3,
};

for (const [field, value] of Object.entries(FORGED_FIELDS)) {
  test(`a body naming \`${field}\` is refused by name, with no side effects`, async () => {
    const h = harness();
    const { response, json } = await run(
      h,
      PERSONAL_MATCH,
      validBody({ [field]: value }),
    );
    expect(response.status).toBe(400);
    expect(json.code).toBe("invalid_request");
    expect(json.detail).toBe(`unexpected_field:${field}`);
    // Refused at the parser: the match was never even read.
    expect(h.events).toEqual(["auth"]);
    expectNoSideEffects(h);
  });
}

test("expectedActive may not smuggle extra keys either", () => {
  const parsed = parseReserveUploadBody(
    validBody({
      expectedActive: { id: randomUUID(), version: 1, offsetSeconds: 2 },
    }),
  );
  expect(parsed.ok).toBe(false);
  if (!parsed.ok) {
    expect(parsed.error.detail).toBe("expected_active_field:offsetSeconds");
  }
});

test("the actor and workspace the RPC receives are the session's, whatever the body said", async () => {
  // The body cannot name them at all (above), so the only way to check is
  // to look at what `reserve` was handed: the branded access value, built
  // from the fakes standing in for the cookie and the switcher.
  const h = harness({ workspace: team(PROGRAM) });
  const { response } = await run(h, TEAM_MATCH, validBody());
  expect(response.status).toBe(201);
  expect(h.reserveCalls).toHaveLength(1);
  const { access, request } = h.reserveCalls[0];
  expect(access.actor).toEqual({ id: CREATOR });
  expect(access.workspace).toEqual({ kind: "team", id: PROGRAM });
  expect(access.match.id).toBe(TEAM_MATCH);
  expect(Object.keys(request).sort()).toEqual([
    "clientRequestId",
    "contentType",
    "expectedActive",
    "filename",
    "sizeBytes",
  ]);
});

/* -------------------------------------------------------------------------
 * Malformed and out-of-range fields
 * ---------------------------------------------------------------------- */

test("an omitted expectedActive is not the same as null", async () => {
  const h = harness();
  const body = validBody();
  delete (body as Record<string, unknown>).expectedActive;
  const { response, json } = await run(h, PERSONAL_MATCH, body);
  expect(response.status).toBe(400);
  expect(json.detail).toBe("expected_active_missing");
  expectNoSideEffects(h);
});

test("a declared size over the cap is 413 file_too_large, and zero is empty_file", async () => {
  const big = harness();
  const over = await run(
    big,
    PERSONAL_MATCH,
    validBody({ sizeBytes: MATCH_VIDEO_MAX_BYTES + 1 }),
  );
  expect(over.response.status).toBe(413);
  expect(over.json.code).toBe("file_too_large");
  expectNoSideEffects(big);

  const empty = harness();
  const zero = await run(empty, PERSONAL_MATCH, validBody({ sizeBytes: 0 }));
  expect(zero.response.status).toBe(413);
  expect(zero.json.code).toBe("empty_file");
  expectNoSideEffects(empty);

  const text = harness();
  const str = await run(text, PERSONAL_MATCH, validBody({ sizeBytes: "5" }));
  expect(str.response.status).toBe(400);
  expect(str.json.detail).toBe("size_type");
});

test("an unsupported container is 422 unsupported_media before any read", async () => {
  const h = harness();
  const { response, json } = await run(
    h,
    PERSONAL_MATCH,
    validBody({ filename: "match.avi" }),
  );
  expect(response.status).toBe(422);
  expect(json.code).toBe("unsupported_media");
  expect(h.events).toEqual(["auth"]);
  expectNoSideEffects(h);
});

test("filename, content type and request id are validated strictly", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ filename: "" }, "filename_length"],
    [{ filename: "a/b.mp4" }, "filename_chars"],
    [{ filename: "a\\b.mp4" }, "filename_chars"],
    [{ filename: `${"x".repeat(252)}.mp4` }, "filename_length"],
    [{ filename: 42 }, "filename_type"],
    [{ contentType: "" }, "content_type_format"],
    [{ contentType: "video" }, "content_type_format"],
    [{ contentType: "video/mp4; codecs=avc1" }, "content_type_format"],
    [{ clientRequestId: "not-a-uuid" }, "client_request_id"],
    [{ clientRequestId: 7 }, "client_request_id"],
    [{ expectedActive: "abc" }, "expected_active_type"],
    [{ expectedActive: { id: "nope", version: 1 } }, "expected_active_id"],
    [
      { expectedActive: { id: randomUUID(), version: -1 } },
      "expected_active_version",
    ],
    [
      { expectedActive: { id: randomUUID(), version: 1.5 } },
      "expected_active_version",
    ],
  ];
  for (const [override, detail] of cases) {
    const parsed = parseReserveUploadBody(validBody(override));
    expect(parsed.ok, JSON.stringify(override)).toBe(false);
    if (!parsed.ok) expect(parsed.error.detail).toBe(detail);
  }
  expect(parseReserveUploadBody([]).ok).toBe(false);
  expect(parseReserveUploadBody("x").ok).toBe(false);
  expect(parseReserveUploadBody(null).ok).toBe(false);

  const good = parseReserveUploadBody(
    validBody({ filename: "  Court 3.MOV ", contentType: " video/quicktime " }),
  );
  expect(good.ok).toBe(true);
  if (good.ok) {
    expect(good.value.filename).toBe("Court 3.MOV");
    expect(good.value.contentType).toBe("video/quicktime");
  }
});

/* -------------------------------------------------------------------------
 * Access — visibility, creator, provenance, exact workspace
 * ---------------------------------------------------------------------- */

test("a forged match id that is not a UUID is 404 without a database read", async () => {
  const h = harness();
  const { response, json } = await run(h, "not-a-uuid", validBody());
  expect(response.status).toBe(404);
  expect(json.code).toBe("match_not_found");
  expect(json.detail).toBe("malformed_match_id");
  expect(h.events).toEqual(["auth", "auth"]);
  expectNoSideEffects(h);
});

test("a match RLS does not show the caller is 404, not 403", async () => {
  const h = harness({ userId: OTHER_USER, visible: [] });
  const { response, json } = await run(h, PERSONAL_MATCH, validBody());
  expect(response.status).toBe(404);
  expect(json.code).toBe("match_not_found");
  expect(json.detail).toBe("not_visible");
  expect(h.events).not.toContain("workspace");
  expectNoSideEffects(h);
});

test("a visible match created by someone else is 403 forbidden", async () => {
  // A team-mate who can see the match (RLS) but did not add it.
  const h = harness({ userId: OTHER_USER, workspace: team(PROGRAM) });
  const { response, json } = await run(h, TEAM_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.code).toBe("forbidden");
  expect(json.detail).toBe("not_creator");
  expect(h.events).not.toContain("workspace");
  expectNoSideEffects(h);
});

test("a vendor-analysed match is refused for its creator too", async () => {
  const h = harness();
  const { response, json } = await run(h, VENDOR_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.code).toBe("forbidden");
  expect(json.detail).toBe("not_swingvision");
  expectNoSideEffects(h);
});

test("a personal match under a team workspace is workspace_mismatch", async () => {
  const h = harness({ workspace: team(PROGRAM) });
  const { response, json } = await run(h, PERSONAL_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.code).toBe("workspace_mismatch");
  expect(json.detail).toBe("team_match_in_personal_workspace");
  expectNoSideEffects(h);
});

test("a team match under the personal workspace is workspace_mismatch", async () => {
  const h = harness({ workspace: personal(CREATOR) });
  const { response, json } = await run(h, TEAM_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.code).toBe("workspace_mismatch");
  expect(json.detail).toBe("personal_match_in_team_workspace");
  expectNoSideEffects(h);
});

test("a team match under a different program's workspace is workspace_mismatch", async () => {
  const h = harness({ workspace: team(OTHER_PROGRAM) });
  const { response, json } = await run(h, TEAM_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.detail).toBe("match_in_other_program");
  expectNoSideEffects(h);
});

test("a personal workspace that is not the actor's own is workspace_mismatch", async () => {
  const h = harness({ workspace: personal(OTHER_USER) });
  const { response, json } = await run(h, PERSONAL_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.detail).toBe("personal_workspace_not_actor");
  expectNoSideEffects(h);
});

test("no active workspace at all is workspace_mismatch", async () => {
  const h = harness({ workspace: null });
  const { response, json } = await run(h, PERSONAL_MATCH, validBody());
  expect(response.status).toBe(403);
  expect(json.detail).toBe("no_active_workspace");
  expectNoSideEffects(h);
});

test("a failed visibility read is 503, not a 404 that sends the person away", async () => {
  const h = harness({ readError: "connection reset" });
  const { response, json } = await run(h, PERSONAL_MATCH, validBody());
  expect(response.status).toBe(503);
  expect(json.code).toBe("storage_unavailable");
  expect(json.detail).toBe("match_read_failed");
  expectNoSideEffects(h);
});

test("visibility alone (T12's question) never yields mutation access", async () => {
  const deps: MatchVideoAccessDeps = {
    currentUserId: async () => OTHER_USER,
    loadVisibleMatch: async (id) => ({
      match: MATCHES[id] ?? null,
      error: null,
    }),
    activeWorkspace: async () => team(PROGRAM),
  };
  const visible = await authorizeMatchVisibility(TEAM_MATCH, deps);
  expect(visible.ok).toBe(true);
  const mutation = await authorizeMatchVideoMutation(TEAM_MATCH, deps);
  expect(mutation.ok).toBe(false);
  if (!mutation.ok) expect(mutation.error.detail).toBe("not_creator");
});

/* -------------------------------------------------------------------------
 * Success — reserve first, then mint, credential bounded by the record
 * ---------------------------------------------------------------------- */

test("the creator in the personal workspace reserves and gets a staged-key credential", async () => {
  const h = harness();
  const body = validBody();
  const { response, json } = await run(h, PERSONAL_MATCH, body);
  expect(response.status).toBe(201);
  expectNoStore(response);

  expect(Object.keys(json).sort()).toEqual([
    "attachmentId",
    "uploadExpiresAt",
    "uploadUrl",
  ]);
  expect(json.uploadUrl).toMatch(/^stub:\/\/upload-credential\//);
  expect(json.uploadUrl).toContain("/staged.mp4");
  expect(json.uploadUrl).not.toContain("final");

  // Reserve BEFORE mint, exactly once each.
  expect(h.events).toEqual([
    "auth",
    "auth",
    `read:${PERSONAL_MATCH}`,
    "workspace",
    "reserve",
    "mint",
  ]);

  // The expiry the RPC was told to persist is the clock plus six hours, and
  // the credential was cut against that same recorded value.
  const [call] = h.reserveCalls;
  expect(call.uploadSasExpiresAt.toISOString()).toBe(
    "2026-09-18T18:00:00.000Z",
  );
  expect(call.access.actor.id).toBe(CREATOR);
  expect(call.access.workspace).toEqual({ kind: "personal", id: CREATOR });
  expect(call.request.clientRequestId).toBe(body.clientRequestId);
  expect(h.mintCalls[0].notAfter.toISOString()).toBe(
    "2026-09-18T18:00:00.000Z",
  );
  expect(h.mintCalls[0].row.id).toBe(json.attachmentId);
  expect(
    new Date(json.uploadExpiresAt as string).getTime(),
  ).toBeLessThanOrEqual(h.mintCalls[0].notAfter.getTime());
  expect(h.store.rows.get(json.attachmentId as string)?.state).toBe("pending");
});

test("the creator in the matching team workspace reserves too", async () => {
  const h = harness({ workspace: team(PROGRAM) });
  const { response } = await run(h, TEAM_MATCH, validBody());
  expect(response.status).toBe(201);
  expect(h.reserveCalls[0].access.workspace).toEqual({
    kind: "team",
    id: PROGRAM,
  });
});

test("an identical retry reuses the attempt: 200, same id, fresh credential", async () => {
  const h = harness();
  const body = validBody();
  const first = await run(h, PERSONAL_MATCH, body);
  const second = await run(h, PERSONAL_MATCH, body);
  expect(first.response.status).toBe(201);
  expect(second.response.status).toBe(200);
  expect(second.json.attachmentId).toBe(first.json.attachmentId);
  expect(h.store.rows.size).toBe(1);
  expect(h.mintCalls).toHaveLength(2);
});

test("a second attempt with a different request id conflicts until the first is cancelled", async () => {
  const h = harness();
  const first = await run(h, PERSONAL_MATCH, validBody());
  expect(first.response.status).toBe(201);
  const mintsBefore = h.mintCalls.length;

  const second = await run(h, PERSONAL_MATCH, validBody());
  expect(second.response.status).toBe(409);
  expect(second.json.code).toBe("pending_attempt_conflict");
  expect(second.json.detail).toBe("other_pending_attempt");
  expectNoStore(second.response);
  expect(h.mintCalls).toHaveLength(mintsBefore);
  expect(h.store.rows.size).toBe(1);
});

test("the same request id with changed metadata is a conflict, not a silent overwrite", async () => {
  const h = harness();
  const body = validBody();
  await run(h, PERSONAL_MATCH, body);
  const changed = await run(h, PERSONAL_MATCH, {
    ...body,
    sizeBytes: body.sizeBytes + 1,
  });
  expect(changed.response.status).toBe(409);
  expect(changed.json.detail).toBe("request_id_metadata_changed");
  expect(h.mintCalls).toHaveLength(1);
});

test("a stale belief about the active attachment is stale_attachment even on a retried request id", async () => {
  // T3's precedence: reality is checked before the request-id lookup.
  const h = harness();
  const body = validBody();
  const first = await run(h, PERSONAL_MATCH, body);
  expect(first.response.status).toBe(201);

  // Another tab publishes a video in between.
  h.store.activate(PERSONAL_MATCH, randomUUID(), 0);

  const retry = await run(h, PERSONAL_MATCH, body);
  expect(retry.response.status).toBe(409);
  expect(retry.json.code).toBe("stale_attachment");
  expect(retry.json.detail).toBe("active_attachment_replaced");
  expect(h.mintCalls).toHaveLength(1);
});

test("a first add must say null; claiming an attachment that is not active is stale", async () => {
  const h = harness();
  const { response, json } = await run(
    h,
    PERSONAL_MATCH,
    validBody({ expectedActive: { id: randomUUID(), version: 0 } }),
  );
  expect(response.status).toBe(409);
  expect(json.code).toBe("stale_attachment");
  expect(h.mintCalls).toHaveLength(0);
});

test("a replacement names the active attachment and version", async () => {
  const h = harness();
  const activeId = randomUUID();
  h.store.activate(PERSONAL_MATCH, activeId, 2);

  const wrongVersion = await run(
    h,
    PERSONAL_MATCH,
    validBody({ expectedActive: { id: activeId, version: 1 } }),
  );
  expect(wrongVersion.response.status).toBe(409);

  const right = await run(
    h,
    PERSONAL_MATCH,
    validBody({ expectedActive: { id: activeId, version: 2 } }),
  );
  expect(right.response.status).toBe(201);
  expect(h.reserveCalls.at(-1)?.request.expectedActive).toEqual({
    id: activeId,
    version: 2,
  });
});

test("two simultaneous first attempts: exactly one reserves, the other conflicts", async () => {
  // The fake serialises like the row lock does; the point is that the
  // handler does nothing to make the loser look like a winner.
  const store = new FakeReservations();
  const a = harness({ store });
  const b = harness({ store });
  const [ra, rb] = await Promise.all([
    run(a, PERSONAL_MATCH, validBody()),
    run(b, PERSONAL_MATCH, validBody()),
  ]);
  const statuses = [ra.response.status, rb.response.status].sort();
  expect(statuses).toEqual([201, 409]);
  expect(store.rows.size).toBe(1);
  expect(a.mintCalls.length + b.mintCalls.length).toBe(1);
});

test("when the signer fails, the expiry was already persisted and the reservation stands", async () => {
  const h = harness({
    mint: () => ({
      ok: false,
      error: {
        code: "storage_unavailable",
        status: 503,
        message:
          "Video storage is unavailable right now. Try again in a moment.",
        detail: "storage_not_configured",
      },
    }),
  });
  const body = validBody();
  const { response, json } = await run(h, PERSONAL_MATCH, body);
  expect(response.status).toBe(503);
  expect(json.code).toBe("storage_unavailable");
  expectNoStore(response);

  // The row exists with its expiry recorded, even though no credential
  // was ever issued: cleanup knows when the (empty) staged key is free.
  expect(h.events.indexOf("reserve")).toBeLessThan(h.events.indexOf("mint"));
  const [row] = [...h.store.rows.values()];
  expect(row.state).toBe("pending");
  expect(row.uploadSasExpiresAt.toISOString()).toBe("2026-09-18T18:00:00.000Z");

  // A retry with the same request id finds the attempt and gets a credential.
  const retry = await run(harness({ store: h.store }), PERSONAL_MATCH, body);
  expect(retry.response.status).toBe(200);
});

test("a reused attempt's credential honours the LATER expiry the row already holds", async () => {
  const h = harness();
  const body = validBody();
  await run(h, PERSONAL_MATCH, body);

  // Clock goes backwards (another instance, skewed): the proposed expiry is
  // earlier than what the row holds; the RPC keeps the greater one.
  h.deps.now = () => new Date(NOW.getTime() - 60 * 60 * 1000);
  const retry = await run(h, PERSONAL_MATCH, body);
  expect(retry.response.status).toBe(200);
  expect(h.mintCalls[1].notAfter.toISOString()).toBe(
    "2026-09-18T18:00:00.000Z",
  );
});

/* -------------------------------------------------------------------------
 * RPC error mapping — the SQLSTATE table
 * ---------------------------------------------------------------------- */

test("RPC refusals map to the status of the code they carry, whatever the SQLSTATE", () => {
  const cases: [
    { code: string; message: string; details?: string },
    { code: string; status: number; detail: string },
  ][] = [
    [
      { code: "P0002", message: "match_not_found", details: "no_such_match" },
      { code: "match_not_found", status: 404, detail: "no_such_match" },
    ],
    [
      { code: "42501", message: "forbidden", details: "not_creator" },
      { code: "forbidden", status: 403, detail: "not_creator" },
    ],
    [
      { code: "42501", message: "workspace_mismatch", details: "not_a_member" },
      { code: "workspace_mismatch", status: 403, detail: "not_a_member" },
    ],
    [
      {
        code: "55000",
        message: "stale_attachment",
        details: "active_version_changed",
      },
      {
        code: "stale_attachment",
        status: 409,
        detail: "active_version_changed",
      },
    ],
    [
      {
        code: "55000",
        message: "pending_attempt_conflict",
        details: "finalizing",
      },
      { code: "pending_attempt_conflict", status: 409, detail: "finalizing" },
    ],
    [
      { code: "55000", message: "mode_conflict", details: "attempt_retired" },
      { code: "mode_conflict", status: 409, detail: "attempt_retired" },
    ],
    // T4's 22000 class: the code decides the status — 422 or 413.
    [
      { code: "22000", message: "missing_source_timing", details: "no_points" },
      { code: "missing_source_timing", status: 422, detail: "no_points" },
    ],
    [
      {
        code: "22000",
        message: "invalid_alignment",
        details: "point_time_invalid",
      },
      { code: "invalid_alignment", status: 422, detail: "point_time_invalid" },
    ],
    [
      {
        code: "22000",
        message: "insufficient_coverage",
        details: "final_point_after_end",
      },
      {
        code: "insufficient_coverage",
        status: 422,
        detail: "final_point_after_end",
      },
    ],
    [
      {
        code: "22000",
        message: "unsupported_media",
        details: "no_video_track",
      },
      { code: "unsupported_media", status: 422, detail: "no_video_track" },
    ],
    [
      { code: "22000", message: "file_too_large" },
      { code: "file_too_large", status: 413, detail: "sqlstate_22000" },
    ],
    // The partial unique index catching a race the lock missed.
    [
      {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      {
        code: "pending_attempt_conflict",
        status: 409,
        detail: "unique_violation",
      },
    ],
    [
      { code: "40001", message: "could not serialize access" },
      { code: "storage_unavailable", status: 503, detail: "transaction_40001" },
    ],
    [
      { code: "40P01", message: "deadlock detected" },
      { code: "storage_unavailable", status: 503, detail: "transaction_40P01" },
    ],
  ];
  for (const [input, expected] of cases) {
    const mapped = matchVideoRpcError(input);
    expect(mapped, input.message).not.toBeNull();
    expect(mapped).toMatchObject(expected);
  }
});

test("a malformed-argument (22023) or unknown RPC failure is not a refusal", () => {
  expect(
    matchVideoRpcError({
      code: "22023",
      message: "declared size out of range",
      details: "bad_declared_size",
    }),
  ).toBeNull();
  expect(matchVideoRpcError({ code: "XX000", message: "boom" })).toBeNull();
  expect(matchVideoRpcError({ message: "boom" })).toBeNull();
});
