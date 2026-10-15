import {
  EMPTY_MATCH_FILTERS,
  type CourtHalf,
  type MatchFilters,
  type PlayerSide,
  type RallyLengthBand,
  type ReturnZone,
  type ScoreType,
  type ServeType,
  type ServeZone,
  serializeMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import { ASK_MEASURES, askMeasure } from "@/lib/services/ask/measures";

/**
 * A figure's "Watch": the Video tab of the one match an answer was computed
 * from, filtered to the points the figure counts — "Second-serve points won
 * 41%" opens the film on your second-serve points.
 *
 * The figure's column names the measure (`measures.ts`), and the measure
 * maps to one of the Video tab's own filter presets:
 *
 *   serve measures        → Serve › Player you, plus Type first or second
 *                           when the name says so, and Zone for a direction
 *   return measures       → Return (the serve's other side), plus the type
 *                           and the return's direction the same way
 *   break-point measures  → Score › Break point, on the serve the points
 *                           were played on (faced and saved are yours,
 *                           chances and conversions the opponent's)
 *   set-point measures    → Score › Set point
 *   rally-band measures   → Result › Rally length, that band
 *
 * Null for a measure with no preset — total points, winners, an average —
 * for a qualifier that is not this match's own points (an all-matches or
 * team baseline, a previous window), and for any scope but one match: a
 * figure over four matches has no one film to open. An `opp_` figure is the
 * opponent's, and swaps the sides.
 *
 * The same link for the rest of a block (roadmap 3.8): a bars or table row
 * is one measure when its label is the dictionary's own name for one —
 * the server canonicalises row labels (`answer-render.ts`), so the label
 * is read back to its column (`measureForLabel`); a table row that is one
 * match (`matchId`) opens that match's film, on the pattern's own points
 * when the answer's source carries them; and a serve court's zone opens
 * the side's serves into that zone from that court (`serveZoneVideoHref`).
 *
 * Pure: the same URL shape `pattern-video.ts` writes (`tab=film&f=…`).
 */

/** The Video view's tab, as `match-report-context.tsx` names it. */
const VIDEO_TAB = "film";

type Preset = Partial<MatchFilters>;

const serve = (type?: ServeType, zone?: ServeZone): Preset => ({
  server: "you",
  serveType: type ? [type] : [],
  serveZone: zone ? [zone] : [],
});
/** The returner is you ⇔ the server is the opponent (`model.ts`). */
const returning = (type?: ServeType, zone?: ReturnZone): Preset => ({
  server: "opponent",
  serveType: type ? [type] : [],
  returnZone: zone ? [zone] : [],
});
const score = (type: ScoreType, server: PlayerSide | null = null): Preset => ({
  scoreType: [type],
  server,
});
const rally = (band: RallyLengthBand): Preset => ({
  resultRallyLength: [band],
});

/** The preset for each measure of `measures.ts` that has one, by its bare key. */
const PRESETS: Readonly<Record<string, Preset>> = {
  // ── serve ──
  first_serves: serve("first"),
  first_serves_in: serve("first"),
  first_serve_points_won: serve("first"),
  first_serve_pct: serve("first"),
  first_serve_won_pct: serve("first"),
  second_serves: serve("second"),
  second_serves_in: serve("second"),
  second_serve_points_won: serve("second"),
  second_serve_won_pct: serve("second"),
  aces: serve(),
  double_faults: serve(),
  service_games: serve(),
  service_games_won: serve(),
  service_games_won_pct: serve(),
  service_winners: serve(),
  serve_t: serve(undefined, "T"),
  serve_t_pct: serve(undefined, "T"),
  serve_body: serve(undefined, "Body"),
  serve_body_pct: serve(undefined, "Body"),
  serve_wide: serve(undefined, "Wide"),
  serve_wide_pct: serve(undefined, "Wide"),
  // ── return ──
  first_returns: returning("first"),
  first_returns_in: returning("first"),
  first_return_points_won: returning("first"),
  first_return_in_pct: returning("first"),
  first_return_won_pct: returning("first"),
  second_returns: returning("second"),
  second_returns_in: returning("second"),
  second_return_points_won: returning("second"),
  second_return_in_pct: returning("second"),
  second_return_won_pct: returning("second"),
  return_games: returning(),
  return_games_won: returning(),
  return_games_won_pct: returning(),
  return_won_pct: returning(),
  return_points_won_pct: returning(),
  return_cross_court: returning(undefined, "Crosscourt"),
  return_cross_court_pct: returning(undefined, "Crosscourt"),
  return_down_the_line: returning(undefined, "Down the Line"),
  return_down_the_line_pct: returning(undefined, "Down the Line"),
  return_middle: returning(undefined, "Middle"),
  return_middle_pct: returning(undefined, "Middle"),
  // The filter's contact bands are not the statistics' depth thresholds
  // (`return-contact-depth`), so a depth measure opens every return.
  return_contact_inside: returning(),
  return_contact_inside_pct: returning(),
  return_contact_middle: returning(),
  return_contact_middle_pct: returning(),
  return_contact_deep: returning(),
  return_contact_deep_pct: returning(),
  // ── pressure ──
  break_points_faced: score("breakpoint", "you"),
  break_points_saved: score("breakpoint", "you"),
  break_points_saved_pct: score("breakpoint", "you"),
  break_point_opportunities: score("breakpoint", "opponent"),
  break_points_converted: score("breakpoint", "opponent"),
  break_points_converted_pct: score("breakpoint", "opponent"),
  set_points_faced: score("setPoint"),
  set_points_saved: score("setPoint"),
  set_points_saved_pct: score("setPoint"),
  set_point_opportunities: score("setPoint"),
  set_points_converted: score("setPoint"),
  set_points_converted_pct: score("setPoint"),
  // ── rallies ──
  short_rally_won: rally("short"),
  short_rally_total: rally("short"),
  short_rally_won_pct: rally("short"),
  medium_rally_won: rally("medium"),
  medium_rally_total: rally("medium"),
  medium_rally_won_pct: rally("medium"),
  long_rally_won: rally("long"),
  long_rally_total: rally("long"),
  long_rally_won_pct: rally("long"),
};

const other = (side: PlayerSide | null): PlayerSide | null =>
  side === "you" ? "opponent" : side === "opponent" ? "you" : null;

/**
 * The Video tab's filters for the points a figure's column counts, or null
 * when the column has no preset or is not this match's own points.
 */
export function figureMatchFilters(column: string): MatchFilters | null {
  const measure = askMeasure(column);
  if (!measure) return null;
  // `me_` adds nothing; `opp_` is the opponent's own figure. Every other
  // qualifier is a figure over other matches than this one.
  if (measure.qualifier !== "" && measure.qualifier !== "opponent") {
    return null;
  }
  const preset = PRESETS[measure.key];
  if (!preset) return null;
  const filters: MatchFilters = { ...EMPTY_MATCH_FILTERS, ...preset };
  if (measure.qualifier === "opponent") {
    return { ...filters, server: other(filters.server) };
  }
  return filters;
}

/** A match's Video tab, on the points a serialised filter (`?f=`) selects when there is one. */
export function watchHref(matchId: string, f = ""): string {
  const query = new URLSearchParams({ tab: VIDEO_TAB });
  if (f !== "") query.set("f", f);
  return `/dashboard/matches/${encodeURIComponent(matchId)}?${query.toString()}`;
}

/** A match's Video tab, on the points `filters` select when there are any. */
export function videoHref(
  matchId: string,
  filters: MatchFilters | null = null,
): string {
  return watchHref(matchId, filters ? serializeMatchFilters(filters) : "");
}

/**
 * The link a figure opens, or null: the one source match's Video tab on the
 * figure's points. Needs exactly one match in scope.
 */
export function figureVideoHref(
  column: string | undefined,
  sources: readonly AskSourceMatch[] | null | undefined,
): string | null {
  if (!column || !sources || sources.length !== 1) return null;
  const filters = figureMatchFilters(column);
  if (filters === null) return null;
  return videoHref(sources[0].matchId, filters);
}

/** A label as it is compared: lowercased, letters and digits only. */
function labelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The dictionary's labels back to a column, for the measures that have a
 * preset. Two measures that share a label — the count and its share —
 * share a preset too, so whichever is found first opens the same points.
 */
const LABEL_TO_MEASURE: ReadonlyMap<string, string> = new Map(
  Object.entries(ASK_MEASURES)
    .filter(([key]) => key in PRESETS)
    .map(([key, measure]) => [labelKey(measure.label), key] as const)
    .reverse(),
);

/**
 * The column a row's label names, when the label is a measure's own name
 * (`measures.ts`): bare for the subject's ("First serves in"), `opp_` for
 * the opponent's ("First serves in, opponent"). Null for a label that is
 * no measure, a measure with no Video preset, or a qualifier that is not
 * this match's own points ("…, all matches"). "…, share" is the paired
 * table's own suffix for a percentage beside its count, and names the same.
 */
export function measureForLabel(label: string): string | null {
  const [name, ...rest] = label.split(",");
  const key = LABEL_TO_MEASURE.get(labelKey(name));
  if (!key) return null;
  const qualifier = rest.join(",").trim().toLowerCase();
  if (qualifier === "" || qualifier === "share") return key;
  if (qualifier === "opponent") return `opp_${key}`;
  return null;
}

/** The link a bars row opens, or null: its label's measure over the one source match. */
export function barRowVideoHref(
  label: string,
  sources: readonly AskSourceMatch[] | null | undefined,
): string | null {
  return figureVideoHref(measureForLabel(label) ?? undefined, sources);
}

/**
 * The link a table row opens, or null. A row that is one match (`matchId`)
 * opens that match's film — on the points the answer counted there when the
 * source carries a pattern link, else on its label's measure when the label
 * is one, else the whole film. Any other row is its label's measure over
 * the one source match, as a figure is.
 */
export function tableRowVideoHref(
  row: { label: string; matchId?: string },
  sources: readonly AskSourceMatch[] | null | undefined,
): string | null {
  const column = measureForLabel(row.label);
  if (row.matchId) {
    const source = sources?.find((match) => match.matchId === row.matchId);
    if (source?.watch) return source.watch.href;
    return videoHref(row.matchId, column ? figureMatchFilters(column) : null);
  }
  return figureVideoHref(column ?? undefined, sources);
}

/**
 * A serve court's zone: the side's serves into that zone from that court,
 * on the one source match's film. The block says whose serves (`server`)
 * only when every cell was a serve measure of one side.
 */
export function serveZoneVideoHref(
  matchId: string,
  server: PlayerSide,
  court: CourtHalf,
  zone: ServeZone,
): string {
  return videoHref(matchId, {
    ...EMPTY_MATCH_FILTERS,
    server,
    court,
    serveZone: [zone],
  });
}
