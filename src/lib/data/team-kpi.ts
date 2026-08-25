/**
 * The Team Home KPI strip — its thresholds, and the refusals they drive.
 *
 * Pure arithmetic. No query, no Supabase import: the same split
 * `lib/data/match-analysis.ts` keeps from its loader, and for the same reason —
 * the rules deciding whether a figure may be *shown at all* are the part worth
 * testing, and they should be testable without a database.
 *
 * Four numbers on a card is the easy half. What this file is for is the three
 * refusals around them:
 *
 * 1. **No strip on day zero.** The page mounts nothing — no skeleton, no
 *    zeroed tiles. `0–0`, `—%`, `—%`, `0` on a coach's first morning is not an
 *    empty state, it is a product that looks broken. The gate lives in the
 *    loader (`getTeamHomeData` returns no tiles until one match is analyzed);
 *    this file is what the tiles that survive it are made of.
 * 2. **No figure without its sample.** Below `SMALL_SAMPLE_MIN` every tile
 *    carries the count it was computed from and says the count is small.
 * 3. **No trend through too little.** A sparkline drawn from two points is a
 *    chart that lies about a trend, and one drawn from five points played on a
 *    single Saturday is a chart about courts rather than about weeks.
 */

export type TeamKpiKey =
  | "dual-record"
  | "sets-won"
  | "first-serve"
  | "matches-analyzed";

/** What one row of a tile's sample IS. A dual is not a match and never counts as one. */
export type TeamKpiUnit = "match" | "dual";

/**
 * Below this many rows, a figure is *described* rather than presented.
 *
 * Five, and the number is read off the sport rather than picked to look round:
 *
 * - **It is less than one afternoon's tennis.** A collegiate dual is nine
 *   courts — six singles and three doubles — awarding seven team points. At
 *   four matches or fewer, a "team average" is a description of part of one
 *   card on one Saturday, and naming it after the team is the misattribution
 *   this strip exists to avoid.
 * - **It is a quarter of a season's duals.** An ITA dual season runs roughly
 *   twenty to twenty-five events, so five is where a record starts describing
 *   the season rather than its opening weekend.
 * - **It is where one match stops dominating.** At n = 5 a single outlier moves
 *   the mean by a fifth of its own distance from it; at n = 2 it moves it by a
 *   half.
 *
 * It is deliberately ONE number across all four tiles even though the tiles
 * count different things, because the caveat a coach reads is about the strip:
 * everything here rests on very little. Each tile still names its own count in
 * its own unit — "3 matches", "2 duals" — because that is the number that is
 * actually true of that figure.
 */
export const SMALL_SAMPLE_MIN = 5;

/**
 * What "a week of data" resolves to — and it is calendar days, alongside the
 * count above, never instead of it.
 *
 * Count alone is not a week: five matches played on one Saturday span zero
 * days, and a line drawn through them shows the difference between COURTS, not
 * the difference between weeks. Calendar alone is not data: two matches eight
 * days apart is a line joining two points, which is the chart that lies.
 *
 * So a trend and a sparkline need both — at least `SMALL_SAMPLE_MIN`
 * observations AND at least seven days between the oldest and the newest of
 * them. Seven is the shortest window that can hold a change rather than a
 * snapshot for a program whose fixtures fall on weekends: it guarantees at
 * least two separate match days, which is the minimum for "it moved" to mean
 * anything at all.
 */
export const TREND_MIN_SPAN_DAYS = 7;

/**
 * How many observations the sparkline draws.
 *
 * The same window the personal dashboard's strip uses
 * (`performance-server.ts` — `measured.slice(0, 8)`), so the two strips draw
 * the same length of history and a coach who reads both is not comparing a
 * season against a fortnight.
 */
const SPARK_WINDOW = 8;

/** One row's contribution to a tile, and when it happened. */
export interface TeamKpiObservation {
  /** The figure this row contributed, in the tile's own units. */
  value: number;
  /** `matches.date` or `program_events.starts_on`. */
  date: string;
}

export interface TeamKpiTile {
  key: TeamKpiKey;
  /** Rendered uppercase by the tile — write it in sentence case. */
  label: string;
  /** Pre-formatted, because only the loader knows what kind of number it is. */
  value: string;
  /** How many rows the figure was computed from. */
  sample: number;
  unit: TeamKpiUnit;
  /** Whole days from the oldest row behind the figure to the newest. */
  spanDays: number;
  /**
   * Does an honest per-row series exist for this figure at all?
   *
   * False for a count and for a win–loss record. A record is a pair of running
   * totals, not a measurement repeated over time; the only line you could draw
   * through it is a cumulative win percentage, which is a different statistic
   * wearing the record's label. A count of analyzed matches only ever rises, so
   * a sparkline on it is a staircase that reports growth as improvement.
   *
   * Kept apart from `sparkline.length === 0` because the two silences differ:
   * one figure has no series, the other has one that has not earned drawing
   * yet, and the tile says different things about them.
   */
  trendable: boolean;
  /** Oldest → newest. Empty unless BOTH gates above pass. */
  sparkline: number[];
  /**
   * Recent half minus earlier half, in the figure's own units. Null unless both
   * gates pass — and null is not zero: zero is "it did not move".
   */
  change: number | null;
}

/** Whole days between the earliest and latest usable date. Zero when fewer than two are. */
export function spanDays(dates: string[]): number {
  const times = dates
    .map((date) => Date.parse(date))
    .filter((time) => Number.isFinite(time));
  if (times.length < 2) return 0;
  return Math.floor((Math.max(...times) - Math.min(...times)) / 86_400_000);
}

/**
 * Recent half minus earlier half, over equal-sized windows.
 *
 * Halves rather than last-versus-previous, which is what the personal strip
 * does: one athlete's last match against their one before it is a fact about
 * two afternoons, and at team level it is a fact about whichever two players
 * happened to be filmed. Equal-sized windows are the point — with an odd
 * sample the middle observation is dropped rather than handed to one side,
 * because a delta between a three-match window and a two-match one is a
 * comparison of different things.
 *
 * Returns null below two observations per half, which the caller's gates
 * already prevent.
 */
export function halfSplitChange(values: number[]): number | null {
  const half = Math.floor(values.length / 2);
  if (half < 2) return null;

  const mean = (list: number[]) =>
    list.reduce((sum, value) => sum + value, 0) / list.length;

  const earlier = mean(values.slice(0, half));
  const recent = mean(values.slice(values.length - half));
  return Math.round((recent - earlier) * 10) / 10;
}

/**
 * A tile whose figure is a measurement repeated per row — so a series exists,
 * and both gates decide whether it may be drawn.
 *
 * `observations` must arrive oldest first and must already exclude rows that
 * did not measure the thing. An absent measurement is not a zero, which is the
 * rule `lib/data/aggregate.ts` exists to hold; a row dropped there is a row
 * that never belonged in this sample, so it is not counted in `sample` either.
 */
export function seriesTile(
  key: TeamKpiKey,
  label: string,
  unit: TeamKpiUnit,
  value: string,
  observations: TeamKpiObservation[]
): TeamKpiTile {
  const values = observations.map((observation) => observation.value);
  const span = spanDays(observations.map((observation) => observation.date));
  const earned =
    values.length >= SMALL_SAMPLE_MIN && span >= TREND_MIN_SPAN_DAYS;

  return {
    key,
    label,
    value,
    sample: values.length,
    unit,
    spanDays: span,
    trendable: true,
    sparkline: earned ? values.slice(-SPARK_WINDOW) : [],
    change: earned ? halfSplitChange(values) : null,
  };
}

/**
 * A tile whose figure is a tally — a record, or a count of rows.
 *
 * It carries its sample and its span like any other tile, so the small-sample
 * caveat still reaches it, but it never carries a trend or a sparkline. See
 * `trendable`.
 */
export function countTile(
  key: TeamKpiKey,
  label: string,
  unit: TeamKpiUnit,
  value: string,
  dates: string[]
): TeamKpiTile {
  return {
    key,
    label,
    value,
    sample: dates.length,
    unit,
    spanDays: spanDays(dates),
    trendable: false,
    sparkline: [],
    change: null,
  };
}

function plural(sample: number, unit: TeamKpiUnit): string {
  const word = unit === "dual" ? "dual" : "match";
  if (sample === 1) return `1 ${word}`;
  return `${sample} ${unit === "dual" ? "duals" : "matches"}`;
}

/**
 * The line under the value when there is no trend to put there — or null when
 * the tile has earned its trend.
 *
 * The wording lives beside the thresholds rather than in the component,
 * because it is the threshold made visible: change one and the other is wrong.
 *
 * Three outcomes, and the third is the one worth naming. A tile past the
 * sample threshold but inside a week is not short of data, it is short of
 * TIME, and telling a coach "small sample" there would be false — so it says
 * what it is actually waiting for.
 */
export function sampleNote(tile: TeamKpiTile): string | null {
  if (tile.sample < SMALL_SAMPLE_MIN) {
    return `${plural(tile.sample, tile.unit)} — small sample`;
  }
  if (tile.trendable && tile.change === null) {
    return `${plural(tile.sample, tile.unit)} — trends after a week`;
  }
  return null;
}
