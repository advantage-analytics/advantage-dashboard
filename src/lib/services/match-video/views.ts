/**
 * Counting a view of a match video (SwingVision Add video T8).
 *
 *   POST /api/matches/[matchId]/video/viewed      no body
 *
 * A view restarts the video's retention clock — `coalesce(last_viewed_at,
 * activated_at)`, see `lib/match-video/expiry.ts`. The Film player and the
 * fullscreen room send this once per loaded source, on its first `play`
 * event. It is deliberately NOT folded into `GET /video`: that route is
 * write-free, runs on every credential refresh, and is rendered on the server
 * without anyone pressing play (`playback.ts`).
 *
 * ORDER:
 *
 *   1. same-origin   stateless; a cross-site request touches nothing
 *   2. visibility    sign-in, then the match through the caller's OWN client
 *                    (`authorizeMatchVisibility`) — 401 for no session, 404
 *                    for a match that does not exist for them
 *   3. record        `match_video_record_view`, service-role only, which
 *                    stamps the ACTIVE attachment and nothing else
 *
 * VISIBILITY, NOT OWNERSHIP. Anyone who may watch the video may count a view
 * — a teammate playing a coach's upload keeps it alive just as the uploader
 * would. "Keep this video" (T10) uses this same endpoint under the same rule.
 *
 * NO ACTIVE VIDEO IS AN ANSWER, NOT AN ERROR: `200 {"view": null}`, and the
 * RPC wrote nothing. Same envelope as the populated answer, like playback's
 * `{"attachment": null}`.
 *
 * Injected (`RecordViewDeps`) so the handler spec can prove a refused request
 * never reached the RPC.
 */

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ok } from "@/lib/match-video/types";

import {
  authorizeMatchVisibility,
  type MatchVideoAccessDeps,
  type MatchVisibilityAccess,
} from "./access";
import {
  checkSameOrigin,
  errorResponse,
  jsonResponse,
  transportError,
  type HttpResult,
} from "./http";
import { matchVideoRpcError } from "./rpc-errors";

const LOG = "[match-video-views]";

/* -------------------------------------------------------------------------
 * Contract
 * ---------------------------------------------------------------------- */

export interface RecordedView {
  attachmentId: string;
  /** ISO 8601 — the new start of the retention clock. */
  lastViewedAt: string;
}

export interface RecordViewResult {
  /** Null when the match has no active video; nothing was written. */
  view: RecordedView | null;
}

/* -------------------------------------------------------------------------
 * Deps
 * ---------------------------------------------------------------------- */

export interface RecordViewDeps extends MatchVideoAccessDeps {
  allowedOrigins?: readonly string[];
  /**
   * `match_video_record_view`. The only write on this path. Null when the
   * match has no active attachment.
   */
  recordView(
    access: MatchVisibilityAccess,
  ): Promise<HttpResult<RecordedView | null>>;
}

/* -------------------------------------------------------------------------
 * Handler
 * ---------------------------------------------------------------------- */

export async function handleRecordView(
  request: Request,
  matchId: string,
  deps: RecordViewDeps,
): Promise<NextResponse> {
  const origin = checkSameOrigin(request, deps.allowedOrigins);
  if (origin) return errorResponse(origin);

  const access = await authorizeMatchVisibility(matchId, deps);
  if (!access.ok) return errorResponse(access.error);

  const recorded = await deps.recordView(access.value);
  if (!recorded.ok) return errorResponse(recorded.error);

  const result: RecordViewResult = { view: recorded.value };
  return jsonResponse(result, 200);
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

interface RecordViewRpcRow {
  attachment_id: string;
  last_viewed_at: string;
}

/** `recordView` over the real RPC, through the service-role client. */
export function rpcRecordView(
  admin: SupabaseClient,
): RecordViewDeps["recordView"] {
  return async (access) => {
    const { data, error } = await admin.rpc("match_video_record_view", {
      p_match_id: access.match.id,
    });

    if (error) {
      const mapped = matchVideoRpcError(error);
      if (mapped) return { ok: false, error: mapped };
      console.error(`${LOG} record-view RPC failed`, {
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
      RecordViewRpcRow | null | undefined;
    if (!row) return ok<RecordedView | null>(null);

    return ok<RecordedView | null>({
      attachmentId: row.attachment_id,
      lastViewedAt: row.last_viewed_at,
    });
  };
}
