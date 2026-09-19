/**
 * Plan step 8, alignment half — correct a published attachment's offset
 * without re-uploading a byte.
 *
 *   PATCH /api/matches/[matchId]/video/alignment
 *
 * Someone watched the video, saw that the first point's serve contact is not
 * where the wizard was told it was, and is moving it. The file is already
 * stored, already probed and already active; the only thing that changes is
 * the single number that maps the imported source clock onto it.
 *
 * NO UPLOAD HAPPENS HERE, AND CANNOT. {@link UpdateAlignmentDeps} is the
 * complete list of what this path may call, and it has no storage seam at
 * all — no SAS signer, no blob client, no copy. That is the same structural
 * proof T9's cancellation uses: not a rule someone has to remember, but an
 * absence the type enforces and the route file's import list confirms.
 *
 * THE OFFSET IS RECOMPUTED, NEVER ADJUSTED. T4's `match_video_correct_alignment`
 * derives it from the source rows' anchor and the SAVED verified duration —
 * `anchorSourceSeconds - confirmedVideoTime` — exactly as T1's
 * `planAlignment` does in the browser. Correcting twice to the same video
 * position therefore lands on the same offset both times. An implementation
 * that nudged the previous offset by a delta would drift the whole match a
 * little further on every correction, and no test of a single correction
 * would ever notice.
 *
 * THE VERIFIED DURATION IS THE SAVED ONE. Coverage is rechecked against what
 * the server measured when the file was published, not against anything this
 * request carries and not by re-probing the blob. A correction that would
 * push the final point past the end of the recording is refused with
 * `insufficient_coverage` — the one code that says "This video is not long
 * enough." A match whose import never had usable timing is
 * `missing_source_timing`, and a time that is not a time at all is
 * `invalid_alignment`; those two say something else, because sending a
 * person hunting for a longer recording they do not need is worse than
 * saying nothing.
 *
 * A NO-OP IS NOT A WRITE. If the confirmed time resolves to the offset the
 * row already has, T4 returns `changed = false` and the version does NOT
 * move — so a second tab holding that version stays valid, and a user who
 * re-saves the same alignment does not invalidate their own other window.
 *
 * SOURCE ROWS ARE READ-ONLY. `points`, `shots`, `matches` and `match_stats`
 * are read by T4 inside the transaction and written by nothing: the
 * migration asserts it over the function bodies. Attaching a video never
 * rewrites the imported match.
 *
 * Injected (`UpdateAlignmentDeps`) so the whole refusal ladder runs in a
 * spec with no session, no database and — the point — no Azure.
 */

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseConfirmedVideoTime } from "@/lib/match-video/alignment";
import {
  matchVideoError,
  ok,
  type ActiveAttachment,
  type UpdateAlignmentRequest,
  type UpdateAlignmentResult,
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
  invalidRequest as invalid,
  isPlainObject,
  jsonResponse,
  MUTATION_BODY_MAX_BYTES,
  readBoundedJson,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "./http";
import { matchVideoRpcError, type RpcErrorLike } from "./rpc-errors";

const LOG = "[match-video-alignment]";

/* -------------------------------------------------------------------------
 * Body
 * ---------------------------------------------------------------------- */

/** The validated body. All three fields are required. */
export interface UpdateAlignmentBody {
  attachmentId: string;
  /** The version the caller believes is active. T4 does the CAS. */
  expectedVersion: number;
  /** Millisecond-rounded, non-negative. */
  confirmedVideoTimeSeconds: number;
}

const BODY_FIELDS = new Set<keyof UpdateAlignmentRequest>([
  "attachmentId",
  "expectedVersion",
  "confirmedVideoTimeSeconds",
]);

/**
 * Three fields, strictly, and nothing else.
 *
 * Unlike the upload routes, the attachment id arrives in the BODY here: the
 * path names the match, and the row being corrected is whichever one the
 * caller believes is active. It still carries no authority — T4 requires it
 * to be the match's own ACTIVE row, at the expected version, under the
 * parent match lock.
 *
 * Everything a correction could be lied to about — the offset itself, the
 * duration, the storage keys, the actor, the workspace — is refused BY NAME
 * with a 400 rather than ignored, for the reason `parseReserveUploadBody`
 * gives: a client that starts sending `offsetSeconds` should learn on its
 * first request that the server derives it. The confirmed time goes through
 * T1's strict parser, so a malformed one is `invalid_alignment` (422) and
 * says so in the field's own words, not `invalid_request`.
 */
export function parseUpdateAlignmentBody(
  body: unknown,
): HttpResult<UpdateAlignmentBody> {
  if (!isPlainObject(body)) return invalid("body_not_object");

  for (const key of Object.keys(body)) {
    if (!BODY_FIELDS.has(key as keyof UpdateAlignmentRequest)) {
      return invalid(`unexpected_field:${key}`);
    }
  }

  if (!("attachmentId" in body)) return invalid("attachment_id_missing");
  if (!isUuid(body.attachmentId)) return invalid("attachment_id");

  if (!("expectedVersion" in body)) return invalid("expected_version_missing");
  const { expectedVersion } = body;
  if (
    typeof expectedVersion !== "number" ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return invalid("expected_version");
  }

  if (!("confirmedVideoTimeSeconds" in body)) {
    return invalid("confirmed_time_missing");
  }
  const confirmed = parseConfirmedVideoTime(body.confirmedVideoTimeSeconds);
  if (!confirmed.ok) return confirmed;

  return ok({
    attachmentId: body.attachmentId.toLowerCase(),
    expectedVersion,
    confirmedVideoTimeSeconds: confirmed.value,
  });
}

/* -------------------------------------------------------------------------
 * Database seam — T4's correction transaction, and nothing else
 * ---------------------------------------------------------------------- */

export interface CorrectAlignmentInput {
  readonly access: MatchVideoMutationAccess;
  readonly attachmentId: string;
  readonly expectedVersion: number;
  readonly confirmedVideoTimeSeconds: number;
}

/** T4's `match_video_correct_alignment` row. */
export interface CorrectedAlignment {
  attachment_id: string;
  version: number;
  offset_seconds: number;
  confirmed_video_time_seconds: number;
  duration_seconds: number;
  content_type: string;
  filename: string;
  /** False when the correction resolved to the alignment already saved. */
  changed: boolean;
}

/**
 * Note what is NOT here, and note that it is the whole design: no signer, no
 * blob client, no probe, no copy, no upload credential of any kind. The
 * bytes are already stored and already verified; a correction is a number.
 *
 * The one privileged call is `correct`, which recomputes the offset from the
 * source rows and the saved verified duration inside one transaction.
 */
export interface UpdateAlignmentDeps extends MatchVideoAccessDeps {
  allowedOrigins?: readonly string[];
  correct(
    input: CorrectAlignmentInput,
  ): Promise<HttpResult<CorrectedAlignment>>;
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

/**
 * `PATCH /api/matches/[matchId]/video/alignment`
 *
 * The edge first (same-origin, sign-in, bounded body, strict shape), then
 * access — RLS visibility, creator, SwingVision provenance and the exact
 * active workspace — and only then the transaction. A caller whose
 * membership or workspace changed since they opened the editor is refused
 * here, before anything is corrected, exactly as completion refuses a poll
 * that outlived its permission.
 */
export async function handleUpdateAlignment(
  request: Request,
  matchId: string,
  deps: UpdateAlignmentDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  if (!(await deps.currentUserId())) {
    return errorResponse(matchVideoError("unauthenticated", "no_session"));
  }

  const raw = await readBoundedJson(request, MUTATION_BODY_MAX_BYTES);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = parseUpdateAlignmentBody(raw.value);
  if (!parsed.ok) return errorResponse(parsed.error);
  const body = parsed.value;

  const access = await authorizeMatchVideoMutation(matchId, deps);
  if (!access.ok) {
    console.log(`${LOG} refused — ${access.error.detail}`, { matchId });
    return errorResponse(access.error);
  }

  const context = { matchId, attachmentId: body.attachmentId };

  let corrected: HttpResult<CorrectedAlignment>;
  try {
    corrected = await deps.correct({
      access: access.value,
      attachmentId: body.attachmentId,
      expectedVersion: body.expectedVersion,
      confirmedVideoTimeSeconds: body.confirmedVideoTimeSeconds,
    });
  } catch (cause) {
    // The seam threw instead of answering. Nothing was published and nothing
    // was deleted — the only statement that can change this row lives inside
    // the transaction that just failed, so the saved alignment stands.
    console.error(`${LOG} unhandled failure`, { ...context, cause });
    return errorResponse(transportError("internal_error", "unhandled"));
  }

  if (!corrected.ok) {
    console.log(`${LOG} correction refused — ${corrected.error.detail}`, {
      ...context,
      code: corrected.error.code,
    });
    return errorResponse(corrected.error);
  }

  const row = corrected.value;
  console.log(`${LOG} ${row.changed ? "corrected" : "unchanged"}`, {
    ...context,
    version: row.version,
  });

  const attachment: ActiveAttachment = {
    id: row.attachment_id,
    version: row.version,
    offsetSeconds: row.offset_seconds,
    confirmedVideoTimeSeconds: row.confirmed_video_time_seconds,
    durationSeconds: row.duration_seconds,
    contentType: row.content_type,
    filename: row.filename,
  };
  const result: UpdateAlignmentResult = { attachment };
  return jsonResponse(result, 200);
}

/* -------------------------------------------------------------------------
 * Production database seam
 * ---------------------------------------------------------------------- */

interface CorrectRpcRow extends Omit<
  CorrectedAlignment,
  "confirmed_video_time_seconds"
> {
  /** `numeric` arrives as a string from PostgREST. */
  confirmed_video_time_seconds: number | string;
}

/**
 * `correct` over the real RPC, through the service-role client.
 *
 * The actor and workspace come off the branded access value — the only place
 * they can come from — and `match_video_correct_alignment` rechecks all three
 * access rules in SQL before it reads a thing. T4 raises the
 * `MatchVideoErrorCode` as the exception message, so `matchVideoRpcError`
 * turns `stale_attachment`, `mode_conflict`, `missing_source_timing`,
 * `invalid_alignment` and `insufficient_coverage` into the status each code
 * already names; anything it does not recognise is this side's failure.
 */
export function rpcCorrectAlignment(
  admin: SupabaseClient,
): UpdateAlignmentDeps["correct"] {
  return async ({
    access,
    attachmentId,
    expectedVersion,
    confirmedVideoTimeSeconds,
  }) => {
    const { data, error } = await admin.rpc("match_video_correct_alignment", {
      p_actor_id: access.actor.id,
      p_workspace_kind: access.workspace.kind,
      p_workspace_id: access.workspace.id,
      p_match_id: access.match.id,
      p_attachment_id: attachmentId,
      p_expected_version: expectedVersion,
      p_confirmed_video_time_seconds: confirmedVideoTimeSeconds,
    });

    const context = { matchId: access.match.id, attachmentId };

    if (error) {
      const mapped = matchVideoRpcError(error as RpcErrorLike);
      if (mapped) return { ok: false, error: mapped };
      console.error(`${LOG} correction RPC failed`, {
        ...context,
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
      CorrectRpcRow | undefined;
    if (!row) {
      console.error(`${LOG} correction RPC returned no row`, context);
      return {
        ok: false,
        error: transportError("internal_error", "rpc_empty"),
      };
    }

    return ok<CorrectedAlignment>({
      ...row,
      confirmed_video_time_seconds: Number(row.confirmed_video_time_seconds),
    });
  };
}

export type { MatchVideoHttpError };
