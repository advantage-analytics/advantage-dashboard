"use client";

/**
 * The Ask thread: what has been asked, what came back, and the answer that is
 * arriving now.
 *
 * `POST /api/ask` answers in one of two ways and this file reads both:
 *
 * - **a refusal**, before any stream — a JSON body `{ error, code?, detail? }`
 *   with a non-200 status (`errorResponse()`), where `error` is the sentence
 *   to show and `code` the slug to branch on;
 * - **a stream** — `application/x-ndjson`, one `AskEvent` per line
 *   (`src/lib/services/ask/events.ts`, written by `ndjsonStreamResponse()`).
 *
 * Everything that decides something is a pure function — the line reader, the
 * event check, the reducer, the saved-message reader and `streamAsk()` itself,
 * which takes its `fetch` as an argument — so `tests/ask-stream.spec.ts` pins
 * the behaviour with no browser and no server. `useAskStream()` at the foot is
 * the thin React wrapper: a reducer, an abort handle and nothing else.
 *
 * ── The composer's text lives here ──────────────────────────────────────────
 * `draft` is part of the thread state, not the composer's own, because a
 * failed question has to come back. Sending moves the draft into the thread;
 * a refusal or an `error` event puts it back, so nobody retypes a question
 * the product failed to answer. A draft the player has started since is left
 * alone — theirs wins over the restore.
 *
 * No import here may reach `next/navigation`: the composer, answer and rail
 * take their types from this file and are rendered by offline component
 * harnesses. The URL is the page shell's business (`ask-page.tsx`).
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ASK_STATUS_STAGES,
  type AskEvent,
  type AskSourceMatch,
  type AskStatusStage,
  type AskVisual,
  isRecord,
  readAskSourceMatch,
  readAskVisual,
} from "@/lib/services/ask/events";

// ── Shapes ──────────────────────────────────────────────────────────────────

/** `player` is the team page's alone: a program's player, by roster id. */
export type AskTagKind = "match" | "opponent" | "player";

const TAG_KIND_FALLBACK: Record<AskTagKind, string> = {
  match: "Match",
  opponent: "Opponent",
  player: "Player",
};

/**
 * One tagged match, opponent or player. `kind` and `id` are what the route is
 * sent and re-resolves against the matches the scope can read; `label` is
 * only ever drawn, never trusted by the server.
 */
export interface AskTag {
  kind: AskTagKind;
  id: string;
  label: string;
}

/** A question as the composer holds it and as the thread shows it. */
export interface AskQuestion {
  text: string;
  tags: AskTag[];
}

export const EMPTY_ASK_QUESTION: AskQuestion = { text: "", tags: [] };

export interface AskFigure {
  label: string;
  value: string;
}

/**
 * Why an answer is not there. `code` is an `AskErrorCode` from the stream, a
 * refusal's slug, or null when the failure was the connection's — typed as a
 * string so an unknown slug from a newer server still renders its sentence.
 */
export interface AskAnswerError {
  message: string;
  code: string | null;
  /** `needs_clarification`: the answers the asker can pick. */
  options?: string[];
}

export interface AskAnswerState {
  /** `streaming` while events arrive; `done` once saved; `error` on failure. */
  status: "streaming" | "done" | "error";
  /** The step the route last named. Null before the first one and when saved. */
  stage: AskStatusStage | null;
  headline: string | null;
  figures: AskFigure[];
  /** The answer's one visual block, resolved by the server. Null when it has none. */
  visual: AskVisual | null;
  /** The evidence paragraphs, as one string; blank lines separate them. */
  body: string;
  /**
   * The question asked what to do, which Ask does not answer: the footer says
   * so (`ASK_NO_ADVICE_SENTENCE`). False for answers saved before the notice
   * existed — those carry the sentence at the end of `body`, left as it is.
   */
  noAdvice: boolean;
  /** Null until the route says which matches it computed from. */
  sources: AskSourceMatch[] | null;
  error: AskAnswerError | null;
}

export interface AskExchange {
  /** A saved message's id, or a client id for one asked in this visit. */
  id: string;
  question: AskQuestion;
  answer: AskAnswerState;
}

/** A refusal before the stream opened: the body's sentence, its slug, the status. */
export interface AskRefusal {
  message: string;
  code: string | null;
  status: number;
}

export interface AskThreadState {
  /** Null until a first answer is saved. */
  conversationId: string | null;
  /** Oldest first. While `inFlight`, the last one is the answer arriving. */
  exchanges: AskExchange[];
  inFlight: boolean;
  /** What the composer holds. */
  draft: AskQuestion;
  /** The last question's refusal, until the next one is sent. */
  refusal: AskRefusal | null;
  /** The count from the last `done` (or a 429's detail); null until one arrives. */
  usage: { used: number; cap: number } | null;
}

export type AskThreadAction =
  | { type: "draft"; draft: AskQuestion }
  | { type: "asked"; id: string; question: AskQuestion }
  | { type: "event"; event: AskEvent }
  | { type: "refused"; refusal: AskRefusal; usage?: AskThreadState["usage"] }
  | { type: "interrupted"; message: string }
  | { type: "reset" };

// ── Reducer ─────────────────────────────────────────────────────────────────

export function emptyAskThread(
  seed: Pick<Partial<AskThreadState>, "conversationId" | "exchanges"> = {},
): AskThreadState {
  return {
    conversationId: seed.conversationId ?? null,
    exchanges: seed.exchanges ?? [],
    inFlight: false,
    draft: EMPTY_ASK_QUESTION,
    refusal: null,
    usage: null,
  };
}

function pendingAnswer(): AskAnswerState {
  return {
    status: "streaming",
    stage: null,
    headline: null,
    figures: [],
    visual: null,
    body: "",
    noAdvice: false,
    sources: null,
    error: null,
  };
}

function isBlank(question: AskQuestion): boolean {
  return question.text.trim() === "" && question.tags.length === 0;
}

/** The asked question back in the composer, unless a new one was started. */
function restoreDraft(state: AskThreadState, asked: AskQuestion): AskQuestion {
  return isBlank(state.draft) ? asked : state.draft;
}

function applyEvent(answer: AskAnswerState, event: AskEvent): AskAnswerState {
  switch (event.type) {
    case "status":
      return { ...answer, stage: event.stage };
    case "headline":
      return { ...answer, headline: event.text };
    case "figure":
      return {
        ...answer,
        figures: [
          ...answer.figures,
          { label: event.label, value: event.value },
        ],
      };
    case "text":
      return { ...answer, body: answer.body + event.delta };
    case "visual":
      // One block per answer (`MAX_ASK_VISUALS`): were a second ever sent, the
      // first stands. Its place in the answer is the layout's, not the order
      // the events came in — a figure may still arrive after it.
      return answer.visual ? answer : { ...answer, visual: event.visual };
    case "notice":
      return event.notice === "no_advice"
        ? { ...answer, noAdvice: true }
        : answer;
    case "sources":
      return { ...answer, sources: event.matches };
    case "done":
      return { ...answer, status: "done", stage: null };
    case "error":
      return {
        ...answer,
        status: "error",
        stage: null,
        error: {
          message: event.error,
          code: event.code,
          ...(event.options ? { options: event.options } : {}),
        },
      };
  }
}

export function askThreadReducer(
  state: AskThreadState,
  action: AskThreadAction,
): AskThreadState {
  switch (action.type) {
    case "draft":
      return { ...state, draft: action.draft };

    case "asked":
      // One question at a time; a second send while one is in flight is a
      // double submit, not a second question.
      if (state.inFlight) return state;
      return {
        ...state,
        exchanges: [
          ...state.exchanges,
          { id: action.id, question: action.question, answer: pendingAnswer() },
        ],
        inFlight: true,
        draft: EMPTY_ASK_QUESTION,
        refusal: null,
      };

    case "event": {
      const current = state.exchanges.at(-1);
      // A late line after the stream was abandoned has nothing to land in.
      if (!state.inFlight || !current) return state;

      const { event } = action;
      const exchanges = [
        ...state.exchanges.slice(0, -1),
        { ...current, answer: applyEvent(current.answer, event) },
      ];

      if (event.type === "done") {
        return {
          ...state,
          exchanges,
          inFlight: false,
          conversationId: event.conversationId,
          usage: { used: event.used, cap: event.cap },
        };
      }
      if (event.type === "error") {
        // The failed exchange stays in the thread, carrying its error for the
        // answer to explain, and the question goes back to the composer.
        return {
          ...state,
          exchanges,
          inFlight: false,
          draft: restoreDraft(state, current.question),
        };
      }
      return { ...state, exchanges };
    }

    case "refused": {
      const current = state.exchanges.at(-1);
      if (!state.inFlight || !current) return state;
      // Nothing was answered and nothing was saved, so the optimistic row
      // comes out of the thread rather than standing there with no answer.
      return {
        ...state,
        exchanges: state.exchanges.slice(0, -1),
        inFlight: false,
        draft: restoreDraft(state, current.question),
        refusal: action.refusal,
        usage: action.usage ?? state.usage,
      };
    }

    case "interrupted": {
      const current = state.exchanges.at(-1);
      if (!state.inFlight || !current) return state;
      return {
        ...state,
        exchanges: [
          ...state.exchanges.slice(0, -1),
          {
            ...current,
            answer: {
              ...current.answer,
              status: "error",
              stage: null,
              error: { message: action.message, code: null },
            },
          },
        ],
        inFlight: false,
        draft: restoreDraft(state, current.question),
      };
    }

    case "reset":
      // "New question". The count is the account's, not the conversation's.
      return { ...emptyAskThread(), usage: state.usage };
  }
}

// ── Reading the wire ────────────────────────────────────────────────────────

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readSourceMatches(value: unknown): AskSourceMatch[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((row) => readAskSourceMatch(row) ?? []);
}

/**
 * One line of the stream as an `AskEvent`, or null for anything that is not
 * one — a blank line, broken JSON, an event type this build does not know, or
 * a known type missing a field it needs. Unknown is skipped rather than
 * thrown on, so a newer route can add an event without breaking an open tab.
 */
export function parseAskEvent(line: string): AskEvent | null {
  const text = line.trim();
  if (text === "") return null;

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "status":
      return (ASK_STATUS_STAGES as readonly unknown[]).includes(value.stage)
        ? { type: "status", stage: value.stage as AskStatusStage }
        : null;
    case "headline":
      return typeof value.text === "string"
        ? { type: "headline", text: value.text }
        : null;
    case "figure":
      return typeof value.label === "string" && typeof value.value === "string"
        ? { type: "figure", label: value.label, value: value.value }
        : null;
    case "text":
      return typeof value.delta === "string"
        ? { type: "text", delta: value.delta }
        : null;
    case "visual": {
      // A block that does not read back whole is not drawn in part: the line
      // is skipped and the answer goes on without it.
      const visual = readAskVisual(value.visual);
      return visual ? { type: "visual", visual } : null;
    }
    case "notice":
      return value.notice === "no_advice"
        ? { type: "notice", notice: "no_advice" }
        : null;
    case "sources": {
      const matches = readSourceMatches(value.matches);
      return matches ? { type: "sources", matches } : null;
    }
    case "done":
      return typeof value.conversationId === "string" &&
        typeof value.used === "number" &&
        typeof value.cap === "number"
        ? {
            type: "done",
            conversationId: value.conversationId,
            used: value.used,
            cap: value.cap,
          }
        : null;
    case "error":
      return typeof value.error === "string" && typeof value.code === "string"
        ? {
            type: "error",
            // The slug is kept as sent; the union is the route's promise, and
            // a slug outside it still renders its sentence.
            code: value.code as Extract<AskEvent, { type: "error" }>["code"],
            error: value.error,
            ...(Array.isArray(value.options) &&
            value.options.length > 0 &&
            value.options.every((o) => typeof o === "string")
              ? { options: value.options as string[] }
              : {}),
          }
        : null;
    default:
      return null;
  }
}

/**
 * The events of an NDJSON body, in order.
 *
 * A network chunk is not a line: one event can arrive in three pieces and
 * three events in one, and a chunk can end halfway through a multi-byte
 * character. Bytes are decoded as a stream (`{ stream: true }` holds a split
 * character back) and text is held until its `\n` arrives; whatever is left
 * when the body ends is read as a last line, for a server that did not
 * terminate it.
 */
export async function* readAskEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AskEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffered += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      let newline = buffered.indexOf("\n");
      while (newline !== -1) {
        const event = parseAskEvent(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
        if (event) yield event;
        newline = buffered.indexOf("\n");
      }

      if (done) {
        const last = parseAskEvent(buffered);
        if (last) yield last;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Shown when a refusal's body cannot be read — never a blank notice. */
export const ASK_REFUSAL_FALLBACK =
  "That question could not be sent. Try again.";

/** Shown when the connection drops or the stream ends without an answer. */
export const ASK_INTERRUPTED_MESSAGE =
  "The answer was interrupted before it finished. Try again.";

/**
 * A non-200 response as the refusal it carries: the body's `error` sentence
 * and `code`. A body that is not the `{ error, code? }` shape — a proxy's
 * HTML error page, say — falls back to a fixed sentence and a null code.
 */
export async function readAskRefusal(response: Response): Promise<{
  refusal: AskRefusal;
  usage: AskThreadState["usage"];
}> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON; the fallback below is the answer.
  }
  const record = isRecord(body) ? body : {};
  // `ask_limit_reached` carries the count in `detail` where the route is
  // allowed to show it; when it does, the meter can say why.
  const detail = isRecord(record.detail) ? record.detail : null;

  return {
    refusal: {
      message:
        typeof record.error === "string" && record.error.trim() !== ""
          ? record.error
          : ASK_REFUSAL_FALLBACK,
      code: stringOrNull(record.code),
      status: response.status,
    },
    usage:
      detail &&
      typeof detail.used === "number" &&
      typeof detail.cap === "number"
        ? { used: detail.used, cap: detail.cap }
        : null,
  };
}

/** How one question ended. `done` is the only one that saved anything. */
export type AskOutcome =
  | { status: "done"; conversationId: string }
  | { status: "error" }
  | { status: "refused" }
  | { status: "interrupted" }
  | { status: "aborted" };

export interface AskRequest {
  /** Omitted for the first question of a conversation. */
  conversationId: string | null;
  question: AskQuestion;
  /**
   * The program a team question is about (`askScopeProgramId(scope)`); null
   * or absent on the personal page. The route re-checks membership — this
   * only says which of the asker's scopes the page was.
   */
  programId?: string | null;
}

/**
 * The request body `POST /api/ask` reads: tags go as `kind` and `id` only.
 *
 * `programId` is sent for a team question and left out of a personal one
 * altogether — not sent as null — so the personal page's request is the same
 * bytes it was before team scope existed.
 */
export function askRequestBody(request: AskRequest) {
  return {
    ...(request.conversationId
      ? { conversationId: request.conversationId }
      : {}),
    ...(request.programId ? { programId: request.programId } : {}),
    question: request.question.text.trim(),
    tags: request.question.tags.map(({ kind, id }) => ({ kind, id })),
  };
}

/**
 * Send one question and report what happens as thread actions.
 *
 * It dispatches everything after `asked` — the caller has already put the
 * question in the thread — and always ends the flight exactly once: a `done`
 * or `error` event, a refusal, or an interruption. An abort ends it silently,
 * because whoever aborted has already moved the thread on.
 */
export async function streamAsk(
  request: AskRequest,
  dispatch: (action: AskThreadAction) => void,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<AskOutcome> {
  const send = options.fetch ?? fetch;
  const aborted = () => options.signal?.aborted === true;

  try {
    const response = await send("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(askRequestBody(request)),
      signal: options.signal,
    });

    if (response.status !== 200) {
      const { refusal, usage } = await readAskRefusal(response);
      if (aborted()) return { status: "aborted" };
      dispatch({ type: "refused", refusal, ...(usage ? { usage } : {}) });
      return { status: "refused" };
    }

    if (response.body) {
      for await (const event of readAskEvents(response.body)) {
        if (aborted()) return { status: "aborted" };
        dispatch({ type: "event", event });
        if (event.type === "done") {
          return { status: "done", conversationId: event.conversationId };
        }
        if (event.type === "error") return { status: "error" };
      }
    }
  } catch {
    if (aborted()) return { status: "aborted" };
  }

  if (aborted()) return { status: "aborted" };
  // The body ended, or the connection did, with neither `done` nor `error`.
  dispatch({ type: "interrupted", message: ASK_INTERRUPTED_MESSAGE });
  return { status: "interrupted" };
}

// ── Reading a saved conversation ────────────────────────────────────────────

function readTags(value: unknown): AskTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tag): AskTag[] => {
    if (!isRecord(tag) || typeof tag.id !== "string") return [];
    if (typeof tag.kind !== "string") return [];
    if (!Object.hasOwn(TAG_KIND_FALLBACK, tag.kind)) return [];
    const kind = tag.kind as AskTagKind;
    const label = stringOrNull(tag.label)?.trim();
    // A tag saved without a label is still a tag; it is named by its kind.
    return [{ kind, id: tag.id, label: label || TAG_KIND_FALLBACK[kind] }];
  });
}

function readFigures(value: unknown): AskFigure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((figure): AskFigure[] =>
    isRecord(figure) &&
    typeof figure.label === "string" &&
    typeof figure.value === "string"
      ? [{ label: figure.label, value: figure.value }]
      : [],
  );
}

/** A saved question: its text and tags. Anything else in the row is ignored. */
export function readSavedQuestion(content: unknown): AskQuestion {
  if (typeof content === "string") return { text: content, tags: [] };
  if (!isRecord(content)) return EMPTY_ASK_QUESTION;
  return {
    text: stringOrNull(content.text) ?? "",
    tags: readTags(content.tags),
  };
}

/**
 * A saved answer: headline, figures, visual block, body and sources, each
 * optional.
 *
 * The row is opaque jsonb the database does not validate, so every field is
 * read defensively and a missing one is simply absent. The saved SQL is in
 * the same row and is deliberately not read — it is the audit trail, not
 * something a player is shown.
 */
export function readSavedAnswer(content: unknown): AskAnswerState {
  const record = isRecord(content) ? content : {};
  const sources = Array.isArray(record.sources)
    ? record.sources
    : isRecord(record.sources)
      ? record.sources.matches
      : null;
  return {
    status: "done",
    stage: null,
    headline: stringOrNull(record.headline),
    figures: readFigures(record.figures),
    // A block that no longer reads back whole is left out, not half drawn.
    visual: readAskVisual(record.visual),
    // The body is shown as saved: an answer from before the notice existed
    // has the sentence in it, and nothing here strips or adds one.
    body: stringOrNull(record.body) ?? "",
    noAdvice: record.noAdvice === true,
    sources: readSourceMatches(sources),
    error: null,
  };
}

const NO_SAVED_ANSWER: AskAnswerState = {
  status: "done",
  stage: null,
  headline: null,
  figures: [],
  visual: null,
  body: "",
  noAdvice: false,
  sources: null,
  error: null,
};

/** The minimum of `AskConversationMessage` this file needs. */
export interface SavedAskMessage {
  id: string;
  role: "user" | "assistant";
  content: unknown;
}

/**
 * Saved messages, oldest first, as exchanges. Each question takes the answer
 * that follows it; an answer with no question before it is dropped, since
 * there is nothing to show it under.
 */
export function exchangesFromMessages(
  messages: readonly SavedAskMessage[],
): AskExchange[] {
  const exchanges: AskExchange[] = [];
  let open: AskExchange | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      open = {
        id: message.id,
        question: readSavedQuestion(message.content),
        answer: NO_SAVED_ANSWER,
      };
      exchanges.push(open);
    } else if (open) {
      open.answer = readSavedAnswer(message.content);
      open = null;
    }
  }
  return exchanges;
}

// ── The hook ────────────────────────────────────────────────────────────────

let nextExchange = 0;

export interface AskStream {
  state: AskThreadState;
  /** The composer's `onChange`. */
  setDraft: (draft: AskQuestion) => void;
  /**
   * Send the draft. Resolves with how it ended, or null when there was
   * nothing to send (an empty question, or one already in flight).
   */
  ask: (question?: AskQuestion) => Promise<AskOutcome | null>;
  /** Abandon the thread and whatever is in flight. */
  reset: () => void;
}

export function useAskStream(initial: {
  conversationId: string | null;
  messages: readonly SavedAskMessage[];
  /** The team page's program; null or absent on the personal page. */
  programId?: string | null;
}): AskStream {
  const [state, dispatch] = useReducer(askThreadReducer, initial, (seed) =>
    emptyAskThread({
      conversationId: seed.conversationId,
      exchanges: exchangesFromMessages(seed.messages),
    }),
  );
  const flight = useRef<AbortController | null>(null);
  // The scope is the page's and never changes under a mounted thread.
  const programId = initial.programId ?? null;

  // A stream left open by a closed page would keep reading into nothing.
  useEffect(() => () => flight.current?.abort(), []);

  const setDraft = useCallback(
    (draft: AskQuestion) => dispatch({ type: "draft", draft }),
    [],
  );

  const { conversationId, draft, inFlight } = state;
  // `question` sends that instead of the draft: a clarifying choice is the
  // earlier question with its answer attached, not what the composer holds.
  const ask = useCallback(
    async (question: AskQuestion = draft) => {
      if (inFlight || question.text.trim() === "") return null;

      const controller = new AbortController();
      flight.current = controller;
      nextExchange += 1;
      dispatch({ type: "asked", id: `asked-${nextExchange}`, question });

      return streamAsk({ conversationId, question, programId }, dispatch, {
        signal: controller.signal,
      });
    },
    [conversationId, draft, inFlight, programId],
  );

  const reset = useCallback(() => {
    flight.current?.abort();
    flight.current = null;
    dispatch({ type: "reset" });
  }, []);

  return { state, setDraft, ask, reset };
}
