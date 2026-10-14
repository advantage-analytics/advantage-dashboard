import type { AskRow } from "@/lib/services/ask/answer-render";
import { askMeasure } from "@/lib/services/ask/measures";

/**
 * What a query's result shows, stated by the server before the answer model
 * reads it.
 *
 * The answer model is a small fast one. Given two cells it cites both
 * correctly and then, some of the time, writes the wrong word between them:
 * "exceeds the team rate" above 64.1% against 65.5%, "has played ten matches"
 * for a player who played one, "higher in tournaments than in duals" with one
 * of the two figures missing. The numbers were right and the sentence was
 * not. So the comparisons a result supports are worked out here, in code, and
 * handed to the model as ground truth (`renderAskFactsBlock()`), with one
 * rule in the answer prompts: a comparative word may only be used where a
 * statement gives that direction.
 *
 * Four kinds of statement, each from the rows alone:
 *
 *   1. PAIRS — two columns of one row that hold the same measure for two
 *      subjects, recognised by name (`ASK_COMPARED_PREFIXES`,
 *      `ASK_COMPARED_SUFFIXES`): which is higher, that they are equal, or
 *      that one has no figure and nothing can be compared.
 *   2. EXTREMES — across 2–20 rows that carry a label (a player, a surface,
 *      an opponent): which row is highest and lowest for each number, ties
 *      included.
 *   3. ORDER — across rows that carry a date: the earliest and latest value,
 *      whether it rose or fell between them, and the lowest and highest.
 *   4. COUNTS — a per-row match count column, row by row; and that the scope
 *      total is the total for every row together, never one row's.
 *
 * Values are compared as the page prints them — rounded to one decimal — so
 * a statement can never say "higher" above two figures that read the same.
 *
 * Also here, because it reads the same pairs: `equalBaselineColumns()`, the
 * check behind the orchestration's "the baseline equals the thing it is
 * compared to" retry.
 *
 * Pure: no database, no network, no Next.js. Nothing is logged; labels are
 * the result's own text and never leave the prompt.
 */

/** The column the server adds to every row; never a measure. Kept here so this module stays a leaf. */
const SCOPE_COUNT_COLUMN = "matches_in_scope";

/**
 * Prefixes that mark a column as the same measure for another subject:
 * `me_x` / `opp_x`, or `x` against `all_x`, `team_x`, `prev5_x`. The plan
 * prompts state this convention to the planner. Longest first, so
 * `all_matches_` is read before `all_`.
 */
export const ASK_COMPARED_PREFIXES = [
  "all_matches_",
  "baseline_",
  "overall_",
  "earlier_",
  "recent5_",
  "recent_",
  "season_",
  "career_",
  "prev5_",
  "last5_",
  "team_",
  "prev_",
  "last_",
  "all_",
  "avg_",
  "opp_",
  "me_",
] as const;

/** The same convention written after the measure: `x_all`, `x_team`. */
export const ASK_COMPARED_SUFFIXES = [
  "_all_matches",
  "_baseline",
  "_overall",
  "_season",
  "_prev5",
  "_last5",
  "_team",
  "_all",
  "_avg",
] as const;

/** Which member of a group the others are compared with: the earliest of these present. */
const SUBJECT_ORDER = ["", "me_", "last_", "recent5_", "recent_", "last5_"];

/** A qualifier that names the other side of the net, not a baseline. */
const OPPONENT_QUALIFIER = "opp_";

/** Columns that are already a difference: never one side of a pair. */
const DIFFERENCE_COLUMN = /_(?:diff|diff_pct|delta|change|gap)$/;

/** Columns whose number is a position in time or in a match, not a measure. */
const ORDINAL_COLUMN =
  /^(?:year|month|week|quarter|day|set_number|game_number|point_number|shot_number|rn|rank|ord|position)$/;

/** A per-row count of matches, by name. `matches_in_scope` is handled apart. */
const MATCH_COUNT_COLUMN =
  /^(?:n|matches|played|match_count|matches_played|num_matches|n_matches|[a-z0-9_]+_matches|matches_[a-z0-9_]+|[a-z0-9_]+_match_count)$/;

/** A match count over everything, not over one row: `all_matches`, `team_matches`. */
const TOTAL_COUNT_COLUMN = /^(?:all|total|overall|team|program|career)_/;

/** Label columns, in the order they are preferred when a row has several. */
const LABEL_COLUMNS = [
  "player_name",
  "opponent_name",
  "court_type",
  "surface",
  "tournament",
  "round",
  "match_type",
  "opponent_hand",
  "opponent_backhand",
  "result_type",
  "shot_type",
  "spin_type",
  "zone",
  "label",
  "name",
  "group_name",
  "category",
  "bucket",
  "period",
];

const ISO_DATE = /^\d{4}-\d{2}(?:-\d{2})?(?:$|[T ])/;

/** At most this many statements reach the prompt; pairs and extremes are kept first. */
export const MAX_ASK_FACT_STATEMENTS = 18;
const MAX_PAIR_STATEMENTS = 12;
const MAX_ORDER_STATEMENTS = 7;
const MAX_EXTREME_STATEMENTS = 6;
const MAX_NULL_STATEMENTS = 3;
const MAX_LABELLED_ROWS = 20;
const MAX_COUNT_ROWS = 12;
const MAX_LABEL_LENGTH = 40;

// ── Reading a row ────────────────────────────────────────────────────────────

/** A value as the page prints it: one decimal at most. */
export function printed(value: number): number {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return value < 0 && rounded > 0 ? -rounded : rounded;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined;
}

function show(value: number): string {
  return String(printed(value));
}

/** One line of result text, safe to print inside the prompt. */
function quote(value: unknown): string {
  const text = String(value).replace(/\s+/g, " ").trim();
  return JSON.stringify(
    text.length > MAX_LABEL_LENGTH
      ? `${text.slice(0, MAX_LABEL_LENGTH)}…`
      : text,
  );
}

function ref(rowIndex: number, column: string): string {
  return `r${rowIndex + 1}.${column}`;
}

interface Qualified {
  measure: string;
  qualifier: string;
}

/** `team_first_serve_pct` → the measure `first_serve_pct` under `team_`; null for a bare name. */
function qualified(column: string): Qualified | null {
  for (const prefix of ASK_COMPARED_PREFIXES) {
    if (column.startsWith(prefix) && column.length > prefix.length) {
      return { measure: column.slice(prefix.length), qualifier: prefix };
    }
  }
  for (const suffix of ASK_COMPARED_SUFFIXES) {
    if (column.endsWith(suffix) && column.length > suffix.length) {
      return {
        measure: column.slice(0, column.length - suffix.length),
        qualifier: suffix,
      };
    }
  }
  return null;
}

/** Two columns of one row that hold the same measure for two subjects. */
export interface AskComparedPair {
  /** The measure both columns hold, as the bare column name. */
  measure: string;
  /** The column the other is compared with: the bare one, `me_`, or the most recent. */
  subject: string;
  other: string;
  /** `opponent` for `opp_`; `baseline` for every other qualifier. */
  kind: "opponent" | "baseline";
}

function comparable(column: string): boolean {
  return column !== SCOPE_COUNT_COLUMN && !DIFFERENCE_COLUMN.test(column);
}

/**
 * The pairs a row's column NAMES describe, whatever the cells hold. A group
 * is every column that reads as one measure under different qualifiers; its
 * subject is the bare column when there is one, else `me_`, else the most
 * recent window, and each other member is paired with it.
 */
export function comparedPairs(row: AskRow): AskComparedPair[] {
  const columns = Object.keys(row).filter(comparable);
  const groups = new Map<string, { column: string; qualifier: string }[]>();
  const add = (measure: string, column: string, qualifier: string) => {
    const members = groups.get(measure) ?? [];
    members.push({ column, qualifier });
    groups.set(measure, members);
  };
  for (const column of columns) {
    add(column, column, "");
    const read = qualified(column);
    if (read) add(read.measure, column, read.qualifier);
  }

  const pairs: AskComparedPair[] = [];
  const seen = new Set<string>();
  for (const [measure, members] of groups) {
    if (members.length < 2) continue;
    const subject =
      SUBJECT_ORDER.map((qualifier) =>
        members.find((member) => member.qualifier === qualifier),
      ).find((member) => member !== undefined) ?? members[0];
    for (const member of members) {
      if (member.column === subject.column) continue;
      const key = [subject.column, member.column].sort().join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        measure,
        subject: subject.column,
        other: member.column,
        kind: member.qualifier === OPPONENT_QUALIFIER ? "opponent" : "baseline",
      });
    }
  }
  return pairs;
}

// ── The identical-baseline check ─────────────────────────────────────────────

/**
 * The baseline columns of a result whose every baseline equals the figure it
 * is compared with — the mark of a baseline that was computed over the scope
 * instead of over all matches ("August against all matches" drawn as two
 * identical bars). Null unless at least two pairs hold numbers and every one
 * of them is exactly equal; one equal pair is a coincidence, two or more are
 * the same sum twice. Over a scope of every match a baseline is the figure
 * again by definition, so the caller passes `minPairs` 1 there.
 */
export function equalBaselineColumns(
  rows: readonly AskRow[],
  minPairs = 2,
): string[] | null {
  const columns = new Set<string>();
  let pairs = 0;
  for (const row of rows) {
    for (const pair of comparedPairs(row)) {
      if (pair.kind !== "baseline") continue;
      const subject = row[pair.subject];
      const other = row[pair.other];
      if (!isNumber(subject) || !isNumber(other)) continue;
      if (subject !== other) return null;
      pairs += 1;
      columns.add(pair.other);
    }
  }
  return pairs >= minPairs ? [...columns] : null;
}

/** The rows without the named columns. */
export function withoutColumns(
  rows: readonly AskRow[],
  columns: readonly string[],
): AskRow[] {
  const drop = new Set(columns);
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).filter(([name]) => !drop.has(name))),
  );
}

/**
 * Whether `scope_sql` selects fewer than every match: it filters, limits or
 * joins. A scope of all matches has nothing narrower to compare a baseline
 * with, so equal baselines there are simply true.
 */
export function scopeIsNarrowed(scopeSql: string): boolean {
  return /\b(?:where|limit|join|having|intersect|except|offset)\b/i.test(
    scopeSql,
  );
}

// ── Statements ───────────────────────────────────────────────────────────────

function pairStatements(rows: readonly AskRow[]): string[] {
  const statements: string[] = [];
  rows.forEach((row, index) => {
    for (const pair of comparedPairs(row)) {
      const a = row[pair.subject];
      const b = row[pair.other];
      const left = ref(index, pair.subject);
      const right = ref(index, pair.other);
      if (isNumber(a) && isNumber(b)) {
        const x = printed(a);
        const y = printed(b);
        if (x === y) {
          statements.push(`${left} (${x}) is EQUAL to ${right} (${y}).`);
        } else {
          statements.push(
            `${left} (${x}) is ${x > y ? "HIGHER" : "LOWER"} than ${right} (${y}), a gap of ${show(Math.abs(x - y))}.`,
          );
        }
      } else if (isNumber(a) && isMissing(b)) {
        statements.push(
          `There is no figure for ${right}, so ${left} (${show(a)}) cannot be compared with it.`,
        );
      } else if (isMissing(a) && isNumber(b)) {
        statements.push(
          `There is no figure for ${left}, so ${right} (${show(b)}) cannot be compared with it.`,
        );
      } else if (isMissing(a) && isMissing(b)) {
        statements.push(
          `There is no figure for ${left} or ${right}, so no comparison can be made.`,
        );
      }
    }
  });
  return statements;
}

/** The column that names what each row is about, or null. */
export function rowLabelColumn(rows: readonly AskRow[]): string | null {
  return labelColumn(rows);
}

function labelColumn(rows: readonly AskRow[]): string | null {
  const first = rows[0];
  if (!first) return null;
  const isLabel = (column: string) =>
    rows.every((row) => {
      const value = row[column];
      return isMissing(value) || typeof value === "string";
    }) &&
    rows.some((row) => {
      const value = row[column];
      return typeof value === "string" && !ISO_DATE.test(value);
    });
  for (const column of LABEL_COLUMNS) {
    if (column in first && isLabel(column)) return column;
  }
  return Object.keys(first).find(isLabel) ?? null;
}

/** A label word shorter than this identifies nothing ("vs", "de"). */
const MIN_LABEL_TOKEN_LENGTH = 3;

/**
 * The words that identify exactly ONE row of a labelled result: each
 * whole-word token of a row's label value that no other row's label holds,
 * lowercased, mapped to that row's index. "left" → the left-handers row,
 * "nguyen" → his; "court" in "Hard Court" and "Clay Court" identifies
 * neither and is left out. Empty for a result of one row, of more than
 * twenty, or with no label column.
 *
 * `answer-render.ts` uses it to catch a figure or table row whose label names
 * one row while every cell it cites comes from another.
 */
export function uniqueRowLabelTokens(
  rows: readonly AskRow[],
): Map<string, number> {
  const unique = new Map<string, number>();
  if (rows.length < 2 || rows.length > MAX_LABELLED_ROWS) return unique;
  const label = labelColumn(rows);
  if (label === null) return unique;
  const shared = new Set<string>();
  rows.forEach((row, index) => {
    const value = row[label];
    if (typeof value !== "string") return;
    const tokens = new Set(
      value
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= MIN_LABEL_TOKEN_LENGTH),
    );
    for (const token of tokens) {
      if (shared.has(token)) continue;
      if (unique.has(token)) {
        unique.delete(token);
        shared.add(token);
      } else {
        unique.set(token, index);
      }
    }
  });
  return unique;
}

/** The column holding each row's own match count (`group_matches`, `player_matches`), or null. */
export function perRowCountColumn(rows: readonly AskRow[]): string | null {
  const first = rows[0];
  if (!first || rows.length < 2) return null;
  return (
    Object.keys(first).find(
      (column) =>
        column !== SCOPE_COUNT_COLUMN &&
        MATCH_COUNT_COLUMN.test(column) &&
        !TOTAL_COUNT_COLUMN.test(column) &&
        rows.every((row) => isNumber(row[column])),
    ) ?? null
  );
}

/** The column that dates each row, or null: every value an ISO date or month, at least two of them. */
function dateColumn(rows: readonly AskRow[]): string | null {
  const first = rows[0];
  if (!first || rows.length < 2) return null;
  return (
    Object.keys(first).find((column) =>
      rows.every((row) => {
        const value = row[column];
        return typeof value === "string" && ISO_DATE.test(value);
      }),
    ) ?? null
  );
}

/** The columns that hold a measure in at least one row. */
function measureColumns(rows: readonly AskRow[]): string[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).filter(
    (column) =>
      column !== SCOPE_COUNT_COLUMN &&
      !ORDINAL_COLUMN.test(column) &&
      rows.every((row) => column in row) &&
      rows.some((row) => isNumber(row[column])) &&
      rows.every((row) => isNumber(row[column]) || isMissing(row[column])),
  );
}

function rowName(row: AskRow, index: number, label: string | null): string {
  const value = label === null ? null : row[label];
  return isMissing(value) || value === ""
    ? `r${index + 1}`
    : `r${index + 1} ${quote(value)}`;
}

function listed(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function extremeStatements(
  rows: readonly AskRow[],
  label: string | null,
  columns: readonly string[],
): string[] {
  const statements: string[] = [];
  for (const column of columns) {
    const held = rows.flatMap((row, index) => {
      const value = row[column];
      return isNumber(value) ? [{ index, value: printed(value) }] : [];
    });
    if (held.length < 2) continue;
    const missing = rows.flatMap((row, index) =>
      isMissing(row[column]) ? [rowName(row, index, label)] : [],
    );
    const tail =
      missing.length > 0 ? ` There is no figure for ${listed(missing)}.` : "";
    const high = Math.max(...held.map((cell) => cell.value));
    const low = Math.min(...held.map((cell) => cell.value));
    if (high === low) {
      statements.push(
        `${column} is EQUAL in every row that has it (${high}).${tail}`,
      );
      continue;
    }
    const names = (value: number) =>
      held
        .filter((cell) => cell.value === value)
        .map((cell) => rowName(rows[cell.index], cell.index, label));
    const side = (word: string, value: number) => {
      const at = names(value);
      return at.length === 1
        ? `${word} is ${at[0]} (${value})`
        : `there is NO single ${word.toLowerCase()}, ${listed(at)} are TIED at ${value}`;
    };
    statements.push(
      `${column}: ${side("HIGHEST", high)}; ${side("LOWEST", low)}.${tail}`,
    );
  }
  return statements;
}

interface OrderCell {
  index: number;
  value: number;
  raw: number;
  when: string;
}

interface OrderSummary {
  column: string;
  first: OrderCell;
  last: OrderCell;
  low: OrderCell;
  high: OrderCell;
}

/** Each measure's first, last, lowest and highest cell by date; a measure with fewer than two values has none. */
function orderSummaries(
  rows: readonly AskRow[],
  date: string,
  columns: readonly string[],
): OrderSummary[] {
  const ordered = rows
    .map((row, index) => ({ row, index, when: String(row[date]) }))
    .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  return columns.flatMap((column): OrderSummary[] => {
    const held = ordered.flatMap((entry): OrderCell[] => {
      const raw = entry.row[column];
      return isNumber(raw)
        ? [{ index: entry.index, value: printed(raw), raw, when: entry.when }]
        : [];
    });
    if (held.length < 2) return [];
    return [
      {
        column,
        first: held[0],
        last: held[held.length - 1],
        low: held.reduce((a, b) => (b.value < a.value ? b : a)),
        high: held.reduce((a, b) => (b.value > a.value ? b : a)),
      },
    ];
  });
}

/** The four cells of a date-ordered measure the server copies onto the first row, by prefix. */
export const ASK_ORDER_SUMMARY_PREFIXES = {
  first: "start_",
  last: "end_",
  low: "low_",
  high: "high_",
} as const;

/** At most this many measures of a date-ordered result get summary columns. */
export const MAX_ASK_ORDER_SUMMARY_MEASURES = 3;

/**
 * A result in date order, with each measure's first, last, lowest and
 * highest value — and the date of each — copied onto the FIRST row as
 * `start_<measure>`, `end_<measure>`, `low_<measure>`, `high_<measure>` and
 * the same names with `_date`.
 *
 * Why: over a result of one row per match the answer model cites `r1` for
 * whatever it means — "started at {{r1.x}} … ended at {{r1.x}}", "its
 * highest point of {{r1.x}}" — because the row a value sits in is the one
 * thing it cannot be made to copy reliably. With the four cells on `r1`
 * under names that say what they are, citing `r1` is right. The statements
 * (`computeAskFacts()`) cite these cells whenever a result has them.
 *
 * Any other result is returned as it is, and a column the query already
 * named is never overwritten.
 */
export function withOrderSummary(rows: readonly AskRow[]): AskRow[] {
  const date = dateColumn(rows);
  if (date === null) return [...rows];
  const measures = measureColumns(rows)
    .filter((column) => !MATCH_COUNT_COLUMN.test(column))
    .slice(0, MAX_ASK_ORDER_SUMMARY_MEASURES);
  const first: AskRow = { ...rows[0] };
  for (const summary of orderSummaries(rows, date, measures)) {
    for (const [role, prefix] of Object.entries(ASK_ORDER_SUMMARY_PREFIXES)) {
      const cell = summary[role as keyof typeof ASK_ORDER_SUMMARY_PREFIXES];
      const name = `${prefix}${summary.column}`;
      if (name in first || `${name}_date` in first) continue;
      first[name] = cell.raw;
      first[`${name}_date`] = rows[cell.index][date];
    }
  }
  return [first, ...rows.slice(1)];
}

function orderStatements(
  rows: readonly AskRow[],
  date: string,
  columns: readonly string[],
): string[] {
  const statements: string[] = [];
  let summarised = false;
  for (const summary of orderSummaries(rows, date, columns)) {
    const { column, first, last } = summary;
    const at = (role: keyof typeof ASK_ORDER_SUMMARY_PREFIXES) => {
      const cell = summary[role];
      const name = `${ASK_ORDER_SUMMARY_PREFIXES[role]}${column}`;
      const day = cell.when.slice(0, 10);
      // The summary cell on r1 when `withOrderSummary()` put it there.
      if (rows[0][name] === cell.raw && `${name}_date` in rows[0]) {
        summarised = true;
        return `r1.${name} = ${cell.value} (r1.${name}_date = ${day})`;
      }
      return `${ref(cell.index, column)} = ${cell.value} (${ref(cell.index, date)} = ${day})`;
    };
    const direction =
      last.value > first.value
        ? "it ROSE from the first to the last"
        : last.value < first.value
          ? "it FELL from the first to the last"
          : "the first and the last are EQUAL, so it neither rose nor fell between them";
    statements.push(
      `${column} STARTED at ${at("first")} and ENDED at ${at("last")}: ${direction}.`,
      `${column} was LOWEST at ${at("low")} and HIGHEST at ${at("high")}.`,
    );
  }
  return summarised
    ? [
        "The app added start_, end_, low_ and high_ columns to r1: a measure's first, last, lowest and highest value by date, each with its _date. Cite THOSE cells for where it started, ended, peaked or bottomed; never another row's.",
        ...statements,
      ]
    : statements;
}

function countStatements(
  rows: readonly AskRow[],
  label: string | null,
): string[] {
  const first = rows[0];
  if (!first) return [];
  const statements: string[] = [];
  const scope = first[SCOPE_COUNT_COLUMN];
  const counts = Object.keys(first).filter(
    (column) =>
      column !== SCOPE_COUNT_COLUMN &&
      MATCH_COUNT_COLUMN.test(column) &&
      rows.every((row) => isNumber(row[column]) || isMissing(row[column])),
  );
  const totals = counts.filter((column) => TOTAL_COUNT_COLUMN.test(column));
  const perRow = counts.filter((column) => !TOTAL_COUNT_COLUMN.test(column));

  if (rows.length > 1) {
    for (const column of perRow.slice(0, 1)) {
      const cells = rows.slice(0, MAX_COUNT_ROWS).flatMap((row, index) => {
        const value = row[column];
        return isNumber(value)
          ? [`${rowName(row, index, label)} = ${show(value)}`]
          : [];
      });
      if (cells.length > 0) {
        statements.push(
          `Matches per row, from ${column}: ${cells.join("; ")}. This is each row's OWN count.`,
        );
      }
    }
    if (isNumber(scope)) {
      // The rows' own counts need not add up to the scope: a query that
      // groups by opponent hand leaves out the matches with no hand recorded.
      const own = perRow[0];
      const sum =
        own !== undefined && rows.every((row) => isNumber(row[own]))
          ? rows.reduce((total, row) => total + (row[own] as number), 0)
          : null;
      statements.push(
        perRow.length === 0
          ? `${SCOPE_COUNT_COLUMN} (${show(scope)}) counts every match that was looked at; it is not any one row's count. No column counts the matches behind a single row, so never say how many matches one row covers, or that the rows cover equal numbers.`
          : sum !== null && sum !== scope
            ? `${SCOPE_COUNT_COLUMN} (${show(scope)}) counts every match that was looked at; it is not any one row's count, and the rows together cover ${show(sum)} of them.`
            : `${SCOPE_COUNT_COLUMN} (${show(scope)}) is the total for ALL rows together, not any one row's count.`,
      );
    }
  }
  if (rows.length === 1) {
    for (const column of perRow.slice(0, 1)) {
      const value = first[column];
      if (isNumber(value) && isNumber(scope) && value !== scope) {
        statements.push(
          `r1.${column} (${show(value)}) is how many matches this row covers. ${SCOPE_COUNT_COLUMN} (${show(scope)}) counts every match that was looked at, not this row's: never give it as the number of matches behind this row's figures.`,
        );
      }
    }
  }
  for (const column of totals.slice(0, 1)) {
    const value = first[column];
    if (isNumber(value) && isNumber(scope) && value !== scope) {
      statements.push(
        `r1.${column} (${show(value)}) counts every match, not the matches the answer is about (${SCOPE_COUNT_COLUMN} = ${show(scope)}).`,
      );
    }
  }
  return statements;
}

/**
 * Words that make two column names the same measure for different parts of
 * one thing: serve direction, rally length, wing, result. First against
 * second serve is deliberately not one: stated side by side, the model led
 * with it and got it backwards ("a higher share behind his second serve
 * than his first" over 51.8 and 63.2), where the question was about neither. `big_point_serves_t`, `…_body` and `…_wide` are siblings.
 */
export const ASK_SIBLING_WORDS: readonly (readonly string[])[] = [
  ["t", "body", "wide"],
  ["short", "medium", "long"],
  ["forehand", "backhand"],
  ["wins", "losses"],
  ["hard", "clay", "grass"],
  ["deuce", "ad"],
];

const MAX_SIBLING_STATEMENTS = 4;

/**
 * A one-row result's sibling columns, ranked: which of the T, body and wide
 * counts is highest, whether long rallies or short ones were won more. The
 * model ranks these itself otherwise — "served wide most often" above T 65,
 * wide 64 — and they are not a pair by the naming convention.
 */
function siblingStatements(row: AskRow): string[] {
  const columns = Object.keys(row).filter(comparable);
  const have = new Set(columns);
  const seen = new Set<string>();
  const statements: string[] = [];
  for (const column of columns) {
    const parts = column.split("_");
    for (const [at, part] of parts.entries()) {
      const family = ASK_SIBLING_WORDS.find((words) => words.includes(part));
      if (!family) continue;
      const group = family
        .map((word) =>
          [...parts.slice(0, at), word, ...parts.slice(at + 1)].join("_"),
        )
        .filter((name) => have.has(name) && isNumber(row[name]));
      if (group.length < 2) continue;
      const key = [...group].sort().join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      const cells = group.map((name) => ({
        name,
        value: printed(row[name] as number),
      }));
      const high = Math.max(...cells.map((cell) => cell.value));
      const low = Math.min(...cells.map((cell) => cell.value));
      const shown = listed(
        cells.map((cell) => `r1.${cell.name} (${cell.value})`),
      );
      if (high === low) {
        statements.push(`${shown} are EQUAL.`);
        continue;
      }
      const where = (value: number) => {
        const names = cells
          .filter((cell) => cell.value === value)
          .map((cell) => `r1.${cell.name}`);
        return names.length === 1 ? names[0] : `TIED between ${listed(names)}`;
      };
      statements.push(
        cells.length === 2
          ? `r1.${cells[0].name} (${cells[0].value}) is ${cells[0].value > cells[1].value ? "HIGHER" : "LOWER"} than r1.${cells[1].name} (${cells[1].value}).`
          : `Among ${shown}: HIGHEST is ${where(high)}; LOWEST is ${where(low)}.`,
      );
    }
  }
  return statements.slice(0, MAX_SIBLING_STATEMENTS);
}

/** The sibling families a sentence can be checked against: their words are not ordinary prose. */
const RANKED_IN_PROSE: readonly (readonly string[])[] = [
  ["t", "body", "wide"],
  ["short", "medium", "long"],
];

/** Which of a family's words holds the highest and the lowest figure in a one-row result. */
export interface AskSiblingRanking {
  /** The family's words that the row has a figure for, in the family's order. */
  words: string[];
  highest: string;
  lowest: string;
}

/**
 * The rankings of a one-row result's serve directions and rally lengths:
 * for each family, the one word with the highest figure and the one with the
 * lowest. A family is left out when its figures tie at either end, or when
 * two of its column groups (the counts and the shares) disagree.
 *
 * `answer-render.ts` checks a superlative against it: "you serve wide most
 * often" over T 38.7, wide 34.8.
 */
export function siblingRankings(rows: readonly AskRow[]): AskSiblingRanking[] {
  if (rows.length !== 1) return [];
  const row = rows[0];
  const columns = Object.keys(row).filter(comparable);
  const have = new Set(columns);
  const found = new Map<string, AskSiblingRanking | null>();
  const seen = new Set<string>();
  for (const column of columns) {
    const parts = column.split("_");
    for (const [at, part] of parts.entries()) {
      const family = RANKED_IN_PROSE.find((words) => words.includes(part));
      if (!family) continue;
      const cells = family.flatMap((word) => {
        const name = [...parts.slice(0, at), word, ...parts.slice(at + 1)].join(
          "_",
        );
        const value = row[name];
        return have.has(name) && isNumber(value)
          ? [{ word, name, value: printed(value) }]
          : [];
      });
      if (cells.length < 2) continue;
      const group = cells.map((cell) => cell.name).join("\u0000");
      if (seen.has(group)) continue;
      seen.add(group);
      const key = family.join("\u0000");
      const high = Math.max(...cells.map((cell) => cell.value));
      const low = Math.min(...cells.map((cell) => cell.value));
      const top = cells.filter((cell) => cell.value === high);
      const bottom = cells.filter((cell) => cell.value === low);
      const ranking: AskSiblingRanking | null =
        top.length === 1 && bottom.length === 1 && high !== low
          ? {
              words: cells.map((cell) => cell.word),
              highest: top[0].word,
              lowest: bottom[0].word,
            }
          : null;
      const before = found.get(key);
      if (before === undefined) {
        found.set(key, ranking);
      } else if (
        before === null ||
        ranking === null ||
        before.highest !== ranking.highest ||
        before.lowest !== ranking.lowest
      ) {
        found.set(key, null);
      }
    }
  }
  return [...found.values()].flatMap((ranking) => (ranking ? [ranking] : []));
}

/**
 * The column holding a one-row result's own match count when it differs from
 * the scope total: the row covers `group_matches` matches, not every match
 * that was looked at. Null otherwise.
 */
export function singleRowOwnCount(rows: readonly AskRow[]): string | null {
  if (rows.length !== 1) return null;
  const row = rows[0];
  const scope = row[SCOPE_COUNT_COLUMN];
  if (!isNumber(scope)) return null;
  return (
    Object.keys(row).find((column) => {
      const value = row[column];
      return (
        column !== SCOPE_COUNT_COLUMN &&
        MATCH_COUNT_COLUMN.test(column) &&
        !TOTAL_COUNT_COLUMN.test(column) &&
        isNumber(value) &&
        value !== scope
      );
    }) ?? null
  );
}

/**
 * Per-match rows oldest first. The plan prompts ask for that order and the
 * trend line and the win/loss strip are drawn in it, under a caption that
 * says "oldest first"; a query that returned the newest first is turned
 * round. Only an exactly descending result is touched — rows in any other
 * order were ranked by something else and are left as the query gave them.
 */
export function oldestFirst(rows: readonly AskRow[]): AskRow[] {
  const date = dateColumn(rows);
  if (date === null) return [...rows];
  let fell = false;
  for (let index = 1; index < rows.length; index += 1) {
    const before = String(rows[index - 1][date]);
    const after = String(rows[index][date]);
    if (after > before) return [...rows];
    if (after < before) fell = true;
  }
  return fell ? [...rows].reverse() : [...rows];
}

/** A one-row result: the cells with no figure, and that there is no second group. */
function singleRowStatements(row: AskRow, label: string | null): string[] {
  const statements: string[] = [];
  const pairs = comparedPairs(row);
  const paired = pairs.length > 0;
  // A missing cell that is one side of a pair is stated by the pair.
  const inPair = new Set(pairs.flatMap((pair) => [pair.subject, pair.other]));
  const missing = Object.keys(row).filter(
    (column) =>
      row[column] === null && comparable(column) && !inPair.has(column),
  );
  for (const column of missing.slice(0, MAX_NULL_STATEMENTS)) {
    statements.push(
      `There is no figure for r1.${column}: it cannot be stated, and nothing can be called higher or lower than it.`,
    );
  }
  if (label !== null && !paired) {
    statements.push(
      `ONLY ONE ROW IS IN THE RESULT: ${rowName(row, 0, label)}. Give its figures; never write "more than", "compared with", "higher than" or "lower than" about a group that is not in the result, and do not say why other groups are absent or that they have no matches.`,
    );
  }
  return statements;
}

/**
 * Every statement a result supports, most useful first, at most
 * {@link MAX_ASK_FACT_STATEMENTS}. Empty when the rows hold nothing to
 * compare — one row, one number.
 */
export function computeAskFacts(rows: readonly AskRow[]): string[] {
  if (rows.length === 0) return [];
  // The names statement is added to whatever the cap leaves: it is what
  // stops a right number being given the wrong name.
  const names = measureNameStatement(rows[0]);
  const undefinedOnes = (undocumentedPercentages(rows) ?? []).map(
    (column) =>
      `r1.${column} has no documented definition: give its value under its own name and nothing more — do not say what it is a share of, and do not call it high, low, good or poor.`,
  );
  const tail = [
    ...undefinedOnes.slice(0, 2),
    ...(names === null ? [] : [names]),
  ];
  const body = comparisonFacts(rows).slice(
    0,
    MAX_ASK_FACT_STATEMENTS - tail.length,
  );
  return [...body, ...tail];
}

/** How the names statement begins: the block tells it apart from a comparison by this. */
export const ASK_MEASURE_NAMES_LEAD = "What the columns are called:";

/**
 * The `_pct` columns of a result that are not a documented measure
 * (`measures.ts`) and come with nothing they could be made from: no count
 * column beside them. "unforced_errors_pct: 25.9" on its own is a number
 * with no definition — of what, over what? A planner-made share that does
 * carry its counts (the T, body and wide counts beside their shares) is the
 * planner's to define and is not listed. Null when there is none.
 */
export function undocumentedPercentages(
  rows: readonly AskRow[],
): string[] | null {
  const first = rows[0];
  if (!first) return null;
  const isPercent = (column: string) => /(?:^|_)pct$/.test(column);
  const hasCounts = Object.keys(first).some(
    (column) =>
      column !== SCOPE_COUNT_COLUMN &&
      !isPercent(column) &&
      !DIFFERENCE_COLUMN.test(column) &&
      rows.some((row) => isNumber(row[column])),
  );
  if (hasCounts) return null;
  const unknown = Object.keys(first).filter(
    (column) =>
      isPercent(column) &&
      askMeasure(column) === null &&
      rows.some((row) => isNumber(row[column])),
  );
  return unknown.length > 0 ? unknown : null;
}

/** How many columns of a row hold a measure: a number, the scope total and match counts aside. */
export function measureColumnCount(row: AskRow): number {
  return Object.keys(row).filter(
    (column) =>
      column !== SCOPE_COUNT_COLUMN &&
      !MATCH_COUNT_COLUMN.test(column) &&
      (isNumber(row[column]) || row[column] === null),
  ).length;
}

/** At most this many columns are named in the names statement. */
const MAX_NAMED_MEASURES = 10;

/**
 * What the result's columns are called, for the ones whose name says
 * (`measures.ts`): "total_points_won_pct = total points won (the share of
 * points, not a match win rate)". Lower case on purpose: the model copies
 * the statement's own spelling into its prose. One statement, one entry per measure —
 * `me_x` and `opp_x` are the same measure and named once.
 */
function measureNameStatement(row: AskRow): string | null {
  // By the result's own column names: a name the result does not hold would
  // be cited, and a reference to a missing column fails the whole answer.
  const columns = new Map<string, { names: string[]; text: string }>();
  for (const column of Object.keys(row)) {
    const measure = askMeasure(column);
    if (!measure) continue;
    const entry = columns.get(measure.key) ?? {
      names: [],
      // Lower-case first letter only: "serves to the T" keeps its T.
      text: `${measure.label.charAt(0).toLowerCase()}${measure.label.slice(1)}${measure.note ? ` (${measure.note})` : ""}`,
    };
    entry.names.push(column);
    columns.set(measure.key, entry);
  }
  const entries = [...columns.values()]
    .slice(0, MAX_NAMED_MEASURES)
    .map((entry) => `${listed(entry.names.slice(0, 3))} = ${entry.text}`);
  return entries.length === 0
    ? null
    : `${ASK_MEASURE_NAMES_LEAD} ${entries.join("; ")}. Call each measure by that name and no other.`;
}

/** Every comparison the rows support, capped: `computeAskFacts()` without the names statement. */
export function comparisonFacts(rows: readonly AskRow[]): string[] {
  const pairs = pairStatements(rows.slice(0, MAX_LABELLED_ROWS)).slice(
    0,
    MAX_PAIR_STATEMENTS,
  );

  const label = labelColumn(rows);
  const counts = countStatements(rows, label);
  if (rows.length === 1) {
    // The one-group statement leads: it changes what the whole answer may say.
    return [
      ...singleRowStatements(rows[0], label),
      ...counts,
      ...pairs,
      ...siblingStatements(rows[0]),
    ].slice(0, MAX_ASK_FACT_STATEMENTS);
  }

  const date = dateColumn(rows);
  const measures = measureColumns(rows).filter(
    (column) => !MATCH_COUNT_COLUMN.test(column),
  );
  const order =
    date !== null
      ? orderStatements(rows, date, measures).slice(0, MAX_ORDER_STATEMENTS)
      : [];
  const extremes =
    date === null && label !== null && rows.length <= MAX_LABELLED_ROWS
      ? extremeStatements(rows, label, measures).slice(
          0,
          MAX_EXTREME_STATEMENTS,
        )
      : [];
  const booleans = booleanStatements(rows);

  return [...counts, ...order, ...extremes, ...booleans, ...pairs].slice(
    0,
    MAX_ASK_FACT_STATEMENTS,
  );
}

/** How many rows a true-or-false column is true and false in: a record cannot be misread as "won all". */
function booleanStatements(rows: readonly AskRow[]): string[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first)
    .filter((column) => rows.some((row) => typeof row[column] === "boolean"))
    .slice(0, 2)
    .map((column) => {
      const yes = rows.filter((row) => row[column] === true).length;
      const no = rows.filter((row) => row[column] === false).length;
      const unknown = rows.length - yes - no;
      return `${column} is true in ${yes} of the ${rows.length} rows and false in ${no}${unknown > 0 ? `; ${unknown} have no value` : ""}.`;
    });
}

/** The heading both answer prompts print above the statements. */
export const ASK_FACTS_HEADING =
  "WHAT THE NUMBERS SHOW — computed, not to be contradicted";

/**
 * The statements as the answer prompt prints them. With none, the block says
 * so, which is itself a fact the comparative rule reads: nothing was
 * compared, so nothing is called higher or lower.
 */
export function renderAskFactsBlock(statements: readonly string[]): string {
  const lines = statements.map((statement) => `- ${statement}`);
  // The names statement compares nothing: with it alone, nothing was compared.
  const compared = statements.some(
    (statement) => !statement.startsWith(ASK_MEASURE_NAMES_LEAD),
  );
  const body = [
    ...(compared
      ? []
      : [
          "(nothing in this result was compared: state its figures without a comparative word)",
        ]),
    ...lines,
  ].join("\n");
  return `<<< ${ASK_FACTS_HEADING}\n${body}\n>>>`;
}
