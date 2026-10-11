import type {
  AskAnswerEvent,
  AskErrorEvent,
  AskFigureEvent,
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
 *      (`ASK_FIGURE_LINE_SYNTAX`)                `MAX_ASK_FIGURES`
 *   3. everything after                        → `text` deltas
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

/**
 * A `YYYY-MM-DD` date, or a timestamp that starts with one, as `Sep 14, 2026`.
 * Read from the characters as written — never through `Date`, so neither the
 * server's timezone nor its locale can move the day. Null when the string is
 * not a date.
 */
function formatDate(value: string): string | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${MONTHS[month - 1]} ${day}, ${match[1]}`;
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
 * What the transform did, filled in as `events` is consumed and complete once
 * it is exhausted. `headline`, `figures` and `text` are the answer exactly as
 * it was sent, for the route to save.
 */
export interface AskAnswerResult {
  headline: string;
  figures: Pick<AskFigureEvent, "label" | "value">[];
  text: string;
  /** Every number the model typed instead of referencing, in order. All were dropped. */
  droppedDigits: string[];
  /** Figure lines left out: a fourth and later, or one with no label or no value. */
  droppedFigures: string[];
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

function dropTypedNumbers(literal: string, result: AskAnswerResult): string {
  return literal.replace(
    TYPED_NUMBER_IN_TEXT,
    (_match, spaced: string | undefined, bare: string | undefined) => {
      result.droppedDigits.push(spaced ?? bare ?? "");
      return "";
    },
  );
}

function resolveReference(
  body: string,
  rows: readonly AskRow[],
): { value: string } | { failure: AskAnswerFailure } {
  const reference = `${ASK_CELL_REFERENCE_OPEN}${body}${ASK_CELL_REFERENCE_CLOSE}`;
  const parsed = REFERENCE_BODY.exec(body.trim());
  if (!parsed) return { failure: { kind: "malformed_reference", reference } };

  const row = rows[Number(parsed[1]) - 1];
  if (row === undefined || row === null) {
    return { failure: { kind: "missing_row", reference } };
  }
  const column = parsed[2];
  // Own properties only: `{{r1.constructor}}` is not a column.
  if (!Object.prototype.hasOwnProperty.call(row, column)) {
    return { failure: { kind: "missing_column", reference } };
  }
  const value = formatAskCell(column, row[column]);
  if (value === null) {
    return { failure: { kind: "unformattable_cell", reference } };
  }
  return { value };
}

/**
 * Turn as much of `pending` as can be judged into display text: references
 * substituted, typed numbers dropped. `rest` is what must wait for the next
 * chunk. Substituted values are never scanned for digits — they are the
 * verified ones.
 */
function substitute(
  pending: string,
  rows: readonly AskRow[],
  result: AskAnswerResult,
  final: boolean,
): { out: string; rest: string; failure: AskAnswerFailure | null } {
  let out = "";
  let rest = pending;

  for (;;) {
    const open = rest.indexOf(ASK_CELL_REFERENCE_OPEN);
    if (open === -1) {
      const held = final ? "" : (UNSETTLED_TAIL.exec(rest)?.[0] ?? "");
      out += dropTypedNumbers(rest.slice(0, rest.length - held.length), result);
      return { out, rest: held, failure: null };
    }

    out += dropTypedNumbers(rest.slice(0, open), result);
    const bodyStart = open + ASK_CELL_REFERENCE_OPEN.length;
    const close = rest.indexOf(ASK_CELL_REFERENCE_CLOSE, bodyStart);
    if (close === -1) {
      const unclosed = rest.slice(open);
      if (final || unclosed.length > MAX_REFERENCE_LENGTH) {
        return {
          out,
          rest: "",
          failure: {
            kind: "malformed_reference",
            reference: unclosed.slice(0, MAX_REFERENCE_LENGTH),
          },
        };
      }
      return { out, rest: unclosed, failure: null };
    }

    const resolved = resolveReference(rest.slice(bodyStart, close), rows);
    if ("failure" in resolved) {
      return { out, rest: "", failure: resolved.failure };
    }
    out += resolved.value;
    rest = rest.slice(close + ASK_CELL_REFERENCE_CLOSE.length);
  }
}

/**
 * Splits substituted text into the headline, the figure lines beneath it and
 * the body. The headline and each figure are held until their line ends; the
 * body streams as it arrives, minus leading and trailing blank space.
 */
function createLineStage(result: AskAnswerResult) {
  let section: "headline" | "figures" | "text" = "headline";
  let buffer = "";
  let textStarted = false;
  let heldSpace = "";

  function figure(line: string): AskAnswerEvent[] {
    const body = line.slice(ASK_FIGURE_LINE_PREFIX.length);
    const cut = body.indexOf(ASK_FIGURE_LINE_SEPARATOR);
    const label = (cut === -1 ? body : body.slice(0, cut)).trim();
    const value =
      cut === -1
        ? ""
        : body.slice(cut + ASK_FIGURE_LINE_SEPARATOR.length).trim();
    if (
      label === "" ||
      value === "" ||
      result.figures.length >= MAX_ASK_FIGURES
    ) {
      result.droppedFigures.push(line);
      return [];
    }
    result.figures.push({ label, value });
    return [{ type: "figure", label, value }];
  }

  function text(piece: string): AskAnswerEvent[] {
    let incoming = piece;
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

    while (section !== "text") {
      const newline = buffer.indexOf("\n");

      if (newline === -1) {
        if (final) {
          const line = buffer.trim();
          buffer = "";
          if (line === "") break;
          if (section === "headline") {
            result.headline = line;
            events.push({ type: "headline", text: line });
          } else if (line.startsWith(ASK_FIGURE_LINE_PREFIX)) {
            events.push(...figure(line));
          } else {
            section = "text";
            buffer = line;
          }
          break;
        }
        // A line under the headline that already cannot be a figure line is
        // the body: stop holding it back.
        const start = buffer.trimStart();
        if (
          section === "figures" &&
          start.length >= ASK_FIGURE_LINE_PREFIX.length &&
          !start.startsWith(ASK_FIGURE_LINE_PREFIX)
        ) {
          section = "text";
        }
        break;
      }

      const line = buffer.slice(0, newline).trim();
      if (line === "") {
        buffer = buffer.slice(newline + 1);
      } else if (section === "headline") {
        buffer = buffer.slice(newline + 1);
        result.headline = line;
        events.push({ type: "headline", text: line });
        section = "figures";
      } else if (line.startsWith(ASK_FIGURE_LINE_PREFIX)) {
        buffer = buffer.slice(newline + 1);
        events.push(...figure(line));
      } else {
        section = "text";
      }
    }

    if (section === "text" && buffer !== "") {
      events.push(...text(buffer));
      buffer = "";
    }
    return events;
  }

  return { push };
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
  const lines = createLineStage(result);
  let pending = "";

  for await (const chunk of chunks) {
    const step = substitute(pending + chunk, rows, result, false);
    pending = step.rest;
    if (step.failure) {
      // Returning here also closes the model stream: nothing after a bad
      // reference is worth paying for.
      result.failure = step.failure;
      yield failed();
      return;
    }
    yield* lines.push(step.out, false);
  }

  const last = substitute(pending, rows, result, true);
  if (last.failure) {
    result.failure = last.failure;
    yield failed();
    return;
  }
  yield* lines.push(last.out, true);

  if (result.headline === "") {
    result.failure = { kind: "empty_answer" };
    yield failed();
  }
}

/**
 * Render the model's answer text against the rows its query returned.
 *
 * `events` yields `headline`, then `figure` (at most `MAX_ASK_FIGURES`), then
 * `text` deltas. A reference to a row or column the result does not have ends
 * it with one `error` event instead — never a blank where a number should be.
 * An error thrown by `chunks` itself (the provider failing) is not caught: it
 * propagates to the consumer, whose failure it is to name.
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
    text: "",
    droppedDigits: [],
    droppedFigures: [],
    failure: null,
  };
  return { events: render(chunks, rows, result), result };
}
