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
import {
  insightSummaryFor,
  type InsightSummaryFields,
} from "@/lib/data/insight-voice";
import { isPracticeMatch } from "@/lib/matches/match-type";

/**
 * How many of the newest matches both Homes read. The page draws three rows
 * and up to three highlights, and counts "analyzing" and the last five results
 * off the same rows — the Matches page stays the place that reads them all.
 */
const FEED_WINDOW = 40;
/** The Latest matches table is a glance, not a list: the Matches page pages. */
export const HOME_LATEST_ROWS = 3;
/** The highlight's stepper never walks further back than this. */
const HIGHLIGHT_LIMIT = 3;

export interface HomeHighlight {
  match: DisplayMatch;
  /** The match report's own summary, in the voice this reader gets. */
  summary: string | null;
}

export interface HomeFeed {
  /** The newest matches, exactly as the Matches table draws them. */
  latest: DisplayMatch[];
  /** The newest analyzed matches, newest first. Empty before the first. */
  highlights: HomeHighlight[];
  /** Matches still on their way to a report (`isInFlight`). */
  analyzing: number;
  /** Matches with a finished report, inside the window. */
  analyzed: number;
  /** Wins and losses over the five newest decided, non-practice matches. */
  lastFive: { wins: number; losses: number; played: number };
  matchCount: number;
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

    const ready = matches.filter(
      (match) => match.analysis && isAnalysisReady(match.analysis.status),
    );
    const decided = matches
      .filter((match) => !isPracticeMatch(match.matchType))
      .slice(0, 5);
    const wins = decided.filter((m) => m.score.winner === "player1").length;

    return {
      latest: matches.slice(0, HOME_LATEST_ROWS),
      highlights: await withSummaries(
        supabase,
        ready.slice(0, HIGHLIGHT_LIMIT),
        (match) =>
          !isTeam ||
          match.player1.id === viewer.id ||
          (active.myPlayerId != null && match.player1.id === active.myPlayerId),
      ),
      analyzing: matches.filter(
        (match) => match.analysis && isInFlight(match.analysis.status),
      ).length,
      analyzed: ready.length,
      lastFive: { wins, losses: decided.length - wins, played: decided.length },
      matchCount: matches.length,
    };
  },
);

/**
 * Each highlight's summary, read only for the few matches drawn.
 *
 * `insight-voice.ts` is the one place that picks a voice: only the player a
 * report is turned to reads "you"; a coach or teammate gets the observer
 * sentence with the names filled in.
 */
async function withSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matches: DisplayMatch[],
  viewerIsYou: (match: DisplayMatch) => boolean,
): Promise<HomeHighlight[]> {
  if (matches.length === 0) return [];
  const { data, error } = await supabase
    .from("matches")
    .select("id, insights")
    .in(
      "id",
      matches.map((match) => match.id),
    );
  if (error)
    throw new Error("Could not load match summaries", { cause: error });
  type Sides = {
    player1?: InsightSummaryFields | null;
    player2?: InsightSummaryFields | null;
  } | null;
  const byId = new Map(
    (data ?? []).map((row) => [row.id as string, row.insights as Sides]),
  );
  return matches.map((match) => {
    const sides = byId.get(match.id);
    const insight = match.turned ? sides?.player2 : sides?.player1;
    return {
      match,
      summary: insightSummaryFor(
        insight,
        viewerIsYou(match) ? "player" : "observer",
        { you: match.player1.name, opp: match.player2.name },
      ),
    };
  });
}
