/**
 * `GET /api/matches/[matchId]/video` — the active attachment's playback
 * metadata for anyone who can SEE the match, plus a fresh read-only URL. It
 * is also the credential-refresh endpoint: a player re-fetches it as the SAS
 * nears expiry and compares `id` and `version` to notice a replacement or an
 * alignment correction.
 *
 * Wiring only. Every decision — visibility rather than creator permission,
 * the empty answer for a match with no video, and the difference between a
 * vanished object and an unreachable store — lives in
 * `lib/services/match-video/playback.ts`, which the access spec drives with
 * none of these real clients.
 *
 * This file has no POST, PATCH or DELETE, and that is the whole shape of the
 * route: there is nothing here to authorize a write with. The mutation
 * endpoints sit one directory down under `video/uploads` and `video/alignment`
 * and ask the second, stricter question.
 *
 * The service-role client is built lazily behind a proxy, so an anonymous
 * caller or one who cannot see the match — both refused before the database
 * seam is reached — never constructs one.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import {
  azurePlaybackStorage,
  handleGetPlayback,
  supabaseActiveAttachment,
} from "@/lib/services/match-video/playback";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();

  const loadActiveAttachment = supabaseActiveAttachment(lazyAdminClient());

  return handleGetPlayback(request, matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    loadActiveAttachment,
    ...azurePlaybackStorage(),
  });
}
