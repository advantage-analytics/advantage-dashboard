/**
 * `PATCH /api/matches/[matchId]/video/alignment` — move the saved
 * source-to-video offset of the match's active attachment. No bytes are
 * transferred; the stored file and its server-verified duration stay
 * exactly as they are.
 *
 * Wiring only. Every decision, the order of the checks and each failure path
 * live in `lib/services/match-video/alignment.ts`, which the access spec
 * drives with none of these real clients.
 *
 * Note what this file does NOT import, as with cancellation: the storage
 * module, and nothing that could reach the Azure blob SDK. A correction has
 * no upload to authorize, no SAS to mint and no blob to touch — it
 * recomputes one number from the imported source rows and the duration the
 * server measured at publication.
 *
 * The service-role client is built lazily behind a proxy, so a cross-origin,
 * anonymous or unauthorized caller — all refused before the database seam is
 * called — never constructs one.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import {
  handleUpdateAlignment,
  rpcCorrectAlignment,
} from "@/lib/services/match-video/alignment";
import { siteUrl } from "@/lib/site-url";
import { lazyAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();

  const correct = rpcCorrectAlignment(lazyAdminClient());

  return handleUpdateAlignment(request, matchId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    correct,
  });
}
