/**
 * `DELETE /api/matches/[matchId]/video/uploads/[attachmentId]` — cancel a
 * pending attempt.
 *
 * Wiring only. Note what this file does NOT import: the storage module. The
 * staged blob is not deleted here — a browser that has not yet noticed the
 * cancellation may still hold a valid write SAS, and deleting the key under
 * it would let that upload recreate an object no row points at. The RPC
 * retires the record and schedules cleanup for after the SAS expiry; the
 * cleanup worker (T14) collects the bytes.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import {
  handleCancelUpload,
  rpcCancelUpload,
} from "@/lib/services/match-video/uploads";
import { siteUrl } from "@/lib/site-url";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; attachmentId: string }> },
) {
  const { matchId, attachmentId } = await params;
  const supabase = await createClient();

  const cancel = rpcCancelUpload(lazyAdminClient());

  return handleCancelUpload(request, matchId, attachmentId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    cancel,
  });
}
