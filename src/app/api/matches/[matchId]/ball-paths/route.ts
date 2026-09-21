/**
 * `GET /api/matches/[matchId]/ball-paths` — the derived ball-paths file for
 * anyone who can SEE the match; an empty file when there is none.
 *
 * Wiring only. Every decision — visibility before storage, the 200-empty
 * answer, the stored text returned verbatim — lives in
 * `lib/services/splitstep/ball-paths-access.ts`, which its spec drives with
 * none of these real clients.
 *
 * GET only: the file is written by the webhook and the backfill script, and
 * there is nothing here to authorize a write with.
 *
 * The service-role client is built lazily behind a proxy, so an anonymous
 * caller or one who cannot see the match — both refused before the loader is
 * reached — never constructs one.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import {
  handleGetBallPaths,
  supabaseBallPathsBody,
} from "@/lib/services/splitstep/ball-paths-access";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();

  return handleGetBallPaths(matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    loadBallPathsBody: supabaseBallPathsBody(lazyAdminClient()),
  });
}
