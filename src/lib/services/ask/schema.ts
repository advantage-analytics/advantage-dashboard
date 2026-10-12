import type { ASK_VIEWS } from "@/lib/services/ask/sql-guard";

/**
 * The four `ask` views as the plan prompt describes them to the model: every
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
 * 2026-10-11: 14 + 86 + 12 + 9 columns, in this order.
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
  columns: readonly AskColumn[];
}

export const ASK_SCHEMA: readonly AskViewSchema[] = [
  {
    view: "matches",
    meaning:
      "The viewer's own personal matches, one row each, already turned to the viewer: the opponent is the other player and i_won is the viewer's result.",
    columns: [
      {
        name: "match_id",
        type: "uuid",
        meaning: "The match's id; the only id in this schema.",
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
    ],
  },
  {
    view: "match_stats",
    meaning:
      "Per-match statistics for the viewer's own personal matches, two rows per match: side = me (the viewer) and side = opponent. Counters are whole-match totals; _pct columns are percentages 0–100 for that one match, null when the denominator is zero.",
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
          "Shots this side hit that won the point outright (winners), serves included.",
      },
      {
        name: "unforced_errors",
        type: "integer",
        meaning:
          "Points this side lost by missing a shot that was not forced (unforced errors).",
      },
      {
        name: "forced_errors",
        type: "integer",
        meaning:
          "Points this side lost by missing a shot under pressure from the other side (forced errors); null when the source does not count them.",
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
        meaning: "Points on which this side came to the net.",
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
    ],
  },
  {
    view: "shots",
    meaning:
      "Every recorded shot of the viewer's own personal matches, one row each, with the hitter already turned to the viewer (mine). Join to ask.points on match_id and point_number.",
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
          "The shot's order within the point, counting from 1: 1 is the serve, 2 the return, 3 the server's next shot, and so on.",
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
          "Where the shot was aimed, as text: for serves Wide, Body or T; for other shots Crosscourt, Down the Line or Middle; null when not recorded.",
      },
      {
        name: "result",
        type: "text",
        meaning:
          "Whether the shot landed: In, Out or Net; null when not recorded.",
      },
    ],
  },
];
