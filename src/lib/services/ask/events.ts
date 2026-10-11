/**
 * The events `POST /api/ask` streams, one JSON object per line
 * (`application/x-ndjson`), and the client reads back (design "Route",
 * plan step 5).
 *
 * Shared by the route and by client components, so this file is types and
 * plain constants only: it imports nothing, and must never import anything
 * server-only (`next/server`, a node built-in, a Supabase client).
 */

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
  "cannot_answer" | "no_data" | "llm_unavailable" | "answer_failed";

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

/** One figure tile. `value` is already formatted for display. */
export interface AskFigureEvent {
  type: "figure";
  label: string;
  value: string;
}

/** The next piece of the evidence paragraphs; append `delta` to what came before. */
export interface AskTextEvent {
  type: "text";
  delta: string;
}

/** The matches the answer was computed from. */
export interface AskSourcesEvent {
  type: "sources";
  matches: AskSourceMatch[];
}

/** The answer is saved; `used` of `cap` questions are spent this month. */
export interface AskDoneEvent {
  type: "done";
  conversationId: string;
  used: number;
  cap: number;
}

/** The answer failed. `error` is the sentence to show, `code` the slug to branch on. */
export interface AskErrorEvent {
  type: "error";
  code: AskErrorCode;
  error: string;
}

export type AskEvent =
  | AskStatusEvent
  | AskHeadlineEvent
  | AskFigureEvent
  | AskTextEvent
  | AskSourcesEvent
  | AskDoneEvent
  | AskErrorEvent;

/** The subset the answer renderer produces from the model's text. */
export type AskAnswerEvent =
  AskHeadlineEvent | AskFigureEvent | AskTextEvent | AskErrorEvent;
