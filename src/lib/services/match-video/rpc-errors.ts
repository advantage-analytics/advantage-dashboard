/**
 * Turn a refused attachment RPC into a `MatchVideoError`.
 *
 * The SQL functions in `supabase/migrations/20260919050413_*` (T3) and
 * `20260919052002_*` (T4) raise the `MatchVideoErrorCode` AS the exception
 * message and the cause slug as `DETAIL`, so the HTTP status comes from the
 * code's own table in `lib/match-video/types.ts`, not from the SQLSTATE. That
 * is what lets one mapping serve every route: T4's `22000` class carries
 * `missing_source_timing`, `invalid_alignment`, `insufficient_coverage`,
 * `unsupported_media`, `empty_file` and `file_too_large`, and each lands on
 * the status its code already names (422 or 413) without this module knowing
 * which function raised it.
 *
 * SQLSTATEs that carry no code in their message are the ones this module has
 * to decide about:
 *
 *   23505  unique violation — the partial "one pending per match/uploader"
 *          index catching a race the row lock did not; the loser is told what
 *          the lock would have told it: `pending_attempt_conflict`.
 *   40001  serialization failure   ┐ the transaction can simply be re-run, so
 *   40P01  deadlock detected       ┘ `storage_unavailable` — 503, try again.
 *   22023  malformed arguments — the wrapper sent something the function
 *          rejects. A server bug, never a user-facing code, so `null`: the
 *          route answers 500 and logs the SQLSTATE.
 *   anything else → `null`, for the same reason.
 *
 * Pure: no Supabase import. The shape is what `PostgrestError` carries.
 */

import {
  isMatchVideoErrorCode,
  matchVideoError,
  type MatchVideoError,
} from "@/lib/match-video/types";

export interface RpcErrorLike {
  /** SQLSTATE, as PostgREST reports it. */
  code?: string | null;
  message: string;
  /** The exception's DETAIL. */
  details?: string | null;
}

const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

/**
 * The `MatchVideoError` a refused RPC maps to, or `null` for an error that is
 * not a refusal — one the route should treat as its own failure.
 */
export function matchVideoRpcError(
  error: RpcErrorLike,
): MatchVideoError | null {
  const sqlstate = error.code ?? "";
  const detail = error.details?.trim() || `sqlstate_${sqlstate || "unknown"}`;

  if (isMatchVideoErrorCode(error.message)) {
    return matchVideoError(error.message, detail);
  }
  if (sqlstate === "23505") {
    return matchVideoError("pending_attempt_conflict", "unique_violation");
  }
  if (RETRYABLE_SQLSTATES.has(sqlstate)) {
    return matchVideoError("storage_unavailable", `transaction_${sqlstate}`);
  }
  return null;
}
