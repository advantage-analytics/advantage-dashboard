/**
 * The upload half of plan step 6 — preparation, renewal and cancellation of a
 * SwingVision video attachment attempt.
 *
 *   POST   /api/matches/[matchId]/video/uploads                     reserve
 *   POST   /api/matches/[matchId]/video/uploads/[attachmentId]/renew  renew
 *   DELETE /api/matches/[matchId]/video/uploads/[attachmentId]        cancel
 *
 * All three share the edge (`http.ts`), the access gate (`access.ts`) and the
 * RPC error mapping (`rpc-errors.ts`); the notes below describe preparation,
 * and {@link handleRenewUpload} / {@link handleCancelUpload} carry the two
 * rules that are theirs alone.
 *
 * `POST /api/matches/[matchId]/video/uploads` — reserve an attachment attempt
 * and hand back a write credential for its staged key.
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
  type CancelUploadResult,
  type ExpectedActiveAttachment,
  type MatchVideoResult,
  type RenewUploadResult,
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
  readNoMetadataBody,
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

/* -------------------------------------------------------------------------
 * Renewal — the attachment id, and nothing else
 * ---------------------------------------------------------------------- */

/**
 * The attachment id from the PATH, checked for shape only.
 *
 * A non-UUID cannot name a row — it is a type error against a `uuid` column,
 * not a lookup — so it is refused here, the same 404 `access.ts` gives a
 * malformed match id. A WELL-FORMED id is never checked here: whether it
 * belongs to this caller and this match is the database's question, and
 * {@link rpcRenewUpload} / {@link rpcCancelUpload} hand it to T3 unexamined
 * so that the `match_id = p_match_id` predicate and the `uploaded_by` test
 * inside the transaction are what refuse a forged or foreign one. A
 * handler-side guess would be a second, weaker copy of a rule SQL already
 * enforces under the row lock.
 */
function parseAttachmentId(attachmentId: string): HttpResult<string> {
  if (!isUuid(attachmentId)) {
    return {
      ok: false,
      error: matchVideoError("match_not_found", "malformed_attachment_id"),
    };
  }
  return ok(attachmentId.toLowerCase());
}

export interface RenewUploadInput {
  readonly access: MatchVideoMutationAccess;
  /** From the path. Carries no authority; T3 rechecks ownership in SQL. */
  readonly attachmentId: string;
  /** Persisted by the RPC BEFORE any credential is minted against it. */
  readonly uploadSasExpiresAt: Date;
}

/**
 * T3's `match_video_renew_upload` row.
 *
 * It returns the staged key and the expiry and NOT the final key, which is
 * the shape the operation deserves: renewal signs a write for the staging
 * object, so the name of the published object has no business in it.
 */
export interface RenewedAttachment {
  id: string;
  staged_blob_key: string;
  /** ISO 8601 — `greatest(stored, proposed)`, as the row now holds it. */
  upload_sas_expires_at: string;
}

export interface RenewUploadDeps extends MatchVideoAccessDeps {
  allowedOrigins?: readonly string[];
  now?: () => Date;
  /** T3's renewal transaction. Never reached by a refused request. */
  renew(input: RenewUploadInput): Promise<HttpResult<RenewedAttachment>>;
  /** The same signer preparation uses, called only after `renew` committed. */
  mintUploadCredential(
    row: AttachmentStorageRow,
    notAfter: Date,
  ): MatchVideoResult<AttachmentUploadCredential>;
}

/**
 * `POST /api/matches/[matchId]/video/uploads/[attachmentId]/renew`
 *
 * A browser whose six-hour write window is running out asks for a longer one
 * for the SAME staged key. Nothing about the attempt may change — there is no
 * body to change it with — so the order is preparation's, minus the parsing:
 * origin, sign-in, id shape, empty body, access, renew, mint.
 *
 * Renew BEFORE mint, for preparation's reason: the expiry the credential is
 * cut against must already be committed, or a process that dies in between
 * leaves a live credential the cleanup worker knows nothing about. The
 * credential is bounded by the expiry the ROW now holds, which T3 sets to
 * `greatest(stored, proposed)` — a renewal never rolls a window back, so a
 * request racing an earlier one cannot shorten a credential already issued.
 *
 * Retired and active rows are refused by T3 (`mode_conflict`), and a row
 * under a live finalization lease by T3 as well
 * (`pending_attempt_conflict` / `finalizing`) — once completion is verifying
 * the staged bytes, another write credential would let them change underneath
 * it. This handler adds no rule of its own, so there is no second opinion to
 * drift from the transaction's.
 */
export async function handleRenewUpload(
  request: Request,
  matchId: string,
  attachmentId: string,
  deps: RenewUploadDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  if (!(await deps.currentUserId())) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  const id = parseAttachmentId(attachmentId);
  if (!id.ok) return errorResponse(id.error);

  const body = await readNoMetadataBody(request);
  if (body) return errorResponse(body);

  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} renewal refused — ${access.error.detail}`, { matchId });
    return errorResponse(access.error);
  }

  const now = deps.now?.() ?? new Date();
  const uploadSasExpiresAt = new Date(
    now.getTime() + ATTACHMENT_UPLOAD_SAS_TTL_SECONDS * 1000,
  );

  const renewed = await deps.renew({
    access: access.value,
    attachmentId: id.value,
    uploadSasExpiresAt,
  });
  if (!renewed.ok) {
    console.log(`${LOG} renewal refused — ${renewed.error.detail}`, {
      matchId,
      attachmentId: id.value,
    });
    return errorResponse(renewed.error);
  }
  const row = renewed.value;

  const notAfter = new Date(row.upload_sas_expires_at);
  const minted = deps.mintUploadCredential(
    {
      id: row.id,
      staged_blob_key: row.staged_blob_key,
      // T3's renewal RPC returns no final key, and a write credential must
      // never be able to name one. The empty string is not a key the signer
      // would accept for writing (`checkBlobKey` refuses it) and can never
      // equal a real staged key, so the signer's "the two keys must differ"
      // guard still holds against the only key in hand.
      final_blob_key: "",
      // Learned by completion (T10), after the bytes land. A write
      // credential is not conditioned on it.
      source_etag: null,
    },
    notAfter,
  );
  if (!minted.ok) {
    // The longer window is already recorded. A retry mints against it; the
    // row's expiry meanwhile tells cleanup when the staged key is free.
    console.error(`${LOG} could not mint renewed upload credential`, {
      matchId,
      attachmentId: row.id,
      detail: minted.error.detail,
    });
    return errorResponse(minted.error);
  }

  console.log(`${LOG} renewed`, {
    matchId,
    attachmentId: row.id,
    expiresAt: minted.value.expiresAt.toISOString(),
  });

  const result: RenewUploadResult = {
    attachmentId: row.id,
    uploadUrl: minted.value.uploadUrl,
    uploadExpiresAt: minted.value.expiresAt.toISOString(),
  };
  return jsonResponse(result, 200);
}

interface RenewRpcRow {
  attachment_id: string;
  staged_blob_key: string;
  upload_sas_expires_at: string;
}

/** `renew` over the real RPC, through the service-role client. */
export function rpcRenewUpload(
  admin: SupabaseClient,
): RenewUploadDeps["renew"] {
  return async ({ access, attachmentId, uploadSasExpiresAt }) => {
    const { data, error } = await admin.rpc("match_video_renew_upload", {
      p_actor_id: access.actor.id,
      p_workspace_kind: access.workspace.kind,
      p_workspace_id: access.workspace.id,
      p_match_id: access.match.id,
      p_attachment_id: attachmentId,
      p_upload_sas_expires_at: uploadSasExpiresAt.toISOString(),
    });

    if (error) {
      const mapped = matchVideoRpcError(error);
      if (mapped) return { ok: false, error: mapped };
      console.error(`${LOG} renewal RPC failed`, {
        matchId: access.match.id,
        attachmentId,
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
      RenewRpcRow | undefined;
    if (!row) {
      console.error(`${LOG} renewal RPC returned no row`, {
        matchId: access.match.id,
        attachmentId,
      });
      return {
        ok: false,
        error: transportError("internal_error", "rpc_empty"),
      };
    }

    return ok<RenewedAttachment>({
      id: row.attachment_id,
      staged_blob_key: row.staged_blob_key,
      upload_sas_expires_at: row.upload_sas_expires_at,
    });
  };
}

/* -------------------------------------------------------------------------
 * Cancellation — retire the record, never the bytes
 * ---------------------------------------------------------------------- */

export interface CancelUploadInput {
  readonly access: MatchVideoMutationAccess;
  readonly attachmentId: string;
}

/** T3's `match_video_cancel_upload` row. Always `retired` when it returns. */
export interface CancelledAttachment {
  id: string;
  state: string;
}

/**
 * Note what is NOT here: no signer, no storage adapter, no delete.
 *
 * That is the point, and it is structural rather than a convention someone
 * has to remember. A cancelled attempt may still have a live write SAS in a
 * browser that has not noticed yet; deleting the staged blob now would let
 * that upload recreate the key as an object no row points at — an untracked
 * blob nobody bills, finds or collects. T3 instead retires the row and sets
 * `cleanup_next_attempt_at` to the last issued SAS expiry, and the cleanup
 * worker (T14) takes the bytes after that. Cancellation's whole job is the
 * record.
 */
export interface CancelUploadDeps extends MatchVideoAccessDeps {
  allowedOrigins?: readonly string[];
  /** T3's cancellation transaction. The only privileged call in this path. */
  cancel(input: CancelUploadInput): Promise<HttpResult<CancelledAttachment>>;
}

/**
 * `DELETE /api/matches/[matchId]/video/uploads/[attachmentId]`
 *
 * Retire this caller's own pending attempt. Idempotent by construction: T3
 * answers `retired` for a row that is already retired rather than raising, so
 * a client that never learned whether its first DELETE arrived may simply
 * send it again — and MUST be able to, because the delivery this design
 * cannot rely on is exactly this one. A browser that is closed mid-upload
 * sends no cancellation at all; the attempt then sits pending until its SAS
 * expires and the cleanup worker collects it. Cancellation is the fast path,
 * never the only one.
 *
 * An ACTIVE attachment is refused (`mode_conflict`): cancelling is for
 * attempts, and retiring a published video here would leave the match with no
 * video at all. A row a completion request currently holds is refused too
 * (`pending_attempt_conflict` / `finalizing`) — the lease either commits or
 * lapses, and the retry after it does the right thing either way.
 */
export async function handleCancelUpload(
  request: Request,
  matchId: string,
  attachmentId: string,
  deps: CancelUploadDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  if (!(await deps.currentUserId())) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  const id = parseAttachmentId(attachmentId);
  if (!id.ok) return errorResponse(id.error);

  const body = await readNoMetadataBody(request);
  if (body) return errorResponse(body);

  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} cancellation refused — ${access.error.detail}`, {
      matchId,
    });
    return errorResponse(access.error);
  }

  const cancelled = await deps.cancel({
    access: access.value,
    attachmentId: id.value,
  });
  if (!cancelled.ok) {
    console.log(`${LOG} cancellation refused — ${cancelled.error.detail}`, {
      matchId,
      attachmentId: id.value,
    });
    return errorResponse(cancelled.error);
  }

  // The only state the RPC can return is `retired`; anything else means the
  // function and this wrapper have drifted, which is a bug here, not a
  // refusal to show the user.
  if (cancelled.value.state !== "retired") {
    console.error(`${LOG} cancellation returned an unexpected state`, {
      matchId,
      attachmentId: cancelled.value.id,
      state: cancelled.value.state,
    });
    return errorResponse(transportError("internal_error", "rpc_state"));
  }

  console.log(`${LOG} cancelled`, {
    matchId,
    attachmentId: cancelled.value.id,
  });

  const result: CancelUploadResult = {
    attachmentId: cancelled.value.id,
    state: "retired",
  };
  return jsonResponse(result, 200);
}

interface CancelRpcRow {
  attachment_id: string;
  state: string;
}

/** `cancel` over the real RPC, through the service-role client. */
export function rpcCancelUpload(
  admin: SupabaseClient,
): CancelUploadDeps["cancel"] {
  return async ({ access, attachmentId }) => {
    const { data, error } = await admin.rpc("match_video_cancel_upload", {
      p_actor_id: access.actor.id,
      p_workspace_kind: access.workspace.kind,
      p_workspace_id: access.workspace.id,
      p_match_id: access.match.id,
      p_attachment_id: attachmentId,
    });

    if (error) {
      const mapped = matchVideoRpcError(error);
      if (mapped) return { ok: false, error: mapped };
      console.error(`${LOG} cancellation RPC failed`, {
        matchId: access.match.id,
        attachmentId,
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
      CancelRpcRow | undefined;
    if (!row) {
      console.error(`${LOG} cancellation RPC returned no row`, {
        matchId: access.match.id,
        attachmentId,
      });
      return {
        ok: false,
        error: transportError("internal_error", "rpc_empty"),
      };
    }

    return ok<CancelledAttachment>({
      id: row.attachment_id,
      state: row.state,
    });
  };
}

export type { MatchVideoHttpError };
