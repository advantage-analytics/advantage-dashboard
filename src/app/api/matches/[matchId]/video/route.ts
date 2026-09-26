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
 * `DELETE` (SwingVision Add video T5) removes the ACTIVE video — body
 * `{ attachmentId }`. It asks neither of the two questions above alone:
 * visibility, then `authorizeMatchVideoRemoval` (the uploader, or an owner or
 * coach of the match's program), then `match_video_remove_attachment`, then a
 * best-effort cleanup run after the response. Every rule lives in
 * `lib/services/match-video/remove.ts`. There is still no POST or PATCH: the
 * creator-only mutation endpoints sit one directory down under
 * `video/uploads` and `video/alignment`.
 *
 * The service-role client is built lazily behind a proxy, so an anonymous
 * caller or one who cannot see the match — both refused before the database
 * seam is reached — never constructs one.
 */

import type { NextRequest } from "next/server";

import {
  matchVideoAccessDeps,
  matchVideoRemovalAccessDeps,
} from "@/lib/services/match-video/access";
import {
  productionCleanupDeps,
  scheduleAfterResponse,
  type CleanupDeps,
} from "@/lib/services/match-video/cleanup";
import {
  azurePlaybackStorage,
  handleGetPlayback,
  supabaseActiveAttachment,
} from "@/lib/services/match-video/playback";
import {
  handleRemoveAttachment,
  rpcRemoveAttachment,
} from "@/lib/services/match-video/remove";
import { siteUrl } from "@/lib/site-url";
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();
  const admin = lazyAdminClient();

  // Lazy: building it reads the Azure config, which throws on a deployment
  // without one — and a refused removal never needs it.
  let cleanup: CleanupDeps | null = null;

  return handleRemoveAttachment(request, matchId, {
    ...matchVideoRemovalAccessDeps({
      supabase,
      admin,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    remove: rpcRemoveAttachment(admin),
    get cleanup(): CleanupDeps {
      return (cleanup ??= productionCleanupDeps(admin));
    },
    schedule: (task) => scheduleAfterResponse(task, "[match-video-remove]"),
  });
}
