import type { ASK_VIEWS } from "@/lib/services/ask/sql-guard";

/**
 * The five `ask` views as the plan prompt describes them to the model: every
 * column, its type, and one line on what it means (design "Database" and
 * "Route → Plan step", plan step 6).
 *
 * This constant is a hand copy of the live views, and the model can only
 * write a correct query against a correct copy — a column missing here is a
 * question Ask wrongly refuses, a column listed here that the view lacks is a
 * query that fails at run time. `tests/ask-prompt.spec.ts` holds it against
 * the `comment on column ask.…` lines in `supabase/migrations/`, name for
 * name and meaning for meaning, so a view changed without this file (or the
 * reverse) fails a test rather than a player's question. The meanings ARE
 * those comments: change one there, in a migration, and copy it here.
 *
 * Checked against `information_schema.columns` on the live project on
 * 2026-10-11: 14 + 86 + 12 + 9 columns, in this order. `ask.matches.player_name`
 * (the fifteenth, `20261012170339_ask_team_scope.sql`) was added after that
 * check, and `ask.point_plays` (37 columns, `20261015090038_ask_point_facts.sql`)
 * on 2026-10-15, checked the same way. The court positions (`ask.shots`
 * contact/landing columns, `ask.matches.has_coords`,
 * `20261027032924_ask_shot_positions.sql`) followed on 2026-10-27.
 *
 * Pure data: imports a type only.
 */

export type AskViewName = (typeof ASK_VIEWS)[number];

/**
 * What a column holds, as the model needs to know it to write SQL: `integer`
 * covers `integer` and `bigint`, `number` covers `numeric` and
 * `double precision`.
 */
export type AskColumnType =
  "uuid" | "date" | "text" | "boolean" | "integer" | "number";

export interface AskColumn {
  name: string;
  type: AskColumnType;
  /** The view's `comment on column`, verbatim. */
  meaning: string;
  /**
   * True for a column the view has but the planner is not shown. The three
   * composite ratings are opaque sums of percentages: shown, a small model
   * averages them and answers "serve rating 231.9", which no player can read.
   * They stay here so the schema still matches the migrations column for
   * column; `renderAskSchemaBlock()` leaves them out.
   */
  hidden?: true;
  /**
   * True for a column only the TEAM planner is shown. `ask.matches.player_name`
   * says whose match a row is, which is the whole question in a program scope
   * and noise in a personal one: there it is the viewer's own name on every
   * row. The view has the column in both scopes; `renderAskSchemaBlock()`
   * lists it for a team prompt only.
   */
  teamOnly?: true;
  /**
   * True for a column only the MCP connector's `describe_views` lists. The
   * court positions (`ask.shots` contact/landing, `ask.matches.has_coords`)
   * are for a player's own Claude to draw and bin; the in-app planner has no
   * court visual to answer with and would invent its own depth thresholds
   * against the settled measures. `renderAskSchemaBlock()` lists them only
   * when asked for the MCP, and `focus.ts` never ranks them.
   */
  mcpOnly?: true;
}

/**
 * How every percentage over `ask.match_stats` is computed, as the live view
 * `match_stats_with_percentages` computes it: `round(100.0 * numerator /
 * nullif(denominator, 0), 1)`. For one match the view's own `_pct` column is
 * already right; across several matches the planner must sum these pairs,
 * and this table is what it is shown so it never guesses a denominator (the
 * baseline run divided `first_return_points_won` by `first_returns_in` and
 * answered 118.5%). The return direction and contact shares are left out:
 * each is a count over its three siblings, and the prompt is paid for by the
 * character.
 */
export interface AskPercentageDefinition {
  /** The `_pct` column of `ask.match_stats`. */
  column: string;
  numerator: string;
  denominator: string;
}

export const ASK_PERCENTAGE_DEFINITIONS: readonly AskPercentageDefinition[] = [
  {
    column: "first_serve_pct",
    numerator: "first_serves_in",
    denominator: "first_serves",
  },
  {
    column: "first_serve_won_pct",
    numerator: "first_serve_points_won",
    denominator: "first_serves_in",
  },
  {
    column: "second_serve_won_pct",
    numerator: "second_serve_points_won",
    denominator: "second_serves_in",
  },
  {
    column: "service_games_won_pct",
    numerator: "service_games_won",
    denominator: "service_games",
  },
  {
    column: "first_return_in_pct",
    numerator: "first_returns_in",
    denominator: "first_returns",
  },
  {
    column: "second_return_in_pct",
    numerator: "second_returns_in",
    denominator: "second_returns",
  },
  {
    column: "first_return_won_pct",
    numerator: "first_return_points_won",
    denominator: "first_returns",
  },
  {
    column: "second_return_won_pct",
    numerator: "second_return_points_won",
    denominator: "second_returns",
  },
  {
    column: "return_games_won_pct",
    numerator: "return_games_won",
    denominator: "return_games",
  },
  {
    column: "break_points_saved_pct",
    numerator: "break_points_saved",
    denominator: "break_points_faced",
  },
  {
    column: "break_points_converted_pct",
    numerator: "break_points_converted",
    denominator: "break_point_opportunities",
  },
  {
    column: "set_points_saved_pct",
    numerator: "set_points_saved",
    denominator: "set_points_faced",
  },
  {
    column: "set_points_converted_pct",
    numerator: "set_points_converted",
    denominator: "set_point_opportunities",
  },
  {
    column: "total_points_won_pct",
    numerator: "total_points_won",
    denominator: "total_points",
  },
  {
    column: "short_rally_won_pct",
    numerator: "short_rally_won",
    denominator: "short_rally_total",
  },
  {
    column: "medium_rally_won_pct",
    numerator: "medium_rally_won",
    denominator: "medium_rally_total",
  },
  {
    column: "long_rally_won_pct",
    numerator: "long_rally_won",
    denominator: "long_rally_total",
  },
  {
    column: "serve_wide_pct",
    numerator: "serve_wide",
    denominator: "serve_wide + serve_body + serve_t",
  },
  {
    column: "serve_body_pct",
    numerator: "serve_body",
    denominator: "serve_wide + serve_body + serve_t",
  },
  {
    column: "serve_t_pct",
    numerator: "serve_t",
    denominator: "serve_wide + serve_body + serve_t",
  },
];

export interface AskViewSchema {
  view: AskViewName;
  /**
   * What one row of the view is. The view's own comment, minus the names of
   * database objects the model cannot read (`ask.my_match_ids()`,
   * `match_stats_with_percentages`): a name in the prompt is a name a small
   * model will try to query.
   */
  meaning: string;
  /**
   * The same sentence for a program scope, where the rows are every match of
   * the program and "me" is the program's own player in each.
   */
  teamMeaning: string;
  columns: readonly AskColumn[];
}

export const ASK_SCHEMA: readonly AskViewSchema[] = [
  {
    view: "matches",
    meaning:
      "The viewer's own personal matches, one row each, already turned to the viewer: the opponent is the other player and i_won is the viewer's result.",
    teamMeaning:
      "Every match of the program, one row each, already turned to the program's own player in that match (player_name): the opponent is the other side and i_won is the program player's result.",
    columns: [
      {
        name: "match_id",
        type: "uuid",
        meaning: "The match's id; the only match id in this schema.",
      },
      {
        name: "played_on",
        type: "date",
        meaning: "The calendar date the match was played (UTC).",
      },
      {
        name: "opponent_name",
        type: "text",
        meaning:
          "The other player's name; null when the viewer's side cannot be determined.",
      },
      {
        name: "opponent_hand",
        type: "text",
        meaning:
          "The opponent's playing hand as recorded at upload, e.g. right or left; null when unknown.",
      },
      {
        name: "opponent_backhand",
        type: "text",
        meaning:
          "The opponent's backhand as recorded at upload, e.g. one-handed or two-handed; null when unknown.",
      },
      {
        name: "opponent_school",
        type: "text",
        meaning:
          "The school the opponent plays for: the linked program's name, or the school as typed when it is not in the directory; null when not recorded.",
      },
      {
        name: "opponent_program_id",
        type: "uuid",
        meaning:
          "The opponent's program in the directory; null when the school was typed or not recorded.",
        mcpOnly: true,
      },
      {
        name: "opponent_conference",
        type: "text",
        meaning:
          "The conference of the opponent's linked program; null when the school is not linked to the directory.",
      },
      {
        name: "tournament",
        type: "text",
        meaning: "Tournament or event name; null for an untitled match.",
      },
      {
        name: "round",
        type: "text",
        meaning:
          "Round within the tournament, free text; null when not recorded.",
      },
      {
        name: "court_type",
        type: "text",
        meaning:
          "Court surface or setting as entered, e.g. Outdoor Hard Court, Clay Court; null when not recorded.",
      },
      {
        name: "match_type",
        type: "text",
        meaning: "Practice, Tournament or Dual Match; null when not recorded.",
      },
      {
        name: "i_won",
        type: "boolean",
        meaning:
          "True if the viewer won, false if they lost, null when the score cannot say (no score, level sets, or unknown side).",
      },
      {
        name: "score_text",
        type: "text",
        meaning:
          "Per-set games from the viewer's seat, e.g. 6-4, 3-6, 7-5 (viewer first); tiebreak points omitted; null when there is no score.",
      },
      {
        name: "source",
        type: "text",
        meaning:
          "Where the match data came from: video (Advantage Intelligence analysis), swingvision (SwingVision import), or null when entered by hand.",
      },
      {
        name: "duration_seconds",
        type: "integer",
        meaning: "Length of the match in seconds; null when not recorded.",
      },
      {
        name: "has_stats",
        type: "boolean",
        meaning:
          "True when computed statistics exist for this match (serve, return, rally counters).",
      },
      {
        name: "player_name",
        type: "text",
        meaning:
          "The player this match is turned to (\"me\" in the other views): in a program scope the roster player's name, one spelling per player; in a personal scope the viewer's name as stored on the match.",
        teamOnly: true,
      },
      {
        name: "has_coords",
        type: "boolean",
        meaning:
          "True when the match's shots carry court positions (ask.shots contact_x, contact_y, landing_x, landing_y). Some SwingVision imports have none at all; a figure built from positions covers only the matches where this is true.",
        mcpOnly: true,
      },
    ],
  },
  {
    view: "match_stats",
    meaning:
      "Per-match statistics for the viewer's own personal matches, two rows per match: side = me (the viewer) and side = opponent. Counters are whole-match totals; _pct columns are percentages 0–100 for that one match, null when the denominator is zero.",
    teamMeaning:
      "Per-match statistics for the program's matches, two rows per match: side = me (the program's player in that match) and side = opponent. Counters are whole-match totals; _pct columns are percentages 0–100 for that one match, null when the denominator is zero.",
    columns: [
      {
        name: "match_id",
        type: "uuid",
        meaning:
          "The match these statistics belong to; join to ask.matches.match_id.",
      },
      {
        name: "side",
        type: "text",
        meaning:
          "Whose statistics this row holds: me (the viewer) or opponent. Filter side = 'me' for the viewer's own numbers.",
      },
      {
        name: "aces",
        type: "integer",
        meaning:
          "Serves this side hit that the other side could not touch (aces).",
      },
      {
        name: "double_faults",
        type: "integer",
        meaning:
          "Points this side lost by missing both serves (double faults).",
      },
      {
        name: "winners",
        type: "integer",
        meaning:
          "Shots this side hit in the rally that won the point outright (winners). Serves are not included: aces and service_winners are counted on their own.",
      },
      {
        name: "unforced_errors",
        type: "integer",
        meaning:
          "Points this side lost by missing a shot. This is every error the side made unless forced_errors is non-null; then it is only the unforced ones (unforced errors). For every error whether or not the split was judged, compute unforced_errors + coalesce(forced_errors, 0) as errors.",
      },
      {
        name: "forced_errors",
        type: "integer",
        meaning:
          "Points this side lost by missing a shot under pressure from the other side (forced errors); null when nobody judged the split — an unverified video match, or one verified before the split existed; SwingVision matches and matches verified from now on carry it.",
      },
      {
        name: "avg_rally_length",
        type: "number",
        meaning:
          "Average number of shots per point across the match, the same for both sides.",
      },
      {
        name: "first_serves",
        type: "integer",
        meaning:
          "Points on which this side hit a first serve (first-serve attempts).",
      },
      {
        name: "first_serves_in",
        type: "integer",
        meaning: "First serves by this side that landed in.",
      },
      {
        name: "first_serve_points_won",
        type: "integer",
        meaning: "Points this side won after its first serve landed in.",
      },
      {
        name: "second_serves",
        type: "integer",
        meaning:
          "Points on which this side needed a second serve (second-serve attempts).",
      },
      {
        name: "second_serves_in",
        type: "integer",
        meaning: "Second serves by this side that landed in.",
      },
      {
        name: "second_serve_points_won",
        type: "integer",
        meaning: "Points this side won after its second serve landed in.",
      },
      {
        name: "service_games",
        type: "integer",
        meaning: "Games this side served.",
      },
      {
        name: "service_games_won",
        type: "integer",
        meaning: "Games this side served and won (holds of serve).",
      },
      {
        name: "first_returns",
        type: "integer",
        meaning:
          "Points on which this side returned the other side's first serve.",
      },
      {
        name: "first_returns_in",
        type: "integer",
        meaning: "Returns of a first serve by this side that landed in.",
      },
      {
        name: "first_return_points_won",
        type: "integer",
        meaning: "Points this side won when returning a first serve.",
      },
      {
        name: "second_returns",
        type: "integer",
        meaning:
          "Points on which this side returned the other side's second serve.",
      },
      {
        name: "second_returns_in",
        type: "integer",
        meaning: "Returns of a second serve by this side that landed in.",
      },
      {
        name: "second_return_points_won",
        type: "integer",
        meaning: "Points this side won when returning a second serve.",
      },
      {
        name: "return_games",
        type: "integer",
        meaning: "Games this side returned (the other side served).",
      },
      {
        name: "return_games_won",
        type: "integer",
        meaning: "Return games this side won (breaks of serve).",
      },
      {
        name: "break_points_faced",
        type: "integer",
        meaning: "Break points this side faced on its own serve.",
      },
      {
        name: "break_points_saved",
        type: "integer",
        meaning: "Break points this side faced and won (saved).",
      },
      {
        name: "break_point_opportunities",
        type: "integer",
        meaning:
          "Break points this side held while returning (chances to break).",
      },
      {
        name: "break_points_converted",
        type: "integer",
        meaning: "Break-point chances this side won (converted).",
      },
      {
        name: "set_points_faced",
        type: "integer",
        meaning: "Set points the other side held against this side.",
      },
      {
        name: "set_points_saved",
        type: "integer",
        meaning: "Set points against this side that it won (saved).",
      },
      {
        name: "set_point_opportunities",
        type: "integer",
        meaning: "Set points this side held (chances to close a set).",
      },
      {
        name: "set_points_converted",
        type: "integer",
        meaning: "Set-point chances this side won (converted).",
      },
      {
        name: "total_points",
        type: "integer",
        meaning: "Points played in the match, the same for both sides.",
      },
      {
        name: "total_points_won",
        type: "integer",
        meaning: "Points this side won.",
      },
      {
        name: "service_winners",
        type: "integer",
        meaning:
          "Serves by this side that won the point without being an ace (the return was touched but not made).",
      },
      {
        name: "forehand_winners",
        type: "integer",
        meaning: "Winners this side hit on the forehand.",
      },
      {
        name: "backhand_winners",
        type: "integer",
        meaning: "Winners this side hit on the backhand.",
      },
      {
        name: "forehand_unforced_errors",
        type: "integer",
        meaning: "Unforced errors this side made on the forehand.",
      },
      {
        name: "backhand_unforced_errors",
        type: "integer",
        meaning: "Unforced errors this side made on the backhand.",
      },
      {
        name: "volley_winners",
        type: "integer",
        meaning: "Winners this side hit at the net (volleys and overheads).",
      },
      {
        name: "net_points_appearances",
        type: "integer",
        meaning:
          "Points on which this side came to the net: a volley, an overhead up the court, or any rally shot from inside the service line.",
      },
      {
        name: "net_points_won",
        type: "integer",
        meaning: "Points this side won after coming to the net.",
      },
      {
        name: "serve_wide",
        type: "integer",
        meaning: "Serves by this side placed wide (toward the sideline).",
      },
      {
        name: "serve_body",
        type: "integer",
        meaning: "Serves by this side placed at the returner's body.",
      },
      {
        name: "serve_t",
        type: "integer",
        meaning: "Serves by this side placed down the T (the centre line).",
      },
      {
        name: "return_cross_court",
        type: "integer",
        meaning: "Returns by this side hit cross-court.",
      },
      {
        name: "return_down_the_line",
        type: "integer",
        meaning: "Returns by this side hit down the line.",
      },
      {
        name: "return_middle",
        type: "integer",
        meaning: "Returns by this side hit through the middle of the court.",
      },
      {
        name: "return_contact_inside",
        type: "integer",
        meaning:
          "Returns this side struck from inside the baseline (early, aggressive position).",
      },
      {
        name: "return_contact_middle",
        type: "integer",
        meaning: "Returns this side struck from around the baseline.",
      },
      {
        name: "return_contact_deep",
        type: "integer",
        meaning: "Returns this side struck from well behind the baseline.",
      },
      {
        name: "short_rally_won",
        type: "integer",
        meaning: "Points this side won in rallies of 1–4 shots.",
      },
      {
        name: "short_rally_total",
        type: "integer",
        meaning:
          "Points played in rallies of 1–4 shots, the same for both sides.",
      },
      {
        name: "medium_rally_won",
        type: "integer",
        meaning: "Points this side won in rallies of 5–9 shots.",
      },
      {
        name: "medium_rally_total",
        type: "integer",
        meaning:
          "Points played in rallies of 5–9 shots, the same for both sides.",
      },
      {
        name: "long_rally_won",
        type: "integer",
        meaning: "Points this side won in rallies of 10 or more shots.",
      },
      {
        name: "long_rally_total",
        type: "integer",
        meaning:
          "Points played in rallies of 10 or more shots, the same for both sides.",
      },
      {
        name: "first_serve_pct",
        type: "number",
        meaning:
          "Share of this side's first serves that landed in, 0–100; null when it hit none.",
      },
      {
        name: "first_serve_won_pct",
        type: "number",
        meaning:
          "Share of points this side won when its first serve landed in, 0–100.",
      },
      {
        name: "second_serve_won_pct",
        type: "number",
        meaning:
          "Share of points this side won when its second serve landed in, 0–100.",
      },
      {
        name: "service_games_won_pct",
        type: "number",
        meaning: "Share of this side's service games it held, 0–100.",
      },
      {
        name: "first_return_in_pct",
        type: "number",
        meaning: "Share of first serves this side returned into play, 0–100.",
      },
      {
        name: "second_return_in_pct",
        type: "number",
        meaning: "Share of second serves this side returned into play, 0–100.",
      },
      {
        name: "first_return_won_pct",
        type: "number",
        meaning:
          "Share of points this side won when returning a first serve, 0–100.",
      },
      {
        name: "second_return_won_pct",
        type: "number",
        meaning:
          "Share of points this side won when returning a second serve, 0–100.",
      },
      {
        name: "return_games_won_pct",
        type: "number",
        meaning:
          "Share of the other side's service games this side broke, 0–100.",
      },
      {
        name: "break_points_saved_pct",
        type: "number",
        meaning:
          "Share of break points this side faced that it saved, 0–100; null when it faced none.",
      },
      {
        name: "break_points_converted_pct",
        type: "number",
        meaning:
          "Share of this side's break-point chances it converted, 0–100; null when it had none.",
      },
      {
        name: "set_points_saved_pct",
        type: "number",
        meaning:
          "Share of set points against this side that it saved, 0–100; null when it faced none.",
      },
      {
        name: "set_points_converted_pct",
        type: "number",
        meaning:
          "Share of this side's set-point chances it converted, 0–100; null when it had none.",
      },
      {
        name: "total_points_won_pct",
        type: "number",
        meaning: "Share of all points in the match this side won, 0–100.",
      },
      {
        name: "serve_rating",
        type: "number",
        meaning:
          "Composite serve score: first-serve %, first- and second-serve points won %, and service games held % summed, plus aces minus double faults; higher is better, null when any part is missing.",
        hidden: true,
      },
      {
        name: "return_rating",
        type: "number",
        meaning:
          "Composite return score: first- and second-serve return points won %, return games won % and break points converted % summed; higher is better, null when any part is missing.",
        hidden: true,
      },
      {
        name: "under_pressure_rating",
        type: "number",
        meaning:
          "Average of the break- and set-point percentages this side had a chance at (saved and converted), 0–100; null when it had none.",
        hidden: true,
      },
      {
        name: "short_rally_won_pct",
        type: "number",
        meaning:
          "Share of 1–4 shot rallies this side won, 0–100; null when there were none.",
      },
      {
        name: "medium_rally_won_pct",
        type: "number",
        meaning:
          "Share of 5–9 shot rallies this side won, 0–100; null when there were none.",
      },
      {
        name: "long_rally_won_pct",
        type: "number",
        meaning:
          "Share of rallies of 10 or more shots this side won, 0–100; null when there were none.",
      },
      {
        name: "serve_wide_pct",
        type: "number",
        meaning: "Share of this side's placed serves that went wide, 0–100.",
      },
      {
        name: "serve_body_pct",
        type: "number",
        meaning:
          "Share of this side's placed serves that went at the body, 0–100.",
      },
      {
        name: "serve_t_pct",
        type: "number",
        meaning:
          "Share of this side's placed serves that went down the T, 0–100.",
      },
      {
        name: "return_cross_court_pct",
        type: "number",
        meaning: "Share of this side's returns hit cross-court, 0–100.",
      },
      {
        name: "return_down_the_line_pct",
        type: "number",
        meaning: "Share of this side's returns hit down the line, 0–100.",
      },
      {
        name: "return_middle_pct",
        type: "number",
        meaning: "Share of this side's returns hit through the middle, 0–100.",
      },
      {
        name: "return_contact_inside_pct",
        type: "number",
        meaning:
          "Share of this side's returns struck from inside the baseline, 0–100.",
      },
      {
        name: "return_contact_middle_pct",
        type: "number",
        meaning:
          "Share of this side's returns struck from around the baseline, 0–100.",
      },
      {
        name: "return_contact_deep_pct",
        type: "number",
        meaning:
          "Share of this side's returns struck from well behind the baseline, 0–100.",
      },
    ],
  },
  {
    view: "points",
    meaning:
      "Every point of the viewer's own personal matches, one row each, with the server and the winner already turned to the viewer (i_served, i_won).",
    teamMeaning:
      "Every point of the program's matches, one row each, with the server and the winner already turned to the program's player in that match (i_served, i_won).",
    columns: [
      {
        name: "match_id",
        type: "uuid",
        meaning:
          "The match this point belongs to; join to ask.matches.match_id.",
      },
      {
        name: "set_number",
        type: "integer",
        meaning: "Which set the point was played in, counting from 1.",
      },
      {
        name: "game_number",
        type: "integer",
        meaning:
          "Which game of that set the point was played in, counting from 1 within each set.",
      },
      {
        name: "point_number",
        type: "integer",
        meaning:
          "The point's position in the whole match, counting from 1; orders points and joins to ask.shots.point_number.",
      },
      {
        name: "i_served",
        type: "boolean",
        meaning:
          "True when the viewer served this point, false when the opponent did.",
      },
      {
        name: "i_won",
        type: "boolean",
        meaning:
          "True when the viewer won this point, false when the opponent did.",
      },
      {
        name: "is_break_point",
        type: "boolean",
        meaning:
          "True when the returner could break serve by winning this point; null when the source did not say.",
      },
      {
        name: "is_set_point",
        type: "boolean",
        meaning:
          "True when either side could win the set with this point; null when the source did not say.",
      },
      {
        name: "is_match_point",
        type: "boolean",
        meaning:
          "True when either side could win the match with this point; null when the source did not say.",
      },
      {
        name: "is_pressure_point",
        type: "boolean",
        meaning:
          "Reserved flag for a high-pressure point; no current data source sets it, so it is false on every row today — use is_break_point, is_set_point and is_match_point instead.",
      },
      {
        name: "rally_length",
        type: "integer",
        meaning:
          "Number of shots in the point, the serve included; null when not recorded.",
      },
      {
        name: "result_type",
        type: "text",
        meaning:
          "How the point ended, as text: Ace, Double Fault, Service Winner, Forehand Winner, Backhand Winner, Volley Winner, Overhead Winner, Forehand Unforced Error, Backhand Unforced Error, Forehand Forced Error, Backhand Forced Error, and the like; the stroke named is the one that ended the point, by whoever hit it; null when unknown.",
      },
      {
        name: "court",
        type: "text",
        meaning:
          "The service court the point was played from: Deuce or Ad. From the point score (0-0, 15-15, 30-0 are Deuce; 15-0, 30-15 are Ad), or the point's place in its game when there is no score — the Video filter's Side.",
      },
    ],
  },
  {
    view: "shots",
    meaning:
      "Every recorded shot of the viewer's own personal matches, one row each, with the hitter already turned to the viewer (mine). Join to ask.points on match_id and point_number.",
    teamMeaning:
      "Every recorded shot of the program's matches, one row each, with the hitter already turned to the program's player in that match (mine). Join to ask.points on match_id and point_number.",
    columns: [
      {
        name: "match_id",
        type: "uuid",
        meaning:
          "The match this shot belongs to; join to ask.matches.match_id.",
      },
      {
        name: "point_number",
        type: "integer",
        meaning:
          "The point this shot was part of; joins to ask.points.point_number within the same match_id.",
      },
      {
        name: "shot_number",
        type: "integer",
        meaning:
          "The shot's order within the point: 1 is the serve that started the rally (the second serve after a fault), 2 the return, 3 the server's next shot, and so on. 0 is a faulted first serve or a feed, never part of the rally.",
      },
      {
        name: "mine",
        type: "boolean",
        meaning:
          "True when the viewer hit this shot, false when the opponent did.",
      },
      {
        name: "shot_type",
        type: "text",
        meaning:
          "The stroke, as text: First Serve, Second Serve, Forehand, Backhand, Volley, Overhead, or a few rarer labels; null when unknown.",
      },
      {
        name: "spin_type",
        type: "text",
        meaning:
          "The spin on the ball, as text: Topspin, Flat, Slice, Backspin, Sidespin or Kick; null when unknown.",
      },
      {
        name: "speed_mph",
        type: "number",
        meaning:
          "Ball speed off the racket in miles per hour; null when not measured.",
      },
      {
        name: "zone",
        type: "text",
        meaning:
          "Where the shot was aimed, as stored: for serves Wide, Body or T; for other shots Crosscourt, Down the Line or Middle; null when not recorded. Use direction instead for any question about direction.",
      },
      {
        name: "direction",
        type: "text",
        meaning:
          "Where the shot went, as the Video tab's Direction filter names it: for serves Wide, Body or T; for other shots Crosscourt, Down the Line, Inside Out, Inside In or Middle. A forehand hit from the backhand side, or a backhand hit from the forehand side, is Inside Out (crosscourt) or Inside In (down the line), never Crosscourt or Down the Line; null when not recorded.",
      },
      {
        name: "result",
        type: "text",
        meaning:
          "Whether the shot landed: In, Out or Net; null when not recorded.",
      },
      {
        name: "contact_x",
        type: "number",
        meaning:
          "Where the hitter struck the ball, across the court: metres from the centre line, positive to the player's right as they face the net from their own baseline. The frame is turned to the player for every point, so end changes need no handling; null when not measured.",
        mcpOnly: true,
      },
      {
        name: "contact_y",
        type: "number",
        meaning:
          "Where the hitter struck the ball, along the court: metres from the player's own baseline (0), through the net (11.885), to the opponent's baseline (23.77); below 0 or above 23.77 is behind a baseline. Turned to the player like contact_x; null when not measured.",
        mcpOnly: true,
      },
      {
        name: "landing_x",
        type: "number",
        meaning:
          "Where the ball bounced, across the court, in the same frame as contact_x; the singles sidelines are at -4.115 and 4.115. Null when not measured, for every ball that hit the net (result Net), and when the recorded bounce is on the hitter's own half, none of which is a real position. Use result, not this, to say whether a ball was in.",
        mcpOnly: true,
      },
      {
        name: "landing_y",
        type: "number",
        meaning:
          "Where the ball bounced, along the court, in the same frame as contact_y: the player's shots that land in sit between 11.885 and 23.77, the opponent's between 0 and 11.885; the service lines are at 5.485 and 18.285. Null like landing_x.",
        mcpOnly: true,
      },
      {
        name: "landing_pinned",
        type: "boolean",
        meaning:
          "True when a SwingVision serve's bounce sits on a service line, where SwingVision often places a faulted serve instead of measuring it: leave these out of any figure about where serves landed. False otherwise; null when there is no bounce.",
        mcpOnly: true,
      },
      {
        name: "landing_section",
        type: "text",
        meaning:
          "Which section of the court an in-play ball (result In) bounced in, for counting rather than plotting. A serve has its zone: Wide, Body or T. Any other shot has a depth and a lane, as Short, Mid or Deep (thirds of the half from the net to the baseline) then Left, Middle or Right (thirds of the singles width as the player sees it from their own baseline), for example Deep Left. Null when the ball was not in or its bounce is not measured.",
        mcpOnly: true,
      },
    ],
  },
  {
    view: "point_plays",
    meaning:
      "Every point of the viewer's own personal matches, one row each, with the shots that matter already picked out — the serve, the return, each side's plus one (the third and fourth shots) and the last two shots — and every hitter turned to the viewer (i_served, i_won, return_mine, p1s_mine, p1r_mine, last_mine, prev_mine). Join to ask.points on match_id and point_number for the pressure flags.",
    teamMeaning:
      "Every point of the program's matches, one row each, with the shots that matter already picked out — the serve, the return, each side's plus one (the third and fourth shots) and the last two shots — and every hitter turned to the program's player in that match (i_served, i_won, return_mine, p1s_mine, p1r_mine, last_mine, prev_mine). Join to ask.points on match_id and point_number for the pressure flags.",
    columns: [
      {
        name: "match_id",
        type: "uuid",
        meaning:
          "The match this point belongs to; join to ask.matches.match_id.",
      },
      {
        name: "set_number",
        type: "integer",
        meaning: "Which set the point was played in, counting from 1.",
      },
      {
        name: "game_number",
        type: "integer",
        meaning:
          "Which game of that set the point was played in, counting from 1 within each set.",
      },
      {
        name: "point_number",
        type: "integer",
        meaning:
          "The point's position in the whole match, counting from 1; joins to ask.points.point_number and ask.shots.point_number within the same match_id.",
      },
      {
        name: "i_served",
        type: "boolean",
        meaning:
          "True when the viewer served this point, false when the opponent did.",
      },
      {
        name: "i_won",
        type: "boolean",
        meaning:
          "True when the viewer won this point, false when the opponent did.",
      },
      {
        name: "court",
        type: "text",
        meaning:
          "The service court the point was played from: Deuce or Ad, the same as ask.points.court.",
      },
      {
        name: "rally_length",
        type: "integer",
        meaning:
          "Number of shots in the point, the serve included; null when not recorded.",
      },
      {
        name: "rally_band",
        type: "text",
        meaning:
          "The rally's length band, as ask.match_stats counts them: short (1–4 shots), medium (5–9) or long (10 or more); null when the length is not recorded.",
      },
      {
        name: "result_type",
        type: "text",
        meaning:
          "How the point ended, as ask.points.result_type: Ace, Double Fault, Forehand Winner, Backhand Unforced Error and the like, naming the stroke that ended the point by whoever hit it; null when unknown.",
      },
      {
        name: "has_shots",
        type: "boolean",
        meaning:
          "True when the point has shot-by-shot data (rows in ask.shots). When false, every serve, return, plus-one and last-shot column of this row is null: the point was not recorded shot by shot, it did not have no shots.",
      },
      {
        name: "serve_type",
        type: "text",
        meaning:
          "Which serve started the rally: First Serve, or Second Serve after a fault; null when no serve is recorded.",
      },
      {
        name: "serve_zone",
        type: "text",
        meaning:
          "Where that serve was aimed: Wide, Body or T; null when not recorded.",
      },
      {
        name: "serve_result",
        type: "text",
        meaning:
          "Whether that serve landed: In, Out or Net. A Second Serve that is Out or Net is a double fault; null when not recorded.",
      },
      {
        name: "had_second_serve",
        type: "boolean",
        meaning:
          "True when the point needed a second serve (the first serve was a fault), false otherwise.",
      },
      {
        name: "return_mine",
        type: "boolean",
        meaning:
          "True when the viewer hit the return (the first stroke after the serve, in or out), false when the opponent did; null when the point ended on the serve — an ace, a service winner, a double fault — or no return can be told apart.",
      },
      {
        name: "return_stroke",
        type: "text",
        meaning:
          "The return's stroke: Forehand or Backhand; null when there was no return or its stroke is not one of those.",
      },
      {
        name: "return_zone",
        type: "text",
        meaning:
          "Where the return was aimed, as stored: Crosscourt, Down the Line or Middle; null when not recorded.",
      },
      {
        name: "return_direction",
        type: "text",
        meaning:
          "Where the return went, as ask.shots.direction names it: Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.",
      },
      {
        name: "return_result",
        type: "text",
        meaning:
          "Whether the return landed: In, Out or Net; null when not recorded.",
      },
      {
        name: "p1s_mine",
        type: "boolean",
        meaning:
          "The serve plus one is the third shot of the point, the server's first ball after the return. True when the viewer hit it, false when the opponent did; null when the point ended before it.",
      },
      {
        name: "p1s_stroke",
        type: "text",
        meaning:
          "The serve plus one's stroke: Forehand, Backhand, Volley or Overhead; null when the point ended before it or the stroke is unknown.",
      },
      {
        name: "p1s_direction",
        type: "text",
        meaning:
          "Where the serve plus one went, as ask.shots.direction names it: Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.",
      },
      {
        name: "p1s_result",
        type: "text",
        meaning:
          "Whether the serve plus one landed: In, Out or Net; null when not recorded.",
      },
      {
        name: "p1r_mine",
        type: "boolean",
        meaning:
          "The return plus one is the fourth shot of the point, the returner's first ball after the serve plus one. True when the viewer hit it, false when the opponent did; null when the point ended before it.",
      },
      {
        name: "p1r_stroke",
        type: "text",
        meaning:
          "The return plus one's stroke: Forehand, Backhand, Volley or Overhead; null when the point ended before it or the stroke is unknown.",
      },
      {
        name: "p1r_direction",
        type: "text",
        meaning:
          "Where the return plus one went, as ask.shots.direction names it: Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.",
      },
      {
        name: "p1r_result",
        type: "text",
        meaning:
          "Whether the return plus one landed: In, Out or Net; null when not recorded.",
      },
      {
        name: "last_mine",
        type: "boolean",
        meaning:
          "True when the viewer hit the last shot of the point, false when the opponent did; null when the point has no shots.",
      },
      {
        name: "last_shot_type",
        type: "text",
        meaning:
          "The last shot's stroke as stored, as ask.shots.shot_type: First Serve, Second Serve, Forehand, Backhand, Volley, Overhead or a rarer label; null when unknown.",
      },
      {
        name: "last_stroke",
        type: "text",
        meaning:
          "The last shot's stroke, grouped: Forehand, Backhand, Volley or Overhead; null when it was a serve or its label is unknown.",
      },
      {
        name: "last_direction",
        type: "text",
        meaning:
          "Where the last shot went, as ask.shots.direction names it: for a serve Wide, Body or T; otherwise Crosscourt, Down the Line, Inside Out, Inside In or Middle; null when not recorded.",
      },
      {
        name: "last_result",
        type: "text",
        meaning:
          "Whether the last shot landed: In (a winner, or a ball the other side could not return) or Out or Net (an error by whoever hit it); null when not recorded.",
      },
      {
        name: "prev_mine",
        type: "boolean",
        meaning:
          "True when the viewer hit the shot before the last, false when the opponent did; null when the point had fewer than two shots.",
      },
      {
        name: "prev_shot_type",
        type: "text",
        meaning:
          "The stroke of the shot before the last, as stored (ask.shots.shot_type); null when there was none or it is unknown.",
      },
      {
        name: "prev_direction",
        type: "text",
        meaning:
          "Where the shot before the last went, as ask.shots.direction names it; null when not recorded. When last_mine is false and last_result is Out or Net, this is the viewer's ball that drew the opponent's error.",
      },
      {
        name: "last_shot_number",
        type: "integer",
        meaning:
          "The last shot's number within the point, as ask.shots.shot_number: join ask.shots on match_id, point_number and shot_number for anything else about that shot, such as its speed or spin; null when the point has no shots.",
      },
    ],
  },
];
