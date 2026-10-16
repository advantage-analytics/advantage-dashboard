import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import {
  MAX_ASK_MOMENTUM_POINTS,
  MIN_ASK_MOMENTUM_POINTS,
} from "@/lib/services/ask/events";
import type { AskPairedAnswer } from "@/lib/services/ask/paired";

/**
 * The momentum answer: how one match flowed, written by the server from one
 * row per point of `ask.points` — point_number, i_won, and when the query
 * selected them set_number and the three pressure flags.
 *
 * Which way the match turned and where is exactly the thing a model
 * narrates wrongly over a long list of rows, so nothing here is the model's:
 * the running difference is computed, its largest lead and deficit found,
 * and every figure the sentences state is a column added to row 1 and
 * cited, never typed. The headline carries no digit.
 *
 * Reached from `ask.ts` beside `buildTrendAnswer`, after it:
 *
 *   ?? buildMomentumAnswer(result.rows, { team, playerName, matchCount: result.matches.length })
 *
 * Null unless the scope is one match and every row is a point of it. Pure:
 * no database, no network, no Next.js.
 */

/** The columns the server adds to row 1 so a figure is cited, never typed. */
export const MOMENTUM_PREFIX = "momentum_";
const POINTS_COLUMN = `${MOMENTUM_PREFIX}points`;
const WON_COLUMN = `${MOMENTUM_PREFIX}won`;
const LOST_COLUMN = `${MOMENTUM_PREFIX}lost`;
const LEAD_COLUMN = `${MOMENTUM_PREFIX}lead`;
const LEAD_AT_COLUMN = `${MOMENTUM_PREFIX}lead_at`;
const TRAIL_COLUMN = `${MOMENTUM_PREFIX}trail`;
const TRAIL_AT_COLUMN = `${MOMENTUM_PREFIX}trail_at`;
const BREAK_POINTS_COLUMN = `${MOMENTUM_PREFIX}break_points`;
const SUBJECT_NAME_COLUMN = `${MOMENTUM_PREFIX}subject_name`;

/** The `ask.points` columns the block plots, by position. */
const POINT_COLUMNS = [
  "point_number",
  "i_won",
  "set_number",
  "is_break_point",
  "is_set_point",
  "is_match_point",
] as const;

const S = ASK_VISUAL_FIELD_SEPARATOR;

/**
 * Whether a question asks how a match went rather than what it measured —
 * the wording that wants the momentum block when the scope is one match.
 */
export function asksAboutMomentum(question: string): boolean {
  return /\b(momentum|turning point|turn(?:ed|ing)? (?:the )?match|swing|flow(?:ed)?|unfold(?:ed)?|how did the match (?:go|play out)|point by point|run of points)\b/i.test(
    question,
  );
}

export interface AskMomentumContext {
  /** True in a team scope: the subject is the program's player, never "you". */
  team: boolean;
  /** Team scope: the one player every match in scope belongs to, or null. */
  playerName: string | null;
  /** How many matches the scope selected; the block is for one. */
  matchCount: number;
}

function cell(column: string): string {
  return `{{r1.${column}}}`;
}

/**
 * The server-written momentum answer, or null when the result is not one
 * match's points: more than one match in scope, rows without point_number
 * and i_won, rows of different matches, or fewer decided points than the
 * block takes.
 */
export function buildMomentumAnswer(
  rows: readonly AskRow[],
  context: AskMomentumContext,
): AskPairedAnswer | null {
  if (context.matchCount !== 1) return null;
  if (
    rows.length < MIN_ASK_MOMENTUM_POINTS ||
    rows.length > MAX_ASK_MOMENTUM_POINTS
  ) {
    return null;
  }
  for (const row of rows) {
    if (
      typeof row.point_number !== "number" ||
      !Number.isFinite(row.point_number)
    ) {
      return null;
    }
    if (!("i_won" in row)) return null;
    if (row.i_won !== null && typeof row.i_won !== "boolean") return null;
    if (row.match_id !== undefined && row.match_id !== rows[0].match_id) {
      return null;
    }
  }
  const ordered = [...rows].sort(
    (a, b) => (a.point_number as number) - (b.point_number as number),
  );
  const decided = ordered.filter((row) => typeof row.i_won === "boolean");
  if (decided.length < MIN_ASK_MOMENTUM_POINTS) return null;

  let running = 0;
  let lead = 0;
  let leadAt: number | null = null;
  let trail = 0;
  let trailAt: number | null = null;
  for (const row of decided) {
    running += row.i_won ? 1 : -1;
    if (running > lead) {
      lead = running;
      leadAt = row.point_number as number;
    }
    if (running < trail) {
      trail = running;
      trailAt = row.point_number as number;
    }
  }
  const won = decided.filter((row) => row.i_won === true).length;
  const lost = decided.length - won;
  const breakPoints = ordered.filter(
    (row) => row.is_break_point === true,
  ).length;
  const hasBreakFlag = ordered.some((row) => "is_break_point" in row);

  const subject = context.team
    ? context.playerName
      ? cell(SUBJECT_NAME_COLUMN)
      : "The team's player"
    : "You";
  const possessive = context.team
    ? context.playerName
      ? `${cell(SUBJECT_NAME_COLUMN)}'s`
      : "The player's"
    : "Your";
  // Lead and deficit are the same player's, so the comparison names that
  // player twice; with no known pronoun the team form says "they".
  const self = context.team ? "they" : "you";
  const deficit = -trail;
  const headline =
    lead > deficit
      ? `${subject} led by more than ${self} ever trailed.`
      : lead < deficit
        ? `${subject} trailed by more than ${self} ever led.`
        : lead === 0
          ? "Neither side ever led."
          : "Neither side led by more than the other did.";

  const block = [
    `${ASK_VISUAL_LINE_PREFIX} momentum ${S} Points won minus points lost, point by point, with break, set and match points marked.`,
    `PLOT: ${POINT_COLUMNS.join(` ${S} `)}`,
  ];

  const body: string[] = [
    `${subject} won ${cell(WON_COLUMN)} of the ${cell(POINTS_COLUMN)} points with a known winner and lost ${cell(LOST_COLUMN)}.`,
  ];
  if (lead > 0) {
    body.push(
      `${possessive} largest lead was ${cell(LEAD_COLUMN)} ${lead === 1 ? "point" : "points"}, after point ${cell(LEAD_AT_COLUMN)}.`,
    );
  } else {
    body.push(`${subject} never led.`);
  }
  if (deficit > 0) {
    body.push(
      `${possessive} largest deficit was ${cell(TRAIL_COLUMN)} ${deficit === 1 ? "point" : "points"}, after point ${cell(TRAIL_AT_COLUMN)}.`,
    );
  } else {
    body.push(`${subject} never trailed.`);
  }
  if (hasBreakFlag) {
    body.push(
      breakPoints === 0
        ? "No break point was played."
        : `${cell(BREAK_POINTS_COLUMN)} ${breakPoints === 1 ? "break point was" : "break points were"} played.`,
    );
  }
  body.push("This is one match.");

  return {
    text: `${headline}\n${block.join("\n")}\n\n${body.join(" ")}`,
    rows: ordered.map((row, index) => {
      // Every plotted column is present on every row: one the query did
      // not select reads as null, which the block takes as "not known".
      const filled: AskRow = { ...row };
      for (const column of POINT_COLUMNS) {
        if (!(column in filled)) filled[column] = null;
      }
      if (index !== 0) return filled;
      return {
        ...filled,
        [POINTS_COLUMN]: decided.length,
        [WON_COLUMN]: won,
        [LOST_COLUMN]: lost,
        [LEAD_COLUMN]: lead,
        [LEAD_AT_COLUMN]: leadAt,
        [TRAIL_COLUMN]: deficit,
        [TRAIL_AT_COLUMN]: trailAt,
        [BREAK_POINTS_COLUMN]: breakPoints,
        ...(context.team && context.playerName
          ? { [SUBJECT_NAME_COLUMN]: context.playerName }
          : {}),
      };
    }),
  };
}
