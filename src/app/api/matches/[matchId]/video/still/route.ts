/**
 * `GET /api/matches/[matchId]/video/still` — where a list row can take one
 * frame of a match's video from, for anyone who can SEE the match.
 *
 * `GET .../video` answers only for an attached recording (the SwingVision
 * lineage), so a row that asked it showed nothing for every match analyzed by
 * Advantage Intelligence. This asks `getMatchVideo()` instead — the match
 * report's own loader — which covers both lineages behind the same visibility
 * check, and mints the same short-lived, read-only URL.
 *
 * `{ still: null }` is the normal answer for a match with no video, exactly as
 * `attachment: null` is on the route above: one key, one envelope, never a
 * 404. GET only; nothing here writes, and watching a frame does not restart
 * the retention clock.
 */

import type { NextRequest } from "next/server";

import { getMatchVideo } from "@/lib/data/match-video-server";
import { jsonResponse } from "@/lib/services/match-video/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface MatchStillResult {
  still: {
    /** A short-lived, read-only URL to the match video. */
    url: string;
    /**
     * Seconds of this file that come before the match's first point: the
     * lead-in of a recording that was rolling early, 0 otherwise.
     */
    leadSeconds: number;
  } | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const video = await getMatchVideo(matchId);
  const body: MatchStillResult = {
    still: video
      ? { url: video.url, leadSeconds: Math.max(0, -video.startTimeSeconds) }
      : null,
  };
  return jsonResponse(body);
}
