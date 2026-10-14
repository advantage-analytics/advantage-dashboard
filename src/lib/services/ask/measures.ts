/**
 * What each measure is called, owned by the server.
 *
 * The answer model names a number wrongly more easily than it cites one
 * wrongly: "Hard court win percentage = 53.8%" over a cell holding the share
 * of POINTS won. The cell was right and the name was not. So wherever a
 * column name says which measure a cell holds, the name printed beside it
 * comes from here:
 *
 *   - `answer-render.ts` replaces the label of a figure, and of a table or
 *     bars row whose cells are all one measure, with the canonical one;
 *   - `facts.ts` tells the answer step what each column of its result is
 *     called, so the prose follows;
 *   - `review.ts` takes its fifteen labels from here, so a review and an
 *     ordinary answer name a measure the same way.
 *
 * A column is recognised through the naming convention the plan prompts
 * state: the view's own column name, alone or behind one of the comparison
 * prefixes (`me_`, `opp_`, `all_`, `team_`, `prev5_` …) or suffixes
 * (`_all`, `_team` …), or behind a summary prefix the server adds itself
 * (`start_`, `end_`, `low_`, `high_`). A planner alias this cannot place
 * keeps whatever the model called it.
 *
 * Labels are sentence case with no digit: the renderer deletes typed digits.
 *
 * A leaf: no imports.
 */

export interface AskMeasureName {
  /** As the page prints it beside the number. */
  label: string;
  /** What it is NOT, for a measure the model confuses with another. */
  note?: string;
}

/** Every measure the views document, and the few aliases planners reliably write. */
export const ASK_MEASURES: Readonly<Record<string, AskMeasureName>> = {
  // ── match_stats: counts ──
  aces: { label: "Aces" },
  double_faults: { label: "Double faults" },
  winners: { label: "Winners" },
  unforced_errors: { label: "Unforced errors" },
  forced_errors: { label: "Forced errors" },
  avg_rally_length: { label: "Average rally length" },
  first_serves: { label: "First serves hit" },
  first_serves_in: { label: "First serves in" },
  first_serve_points_won: { label: "First-serve points won" },
  second_serves: { label: "Second serves hit" },
  second_serves_in: { label: "Second serves in" },
  second_serve_points_won: { label: "Second-serve points won" },
  service_games: { label: "Service games" },
  service_games_won: { label: "Service games won" },
  first_returns: { label: "First-serve returns" },
  first_returns_in: { label: "First-serve returns in" },
  first_return_points_won: { label: "First-serve return points won" },
  second_returns: { label: "Second-serve returns" },
  second_returns_in: { label: "Second-serve returns in" },
  second_return_points_won: { label: "Second-serve return points won" },
  return_games: { label: "Return games" },
  return_games_won: { label: "Return games won" },
  break_points_faced: { label: "Break points faced" },
  break_points_saved: { label: "Break points saved" },
  break_point_opportunities: {
    // "Opportunities" was read as something faced: "the team faced fewer
    // break point opportunities" over the chances it had itself created.
    label: "Break point chances created",
    note: "chances to break the other side's serve, not break points faced",
  },
  break_points_converted: { label: "Break points converted" },
  set_points_faced: { label: "Set points faced" },
  set_points_saved: { label: "Set points saved" },
  set_point_opportunities: { label: "Set point opportunities" },
  set_points_converted: { label: "Set points converted" },
  total_points: { label: "Total points" },
  total_points_won: {
    label: "Total points won",
    note: "points, not matches",
  },
  service_winners: { label: "Service winners" },
  forehand_winners: { label: "Forehand winners" },
  backhand_winners: { label: "Backhand winners" },
  forehand_unforced_errors: { label: "Forehand unforced errors" },
  backhand_unforced_errors: { label: "Backhand unforced errors" },
  volley_winners: { label: "Volley winners" },
  net_points_appearances: { label: "Net points played" },
  net_points_won: { label: "Net points won" },
  serve_wide: { label: "Serves wide" },
  serve_body: { label: "Serves to the body" },
  serve_t: { label: "Serves to the T" },
  return_cross_court: { label: "Returns cross-court" },
  return_down_the_line: { label: "Returns down the line" },
  return_middle: { label: "Returns to the middle" },
  return_contact_inside: { label: "Returns hit inside the baseline" },
  return_contact_middle: { label: "Returns hit near the baseline" },
  return_contact_deep: { label: "Returns hit deep behind the baseline" },
  short_rally_won: { label: "Short rallies won" },
  short_rally_total: { label: "Short rallies" },
  medium_rally_won: { label: "Medium rallies won" },
  medium_rally_total: { label: "Medium rallies" },
  long_rally_won: { label: "Long rallies won" },
  long_rally_total: { label: "Long rallies" },
  // ── match_stats: percentages ──
  first_serve_pct: {
    label: "First serves in",
    note: "serves landed, not points won",
  },
  first_serve_won_pct: { label: "First-serve points won" },
  second_serve_won_pct: { label: "Second-serve points won" },
  service_games_won_pct: { label: "Service games won" },
  first_return_in_pct: { label: "First-serve returns in" },
  second_return_in_pct: { label: "Second-serve returns in" },
  first_return_won_pct: { label: "First-serve return points won" },
  second_return_won_pct: { label: "Second-serve return points won" },
  return_games_won_pct: { label: "Return games won" },
  break_points_saved_pct: { label: "Break points saved" },
  break_points_converted_pct: { label: "Break points converted" },
  set_points_saved_pct: { label: "Set points saved" },
  set_points_converted_pct: { label: "Set points converted" },
  total_points_won_pct: {
    label: "Total points won",
    note: "the share of points, not a match win rate",
  },
  short_rally_won_pct: { label: "Short rallies won" },
  medium_rally_won_pct: { label: "Medium rallies won" },
  long_rally_won_pct: { label: "Long rallies won" },
  serve_wide_pct: { label: "Serves wide" },
  serve_body_pct: { label: "Serves to the body" },
  serve_t_pct: { label: "Serves to the T" },
  return_cross_court_pct: { label: "Returns cross-court" },
  return_down_the_line_pct: { label: "Returns down the line" },
  return_middle_pct: { label: "Returns to the middle" },
  return_contact_inside_pct: { label: "Returns hit inside the baseline" },
  return_contact_middle_pct: { label: "Returns hit near the baseline" },
  return_contact_deep_pct: { label: "Returns hit deep behind the baseline" },
  // ── aliases the plan prompts name ──
  return_won_pct: { label: "Return points won" },
  return_points_won_pct: { label: "Return points won" },
  win_pct: {
    label: "Matches won",
    note: "the share of matches, not of points",
  },
  wins: { label: "Wins" },
  losses: { label: "Losses" },
};

/**
 * The words a prefix adds to a measure's name, longest prefix first. An
 * empty string adds nothing: `me_` is the subject itself.
 */
export const ASK_MEASURE_PREFIX_QUALIFIERS: readonly (readonly [
  string,
  string,
])[] = [
  ["all_matches_", "all matches"],
  ["baseline_", "all matches"],
  ["overall_", "all matches"],
  ["earlier_", "earlier matches"],
  ["recent5_", "last five"],
  ["recent_", "recent matches"],
  ["season_", "season"],
  ["career_", "all matches"],
  ["start_", "first match"],
  ["prev5_", "previous five"],
  ["last5_", "last five"],
  ["team_", "team"],
  ["prev_", "previous matches"],
  ["last_", "last match"],
  ["high_", "highest"],
  ["all_", "all matches"],
  ["avg_", "average"],
  ["opp_", "opponent"],
  ["end_", "latest match"],
  ["low_", "lowest"],
  ["me_", ""],
];

/** The same for the suffix forms. */
export const ASK_MEASURE_SUFFIX_QUALIFIERS: readonly (readonly [
  string,
  string,
])[] = [
  ["_all_matches", "all matches"],
  ["_baseline", "all matches"],
  ["_overall", "all matches"],
  ["_season", "season"],
  ["_prev5", "previous five"],
  ["_last5", "last five"],
  ["_team", "team"],
  ["_all", "all matches"],
  ["_avg", "average"],
];

export interface AskResolvedMeasure extends AskMeasureName {
  /** The documented column the measure is: `total_points_won_pct`. */
  key: string;
  /** What the prefixes and suffixes around it say, joined; "" for none. */
  qualifier: string;
}

/** A column never wears more qualifiers than this (`start_me_first_serve_pct`). */
const MAX_QUALIFIERS = 2;

/**
 * The measure a column holds, by its name; null for a name the convention
 * cannot place. The bare name is tried first, so `avg_rally_length` is the
 * view's own column and not "the average of rally_length".
 */
export function askMeasure(
  column: string,
  depth = 0,
): AskResolvedMeasure | null {
  if (Object.prototype.hasOwnProperty.call(ASK_MEASURES, column)) {
    return { key: column, qualifier: "", ...ASK_MEASURES[column] };
  }
  if (depth >= MAX_QUALIFIERS) return null;
  const wrap = (rest: string, words: string): AskResolvedMeasure | null => {
    const inner = askMeasure(rest, depth + 1);
    if (!inner) return null;
    return {
      ...inner,
      qualifier: [words, inner.qualifier]
        .filter((part) => part !== "")
        .join(", "),
    };
  };
  for (const [prefix, words] of ASK_MEASURE_PREFIX_QUALIFIERS) {
    if (column.startsWith(prefix) && column.length > prefix.length) {
      const found = wrap(column.slice(prefix.length), words);
      if (found) return found;
    }
  }
  for (const [suffix, words] of ASK_MEASURE_SUFFIX_QUALIFIERS) {
    if (column.endsWith(suffix) && column.length > suffix.length) {
      const found = wrap(column.slice(0, column.length - suffix.length), words);
      if (found) return found;
    }
  }
  return null;
}

/** A documented measure's label. Throws for a name that is not one: a typo in code, never data. */
export function askMeasureLabel(key: string): string {
  const measure = ASK_MEASURES[key];
  if (!measure) throw new Error(`no Ask measure named ${key}`);
  return measure.label;
}

/** A measure's name with what its prefixes say: "Total points won, opponent". */
export function askMeasureFullLabel(measure: AskResolvedMeasure): string {
  return measure.qualifier === ""
    ? measure.label
    : `${measure.label}, ${measure.qualifier}`;
}
