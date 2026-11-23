import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  enrichMatches,
  withRosterProfiles,
  withViewerSide,
} from "@/lib/data/matches-page-server";
import {
  loadVerificationPending,
  withVerificationPending,
} from "@/lib/data/match-verification-server";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import { isAnalysisReady, isInFlight } from "@/lib/data/match-analysis";
import { isPracticeMatch } from "@/lib/matches/match-type";

/**
 * How many of the newest matches both Homes read. The page draws six rows and
 * counts "analyzing" and the last five results off the same rows — the Matches page stays the place that reads them all.
 */
const FEED_WINDOW = 40;
/** The Latest matches table is a glance, not a list: the Matches page pages. */
export const HOME_LATEST_ROWS = 6;
export interface HomeFeed {
  /** The newest matches, exactly as the Matches table draws them. */
  latest: DisplayMatch[];
  /** Matches still on their way to a report (`isInFlight`). */
  analyzing: number;
  /** Matches with a finished report, inside the window. */
  analyzed: number;
  /** Wins and losses over the five newest decided, non-practice matches. */
  lastFive: { wins: number; losses: number; played: number };
  matchCount: number;
  /**
   * The same page read for one player: set on a team workspace whose viewer
   * has a roster row of their own, null otherwise. Team Home draws it for a
   * member whose role is player; staff who also play still get the program's
   * page.
   */
  player: PlayerFeed | null;
}

/** How many of a player's own matches their Team Home lists. */
export const PLAYER_OWN_ROWS = 5;
/** How many teammates' matches sit under them. */
export const PLAYER_TEAM_ROWS = 3;

export interface PlayerFeed {
  /**
   * The viewer's own matches, newest first: five while there is a team list
   * beneath them, six (the page's usual list) when there is none.
   */
  own: DisplayMatch[];
  /**
   * Teammates' newest matches, never the viewer's own. Empty when there are
   * none the viewer may see — row-level security has already decided that.
   */
  team: DisplayMatch[];
  /** The title's figures, counted over the viewer's matches alone. */
  summary: Pick<HomeFeed, "analyzing" | "analyzed" | "lastFive" | "matchCount">;
}

type FeedRow = DbMatch & {
  player2_id: string | null;
  created_by: string | null;
};

/**
 * What both Homes show about matches, in one read.
 *
 * It goes through the Matches page's own pipeline (`transformDbMatch`,
 * `enrichMatches`, the side turn, verification) rather than a second one, so
 * a row here and the same row on Matches can never disagree about a name, a
 * result mark or an analysis status — the misattribution
 * `docs/ui-revamp-guardrails.md` exists to prevent.
 */
export const getHomeFeed = cache(
  async function getHomeFeed(): Promise<HomeFeed> {
    const workspace = await getWorkspaceContext();
    if (!workspace) throw new Error("No workspace for the home feed");
    const { active, viewer } = workspace;
    const isTeam = active.kind === "team";
    const supabase = await createClient();

    const query = supabase
      .from("matches")
      .select(
        "id, created_by, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, verified_at, duration, source_provider, player2_id",
      )
      .order("date", { ascending: false })
      .limit(FEED_WINDOW);
    const { data, error } = await (isTeam
      ? query.eq("program_id", active.id)
      : query.eq("created_by", viewer.id).is("program_id", null));
    if (error)
      throw new Error("Could not load the home feed", { cause: error });

    const rows = (data ?? []) as FeedRow[];
    const scored = rows.filter(
      (row) => transformDbMatch(row, viewer.id) !== null,
    );
    const enriched = enrichMatches(supabase, scored, viewer);
    const matches = await withVerificationPending(
      isTeam
        ? withRosterProfiles(supabase, active.id, enriched, scored)
        : withViewerSide(scored, viewer.id, enriched),
      loadVerificationPending(
        supabase,
        scored.map((row) => row.id),
      ),
    );

    // A team row seats the program's player as player one (`withRosterProfiles`),
    // under either of the two ids a match may carry for them.
    const myPlayerId = isTeam ? active.myPlayerId : null;
    const isMine = (match: DisplayMatch) =>
      match.player1.id === viewer.id ||
      (myPlayerId != null && match.player1.id === myPlayerId);
    const mine = myPlayerId ? matches.filter(isMine) : [];
    const others = myPlayerId
      ? matches.filter((match) => !isMine(match)).slice(0, PLAYER_TEAM_ROWS)
      : [];

    return {
      ...summarize(matches),
      latest: matches.slice(0, HOME_LATEST_ROWS),
      player: myPlayerId
        ? {
            own: mine.slice(
              0,
              others.length > 0 ? PLAYER_OWN_ROWS : HOME_LATEST_ROWS,
            ),
            team: others,
            summary: summarize(mine),
          }
        : null,
    };
  },
);

/** The title's figures over a list of matches, newest first. */
function summarize(
  matches: DisplayMatch[],
): Pick<HomeFeed, "analyzing" | "analyzed" | "lastFive" | "matchCount"> {
  const decided = matches
    .filter((match) => !isPracticeMatch(match.matchType))
    .slice(0, 5);
  const wins = decided.filter((m) => m.score.winner === "player1").length;
  return {
    analyzing: matches.filter(
      (match) => match.analysis && isInFlight(match.analysis.status),
    ).length,
    analyzed: matches.filter(
      (match) => match.analysis && isAnalysisReady(match.analysis.status),
    ).length,
    lastFive: { wins, losses: decided.length - wins, played: decided.length },
    matchCount: matches.length,
  };
}
