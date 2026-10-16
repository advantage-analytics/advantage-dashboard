/**
 * The answer cache: a question asked again over unchanged data gets the
 * answer it got before, without the model.
 *
 * The starters (`starters.ts`) make the same question recur, and nothing
 * about its answer moves until the data does. So the route keys a question
 * by its normalised text, its tag ids and its scope, versions it by
 * `ask_data_version()` — a hash over the viewer's matches in scope and when
 * their statistics were last written — and, on a hit under a day old,
 * replays the events it streamed last time and saves the same answer into
 * the conversation it is asked in now. A hit reserves no question: nothing
 * was computed. A miss runs as before, and the finished answer is put away
 * for next time.
 *
 * Two wrappers around the stream, both pure apart from the database calls
 * they make through `db` (as the signed-in user, never the service role):
 * `replayCachedAnswer()` for a hit, `captureAskAnswer()` for a miss. The
 * route composes them; `askQuestion()` is untouched.
 */

import { createHash } from "node:crypto";

import type {
  AskDatabase,
  AskQuestionInput,
  AskRpcResult,
} from "@/lib/services/ask/ask";
import type { AskEvent } from "@/lib/services/ask/events";
import type { AskRunRecord } from "@/lib/services/ask/runs";
import type { AskScope } from "@/lib/services/ask/scope";
import type { AskResolvedTags } from "@/lib/services/ask/tags";

/** What a cache row holds: the events to replay, and the answer as it was saved. */
export interface AskCachedAnswer {
  events: AskEvent[];
  /** The `p_answer` jsonb `ask_save_exchange_ids()` was handed; saved again on a replay. */
  answer: unknown;
}

/**
 * The key of a question in a scope: its text with case and whitespace
 * folded, the ids of its tags in a fixed order, and the scope. A hash, so
 * the text itself is never a column.
 */
export function askCacheKey(input: {
  question: string;
  tags: AskResolvedTags;
  scope: AskScope;
}): string {
  const text = input.question.toLowerCase().replace(/\s+/g, " ").trim();
  const tags = [...input.tags.matchIds].sort().join(",");
  const scope =
    input.scope.kind === "team" ? `team:${input.scope.programId}` : "personal";
  return createHash("sha256")
    .update(`${scope}\n${tags}\n${text}`)
    .digest("hex");
}

/** The version the signed-in user's data is at in a scope, or null when it cannot be read. */
export async function readAskDataVersion(
  db: AskDatabase,
  scope: AskScope,
): Promise<string | null> {
  const result = await db.rpc("ask_data_version", {
    p_program_id: scope.kind === "team" ? scope.programId : null,
  });
  return typeof result.data === "string" && result.data !== ""
    ? result.data
    : null;
}

/** The cached answer for a key and version, or null on a miss or a read failure. */
export async function readAskCache(
  db: AskDatabase,
  input: { key: string; version: string; scope: AskScope },
): Promise<AskCachedAnswer | null> {
  const result = await db.rpc("ask_cache_get", {
    p_cache_key: input.key,
    p_data_version: input.version,
    p_program_id: input.scope.kind === "team" ? input.scope.programId : null,
  });
  if (result.error) {
    console.warn("[ask] could not read the answer cache", {
      sqlstate: result.error.code,
    });
    return null;
  }
  return readCachedAnswer(result.data);
}

/** The payload as stored, or null for anything that is not one. */
export function readCachedAnswer(data: unknown): AskCachedAnswer | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { events?: unknown; answer?: unknown };
  if (!Array.isArray(record.events) || record.answer === undefined) {
    return null;
  }
  const events = record.events.filter(
    (event): event is AskEvent =>
      !!event &&
      typeof event === "object" &&
      typeof (event as { type?: unknown }).type === "string",
  );
  if (!events.some((event) => event.type === "headline")) return null;
  return { events, answer: record.answer };
}

/** The event types a replay carries, in the order the page expects them. */
const REPLAYED: ReadonlySet<AskEvent["type"]> = new Set([
  "sources",
  "headline",
  "figure",
  "visual",
  "text",
  "notice",
]);

/**
 * A hit: the saved answer, saved again into this conversation and streamed
 * back as it was. No reservation, no model, no query — only the save, the
 * month's count for the `done` event, and the run record.
 */
export async function* replayCachedAnswer(input: {
  db: AskDatabase;
  cached: AskCachedAnswer;
  question: string;
  tags: AskResolvedTags;
  conversationId: string | null;
  scope: AskScope;
  onRun?: (run: AskRunRecord) => Promise<void> | void;
  now?: () => number;
}): AsyncGenerator<AskEvent, void, undefined> {
  const now = input.now ?? Date.now;
  const started = now();
  const { db, cached, scope } = input;
  let outcome: AskRunRecord["outcome"] = "abandoned";
  let conversationId = input.conversationId;
  let matchCount: number | null = null;
  let visualKind: string | null = null;
  let asksForAdvice = false;

  try {
    const saved = await db.rpc("ask_save_exchange_ids", {
      p_conversation_id: input.conversationId,
      p_question: { text: input.question, tags: input.tags.saved },
      p_answer: cached.answer,
      ...(scope.kind === "team" ? { p_program_id: scope.programId } : {}),
    });
    const ids = savedIds(saved);
    if (saved.error || ids === null) {
      console.error("[ask] could not save a replayed answer", {
        sqlstate: saved.error?.code,
        error: saved.error?.message ?? "ask_save_exchange_ids() answered no id",
      });
      outcome = "answer_failed";
      yield {
        type: "error",
        code: "answer_failed",
        error: "The answer couldn't be saved. Ask the question again.",
      };
      return;
    }
    conversationId = ids.conversationId;

    for (const event of cached.events) {
      if (!REPLAYED.has(event.type)) continue;
      if (event.type === "sources") matchCount = event.matches.length;
      if (event.type === "visual") visualKind = event.visual.kind;
      if (event.type === "notice" && event.notice === "no_advice") {
        asksForAdvice = true;
      }
      yield event;
    }

    const quota = await db.rpc("ask_quota");
    const row = (quota.data ?? {}) as { used?: unknown; cap?: unknown };
    outcome = "done";
    yield {
      type: "done",
      conversationId: ids.conversationId,
      ...(ids.answerId !== null ? { answerId: ids.answerId } : {}),
      used: typeof row.used === "number" ? row.used : 0,
      cap: typeof row.cap === "number" ? row.cap : row.cap === null ? null : 20,
    };
  } finally {
    const ended = now();
    try {
      await input.onRun?.({
        question: input.question,
        programId: scope.kind === "team" ? scope.programId : null,
        conversationId,
        outcome,
        route: "cache",
        planAttempts: 0,
        modelCalls: 0,
        queryCount: 0,
        preStreamMs: null,
        planMs: null,
        queryMs: null,
        answerMs: null,
        toHeadlineMs: ended - started,
        totalMs: ended - started,
        visualKind,
        rowCount: null,
        matchCount,
        asksForAdvice,
        planModel: null,
        answerModel: null,
        mock: false,
      });
    } catch (error) {
      console.error("[ask] could not record the run", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function savedIds(
  saved: AskRpcResult,
): { conversationId: string; answerId: string | null } | null {
  const record = saved.data as {
    conversation_id?: unknown;
    answer_id?: unknown;
  } | null;
  if (!record || typeof record.conversation_id !== "string") return null;
  return {
    conversationId: record.conversation_id,
    answerId: typeof record.answer_id === "string" ? record.answer_id : null,
  };
}

/**
 * A miss: the stream as it is, with the answer put away once it is done. The
 * save's own arguments are what is kept — the wrapper watches `db` for the
 * `ask_save_exchange_ids` call — so a replay saves exactly what was saved.
 * Mock answers and answers that did not reach `done` are never kept.
 */
export function captureAskAnswer(
  input: AskQuestionInput,
  run: (input: AskQuestionInput) => AsyncGenerator<AskEvent, void, undefined>,
  options: { key: string; version: string },
): AsyncGenerator<AskEvent, void, undefined> {
  const { db, scope } = input;
  let answer: unknown = undefined;
  const watched: AskDatabase = {
    rpc: (fn, args) => {
      if (fn === "ask_save_exchange_ids") answer = args?.p_answer;
      return db.rpc(fn, args);
    },
  };

  async function* captured(): AsyncGenerator<AskEvent, void, undefined> {
    const events: AskEvent[] = [];
    let done = false;
    for await (const event of run({ ...input, db: watched })) {
      if (REPLAYED.has(event.type)) events.push(event);
      if (event.type === "done") done = true;
      yield event;
    }
    if (!done || !input.model.configured || answer === undefined) return;
    // The text came as sentences; one delta replays faster and the same.
    const text = events
      .filter((event) => event.type === "text")
      .map((event) => (event as { delta: string }).delta)
      .join("");
    const payload: AskCachedAnswer = {
      events: [
        ...events.filter((event) => event.type !== "text"),
        ...(text ? [{ type: "text" as const, delta: text }] : []),
      ],
      answer,
    };
    const put = await db.rpc("ask_cache_put", {
      p_cache_key: options.key,
      p_data_version: options.version,
      p_payload: payload,
      p_program_id: scope.kind === "team" ? scope.programId : null,
    });
    if (put.error) {
      console.warn("[ask] could not store the answer in the cache", {
        sqlstate: put.error.code,
      });
    }
  }
  return captured();
}
