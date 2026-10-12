import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import { MAX_ASK_TABLE_ROWS } from "@/lib/services/ask/events";
import { comparedPairs } from "@/lib/services/ask/facts";
import { askMeasure } from "@/lib/services/ask/measures";

/**
 * The paired answer: a result that is one row of convention pairs, written
 * by the server.
 *
 * A diagnostic — "why do I keep losing to Marek?" — comes back as one row of
 * `me_x` / `opp_x` columns, and a "how was my serve in August?" as `x` /
 * `all_x`. The answer model cited those cells correctly and then, some of
 * the time, wrote the comparison backwards: "Marek made more unforced errors
 * than you" over 112 and 134. Stating the direction in the facts block cut
 * that down and never ended it. The review (`review.ts`) had no such fault,
 * because no model wrote it. This is the same cure for every pair-shaped
 * result: the server works out which side of each pair is higher and writes
 * the sentence itself, in the renderer's reference syntax, through the same
 * render path. The answer model is not called.
 *
 * What it says, and what it never says:
 *
 * - Only higher / lower / more / fewer, with both figures beside the word.
 *   Never better or worse: whether more winners or fewer errors is "good" is
 *   not a claim this module makes.
 * - A count takes more / fewer; a percentage higher / lower.
 * - Measures are named from `measures.ts`; a planner alias it cannot place
 *   is named from its own column name.
 * - The other side is named from the data: the one opponent every match in
 *   scope was against, else "your opponents"; a baseline from its prefix.
 *
 * A result is pair-shaped only when it is ONE row, every pair in it compares
 * the same two sides, and at least half of its measure columns are in a
 * pair. Anything else stays with the answer model, the stated facts and the
 * guards.
 *
 * Pure: no database, no network, no Next.js.
 */

// ── Shape ────────────────────────────────────────────────────────────────────

/** One pair of a pair-shaped row, with both figures as the page prints them. */
export interface AskPair {
  /** The bare measure both columns hold. */
  measure: string;
  subject: string;
  other: string;
  subjectValue: number;
  otherValue: number;
  /** True for a `_pct` measure: higher / lower. False for a count: more / fewer. */
  percentage: boolean;
  /** The gap as a share of the larger figure: what the pairs are ordered by. */
  gap: number;
  /** As the answer names the measure. */
  label: string;
}

export interface AskPairedShape {
  /** `opponent` for `me_x` / `opp_x`; `baseline` for a measure against `all_x`, `team_x` … */
  kind: "opponent" | "baseline";
  /** The prefix or suffix the other side's columns wear: `opp_`, `all_`, `_team`. */
  otherQualifier: string;
  /** Every pair with a figure on both sides, the widest gap first. */
  pairs: AskPair[];
  /** Numeric columns in no pair, in the row's order. */
  unpaired: { column: string; label: string }[];
}

const SCOPE_COUNT_COLUMN = "matches_in_scope";

/** Columns that count matches or are a difference: never a measure of their own here. */
const NOT_A_MEASURE =
  /^(?:n|matches|played|match_count|matches_played|num_matches|n_matches|[a-z0-9_]+_matches|matches_[a-z0-9_]+|[a-z0-9_]+_match_count)$|_(?:diff|diff_pct|delta|change|gap)$/;

function printed(value: number): number {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return value < 0 && rounded > 0 ? -rounded : rounded;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A measure's name: the dictionary's, or the column's own words for an alias it cannot place. */
export function pairLabel(measure: string): string {
  const known = askMeasure(measure);
  if (known) return known.label;
  const words = measure
    .replace(/_(?:pct|percent|percentage)$/, "")
    .replace(/_/g, " ")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return words === ""
    ? "This measure"
    : words.charAt(0).toUpperCase() + words.slice(1);
}

/** What the other column wears around the measure's name. */
function qualifierOf(column: string, measure: string): string {
  if (column === measure) return "";
  if (column.endsWith(measure)) return column.slice(0, -measure.length);
  if (column.startsWith(measure)) return column.slice(measure.length);
  return column;
}

/** The fewest pairs a row needs to be written this way. */
export const MIN_ASK_PAIRS = 1;

/**
 * The pairs of a result when it is pair-shaped, or null. See the module
 * comment for the three conditions.
 */
export function pairedShape(rows: readonly AskRow[]): AskPairedShape | null {
  if (rows.length !== 1) return null;
  const row = rows[0];
  const found = comparedPairs(row);
  if (found.length === 0) return null;

  // Every pair compares the same two sides.
  const kinds = new Set(found.map((pair) => pair.kind));
  const others = new Set(
    found.map((pair) => qualifierOf(pair.other, pair.measure)),
  );
  const subjects = new Set(
    found.map((pair) => qualifierOf(pair.subject, pair.measure)),
  );
  if (kinds.size !== 1 || others.size !== 1 || subjects.size !== 1) return null;

  const inPair = new Set<string>();
  const pairs: AskPair[] = [];
  for (const pair of found) {
    inPair.add(pair.subject);
    inPair.add(pair.other);
    const a = row[pair.subject];
    const b = row[pair.other];
    if (!isNumber(a) || !isNumber(b)) continue;
    const subjectValue = printed(a);
    const otherValue = printed(b);
    const larger = Math.max(Math.abs(subjectValue), Math.abs(otherValue));
    pairs.push({
      measure: pair.measure,
      subject: pair.subject,
      other: pair.other,
      subjectValue,
      otherValue,
      percentage: /(?:^|_)(?:pct|percent|percentage)$/.test(pair.measure),
      gap: larger === 0 ? 0 : Math.abs(subjectValue - otherValue) / larger,
      label: pairLabel(pair.measure),
    });
  }
  if (pairs.length < MIN_ASK_PAIRS) return null;

  const unpaired = Object.keys(row)
    .filter(
      (column) =>
        column !== SCOPE_COUNT_COLUMN &&
        !inPair.has(column) &&
        !NOT_A_MEASURE.test(column) &&
        !column.startsWith(PAIRED_NAME_PREFIX) &&
        isNumber(row[column]),
    )
    .map((column) => {
      const known = askMeasure(column);
      return {
        column,
        label: known
          ? known.qualifier === ""
            ? known.label
            : `${known.label}, ${known.qualifier}`
          : pairLabel(column),
      };
    });
  // At least half of the row's measures are in a pair.
  if (pairs.length * 2 < unpaired.length) return null;

  // Stable: the row's own order breaks a tie.
  pairs.sort((x, y) => y.gap - x.gap);
  return {
    kind: found[0].kind,
    otherQualifier: [...others][0],
    pairs,
    unpaired,
  };
}

// ── Wording ──────────────────────────────────────────────────────────────────

/** Who the two sides are, from the question's scope and the matches the query covered. */
export interface AskPairedContext {
  /** True in a team scope: the subject is a player or the team, never "you". */
  team: boolean;
  /** How many matches the scope selected. */
  matchCount: number;
  /** The one opponent every match in scope was against, or null. */
  opponentName: string | null;
  /** Team scope: the one player every match in scope belongs to, or null. */
  playerName: string | null;
}

/** The columns the server adds to the row so a name is cited, never typed. */
export const PAIRED_NAME_PREFIX = "paired_";
const SUBJECT_NAME_COLUMN = `${PAIRED_NAME_PREFIX}subject_name`;
const OTHER_NAME_COLUMN = `${PAIRED_NAME_PREFIX}other_name`;

const S = ASK_VISUAL_FIELD_SEPARATOR;

/** At most this many pairs are stated in the headline. */
export const MAX_PAIRED_HEADLINE = 3;
/** At most this many more are spelt out in the body. */
const MAX_PAIRED_BODY = 6;
const MAX_UNPAIRED = 4;

/** How a baseline is named after "than": by what its prefix or suffix says. */
const BASELINE_PHRASE: readonly (readonly [RegExp, string, string])[] = [
  [/^(?:team_|_team)$/, "for the team", "Team"],
  [/^(?:season_|_season)$/, "over the season", "Season"],
  [/^(?:prev5_|_prev5)$/, "over the previous five matches", "Previous five"],
  [/^(?:last5_|recent5_|_last5)$/, "over the last five matches", "Last five"],
  [/^(?:prev_)$/, "in the previous matches", "Previous matches"],
  [/^(?:last_)$/, "in the last match", "Last match"],
  [/^(?:earlier_)$/, "in the earlier matches", "Earlier matches"],
  [/^(?:recent_)$/, "in the recent matches", "Recent matches"],
];

function baselineNames(qualifier: string): { phrase: string; heading: string } {
  const named = BASELINE_PHRASE.find(([pattern]) => pattern.test(qualifier));
  return named
    ? { phrase: named[1], heading: named[2] }
    : { phrase: "across all matches", heading: "All matches" };
}

interface Side {
  /** At the start of a sentence, and after a semicolon. */
  name: string;
  lower: string;
  /** The past tense of "to be" that agrees with it. */
  was: "was" | "were";
  /** Heads its table column. */
  heading: string;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joined(parts: readonly string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function cell(column: string): string {
  return `{{r1.${column}}}`;
}

function sides(
  shape: AskPairedShape,
  context: AskPairedContext,
): { subject: Side; other: Side } {
  const subject: Side = !context.team
    ? { name: "You", lower: "you", was: "were", heading: "You" }
    : context.playerName
      ? {
          name: cell(SUBJECT_NAME_COLUMN),
          lower: cell(SUBJECT_NAME_COLUMN),
          was: "was",
          heading: cell(SUBJECT_NAME_COLUMN),
        }
      : { name: "The team", lower: "the team", was: "was", heading: "Team" };
  if (shape.kind === "baseline") {
    const baseline = baselineNames(shape.otherQualifier);
    return {
      subject: {
        ...subject,
        heading:
          context.team && context.playerName
            ? cell(SUBJECT_NAME_COLUMN)
            : "Selected matches",
      },
      other: {
        name: baseline.phrase,
        lower: baseline.phrase,
        was: "was",
        heading: baseline.heading,
      },
    };
  }
  const one = context.matchCount === 1;
  const other: Side = context.opponentName
    ? {
        name: cell(OTHER_NAME_COLUMN),
        lower: cell(OTHER_NAME_COLUMN),
        was: "was",
        heading: cell(OTHER_NAME_COLUMN),
      }
    : context.team
      ? one
        ? {
            name: "The opponent",
            lower: "the opponent",
            was: "was",
            heading: "Opponent",
          }
        : {
            name: "Opponents",
            lower: "opponents",
            was: "were",
            heading: "Opponents",
          }
      : one
        ? {
            name: "Your opponent",
            lower: "your opponent",
            was: "was",
            heading: "Opponent",
          }
        : {
            name: "Your opponents",
            lower: "your opponents",
            was: "were",
            heading: "Opponents",
          };
  return { subject, other };
}

/** "Marek had more break points converted (13 to 6) and was higher on first serves in (65.8% to 60.2%); you had more winners (86 to 73)" */
function opponentClauses(
  pairs: readonly AskPair[],
  subject: Side,
  other: Side,
): string {
  const groups: { side: Side; clauses: string[] }[] = [];
  for (const pair of pairs) {
    const subjectLeads = pair.subjectValue > pair.otherValue;
    const side = subjectLeads ? subject : other;
    const figures = subjectLeads
      ? `(${cell(pair.subject)} to ${cell(pair.other)})`
      : `(${cell(pair.other)} to ${cell(pair.subject)})`;
    const clause = pair.percentage
      ? `${side.was} higher on ${lowerFirst(pair.label)} ${figures}`
      : `had more ${lowerFirst(pair.label)} ${figures}`;
    const group = groups.find((entry) => entry.side === side);
    if (group) group.clauses.push(clause);
    else groups.push({ side, clauses: [clause] });
  }
  return groups
    .map(
      (group, index) =>
        `${index === 0 ? group.side.name : group.side.lower} ${joined(group.clauses)}`,
    )
    .join("; ");
}

/** "First serves in was higher than across all matches (65.8% to 62.2%); there were more aces (8 to 5.2)" */
function baselineClauses(pairs: readonly AskPair[], other: Side): string {
  return pairs
    .map((pair, index) => {
      const subjectLeads = pair.subjectValue > pair.otherValue;
      const than = index === 0 ? ` than ${other.lower}` : "";
      const figures = `(${cell(pair.subject)} to ${cell(pair.other)})`;
      const clause = pair.percentage
        ? `${lowerFirst(pair.label)} was ${subjectLeads ? "higher" : "lower"}${than} ${figures}`
        : `there were ${subjectLeads ? "more" : "fewer"} ${lowerFirst(pair.label)}${than} ${figures}`;
      return clause;
    })
    .join("; ");
}

/** Table row labels: a percentage whose count is in the table too says it is the share. */
function rowLabels(pairs: readonly AskPair[]): string[] {
  const seen = new Map<string, number>();
  for (const pair of pairs) {
    seen.set(pair.label, (seen.get(pair.label) ?? 0) + 1);
  }
  return pairs.map((pair) =>
    (seen.get(pair.label) ?? 0) > 1 && pair.percentage
      ? `${pair.label}, share`
      : pair.label,
  );
}

export interface AskPairedAnswer {
  /** The answer in the renderer's syntax: headline, one table, the body. */
  text: string;
  /** The rows to render it against: the result's, with the name columns the text cites. */
  rows: AskRow[];
}

/**
 * The server-written answer for a pair-shaped result, or null when the
 * result is not one. Every number and every name from the data is a cell
 * reference; the text types no digit.
 */
export function buildPairedAnswer(
  rows: readonly AskRow[],
  context: AskPairedContext,
): AskPairedAnswer | null {
  const shape = pairedShape(rows);
  if (!shape) return null;
  const { subject, other } = sides(shape, context);
  const stated = shape.pairs.filter(
    (pair) => pair.subjectValue !== pair.otherValue,
  );
  const level = shape.pairs.filter(
    (pair) => pair.subjectValue === pair.otherValue,
  );
  const clauses = (pairs: readonly AskPair[]) =>
    shape.kind === "opponent"
      ? opponentClauses(pairs, subject, other)
      : baselineClauses(pairs, other);

  // ── Headline: the widest gaps, each with its direction and both figures ──
  const lead = stated.slice(0, MAX_PAIRED_HEADLINE);
  const headline =
    lead.length > 0
      ? `${upperFirst(clauses(lead))}.`
      : shape.kind === "opponent"
        ? `${subject.name} and ${other.lower} were level on every measure compared.`
        : `Every measure compared was level with ${other.lower}.`;

  // ── Table: subject | other, widest gap first, within the table's limits ──
  const tabled = shape.pairs.slice(0, MAX_ASK_TABLE_ROWS);
  const labels = rowLabels(tabled);
  const count = `{{r1.${SCOPE_COUNT_COLUMN}}} ${context.matchCount === 1 ? "match" : "matches"}`;
  const table = [
    `${ASK_VISUAL_LINE_PREFIX} table ${S} The measures compared, widest gap first, from ${count}.`,
    `COLUMNS: ${subject.heading} ${S} ${other.heading}`,
    ...tabled.map(
      (pair, index) =>
        `ROW: ${labels[index]} ${S} ${cell(pair.subject)} ${S} ${cell(pair.other)}`,
    ),
  ];

  // ── Body: the rest, what was level, what stands alone, how many matches ──
  const body: string[] = [];
  const rest = stated.slice(
    MAX_PAIRED_HEADLINE,
    MAX_PAIRED_HEADLINE + MAX_PAIRED_BODY,
  );
  if (rest.length > 0) body.push(`${upperFirst(clauses(rest))}.`);
  if (level.length > 0 && lead.length > 0) {
    body.push(
      `Level: ${joined(level.map((pair) => `${lowerFirst(pair.label)} (${cell(pair.subject)})`))}.`,
    );
  }
  for (const entry of shape.unpaired.slice(0, MAX_UNPAIRED)) {
    body.push(`${entry.label}: ${cell(entry.column)}.`);
  }
  body.push(context.matchCount === 1 ? "This is one match." : `From ${count}.`);

  return {
    text: `${headline}\n${table.join("\n")}\n\n${body.join(" ")}`,
    rows: [
      {
        ...rows[0],
        ...(context.team && context.playerName
          ? { [SUBJECT_NAME_COLUMN]: context.playerName }
          : {}),
        ...(context.opponentName
          ? { [OTHER_NAME_COLUMN]: context.opponentName }
          : {}),
      },
    ],
  };
}

/** The one name every entry shares, or null: a missing name, or two different ones, is no single name. */
export function onlyName(names: readonly (string | null)[]): string | null {
  const first = names[0];
  if (!first || first.trim() === "") return null;
  return names.every((name) => name === first) ? first : null;
}

// ── Two groups ───────────────────────────────────────────────────────────────

/** The fewest shared measures two rows need to be written this way. */
export const MIN_TWO_GROUP_MEASURES = 2;

const DATE_LIKE = /^\d{4}-\d{2}(?:-\d{2})?/;

/**
 * The same answer for the other shape a comparison takes: two rows, one per
 * group ("left" and "right", "Hard Court" and "Clay Court", two players),
 * with the same measures in both. Which group is higher on each measure is
 * worked out here, so no sentence can say it backwards; the groups are named
 * by cell reference, exactly as the query labelled them.
 *
 * Null unless the result is exactly two rows with one text label column
 * (not a date — two months are a trend, not two groups) and at least
 * {@link MIN_TWO_GROUP_MEASURES} measures with a figure in both rows.
 */
export function buildTwoGroupAnswer(
  rows: readonly AskRow[],
  context: { matchCount: number },
): AskPairedAnswer | null {
  if (rows.length !== 2) return null;
  const [first, second] = rows;
  const labelColumns = Object.keys(first).filter(
    (column) =>
      typeof first[column] === "string" &&
      typeof second[column] === "string" &&
      first[column] !== second[column],
  );
  if (labelColumns.length !== 1) return null;
  const label = labelColumns[0];
  if (
    DATE_LIKE.test(String(first[label])) ||
    DATE_LIKE.test(String(second[label]))
  ) {
    return null;
  }

  const ref = (row: 1 | 2, column: string) => `{{r${row}.${column}}}`;
  const counts: string[] = [];
  const measures: {
    column: string;
    name: string;
    percentage: boolean;
    leader: 1 | 2 | 0;
    gap: number;
  }[] = [];
  for (const column of Object.keys(first)) {
    if (column === SCOPE_COUNT_COLUMN) continue;
    const a = first[column];
    const b = second[column];
    if (!isNumber(a) || !isNumber(b)) continue;
    if (NOT_A_MEASURE.test(column)) {
      counts.push(column);
      continue;
    }
    const left = printed(a);
    const right = printed(b);
    const larger = Math.max(Math.abs(left), Math.abs(right));
    measures.push({
      column,
      name: pairLabel(column),
      percentage: /_(?:pct|percent|percentage)$/.test(column),
      leader: left === right ? 0 : left > right ? 1 : 2,
      gap: larger === 0 ? 0 : Math.abs(left - right) / larger,
    });
  }
  if (measures.length < MIN_TWO_GROUP_MEASURES) return null;
  measures.sort((x, y) => y.gap - x.gap);

  const clause = (entry: (typeof measures)[number]): string => {
    const hi = entry.leader === 1 ? 1 : 2;
    const lo = hi === 1 ? 2 : 1;
    const figures = `(${ref(hi, entry.column)} to ${ref(lo, entry.column)})`;
    return entry.percentage
      ? `${lowerFirst(entry.name)} was higher for ${ref(hi, label)} ${figures}`
      : `${lowerFirst(entry.name)} was greater for ${ref(hi, label)} ${figures}`;
  };
  const stated = measures.filter((entry) => entry.leader !== 0);
  const level = measures.filter((entry) => entry.leader === 0);
  const lead = stated.slice(0, MAX_PAIRED_HEADLINE);
  const headline =
    lead.length > 0
      ? `${upperFirst(lead.map(clause).join("; "))}.`
      : "The two groups were level on every measure compared.";

  const tabled = measures.slice(0, MAX_ASK_TABLE_ROWS);
  const count = `{{r1.${SCOPE_COUNT_COLUMN}}} ${context.matchCount === 1 ? "match" : "matches"}`;
  const table = [
    `${ASK_VISUAL_LINE_PREFIX} table ${S} The measures compared, widest gap first.`,
    `COLUMNS: ${ref(1, label)} ${S} ${ref(2, label)}`,
    ...tabled.map(
      (entry) =>
        `ROW: ${entry.name} ${S} ${ref(1, entry.column)} ${S} ${ref(2, entry.column)}`,
    ),
  ];

  const body: string[] = [];
  const rest = stated.slice(
    MAX_PAIRED_HEADLINE,
    MAX_PAIRED_HEADLINE + MAX_PAIRED_BODY,
  );
  if (rest.length > 0) body.push(`${upperFirst(rest.map(clause).join("; "))}.`);
  if (level.length > 0 && lead.length > 0) {
    body.push(
      `Level: ${joined(level.map((entry) => `${lowerFirst(entry.name)} (${ref(1, entry.column)})`))}.`,
    );
  }
  // Each group's own match count, when the query carried one.
  for (const column of counts.slice(0, 1)) {
    body.push(
      `Matches, ${ref(1, label)}: ${ref(1, column)}. Matches, ${ref(2, label)}: ${ref(2, column)}.`,
    );
  }
  body.push(`From ${count} in all.`);

  return {
    text: `${headline}\n${table.join("\n")}\n\n${body.join(" ")}`,
    rows: [...rows],
  };
}

// ── A list of matches ────────────────────────────────────────────────────────

/** The most matches a list is written out for; a longer one stays with the model. */
export const MAX_MATCH_LIST = 10;

/** The columns the server adds to row 1 so the tally is cited, never typed. */
const LIST_WON_COLUMN = `${PAIRED_NAME_PREFIX}list_won`;
const LIST_LOST_COLUMN = `${PAIRED_NAME_PREFIX}list_lost`;

/**
 * "How did my last five matches go?" comes back as one row per match: a
 * date, an opponent, a result, a score. Retelling such a list is where a
 * model pins one match's result on another, so the server writes it: the
 * tally, the win/loss strip, and one sentence per match with the result
 * read from that row's own `i_won`.
 *
 * Null unless every row is a match (played_on, opponent_name and i_won all
 * present), there are at most {@link MAX_MATCH_LIST}, and no row carries a
 * numeric measure — a per-match list of figures is a trend, not a retelling.
 */
export function buildMatchListAnswer(
  rows: readonly AskRow[],
  context: { team: boolean },
): AskPairedAnswer | null {
  if (rows.length === 0 || rows.length > MAX_MATCH_LIST) return null;
  for (const row of rows) {
    if (typeof row.played_on !== "string") return null;
    if (typeof row.opponent_name !== "string") return null;
    if (!("i_won" in row)) return null;
    if (row.i_won !== null && typeof row.i_won !== "boolean") return null;
    for (const [column, value] of Object.entries(row)) {
      if (column === SCOPE_COUNT_COLUMN || NOT_A_MEASURE.test(column)) continue;
      if (isNumber(value)) return null;
    }
  }
  // Oldest first, so the strip and the sentences run in the order played.
  const ordered = [...rows].sort((a, b) =>
    String(a.played_on).localeCompare(String(b.played_on)),
  );
  const won = ordered.filter((row) => row.i_won === true).length;
  const lost = ordered.filter((row) => row.i_won === false).length;

  const sentences = ordered.map((row, index) => {
    const n = index + 1;
    const named =
      context.team && typeof row.player_name === "string"
        ? `{{r${n}.player_name}} `
        : "";
    const verb =
      row.i_won === true
        ? `${named}won against`
        : row.i_won === false
          ? `${named}lost to`
          : `${named}played`;
    const score =
      typeof row.score_text === "string" && row.score_text.trim() !== ""
        ? `, {{r${n}.score_text}}`
        : "";
    const unknown = row.i_won === null ? " (result not recorded)" : "";
    return `{{r${n}.played_on}}: ${verb} {{r${n}.opponent_name}}${score}${unknown}.`;
  });

  const single = ordered.length === 1;
  const headline = single
    ? ordered[0].i_won === true
      ? "This match was won."
      : ordered[0].i_won === false
        ? "This match was lost."
        : "This match has no recorded result."
    : `Won {{r1.${LIST_WON_COLUMN}}}, lost {{r1.${LIST_LOST_COLUMN}}}.`;
  const strip =
    won + lost >= 2
      ? `\n${ASK_VISUAL_LINE_PREFIX} form ${S} These matches, oldest first.\nPLOT: i_won`
      : "";

  return {
    text: `${headline}${strip}\n\n${sentences.join(" ")}`,
    rows: ordered.map((row, index) =>
      index === 0
        ? { ...row, [LIST_WON_COLUMN]: won, [LIST_LOST_COLUMN]: lost }
        : { ...row },
    ),
  };
}
