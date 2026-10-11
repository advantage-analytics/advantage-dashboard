import type { KpiDetailPoint } from "@/components/dashboard/shared/kpi-detail-chart";
import { meanOfPresent, num, pct, statKey } from "./aggregate";
import { matchOutcome, shortName, type MatchScore } from "./match-utils";
import { playerSide } from "./player-identity";
import {
  statRowsByKey,
  type DbStatRow,
  type ProfileResult,
} from "./player-profile";

/**
 * The personal Statistics page's catalogue and its rolling-window arithmetic.
 *
 * Pure: no Supabase, no React. The catalogue restates the match report's
 * head-to-head rows (`H2H_GROUPS` in `head-to-head-card.tsx`) rather than
 * importing them, because that module is a client component and this one is
 * read by loaders; `tests/statistics-rolling.spec.ts` holds the two lists to
 * the same labels in the same order, and to the same formats bar one — total
 * points won, a percentage here and a count on the card.
 *
 * Every series here is ordered oldest → newest with one entry per MATCH, and a
 * window counts matches, not measured values: a match that did not publish a
 * statistic still occupies its place in the window and is left out of the mean
 * (`aggregate.ts` says why an absent value is never a zero).
 */

export type StatisticFormat = "percent" | "count";

export type StatisticKey =
  | "aces"
  | "doubleFaults"
  | "firstServeInPct"
  | "firstServeWinPct"
  | "secondServeWinPct"
  | "breakpointsSaved"
  | "serviceGamesWonPct"
  | "firstReturnWonPct"
  | "secondReturnWonPct"
  | "breakpointsWonPct"
  | "returnWinners"
  | "netPointsWonPct"
  | "winners"
  | "unforcedErrors"
  | "totalPointsWon";

export interface StatisticConfig {
  key: StatisticKey;
  /** Sentence case, spelled as the match report's head-to-head row. */
  label: string;
  format: StatisticFormat;
  /** The LOWER number is the better one — double faults, unforced errors. */
  lowerIsBetter: boolean;
}

export interface StatisticGroup {
  title: string;
  statistics: StatisticConfig[];
}

function percent(key: StatisticKey, label: string): StatisticConfig {
  return { key, label, format: "percent", lowerIsBetter: false };
}

function count(
  key: StatisticKey,
  label: string,
  lowerIsBetter = false,
): StatisticConfig {
  return { key, label, format: "count", lowerIsBetter };
}

export const STATISTIC_GROUPS: StatisticGroup[] = [
  {
    title: "Serve",
    statistics: [
      count("aces", "Aces"),
      count("doubleFaults", "Double faults", true),
      percent("firstServeInPct", "First serve in"),
      percent("firstServeWinPct", "First serve points won"),
      percent("secondServeWinPct", "Second serve points won"),
      percent("breakpointsSaved", "Break points saved"),
      percent("serviceGamesWonPct", "Service games won"),
    ],
  },
  {
    title: "Return",
    statistics: [
      percent("firstReturnWonPct", "First serve returns won"),
      percent("secondReturnWonPct", "Second serve returns won"),
      percent("breakpointsWonPct", "Break points converted"),
      // No provider publishes it per match, so its row has no series yet.
      count("returnWinners", "Return winners"),
    ],
  },
  {
    title: "Points",
    statistics: [
      percent("netPointsWonPct", "Net points won"),
      count("winners", "Winners"),
      count("unforcedErrors", "Unforced errors", true),
      // A percentage HERE, where the card shows a count beside "of {total}":
      // a count rises with the length of the match, so a season of them
      // charts how long the matches ran, not how the player did.
      percent("totalPointsWon", "Total points won"),
    ],
  },
];

/** A rolling window in matches; `null` is Off. */
export type StatisticWindow = 3 | 5 | 10 | null;

export const WINDOW_OPTIONS: StatisticWindow[] = [null, 3, 5, 10];

export const DEFAULT_WINDOW: StatisticWindow = 5;

/** The `?window=` value: `off`, `3`, `5` or `10`; anything else is the default. */
export function parseWindow(raw: string | null | undefined): StatisticWindow {
  switch (raw) {
    case "off":
      return null;
    case "3":
      return 3;
    case "5":
      return 5;
    case "10":
      return 10;
    default:
      return DEFAULT_WINDOW;
  }
}

type Series = (number | null | undefined)[];

/** Mean of the present finite values, or null over none. */
export function averageOf(values: Series): number | null {
  return meanOfPresent(values);
}

/**
 * The trailing mean at every index whose window of `window` matches is full.
 *
 * `values` runs oldest → newest. Entry `i` of the result is the window ending
 * at match `i + window − 1`: the mean of what was measured in it, or null when
 * nothing was. Off, and a series shorter than the window, give `[]`.
 */
export function rollingMean(
  values: Series,
  window: StatisticWindow,
): (number | null)[] {
  if (window === null || values.length < window) return [];
  const out: (number | null)[] = [];
  for (let end = window; end <= values.length; end++) {
    out.push(averageOf(values.slice(end - window, end)));
  }
  return out;
}

/**
 * The last `window` matches against the `window` before them: the latest
 * rolling value minus the rolling value `window` matches earlier.
 *
 * Null when the window is Off, when the series holds fewer than `2 × window`
 * matches, or when either window measured nothing.
 */
export function windowChange(
  values: Series,
  window: StatisticWindow,
): number | null {
  if (window === null || values.length < 2 * window) return null;
  const rolling = rollingMean(values, window);
  const latest = rolling[rolling.length - 1];
  const previous = rolling[rolling.length - 1 - window];
  if (latest === null || previous === null) return null;
  // Both sides are one-decimal means; the difference is not, in binary.
  return Math.round((latest - previous) * 10) / 10;
}

/* ── One statistic across the season: the Trend card's series ─────────────── */

export interface TrendSeries {
  /**
   * One per match that MEASURED the statistic, oldest → newest. A match that
   * did not publish it has no dot — an absent value is never drawn as a zero.
   */
  points: KpiDetailPoint[];
  /** Mean of `points`, or null over none. */
  average: number | null;
  /**
   * Aligned to `points`: the rolling value at the match each point came from.
   * Null where that match's window is not yet full, or measured nothing — and
   * at every point when the window is Off.
   */
  rolling: (number | null)[];
  /** The newest rolling value — the window ending at the last match. */
  latest: number | null;
  /** `windowChange` over the whole series. */
  change: number | null;
}

/**
 * What the Trend card draws for one statistic.
 *
 * The window counts MATCHES (see the file header), so the rolling mean runs
 * over every match in `filtered` — unmeasured ones included, as gaps inside
 * their windows — and is only then lined up with the measured points. Rolling
 * over `points` instead would quietly widen a "last 5 matches" window to
 * however many matches it took to find five values.
 */
export function trendSeries(
  filtered: readonly StatisticsMatch[],
  key: StatisticKey,
  window: StatisticWindow,
): TrendSeries {
  const values = filtered.map((match) => match.values[key]);
  const means = rollingMean(values, window);

  const points: KpiDetailPoint[] = [];
  const rolling: (number | null)[] = [];
  filtered.forEach((match, index) => {
    const value = values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return;
    }
    points.push({
      value,
      date: match.date ?? "",
      opponent: match.opponentName,
    });
    // `means[i]` is the window ENDING at match `i + window − 1`.
    rolling.push(
      window === null ? null : (means[index - (window - 1)] ?? null),
    );
  });

  return {
    points,
    average: averageOf(points.map((point) => point.value)),
    rolling,
    latest: means[means.length - 1] ?? null,
    change: windowChange(values, window),
  };
}

/* ── One match, read from the viewer's side ───────────────────────────────── */

/** Every catalogue statistic for one side of one match; absent is `null`. */
export type StatisticValues = Record<StatisticKey, number | null>;

/** The `matches` columns `toStatisticsMatches` reads (`DbPersonalMatch` fits). */
export interface StatisticsMatchRow {
  id: string;
  date: string | null;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  created_by: string | null;
  score: MatchScore | null;
  court_type: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
  source_provider: string | null;
}

export interface StatisticsMatch {
  id: string;
  /** ISO date, or null for an undated row (sorted first, as the oldest). */
  date: string | null;
  isPlayer1: boolean;
  /** The other side's full name; `profile.opponentName` is the short one. */
  opponentName: string;
  opponentHand: string | null;
  opponentBackhand: string | null;
  courtType: string | null;
  /** An Advantage Intelligence match: its figures are derived from video. */
  isDerived: boolean;
  /** Null when the score cannot say — unrecorded, or level on sets. */
  won: boolean | null;
  /** The viewer's seat. */
  values: StatisticValues;
  /** The other seat; every key null when that row was never published. */
  opponentValues: StatisticValues;
  /** The same match as the season strip reads it (`seasonStrip`). */
  profile: ProfileResult;
}

/** The provider slug of an Advantage Intelligence match. */
const DERIVED_PROVIDER = "splitstep";

/** made / attempts × 100, or null when either is absent or nothing was attempted. */
function ratio(made: unknown, attempts: unknown): number | null {
  const m = num(made as number | null | undefined);
  const a = num(attempts as number | null | undefined);
  if (m === null || a === null || a <= 0) return null;
  return (m / a) * 100;
}

/**
 * One `match_stats_with_percentages` row as the catalogue's fifteen values —
 * each derived as the match report's head-to-head row derives it, with two
 * differences. Nothing is defaulted to zero or rounded here: an absent column
 * is `null` (a zero would be averaged in as a real match), and rounding is the
 * renderer's, after the mean. And total points won is a percentage of the
 * points played, where the card shows the count.
 */
function statisticValues(row: DbStatRow | undefined): StatisticValues {
  const rate = (column: string) =>
    pct(row?.[column] as string | number | null | undefined);
  const tally = (column: string) =>
    num(row?.[column] as number | null | undefined);

  return {
    aces: tally("aces"),
    doubleFaults: tally("double_faults"),
    firstServeInPct: rate("first_serve_pct"),
    firstServeWinPct: rate("first_serve_won_pct"),
    secondServeWinPct: rate("second_serve_won_pct"),
    // Published as a raw count; the card's row is the fraction too.
    breakpointsSaved: ratio(row?.break_points_saved, row?.break_points_faced),
    serviceGamesWonPct: rate("service_games_won_pct"),
    firstReturnWonPct: rate("first_return_won_pct"),
    secondReturnWonPct: rate("second_return_won_pct"),
    breakpointsWonPct: rate("break_points_converted_pct"),
    // Counted from shots on the match report; no shots are loaded here.
    returnWinners: null,
    netPointsWonPct: ratio(row?.net_points_won, row?.net_points_appearances),
    winners: tally("winners"),
    unforcedErrors: tally("unforced_errors"),
    // The share of all points played — a percentage on this page, a
    // deliberate departure from the card's count (see `STATISTIC_GROUPS`).
    totalPointsWon: ratio(row?.total_points_won, row?.total_points),
  };
}

/**
 * The viewer's matches with a published statistics row, oldest → newest.
 *
 * Which seat is the viewer's comes from `playerSide` and nowhere else. A match
 * whose side does not resolve, or whose own-seat row does not exist, is
 * DROPPED: it has no place in a series, and a zero-filled entry would read as
 * the worst match of the season.
 */
export function toStatisticsMatches(
  matches: readonly StatisticsMatchRow[],
  statRows: readonly DbStatRow[],
  myPlayerIds: readonly string[],
  userId: string,
): StatisticsMatch[] {
  const rawByKey = new Map<string, DbStatRow>();
  for (const row of statRows) {
    rawByKey.set(statKey(row.match_id, row.is_player1), row);
  }
  const profileByKey = statRowsByKey(statRows);

  const out: StatisticsMatch[] = [];
  for (const match of matches) {
    const side = playerSide(match, myPlayerIds, userId);
    if (side === null) continue;
    const isPlayer1 = side === "player1";
    const own = rawByKey.get(statKey(match.id, isPlayer1));
    if (!own) continue;

    const opponentName =
      (isPlayer1 ? match.player2_name : match.player1_name) ?? "Unknown";
    const won = matchOutcome(match.score, isPlayer1);

    out.push({
      id: match.id,
      date: match.date,
      isPlayer1,
      opponentName,
      opponentHand: match.opponent_hand,
      opponentBackhand: match.opponent_backhand,
      courtType: match.court_type,
      isDerived: match.source_provider === DERIVED_PROVIDER,
      won,
      values: statisticValues(own),
      opponentValues: statisticValues(
        rawByKey.get(statKey(match.id, !isPlayer1)),
      ),
      profile: {
        id: match.id,
        date: match.date,
        isPlayer1,
        won,
        entryId: null,
        opponentName: shortName(opponentName),
        score: match.score,
        tournamentName: null,
        stats: profileByKey.get(statKey(match.id, isPlayer1)) ?? null,
      },
    });
  }

  // Undated first: with no date there is nothing to place it by, and the
  // newest end of a series is the one a reader acts on. The sort is stable,
  // so same-day matches keep the order they were handed over in.
  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}
