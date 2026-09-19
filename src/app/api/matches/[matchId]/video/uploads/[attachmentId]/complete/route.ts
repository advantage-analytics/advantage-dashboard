/**
 * `POST /api/matches/[matchId]/video/uploads/[attachmentId]/complete` —
 * verify the staged upload, publish it to its immutable final key and make
 * it the match's active video. `202` while the server-side copy runs (the
 * client re-sends the same request after `retryAfterSeconds`), `200` with
 * the committed attachment once activated.
 *
 * Wiring only, like the other attachment routes: every decision, the order
 * of the checks, the lease and every failure path live in
 * `lib/services/match-video/complete.ts`, which the completion spec drives
 * with none of these real clients.
 *
 * The service-role client is built lazily behind a proxy, so a cross-origin,
 * anonymous or unauthorized caller — all refused before any database seam is
 * called — never constructs one. The storage adapter is constructed on the
 * same terms: `azureCompletionStorage()` only builds its container client
 * when a method is first called, after the lease has been taken.
 */

import type { NextRequest } from "next/server";

import { matchVideoAccessDeps } from "@/lib/services/match-video/access";
import {
  azureCompletionStorage,
  handleCompleteUpload,
  rpcCompletionDeps,
} from "@/lib/services/match-video/complete";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let admin: ReturnType<typeof createAdminClient> | null = null;
  const database = rpcCompletionDeps(
    new Proxy({} as ReturnType<typeof createAdminClient>, {
      get(_target, property, receiver) {
        admin ??= createAdminClient();
        return Reflect.get(admin, property, receiver);
      },
    }),
  );

  return handleCompleteUpload(request, matchId, attachmentId, {
    ...matchVideoAccessDeps({
      supabase,
      workspaceContext: getWorkspaceContext,
    }),
    allowedOrigins: [siteUrl()],
    storage: azureCompletionStorage(),
    ...database,
  });
}
