import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTeamHomePresence } from "@/lib/data/team-home-server";
import { getPendingJoinRequests } from "@/lib/data/join-requests-server";
import {
  isProgramStaff,
  type WorkspaceContextValue,
} from "@/lib/workspace/types";
import {
  presentEverywhere,
  type WorkspacePresence,
} from "@/lib/workspace/presence";

/**
 * The layout's one read of `WorkspacePresence` — see `presence.ts` for why.
 *
 * One id per source, all in parallel, the way `getTeamHomePresence` already
 * reads Team Home's three (and reuses that cached call, so a Team Home request
 * pays for those reads once). Each filter is the one its page applies to the
 * full list; the page comment beside each rule in `presence.ts` names it.
 *
 * Never fatal. The layout must render if this fails, and the failure answer is
 * "everything present" — which draws today's skeletons rather than inventing a
 * day zero over somebody's data.
 */
export const getWorkspacePresence = cache(async function getWorkspacePresence(
  workspace: WorkspaceContextValue,
): Promise<WorkspacePresence> {
  const { active, viewer } = workspace;
  try {
    const supabase = await createClient();
    const drafts = supabase
      .from("match_drafts")
      .select("id")
      .eq("user_id", viewer.id);

    if (active.kind === "personal") {
      const [matches, draftRows] = await Promise.all([
        supabase
          .from("matches")
          .select("id")
          .eq("created_by", viewer.id)
          .is("program_id", null)
          .limit(1),
        drafts.is("program_id", null).limit(1),
      ]);
      const error = matches.error ?? draftRows.error;
      if (error) throw error;
      return {
        ...presentEverywhere(active.id),
        matches: Boolean(matches.data?.length),
        drafts: Boolean(draftRows.data?.length),
      };
    }

    // Invites and join requests are staff-only reads: RLS and the RPC both
    // hand a player nothing, and the roster page never asks on their behalf.
    const staff = isProgramStaff(active);
    const [team, draftRows, events, invites, joinRequests] = await Promise.all([
      getTeamHomePresence(active.id),
      drafts.eq("program_id", active.id).limit(1),
      supabase
        .from("program_events")
        .select("id")
        .eq("program_id", active.id)
        .limit(1),
      staff
        ? supabase
            .from("program_invites")
            .select("id")
            .eq("program_id", active.id)
            .is("accepted_at", null)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      staff ? getPendingJoinRequests(active.id, true) : Promise.resolve([]),
    ]);
    const error = draftRows.error ?? events.error ?? invites.error;
    if (error) throw error;
    return {
      workspaceId: active.id,
      matches: team.hasMatches,
      drafts: Boolean(draftRows.data?.length),
      roster: team.hasRoster,
      rosterInFlight: Boolean(invites.data?.length) || joinRequests.length > 0,
      duals: team.hasSchedule,
      events: Boolean(events.data?.length),
    };
  } catch (error) {
    console.error("[presence] could not read workspace presence", {
      error: error instanceof Error ? error.message : String(error),
    });
    return presentEverywhere(active.id);
  }
});
