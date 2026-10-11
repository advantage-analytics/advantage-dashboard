import { meanOfPresent } from "./aggregate";

/**
 * The personal Statistics page's catalogue and its rolling-window arithmetic.
 *
 * Pure: no Supabase, no React. The catalogue restates the match report's
 * head-to-head rows (`H2H_GROUPS` in `head-to-head-card.tsx`) rather than
 * importing them, because that module is a client component and this one is
 * read by loaders; `tests/statistics-rolling.spec.ts` holds the two lists to
 * the same labels in the same order.
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
      count("totalPointsWon", "Total points won"),
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
