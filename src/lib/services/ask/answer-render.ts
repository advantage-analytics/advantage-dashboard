import {
  type AskSiblingRanking,
  perRowCountColumn,
  rowLabelColumn,
  siblingRankings,
  singleRowOwnCount,
  uniqueRowLabelTokens,
} from "@/lib/services/ask/facts";
import {
  type AskResolvedMeasure,
  askMeasure,
  askMeasureFullLabel,
} from "@/lib/services/ask/measures";
import {
  ASK_VISUAL_KINDS,
  type AskAnswerEvent,
  type AskErrorEvent,
  type AskFigureEvent,
  type AskVisual,
  type AskTrendVisual,
  type AskVisualKind,
  type AskVisualNumber,
  MAX_ASK_BARS_ROWS,
  MAX_ASK_FORM_RESULTS,
  MAX_ASK_SERVE_COURTS,
  MAX_ASK_SPLIT_PARTS,
  MAX_ASK_TABLE_COLUMNS,
  MAX_ASK_TABLE_ROWS,
  MAX_ASK_TREND_POINTS,
  MAX_ASK_VISUALS,
  MIN_ASK_FORM_RESULTS,
  MIN_ASK_SERVE_COURTS,
  MIN_ASK_SPLIT_PARTS,
  MIN_ASK_TABLE_COLUMNS,
  MIN_ASK_TREND_POINTS,
} from "@/lib/services/ask/events";

/**
 * The streaming transform between the model's answer text and the events the
 * Ask route sends (design "Route → Answer step", plan step 5).
 *
 * The rule it exists to enforce is "never type a number". The model writes
 * every figure, percentage, count and date as a reference to a cell of the
 * query result — `{{r2.second_serve_won_pct}}` — and this module substitutes
 * the cell's formatted value as the text streams. A digit the model typed
 * itself is dropped and reported. So every number the player reads traces to
 * a row the query returned, by construction: it is `/api/home-insight`'s rule
 * ("a number you write is a number nobody verified") made mechanical.
 *
 * The answer's shape, line by line:
 *
 *   1. the first non-blank line                → one `headline` event
 *   2. the figure lines directly beneath it    → `figure` events, at most
 *      (`ASK_FIGURE_LINE_SYNTAX`)                `MAX_ASK_FIGURES`, sent once
 *                                                the block has resolved, minus
 *                                                any that repeat a block cell
 *   3. an optional visual block                → one `visual` event, resolved
 *      (`ASK_VISUAL_SYNTAX`)                      against the rows
 *   4. everything after                        → `text` deltas
 *
 * A visual block that cannot be drawn — unknown kind, wrong shape, a cell the
 * result does not hold, a value of the wrong type, a limit exceeded, or a
 * second block — is dropped on its own and recorded in `droppedVisuals`; the
 * headline, figures and text still render. A bad reference anywhere else
 * still fails the whole answer, as it always has.
 *
 * Pure: no database, no network, no Next.js.
 */

// ── The syntax the answer prompt quotes ──────────────────────────────────────

/**
 * How the model writes a number: row N of the result (1-based, in the order
 * the query returned them) and a column name exactly as the query named it.
 */
export const ASK_CELL_REFERENCE_SYNTAX = "{{rN.column}}";

/** What opens and closes a cell reference. */
export const ASK_CELL_REFERENCE_OPEN = "{{";
export const ASK_CELL_REFERENCE_CLOSE = "}}";

/** What a figure line starts with. Case-sensitive, at the start of the line. */
export const ASK_FIGURE_LINE_PREFIX = "FIGURE:";

/** What separates a figure line's label from its value. */
export const ASK_FIGURE_LINE_SEPARATOR = "=";

/**
 * A figure line, whole: the prefix, a label with no digits and no `=`, the
 * separator, and one cell reference.
 */
export const ASK_FIGURE_LINE_SYNTAX = `${ASK_FIGURE_LINE_PREFIX} <label> ${ASK_FIGURE_LINE_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX}`;

/** Figure lines beyond this many are dropped and reported. */
export const MAX_ASK_FIGURES = 3;

/**
 * The visual block's lines. Each starts with one of these keywords, at the
 * start of the line, case-sensitive, and holds fields separated by
 * `ASK_VISUAL_FIELD_SEPARATOR`. The block opens with a `CHART:` line and
 * runs until the first line that starts with none of them.
 */
export const ASK_VISUAL_LINE_PREFIX = "CHART:";
export const ASK_VISUAL_SERIES_PREFIX = "SERIES:";
export const ASK_VISUAL_COLUMNS_PREFIX = "COLUMNS:";
export const ASK_VISUAL_ROW_PREFIX = "ROW:";
export const ASK_VISUAL_PLOT_PREFIX = "PLOT:";
export const ASK_VISUAL_FIELD_SEPARATOR = "|";

/** The line every block opens with: the kind, then the caption. */
export const ASK_VISUAL_LINE_SYNTAX = `${ASK_VISUAL_LINE_PREFIX} <kind> ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`;

/**
 * The whole block, per kind, as the answer prompt quotes it. A cell is one
 * reference and nothing else; a label or caption is plain words, which may
 * hold a reference. `PLOT:` names result columns, not cells: the server walks
 * every row itself, so a trend or a form never needs thirty references.
 */
export const ASK_VISUAL_SYNTAX: Record<AskVisualKind, string> = {
  bars: [
    `${ASK_VISUAL_LINE_PREFIX} bars ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`,
    `${ASK_VISUAL_SERIES_PREFIX} <subject label> ${ASK_VISUAL_FIELD_SEPARATOR} <baseline label>`,
    `${ASK_VISUAL_ROW_PREFIX} <label> ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX} ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX}`,
  ].join("\n"),
  table: [
    `${ASK_VISUAL_LINE_PREFIX} table ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`,
    `${ASK_VISUAL_COLUMNS_PREFIX} <heading> ${ASK_VISUAL_FIELD_SEPARATOR} <heading> ${ASK_VISUAL_FIELD_SEPARATOR} <heading>`,
    `${ASK_VISUAL_ROW_PREFIX} <label> ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX} ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX} ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX}`,
  ].join("\n"),
  trend: [
    `${ASK_VISUAL_LINE_PREFIX} trend ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`,
    `${ASK_VISUAL_PLOT_PREFIX} <date column> ${ASK_VISUAL_FIELD_SEPARATOR} <value column>`,
  ].join("\n"),
  split: [
    `${ASK_VISUAL_LINE_PREFIX} split ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`,
    `${ASK_VISUAL_ROW_PREFIX} <label> ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX}`,
  ].join("\n"),
  serve: [
    `${ASK_VISUAL_LINE_PREFIX} serve ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`,
    `${ASK_VISUAL_ROW_PREFIX} <court label> ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX} ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX} ${ASK_VISUAL_FIELD_SEPARATOR} ${ASK_CELL_REFERENCE_SYNTAX}`,
  ].join("\n"),
  form: [
    `${ASK_VISUAL_LINE_PREFIX} form ${ASK_VISUAL_FIELD_SEPARATOR} <caption>`,
    `${ASK_VISUAL_PLOT_PREFIX} <true-or-false column>`,
  ].join("\n"),
};

const VISUAL_LINE_PREFIXES = [
  ASK_VISUAL_LINE_PREFIX,
  ASK_VISUAL_SERIES_PREFIX,
  ASK_VISUAL_COLUMNS_PREFIX,
  ASK_VISUAL_ROW_PREFIX,
  ASK_VISUAL_PLOT_PREFIX,
] as const;

// ── Formatting ───────────────────────────────────────────────────────────────

/** What a null, empty or non-finite cell renders as: an em dash, the app's "no value". */
export const ASK_NULL_CELL = "—";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;

/** `*_pct` is the app's percentage convention: a 0–100 number, never a fraction. */
function isPercentColumn(column: string): boolean {
  return /(?:^|_)(?:pct|percent|percentage)$/.test(column);
}

/** A year reads as `2026`, never `2,026`. */
function isYearColumn(column: string): boolean {
  return /(?:^|_)year$/.test(column);
}

/**
 * A number rounded to at most one decimal (half away from zero), a trailing
 * `.0` dropped, the integer part grouped in threes with commas. Written out
 * rather than `toLocaleString()` so the output cannot vary with the server's
 * locale.
 */
function formatNumber(value: number, group: boolean): string {
  if (!Number.isFinite(value)) return ASK_NULL_CELL;
  const tenths = Math.round(Math.abs(value) * 10);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  const digits = group
    ? String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : String(whole);
  const sign = value < 0 && tenths > 0 ? "-" : "";
  return `${sign}${digits}${fraction === 0 ? "" : `.${fraction}`}`;
}

/** The parts of a `YYYY-MM-DD` date, or a timestamp that starts with one; null otherwise. */
function parseDate(
  value: string,
): { year: string; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: match[1], month, day };
}

/**
 * A `YYYY-MM-DD` date, or a timestamp that starts with one, as `Sep 14, 2026`.
 * Read from the characters as written — never through `Date`, so neither the
 * server's timezone nor its locale can move the day. Null when the string is
 * not a date.
 */
function formatDate(value: string): string | null {
  const date = parseDate(value);
  if (!date) return null;
  return `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

/**
 * One result cell as the player reads it. The rules, each pinned by the table
 * in `tests/ask-answer-render.spec.ts`:
 *
 * - null, undefined, an empty string, an empty array, NaN → `ASK_NULL_CELL`
 * - a number in a `*_pct` / `*_percent` / `*_percentage` column → at most one
 *   decimal, then `%` (the value is already 0–100)
 * - a number in a `year` / `*_year` column → as is, no grouping
 * - any other number → at most one decimal, thousands grouped with commas
 * - a string starting `YYYY-MM-DD` → `Mon D, YYYY`
 * - any other string → itself, trimmed, line breaks turned to spaces
 * - a boolean → `yes` / `no`
 * - an array → its items formatted by these rules, joined with `, `
 *
 * Returns null for a value with no sensible reading (an object): the caller
 * fails the answer rather than print `[object Object]`.
 */
export function formatAskCell(column: string, value: unknown): string | null {
  if (value === null || value === undefined) return ASK_NULL_CELL;
  if (typeof value === "number") {
    if (isPercentColumn(column)) {
      const text = formatNumber(value, true);
      return text === ASK_NULL_CELL ? text : `${text}%`;
    }
    return formatNumber(value, !isYearColumn(column));
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") {
    const text = value.replace(/\s*[\r\n]+\s*/g, " ").trim();
    if (text === "") return ASK_NULL_CELL;
    return formatDate(text) ?? text;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return ASK_NULL_CELL;
    const items: string[] = [];
    for (const item of value) {
      const text = formatAskCell(column, item);
      if (text === null) return null;
      items.push(text);
    }
    return items.join(", ");
  }
  return null;
}

// ── The transform ────────────────────────────────────────────────────────────

/** One row of the query result, keyed by the column names the query chose. */
export type AskRow = Record<string, unknown>;

export type AskAnswerFailure =
  /** `{{…}}` that is not `rN.column`, or that never closes. */
  | { kind: "malformed_reference"; reference: string }
  /** `rN` beyond the rows the query returned. */
  | { kind: "missing_row"; reference: string }
  /** A column the query did not return. */
  | { kind: "missing_column"; reference: string }
  /** A cell holding an object, which has no reading. */
  | { kind: "unformattable_cell"; reference: string }
  /** The model wrote nothing. */
  | { kind: "empty_answer" };

/**
 * Why a visual block was left out. Unlike a failure, a drop ends nothing:
 * the rest of the answer renders without the block.
 *
 * - `unknown_kind` — the `CHART:` line names a kind outside the catalogue.
 * - `malformed` — a line is the wrong shape for the kind: a keyword it does
 *   not take, the wrong number of fields, an empty label or caption, a cell
 *   that is not exactly one reference, or a required line missing. Four
 *   slips are read as meant first (`blockFields()`, `LONE_TOKEN`, the
 *   `table` case of `parseBlock()`): a `=` after a `ROW:` label, a trailing
 *   separator, a `%` after a cell, and a table heading written for the
 *   label column.
 * - `bad_reference` — a reference in the block names a row or column the
 *   result does not have, or a `PLOT:` column is missing from a row.
 *
 * In a `table` or `bars` block a `malformed` or `bad_reference` ROW is left
 * out on its own (`droppedVisualRows`) and the block drops only when no row
 * is left: each row there is a separate reading. In `split` and `serve` the
 * rows are parts of one whole, so one bad row still drops the block.
 * - `bad_value` — a cell is the wrong type for its place: a bar outside
 *   0–100, a negative count, a value that is not a number, a form result
 *   that is not a boolean.
 * - `limit` — more rows, columns, parts, courts, points or results than the
 *   kind takes, or fewer than it needs.
 * - `second_block` — a block after the first (`MAX_ASK_VISUALS`).
 */
export type AskVisualDropReason =
  | "unknown_kind"
  | "malformed"
  | "bad_reference"
  | "bad_value"
  | "limit"
  | "second_block";

export interface AskDroppedVisual {
  reason: AskVisualDropReason;
  /** The kind the block claimed, when it was one of the six. */
  kind: AskVisualKind | null;
  /** A fixed description of what was wrong. Never holds model text. */
  detail: string;
}

/**
 * What the transform did, filled in as `events` is consumed and complete once
 * it is exhausted. `headline`, `figures`, `visual` and `text` are the answer
 * exactly as it was sent, for the route to save.
 */
export interface AskAnswerResult {
  headline: string;
  figures: Pick<AskFigureEvent, "label" | "value">[];
  /** The visual block, resolved; null when the answer had none or it was dropped. */
  visual: AskVisual | null;
  text: string;
  /** Every number the model typed instead of referencing, in order. All were dropped. */
  droppedDigits: string[];
  /**
   * Figure lines left out: a fourth and later, one with no label or no
   * value, or one that repeats a cell of the visual block under the same
   * label (the page would print the number twice).
   */
  droppedFigures: string[];
  /** Visual blocks left out, with why. */
  droppedVisuals: AskDroppedVisual[];
  /**
   * `ROW:` lines left out of a `table` or `bars` block that was still sent:
   * the wrong number of cells, a cell that is not exactly one reference, or
   * a reference the result does not have. A count only — never model text.
   */
  droppedVisualRows: number;
  /**
   * Body sentences left out because they cited one cell as both ends of a
   * range ("from 54.2% … to 54.2%") or recited one cell three times or more,
   * plus a headline that had such a range cut out of it, and a sentence,
   * headline span or caption that gave the scope's match total to more than
   * one row (`citesScopeTotalPerRow()`). A count only — never model text.
   */
  droppedSentences: number;
  /**
   * Figure and row labels replaced by the server's own name for the measure
   * their cells hold (`canonicalLabel()`). A count only.
   */
  renamedLabels: number;
  /** Why the stream ended with an `error` event; null when it did not. */
  failure: AskAnswerFailure | null;
}

export interface AskAnswerRender {
  events: AsyncIterable<AskAnswerEvent>;
  result: AskAnswerResult;
}

/** The sentence the `error` event carries when the answer cannot be shown. */
export const ASK_ANSWER_FAILED_MESSAGE =
  "That answer could not be completed. Ask the question again.";

/** An unclosed `{{` longer than this is not a reference still arriving. */
const MAX_REFERENCE_LENGTH = 120;

const REFERENCE_BODY = /^r([1-9]\d*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A typed number: digits, inner `.`/`,` groups, and a `%` directly after. */
const TYPED_NUMBER = String.raw`\d+(?:[.,]\d+)*%?`;

/**
 * A typed number, taking the space before it too when a space or closing
 * punctuation follows — so "won 55% of" becomes "won of", not "won  of".
 */
const TYPED_NUMBER_IN_TEXT = new RegExp(
  ` (${TYPED_NUMBER})(?=[\\s.,;:!?)])|(${TYPED_NUMBER})`,
  "g",
);

/**
 * The end of a chunk that cannot be judged until more arrives: a space and a
 * number that may still be growing ("5" → "5.5%"), and a lone `{` that may be
 * the first half of `{{`.
 */
const UNSETTLED_TAIL = /[ ]?(?:\d[\d.,]*%?)?\{?$/;

/**
 * A resolved reference, as the substitution stage hands it to the line stage.
 * The line stage prints `text` in prose, a headline or a figure, and reads
 * `raw` in a visual block, where the component needs the number itself.
 */
type Token =
  | {
      ok: true;
      reference: string;
      column: string;
      raw: unknown;
      text: string;
    }
  | { ok: false; reference: string; failure: AskAnswerFailure };

/**
 * A token's place in the substituted text: two control characters around
 * its index. Chosen because no model writes them; any that arrive in the
 * literal text are stripped, so a token can never be forged.
 */
const TOKEN_OPEN = "\u0001";
const TOKEN_CLOSE = "\u0002";
const TOKEN = /\u0001(\d+)\u0002/g;
const TOKEN_CHARS = /[\u0001\u0002]/g;

function dropTypedNumbers(literal: string, result: AskAnswerResult): string {
  return literal
    .replace(TOKEN_CHARS, "")
    .replace(
      TYPED_NUMBER_IN_TEXT,
      (_match, spaced: string | undefined, bare: string | undefined) => {
        result.droppedDigits.push(spaced ?? bare ?? "");
        return "";
      },
    );
}

function resolveReference(body: string, rows: readonly AskRow[]): Token {
  const reference = `${ASK_CELL_REFERENCE_OPEN}${body}${ASK_CELL_REFERENCE_CLOSE}`;
  const parsed = REFERENCE_BODY.exec(body.trim());
  if (!parsed) {
    return {
      ok: false,
      reference,
      failure: { kind: "malformed_reference", reference },
    };
  }

  const row = rows[Number(parsed[1]) - 1];
  if (row === undefined || row === null) {
    return {
      ok: false,
      reference,
      failure: { kind: "missing_row", reference },
    };
  }
  const column = parsed[2];
  // Own properties only: `{{r1.constructor}}` is not a column.
  if (!Object.prototype.hasOwnProperty.call(row, column)) {
    return {
      ok: false,
      reference,
      failure: { kind: "missing_column", reference },
    };
  }
  const raw = row[column];
  const text = formatAskCell(column, raw);
  if (text === null) {
    return {
      ok: false,
      reference,
      failure: { kind: "unformattable_cell", reference },
    };
  }
  return { ok: true, reference, column, raw, text };
}

/**
 * Turn as much of `pending` as can be judged into line-stage text: typed
 * numbers dropped, each reference resolved into a token and written as its
 * marker. `rest` is what must wait for the next chunk. A reference that
 * cannot be resolved becomes a failed token — whether that fails the answer
 * or only drops a block is the line stage's call, since only it knows where
 * the reference sits.
 */
function substitute(
  pending: string,
  rows: readonly AskRow[],
  result: AskAnswerResult,
  tokens: Token[],
  final: boolean,
): { out: string; rest: string } {
  let out = "";
  let rest = pending;

  const mark = (token: Token): string => {
    tokens.push(token);
    return `${TOKEN_OPEN}${tokens.length - 1}${TOKEN_CLOSE}`;
  };

  for (;;) {
    const open = rest.indexOf(ASK_CELL_REFERENCE_OPEN);
    if (open === -1) {
      const held = final ? "" : (UNSETTLED_TAIL.exec(rest)?.[0] ?? "");
      out += dropTypedNumbers(rest.slice(0, rest.length - held.length), result);
      return { out, rest: held };
    }

    out += dropTypedNumbers(rest.slice(0, open), result);
    const bodyStart = open + ASK_CELL_REFERENCE_OPEN.length;
    const close = rest.indexOf(ASK_CELL_REFERENCE_CLOSE, bodyStart);
    if (close === -1) {
      const unclosed = rest.slice(open);
      if (final || unclosed.length > MAX_REFERENCE_LENGTH) {
        const reference = unclosed.slice(0, MAX_REFERENCE_LENGTH);
        out += mark({
          ok: false,
          reference,
          failure: { kind: "malformed_reference", reference },
        });
        return { out, rest: "" };
      }
      return { out, rest: unclosed };
    }

    out += mark(resolveReference(rest.slice(bodyStart, close), rows));
    rest = rest.slice(close + ASK_CELL_REFERENCE_CLOSE.length);
  }
}

/**
 * Line-stage text as the player reads it: every token replaced by its
 * formatted value. Stops at the first failed token and names its failure.
 */
function expand(
  text: string,
  tokens: readonly Token[],
): { text: string; failure: AskAnswerFailure | null } {
  let failure: AskAnswerFailure | null = null;
  const expanded = text.replace(TOKEN, (_match, index: string) => {
    if (failure) return "";
    const token = tokens[Number(index)];
    if (!token) return "";
    if (!token.ok) {
      failure = token.failure;
      return "";
    }
    return token.text;
  });
  return { text: expanded, failure };
}

// ── The visual block ─────────────────────────────────────────────────────────

type BlockOutcome =
  | { ok: true; visual: AskVisual; droppedRows: number }
  | { ok: false; drop: AskDroppedVisual };

/** The lone token a block cell must be, or why it is not one. */
type CellRead =
  | { ok: true; token: Extract<Token, { ok: true }> }
  | { ok: false; reason: "malformed" | "bad_reference" };

/**
 * A cell: one token, trimmed, with a `%` after it tolerated — a `_pct` cell
 * already prints with one, and a model that adds another has still named
 * exactly one cell. Anything else beside the token is not a cell.
 */
const LONE_TOKEN = /^\u0001(\d+)\u0002%?$/;

/**
 * A block line's fields after its keyword, split on the separator and
 * trimmed. Two slips a small model makes are read as what it meant, since
 * neither can name a different cell: a `=` after a `ROW:` label, as a figure
 * line uses (`ROW: Saved = {{r1.a}} | {{r1.b}}`), splits the label from the
 * first cell; and a separator with nothing after it (`ROW: A | {{r1.a}} |`)
 * is dropped. A `=` is read this way only when the label would otherwise hold
 * a cell, so a label that merely contains one is left alone.
 */
function blockFields(
  body: string,
  keyword: string,
  kind: AskVisualKind,
): string[] {
  const fields = body.split(ASK_VISUAL_FIELD_SEPARATOR).map((f) => f.trim());
  // A table row keeps a trailing empty field: it is an empty cell, read as
  // `ASK_NULL_CELL` below, where every other kind needs a number there.
  if (
    kind !== "table" &&
    fields.length > 1 &&
    fields[fields.length - 1] === ""
  ) {
    fields.pop();
  }
  if (keyword === ASK_VISUAL_ROW_PREFIX && fields.length > 0) {
    const cut = fields[0].indexOf("=");
    if (cut !== -1 && LONE_TOKEN.test(fields[0].slice(cut + 1).trim())) {
      fields.splice(
        0,
        1,
        fields[0].slice(0, cut).trim(),
        fields[0].slice(cut + 1).trim(),
      );
    }
  }
  return fields;
}

function readCell(field: string, tokens: readonly Token[]): CellRead {
  const match = LONE_TOKEN.exec(field.trim());
  const token = match ? tokens[Number(match[1])] : undefined;
  if (!token) return { ok: false, reason: "malformed" };
  if (!token.ok) return { ok: false, reason: "bad_reference" };
  return { ok: true, token };
}

/** `Sep 14`, or `Sep 14, 2026` when the series spans more than one year. */
function trendLabel(column: string, value: unknown, withYear: boolean) {
  if (typeof value === "string") {
    const date = parseDate(value.trim());
    if (date) {
      const short = `${MONTHS[date.month - 1]} ${date.day}`;
      return withYear ? `${short}, ${date.year}` : short;
    }
  }
  return formatAskCell(column, value);
}

/**
 * The block's lines, validated and resolved into an {@link AskVisual}, or the
 * reason it was dropped. Every number comes from a token; every label and
 * the caption are expanded text.
 */
function parseBlock(
  lines: readonly string[],
  tokens: readonly Token[],
  rows: readonly AskRow[],
): BlockOutcome {
  const drop = (
    reason: AskVisualDropReason,
    kind: AskVisualKind | null,
    detail: string,
  ): BlockOutcome => ({ ok: false, drop: { reason, kind, detail } });

  const [header, ...body] = lines;
  const kind = kindOf(header);
  if (!kind) return drop("unknown_kind", null, "kind is not in the catalogue");

  const headerBody = header.slice(ASK_VISUAL_LINE_PREFIX.length);
  const cut = headerBody.indexOf(ASK_VISUAL_FIELD_SEPARATOR);
  const captionRead = expand(
    cut === -1 ? "" : headerBody.slice(cut + ASK_VISUAL_FIELD_SEPARATOR.length),
    tokens,
  );
  if (captionRead.failure) {
    return drop("bad_reference", kind, "a reference in the caption");
  }
  const caption = captionRead.text.trim();
  if (caption === "") return drop("malformed", kind, "no caption");

  // The lines after the header, by keyword, in order. A keyword the kind
  // does not take is a malformed block.
  const series: string[][] = [];
  const columns: string[][] = [];
  const rowLines: string[][] = [];
  const plots: string[][] = [];
  const taken: Record<AskVisualKind, readonly string[]> = {
    bars: [ASK_VISUAL_SERIES_PREFIX, ASK_VISUAL_ROW_PREFIX],
    table: [ASK_VISUAL_COLUMNS_PREFIX, ASK_VISUAL_ROW_PREFIX],
    trend: [ASK_VISUAL_PLOT_PREFIX],
    split: [ASK_VISUAL_ROW_PREFIX],
    serve: [ASK_VISUAL_ROW_PREFIX],
    form: [ASK_VISUAL_PLOT_PREFIX],
  };
  for (const line of body) {
    const keyword = VISUAL_LINE_PREFIXES.find((prefix) =>
      line.startsWith(prefix),
    );
    if (!keyword || !taken[kind].includes(keyword)) {
      return drop("malformed", kind, "a line this kind does not take");
    }
    const fields = blockFields(line.slice(keyword.length), keyword, kind);
    if (keyword === ASK_VISUAL_SERIES_PREFIX) series.push(fields);
    else if (keyword === ASK_VISUAL_COLUMNS_PREFIX) columns.push(fields);
    else if (keyword === ASK_VISUAL_ROW_PREFIX) rowLines.push(fields);
    else plots.push(fields);
  }

  /** Labels for a list of fields, or which drop they earn. */
  const labels = (
    fields: readonly string[],
  ):
    | { ok: true; labels: string[] }
    | { ok: false; reason: AskVisualDropReason } => {
    const out: string[] = [];
    for (const field of fields) {
      const read = expand(field, tokens);
      if (read.failure) return { ok: false, reason: "bad_reference" };
      const text = read.text.trim();
      if (text === "") return { ok: false, reason: "malformed" };
      out.push(text);
    }
    return { ok: true, labels: out };
  };

  const number = (
    field: string,
    check: (n: number) => boolean,
  ):
    | { ok: true; number: AskVisualNumber }
    | { ok: false; reason: AskVisualDropReason } => {
    const cell = readCell(field, tokens);
    if (!cell.ok) return cell;
    const { raw, text } = cell.token;
    if (typeof raw !== "number" || !Number.isFinite(raw) || !check(raw)) {
      return { ok: false, reason: "bad_value" };
    }
    return { ok: true, number: { value: raw, text } };
  };

  /**
   * The rows a `table` or `bars` block leaves out. Only a `malformed` or
   * `bad_reference` row is skipped: a `bad_value` (a count where a share
   * belongs) says the block itself was built on the wrong columns, and still
   * drops it. When every row was skipped the block drops for the first
   * row's reason, as it did before rows could be skipped.
   */
  const rowSkips = (blockKind: AskVisualKind) => {
    const skips: { reason: AskVisualDropReason; detail: string }[] = [];
    const add = (reason: AskVisualDropReason, detail: string) => {
      skips.push({ reason, detail });
    };
    return {
      add,
      /** Skips the row and answers true, or answers false: the block drops. */
      take: (reason: AskVisualDropReason, detail: string) => {
        if (reason !== "malformed" && reason !== "bad_reference") return false;
        add(reason, detail);
        return true;
      },
      count: () => skips.length,
      block: (): BlockOutcome =>
        drop(
          skips[0]?.reason ?? "malformed",
          blockKind,
          skips[0]?.detail ?? "no ROW line",
        ),
    };
  };

  const isPercent = (n: number) => n >= 0 && n <= 100;
  const isCount = (n: number) => n >= 0;

  switch (kind) {
    case "bars": {
      if (series.length !== 1) {
        return drop("malformed", kind, "exactly one SERIES line is needed");
      }
      if (series[0].length !== 2) {
        return drop("malformed", kind, "SERIES needs two labels");
      }
      const seriesLabels = labels(series[0]);
      if (!seriesLabels.ok)
        return drop(seriesLabels.reason, kind, "a series label");
      if (rowLines.length < 1 || rowLines.length > MAX_ASK_BARS_ROWS) {
        return drop("limit", kind, `rows must be 1 to ${MAX_ASK_BARS_ROWS}`);
      }
      const out: AskVisual = {
        kind,
        caption,
        subjectLabel: seriesLabels.labels[0],
        baselineLabel: seriesLabels.labels[1],
        rows: [],
      };
      const skipped = rowSkips(kind);
      for (const fields of rowLines) {
        if (fields.length !== 3) {
          skipped.add("malformed", "a ROW needs a label and two cells");
          continue;
        }
        const rowLabel = labels([fields[0]]);
        if (!rowLabel.ok) {
          if (!skipped.take(rowLabel.reason, "a row label")) {
            return drop(rowLabel.reason, kind, "a row label");
          }
          continue;
        }
        const subject = number(fields[1], isPercent);
        if (!subject.ok) {
          if (!skipped.take(subject.reason, "a subject cell")) {
            return drop(subject.reason, kind, "a subject cell");
          }
          continue;
        }
        const baseline = number(fields[2], isPercent);
        if (!baseline.ok) {
          if (!skipped.take(baseline.reason, "a baseline cell")) {
            return drop(baseline.reason, kind, "a baseline cell");
          }
          continue;
        }
        out.rows.push({
          label: rowLabel.labels[0],
          subject: subject.number,
          baseline: baseline.number,
        });
      }
      if (out.rows.length === 0) return skipped.block();
      return { ok: true, visual: out, droppedRows: skipped.count() };
    }

    case "table": {
      if (columns.length !== 1) {
        return drop("malformed", kind, "exactly one COLUMNS line is needed");
      }
      // A heading written for the label column ("Set | Points played |
      // Points won", "Metric | Value") leaves every row one cell short. When
      // every row is short by exactly that one, the first heading is the
      // label column's — the wire format has none — and is dropped so the
      // rows line up. When only some rows are short, the headings stand and
      // those rows are left out below.
      if (
        columns[0].length >= 2 &&
        rowLines.length > 0 &&
        rowLines.every((fields) => fields.length === columns[0].length)
      ) {
        columns[0] = columns[0].slice(1);
      }
      if (
        columns[0].length < MIN_ASK_TABLE_COLUMNS ||
        columns[0].length > MAX_ASK_TABLE_COLUMNS
      ) {
        return drop(
          "limit",
          kind,
          `columns must be ${MIN_ASK_TABLE_COLUMNS} to ${MAX_ASK_TABLE_COLUMNS}`,
        );
      }
      const headings = labels(columns[0]);
      if (!headings.ok) return drop(headings.reason, kind, "a column heading");
      if (rowLines.length < 1 || rowLines.length > MAX_ASK_TABLE_ROWS) {
        return drop("limit", kind, `rows must be 1 to ${MAX_ASK_TABLE_ROWS}`);
      }
      const out: AskVisual = {
        kind,
        caption,
        columns: headings.labels,
        rows: [],
      };
      const skipped = rowSkips(kind);
      for (const fields of rowLines) {
        // A trailing separator after a full row is dropped; one standing
        // for a cell the model left empty (`ROW: Faced | {{r1.a}} | `) stays,
        // and that cell reads as `ASK_NULL_CELL`.
        if (
          fields.length === headings.labels.length + 2 &&
          fields[fields.length - 1] === ""
        ) {
          fields.pop();
        }
        if (fields.length !== headings.labels.length + 1) {
          skipped.add(
            "malformed",
            "a ROW needs a label and one cell per column",
          );
          continue;
        }
        const rowLabel = labels([fields[0]]);
        if (!rowLabel.ok) {
          if (!skipped.take(rowLabel.reason, "a row label")) {
            return drop(rowLabel.reason, kind, "a row label");
          }
          continue;
        }
        const cells: string[] = [];
        let bad: "malformed" | "bad_reference" | null = null;
        for (const field of fields.slice(1)) {
          if (field === "") {
            cells.push(ASK_NULL_CELL);
            continue;
          }
          const cell = readCell(field, tokens);
          if (!cell.ok) {
            bad = cell.reason;
            break;
          }
          cells.push(cell.token.text);
        }
        if (bad) {
          skipped.add(bad, "a table cell");
          continue;
        }
        out.rows.push({ label: rowLabel.labels[0], cells });
      }
      if (out.rows.length === 0) return skipped.block();
      return { ok: true, visual: out, droppedRows: skipped.count() };
    }

    case "trend": {
      if (plots.length !== 1) {
        return drop("malformed", kind, "exactly one PLOT line is needed");
      }
      const [x, y] = plots[0];
      if (
        plots[0].length !== 2 ||
        !COLUMN_NAME.test(x) ||
        !COLUMN_NAME.test(y)
      ) {
        return drop(
          "malformed",
          kind,
          "PLOT needs a date column and a value column",
        );
      }
      const raw: { x: unknown; y: number; text: string }[] = [];
      for (const row of rows) {
        if (
          !Object.prototype.hasOwnProperty.call(row, x) ||
          !Object.prototype.hasOwnProperty.call(row, y)
        ) {
          return drop(
            "bad_reference",
            kind,
            "a PLOT column the result does not have",
          );
        }
        const value = row[y];
        if (value === null || value === undefined) continue;
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return drop("bad_value", kind, "a value that is not a number");
        }
        const text = formatAskCell(y, value);
        if (text === null)
          return drop("bad_value", kind, "a value with no reading");
        raw.push({ x: row[x], y: value, text });
      }
      if (
        raw.length < MIN_ASK_TREND_POINTS ||
        raw.length > MAX_ASK_TREND_POINTS
      ) {
        return drop(
          "limit",
          kind,
          `points must be ${MIN_ASK_TREND_POINTS} to ${MAX_ASK_TREND_POINTS}`,
        );
      }
      const years = new Set(
        raw.map((point) =>
          typeof point.x === "string"
            ? parseDate(point.x.trim())?.year
            : undefined,
        ),
      );
      const withYear = years.size > 1;
      const points: AskTrendVisual["points"] = [];
      for (const point of raw) {
        const pointLabel = trendLabel(x, point.x, withYear);
        if (pointLabel === null) {
          return drop("bad_value", kind, "a date cell with no reading");
        }
        points.push({
          label: pointLabel,
          value: { value: point.y, text: point.text },
        });
      }
      return { ok: true, visual: { kind, caption, points }, droppedRows: 0 };
    }

    case "split": {
      if (
        rowLines.length < MIN_ASK_SPLIT_PARTS ||
        rowLines.length > MAX_ASK_SPLIT_PARTS
      ) {
        return drop(
          "limit",
          kind,
          `parts must be ${MIN_ASK_SPLIT_PARTS} to ${MAX_ASK_SPLIT_PARTS}`,
        );
      }
      const out: AskVisual = { kind, caption, parts: [] };
      for (const fields of rowLines) {
        if (fields.length !== 2) {
          return drop("malformed", kind, "a ROW needs a label and one cell");
        }
        const rowLabel = labels([fields[0]]);
        if (!rowLabel.ok) return drop(rowLabel.reason, kind, "a part label");
        const count = number(fields[1], isCount);
        if (!count.ok) return drop(count.reason, kind, "a count cell");
        out.parts.push({ label: rowLabel.labels[0], count: count.number });
      }
      return { ok: true, visual: out, droppedRows: 0 };
    }

    case "serve": {
      if (
        rowLines.length < MIN_ASK_SERVE_COURTS ||
        rowLines.length > MAX_ASK_SERVE_COURTS
      ) {
        return drop(
          "limit",
          kind,
          `courts must be ${MIN_ASK_SERVE_COURTS} to ${MAX_ASK_SERVE_COURTS}`,
        );
      }
      const out: AskVisual = { kind, caption, courts: [] };
      for (const fields of rowLines) {
        if (fields.length !== 4) {
          return drop(
            "malformed",
            kind,
            "a ROW needs a label and three cells: T, body, wide",
          );
        }
        const rowLabel = labels([fields[0]]);
        if (!rowLabel.ok) return drop(rowLabel.reason, kind, "a court label");
        const t = number(fields[1], isCount);
        if (!t.ok) return drop(t.reason, kind, "the T cell");
        const bodyCount = number(fields[2], isCount);
        if (!bodyCount.ok) return drop(bodyCount.reason, kind, "the body cell");
        const wide = number(fields[3], isCount);
        if (!wide.ok) return drop(wide.reason, kind, "the wide cell");
        // "All serves" is the prompt example's label; over cells that are not
        // the whole-match direction counts (serves on break points, say) it
        // would misname the court, so it falls back to the neutral word.
        const wholeMatch = fields.slice(1).every((field) => {
          const cell = readCell(field, tokens);
          return cell.ok && /^serve_(?:t|body|wide)$/.test(cell.token.column);
        });
        const courtLabel =
          /^all serves$/i.test(rowLabel.labels[0].trim()) && !wholeMatch
            ? "Serves"
            : rowLabel.labels[0];
        out.courts.push({
          label: courtLabel,
          t: t.number,
          body: bodyCount.number,
          wide: wide.number,
        });
      }
      return { ok: true, visual: out, droppedRows: 0 };
    }

    case "form": {
      if (plots.length !== 1) {
        return drop("malformed", kind, "exactly one PLOT line is needed");
      }
      const [column] = plots[0];
      if (plots[0].length !== 1 || !COLUMN_NAME.test(column)) {
        return drop("malformed", kind, "PLOT needs one column");
      }
      const results: boolean[] = [];
      for (const row of rows) {
        if (!Object.prototype.hasOwnProperty.call(row, column)) {
          return drop(
            "bad_reference",
            kind,
            "a PLOT column the result does not have",
          );
        }
        const value = row[column];
        if (value === null || value === undefined) continue;
        if (typeof value !== "boolean") {
          return drop("bad_value", kind, "a result that is not true or false");
        }
        results.push(value);
      }
      if (
        results.length < MIN_ASK_FORM_RESULTS ||
        results.length > MAX_ASK_FORM_RESULTS
      ) {
        return drop(
          "limit",
          kind,
          `results must be ${MIN_ASK_FORM_RESULTS} to ${MAX_ASK_FORM_RESULTS}`,
        );
      }
      return { ok: true, visual: { kind, caption, results }, droppedRows: 0 };
    }
  }
}

// ── The line stage ───────────────────────────────────────────────────────────

/** Could `start`, the beginning of a line still arriving, turn out to open with `prefix`? */
function couldBe(start: string, prefix: string): boolean {
  return start.startsWith(prefix) || prefix.startsWith(start);
}

/**
 * Splits substituted text into the headline, the figure lines beneath it,
 * the visual block and the body. The headline, each figure and the whole
 * block are held until their lines end; the body streams as it arrives,
 * minus leading and trailing blank space. Nothing of a block ever reaches a
 * `text` delta.
 */
function createLineStage(
  result: AskAnswerResult,
  tokens: readonly Token[],
  rows: readonly AskRow[],
) {
  let section: "headline" | "figures" | "block" | "text" = "headline";
  let buffer = "";
  let textStarted = false;
  let heldSpace = "";
  let blockLines: string[] = [];
  let blocksSeen = 0;
  /**
   * Figure lines are held until the block (if any) has resolved, so a figure
   * that repeats one of its cells can be left out: the page would otherwise
   * print the same number twice, once large and once in the table.
   */
  let heldFigures: { label: string; value: string; line: string }[] = [];

  function figure(line: string): void {
    const body = line.slice(ASK_FIGURE_LINE_PREFIX.length);
    const cut = body.indexOf(ASK_FIGURE_LINE_SEPARATOR);
    const labelRead = expand(cut === -1 ? body : body.slice(0, cut), tokens);
    const valueRead = expand(
      cut === -1 ? "" : body.slice(cut + ASK_FIGURE_LINE_SEPARATOR.length),
      tokens,
    );
    const failure = labelRead.failure ?? valueRead.failure;
    if (failure) {
      // A figure that names a row or column the result does not have is
      // left out on its own, as a block is: one mistyped column name in a
      // figure line is not worth the whole answer. In the headline or the
      // body the same slip still fails it — there the sentence needs it.
      if (failure.kind === "missing_column" || failure.kind === "missing_row") {
        result.droppedFigures.push(
          `${ASK_FIGURE_LINE_PREFIX} (a reference the result does not have)`,
        );
        return;
      }
      result.failure = failure;
      return;
    }
    const label = labelRead.text.trim();
    const value = valueRead.text.trim();
    if (label === "" || value === "" || heldFigures.length >= MAX_ASK_FIGURES) {
      result.droppedFigures.push(expand(line, tokens).text);
      return;
    }
    heldFigures.push({ label, value, line });
  }

  /** The held figures as events, minus any that repeat a cell of `visual` under the same label. */
  function flushFigures(visual: AskVisual | null): AskAnswerEvent[] {
    const cells = visual ? blockCells(visual) : [];
    const events: AskAnswerEvent[] = [];
    for (const held of heldFigures) {
      const key = labelKey(held.label);
      if (
        cells.some((cell) => cell.label === key && cell.text === held.value)
      ) {
        result.droppedFigures.push(expand(held.line, tokens).text);
        continue;
      }
      result.figures.push({ label: held.label, value: held.value });
      events.push({ type: "figure", label: held.label, value: held.value });
    }
    heldFigures = [];
    return events;
  }

  function openBlock(line: string): void {
    blockLines = [line];
    blocksSeen += 1;
    section = "block";
  }

  function closeBlock(): AskAnswerEvent[] {
    const lines = blockLines;
    blockLines = [];
    if (blocksSeen > MAX_ASK_VISUALS) {
      result.droppedVisuals.push({
        reason: "second_block",
        kind: kindOf(lines[0]),
        detail: `an answer carries at most ${MAX_ASK_VISUALS} block`,
      });
      return flushFigures(result.visual);
    }
    const outcome = parseBlock(lines, tokens, rows);
    if (!outcome.ok) {
      result.droppedVisuals.push(outcome.drop);
      return flushFigures(null);
    }
    result.visual = outcome.visual;
    result.droppedVisualRows += outcome.droppedRows;
    return [
      ...flushFigures(outcome.visual),
      { type: "visual", visual: outcome.visual },
    ];
  }

  function text(piece: string): AskAnswerEvent[] {
    const read = expand(piece, tokens);
    if (read.failure) {
      // Nothing of this piece is printed: not a blank where the number
      // should be, and not the words that led up to it.
      result.failure = read.failure;
      return [];
    }
    let incoming = read.text;
    if (!textStarted) {
      incoming = incoming.trimStart();
      if (incoming === "") return [];
      textStarted = true;
    }
    // Blank space is held until something follows it, so the body never ends
    // on a stray newline the route would then append its own sentence after.
    const combined = heldSpace + incoming;
    const delta = combined.trimEnd();
    heldSpace = combined.slice(delta.length);
    if (delta === "") return [];
    result.text += delta;
    return [{ type: "text", delta }];
  }

  function push(piece: string, final: boolean): AskAnswerEvent[] {
    const events: AskAnswerEvent[] = [];
    buffer += piece;
    if (final && section !== "text" && !buffer.endsWith("\n")) buffer += "\n";

    while (section !== "text" && result.failure === null) {
      const newline = buffer.indexOf("\n");

      if (newline === -1) {
        // A line still arriving. Under the headline it is held only while it
        // could still turn out to be a figure line or a block line; once it
        // cannot, it is the body, and the body is not held back.
        const start = buffer.trimStart();
        const candidates =
          section === "figures"
            ? [ASK_FIGURE_LINE_PREFIX, ASK_VISUAL_LINE_PREFIX]
            : section === "block"
              ? [ASK_FIGURE_LINE_PREFIX, ...VISUAL_LINE_PREFIXES]
              : [];
        if (
          section !== "headline" &&
          start !== "" &&
          !candidates.some((prefix) => couldBe(start, prefix))
        ) {
          events.push(
            ...(section === "block" ? closeBlock() : flushFigures(null)),
          );
          section = "text";
        }
        break;
      }

      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (line === "") continue;

      if (section === "headline") {
        const read = expand(line, tokens);
        if (read.failure) {
          result.failure = read.failure;
          break;
        }
        result.headline = read.text.trim();
        events.push({ type: "headline", text: result.headline });
        section = "figures";
      } else if (line.startsWith(ASK_FIGURE_LINE_PREFIX)) {
        figure(line);
      } else if (line.startsWith(ASK_VISUAL_LINE_PREFIX)) {
        if (section === "block") events.push(...closeBlock());
        openBlock(line);
      } else if (
        section === "block" &&
        VISUAL_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))
      ) {
        blockLines.push(line);
      } else {
        events.push(
          ...(section === "block" ? closeBlock() : flushFigures(null)),
        );
        section = "text";
        buffer = `${line}\n${buffer}`;
      }
    }

    if (result.failure) return events;

    if (final && section !== "text") {
      events.push(...(section === "block" ? closeBlock() : flushFigures(null)));
      section = "text";
    }
    if (section === "text" && buffer !== "") {
      events.push(...text(buffer));
      buffer = "";
    }
    return events;
  }

  return { push };
}

/** A label as it is compared: lowercased, letters and digits only. */
function labelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Every labelled number a visual shows, as (label key, printed text) pairs,
 * so a figure that repeats one can be recognised. Trend points and form
 * results have no label a figure could share.
 */
function blockCells(visual: AskVisual): { label: string; text: string }[] {
  switch (visual.kind) {
    case "table":
      return visual.rows.flatMap((row) =>
        row.cells.map((text) => ({ label: labelKey(row.label), text })),
      );
    case "bars":
      return visual.rows.flatMap((row) => [
        { label: labelKey(row.label), text: row.subject.text },
        { label: labelKey(row.label), text: row.baseline.text },
      ]);
    case "split":
      return visual.parts.map((part) => ({
        label: labelKey(part.label),
        text: part.count.text,
      }));
    case "serve":
      return visual.courts.flatMap((court) =>
        [court.t, court.body, court.wide].map((n) => ({
          label: labelKey(court.label),
          text: n.text,
        })),
      );
    default:
      return [];
  }
}

/** The kind a block's header claims, when it is one of the six. */
function kindOf(header: string | undefined): AskVisualKind | null {
  if (!header) return null;
  const body = header.slice(ASK_VISUAL_LINE_PREFIX.length);
  const cut = body.indexOf(ASK_VISUAL_FIELD_SEPARATOR);
  const text = (cut === -1 ? body : body.slice(0, cut)).trim().toLowerCase();
  return (ASK_VISUAL_KINDS as readonly string[]).includes(text)
    ? (text as AskVisualKind)
    : null;
}

// ── Sentences that cite one cell as a range ──────────────────────────────────

/**
 * "from {{r1.x}} … to {{r1.x}}": one cell written as both ends of a change.
 * The model has a single figure and narrates it as a climb or a fall — "from
 * 54.2% at the start of February to 54.2% by late September". Nothing
 * changed; the sentence says something did.
 */
const SAME_CELL_RANGE =
  /\bfrom\b[^]*?\{\{\s*(r\d+\.[A-Za-z_][A-Za-z0-9_]*)\s*\}\}[^]*?\bto\b[^]*?\{\{\s*\1\s*\}\}/i;

/** Whether a sentence of raw answer text cites the identical cell as the start and the end of a range. */
export function citesSameCellAsRange(sentence: string): boolean {
  return SAME_CELL_RANGE.test(sentence);
}

/** One cell cited this many times in a sentence is a list of one figure, not of several. */
export const MAX_SAME_CELL_CITATIONS = 2;

const ANY_REFERENCE = /\{\{\s*(r\d+\.[A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Whether a sentence cites one cell more than {@link MAX_SAME_CELL_CITATIONS}
 * times: "54.2% on Feb 7, 54.2% on Feb 7, 54.2% on Feb 7" — a model reciting
 * a result row by row and writing the first row's reference for each.
 */
export function recitesOneCell(sentence: string): boolean {
  const seen = new Map<string, number>();
  for (const match of sentence.matchAll(ANY_REFERENCE)) {
    const count = (seen.get(match[1]) ?? 0) + 1;
    if (count > MAX_SAME_CELL_CITATIONS) return true;
    seen.set(match[1], count);
  }
  return false;
}

/**
 * The same range inside a headline, which is never dropped: the span from
 * "from" to the second reference, when nothing but plain words lies between.
 * Cutting it leaves "… rose over the season." where the model wrote
 * "… rose over the season from Feb 7 to Feb 7."
 */
const SAME_CELL_SPAN =
  /\s*,?\s*\bfrom\s+(?:[^{}.,;]*?\s)?\{\{\s*(r\d+\.[A-Za-z_][A-Za-z0-9_]*)\s*\}\}[^{}.;]*?\bto\s+(?:[^{}.,;]*?\s)?\{\{\s*\1\s*\}\}/i;

/**
 * Raw answer text cut into sentences, each with the blank space after it. A
 * full stop inside a reference (`{{r1.column}}`) ends nothing. Unless
 * `final`, the last piece — a sentence that may still be arriving — is
 * handed back as `rest`.
 */
function splitSentences(
  text: string,
  final: boolean,
): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  let inReference = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith(ASK_CELL_REFERENCE_OPEN, index)) inReference = true;
    else if (text.startsWith(ASK_CELL_REFERENCE_CLOSE, index)) {
      inReference = false;
    }
    if (inReference || !".!?".includes(text[index])) continue;
    let end = index + 1;
    if (end >= text.length || !/\s/.test(text[end])) continue;
    while (end < text.length && /\s/.test(text[end])) end += 1;
    sentences.push(text.slice(start, end));
    start = end;
    index = end - 1;
  }
  const rest = text.slice(start);
  if (final && rest !== "")
    return { sentences: [...sentences, rest], rest: "" };
  return { sentences, rest };
}

// ── The scope total given to each row, and a label that names another row ───

/** The column the server adds to every row. Spelt here because `prompts.ts`, which names it, imports this module. */
const SCOPE_TOTAL_COLUMN = "matches_in_scope";

const SCOPE_TOTAL_REFERENCE = new RegExp(
  String.raw`\{\{\s*r\d+\.${SCOPE_TOTAL_COLUMN}\s*\}\}`,
  "g",
);

/**
 * Whether a sentence or caption cites the scope's match total more than
 * once. Over a result of several rows that is wrong by construction: the
 * total is one number for all of them, so "18 matches on clay and 18 matches
 * on hard courts" has pinned it on each.
 */
export function citesScopeTotalPerRow(text: string): boolean {
  return (text.match(SCOPE_TOTAL_REFERENCE)?.length ?? 0) > 1;
}

/** "… from {{r1.matches_in_scope}} matches": the span cut out of a headline, which is never dropped. */
const SCOPE_TOTAL_SPAN = new RegExp(
  String.raw`\s*(?:\b(?:from|across|over|in|of)\s+)?(?:\b(?:all|the)\s+)?\{\{\s*r\d+\.${SCOPE_TOTAL_COLUMN}\s*\}\}(?:\s+match(?:es)?\b)?`,
  "gi",
);

/** The caption a block falls back to when its own gave the scope total to a row. */
const SCOPE_TOTAL_CAPTION = `From {{r1.${SCOPE_TOTAL_COLUMN}}} matches.`;

const REFERENCE_ROW_AND_COLUMN =
  /\{\{\s*r(\d+)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function labelWords(label: string): string[] {
  return label
    .replace(REFERENCE_ROW_AND_COLUMN, " ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/**
 * Whether a label names one row of the result while every cell beside it
 * comes from other rows: "Second-serve points won against left-handers =
 * {{r2.second_serve_won_pct}}" where r2 is the right-handers row.
 *
 * `tokens` is `uniqueRowLabelTokens()`: only a word that identifies exactly
 * one row counts as naming it. Nothing is judged when the label names no
 * row, when the cells cite none, or when a cited column is not a column of
 * every row (the summary cells the server puts on the first row belong to
 * no one row).
 */
export function labelNamesAnotherRow(
  label: string,
  cells: string,
  rows: readonly AskRow[],
  tokens: ReadonlyMap<string, number>,
): boolean {
  if (tokens.size === 0) return false;
  const named = new Set<number>();
  for (const word of labelWords(label)) {
    const row = tokens.get(word);
    if (row !== undefined) named.add(row);
  }
  if (named.size === 0) return false;
  const cited = new Set<number>();
  for (const match of cells.matchAll(REFERENCE_ROW_AND_COLUMN)) {
    const column = match[2];
    if (column === SCOPE_TOTAL_COLUMN) continue;
    if (!rows.every((row) => column in row)) return false;
    cited.add(Number(match[1]) - 1);
  }
  if (cited.size === 0) return false;
  return ![...cited].some((row) => named.has(row));
}

// ── The measure's own name ──────────────────────────────────────────────────

/**
 * The measure every cell beside a label holds, when they all hold the same
 * one and its name is known (`measures.ts`); null otherwise. The scope total
 * is no measure.
 */
function measureOfCells(cells: string): AskResolvedMeasure[] | null {
  const found: AskResolvedMeasure[] = [];
  for (const match of cells.matchAll(REFERENCE_ROW_AND_COLUMN)) {
    if (match[2] === SCOPE_TOTAL_COLUMN) return null;
    const measure = askMeasure(match[2]);
    if (!measure) return null;
    found.push(measure);
  }
  if (found.length === 0) return null;
  return found.every((measure) => measure.key === found[0].key) ? found : null;
}

/**
 * The label the server gives a figure, or a table or bars row, in place of
 * the model's — or null to leave the model's alone.
 *
 * The model cites the right cell and then names it wrongly: "Hard court win
 * percentage" over the share of points won. Where the column name says which
 * measure a cell holds, the name is the dictionary's.
 *
 * - A FIGURE: the measure's name, with what its prefix says ("…, opponent",
 *   "…, all matches"). When the model's label named the row its cell comes
 *   from, that row's own label follows as a reference into the result
 *   ("Total points won, Hard Court") — never the model's spelling of it.
 * - A ROW: the measure's bare name, since the column headings say whose.
 *   A row label that names a row of the result ("Rudy Quan", "Left") is a
 *   row label, not a measure, and is left alone.
 *
 * A planner alias the dictionary cannot place keeps the model's label.
 */
export function canonicalLabel(
  kind: "figure" | "row",
  label: string,
  cells: string,
  rows: readonly AskRow[],
  tokens: ReadonlyMap<string, number>,
): string | null {
  const measures = measureOfCells(cells);
  if (!measures) return null;
  const named = new Set<number>();
  for (const word of labelWords(label)) {
    const row = tokens.get(word);
    if (row !== undefined) named.add(row);
  }
  if (kind === "row") return named.size > 0 ? null : measures[0].label;

  const sameQualifier = measures.every(
    (measure) => measure.qualifier === measures[0].qualifier,
  );
  let text = sameQualifier
    ? askMeasureFullLabel(measures[0])
    : measures[0].label;
  const cited = new Set(
    [...cells.matchAll(REFERENCE_ROW_AND_COLUMN)].map(
      (match) => Number(match[1]) - 1,
    ),
  );
  const column = rowLabelColumn(rows);
  if (cited.size === 1 && column !== null) {
    const [row] = cited;
    if (named.has(row) && typeof rows[row]?.[column] === "string") {
      text += `, ${ASK_CELL_REFERENCE_OPEN}r${row + 1}.${column}${ASK_CELL_REFERENCE_CLOSE}`;
    }
  }
  return text;
}

// ── A superlative about serve directions or rally lengths ───────────────────

const MOST_WORD = /\b(?:most|highest|largest|biggest|majority)\b/i;
const LEAST_WORD = /\b(?:least|fewest|lowest|smallest)\b/i;

/** A family word as prose writes it: the T is a capital letter, the rest whole words. */
function siblingWord(word: string): RegExp {
  return word === "t" ? /\bT\b/ : new RegExp(`\\b${word}\\b`, "i");
}

/** How a family word reads in a sentence the server writes. */
function siblingName(word: string): string {
  return word === "t" ? "the T" : word === "body" ? "the body" : word;
}

/**
 * The ranking a sentence gets wrong, or null. Deliberately narrow: the
 * sentence must name at least two words of the family (T, body, wide; short,
 * medium, long), and then
 *
 * - a "most"/"highest" with the word that IS highest absent from everything
 *   before the sentence's first "least"/"lowest" — "you serve wide most
 *   often and body least" over T 38.7, wide 34.8 — or
 * - a "least"/"lowest" with the word that is lowest absent from the sentence
 *
 * is a superlative given to the wrong one. A sentence that names the right
 * word anywhere in reach is left alone.
 */
export function misranksSiblings(
  sentence: string,
  rankings: readonly AskSiblingRanking[],
): AskSiblingRanking | null {
  const text = sentence.replace(REFERENCE_ROW_AND_COLUMN, " ");
  for (const ranking of rankings) {
    const named = ranking.words.filter((word) => siblingWord(word).test(text));
    if (named.length < 2) continue;
    const most = MOST_WORD.exec(text);
    const least = LEAST_WORD.exec(text);
    if (most) {
      const reach =
        least && least.index > most.index ? text.slice(0, least.index) : text;
      if (!siblingWord(ranking.highest).test(reach)) return ranking;
    }
    if (least && !siblingWord(ranking.lowest).test(text)) return ranking;
  }
  return null;
}

/** The headline the server writes in place of one that misranked a family. */
export function siblingHeadline(ranking: AskSiblingRanking): string {
  const names = ranking.words.map(siblingName);
  const list =
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Of ${list}, the highest figure is ${siblingName(ranking.highest)} and the lowest is ${siblingName(ranking.lowest)}.`;
}

/** The slot of a serve row a direction label belongs in: T, body, wide. -1 for anything else. */
function serveZone(label: string): number {
  const word = label
    .toLowerCase()
    .replace(/\b(?:zone|serves?|the|down|to|out)\b/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
  return ["t", "body", "wide"].indexOf(word);
}

/** The lines the sentence filter never reads: figure lines and block lines. */
const STRUCTURAL_PREFIXES = [ASK_FIGURE_LINE_PREFIX, ...VISUAL_LINE_PREFIXES];

/**
 * The model's chunks, minus every body sentence that cites one cell as both
 * ends of a range (`citesSameCellAsRange()`) or recites one cell three times
 * or more (`recitesOneCell()`). Deliberately narrow: a figure or block line
 * is never touched, the headline — the first line — only loses the range
 * itself, and a sentence is dropped only for the IDENTICAL reference, never
 * for two cells that happen to hold the same value.
 *
 * Two more faults are caught on the same pass, both over a result of several
 * rows. The scope's match total cited more than once in one sentence or
 * caption has been given to each row: the sentence is dropped, a caption
 * falls back to "From N matches.", a headline loses the spans. And a figure
 * or table row whose label names one row while its cells come from another
 * (`labelNamesAnotherRow()`) is left out. A dropped sentence keeps
 * any paragraph break that followed it.
 *
 * The body is passed on a sentence at a time rather than a chunk at a time,
 * since a sentence cannot be judged until it has ended.
 */
async function* dropSameCellRanges(
  chunks: AsyncIterable<string>,
  rows: readonly AskRow[],
  result: AskAnswerResult,
): AsyncGenerator<string, void, undefined> {
  let buffer = "";
  let headlineSeen = false;
  /** Whether anything passed on so far cites a cell other than the match count. */
  let cited = false;
  /** The kind of the block whose lines are arriving, as its `CHART:` line wrote it. */
  let blockKind = "";
  /**
   * The canonical labels already given in the figures and in the block: a
   * second cell of the same measure (the count beside its percentage) keeps
   * the model's own label, so two lines never print under one name.
   */
  const figureNames = new Set<string>();
  let rowNames = new Set<string>();
  const once = (used: Set<string>, named: string | null): string | null => {
    if (named === null || used.has(named)) return null;
    used.add(named);
    return named;
  };
  const severalRows = rows.length > 1;
  const rankings = siblingRankings(rows);
  /**
   * A one-row result that carries its own match count (3 tournament matches
   * of the 10 looked at): its figures come from that many matches. A
   * sentence or caption that cites only the scope total has given the row
   * the wrong count, and the reference is turned to the row's own.
   */
  const ownCount = singleRowOwnCount(rows);
  const ownCounted = (text: string): string => {
    if (ownCount === null || text.includes(`.${ownCount}`)) return text;
    SCOPE_TOTAL_REFERENCE.lastIndex = 0;
    if (!SCOPE_TOTAL_REFERENCE.test(text)) return text;
    SCOPE_TOTAL_REFERENCE.lastIndex = 0;
    result.renamedLabels += 1;
    return text.replace(
      SCOPE_TOTAL_REFERENCE,
      `${ASK_CELL_REFERENCE_OPEN}r1.${ownCount}${ASK_CELL_REFERENCE_CLOSE}`,
    );
  };
  const rowTokens = uniqueRowLabelTokens(rows);
  const ownCounts = perRowCountColumn(rows) !== null;

  /**
   * A figure or block line, checked for the two faults a line of its own can
   * hold: a caption that gives the scope total to a row, and a label that
   * names one row beside another row's cells. Returns "" for a line left out.
   */
  const structural = (text: string): string => {
    const start = text.trimStart();
    const end = /\s*$/.exec(text)?.[0] ?? "";
    if (start.startsWith(ASK_VISUAL_LINE_PREFIX)) {
      const body = start.slice(ASK_VISUAL_LINE_PREFIX.length);
      const cut = body.indexOf(ASK_VISUAL_FIELD_SEPARATOR);
      blockKind = (cut === -1 ? body : body.slice(0, cut)).trim().toLowerCase();
      rowNames = new Set<string>();
      if (cut === -1) return text;
      if (!severalRows) return ownCounted(text);
      const caption = body.slice(cut + 1);
      const namesRow = labelWords(caption).some((word) => rowTokens.has(word));
      SCOPE_TOTAL_REFERENCE.lastIndex = 0;
      const pinned =
        citesScopeTotalPerRow(caption) ||
        (ownCounts && namesRow && SCOPE_TOTAL_REFERENCE.test(caption));
      SCOPE_TOTAL_REFERENCE.lastIndex = 0;
      if (!pinned) return text;
      result.droppedSentences += 1;
      return `${ASK_VISUAL_LINE_PREFIX}${body.slice(0, cut)}${ASK_VISUAL_FIELD_SEPARATOR} ${SCOPE_TOTAL_CAPTION}${end}`;
    }
    if (start.startsWith(ASK_FIGURE_LINE_PREFIX)) {
      const body = start.slice(ASK_FIGURE_LINE_PREFIX.length);
      const cut = body.indexOf(ASK_FIGURE_LINE_SEPARATOR);
      if (cut === -1) return text;
      if (
        !labelNamesAnotherRow(
          body.slice(0, cut),
          body.slice(cut + 1),
          rows,
          rowTokens,
        )
      ) {
        const named = once(
          figureNames,
          canonicalLabel(
            "figure",
            body.slice(0, cut),
            body.slice(cut + 1),
            rows,
            rowTokens,
          ),
        );
        if (named === null || named === body.slice(0, cut).trim()) return text;
        result.renamedLabels += 1;
        return `${text.slice(0, text.length - start.length)}${ASK_FIGURE_LINE_PREFIX} ${named} ${ASK_FIGURE_LINE_SEPARATOR}${body.slice(cut + 1)}`;
      }
      result.droppedFigures.push(start.trimEnd());
      return "";
    }
    if (
      start.startsWith(ASK_VISUAL_ROW_PREFIX) &&
      (blockKind === "table" || blockKind === "bars")
    ) {
      const body = start.slice(ASK_VISUAL_ROW_PREFIX.length);
      // "ROW: Total points won = | …": an equals sign AND a separator after
      // the label. The sign is the slip; left in, it prints in the label.
      const stray = /^([^|=]*?)\s*=\s*\|/.exec(body);
      if (stray) {
        return structural(
          `${text.slice(0, text.length - start.length)}${ASK_VISUAL_ROW_PREFIX}${stray[1]} ${ASK_VISUAL_FIELD_SEPARATOR}${body.slice(stray[0].length)}`,
        );
      }
      const cut = body.search(/[|=]/);
      if (cut === -1) return text;
      if (
        !labelNamesAnotherRow(
          body.slice(0, cut),
          body.slice(cut + 1),
          rows,
          rowTokens,
        )
      ) {
        const named = once(
          rowNames,
          canonicalLabel(
            "row",
            body.slice(0, cut),
            body.slice(cut + 1),
            rows,
            rowTokens,
          ),
        );
        if (named === null || named === body.slice(0, cut).trim()) return text;
        result.renamedLabels += 1;
        return `${text.slice(0, text.length - start.length)}${ASK_VISUAL_ROW_PREFIX} ${named} ${body.slice(cut)}`;
      }
      result.droppedVisualRows += 1;
      return "";
    }
    if (start.startsWith(ASK_VISUAL_ROW_PREFIX) && blockKind === "serve") {
      // A serve row's cells are T, body, wide by POSITION. Over a result of
      // one row per direction the model writes them in the result's order —
      // T, Wide, Body — and the body slot prints the wide figure. When each
      // cell cites a row whose label is one of the three, they are put in
      // their own slots.
      const fields = start
        .slice(ASK_VISUAL_ROW_PREFIX.length)
        .trimEnd()
        .split(ASK_VISUAL_FIELD_SEPARATOR);
      const column = rowLabelColumn(rows);
      if (fields.length !== 4 || column === null) return text;
      const slots: (string | undefined)[] = [undefined, undefined, undefined];
      for (const field of fields.slice(1)) {
        const cited = [...field.matchAll(REFERENCE_ROW_AND_COLUMN)];
        if (cited.length !== 1) return text;
        const value = rows[Number(cited[0][1]) - 1]?.[column];
        const zone = typeof value === "string" ? serveZone(value) : -1;
        if (zone === -1 || slots[zone] !== undefined) return text;
        slots[zone] = field.trim();
      }
      return `${text.slice(0, text.length - start.length)}${ASK_VISUAL_ROW_PREFIX}${fields[0]}${ASK_VISUAL_FIELD_SEPARATOR} ${slots.join(` ${ASK_VISUAL_FIELD_SEPARATOR} `)}${end}`;
    }
    if (start.startsWith(ASK_VISUAL_PLOT_PREFIX) && blockKind === "form") {
      // "PLOT: i_van": a form block plots one true-or-false column, and a
      // result that has exactly one can only mean that one.
      const column = start.slice(ASK_VISUAL_PLOT_PREFIX.length).trim();
      const first = rows[0] ?? {};
      if (column in first) return text;
      const booleans = Object.keys(first).filter((name) =>
        rows.some((row) => typeof row[name] === "boolean"),
      );
      if (booleans.length !== 1) return text;
      return `${text.slice(0, text.length - start.length)}${ASK_VISUAL_PLOT_PREFIX} ${booleans[0]}${end}`;
    }
    return text;
  };

  const kept = (sentences: readonly string[]): string =>
    sentences
      .map((sentence) => {
        if (
          !citesSameCellAsRange(sentence) &&
          !recitesOneCell(sentence) &&
          !(severalRows && citesScopeTotalPerRow(sentence)) &&
          misranksSiblings(sentence, rankings) === null
        ) {
          return ownCounted(sentence);
        }
        result.droppedSentences += 1;
        const space = /\s*$/.exec(sentence)?.[0] ?? "";
        return space.includes("\n") ? space : "";
      })
      .join("");

  /** One whole line, its newline included, or the last line of the stream. */
  const line = (text: string): string => {
    if (text.trim() === "") return text;
    if (!headlineSeen) {
      headlineSeen = true;
      // The headline is never dropped; a same-cell range in it is cut out,
      // and so is the scope total when it was given to more than one row.
      let headline = text;
      if (SAME_CELL_SPAN.test(headline)) {
        result.droppedSentences += 1;
        headline = headline.replace(SAME_CELL_SPAN, "");
      }
      if (severalRows && citesScopeTotalPerRow(headline)) {
        result.droppedSentences += 1;
        headline = headline.replace(SCOPE_TOTAL_SPAN, "");
      }
      // A superlative given to the wrong serve direction or rally length:
      // the headline cannot be dropped, so the server states the ranking.
      const misranked = misranksSiblings(headline, rankings);
      if (misranked !== null) {
        result.droppedSentences += 1;
        const end = /\s*$/.exec(headline)?.[0] ?? "";
        return `${siblingHeadline(misranked)}${end}`;
      }
      return ownCounted(headline);
    }
    const start = text.trimStart();
    if (STRUCTURAL_PREFIXES.some((prefix) => start.startsWith(prefix))) {
      return structural(text);
    }
    return kept(splitSentences(text, true).sentences);
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    let out = "";
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) break;
      out += line(buffer.slice(0, newline + 1));
      buffer = buffer.slice(newline + 1);
    }
    // A line still arriving: body text goes on sentence by sentence; the
    // headline and anything that may yet be a figure or block line waits.
    const start = buffer.trimStart();
    if (
      headlineSeen &&
      start !== "" &&
      !STRUCTURAL_PREFIXES.some((prefix) => couldBe(start, prefix))
    ) {
      const split = splitSentences(buffer, false);
      out += kept(split.sentences);
      buffer = split.rest;
    }
    if (out !== "") {
      cited = cited || citesAMeasure(out);
      yield out;
    }
  }
  const last = buffer === "" ? "" : line(buffer);
  if (last !== "") {
    cited = cited || citesAMeasure(last);
    yield last;
  }
  // An answer that cites no cell of the result but the match count has told
  // the reader nothing ("Your break points figures are recorded across
  // eighteen matches."). For a one-row result the server adds the figures
  // itself, each under the measure's own name.
  if (!cited && headlineSeen && rows.length === 1) {
    const stated = statedFigures(rows[0]);
    if (stated !== "") {
      result.renamedLabels += 1;
      yield `\n\n${stated}`;
    }
  }
}

/** Whether text cites any cell other than the scope's match count. */
function citesAMeasure(text: string): boolean {
  for (const match of text.matchAll(REFERENCE_ROW_AND_COLUMN)) {
    if (match[2] !== SCOPE_TOTAL_COLUMN) return true;
  }
  return false;
}

/** At most this many figures are stated for an answer that cited none. */
const MAX_STATED_FIGURES = 4;

/**
 * A one-row result's known measures as plain sentences of references:
 * "Break points saved: {{r1.break_points_saved_pct}}." Only columns whose
 * name the dictionary places and whose cell holds a number, one per measure
 * and qualifier; "" when there is none.
 */
export function statedFigures(row: AskRow): string {
  const seen = new Set<string>();
  const sentences: string[] = [];
  for (const [column, value] of Object.entries(row)) {
    if (typeof value !== "number") continue;
    const measure = askMeasure(column);
    if (!measure) continue;
    const label = askMeasureFullLabel(measure);
    const key = `${label}${isPercentColumn(column) ? " %" : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sentences.push(
      `${label}: ${ASK_CELL_REFERENCE_OPEN}r1.${column}${ASK_CELL_REFERENCE_CLOSE}.`,
    );
    if (sentences.length === MAX_STATED_FIGURES) break;
  }
  return sentences.join(" ");
}

function failed(): AskErrorEvent {
  return {
    type: "error",
    code: "answer_failed",
    error: ASK_ANSWER_FAILED_MESSAGE,
  };
}

async function* render(
  chunks: AsyncIterable<string>,
  rows: readonly AskRow[],
  result: AskAnswerResult,
): AsyncGenerator<AskAnswerEvent, void, undefined> {
  const tokens: Token[] = [];
  const lines = createLineStage(result, tokens, rows);
  let pending = "";

  for await (const chunk of dropSameCellRanges(chunks, rows, result)) {
    const step = substitute(pending + chunk, rows, result, tokens, false);
    pending = step.rest;
    yield* lines.push(step.out, false);
    if (result.failure) {
      // Returning here also closes the model stream: nothing after a bad
      // reference is worth paying for.
      yield failed();
      return;
    }
  }

  const last = substitute(pending, rows, result, tokens, true);
  yield* lines.push(last.out, true);
  if (result.failure) {
    yield failed();
    return;
  }

  if (result.headline === "") {
    result.failure = { kind: "empty_answer" };
    yield failed();
  }
}

/**
 * Render the model's answer text against the rows its query returned.
 *
 * `events` yields `headline`, then `figure` (at most `MAX_ASK_FIGURES`), then
 * at most one `visual`, then `text` deltas. A reference to a row or column
 * the result does not have ends it with one `error` event instead — never a
 * blank where a number should be — unless the reference sits inside the
 * visual block, which drops the block alone. An error thrown by `chunks`
 * itself (the provider failing) is not caught: it propagates to the
 * consumer, whose failure it is to name.
 *
 * `result` is live: read it after `events` is exhausted.
 */
export function renderAskAnswer(
  chunks: AsyncIterable<string>,
  rows: readonly AskRow[],
): AskAnswerRender {
  const result: AskAnswerResult = {
    headline: "",
    figures: [],
    visual: null,
    text: "",
    droppedDigits: [],
    droppedFigures: [],
    droppedVisuals: [],
    droppedVisualRows: 0,
    droppedSentences: 0,
    renamedLabels: 0,
    failure: null,
  };
  return { events: render(chunks, rows, result), result };
}
