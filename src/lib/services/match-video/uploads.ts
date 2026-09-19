/**
 * `POST /api/matches/[matchId]/video/uploads` — reserve an attachment attempt
 * and hand back a write credential for its staged key (plan step 6, the
 * preparation half; renewal and cancellation are T9).
 *
 * ORDER, and why each step sits where it does:
 *
 *   1. same-origin      stateless; a cross-site request touches nothing
 *   2. sign-in          an anonymous caller never reaches the database
 *   3. body             bounded, JSON, EXACTLY the five contract fields —
 *                       pure, so a malformed request costs no read
 *   4. access           RLS visibility, creator, provenance, exact workspace
 *                       (`access.ts`) — every refusal here happens before
 *                       the service role or the signer is touched
 *   5. reserve          T3's `match_video_reserve_upload`, given an expiry
 *                       this handler picked; the RPC commits that expiry
 *   6. mint             the SAS, cut to end no later than the expiry the
 *                       database now holds
 *
 * Five and six are in that order for the cleanup worker's sake: if the
 * process dies between them, the row already says when the staged key stops
 * being writable, and the worker can wait that out. Minting first would
 * leave a live credential the database knows nothing about.
 *
 * NO CALLER-SUPPLIED AUTHORITY. The body parser accepts the five fields of
 * `ReserveUploadRequest` and refuses any other key by name — `attachmentId`,
 * `stagedBlobKey`, `uploadUrl`, `container`, `offsetSeconds`, `workspaceId`,
 * `userId`, whatever — with a 400 that names the field. The actor and
 * workspace the RPC receives come from {@link MatchVideoMutationAccess},
 * which only `access.ts` can construct. `ReserveUploadInput` has no field a
 * body could populate with an id, a key or a URL.
 *
 * Injected (`PrepareUploadDeps`) so the spec can prove a refused request
 * called neither `reserve` nor `mintUploadCredential`.
 */

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkAttachmentSize,
  MATCH_VIDEO_EXTENSIONS,
} from "@/lib/match-video/limits";
import {
  matchVideoError,
  ok,
  type ExpectedActiveAttachment,
  type MatchVideoResult,
  type ReserveUploadRequest,
  type ReserveUploadResult,
} from "@/lib/match-video/types";

import {
  authorizeMatchVideoMutation,
  isUuid,
  type MatchVideoAccessDeps,
  type MatchVideoMutationAccess,
} from "./access";
import {
  checkSameOrigin,
  errorResponse,
  jsonResponse,
  MUTATION_BODY_MAX_BYTES,
  readBoundedJson,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "./http";
import { matchVideoRpcError } from "./rpc-errors";
import {
  ATTACHMENT_UPLOAD_SAS_TTL_SECONDS,
  type AttachmentStorageRow,
  type AttachmentUploadCredential,
} from "./storage";

const LOG = "[match-video-uploads]";

/* -------------------------------------------------------------------------
 * Body
 * ---------------------------------------------------------------------- */

const REQUEST_FIELDS = new Set<keyof ReserveUploadRequest>([
  "filename",
  "sizeBytes",
  "contentType",
  "clientRequestId",
  "expectedActive",
]);

/** RFC 2045 token on each side of the slash — enough to say "this is a type". */
const MIME_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function invalid(detail: string): HttpResult<never> {
  return { ok: false, error: transportError("invalid_request", detail) };
}

/**
 * The five contract fields, strictly, and nothing else.
 *
 * Strict because the contract says the server owns identity, storage and
 * timing: an unknown key is not ignored, it is the reason for the refusal,
 * so a client that starts sending `attachmentId` learns it on the first
 * request rather than wondering why the field had no effect. `expectedActive`
 * must be PRESENT — `null` and omitted are different claims (see the type's
 * own comment), and only one of them is a claim.
 *
 * Size violations answer with the domain codes (413 `file_too_large` /
 * `empty_file`), an unsupported container with `unsupported_media` (422);
 * everything else that is wrong with the body is `invalid_request` (400).
 */
export function parseReserveUploadBody(
  body: unknown,
): HttpResult<ReserveUploadRequest> {
  if (!isPlainObject(body)) return invalid("body_not_object");

  for (const key of Object.keys(body)) {
    if (!REQUEST_FIELDS.has(key as keyof ReserveUploadRequest)) {
      return invalid(`unexpected_field:${key}`);
    }
  }

  const { filename, sizeBytes, contentType, clientRequestId } = body;

  if (typeof filename !== "string") return invalid("filename_type");
  const name = filename.trim();
  if (name.length === 0 || name.length > 255) return invalid("filename_length");
  // Path separators and control characters have no place in a display name,
  // and the RPC derives the blob extension from the tail of this string.
  if (/[\\/\x00-\x1f\x7f]/.test(name)) return invalid("filename_chars");
  const extension = name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0].toLowerCase();
  if (
    !extension ||
    !(MATCH_VIDEO_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return {
      ok: false,
      error: matchVideoError("unsupported_media", "extension"),
    };
  }

  if (typeof sizeBytes !== "number") return invalid("size_type");
  const size = checkAttachmentSize(sizeBytes);
  if (!size.ok) return size;

  if (typeof contentType !== "string") return invalid("content_type_type");
  const type = contentType.trim();
  if (!MIME_PATTERN.test(type)) return invalid("content_type_format");

  if (!isUuid(clientRequestId)) return invalid("client_request_id");

  if (!("expectedActive" in body)) return invalid("expected_active_missing");
  const expectedActive = parseExpectedActive(body.expectedActive);
  if (!expectedActive.ok) return expectedActive;

  return ok({
    filename: name,
    sizeBytes: size.value,
    contentType: type,
    clientRequestId: clientRequestId.toLowerCase(),
    expectedActive: expectedActive.value,
  });
}

function parseExpectedActive(
  value: unknown,
): HttpResult<ExpectedActiveAttachment | null> {
  if (value === null) return ok(null);
  if (!isPlainObject(value)) return invalid("expected_active_type");
  for (const key of Object.keys(value)) {
    if (key !== "id" && key !== "version") {
      return invalid(`expected_active_field:${key}`);
    }
  }
  if (!isUuid(value.id)) return invalid("expected_active_id");
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 0
  ) {
    return invalid("expected_active_version");
  }
  return ok({ id: value.id.toLowerCase(), version: value.version });
}

/* -------------------------------------------------------------------------
 * Reservation seam
 * ---------------------------------------------------------------------- */

/**
 * What the reservation RPC is called with. Two of the three parts are the
 * proof of authorization (`access` — only `access.ts` makes one) and the
 * server's own clock; the third is the validated body, which by
 * construction carries no id, key or URL.
 */
export interface ReserveUploadInput {
  readonly access: MatchVideoMutationAccess;
  readonly request: ReserveUploadRequest;
  /** Persisted by the RPC BEFORE any credential is minted against it. */
  readonly uploadSasExpiresAt: Date;
}

/** T3's `match_video_reserve_upload` row, as the storage adapter reads it. */
export interface ReservedAttachment extends AttachmentStorageRow {
  /** ISO 8601 — the expiry the database now holds. */
  upload_sas_expires_at: string;
  /** True when this call found the same attempt rather than creating one. */
  reused: boolean;
}

export interface PrepareUploadDeps extends MatchVideoAccessDeps {
  /** Origins a mutation may come from, beyond the request's own. */
  allowedOrigins?: readonly string[];
  /** Injectable clock, so a spec can pin the expiry it expects. */
  now?: () => Date;
  /** T3's reservation transaction. Never reached by a refused request. */
  reserve(input: ReserveUploadInput): Promise<HttpResult<ReservedAttachment>>;
  /**
   * The one seam that signs. Called only after `reserve` has committed
   * `notAfter`; must return a credential ending no later than it.
   */
  mintUploadCredential(
    row: AttachmentStorageRow,
    notAfter: Date,
  ): MatchVideoResult<AttachmentUploadCredential>;
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

export async function handlePrepareUpload(
  request: Request,
  matchId: string,
  deps: PrepareUploadDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  // Sign-in before the body: `authorizeMatchVideoMutation` asks it again as
  // its own first step, but asking here means an anonymous caller is
  // answered before a single byte of their body is read.
  if (!(await deps.currentUserId())) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  const raw = await readBoundedJson(request, MUTATION_BODY_MAX_BYTES);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = parseReserveUploadBody(raw.value);
  if (!parsed.ok) return errorResponse(parsed.error);
  const body = parsed.value;

  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} refused — ${access.error.detail}`, { matchId });
    return errorResponse(access.error);
  }

  // The expiry is chosen here, handed to the RPC, and only after the RPC has
  // committed it does a credential get cut — to end no later than it.
  const now = deps.now?.() ?? new Date();
  const uploadSasExpiresAt = new Date(
    now.getTime() + ATTACHMENT_UPLOAD_SAS_TTL_SECONDS * 1000,
  );

  const reserved = await deps.reserve({
    access: access.value,
    request: body,
    uploadSasExpiresAt,
  });
  if (!reserved.ok) {
    console.log(`${LOG} reservation refused — ${reserved.error.detail}`, {
      matchId,
      clientRequestId: body.clientRequestId,
    });
    return errorResponse(reserved.error);
  }
  const row = reserved.value;

  // The row's recorded expiry, not the one proposed: an identical retry gets
  // `greatest(existing, proposed)` back, and the credential must honour what
  // the database holds.
  const notAfter = new Date(row.upload_sas_expires_at);
  const minted = deps.mintUploadCredential(row, notAfter);
  if (!minted.ok) {
    // The reservation stands — a retry with the same client request id finds
    // it again and gets a credential then. Nothing to roll back: no bytes
    // can have moved, and the row's expiry already tells cleanup when it
    // may collect the (empty) staged key.
    console.error(`${LOG} could not mint upload credential`, {
      matchId,
      attachmentId: row.id,
      detail: minted.error.detail,
    });
    return errorResponse(minted.error);
  }

  console.log(`${LOG} ${row.reused ? "reused" : "reserved"}`, {
    matchId,
    attachmentId: row.id,
    expiresAt: minted.value.expiresAt.toISOString(),
    // Never the URL: it carries `sig=`.
  });

  const result: ReserveUploadResult = {
    attachmentId: row.id,
    uploadUrl: minted.value.uploadUrl,
    uploadExpiresAt: minted.value.expiresAt.toISOString(),
  };
  return jsonResponse(result, row.reused ? 200 : 201);
}

/* -------------------------------------------------------------------------
 * Production reservation
 * ---------------------------------------------------------------------- */

interface ReserveRpcRow {
  attachment_id: string;
  staged_blob_key: string;
  final_blob_key: string;
  upload_sas_expires_at: string;
  reused: boolean;
}

/**
 * `reserve` over the real RPC, through the service-role client. The actor
 * and workspace arguments are read off the branded access value — the only
 * place they can come from — and the RPC rechecks all of them in SQL.
 */
export function rpcReserveUpload(
  admin: SupabaseClient,
): PrepareUploadDeps["reserve"] {
  return async ({ access, request, uploadSasExpiresAt }) => {
    const { data, error } = await admin.rpc("match_video_reserve_upload", {
      p_actor_id: access.actor.id,
      p_workspace_kind: access.workspace.kind,
      p_workspace_id: access.workspace.id,
      p_match_id: access.match.id,
      p_filename: request.filename,
      p_declared_size_bytes: request.sizeBytes,
      p_declared_content_type: request.contentType,
      p_client_request_id: request.clientRequestId,
      p_expected_active_id: request.expectedActive?.id ?? null,
      p_expected_active_version: request.expectedActive?.version ?? null,
      p_upload_sas_expires_at: uploadSasExpiresAt.toISOString(),
    });

    if (error) {
      const mapped = matchVideoRpcError(error);
      if (mapped) return { ok: false, error: mapped };
      console.error(`${LOG} reservation RPC failed`, {
        matchId: access.match.id,
        sqlstate: error.code,
        message: error.message,
      });
      return {
        ok: false,
        error: transportError(
          "internal_error",
          `rpc_${error.code || "unknown"}`,
        ),
      };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      ReserveRpcRow | undefined;
    if (!row) {
      console.error(`${LOG} reservation RPC returned no row`, {
        matchId: access.match.id,
      });
      return {
        ok: false,
        error: transportError("internal_error", "rpc_empty"),
      };
    }

    return ok<ReservedAttachment>({
      id: row.attachment_id,
      staged_blob_key: row.staged_blob_key,
      final_blob_key: row.final_blob_key,
      // Nothing has been measured yet: the ETag is learned by completion
      // (T10) after the bytes land, and the upload credential needs no ETag.
      source_etag: null,
      upload_sas_expires_at: row.upload_sas_expires_at,
      reused: row.reused,
    });
  };
}

export type { MatchVideoHttpError };
