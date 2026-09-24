/**
 * `POST /api/matches/[matchId]/video/viewed` — count a view of the match's
 * active video, restarting its retention clock (SwingVision Add video T8).
 * Sent by the Film player and the fullscreen room on the first `play` of each
 * loaded source; "Keep this video" (T10) will send the same request.
 *
 * Wiring only. The order — same-origin, then sign-in and RLS visibility
 * (`authorizeMatchVisibility`), then `match_video_record_view` — lives in
 * `lib/services/match-video/views.ts`, which the access spec drives with
 * none of these real clients.
 *
 * Like alignment, this file imports nothing that reaches storage: a view
 * stamps one timestamp and signs nothing. The service-role client is built
 * lazily, so a cross-origin, anonymous or refused caller never constructs one.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import {
  handleRecordView,
  rpcRecordView,
} from "@/lib/services/match-video/views";
import { siteUrl } from "@/lib/site-url";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();

  return handleRecordView(request, matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    recordView: rpcRecordView(lazyAdminClient()),
  });
}
