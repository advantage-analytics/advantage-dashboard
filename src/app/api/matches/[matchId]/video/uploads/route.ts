/**
 * `POST /api/matches/[matchId]/video/uploads` — reserve a SwingVision video
 * attachment attempt and return a write-only credential for its staged key.
 *
 * The decision lives in `lib/services/match-video/uploads.ts`; this file is
 * the wiring — the real session client, the service-role RPC, the workspace
 * cookie and the Azure signer — and nothing else, so the refusal ladder is
 * tested without any of them. Next reserves a route file's exports for
 * handler names, which is why the handler is a sibling module.
 *
 * The service-role client is constructed lazily: the handler refuses an
 * anonymous or unauthorized caller before it ever asks for `reserve`, so a
 * denied request never builds it.
 */

import type { NextRequest } from "next/server";

import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import { mintAttachmentUploadCredential } from "@/lib/services/match-video/storage";
import {
  handlePrepareUpload,
  rpcReserveUpload,
} from "@/lib/services/match-video/uploads";
import { siteUrl } from "@/lib/site-url";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();

  const reserve = rpcReserveUpload(lazyAdminClient());

  return handlePrepareUpload(request, matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    reserve,
    mintUploadCredential: (row, notAfter) =>
      mintAttachmentUploadCredential(row, { notAfter }),
  });
}
