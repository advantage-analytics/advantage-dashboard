import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import {
  MAX_ASK_TABLE_COLUMNS,
  MAX_ASK_TABLE_ROWS,
  MAX_ASK_TREND_POINTS,
} from "@/lib/services/ask/events";
import { comparedPairs, isNumber, printed } from "@/lib/services/ask/facts";
import { ASK_SCOPE_COUNT_COLUMN } from "@/lib/services/ask/prompts";
import { capitalize } from "@/lib/utils";
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

/** Columns that count matches or are a difference: never a measure of their own here. */
const NOT_A_MEASURE =
  /^(?:n|matches|played|match_count|matches_played|num_matches|n_matches|[a-z0-9_]+_matches|matches_[a-z0-9_]+|[a-z0-9_]+_match_count)$|_(?:diff|diff_pct|delta|change|gap)$/;

/** A count returned as a per-match mean says so in its column name (`compare.ts`). */
const PER_MATCH = /_per_match$/;
const PER_MATCH_NOTE = "Counts are per-match averages.";

/**
 * The smallest figure a count's gap is measured against. Gaps are ordered by
 * their share of the larger figure, and without a floor one ace against none
 * is the widest gap there can be and heads every answer.
 */
const MIN_COUNT_SCALE = 5;

/** The gap between two printed figures as a share of the larger: what the measures are ordered by. */
function relativeGap(a: number, b: number, percentage: boolean): number {
  const larger = Math.max(
    Math.abs(a),
    Math.abs(b),
    percentage ? 0 : MIN_COUNT_SCALE,
  );
  return larger === 0 ? 0 : Math.abs(a - b) / larger;
}

/** A measure's name: the dictionary's, or the column's own words for an alias it cannot place. */
export function pairLabel(measure: string): string {
  const known = askMeasure(measure);
  if (known) return known.label;
  // A count returned as a per-match mean keeps the measure's own name.
  if (PER_MATCH.test(measure)) {
    const base = askMeasure(measure.replace(PER_MATCH, ""));
    if (base) return `${base.label} per match`;
  }
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
    const percentage = /(?:^|_)(?:pct|percent|percentage)$/.test(pair.measure);
    pairs.push({
      measure: pair.measure,
      subject: pair.subject,
      other: pair.other,
      subjectValue,
      otherValue,
      percentage,
      gap: relativeGap(subjectValue, otherValue, percentage),
      label: pairLabel(pair.measure),
    });
  }
  if (pairs.length < MIN_ASK_PAIRS) return null;

  const unpaired = Object.keys(row)
    .filter(
      (column) =>
        column !== ASK_SCOPE_COUNT_COLUMN &&
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
  /**
   * Server-written sentences that go before the comparison: the first is the
   * answer's headline, the rest open the body, and the comparison's own
   * headline follows them. In the renderer's syntax, no typed digit.
   */
  lead?: readonly string[];
  /** Server-written sentences added to the body after the comparison. */
  notes?: readonly string[];
  /** Columns the lead cites, added to the row the answer is rendered against. */
  extraRow?: AskRow;
  /** How the matches in scope ended, when the body should say so: counted from the matches, never by a model. */
  record?: { won: number; lost: number };
}

/** The columns the server adds to the row so a name is cited, never typed. */
export const PAIRED_NAME_PREFIX = "paired_";
const RECORD_WON_COLUMN = `${PAIRED_NAME_PREFIX}won`;
const RECORD_LOST_COLUMN = `${PAIRED_NAME_PREFIX}lost`;
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
    // "For the team" names the other side only when the subject is one
    // player; a set of the team's own matches is set against all of them.
    const baseline =
      context.team &&
      !context.playerName &&
      /^(?:team_|_team)$/.test(shape.otherQualifier)
        ? { phrase: "across all the team's matches", heading: "All matches" }
        : baselineNames(shape.otherQualifier);
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
  // A baseline's clauses name no subject ("first serves in was lower than
  // for the team"); in a team scope the player they are about goes first.
  const whose =
    shape.kind === "baseline" && context.team && context.playerName
      ? `For ${subject.name}, `
      : "";
  const clauses = (pairs: readonly AskPair[]) =>
    shape.kind === "opponent"
      ? opponentClauses(pairs, subject, other)
      : `${whose}${whose === "" ? baselineClauses(pairs, other) : lowerFirst(baselineClauses(pairs, other))}`;

  // ── Headline: the widest gaps, each with its direction and both figures ──
  const lead = stated.slice(0, MAX_PAIRED_HEADLINE);
  const headline =
    lead.length > 0
      ? `${capitalize(clauses(lead))}.`
      : shape.kind === "opponent"
        ? `${subject.name} and ${other.lower} were level on every measure compared.`
        : `Every measure compared was level with ${other.lower}.`;

  // ── Table: subject | other, widest gap first, within the table's limits ──
  const tabled = shape.pairs.slice(0, MAX_ASK_TABLE_ROWS);
  const labels = rowLabels(tabled);
  const count = `{{r1.${ASK_SCOPE_COUNT_COLUMN}}} ${context.matchCount === 1 ? "match" : "matches"}`;
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
  if (rest.length > 0) body.push(`${capitalize(clauses(rest))}.`);
  if (level.length > 0 && lead.length > 0) {
    body.push(
      `Level: ${joined(level.map((pair) => `${lowerFirst(pair.label)} (${cell(pair.subject)})`))}.`,
    );
  }
  for (const entry of shape.unpaired.slice(0, MAX_UNPAIRED)) {
    body.push(`${entry.label}: ${cell(entry.column)}.`);
  }
  if (shape.pairs.some((pair) => PER_MATCH.test(pair.measure))) {
    body.push(PER_MATCH_NOTE);
  }
  body.push(...(context.notes ?? []));
  const record = context.record;
  if (record && record.won + record.lost > 0) {
    body.push(
      context.matchCount === 1
        ? `${subject.name} ${record.won === 1 ? "won" : "lost"} the match.`
        : `${subject.name} won ${cell(RECORD_WON_COLUMN)} and lost ${cell(RECORD_LOST_COLUMN)} of these matches.`,
    );
  }
  body.push(context.matchCount === 1 ? "This is one match." : `From ${count}.`);

  const opening = context.lead ?? [];
  const first = opening.length > 0 ? opening[0] : headline;
  const paragraphs =
    opening.length > 0 ? [...opening.slice(1), headline, ...body] : body;

  return {
    text: `${first}\n${table.join("\n")}\n\n${paragraphs.join(" ")}`,
    rows: [
      {
        ...rows[0],
        ...(context.extraRow ?? {}),
        ...(record
          ? {
              [RECORD_WON_COLUMN]: record.won,
              [RECORD_LOST_COLUMN]: record.lost,
            }
          : {}),
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
    if (column === ASK_SCOPE_COUNT_COLUMN) continue;
    const a = first[column];
    const b = second[column];
    if (!isNumber(a) || !isNumber(b)) continue;
    if (NOT_A_MEASURE.test(column)) {
      counts.push(column);
      continue;
    }
    const left = printed(a);
    const right = printed(b);
    const percentage = /_(?:pct|percent|percentage)$/.test(column);
    measures.push({
      column,
      name: pairLabel(column),
      percentage,
      leader: left === right ? 0 : left > right ? 1 : 2,
      gap: relativeGap(left, right, percentage),
    });
  }
  if (measures.length < MIN_TWO_GROUP_MEASURES) return null;
  measures.sort((x, y) => y.gap - x.gap);

  // Two people are the subject of their own sentences ("Reyes had more
  // aces"); two surfaces or two hands are not ("aces was greater for clay").
  const people = label === "player_name" || label === "opponent_name";
  const clause = (entry: (typeof measures)[number]): string => {
    const hi = entry.leader === 1 ? 1 : 2;
    const lo = hi === 1 ? 2 : 1;
    const figures = `(${ref(hi, entry.column)} to ${ref(lo, entry.column)})`;
    if (people) {
      return entry.percentage
        ? `${ref(hi, label)} was higher on ${lowerFirst(entry.name)} ${figures}`
        : `${ref(hi, label)} had more ${lowerFirst(entry.name)} ${figures}`;
    }
    return entry.percentage
      ? `${lowerFirst(entry.name)} was higher for ${ref(hi, label)} ${figures}`
      : `${lowerFirst(entry.name)} was greater for ${ref(hi, label)} ${figures}`;
  };
  const stated = measures.filter((entry) => entry.leader !== 0);
  const level = measures.filter((entry) => entry.leader === 0);
  const lead = stated.slice(0, MAX_PAIRED_HEADLINE);
  const headline =
    lead.length > 0
      ? `${capitalize(lead.map(clause).join("; "))}.`
      : "The two groups were level on every measure compared.";

  const tabled = measures.slice(0, MAX_ASK_TABLE_ROWS);
  const count = `{{r1.${ASK_SCOPE_COUNT_COLUMN}}} ${context.matchCount === 1 ? "match" : "matches"}`;
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
  if (rest.length > 0) body.push(`${capitalize(rest.map(clause).join("; "))}.`);
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

// ── Players side by side ─────────────────────────────────────────────────────

/** One measure of a players comparison, as `compare.ts` chose it. */
export interface AskPlayersMeasure {
  /** The column every row holds it under. */
  column: string;
  /** True for a `_pct` measure: highest / lowest. False for a count: most / fewest. */
  percentage: boolean;
}

export interface AskPlayersContext {
  /** How many matches the scope selected. */
  matchCount: number;
  /** The measures to show, in the order to show them. */
  measures: readonly AskPlayersMeasure[];
  /** True when the question named the measures: two players are then compared in that order. */
  explicit: boolean;
  /** Server-written sentences added to the body: what a vague word was read as. */
  notes?: readonly string[];
}

/** At most this many measures get a highest-and-lowest sentence. */
const MAX_PLAYERS_STATED = 4;

/**
 * The rows of the players the question names, when it names two or more of
 * them; otherwise every row. "Rudy versus Emon" over a scope that holds a
 * third player is about two people.
 */
export function namedPlayerRows(
  rows: readonly AskRow[],
  question: string,
): AskRow[] {
  const text = question.toLowerCase();
  const named = rows.filter((row) => {
    if (typeof row.player_name !== "string") return false;
    const words = row.player_name
      .toLowerCase()
      .split(/[^a-zÀ-ɏ]+/)
      .filter((word) => word.length >= 3);
    const ends = [words[0], words[words.length - 1]].filter(
      (word): word is string => word !== undefined,
    );
    return ends.some((word) =>
      new RegExp(`(?:^|[^a-z])${word}(?:[^a-z]|$)`).test(text),
    );
  });
  return named.length >= 2 ? named : [...rows];
}

/**
 * The server-written answer for a comparison of players: one row per
 * `player_name`, each with `group_matches` and the same measures.
 *
 * Two players are written the way a player and an opponent are — who was
 * higher on each measure, both figures beside the word — with one table
 * column each. Three or more get a table and a headline that names the
 * highest and the lowest for the FIRST measure, by that measure's name, so a
 * question such as "who is our most consistent player" is answered with what
 * was measured and never with an opinion.
 *
 * Null unless at least two rows name a player and share a measure with a
 * figure in two of them.
 */
export function buildPlayersAnswer(
  rows: readonly AskRow[],
  context: AskPlayersContext,
): AskPairedAnswer | null {
  const measures = context.measures.filter(
    (measure) =>
      rows.filter((row) => isNumber(row[measure.column])).length >= 2,
  );
  if (measures.length === 0) return null;
  const players = rows
    .filter(
      (row) =>
        typeof row.player_name === "string" &&
        measures.some((measure) => isNumber(row[measure.column])),
    )
    .slice(0, MAX_ASK_TABLE_ROWS);
  if (players.length < 2) return null;

  const count = `{{r1.${ASK_SCOPE_COUNT_COLUMN}}} ${context.matchCount === 1 ? "match" : "matches"}`;
  const perMatch = measures.some((measure) => PER_MATCH.test(measure.column));
  const tail = (ordered: readonly AskRow[]): string[] => [
    ...(ordered.every((row) => isNumber(row.group_matches))
      ? [
          `Matches with statistics: ${joined(ordered.map((_, index) => `{{r${index + 1}.player_name}} {{r${index + 1}.group_matches}}`))}.`,
        ]
      : []),
    ...(perMatch ? [PER_MATCH_NOTE] : []),
    ...(context.notes ?? []),
    `From ${count} in all.`,
  ];
  const ref = (row: number, column: string) => `{{r${row}.${column}}}`;

  // ── Two players: who was higher on each measure ──
  if (players.length === 2) {
    const entries = measures.flatMap((measure) => {
      const a = players[0][measure.column];
      const b = players[1][measure.column];
      if (!isNumber(a) || !isNumber(b)) return [];
      const left = printed(a);
      const right = printed(b);
      return [
        {
          measure,
          name: pairLabel(measure.column),
          leader: left === right ? 0 : left > right ? 1 : 2,
          gap: relativeGap(left, right, measure.percentage),
        },
      ];
    });
    if (entries.length === 0) return null;
    if (!context.explicit) entries.sort((x, y) => y.gap - x.gap);
    const stated = entries.filter((entry) => entry.leader !== 0);
    const level = entries.filter((entry) => entry.leader === 0);
    const clauses = (list: typeof entries): string => {
      const groups: { leader: number; clauses: string[] }[] = [];
      for (const entry of list) {
        const hi = entry.leader;
        const lo = hi === 1 ? 2 : 1;
        const figures = `(${ref(hi, entry.measure.column)} to ${ref(lo, entry.measure.column)})`;
        const clause = entry.measure.percentage
          ? `was higher on ${lowerFirst(entry.name)} ${figures}`
          : `had more ${lowerFirst(entry.name)} ${figures}`;
        const group = groups.find((item) => item.leader === hi);
        if (group) group.clauses.push(clause);
        else groups.push({ leader: hi, clauses: [clause] });
      }
      return groups
        .map(
          (group) =>
            `${ref(group.leader, "player_name")} ${joined(group.clauses)}`,
        )
        .join("; ");
    };
    const lead = stated.slice(0, MAX_PAIRED_HEADLINE);
    const headline =
      lead.length > 0
        ? `${clauses(lead)}.`
        : "The two players were level on every measure compared.";
    const table = [
      `${ASK_VISUAL_LINE_PREFIX} table ${S} The measures compared${context.explicit ? "" : ", widest gap first"}.`,
      `COLUMNS: ${ref(1, "player_name")} ${S} ${ref(2, "player_name")}`,
      ...entries
        .slice(0, MAX_ASK_TABLE_ROWS)
        .map(
          (entry) =>
            `ROW: ${entry.name} ${S} ${ref(1, entry.measure.column)} ${S} ${ref(2, entry.measure.column)}`,
        ),
    ];
    const body: string[] = [];
    const rest = stated.slice(
      MAX_PAIRED_HEADLINE,
      MAX_PAIRED_HEADLINE + MAX_PAIRED_BODY,
    );
    if (rest.length > 0) body.push(`${clauses(rest)}.`);
    if (level.length > 0 && lead.length > 0) {
      body.push(
        `Level: ${joined(level.map((entry) => `${lowerFirst(entry.name)} (${ref(1, entry.measure.column)})`))}.`,
      );
    }
    body.push(...tail(players));
    return {
      text: `${headline}\n${table.join("\n")}\n\n${body.join(" ")}`,
      rows: players.map((row) => ({ ...row })),
    };
  }

  // ── Three or more: the highest and the lowest of each measure, by name ──
  const lead = measures[0];
  const ordered = [...players].sort((a, b) => {
    const x = a[lead.column];
    const y = b[lead.column];
    if (!isNumber(x)) return isNumber(y) ? 1 : 0;
    if (!isNumber(y)) return -1;
    return y - x;
  });
  const extremes = (measure: AskPlayersMeasure): string | null => {
    const held = ordered
      .map((row, index) => ({ n: index + 1, value: row[measure.column] }))
      .filter((entry): entry is { n: number; value: number } =>
        isNumber(entry.value),
      );
    if (held.length < 2) return null;
    const high = held.reduce((best, entry) =>
      printed(entry.value) > printed(best.value) ? entry : best,
    );
    const low = held.reduce((best, entry) =>
      printed(entry.value) < printed(best.value) ? entry : best,
    );
    const name = pairLabel(measure.column);
    if (printed(high.value) === printed(low.value)) {
      return `${name}: the same for every player compared (${ref(high.n, measure.column)}).`;
    }
    return measure.percentage
      ? `${name}: ${ref(high.n, "player_name")} was highest (${ref(high.n, measure.column)}) and ${ref(low.n, "player_name")} lowest (${ref(low.n, measure.column)}).`
      : `${name}: ${ref(high.n, "player_name")} had the most (${ref(high.n, measure.column)}) and ${ref(low.n, "player_name")} the fewest (${ref(low.n, measure.column)}).`;
  };
  const headline = extremes(lead);
  if (headline === null) return null;

  const byPlayer = ordered.length <= MAX_ASK_TABLE_COLUMNS;
  const tabled = byPlayer
    ? measures.slice(0, MAX_ASK_TABLE_ROWS)
    : measures.slice(0, MAX_ASK_TABLE_COLUMNS);
  const table = byPlayer
    ? [
        `${ASK_VISUAL_LINE_PREFIX} table ${S} The measures compared, one column for each player.`,
        `COLUMNS: ${ordered.map((_, index) => ref(index + 1, "player_name")).join(` ${S} `)}`,
        ...tabled.map(
          (measure) =>
            `ROW: ${pairLabel(measure.column)} ${S} ${ordered.map((_, index) => ref(index + 1, measure.column)).join(` ${S} `)}`,
        ),
      ]
    : [
        `${ASK_VISUAL_LINE_PREFIX} table ${S} One row for each player, ordered by ${lowerFirst(pairLabel(lead.column))}.`,
        `COLUMNS: ${tabled.map((measure) => pairLabel(measure.column)).join(` ${S} `)}`,
        ...ordered.map(
          (_, index) =>
            `ROW: ${ref(index + 1, "player_name")} ${S} ${tabled.map((measure) => ref(index + 1, measure.column)).join(` ${S} `)}`,
        ),
      ];
  const body = [
    ...measures
      .slice(1, MAX_PLAYERS_STATED)
      .flatMap((measure) => extremes(measure) ?? []),
    ...tail(ordered),
  ];
  return {
    text: `${headline}\n${table.join("\n")}\n\n${body.join(" ")}`,
    rows: ordered.map((row) => ({ ...row })),
  };
}

// ── A matchup that was never played ──────────────────────────────────────────

/** One match as the lead retells it; structurally an `AskSourceMatch`. */
export interface AskLeadMatch {
  playedOn: string | null;
  opponentName: string | null;
  playerName: string | null;
  iWon: boolean | null;
  scoreText: string | null;
}

/** At most this many of the program's matches are retold before the comparison. */
export const MAX_LEAD_MATCHES = 3;

const ABSENT_NAME_COLUMN = `${PAIRED_NAME_PREFIX}absent_name`;

/**
 * "How should Rudy play against Eli?" when Rudy has never played him: the
 * sentences that say so and retell what IS recorded — the program's matches
 * against that opponent, who played and how each ended — with the columns
 * they cite. The comparison over those matches follows (`buildPairedAnswer`
 * with this as its `lead`). Every name, date and score is a cell reference.
 */
export function absentMatchupLead(
  matches: readonly AskLeadMatch[],
  absentPlayer: string | null,
): { lead: string[]; extraRow: AskRow } {
  const opponent = onlyName(matches.map((match) => match.opponentName));
  const other = opponent ? cell(OTHER_NAME_COLUMN) : "that opponent";
  const extraRow: AskRow = absentPlayer
    ? { [ABSENT_NAME_COLUMN]: absentPlayer }
    : {};
  const who = absentPlayer ? cell(ABSENT_NAME_COLUMN) : "That player";
  const retold = matches.slice(0, MAX_LEAD_MATCHES).map((match, index) => {
    const key = `${PAIRED_NAME_PREFIX}m${index + 1}`;
    extraRow[`${key}_played_on`] = match.playedOn;
    extraRow[`${key}_player_name`] = match.playerName;
    extraRow[`${key}_opponent_name`] = match.opponentName;
    extraRow[`${key}_score_text`] = match.scoreText;
    const player = match.playerName
      ? cell(`${key}_player_name`)
      : "the program's player";
    const verb =
      match.iWon === true
        ? "won against"
        : match.iWon === false
          ? "lost to"
          : "played";
    const against = match.opponentName
      ? cell(`${key}_opponent_name`)
      : "an unnamed opponent";
    const score =
      match.scoreText && match.scoreText.trim() !== ""
        ? `, ${cell(`${key}_score_text`)}`
        : "";
    const date = match.playedOn ? `${cell(`${key}_played_on`)}: ` : "";
    return `${date}${player} ${verb} ${against}${score}.`;
  });
  const one = matches.length === 1;
  const many = matches.length > MAX_LEAD_MATCHES;
  return {
    lead: [
      `${who} has no recorded match against ${other}.`,
      `${one ? `The program's one match against ${other}` : `The program has {{r1.${ASK_SCOPE_COUNT_COLUMN}}} matches against ${other}${many ? "; the most recent" : ""}`}: ${capitalize(retold.join(" "))}`,
    ],
    extraRow,
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
      if (column === ASK_SCOPE_COUNT_COLUMN || NOT_A_MEASURE.test(column))
        continue;
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

// ── A measure over time ──────────────────────────────────────────────────────

/** The fewest dated rows a trend is written for. */
export const MIN_TREND_ROWS = 3;

/**
 * "How has my first serve changed this season?" comes back as one row per
 * match or month with one measure. Which row is the start, the end, the low
 * and the high is the thing a model gets wrong — "ended at its lowest
 * point" over a series that ended at its highest — so the server writes it,
 * citing each of the four from the row it is in.
 *
 * Null unless every row has the same date-like text column and the result
 * carries exactly one measure, with a figure in at least
 * {@link MIN_TREND_ROWS} rows.
 */
export function buildTrendAnswer(
  rows: readonly AskRow[],
  context: { matchCount: number },
): AskPairedAnswer | null {
  if (rows.length < MIN_TREND_ROWS) return null;
  const keys = Object.keys(rows[0]);
  const dates = keys.filter((column) =>
    rows.every(
      (row) =>
        typeof row[column] === "string" && DATE_LIKE.test(String(row[column])),
    ),
  );
  const date = dates.includes("played_on") ? "played_on" : dates[0];
  if (date === undefined) return null;
  const measures = keys.filter(
    (column) =>
      column !== ASK_SCOPE_COUNT_COLUMN &&
      !NOT_A_MEASURE.test(column) &&
      rows.some((row) => isNumber(row[column])) &&
      rows.every((row) => row[column] === null || isNumber(row[column])),
  );
  if (measures.length !== 1) return null;
  const measure = measures[0];

  const ordered = [...rows].sort((a, b) =>
    String(a[date]).localeCompare(String(b[date])),
  );
  const points = ordered
    .map((row, index) => ({ n: index + 1, value: row[measure] }))
    .filter((point): point is { n: number; value: number } =>
      isNumber(point.value),
    );
  if (points.length < MIN_TREND_ROWS) return null;

  const first = points[0];
  const last = points[points.length - 1];
  // The earliest row holding the extreme: a tie is cited once, at its first.
  const low = points.reduce((best, point) =>
    printed(point.value) < printed(best.value) ? point : best,
  );
  const high = points.reduce((best, point) =>
    printed(point.value) > printed(best.value) ? point : best,
  );
  const at = (point: { n: number }) =>
    `{{r${point.n}.${measure}}} on {{r${point.n}.${date}}}`;
  const name = pairLabel(measure);
  const start = printed(first.value);
  const end = printed(last.value);
  const headline =
    end > start
      ? `${name} rose from ${at(first)} to ${at(last)}.`
      : end < start
        ? `${name} fell from ${at(first)} to ${at(last)}.`
        : `${name} was the same at the start and at the end: ${at(first)} and ${at(last)}.`;
  const chart =
    points.length <= MAX_ASK_TREND_POINTS
      ? `\n${ASK_VISUAL_LINE_PREFIX} trend ${S} ${name} over time, oldest first.\nPLOT: ${date} ${S} ${measure}`
      : "";
  const count = `{{r1.${ASK_SCOPE_COUNT_COLUMN}}} ${context.matchCount === 1 ? "match" : "matches"}`;
  const body = [
    `Lowest: ${at(low)}.`,
    `Highest: ${at(high)}.`,
    `From ${count}.`,
  ];

  return {
    text: `${headline}${chart}\n\n${body.join(" ")}`,
    rows: ordered.map((row) => ({ ...row })),
  };
}
