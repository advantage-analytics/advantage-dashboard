import { meanOfPresent, num, pct } from "./aggregate";
import { createClient } from "@/lib/supabase/server";
import type { MatchDetailedStats, PlayerStatistics, StatFraction } from "./types";

interface DbMatchStatsView {
  is_player1: boolean;
  aces: number | null;
  double_faults: number | null;
  first_serve_pct: string | null;
  first_serve_won_pct: string | null;
  second_serve_won_pct: string | null;
  break_points_converted: number | null;
  first_serve_points_won: number | null;
  second_serve_points_won: number | null;
  service_games_won: number | null;
  service_games_won_pct: string | null;
  first_return_points_won: number | null;
  second_return_points_won: number | null;
  return_games_won: number | null;
  first_return_in_pct: string | null;
  second_return_in_pct: string | null;
  first_returns_in: number | null;
  second_returns_in: number | null;
  first_return_won_pct: string | null;
  second_return_won_pct: string | null;
  return_games_won_pct: string | null;
  break_points_converted_pct: string | null;
  total_points: number | null;
  total_points_won: number | null;
  serve_rating: number | null;
  return_rating: string | null;
  under_pressure_rating: string | null;
  short_rally_won_pct: string | null;
  medium_rally_won_pct: string | null;
  long_rally_won_pct: string | null;
  serve_wide_pct: string | null;
  serve_body_pct: string | null;
  serve_t_pct: string | null;
  return_cross_court_pct: string | null;
  return_down_the_line_pct: string | null;
  return_middle_pct: string | null;
  return_contact_inside_pct: string | null;
  return_contact_middle_pct: string | null;
  return_contact_deep_pct: string | null;
  winners: number | null;
  unforced_errors: number | null;
  net_points_appearances: number | null;
  net_points_won: number | null;
  first_serves: number | null;
  first_serves_in: number | null;
  second_serves_in: number | null;
  service_games: number | null;
  break_points_faced: number | null;
  break_points_saved: number | null;
  break_point_opportunities: number | null;
  first_returns: number | null;
  second_returns: number | null;
  return_games: number | null;
  short_rally_won: number | null;
  short_rally_total: number | null;
  medium_rally_won: number | null;
  medium_rally_total: number | null;
  long_rally_won: number | null;
  long_rally_total: number | null;
}

interface DbMatchScore {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
}

export interface MatchStatisticsResult {
  statistics: MatchDetailedStats;
  player1Name: string;
  player2Name: string;
}

interface TiebreakCounts {
  player1Tiebreaks: number;
  player2Tiebreaks: number;
}

/* ── The player's own stat rows ────────────────────────── */

/**
 * One side of one of a player's matches, as the shared fetch returns it: the
 * `match_stats_with_percentages` columns the caller asked for, plus the two
 * keys that place the row in that player's history — which match it belongs to
 * and when that match was played.
 *
 * Cells carry the union the view actually returns: counts as numbers,
 * percentages as numeric strings.
 */
export interface PlayerStatRow {
  match_id: string;
  /** `matches.date`, carried across from the match query. */
  date: string | null;
  [column: string]: string | number | null;
}

/**
 * The player's matches → their side of each one's stat row.
 *
 * Both loaders below are built on this, and it matters that they agree on
 * WHICH rows a player's history is made of: `is_player1 = true` on the matches
 * they hold as player one. That is a real limitation — a match this person
 * played as player two is not in the set at all — but it is one limitation in
 * one place. A baseline drawn from a different set of rows than the series
 * beside it would be worse than a narrow one, because the tile would then
 * compare a number against the average of something else.
 *
 * `excludeMatchId` drops a match at the query. A caller that needs the current
 * match in the set for one figure and out of it for another leaves it unset and
 * excludes in the arithmetic instead.
 */
async function fetchPlayerStatRows(
  playerIds: readonly string[],
  columns: string,
  excludeMatchId?: string,
): Promise<PlayerStatRow[] | null> {
  if (playerIds.length === 0) return null;

  const supabase = await createClient();

  let query = supabase
    .from("matches")
    .select("id, date")
    .in("player1_id", playerIds as string[]);
  if (excludeMatchId) query = query.neq("id", excludeMatchId);
  const { data: matches } = await query;

  if (!matches?.length) return null;

  // The date travels with the row rather than being looked up again later: it
  // is the only thing that can order a series, and a value separated from its
  // match date is a point that can land anywhere on a line.
  const dateByMatch = new Map<string, string | null>(
    matches.map((m) => [m.id as string, (m.date as string | null) ?? null]),
  );

  const { data: rows } = await supabase
    .from("match_stats_with_percentages")
    .select(`match_id, ${columns}`)
    .in("match_id", [...dateByMatch.keys()])
    .eq("is_player1", true);

  if (!rows?.length) return null;

  // supabase-js types a `.select()` from its literal column list; this one is
  // assembled by the caller, so the row type it infers is a parser error rather
  // than a shape. The cast is over that, not over what the view returns.
  const cells = rows as unknown as Record<string, string | number | null>[];

  return cells.map((row) => {
    const matchId = String(row.match_id);
    return { ...row, match_id: matchId, date: dateByMatch.get(matchId) ?? null };
  });
}

/**
 * A count column off a row whose cells are typed as the view's whole union.
 *
 * Absent stays absent: a cell that is not a number is null here, never 0, so it
 * is excluded from a mean rather than dragging one down.
 */
function countCell(row: PlayerStatRow, column: string): number | null {
  const value = row[column];
  return typeof value === "number" ? num(value) : null;
}

/* ── Cross-match averages for player1 ──────────────────── */

export async function getPlayerAverageStats(
  /**
   * Every id that names this person as a player — their login, plus any roster
   * profile they have claimed. A single id is not enough any more: a coach can
   * create a roster row before an athlete has an account, and the matches
   * recorded against it carry the PROFILE's id, including the ones from before
   * the athlete claimed it. Passing only `auth.uid()` here left a claimed player
   * with no baseline at all, so every delta on their match page rendered null.
   */
  playerIds: readonly string[],
  excludeMatchId?: string,
): Promise<Partial<PlayerStatistics> | null> {
  // Average over the player's OTHER matches. On a match-detail page we exclude the
  // current match so the baseline is the player's typical level elsewhere — otherwise
  // a 1-match player compares against themselves (every delta = 0) and a few-match
  // player sees diluted deltas (the current match drags the average toward itself).
  const rows = await fetchPlayerStatRows(
    playerIds,
    "first_serve_pct, first_serve_won_pct, second_serve_won_pct, service_games_won_pct, break_points_converted_pct, first_return_won_pct, second_return_won_pct, return_games_won_pct, net_points_won, net_points_appearances, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct, aces, double_faults, winners, unforced_errors, total_points_won, total_points",
    excludeMatchId,
  );

  if (!rows?.length) return null;

  // Absent is excluded from the mean, not counted as zero, and a mean over
  // nothing is undefined rather than 0. This is the career baseline behind the
  // "vs your average" deltas on every match page, so a video-derived match
  // withholding its ace count used to drag that baseline toward zero for every
  // OTHER match the player has ever played.
  //
  // `?? 0` was the direct cause; the old percentage helper also filtered on
  // `v > 0`, which discarded absent values by accident AND discarded real zeros
  // with them — a match where the player genuinely converted no break points was
  // dropped from their conversion average rather than counted in it.
  const avgPct = (field: string) =>
    meanOfPresent(rows.map((r) => pct(r[field])), 0) ?? undefined;

  const avgNum = (field: string) =>
    meanOfPresent(rows.map((r) => countCell(r, field)), 0) ?? undefined;

  const netWon = rows.reduce(
    (a, r) => a + (countCell(r, "net_points_won") ?? 0),
    0,
  );
  const netTotal = rows.reduce(
    (a, r) => a + (countCell(r, "net_points_appearances") ?? 0),
    0,
  );

  return {
    firstServeInPct: avgPct("first_serve_pct"),
    firstServeWinPct: avgPct("first_serve_won_pct"),
    secondServeWinPct: avgPct("second_serve_won_pct"),
    serviceGamesWonPct: avgPct("service_games_won_pct"),
    breakpointsWonPct: avgPct("break_points_converted_pct"),
    firstReturnWonPct: avgPct("first_return_won_pct"),
    secondReturnWonPct: avgPct("second_return_won_pct"),
    returnGamesWonPct: avgPct("return_games_won_pct"),
    netPointsWonPct: netTotal > 0 ? Math.round((netWon / netTotal) * 100) : undefined,
    shortRallyWonPct: avgPct("short_rally_won_pct"),
    mediumRallyWonPct: avgPct("medium_rally_won_pct"),
    longRallyWonPct: avgPct("long_rally_won_pct"),
    aces: avgNum("aces"),
    doubleFaults: avgNum("double_faults"),
    winners: avgNum("winners"),
    unforcedErrors: avgNum("unforced_errors"),
    totalPointsWon: avgNum("total_points_won"),
    totalPoints: avgNum("total_points"),
  } as Partial<PlayerStatistics>;
}

/* ── Per-match KPI history ─────────────────────────────── */

/**
 * The four statistics the match page's KPI strip shows, and nothing else.
 *
 * A closed union rather than free strings because each key is a promise that a
 * column exists behind it and measures that thing. It is the one spelling the
 * tile, its baseline and its sparkline all agree on.
 */
export type MatchKpiKey =
  | "firstServeIn"
  | "firstServeWon"
  | "secondServeWon"
  | "breakPointsSaved";

export interface MatchKpiHistory {
  /**
   * Whether the viewer IS the player these figures describe. It decides the
   * pronoun — "vs your avg 61%" against "vs avg 61%" — and nothing else.
   *
   * Set by the CALLER, not here. This loader is handed the ids of the player
   * the figures describe and knows nothing about who is reading them; only the
   * caller holds both. `getMatchKpiHistory` therefore returns `false`, which
   * is the value that degrades to the neutral wording rather than telling a
   * coach that an athlete's average is their own.
   */
  viewerIsPlayer: boolean;
  /**
   * Mean over the player's OTHER matches, in whole percent.
   *
   * A key is ABSENT when none of those matches measured it — which is a
   * different claim from an average of zero, and the only honest one.
   */
  baseline: Partial<Record<MatchKpiKey, number>>;
  /**
   * Oldest → newest, ending at this match. A key is absent below two points.
   */
  series: Partial<Record<MatchKpiKey, number[]>>;
}

/** The view column behind each key. */
const KPI_COLUMN: Record<MatchKpiKey, string> = {
  firstServeIn: "first_serve_pct",
  firstServeWon: "first_serve_won_pct",
  secondServeWon: "second_serve_won_pct",
  breakPointsSaved: "break_points_saved_pct",
};

const KPI_KEYS = Object.keys(KPI_COLUMN) as MatchKpiKey[];

/**
 * How many matches a sparkline may cover: this one and the seven before it.
 *
 * Eight is the personal Home strip's window (`performance-server.ts` —
 * `measured.slice(0, 8)`), matched here on purpose. Both lines sit under a
 * single match's headline number and answer the same question, so a reader
 * moving between the two pages should not have to work out that one of them
 * covers a different stretch of season. It is a convention, not a season
 * boundary — the schema has no season.
 */
export const KPI_SERIES_WINDOW = 8;

/**
 * Below two points there is no line, only a dot, and a chart drawn through one
 * point still reads as a trend. The tile shows its hint text instead.
 */
export const KPI_SERIES_MIN_POINTS = 2;

/** `matches.date` as a timestamp; NaN for a row that has none we can read. */
function rowTime(row: PlayerStatRow): number {
  return Date.parse(String(row.date ?? ""));
}

/**
 * The two figures behind one match's KPI tiles, from one player's stat rows.
 *
 * Pure — no query, no Supabase import — the same split `team-kpi.ts` keeps, and
 * for the same reason: the rules that decide what a figure may CLAIM are the
 * part worth testing, and they should be testable without a database.
 *
 * The current match sits on both sides of one line here, deliberately:
 *
 * - It is **out of the baseline.** A mean that includes the match it is being
 *   compared against is a comparison with itself: a one-match player's every
 *   delta would be zero, and a few-match player's deltas would be diluted by
 *   the current match pulling the average toward it. Same rule
 *   `getPlayerAverageStats` states above, applied in the arithmetic rather than
 *   at the query, because the row is still needed for the line.
 * - It is **the series' last point.** The line answers "how did this match sit
 *   in the run up to it", so it ends on the match being read.
 *
 * Absent is never zero in either: a match that withheld a statistic is dropped
 * from that key's mean and skipped in that key's line, and a key nothing
 * measured is absent from both maps rather than present as 0.
 */
export function buildKpiHistory(
  rows: readonly PlayerStatRow[],
  matchId: string,
): Pick<MatchKpiHistory, "baseline" | "series"> {
  const others = rows.filter((row) => row.match_id !== matchId);
  const anchor = rows.find((row) => row.match_id === matchId) ?? null;
  const anchorTime = anchor ? rowTime(anchor) : Number.NaN;

  // Strictly BEFORE the anchor. `matches.date` is a day, so two matches played
  // on the same day cannot be ordered, and putting one of them on the line
  // before the other would place a point where nothing supports it. The id
  // tiebreak below is not that guess — it only keeps a window that has to cut
  // between same-day matches from shuffling between reads.
  //
  // No anchor, no window: a series that does not end at this match is a line
  // about a different question, and drawing it under this match's number would
  // read as this match's trend.
  const windowRows: PlayerStatRow[] = [];
  if (anchor && Number.isFinite(anchorTime)) {
    const earlier = others
      .filter((row) => {
        const time = rowTime(row);
        return Number.isFinite(time) && time < anchorTime;
      })
      .sort(
        (a, b) => rowTime(a) - rowTime(b) || a.match_id.localeCompare(b.match_id),
      );
    windowRows.push(...earlier.slice(-(KPI_SERIES_WINDOW - 1)), anchor);
  }

  const baseline: Partial<Record<MatchKpiKey, number>> = {};
  const series: Partial<Record<MatchKpiKey, number[]>> = {};

  for (const key of KPI_KEYS) {
    const column = KPI_COLUMN[key];

    // Whole percent, as `getPlayerAverageStats` averages, because the label it
    // feeds reads "vs your avg 61%".
    const mean = meanOfPresent(
      others.map((row) => pct(row[column])),
      0,
    );
    if (mean !== null) baseline[key] = mean;

    // Rounded for the same reason: the newest point of this line IS the number
    // printed above it, and a line whose end disagrees with the headline reads
    // as a bug rather than as precision.
    const measured = windowRows
      .map((row) => pct(row[column]))
      .filter((value): value is number => value !== null)
      .map((value) => Math.round(value));

    if (measured.length >= KPI_SERIES_MIN_POINTS) series[key] = measured;
  }

  return { baseline, series };
}

/**
 * The baseline and series behind one match page's KPI strip.
 *
 * `matchDate` anchors the series to this match's DATE rather than to its stat
 * row. The row set is the player's own matches as player one, so a match they
 * played as player two is not in it (see `fetchPlayerStatRows`); handing the
 * date in keeps the window's right edge fixed on the match being read instead
 * of collapsing the line entirely. The anchor carries no measurements, so it
 * contributes no point of its own — exactly as a match that withheld a
 * statistic already contributes none.
 *
 * Null means "no history": the player has no stat rows at all, a first analyzed
 * match or ids with nothing behind them. The tile says that out loud. It is
 * never a baseline of zero and never an invented delta.
 */
export async function getMatchKpiHistory(
  /**
   * Every id this player's matches may sit under. One person can hold two — a
   * login on personal uploads, a roster profile on program ones — and a history
   * read from either alone is half a season under a label that says "your
   * avg". The same set `getPlayerAverageStats` takes, for the same reason; a
   * caller that knows this player only by the id on the match row passes that
   * one.
   */
  playerIds: readonly string[],
  matchId: string,
  matchDate: string,
): Promise<MatchKpiHistory | null> {
  // No `excludeMatchId`: this match has to be IN the set, because the series
  // ends on it. `buildKpiHistory` leaves it out of the baseline instead.
  const rows = await fetchPlayerStatRows(
    playerIds,
    KPI_KEYS.map((key) => KPI_COLUMN[key]).join(", "),
  );

  if (!rows?.length) return null;

  const anchored = rows.some((row) => row.match_id === matchId)
    ? rows
    : [...rows, { match_id: matchId, date: matchDate }];

  return { viewerIsPlayer: false, ...buildKpiHistory(anchored, matchId) };
}

/* ── Single-match stats ────────────────────────────────── */

export async function getMatchStatisticsFromSupabase(
  matchId: string
): Promise<MatchStatisticsResult | null> {
  const supabase = await createClient();

  const [statsResult, matchResult] = await Promise.all([
    supabase
      .from("match_stats_with_percentages")
      .select(
        "is_player1, aces, double_faults, first_serve_pct, first_serve_won_pct, second_serve_won_pct, break_points_converted, first_serve_points_won, second_serve_points_won, service_games_won, service_games_won_pct, first_return_points_won, second_return_points_won, return_games_won, first_return_in_pct, second_return_in_pct, first_returns_in, second_returns_in, first_return_won_pct, second_return_won_pct, return_games_won_pct, break_points_converted_pct, total_points, total_points_won, serve_rating, return_rating, under_pressure_rating, short_rally_won_pct, medium_rally_won_pct, long_rally_won_pct, serve_wide_pct, serve_body_pct, serve_t_pct, return_cross_court_pct, return_down_the_line_pct, return_middle_pct, return_contact_inside_pct, return_contact_middle_pct, return_contact_deep_pct, winners, unforced_errors, net_points_appearances, net_points_won, first_serves, first_serves_in, second_serves_in, service_games, break_points_faced, break_points_saved, break_point_opportunities, first_returns, second_returns, return_games, short_rally_won, short_rally_total, medium_rally_won, medium_rally_total, long_rally_won, long_rally_total"
      )
      .eq("match_id", matchId),
    supabase
      .from("matches")
      .select("score, player1_name, player2_name")
      .eq("id", matchId)
      .single(),
  ]);

  if (statsResult.error || !statsResult.data?.length) return null;

  const player1Row = statsResult.data.find(
    (r) => r.is_player1
  ) as DbMatchStatsView | undefined;
  const player2Row = statsResult.data.find(
    (r) => !r.is_player1
  ) as DbMatchStatsView | undefined;
  const score = matchResult.data?.score as DbMatchScore | null;
  const player1Name = matchResult.data?.player1_name ?? "Player 1";
  const player2Name = matchResult.data?.player2_name ?? "Player 2";

  const { player1Tiebreaks, player2Tiebreaks } = countTiebreaksWon(score);

  return {
    statistics: {
      summary: { totalPoints: 0, durationMinutes: 0, longestRally: 0 },
      player1Stats: transformToPlayerStats(player1Row, player1Tiebreaks),
      player2Stats: transformToPlayerStats(player2Row, player2Tiebreaks),
    },
    player1Name,
    player2Name,
  };
}

function countTiebreaksWon(score: DbMatchScore | null): TiebreakCounts {
  if (!score?.player1_tiebreaks || !score?.player2_tiebreaks) {
    return { player1Tiebreaks: 0, player2Tiebreaks: 0 };
  }

  let player1Tiebreaks = 0;
  let player2Tiebreaks = 0;

  for (let i = 0; i < score.player1_tiebreaks.length; i++) {
    const p1 = score.player1_tiebreaks[i] ?? 0;
    const p2 = score.player2_tiebreaks[i] ?? 0;
    if (p1 > p2) player1Tiebreaks++;
    else if (p2 > p1) player2Tiebreaks++;
  }

  return { player1Tiebreaks, player2Tiebreaks };
}

const DEFAULT_STATS: PlayerStatistics = {
  aces: null,
  doubleFaults: null,
  firstServeInPct: 0,
  firstServeWinPct: 0,
  secondServeWinPct: null,
  breakpointsWon: 0,
  tiebreaksWon: 0,
  servicePointsWon: 0,
  serviceGamesWon: 0,
  serviceGamesWonPct: 0,
  returnPointsWon: 0,
  firstReturnPointsWon: 0,
  secondReturnPointsWon: 0,
  returnGamesWon: 0,
  firstReturnInPct: 0,
  secondReturnInPct: 0,
  firstReturnWonPct: 0,
  secondReturnWonPct: 0,
  returnGamesWonPct: 0,
  breakpointsWonPct: 0,
  totalPoints: 0,
  totalPointsWon: 0,
  serveRating: 0,
  returnRating: 0,
  underPressureRating: 0,
  shortRallyWonPct: 0,
  mediumRallyWonPct: 0,
  longRallyWonPct: 0,
  winners: 0,
  unforcedErrors: 0,
  netPointsAppearances: 0,
  netPointsWon: 0,
  netPointsWonPct: 0,
  breakpointsSaved: 0,
  fractions: {},
  serveWidePct: 0,
  serveBodyPct: 0,
  serveTpct: 0,
  returnCrossCourtPct: 0,
  returnDownTheLinePct: 0,
  returnMiddlePct: 0,
  returnContactInsidePct: 0,
  returnContactMiddlePct: 0,
  returnContactDeepPct: 0,
};

function frac(made: number | null, attempts: number | null): StatFraction | null {
  const m = made ?? 0;
  const a = attempts ?? 0;
  return a > 0 ? { made: m, attempts: a } : null;
}

function buildFractions(row: DbMatchStatsView): Partial<Record<string, StatFraction>> {
  const result: Partial<Record<string, StatFraction>> = {};

  const entries: [string, StatFraction | null][] = [
    ["firstServeInPct", frac(row.first_serves_in, row.first_serves)],
    ["firstServeWinPct", frac(row.first_serve_points_won, row.first_serves_in)],
    ["secondServeWinPct", frac(row.second_serve_points_won, row.second_serves_in)],
    ["breakpointsSaved", frac(row.break_points_saved, row.break_points_faced)],
    ["servicePointsWon", frac(
      (row.first_serve_points_won ?? 0) + (row.second_serve_points_won ?? 0),
      row.first_serves,
    )],
    ["serviceGamesWonPct", frac(row.service_games_won, row.service_games)],
    ["firstReturnInPct", frac(row.first_returns_in, row.first_returns)],
    ["secondReturnInPct", frac(row.second_returns_in, row.second_returns)],
    ["firstReturnWonPct", frac(row.first_return_points_won, row.first_returns)],
    ["secondReturnWonPct", frac(row.second_return_points_won, row.second_returns)],
    ["breakpointsWonPct", frac(row.break_points_converted, row.break_point_opportunities)],
    ["returnPointsWon", frac(
      (row.first_return_points_won ?? 0) + (row.second_return_points_won ?? 0),
      (row.first_returns ?? 0) + (row.second_returns ?? 0),
    )],
    ["returnGamesWonPct", frac(row.return_games_won, row.return_games)],
    ["netPointsWonPct", frac(row.net_points_won, row.net_points_appearances)],
    ["shortRallyWonPct", frac(row.short_rally_won, row.short_rally_total)],
    ["mediumRallyWonPct", frac(row.medium_rally_won, row.medium_rally_total)],
    ["longRallyWonPct", frac(row.long_rally_won, row.long_rally_total)],
  ];

  for (const [key, val] of entries) {
    if (val) result[key] = val;
  }

  return result;
}

function transformToPlayerStats(
  row: DbMatchStatsView | undefined,
  tiebreaksWon: number
): PlayerStatistics {
  if (!row) return DEFAULT_STATS;

  // These five are the ones suppress_derived_match_stats() can null, so they
  // must stay null all the way to the render. `?? 0` here is what made a
  // video-derived match report "0 aces" — a statement about the player rather
  // than about the analysis — even though the column was correctly suppressed.
  const round = (v: number | null) => (v === null ? null : Math.round(v));

  return {
    aces: num(row.aces),
    doubleFaults: num(row.double_faults),
    firstServeInPct: Math.round(parseFloat(row.first_serve_pct ?? "0")),
    firstServeWinPct: Math.round(parseFloat(row.first_serve_won_pct ?? "0")),
    secondServeWinPct: round(pct(row.second_serve_won_pct)),
    breakpointsWon: row.break_points_converted ?? 0,
    tiebreaksWon,
    servicePointsWon:
      (row.first_serve_points_won ?? 0) + (row.second_serve_points_won ?? 0),
    serviceGamesWon: row.service_games_won ?? 0,
    serviceGamesWonPct: Math.round(parseFloat(row.service_games_won_pct ?? "0")),
    returnPointsWon:
      (row.first_return_points_won ?? 0) + (row.second_return_points_won ?? 0),
    firstReturnPointsWon: row.first_return_points_won ?? 0,
    secondReturnPointsWon: row.second_return_points_won ?? 0,
    returnGamesWon: row.return_games_won ?? 0,
    firstReturnInPct: round(pct(row.first_return_in_pct)),
    secondReturnInPct: round(pct(row.second_return_in_pct)),
    firstReturnWonPct: Math.round(parseFloat(row.first_return_won_pct ?? "0")),
    secondReturnWonPct: Math.round(parseFloat(row.second_return_won_pct ?? "0")),
    returnGamesWonPct: Math.round(parseFloat(row.return_games_won_pct ?? "0")),
    breakpointsWonPct: Math.round(parseFloat(row.break_points_converted_pct ?? "0")),
    totalPoints: row.total_points ?? 0,
    totalPointsWon: row.total_points_won ?? 0,
    serveRating: parseFloat(String(row.serve_rating ?? 0)),
    returnRating: Math.round(parseFloat(row.return_rating ?? "0")),
    underPressureRating: Math.round(parseFloat(row.under_pressure_rating ?? "0")),
    shortRallyWonPct: Math.round(parseFloat(row.short_rally_won_pct ?? "0")),
    mediumRallyWonPct: Math.round(parseFloat(row.medium_rally_won_pct ?? "0")),
    longRallyWonPct: Math.round(parseFloat(row.long_rally_won_pct ?? "0")),
    winners: row.winners ?? 0,
    unforcedErrors: row.unforced_errors ?? 0,
    netPointsAppearances: row.net_points_appearances ?? 0,
    netPointsWon: row.net_points_won ?? 0,
    netPointsWonPct: (row.net_points_appearances ?? 0) > 0
      ? Math.round(((row.net_points_won ?? 0) / (row.net_points_appearances ?? 1)) * 100)
      : 0,
    breakpointsSaved: row.break_points_saved ?? 0,
    fractions: buildFractions(row),
    serveWidePct: Math.round(parseFloat(row.serve_wide_pct ?? "0")),
    serveBodyPct: Math.round(parseFloat(row.serve_body_pct ?? "0")),
    serveTpct: Math.round(parseFloat(row.serve_t_pct ?? "0")),
    returnCrossCourtPct: Math.round(parseFloat(row.return_cross_court_pct ?? "0")),
    returnDownTheLinePct: Math.round(parseFloat(row.return_down_the_line_pct ?? "0")),
    returnMiddlePct: Math.round(parseFloat(row.return_middle_pct ?? "0")),
    returnContactInsidePct: Math.round(parseFloat(row.return_contact_inside_pct ?? "0")),
    returnContactMiddlePct: Math.round(parseFloat(row.return_contact_middle_pct ?? "0")),
    returnContactDeepPct: Math.round(parseFloat(row.return_contact_deep_pct ?? "0")),
  };
}
