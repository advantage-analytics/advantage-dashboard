/**
 * `POST /api/matches/[matchId]/video/uploads/[attachmentId]/renew` — extend
 * the write window on a pending attempt and re-sign its staged key.
 *
 * Wiring only, exactly like the reservation route: the decision, the ordering
 * and every refusal live in `lib/services/match-video/uploads.ts`, which is
 * what the handler spec exercises with none of these real clients.
 *
 * The service-role client is built lazily behind a proxy, so a cross-origin,
 * anonymous or unauthorized caller — all refused before `renew` is ever
 * called — never constructs one.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import { mintAttachmentUploadCredential } from "@/lib/services/match-video/storage";
import {
  handleRenewUpload,
  rpcRenewUpload,
} from "@/lib/services/match-video/uploads";
import { siteUrl } from "@/lib/site-url";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; attachmentId: string }> },
) {
  const { matchId, attachmentId } = await params;
  const supabase = await createClient();

  const renew = rpcRenewUpload(lazyAdminClient());

  return handleRenewUpload(request, matchId, attachmentId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    renew,
    mintUploadCredential: (row, notAfter) =>
      mintAttachmentUploadCredential(row, { notAfter }),
  });
}
