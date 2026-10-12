import type { NextRequest } from "next/server";

import { readShareToken } from "@/lib/data/match-share-format";
import { sharedVideoMatchId } from "@/lib/data/match-share-server";
import { activeAttachment } from "@/lib/data/match-video-seams";
import { errorResponse } from "@/lib/services/match-video/http";
import {
  azurePlaybackStorage,
  respondWithPlayback,
} from "@/lib/services/match-video/playback";
import { matchVideoError } from "@/lib/match-video/types";

/**
 * `GET /api/share/[token]/video` — the public share page's playback refresh.
 *
 * `/m/[token]` plays the match video when its link carries it. The player
 * there holds a thirty-minute read-only URL and asks for a fresh one as it
 * nears expiry, exactly as the dashboard's does through
 * `GET /api/matches/[matchId]/video` — but that route asks the caller's
 * session whether they can see the match, and a reader with a link has no
 * session. Here the TOKEN is the question: `sharedVideoMatchId` answers with
 * a match only for a live link whose video was added by someone who may
 * still share it, and everything below that is the same ladder (`respondWithPlayback`).
 *
 * One 404 for every refusal AT THE GATE — a bad token, a link turned off, a
 * link without the video, a sharer who may no longer share it — so the route
 * cannot be used to learn which. Past the gate it answers as the dashboard's
 * route does (the metadata, an empty answer, a stale or unreachable file):
 * those only tell a reader who already holds a link carrying the video what
 * the page itself shows them. No CORS header and `no-store`, as on that route;
 * nothing here writes, and watching through a link does not record a view.
 *
 * Only the attachment lineage has anything to refresh. An Advantage
 * Intelligence video answers `{ attachment: null }` and its player recovers
 * by reloading the page, which re-signs on the server.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const matchId = await sharedVideoMatchId(readShareToken(token));
  if (!matchId) {
    return errorResponse(matchVideoError("match_not_found", "share_token"));
  }
  return respondWithPlayback(matchId, {
    loadActiveAttachment: activeAttachment,
    ...azurePlaybackStorage(),
  });
}
