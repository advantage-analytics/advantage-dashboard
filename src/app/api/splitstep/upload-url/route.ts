/**
 * Mint a browser upload credential for a match video.
 *
 * Replaces the `upload-video-r2` Supabase Edge Function. That function existed
 * because the Next runtime held no storage credentials — under Azure it must,
 * since the same account key signs the vendor's read SAS. Moving it here
 * collapses two credential stores into one and lets auth go through the normal
 * `createClient()` session instead of a hand-parsed bearer header.
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
import { eligibleRosterOptions } from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { RosterFullRow } from "@/lib/data/roster-shared";
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
      // The session client, as `getRosterPlayerOptions()` reads it: the RPC
      // is SECURITY DEFINER and answers only for a program the caller is in,
      // which `billingWorkspaceFor()` has already established. The own-profile
      // read mirrors `claimedProfilesByProgram()` in
      // `active-workspace-server.ts` — live, bound to this login, this
      // program — because the RPC's player arm drops a profile claimed by
      // staff, and an owner who genuinely plays would otherwise be refused
      // for their own match. `eligibleRosterOptions()` is the wizard's merge
      // of the two, reused so the route and the picker cannot disagree about
      // who is on the roster.
      const [rows, own] = await Promise.all([
        supabase.rpc("program_roster_full", { p_program_id: programId }),
        supabase
          .from("program_players")
          .select(
            "id, program_id, first_name, last_name, email, class_year, lineup_spot, claimed_by_user_id",
          )
          .eq("program_id", programId)
          .eq("claimed_by_user_id", userId ?? "")
          .is("archived_at", null)
          .is("merged_into_id", null)
          .limit(1),
      ]);
      if (rows.error || own.error) {
        console.error("[splitstep-upload-url] could not load roster", {
          programId,
          error: rows.error?.message ?? own.error?.message,
        });
        return null;
      }
      return eligibleRosterOptions(
        (rows.data ?? []) as RosterFullRow[],
        own.data?.[0] ?? null,
        programId,
        userId ?? "",
      );
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
