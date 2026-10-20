/**
 * One record per Ask question, whatever became of it: the run.
 *
 * `askQuestion()` has a dozen ways to end — an answer, a refusal, a query
 * the database would not run, a provider outage, a tab closed mid-stream —
 * and until now only the first left a trace (`ask_messages`). This module
 * wraps the generator without touching it: it counts the model calls and
 * queries by wrapping `model` and `db`, reads the stages, headline, visual,
 * sources and outcome off the events as they pass, and hands the finished
 * record to the route's `onRun` once, in a `finally`, so an abandoned stream
 * is recorded too. The route writes it to `ask_runs` (as the asker, through
 * `ask_record_run()`) and sends the same shape minus the question's text to
 * PostHog as the product event `ask_run`.
 *
 * Pure apart from the clock: no database, no network, no Next.js.
 */

import { askQuestion, type AskQuestionInput } from "@/lib/services/ask/ask";
import type { AskDatabase, AskModel } from "@/lib/services/ask/ask";
import { ASK_COMPARE_KINDS, compareSql } from "@/lib/services/ask/compare";
import type { AskErrorCode, AskEvent } from "@/lib/services/ask/events";
import { isWinningPlaysSql, losingPlaysSql } from "@/lib/services/ask/plays";
import { ASK_REVIEW_SQL } from "@/lib/services/ask/review";
import type { AskScope } from "@/lib/services/ask/scope";
import { servePlusOneRequestOfSql } from "@/lib/services/ask/serve-plus-one";

/** How the question ended: `done`, one of the stream's error codes, or abandoned by the reader. */
export type AskRunOutcome = "done" | AskErrorCode | "abandoned";

/**
 * Which path wrote the answer. `model`: the planner's own query and the
 * answer model's prose. `server_written`: the planner's query, but prose the
 * server wrote (a pair-shaped result, two groups, a list, a trend). The rest
 * are the server's fixed queries, and `mock` is mock mode.
 */
export type AskRunRoute =
  | "model"
  | "server_written"
  | "review"
  | "compare"
  | "plays"
  | "serve_plus_one"
  | "pattern"
  | "mock"
  /** A hit in the answer cache: nothing was computed. */
  | "cache";

export interface AskRunRecord {
  question: string;
  programId: string | null;
  conversationId: string | null;
  outcome: AskRunOutcome;
  route: AskRunRoute | null;
  planAttempts: number;
  modelCalls: number;
  queryCount: number;
  /** The route's own time before the stream opened, when it passed it. */
  preStreamMs: number | null;
  /** From the start to the first query — the planner's share, retries included. */
  planMs: number | null;
  /** Time spent inside the query functions, summed. */
  queryMs: number | null;
  /** From "writing" to the end. */
  answerMs: number | null;
  /** From the start to the headline event. */
  toHeadlineMs: number | null;
  totalMs: number;
  visualKind: string | null;
  rowCount: number | null;
  matchCount: number | null;
  asksForAdvice: boolean;
  planModel: string | null;
  answerModel: string | null;
  mock: boolean;
}

export interface AskRunOptions {
  /** Called once, after the stream ended however it ended. Errors are logged, never thrown. */
  onRun: (run: AskRunRecord) => Promise<void> | void;
  preStreamMs?: number;
  /** The model each stage runs on, as the adapter resolves it (`askStageModels()`); null in mock mode. */
  planModel?: string | null;
  answerModel?: string | null;
  /** The clock, for tests. */
  now?: () => number;
}

/** The route of a question, from the final query's text and which model calls were made. */
export function askRunRoute(input: {
  configured: boolean;
  sql: string | null;
  team: boolean;
  patternRead: boolean;
  answerWritten: boolean;
}): AskRunRoute | null {
  if (!input.configured) return "mock";
  if (input.sql === null) return null;
  if (input.sql === ASK_REVIEW_SQL) return "review";
  if (
    ASK_COMPARE_KINDS.some((kind) => compareSql(kind, input.team) === input.sql)
  ) {
    return "compare";
  }
  if (servePlusOneRequestOfSql(input.sql) !== null) return "serve_plus_one";
  if (
    isWinningPlaysSql(input.sql) ||
    (["mine", "opponent"] as const).some(
      (subject) => losingPlaysSql(subject) === input.sql,
    )
  ) {
    return "plays";
  }
  if (input.patternRead) return "pattern";
  return input.answerWritten ? "model" : "server_written";
}

/**
 * `askQuestion()` with its run recorded. Yields exactly the events the
 * generator yields, in order; the record goes to `onRun` after the last one,
 * or after the reader stopped early.
 */
export async function* recordAskRun(
  input: AskQuestionInput,
  options: AskRunOptions,
): AsyncGenerator<AskEvent, void, undefined> {
  const now = options.now ?? Date.now;
  const started = now();
  const team = input.scope.kind === "team";

  let planAttempts = 0;
  let modelCalls = 0;
  let patternRead = false;
  let answerWritten = false;
  let queryCount = 0;
  let queryMs = 0;
  let firstQueryAt: number | null = null;
  let lastSql: string | null = null;
  let rowCount: number | null = null;

  const model: AskModel = {
    configured: input.model.configured,
    stream: (systemPrompt, messages, call) => {
      modelCalls += 1;
      if (call?.stage === "plan") planAttempts += 1;
      if (call?.stage === "pattern") patternRead = true;
      if (call?.stage === "answer") answerWritten = true;
      return input.model.stream(systemPrompt, messages, call);
    },
  };
  const db: AskDatabase = {
    rpc: async (fn, args) => {
      const isQuery = fn === "ask_run_query" || fn === "ask_run_team_query";
      const at = now();
      const result = await input.db.rpc(fn, args);
      if (isQuery) {
        queryCount += 1;
        queryMs += now() - at;
        firstQueryAt ??= at;
        lastSql = typeof args?.sql === "string" ? args.sql : null;
        const rows = (result.data as { rows?: unknown } | null)?.rows;
        if (Array.isArray(rows)) rowCount = rows.length;
      }
      return result;
    },
  };

  let outcome: AskRunOutcome = "abandoned";
  let conversationId: string | null = input.conversationId;
  let writingAt: number | null = null;
  let headlineAt: number | null = null;
  let visualKind: string | null = null;
  let matchCount: number | null = null;
  let asksForAdvice = false;

  try {
    for await (const event of askQuestion({ ...input, model, db })) {
      switch (event.type) {
        case "status":
          if (event.stage === "writing") writingAt ??= now();
          break;
        case "headline":
          headlineAt ??= now();
          break;
        case "visual":
          visualKind = event.visual.kind;
          break;
        case "sources":
          matchCount = event.matches.length;
          break;
        case "notice":
          // Both notices mean the question asked what to do: the second is
          // coach mode's answer to it (`coach.ts`).
          if (event.notice === "no_advice" || event.notice === "coach") {
            asksForAdvice = true;
          }
          break;
        case "error":
          outcome = event.code;
          break;
        case "done":
          outcome = "done";
          conversationId = event.conversationId;
          break;
        default:
          break;
      }
      yield event;
    }
  } finally {
    const ended = now();
    const run: AskRunRecord = {
      question: input.question,
      programId: input.scope.kind === "team" ? input.scope.programId : null,
      conversationId,
      outcome,
      route: askRunRoute({
        configured: input.model.configured,
        sql: lastSql,
        team,
        patternRead,
        answerWritten,
      }),
      planAttempts,
      modelCalls,
      queryCount,
      preStreamMs: options.preStreamMs ?? null,
      planMs: firstQueryAt === null ? null : firstQueryAt - started,
      queryMs: queryCount === 0 ? null : queryMs,
      answerMs: writingAt === null ? null : ended - writingAt,
      toHeadlineMs: headlineAt === null ? null : headlineAt - started,
      totalMs: ended - started,
      visualKind,
      rowCount,
      matchCount,
      asksForAdvice,
      planModel: options.planModel ?? null,
      answerModel: options.answerModel ?? null,
      mock: !input.model.configured,
    };
    try {
      await options.onRun(run);
    } catch (error) {
      console.error("[ask] could not record the run", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** The record as `ask_record_run(p_run)` takes it. */
export function askRunRow(run: AskRunRecord): Record<string, unknown> {
  return {
    question: run.question,
    program_id: run.programId,
    conversation_id: run.conversationId,
    outcome: run.outcome,
    route: run.route,
    plan_attempts: run.planAttempts,
    model_calls: run.modelCalls,
    query_count: run.queryCount,
    pre_stream_ms: run.preStreamMs,
    plan_ms: run.planMs,
    query_ms: run.queryMs,
    answer_ms: run.answerMs,
    to_headline_ms: run.toHeadlineMs,
    total_ms: run.totalMs,
    visual_kind: run.visualKind,
    row_count: run.rowCount,
    match_count: run.matchCount,
    asks_for_advice: run.asksForAdvice,
    plan_model: run.planModel,
    answer_model: run.answerModel,
    mock: run.mock,
  };
}

/**
 * The record as the PostHog event `ask_run` carries it: the same shape with
 * the question's text left out. Prompts and replies never reach PostHog
 * (the adapter's privacy mode), and neither does the question.
 */
export function askRunProperties(
  run: AskRunRecord,
  scope: AskScope,
): Record<string, string | number | boolean | null> {
  return {
    scope: scope.kind,
    program_id: run.programId,
    conversation_id: run.conversationId,
    outcome: run.outcome,
    route: run.route,
    plan_attempts: run.planAttempts,
    model_calls: run.modelCalls,
    query_count: run.queryCount,
    pre_stream_ms: run.preStreamMs,
    plan_ms: run.planMs,
    query_ms: run.queryMs,
    answer_ms: run.answerMs,
    to_headline_ms: run.toHeadlineMs,
    total_ms: run.totalMs,
    visual_kind: run.visualKind,
    row_count: run.rowCount,
    match_count: run.matchCount,
    asks_for_advice: run.asksForAdvice,
    plan_model: run.planModel,
    answer_model: run.answerModel,
    mock: run.mock,
    question_length: run.question.length,
  };
}
