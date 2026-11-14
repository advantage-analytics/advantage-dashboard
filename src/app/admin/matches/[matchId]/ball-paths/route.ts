import type { NextRequest } from "next/server";

import { UUID_RE } from "@/lib/admin/validation";
import { matchVideoError } from "@/lib/match-video/types";
import { errorResponse } from "@/lib/services/match-video/http";
import { checkAdmin } from "@/lib/services/programs/admin-guard";
import {
  respondWithBallPaths,
  supabaseBallPathsBody,
} from "@/lib/services/splitstep/ball-paths-access";
import { lazyAdminClient } from "@/lib/supabase/admin";

/**
 * `GET /admin/matches/[matchId]/ball-paths` — the admin report's ball-paths
 * file, the admin twin of `/api/matches/[matchId]/ball-paths`.
 *
 * The dashboard's route asks the caller's session whether they can see the
 * match, and an admin is usually in neither seat nor the program — so here
 * the question is `is_admin`, checked per request, and everything below it is
 * the same answer (`respondWithBallPaths`): the stored text, or an empty file
 * when there is none. Without it the admin report's Lob and Passed figures
 * are a dash on a match that has the data. Nothing here writes.
 *
 * One 404 for every refusal at the gate, as the admin layout answers a
 * non-admin: it does not confirm the route exists. The service-role client is
 * lazy, so a refused caller never constructs one.
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
  return respondWithBallPaths(
    matchId,
    supabaseBallPathsBody(lazyAdminClient()),
  );
}
