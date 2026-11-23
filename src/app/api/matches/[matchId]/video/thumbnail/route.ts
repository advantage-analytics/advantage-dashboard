/**
 * `POST /api/matches/[matchId]/video/thumbnail` — store the still the browser
 * captured from the video it is uploading. Wiring only; the order of checks
 * lives in `lib/services/match-thumbnail/upload.ts`.
 */

import type { NextRequest } from "next/server";

import { azureThumbnailStorage } from "@/lib/services/match-thumbnail/storage";
import {
  handleUploadThumbnail,
  supabaseThumbnailKeyStore,
} from "@/lib/services/match-thumbnail/upload";
import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import { siteUrl } from "@/lib/site-url";
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

  return handleUploadThumbnail(request, matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    storage: azureThumbnailStorage(),
    ...supabaseThumbnailKeyStore(supabase),
  });
}
