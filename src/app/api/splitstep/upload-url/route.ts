/**
 * Mint a browser upload credential for a match video.
 *
 * Lives in the Next runtime rather than an edge function because the same
 * Azure account key signs the vendor's read SAS — one credential store — and
 * auth goes through the normal `createClient()` session instead of a
 * hand-parsed bearer header.
 *
 * The returned URL is a write credential for exactly one blob name: `cw`, no
 * read, no delete, no list. Whoever holds it can put bytes at that one name and
 * can do nothing else with the container. It is still a credential — the
 * caller must not log it (see the note in useUploadMatchWizard).
 *
 * The decision lives in `handler.ts`; this file is the wiring — the real
 * session, service-role, workspace, roster and Azure seams — and nothing else,
 * so the refusal ladder can be tested without a database and without signing.
 */

import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEligibleRoster } from "@/lib/services/splitstep/eligible-roster";
import { mintUploadSas } from "@/lib/services/splitstep/video-url";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

import {
  handleUploadUrl,
  type UploadUrlDeps,
  type UploadUrlMatch,
} from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Lazily, so an unauthenticated caller never constructs the service-role
  // client — the handler asks for the user first and returns 401 before any
  // other seam is touched.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  const adminClient = () => (admin ??= createAdminClient());
  let userId: string | null = null;

  const deps: UploadUrlDeps = {
    async currentUserId() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      userId = error || !user ? null : user.id;
      return userId;
    },

    async loadMatch(matchId) {
      const { data, error } = await adminClient()
        .from("matches")
        // `program_id` for the permission check: NULL is a personal upload,
        // and a program id is whose budget this video will eventually be
        // charged to. `player1_id` and `event_entry_id` for the upload
        // contract — whose match this is, and whether it sits on a line.
        .select("id, created_by, program_id, player1_id, event_entry_id")
        .eq("id", matchId)
        .maybeSingle();
      return {
        match: (data as UploadUrlMatch | null) ?? null,
        error: error?.message ?? null,
      };
    },

    async availableWorkspaces() {
      return (await getWorkspaceContext())?.available ?? [];
    },

    async loadRoster(programId) {
      // One roster read for both video seams — see `loadEligibleRoster()`,
      // where this dep's body and its reasoning moved (T16).
      return loadEligibleRoster({
        supabase,
        programId,
        userId,
        log: "[splitstep-upload-url]",
      });
    },

    mintUploadSas,

    async recordBlobName(matchId, blobName) {
      const { error } = await adminClient()
        .from("processing_jobs")
        .update({ video_object_key: blobName })
        .eq("match_id", matchId);
      return { error: error?.message ?? null };
    },
  };

  return handleUploadUrl(request, deps);
}
