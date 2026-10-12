import type { SupabaseClient } from "@supabase/supabase-js";
import {
  importedAnalysis,
  isAnalysisReady,
  isInFlight,
  manualAnalysis,
} from "@/lib/data/match-analysis";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { getTeamHomePresence } from "@/lib/data/team-home-server";
import { isProgramStaff, type Workspace } from "@/lib/workspace/types";
import {
  personalSetupSteps,
  teamSetupSteps,
  type SetupStep,
} from "@/components/dashboard/activity/tray-setup";

/**
 * The activity tray's setup steps for the active workspace.
 *
 * Every answer is a fact read back out of the database — no local flag, no
 * dismissal, no "seen it" bit — which is what lets the section be right on a
 * second device and after a sign-out.
 *
 * Personal reads the same two rows the Home line does. Team takes roster and
 * schedule from `getTeamHomePresence`, one id from each source, rather than
 * the season aggregation Team Home is drawn from: the tray renders on every
 * dashboard page and cannot afford that read. The match step is answered by
 * `hasSentMatch`, which keeps Team Home's own rule — see there.
 *
 * Team steps are staff-only, since each is a write the database refuses a
 * player. Chrome, so never fatal: a failed read is an absent section.
 */
export async function getSetupSteps(
  supabase: SupabaseClient,
  workspace: Workspace,
  userId: string,
): Promise<SetupStep[]> {
  try {
    if (workspace.kind === "team") {
      if (!isProgramStaff(workspace)) return [];
      const presence = await getTeamHomePresence(workspace.id);
      return teamSetupSteps({
        roster: presence.hasRoster,
        schedule: presence.hasSchedule,
        match:
          presence.hasMatches && (await hasSentMatch(supabase, workspace.id)),
      });
    }

    const [user, preferences] = await Promise.all([
      supabase.from("users").select("hand, backhand").eq("id", userId).single(),
      supabase
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (user.error || preferences.error) {
      throw user.error ?? preferences.error;
    }
    return personalSetupSteps({
      playingProfile: Boolean(user.data?.hand && user.data?.backhand),
      notifications: Boolean(preferences.data),
    });
  } catch (error) {
    console.error("[activity] could not load setup steps", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Newest matches read to answer the step. Past this, the answer is settled. */
const SENT_MATCH_WINDOW = 50;

/**
 * Has the program sent a match — one whose report is back or on its way?
 *
 * Team Home's rule (`teamFirstReport`), not "does a row exist": a wizard
 * draft and a failed analysis are both rows, and counting either had the
 * tray's section call this step done while the page's own pointer, on the
 * same screen, still asked for it. Each match resolves the way the page
 * resolves it — its job, else an import, else a manual entry.
 */
async function hasSentMatch(
  supabase: SupabaseClient,
  programId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, source_provider, verified")
    .eq("program_id", programId)
    .order("date", { ascending: false, nullsFirst: false })
    .limit(SENT_MATCH_WINDOW);
  if (error) throw error;

  const rows = data ?? [];
  const jobs = await loadMatchAnalysis(
    supabase,
    rows.map((row) => row.id),
  );
  return rows.some((row) => {
    const analysis =
      jobs.get(row.id) ??
      (row.source_provider
        ? importedAnalysis(row.source_provider, Boolean(row.verified))
        : manualAnalysis());
    return isAnalysisReady(analysis.status) || isInFlight(analysis.status);
  });
}
