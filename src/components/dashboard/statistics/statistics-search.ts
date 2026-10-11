import {
  DEFAULT_WINDOW,
  STATISTIC_GROUPS,
  parseWindow,
  type StatisticKey,
  type StatisticWindow,
  type StatisticsMatch,
} from "@/lib/data/statistics";
import type { Backhand, Hand } from "@/lib/matches/patch-match";

/**
 * The personal Statistics page's URL contract, and the one place its filtered
 * set is computed.
 *
 * Pure: no React, no `next/navigation`. The query string is the page's only
 * filter state — there is no store behind it — so a link to this page is a
 * link to exactly what its sender was reading, and everything a region needs
 * to know about "which matches" is `applyStatisticsFilters(all, state)`.
 *
 * | Param       | Values                                   | Default            |
 * | ----------- | ---------------------------------------- | ------------------ |
 * | `opponent`  | an opponent's full name                  | every opponent     |
 * | `hand`      | `right` · `left`                         | any                |
 * | `backhand`  | `one-handed` · `two-handed`              | any                |
 * | `courtType` | a surface, as the match stores it        | any                |
 * | `matches`   | `all` · `5` · `10` · `20`                | `all`              |
 * | `window`    | `off` · `3` · `5` · `10` (`parseWindow`) | `5`                |
 * | `stat`      | a catalogue key (`STATISTIC_GROUPS`)     | `firstServeWinPct` |
 *
 * An unknown value is the default, never an error: a hand-edited or stale
 * link opens the page rather than refusing. `opponent` and `courtType` are
 * free text because the columns are (`court_type` holds whatever was typed),
 * so "unknown" cannot be decided here — a name nobody played filters to
 * nothing, which the page draws as an honest zero.
 */

/** How many of the most recent matches to read; `all` is no limit. */
export type MatchCount = "all" | 5 | 10 | 20;

export const MATCH_COUNT_OPTIONS: readonly MatchCount[] = ["all", 5, 10, 20];

export interface StatisticsSearchState {
  /** An opponent's full name (`StatisticsMatch.opponentName`); null is all. */
  opponent: string | null;
  hand: Hand | null;
  backhand: Backhand | null;
  /** Lower-cased, since the column's casing is whoever typed it. */
  courtType: string | null;
  /** The most recent N of what the four filters above leave. */
  matches: MatchCount;
  window: StatisticWindow;
  /** The statistic the Trend region charts. */
  stat: StatisticKey;
}

export const DEFAULT_STATISTIC: StatisticKey = "firstServeWinPct";

export const DEFAULT_STATISTICS_SEARCH: StatisticsSearchState = {
  opponent: null,
  hand: null,
  backhand: null,
  courtType: null,
  matches: "all",
  window: DEFAULT_WINDOW,
  stat: DEFAULT_STATISTIC,
};

/** The filter half of the state at rest — what "Clear filters" writes. */
export const CLEARED_STATISTICS_FILTERS: Pick<
  StatisticsSearchState,
  "opponent" | "hand" | "backhand" | "courtType" | "matches"
> = {
  opponent: null,
  hand: null,
  backhand: null,
  courtType: null,
  matches: "all",
};

// Restated rather than imported as values: `patch-match.ts` reaches into the
// upload wizard, and this module is read by offline specs.
const HANDS: readonly Hand[] = ["right", "left"];
const BACKHANDS: readonly Backhand[] = ["one-handed", "two-handed"];

const STATISTIC_KEYS: ReadonlySet<string> = new Set(
  STATISTIC_GROUPS.flatMap((group) => group.statistics.map((s) => s.key)),
);

/**
 * Anything a query string arrives as: `URLSearchParams`, Next's read-only
 * twin from `useSearchParams`, or a page's resolved `searchParams` record.
 */
export type StatisticsSearchSource =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function reader(source: StatisticsSearchSource) {
  if (typeof (source as { get?: unknown }).get === "function") {
    const params = source as { get(name: string): string | null };
    return (name: string) => params.get(name);
  }
  const record = source as Record<string, string | string[] | undefined>;
  return (name: string) => {
    const value = record[name];
    // A repeated param reads as its first value, as `URLSearchParams.get` does.
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
}

function text(raw: string | null): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function oneOf<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | null {
  const value = text(raw)?.toLowerCase();
  return allowed.find((option) => option === value) ?? null;
}

function parseMatchCount(raw: string | null): MatchCount {
  return (
    MATCH_COUNT_OPTIONS.find((option) => String(option) === raw?.trim()) ??
    "all"
  );
}

export function parseStatisticsSearch(
  searchParams: StatisticsSearchSource,
): StatisticsSearchState {
  const get = reader(searchParams);
  const stat = text(get("stat"));
  return {
    opponent: text(get("opponent")),
    hand: oneOf(get("hand"), HANDS),
    backhand: oneOf(get("backhand"), BACKHANDS),
    courtType: text(get("courtType"))?.toLowerCase() ?? null,
    matches: parseMatchCount(get("matches")),
    window: parseWindow(text(get("window"))),
    stat:
      stat && STATISTIC_KEYS.has(stat)
        ? (stat as StatisticKey)
        : DEFAULT_STATISTIC,
  };
}

/**
 * The state as a query string, without the `?`.
 *
 * A value at its default is left out, so the page at rest has a bare URL and
 * `parseStatisticsSearch(new URLSearchParams(serialize(state)))` is `state`.
 * Keys are written in one fixed order, so two equal states are equal strings.
 */
export function serializeStatisticsSearch(
  state: StatisticsSearchState,
): string {
  const params = new URLSearchParams();
  if (state.opponent) params.set("opponent", state.opponent);
  if (state.hand) params.set("hand", state.hand);
  if (state.backhand) params.set("backhand", state.backhand);
  if (state.courtType) params.set("courtType", state.courtType);
  if (state.matches !== "all") params.set("matches", String(state.matches));
  if (state.window !== DEFAULT_WINDOW) {
    params.set("window", state.window === null ? "off" : String(state.window));
  }
  if (state.stat !== DEFAULT_STATISTIC) params.set("stat", state.stat);
  return params.toString();
}

/** Whether any of the five match filters is off its default. */
export function hasStatisticsFilters(state: StatisticsSearchState): boolean {
  return (
    state.opponent !== null ||
    state.hand !== null ||
    state.backhand !== null ||
    state.courtType !== null ||
    state.matches !== "all"
  );
}

const same = (value: string | null, wanted: string) =>
  value?.trim().toLowerCase() === wanted.toLowerCase();

/**
 * The matches the page reads, oldest → newest like `all`.
 *
 * Opponent, hand, backhand and court narrow first; `matches` then keeps the
 * most recent N of what is left — "my last five against left-handers", not
 * "the left-handers among my last five". A match that never recorded the
 * attribute being filtered on is left out: it cannot be said to fit.
 *
 * `window` and `stat` do not filter; they are how a region reads the set.
 */
export function applyStatisticsFilters(
  all: readonly StatisticsMatch[],
  state: StatisticsSearchState,
): StatisticsMatch[] {
  const { opponent, hand, backhand, courtType } = state;
  const kept = all.filter(
    (match) =>
      (opponent === null || same(match.opponentName, opponent)) &&
      (hand === null || same(match.opponentHand, hand)) &&
      (backhand === null || same(match.opponentBackhand, backhand)) &&
      (courtType === null || same(match.courtType, courtType)),
  );
  return state.matches === "all" ? kept : kept.slice(-state.matches);
}
