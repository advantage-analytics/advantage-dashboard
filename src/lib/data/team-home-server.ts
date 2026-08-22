import { createClient } from "@/lib/supabase/server";
import { getProgramUsage, type ProgramUsage } from "@/lib/data/usage-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import {
  ANALYSIS_LABEL,
  importedAnalysis,
  manualAnalysis,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import { shortDate } from "@/lib/data/match-utils";
import { INVITE_TTL_HOURS } from "@/lib/services/programs/tokens";

/**
 * What the program's home page reads.
 *
 * F6 and F8 are the same page with and without rows in it, so they are one
 * query set rather than two: the budget meter is on screen from visit one
 * — coaches steward budgets for a living, and hiding it until it matters is
 * the version that feels like a trick.
 *
 * None of this is a new source of truth. Usage comes from the same SECURITY
 * DEFINER functions Settings › Usage reads, the roster from the same
 * `program_roster` RPC Settings › Team reads, and match state from the shared
 * analysis loader. A second answer to "how many hours have we used" would be
 * worse than no answer, because someone would believe this one.
 */

/** How many rows the page shows before "see all" would be the honest control. */
const RECENT_MATCH_LIMIT = 6;

/** Invites close enough to expiry to be worth naming on the home page. */
const EXPIRING_SOON_DAYS = 7;

export interface TeamMatchRow {
  id: string;
  /** "M. Reid vs J. Park" */
  title: string;
  /** "Big Sky dual · away", or the match type when there is no event. */
  context: string;
  status: AnalysisStatus;
  /** The product's own word for the status — never a second vocabulary. */
  label: string;
  /** "Aug 8" */
  date: string;
}

export interface RosterProgress {
  /** Players who have accepted. */
  joined: number;
  /** Players invited in total — accepted plus still outstanding. */
  invited: number;
  /** Outstanding invites falling due inside a week. */
  expiringSoon: number;
  /** Whole days until the soonest of those, floored at 0. */
  expiringInDays: number | null;
}

export interface TeamHomeData {
  usage: ProgramUsage;
  matches: TeamMatchRow[];
  roster: RosterProgress;
  /**
   * The program's upload permission, carried here so the invite dialog can
   * state the rule it is about to apply. Read from the same row Settings ›
   * Team writes — never a second copy of the setting.
   */
  playersCanUpload: boolean;
}

/**
 * What the row says about itself besides the names.
 *
 * The event first, then the round, because a coach scanning the list is looking
 * for a dual rather than for a quarter-final. When a match has neither, the
 * type is the only true thing left to say.
 */
function matchContext(row: {
  tournament_name: string | null;
  round: string | null;
  match_type: string | null;
}): string {
  const parts = [row.tournament_name, row.round].filter(
    (part): part is string => Boolean(part?.trim())
  );
  if (parts.length > 0) return parts.join(" · ");
  return row.match_type?.trim() || "Match";
}

/**
 * Player invites, seen from the home page.
 *
 * Counts players only. Staff invites are a different question with a different
 * answer — a program with four coaches and no roster is not 0% of the way to
 * being set up — and merging them made "6 of 10 joined" mean nothing in
 * particular.
 */
function rosterProgress(
  members: { role: string }[],
  invites: { role: string; createdAt: string }[],
  now: number
): RosterProgress {
  const joined = members.filter((member) => member.role === "player").length;
  const outstanding = invites.filter((invite) => invite.role === "player");

  const ttlMs = INVITE_TTL_HOURS * 60 * 60 * 1000;
  const expiries = outstanding
    .map((invite) => new Date(invite.createdAt).getTime() + ttlMs)
    .filter((expiry) => Number.isFinite(expiry))
    .sort((a, b) => a - b);

  const horizon = now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  const soon = expiries.filter((expiry) => expiry <= horizon);

  return {
    joined,
    invited: joined + outstanding.length,
    expiringSoon: soon.length,
    expiringInDays:
      soon.length > 0
        ? Math.max(0, Math.floor((soon[0] - now) / (24 * 60 * 60 * 1000)))
        : null,
  };
}

export async function getTeamHomeData(
  programId: string,
  billingMonth: string
): Promise<TeamHomeData> {
  const supabase = await createClient();

  const [usage, team, { data: rows }] = await Promise.all([
    getProgramUsage(programId, billingMonth),
    getTeamSettings(programId),
    supabase
      .from("matches")
      .select(
        "id, player1_name, player2_name, tournament_name, round, date, match_type, source_provider, verified"
      )
      .eq("program_id", programId)
      .order("date", { ascending: false })
      .limit(RECENT_MATCH_LIMIT),
  ]);

  // `reap: true` is deliberately NOT passed. It is a write, and it belongs to
  // the two surfaces that draw a progress bar big enough for a frozen one to
  // mislead — the matches list and match detail. This page shows a dot.
  const ids = (rows ?? []).map((row) => row.id as string);
  const jobs = await loadMatchAnalysis(supabase, ids);

  const matches: TeamMatchRow[] = (rows ?? []).map((row) => {
    const analysis =
      jobs.get(row.id as string) ??
      (row.source_provider
        ? importedAnalysis(row.source_provider as string, Boolean(row.verified))
        : manualAnalysis());

    return {
      id: row.id as string,
      title: `${row.player1_name as string} vs ${row.player2_name as string}`,
      context: matchContext(row),
      status: analysis.status,
      label: ANALYSIS_LABEL[analysis.status],
      date: shortDate(row.date as string),
    };
  });

  return {
    usage,
    matches,
    roster: rosterProgress(
      team?.members ?? [],
      team?.invites ?? [],
      Date.now()
    ),
    playersCanUpload: team?.program.playersCanUpload ?? false,
  };
}
