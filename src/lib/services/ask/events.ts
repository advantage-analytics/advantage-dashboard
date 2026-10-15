/**
 * The events `POST /api/ask` streams, one JSON object per line
 * (`application/x-ndjson`), and the client reads back (design "Route",
 * plan step 5).
 *
 * Shared by the route and by client components, so this file is types and
 * plain constants only: it imports nothing, and must never import anything
 * server-only (`next/server`, a node built-in, a Supabase client).
 */

/**
 * The longest question `POST /api/ask` accepts, in characters (UTF-16 code
 * units, after trimming). Sized to the route's 4096-byte body cap: a
 * thousand characters is at most 3000 bytes of UTF-8, which leaves room for
 * ten tags and a conversation id beside it.
 */
export const MAX_ASK_QUESTION_LENGTH = 1000;

/** The three steps a question passes through, in order. */
export const ASK_STATUS_STAGES = ["planning", "querying", "writing"] as const;

export type AskStatusStage = (typeof ASK_STATUS_STAGES)[number];

/**
 * Why an answer failed after the stream opened (design "Error handling").
 *
 * - `cannot_answer` — the model said the data cannot answer it, or the query
 *   failed twice.
 * - `no_data` — the query ran and its scope is empty.
 * - `llm_unavailable` — the provider errored.
 * - `answer_failed` — the model's answer broke the answer contract in a way
 *   that cannot be shown: it referenced a cell the query did not return, or
 *   wrote nothing. Not in the design's table; the renderer needs a code that
 *   does not claim the data was at fault or that the provider was down.
 */
export type AskErrorCode =
  | "cannot_answer"
  | "no_data"
  | "llm_unavailable"
  | "answer_failed"
  /** Not a failure: Ask asks which was meant (`error` is the question, `options` the choices). */
  | "needs_clarification";

/**
 * One match an answer was computed from, as the `ask.matches` view states it.
 * `iWon` is null when the score cannot say (an unfinished match) — never a
 * loss.
 */
export interface AskSourceMatch {
  matchId: string;
  opponentName: string | null;
  /** `YYYY-MM-DD`. */
  playedOn: string | null;
  iWon: boolean | null;
  scoreText: string | null;
  /**
   * Team scope: the program's player this match is turned to
   * (`ask.matches.player_name`). Always null in a personal scope — the
   * viewer is not named to themselves — and for a team match whose side is
   * unknown.
   */
  playerName: string | null;
  /**
   * A pattern answer only: the match's Video view filtered to the points the
   * answer counted in it, and how many. Absent everywhere else.
   */
  watch?: { href: string; points: number };
}

/**
 * `value` as an {@link AskSourceMatch}, or null when it has no match id.
 * Written for a line of the stream and for a saved answer's opaque jsonb:
 * every field but the id is optional, and a source saved before
 * `playerName` existed reads back with it null.
 */
export function readAskSourceMatch(value: unknown): AskSourceMatch | null {
  if (!isRecord(value) || typeof value.matchId !== "string") return null;
  const text = (field: unknown) => (typeof field === "string" ? field : null);
  return {
    matchId: value.matchId,
    opponentName: text(value.opponentName),
    playedOn: text(value.playedOn),
    // Null stays null: a score that cannot say is not a loss.
    iWon: typeof value.iWon === "boolean" ? value.iWon : null,
    scoreText: text(value.scoreText),
    playerName: text(value.playerName),
    // Only a link into a match's own page, with a count, is kept.
    ...(isRecord(value.watch) &&
    typeof value.watch.href === "string" &&
    value.watch.href.startsWith("/dashboard/matches/") &&
    typeof value.watch.points === "number"
      ? { watch: { href: value.watch.href, points: value.watch.points } }
      : {}),
  };
}

/** Which step the route is on; drives the in-flight status line. */
export interface AskStatusEvent {
  type: "status";
  stage: AskStatusStage;
}

/** The answer's first line: one claim. Sent once, whole. */
export interface AskHeadlineEvent {
  type: "headline";
  text: string;
}

/**
 * One figure tile. `value` is already formatted for display. `column` is the
 * result column the value was cited from, when the figure line named exactly
 * one cell — what `figure-video.ts` reads to decide whether the figure can
 * open the Video tab on the points it counts. Absent for a figure whose
 * value was more than one reference, and for figures saved before it existed.
 */
export interface AskFigureEvent {
  type: "figure";
  label: string;
  value: string;
  column?: string;
}

/** The next piece of the evidence paragraphs; append `delta` to what came before. */
export interface AskTextEvent {
  type: "text";
  delta: string;
}

// ── The visual block ─────────────────────────────────────────────────────────

/**
 * The kinds of visual block an answer may carry, at most one per answer
 * (`MAX_ASK_VISUALS`). The model chooses the kind, its caption and its
 * labels; every number is a cell of the query result, resolved by the server
 * (`answer-render.ts`) — never text the model typed. `momentum` is the one
 * kind the model is never offered (`ASK_MODEL_VISUAL_KINDS`): the server
 * writes it, for one match, from one row per point.
 */
export const ASK_VISUAL_KINDS = [
  "bars",
  "table",
  "trend",
  "split",
  "serve",
  "form",
  "momentum",
] as const;

export type AskVisualKind = (typeof ASK_VISUAL_KINDS)[number];

/** The six kinds the answer prompt's catalogue offers the model. */
export const ASK_MODEL_VISUAL_KINDS = [
  "bars",
  "table",
  "trend",
  "split",
  "serve",
  "form",
] as const satisfies readonly AskVisualKind[];

export type AskModelVisualKind = (typeof ASK_MODEL_VISUAL_KINDS)[number];

/** An answer carries at most this many visual blocks; a second is dropped. */
export const MAX_ASK_VISUALS = 1;

/** `bars`: rows beyond this many drop the block. */
export const MAX_ASK_BARS_ROWS = 6;
/**
 * `table`: rows beyond this many drop the block. Twelve so the serve +1
 * breakdown (`serve-plus-one.ts`) can list its patterns; every other table —
 * the model's own, the comparisons, the review, a pattern's matches — still
 * holds `ASK_TABLE_ROWS`.
 */
export const MAX_ASK_TABLE_ROWS = 12;
/** How many rows every table but the serve +1 breakdown holds. */
export const ASK_TABLE_ROWS = 8;
/** `table`: column headings, inclusive. */
export const MIN_ASK_TABLE_COLUMNS = 1;
export const MAX_ASK_TABLE_COLUMNS = 3;
/** `trend`: points (one per result row with a value), inclusive. */
export const MIN_ASK_TREND_POINTS = 2;
export const MAX_ASK_TREND_POINTS = 30;
/** `split`: parts of the whole, inclusive. */
export const MIN_ASK_SPLIT_PARTS = 2;
export const MAX_ASK_SPLIT_PARTS = 4;
/** `serve`: courts (rows of T / Body / Wide), inclusive. */
export const MIN_ASK_SERVE_COURTS = 1;
export const MAX_ASK_SERVE_COURTS = 2;
/** `form`: results (one per result row with a known outcome), inclusive. */
export const MIN_ASK_FORM_RESULTS = 1;
export const MAX_ASK_FORM_RESULTS = 30;
/** `momentum`: points of one match with a known winner, inclusive. */
export const MIN_ASK_MOMENTUM_POINTS = 2;
export const MAX_ASK_MOMENTUM_POINTS = 400;

/**
 * One resolved number: `value` is the cell as the database returned it, for
 * the component that computes geometry from it; `text` is the same cell as
 * the player reads it (`formatAskCell` rules — `54.6%`, `1,204`, `—`), for
 * wherever the component prints it. The client never formats a value itself.
 */
export interface AskVisualNumber {
  value: number;
  text: string;
}

/**
 * Comparison bars: one measure per row, the subject's bar over the
 * baseline's. Both values are percentages, 0–100.
 */
export interface AskBarsVisual {
  kind: "bars";
  /** One line under the block, e.g. "Share of points, from 4 matches against 22." */
  caption: string;
  /** The key for the first (subject) series, e.g. "Against left-handers". */
  subjectLabel: string;
  /** The key for the second (baseline) series, e.g. "All matches". */
  baselineLabel: string;
  /** 1–`MAX_ASK_BARS_ROWS` rows. */
  rows: {
    label: string;
    subject: AskVisualNumber;
    baseline: AskVisualNumber;
  }[];
}

/**
 * Stat table: measures down the side, 1–3 columns across — the prompt asks
 * for two or three, and one is what is left when a model heads the label
 * column and gives a single value column. Every cell is already a display
 * string — the table only prints.
 */
export interface AskTableVisual {
  kind: "table";
  caption: string;
  /** `MIN_ASK_TABLE_COLUMNS`–`MAX_ASK_TABLE_COLUMNS` headings. */
  columns: string[];
  /** 1–`MAX_ASK_TABLE_ROWS` rows, each with exactly `columns.length` cells. */
  rows: { label: string; cells: string[] }[];
}

/**
 * Trend line: one value per match in date order, oldest first — the order
 * the query returned them.
 */
export interface AskTrendVisual {
  kind: "trend";
  caption: string;
  /**
   * `MIN_ASK_TREND_POINTS`–`MAX_ASK_TREND_POINTS` points. `label` is the x
   * value as the axis shows it: a date as `Sep 14` (with the year added when
   * the points span more than one), anything else by `formatAskCell`.
   * `matchId` is the match the point is, when the result row carried one
   * (`match_id`): the block then links the point to that match's page.
   */
  points: { label: string; value: AskVisualNumber; matchId?: string }[];
  /**
   * A second series under the same points, drawn dashed — the same measure
   * across all matches as a flat line, or a per-match average. `values` has
   * exactly one number per point, in the same order. Absent for a block with
   * one series, which draws the mean of its own points instead (geometry
   * only; the mean is never printed, since it is not a cell of the result).
   */
  baseline?: { label: string; values: AskVisualNumber[] };
}

/** Parts of a whole: counts that sum to the total. Each count is ≥ 0. */
export interface AskSplitVisual {
  kind: "split";
  caption: string;
  /** `MIN_ASK_SPLIT_PARTS`–`MAX_ASK_SPLIT_PARTS` parts. */
  parts: { label: string; count: AskVisualNumber }[];
}

/**
 * Serve placement: one bar per court (or per group of serves), split T /
 * Body / Wide. Each count is ≥ 0. A court is whatever the model labelled
 * it: "Deuce" and "Ad" when the query split by `ask.points.court`, otherwise
 * a group such as "All serves" or "Second serves".
 */
export interface AskServeVisual {
  kind: "serve";
  caption: string;
  /** `MIN_ASK_SERVE_COURTS`–`MAX_ASK_SERVE_COURTS` courts. */
  courts: {
    label: string;
    t: AskVisualNumber;
    body: AskVisualNumber;
    wide: AskVisualNumber;
  }[];
}

/** A win/loss strip, oldest first. `true` is a win. */
export interface AskFormVisual {
  kind: "form";
  caption: string;
  /** `MIN_ASK_FORM_RESULTS`–`MAX_ASK_FORM_RESULTS` results. */
  results: boolean[];
}

/** The pressure a point was played under, the heaviest named. */
export type AskMomentumMark = "break" | "set" | "match";

/**
 * How one match flowed: its points in play order, each won or lost by the
 * subject, the component drawing the running difference as a line with the
 * sets as segments and the pressure points marked. Server-written only
 * (`momentum.ts`), from `ask.points`.
 */
export interface AskMomentumVisual {
  kind: "momentum";
  caption: string;
  /** The match the points are, when every row named the same one: the marks then link to its Video tab. */
  matchId?: string;
  /** `MIN_ASK_MOMENTUM_POINTS`–`MAX_ASK_MOMENTUM_POINTS` points, in play order. */
  points: { won: boolean; set?: number; mark?: AskMomentumMark }[];
}

/**
 * The one visual block an answer may carry, told apart by `kind`. Resolved
 * data, ready to draw, and plain JSON: it is what the `visual` event carries
 * and what is saved with the answer.
 */
export type AskVisual =
  | AskBarsVisual
  | AskTableVisual
  | AskTrendVisual
  | AskSplitVisual
  | AskServeVisual
  | AskFormVisual
  | AskMomentumVisual;

/** The answer's visual block. Sent once, whole, after the figures and before the text. */
export interface AskVisualEvent {
  type: "visual";
  visual: AskVisual;
}

/**
 * What a notice says. `no_advice`: the question asked what to do, which Ask
 * does not answer; the client shows `ASK_NO_ADVICE_SENTENCE` beside the
 * answer, not in its body.
 */
export type AskNoticeKind = "no_advice";

/** A signal beside the answer, not part of its text. Sent after the text. */
export interface AskNoticeEvent {
  type: "notice";
  notice: AskNoticeKind;
}

/**
 * The sentence shown for a `no_advice` notice (design "Error handling"). It
 * is the server's: it appears in neither prompt, since a sentence the model
 * has read is a sentence the model will paraphrase. Answers saved before the
 * notice existed carry it at the end of `body` instead.
 */
export const ASK_NO_ADVICE_SENTENCE =
  "Ask reports what your matches show; it does not recommend what to work on.";

/** The same notice in a team scope, where the matches are the program's. */
export const ASK_TEAM_NO_ADVICE_SENTENCE =
  "Ask reports what the program's matches show; it does not recommend what to work on.";

/** The matches the answer was computed from. */
export interface AskSourcesEvent {
  type: "sources";
  matches: AskSourceMatch[];
}

/** The answer is saved; `used` of `cap` questions are spent this month (`cap` null: no limit). */
export interface AskDoneEvent {
  type: "done";
  conversationId: string;
  /** The saved answer's `ask_messages` id, for feedback on it. Absent if it could not be read. */
  answerId?: string;
  used: number;
  cap: number | null;
}

/** The answer failed. `error` is the sentence to show, `code` the slug to branch on. */
export interface AskErrorEvent {
  type: "error";
  code: AskErrorCode;
  error: string;
  /**
   * `needs_clarification` only: two to four answers the asker can pick, each
   * sent back as a follow-up. The server writes them from what the scope
   * holds, never from free model text beyond a short label.
   */
  options?: string[];
}

export type AskEvent =
  | AskStatusEvent
  | AskHeadlineEvent
  | AskFigureEvent
  | AskVisualEvent
  | AskTextEvent
  | AskNoticeEvent
  | AskSourcesEvent
  | AskDoneEvent
  | AskErrorEvent;

/** The subset the answer renderer produces from the model's text. */
export type AskAnswerEvent =
  | AskHeadlineEvent
  | AskFigureEvent
  | AskVisualEvent
  | AskTextEvent
  | AskErrorEvent;

// ── Reading a visual back ────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function readNumber(
  value: unknown,
  check: (n: number) => boolean,
): AskVisualNumber | null {
  if (!isRecord(value)) return null;
  const { value: n, text } = value;
  if (typeof n !== "number" || !Number.isFinite(n) || !check(n)) return null;
  if (typeof text !== "string") return null;
  return { value: n, text };
}

function readList<T>(
  value: unknown,
  min: number,
  max: number,
  read: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return null;
  }
  const out: T[] = [];
  for (const item of value) {
    const read_ = read(item);
    if (read_ === null) return null;
    out.push(read_);
  }
  return out;
}

const isPercent = (n: number) => n >= 0 && n <= 100;
const isCount = (n: number) => n >= 0;
const anyNumber = () => true;

/**
 * `value` as an {@link AskVisual}, or null when it is not one: the wrong
 * kind, a missing field, a label that is not a string, a number out of its
 * range, or a list outside its limits. Pure and defensive — written for the
 * saved-answer reader, which gets opaque jsonb nobody validated, and for the
 * client, which gets a line of a stream.
 */
export function readAskVisual(value: unknown): AskVisual | null {
  if (!isRecord(value) || typeof value.caption !== "string") return null;
  const caption = value.caption;

  switch (value.kind) {
    case "bars": {
      if (!isLabel(value.subjectLabel) || !isLabel(value.baselineLabel)) {
        return null;
      }
      const rows = readList(value.rows, 1, MAX_ASK_BARS_ROWS, (row) => {
        if (!isRecord(row) || !isLabel(row.label)) return null;
        const subject = readNumber(row.subject, isPercent);
        const baseline = readNumber(row.baseline, isPercent);
        return subject && baseline
          ? { label: row.label, subject, baseline }
          : null;
      });
      return rows
        ? {
            kind: "bars",
            caption,
            subjectLabel: value.subjectLabel,
            baselineLabel: value.baselineLabel,
            rows,
          }
        : null;
    }
    case "table": {
      const columns = readList(
        value.columns,
        MIN_ASK_TABLE_COLUMNS,
        MAX_ASK_TABLE_COLUMNS,
        (column) => (isLabel(column) ? column : null),
      );
      if (!columns) return null;
      const rows = readList(value.rows, 1, MAX_ASK_TABLE_ROWS, (row) => {
        if (!isRecord(row) || !isLabel(row.label)) return null;
        const cells = readList(
          row.cells,
          columns.length,
          columns.length,
          (cell) => (typeof cell === "string" ? cell : null),
        );
        return cells ? { label: row.label, cells } : null;
      });
      return rows ? { kind: "table", caption, columns, rows } : null;
    }
    case "trend": {
      const points = readList(
        value.points,
        MIN_ASK_TREND_POINTS,
        MAX_ASK_TREND_POINTS,
        (point) => {
          if (!isRecord(point) || typeof point.label !== "string") return null;
          const number = readNumber(point.value, anyNumber);
          if (!number) return null;
          // A point saved before match links existed has no `matchId`; one
          // that carries the key must carry an id, not something else.
          if (point.matchId === undefined) {
            return { label: point.label, value: number };
          }
          return isLabel(point.matchId)
            ? { label: point.label, value: number, matchId: point.matchId }
            : null;
        },
      );
      if (!points) return null;
      if (value.baseline === undefined)
        return { kind: "trend", caption, points };
      // A second series must be whole: a label and one number per point.
      if (!isRecord(value.baseline) || !isLabel(value.baseline.label)) {
        return null;
      }
      const values = readList(
        value.baseline.values,
        points.length,
        points.length,
        (item) => readNumber(item, anyNumber),
      );
      return values
        ? {
            kind: "trend",
            caption,
            points,
            baseline: { label: value.baseline.label, values },
          }
        : null;
    }
    case "split": {
      const parts = readList(
        value.parts,
        MIN_ASK_SPLIT_PARTS,
        MAX_ASK_SPLIT_PARTS,
        (part) => {
          if (!isRecord(part) || !isLabel(part.label)) return null;
          const count = readNumber(part.count, isCount);
          return count ? { label: part.label, count } : null;
        },
      );
      return parts ? { kind: "split", caption, parts } : null;
    }
    case "serve": {
      const courts = readList(
        value.courts,
        MIN_ASK_SERVE_COURTS,
        MAX_ASK_SERVE_COURTS,
        (court) => {
          if (!isRecord(court) || !isLabel(court.label)) return null;
          const t = readNumber(court.t, isCount);
          const body = readNumber(court.body, isCount);
          const wide = readNumber(court.wide, isCount);
          return t && body && wide
            ? { label: court.label, t, body, wide }
            : null;
        },
      );
      return courts ? { kind: "serve", caption, courts } : null;
    }
    case "form": {
      const results = readList(
        value.results,
        MIN_ASK_FORM_RESULTS,
        MAX_ASK_FORM_RESULTS,
        (result) => (typeof result === "boolean" ? result : null),
      );
      return results ? { kind: "form", caption, results } : null;
    }
    case "momentum": {
      const points = readList(
        value.points,
        MIN_ASK_MOMENTUM_POINTS,
        MAX_ASK_MOMENTUM_POINTS,
        (point) => {
          if (!isRecord(point) || typeof point.won !== "boolean") return null;
          const out: AskMomentumVisual["points"][number] = { won: point.won };
          if (point.set !== undefined) {
            if (
              typeof point.set !== "number" ||
              !Number.isInteger(point.set) ||
              point.set < 1
            ) {
              return null;
            }
            out.set = point.set;
          }
          if (point.mark !== undefined) {
            if (
              point.mark !== "break" &&
              point.mark !== "set" &&
              point.mark !== "match"
            ) {
              return null;
            }
            out.mark = point.mark;
          }
          return out;
        },
      );
      if (!points) return null;
      if (value.matchId === undefined) {
        return { kind: "momentum", caption, points };
      }
      return isLabel(value.matchId)
        ? { kind: "momentum", caption, points, matchId: value.matchId }
        : null;
    }
    default:
      return null;
  }
}
