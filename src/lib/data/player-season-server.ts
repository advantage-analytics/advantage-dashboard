import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { lazyAdminClient } from "@/lib/supabase/admin";
import {
  supabaseBallPathsBody,
  type BallPathsAccessDeps,
} from "@/lib/services/splitstep/ball-paths-access";
import { statKey } from "@/lib/data/aggregate";
import { errorSplitJudged } from "@/lib/data/error-split";
import { matchDay } from "@/lib/data/match-day";
import { getMatchPointsFromSupabase } from "@/lib/data/match-points-server";
import {
  MATCH_STATS_VIEW_COLUMNS,
  transformToPlayerStats,
  type DbMatchStatsView,
} from "@/lib/data/match-stats-server";
import { verificationFor } from "@/lib/data/match-verification";
import { matchPageKind } from "@/lib/data/match-analysis";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import {
  personalOpponentKey,
  UNKNOWN_OPPONENT_NAME,
} from "@/lib/data/personal-opponents";
import {
  getPlayerMatchSides,
  type DbPlayerMatchRow,
  type PlayerMatchSide,
} from "@/lib/data/player-profile-server";
import {
  foldSeasonRows,
  foldSeasonTallies,
  type SeasonGroup,
  type SeasonMatch,
  type SeasonTallies,
} from "@/lib/data/player-season";
import type { H2HStats } from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import { parseBallPathsFile } from "@/components/dashboard/matches/match-detail/film/film-ball";
import { isDerivedMatch } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { lobShotKeys } from "@/components/dashboard/matches/match-detail/match-filters/net-game";

/**
 * A player's season for the team player profile's Statistics tab (design Q):
 * every analyzed match of theirs read as the match report reads one — its
 * published rows for both seats, its points, its lob keys — and folded by
 * `player-season.ts`. This file only READS; the arithmetic is the pure
 * module's, and `tests/player-season.spec.ts` pins it.
 *
 * ── Which matches, whose seat ───────────────────────────────────────────────
 * `getPlayerMatchSides` (`player-profile-server.ts`): the roster RPC, the
 * program's matches that name this player in either seat — their profile id
 * or, on a claimed player's older rows, their login — and `sideOf` per match.
 * The season and the profile's record are folded from the same list, so "12
 * matches" on the rail and the matches in the season cannot be two sets.
 * Each match keeps its own seat all the way into the fold; nothing here
 * flips a point to a common side (guardrails §4).
 *
 * "Analyzed" is the match report's own gate plus points. The report draws a
 * match only when `matchPageKind` says `"report"` — never for a job still
 * uploading, queued, processing or deriving, a failed one (bar the
 * `stats_unavailable` exemption) or a cancelled one — over the same job state
 * the page reads (`loadMatchAnalysis` → `analysisFor`, without the page's
 * reap, which is a write). So a match the report shows as Analysis steps is
 * not folded here even when it still holds points from an earlier attempt; it
 * still counts in `matchesPlayed`. A stats row alone — a hand-entered result
 * — has nothing the point-level calculators can count, so a match also needs
 * points. `processing_jobs` is per-creator under RLS, exactly as on the
 * report: a viewer who did not submit a match's video sees no job for it, and
 * both surfaces read it from its source provider instead.
 *
 * ── The one service-role read ───────────────────────────────────────────────
 * Everything runs as the viewer under RLS except the ball-paths file: the
 * derived lobs live in a storage object found through `processing_jobs`,
 * whose RLS is per-creator, so a coach's own client reads nothing there.
 * `supabaseBallPathsBody` is asked only for the ids the RLS-scoped matches
 * read has already returned — the order `resolveAnalysedWindowSeconds` keeps
 * — and only for Advantage Intelligence matches, the only ones with a file.
 * The service role says which file, never which matches. The reader is
 * injected (`PlayerSeasonDeps`) so a spec can run the loader with no storage
 * behind it, and `lazyAdminClient` builds nothing until the first file is
 * asked for.
 *
 * A file that is missing, unreadable or failed to download is `null` on that
 * match — unknown, so the fold leaves the match out of the lob rows and the
 * Net game card says "Passed or lobbed" — never an empty set, which would
 * count a lob over the net player among the passes.
 *
 * ── Failing closed ──────────────────────────────────────────────────────────
 * A points read that answers `null` (a page of shots failed) or a stats read
 * that errors THROWS rather than dropping the match: a season folded without
 * one of its matches looks exactly like a season that has it. The page's
 * error boundary draws the retry.
 */

/** What the loader needs that is not the viewer's client. */
export interface PlayerSeasonDeps {
  /**
   * The stored ball-paths file's TEXT for a match, or `null` when there is
   * none — `supabaseBallPathsBody(lazyAdminClient())` in production, the
   * only service-role read on this page. Called only with the id of a row
   * the RLS-scoped matches read returned.
   */
  loadBallPathsBody: BallPathsAccessDeps["loadBallPathsBody"];
}

export interface PlayerSeason {
  /**
   * Matches the report would draw as a report, with points — the ones every
   * figure below is folded from.
   */
  analyzed: number;
  /**
   * Every match of theirs the program recorded, analyzed or not — the title's
   * and the rail's "N matches", the same count as `PlayerProfile.matchesPlayed`.
   */
  matchesPlayed: number;
  /**
   * Distinct opponents across their matches, counted as the team Opponents
   * page lists them (`seasonOpponentCount`) — the rail's "N opponents".
   */
  opponentsCount: number;
  /** The season Head to head table (`foldSeasonRows`). */
  groups: SeasonGroup[];
  /** The right column's cards (`foldSeasonTallies`). */
  tallies: SeasonTallies;
  /**
   * The analyzed matches the fold ran over, newest first, points and all —
   * what the Visualizations tab computes its tiles from, on the server.
   * SERVER-ONLY: a season's points are megabytes, so never hand this to a
   * client component; pass what it draws.
   */
  perMatch: SeasonMatch[];
}

const isDerived = (match: Pick<DbPlayerMatchRow, "source_provider">) =>
  isDerivedMatch({ sourceProvider: match.source_provider ?? undefined });

/**
 * How many distinct opponents this player has faced, counted exactly as the
 * team Opponents page lists them (`groupTeamOpponents`): a match is
 * attributed to its PLAYER ONE — the team's seat on every team match — and
 * opponents are told apart by `personalOpponentKey` (the stored
 * `opponent_player_id`, else the normalised typed name). So a seat-two match
 * — an intra-squad match a teammate recorded first — is the teammate's row on
 * that page, not this player's, and is not counted here; counting it would
 * put a number on the rail that the "N opponents ›" link's Faced-by page does
 * not show. A match naming no opponent groups under nobody there and counts
 * nobody here.
 */
export function seasonOpponentCount(sides: readonly PlayerMatchSide[]): number {
  const keys = new Set<string>();
  for (const { match, isPlayer1 } of sides) {
    if (!isPlayer1) continue;
    const key = personalOpponentKey({
      isUserPlayer1: true,
      player1_name: match.player1_name,
      player2_name: match.player2_name,
      opponent_player_id: match.opponent_player_id,
    });
    if (key !== null) keys.add(key);
  }
  return keys.size;
}

/**
 * The lob keys in a stored ball-paths body (`lobShotKeys`), or `null` —
 * unknown, never "no lobs" — when there is no file, the text is not the file,
 * or it holds no strokes at all. The last is what an older job's file and the
 * route's empty answer look like, and `useLobShotKeys` reads it the same way,
 * so the season's lob rows and the report's agree on which matches count.
 */
export function lobKeysFromBallPathsBody(
  body: string | null,
): ReadonlySet<number> | null {
  if (body === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const file = parseBallPathsFile(json);
  if (!file || file.strokes.length === 0) return null;
  return lobShotKeys(file);
}

async function readLobKeys(
  deps: PlayerSeasonDeps,
  matchId: string,
): Promise<ReadonlySet<number> | null> {
  let loaded: Awaited<ReturnType<PlayerSeasonDeps["loadBallPathsBody"]>>;
  try {
    loaded = await deps.loadBallPathsBody(matchId);
  } catch (cause) {
    console.error("[player-season] could not read the ball-paths file", {
      matchId,
      cause,
    });
    return null;
  }
  // A failed read is unknown too — the reader has logged why — so this match
  // shows a dash on the lob rows rather than its lobs among the passes.
  return loaded.ok ? lobKeysFromBallPathsBody(loaded.value) : null;
}

/** One row of the view with the match it belongs to. */
interface DbSeasonStatRow extends DbMatchStatsView {
  match_id: string;
}

/**
 * Both seats' published rows for every match, keyed by `statKey`, in one
 * read through the viewer's client. The columns are the report's own
 * (`MATCH_STATS_VIEW_COLUMNS`) so `transformToPlayerStats` sees what it
 * expects. Thrown on failure: a season drawn without its published figures
 * would print every count row as 0.
 */
async function readSeatStats(
  supabase: SupabaseClient,
  matchIds: readonly string[],
): Promise<Map<string, H2HStats>> {
  const byKey = new Map<string, H2HStats>();
  if (matchIds.length === 0) return byKey;
  const { data, error } = await supabase
    .from("match_stats_with_percentages")
    .select(`match_id, ${MATCH_STATS_VIEW_COLUMNS}`)
    .in("match_id", [...matchIds]);
  if (error) {
    throw new Error("Could not read the season's match statistics", {
      cause: error,
    });
  }
  for (const row of (data ?? []) as unknown as DbSeasonStatRow[]) {
    byKey.set(
      statKey(row.match_id, row.is_player1),
      transformToPlayerStats(row, 0),
    );
  }
  return byKey;
}

/**
 * How many matches' points (and ball-paths files) are read at once. A season
 * is tens of matches and each read is several pages of points and shots, so
 * firing them all together is a burst of connections per profile view — and
 * per insight request, which reads the season again. Small enough to be
 * polite to the pool, large enough that a season is a few round trips deep.
 */
export const SEASON_READ_CONCURRENCY = 4;

/**
 * `fn` over `items`, at most `limit` running at once, results in input order.
 * A rejection rejects the whole map (the loader fails closed), and no worker
 * takes another item after it: the calls already running finish on their own
 * and are ignored.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker),
  );
  return results;
}

/**
 * The season over `sides`, read through `supabase`. This is the whole fetch;
 * `getPlayerSeason` is the request-time wrapper that supplies the client,
 * the matches and the file reader.
 */
export async function loadPlayerSeason(
  supabase: SupabaseClient,
  sides: readonly PlayerMatchSide[],
  deps: PlayerSeasonDeps,
): Promise<PlayerSeason> {
  // Two waves. First the cheap reads that cover the whole season in one
  // query each — the job state the report gates on (reads nothing for no
  // matches) and both seats' published rows — which say which matches can be
  // folded at all.
  const matchIds = sides.map((s) => s.match.id);
  const [jobs, statsByKey] = await Promise.all([
    // `strict`: a failed jobs read throws rather than reading as "no jobs",
    // which would fold in-flight matches and drop withheld-statistics ones.
    loadMatchAnalysis(supabase, matchIds, { strict: true }),
    readSeatStats(supabase, matchIds),
  ]);

  // Then the heavy per-match reads, only for those: a match the report shows
  // as Analysis steps is not folded, so its points are not read; nor are a
  // job-less match's (hand-scored, or an import) that published nothing for
  // either seat, which has no points — every writer that stores points also
  // publishes the stats row. A video match is read even with no stats row: a
  // `timeline` match keeps its points and withholds its statistics.
  const candidates = sides.filter(({ match }) => {
    const analysis = analysisFor(jobs, {
      id: match.id,
      sourceProvider: match.source_provider ?? undefined,
    });
    // The report's own gate: in flight, failed, cancelled — not a finished
    // analysis to fold.
    if (matchPageKind(analysis) !== "report") return false;
    // A video match is read whether or not this viewer can see its job:
    // `processing_jobs` is per-creator under RLS, so a teammate's upload
    // reads job-less here exactly as it does on the report, which draws it.
    if (jobs.has(match.id) || isDerived(match)) return true;
    return (
      statsByKey.has(statKey(match.id, true)) ||
      statsByKey.has(statKey(match.id, false))
    );
  });

  // Each match's points and — for the Advantage Intelligence matches, the
  // only ones with a file — its lob keys, a few matches at a time
  // (`SEASON_READ_CONCURRENCY`). Bookmarks are left off the points read:
  // nothing in the fold reads who saved a point, and reading them is two
  // more round trips and a roster RPC per match.
  const reads = await mapWithConcurrency(
    candidates,
    SEASON_READ_CONCURRENCY,
    async (s) => {
      const [points, lobKeys] = await Promise.all([
        getMatchPointsFromSupabase(s.match.id, supabase, {
          includeBookmarks: false,
        }),
        isDerived(s.match)
          ? readLobKeys(deps, s.match.id)
          : Promise.resolve(null),
      ]);
      // `null` is a failed read, never an empty match (`fetchAllPages`).
      // Thrown here, inside the pool, so no further match is read after it.
      if (points === null) {
        throw new Error(`Could not read the points of match ${s.match.id}`);
      }
      return [points, lobKeys] as const;
    },
  );

  const perMatch: SeasonMatch[] = [];
  candidates.forEach(({ match, isPlayer1 }, i) => {
    const [points, lobKeys] = reads[i];
    if (points.length === 0) return;
    perMatch.push({
      matchId: match.id,
      // The calendar day, not the stored moment (`match-day.ts`), so what
      // leaves here cannot be read as an instant downstream.
      date: matchDay(match.date),
      opponent:
        (isPlayer1 ? match.player2_name : match.player1_name)?.trim() ||
        UNKNOWN_OPPONENT_NAME,
      points,
      isPlayer1,
      isDerived: isDerived(match),
      // The report's own reading (`transformDbMatchToMatch`): a SwingVision
      // export judges every error; a video match only once Advantage has
      // verified it AND judged its errors.
      errorSplitJudged: errorSplitJudged({
        sourceProvider: match.source_provider,
        verified: verificationFor(match) != null,
        errorsJudgedAt: match.errors_judged_at,
      }),
      lobKeys,
      // A seat with points but no stats row is unknown, not zeroes: the fold
      // leaves it out of that match's published rows (`SeasonMatchStats`).
      // Tiebreaks won is the one figure the view does not carry; no Head to
      // head row reads it, so it is 0 on the rows that exist.
      youStats: statsByKey.get(statKey(match.id, isPlayer1)) ?? null,
      oppStats: statsByKey.get(statKey(match.id, !isPlayer1)) ?? null,
    });
  });

  return {
    analyzed: perMatch.length,
    matchesPlayed: sides.length,
    opponentsCount: seasonOpponentCount(sides),
    groups: foldSeasonRows(perMatch),
    tallies: foldSeasonTallies(perMatch),
    perMatch,
  };
}

/**
 * The profile's season, for the request. `null` for an id that names nobody
 * on this roster, as `getPlayerProfile` answers it.
 *
 * The RLS-scoped read comes first — `getPlayerMatchSides`, shared with the
 * profile through `cache()` — and only then, with the ids it returned, the
 * service-role file reader is handed in.
 */
export const getPlayerSeason = cache(async function getPlayerSeason(
  programId: string,
  playerId: string,
): Promise<PlayerSeason | null> {
  const sides = await getPlayerMatchSides(programId, playerId);
  if (!sides) return null;
  const supabase = await createClient();
  return loadPlayerSeason(supabase, sides.own, {
    loadBallPathsBody: supabaseBallPathsBody(lazyAdminClient()),
  });
});
