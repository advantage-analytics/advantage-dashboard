import type { NextRequest } from "next/server";

import { UUID_RE } from "@/lib/admin/validation";
import { activeAttachment } from "@/lib/data/match-video-seams";
import { errorResponse } from "@/lib/services/match-video/http";
import {
  azurePlaybackStorage,
  respondWithPlayback,
} from "@/lib/services/match-video/playback";
import { checkAdmin } from "@/lib/services/programs/admin-guard";
import { matchVideoError } from "@/lib/match-video/types";

/**
 * `GET /admin/matches/[matchId]/playback` — the admin report's playback
 * refresh, the admin twin of `/api/share/[token]/video`.
 *
 * The film room holds a thirty-minute read-only URL and asks for a fresh one
 * near expiry. The dashboard's route (`/api/matches/[matchId]/video`) asks the
 * caller's session whether they can see the match, and an admin is usually in
 * neither seat nor the program — so here the question is `is_admin`, checked
 * per request, and everything below it is the same ladder
 * (`respondWithPlayback`). Nothing here writes: no view is recorded.
 *
 * One 404 for every refusal at the gate, as the admin layout answers a
 * non-admin: it does not confirm the route exists.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const admin = await checkAdmin();
  if (!admin.ok || !UUID_RE.test(matchId)) {
    return errorResponse(matchVideoError("match_not_found", "admin_gate"));
  }
  return respondWithPlayback(matchId, {
    loadActiveAttachment: activeAttachment,
    ...azurePlaybackStorage(),
  });
}
