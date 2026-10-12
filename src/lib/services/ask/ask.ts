import type { ChatMessage } from "@/lib/llm/adapter";
import {
  ASK_ANSWER_FAILED_MESSAGE,
  type AskAnswerResult,
  type AskRow,
  renderAskAnswer,
} from "@/lib/services/ask/answer-render";
import type {
  AskErrorCode,
  AskEvent,
  AskSourceMatch,
  AskVisual,
} from "@/lib/services/ask/events";
import { ASK_MOCK_PLAN, mockAskAnswerStream } from "@/lib/services/ask/mock";
import {
  ASK_SCOPE_COUNT_COLUMN,
  type AskPlanQuery,
  type AskPlanReply,
  type AskPromptTurn,
  buildAnswerPrompt,
  buildPlanPrompt,
} from "@/lib/services/ask/prompts";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import type { AskResolvedTags } from "@/lib/services/ask/tags";

/**
 * One Ask question, from reservation to saved answer (design "Architecture",
 * "Data flow for one question", "Error handling"; plan step 7). This is the
 * logic; `POST /api/ask` is the HTTP shell around it.
 *
 * Everything with a side effect is an argument — the caller's Supabase
 * client, the model, the clock — so `tests/ask-orchestration.spec.ts` runs
 * every path with all three faked. No `Request`, no `next/headers`, no
 * module-level client, and never the service-role client: every database
 * call below is an `.rpc()` on the cookie-authenticated client, so the
 * functions' own `auth.uid()` checks decide whose rows are touched.
 *
 * Two steps, because the limit must be refused before the stream opens:
 *
 *   1. `reserveAskQuestion()` spends one question, or says why it cannot.
 *      The route turns `ask_limit_reached` into a 429 and anything else into
 *      a 500 before it answers with a stream.
 *   2. `askQuestion()` is an async generator of `AskEvent`s:
 *      `status: planning` → plan → guard → `status: querying` →
 *      `ask_run_query` → `status: writing` → the rendered answer (headline,
 *      figures, visual, text) → `notice` when advice was asked → save →
 *      `sources` → `done`.
 *
 * "An answer the player received always costs one question; nothing else
 * does." So every path that ends in an `error` event releases the
 * reservation, and a stream the consumer abandons before `done` releases it
 * too; only a saved answer keeps it. Mock mode — no provider configured —
 * reserves nothing, plans with `ASK_MOCK_PLAN` and answers with the mock
 * template; the query and the renderer still run for real.
 *
 * Privacy: nothing here logs the question, a tag name, a row, a label or the
 * model's prose. Players may be minors (`adapter.ts`). The two log lines are
 * the count of digits the renderer dropped and the count and reasons of
 * visual blocks it dropped, so prompt drift stays visible.
 */

// ── What the caller hands in ─────────────────────────────────────────────────

/** The one call this module makes on the Supabase client. */
export interface AskRpcResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface AskDatabase {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<AskRpcResult>;
}

/**
 * The model behind both steps. `configured` is `isLLMConfigured()` and
 * `stream` is `getLLMStream()` with the observability context already bound;
 * the route builds this from `adapter.ts`, the spec from strings.
 */
export interface AskModel {
  configured: boolean;
  stream(
    systemPrompt: string,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<string>>;
}

/** One spent question, as `ask_reserve_question()` returned it. */
export interface AskReservation {
  usageId: string;
  used: number;
  cap: number;
  /** `YYYY-MM-DD`. */
  resetsOn: string;
}

export type AskReserveResult =
  /** Reserved — or, in mock mode, nothing to reserve. */
  | { ok: true; reservation: AskReservation | null }
  /** The month's questions are spent. `detail` is what the 429 carries. */
  | {
      ok: false;
      code: "ask_limit_reached";
      detail: { used: number; cap: number; resets_on: string } | null;
    }
  /** The function failed or answered an unexpected shape. */
  | { ok: false; code: "reserve_failed"; message: string };

export interface AskQuestionInput {
  db: AskDatabase;
  model: AskModel;
  /** The route's clock; "today" in the plan prompt comes from it. */
  now: () => Date;
  /** The player's question, as typed and already bounded by the route. */
  question: string;
  /** From `resolveAskTags()`. */
  tags: AskResolvedTags;
  /** Earlier turns of the conversation, oldest first; empty for a new one. */
  conversation: readonly AskPromptTurn[];
  /** The conversation to append to, or null to start one. */
  conversationId: string | null;
  /** From `reserveAskQuestion()`; null in mock mode. */
  reservation: AskReservation | null;
}

// ── Sentences the error events carry ─────────────────────────────────────────

export const ASK_CANNOT_ANSWER_MESSAGE = "Your match data can't answer that.";
export const ASK_NO_DATA_MESSAGE =
  "None of your matches fit that question, so there was nothing to compute.";
export const ASK_LLM_UNAVAILABLE_MESSAGE =
  "Ask is unavailable right now. Your question is still in the composer.";
export const ASK_SAVE_FAILED_MESSAGE =
  "That answer could not be saved. Ask the question again.";

/** The user message the answer step gets; the question itself is data in the prompt. */
export const ASK_ANSWER_USER_MESSAGE = "Write the answer now.";

/** A planner's `cannot_answer` sentence longer than this is cut: it is one sentence by contract. */
const MAX_CANNOT_ANSWER_LENGTH = 300;

/** Stable prefixes for the log lines this module writes. */
export const ASK_DROPPED_DIGITS_LOG = "[ask] renderer dropped typed digits";
export const ASK_DROPPED_VISUALS_LOG = "[ask] renderer dropped visual blocks";

// ── Reserve ──────────────────────────────────────────────────────────────────

const LIMIT_MESSAGE = /^ask_limit_reached/;

/**
 * Spend one question for the caller, before the stream opens. In mock mode
 * (`model.configured` false) nothing is spent and nothing is called: a
 * sample answer is not a question.
 */
export async function reserveAskQuestion(
  db: AskDatabase,
  model: Pick<AskModel, "configured">,
): Promise<AskReserveResult> {
  if (!model.configured) return { ok: true, reservation: null };

  const { data, error } = await rpc(db, "ask_reserve_question");
  if (error) {
    if (error.code === "54000" && LIMIT_MESSAGE.test(error.message)) {
      return {
        ok: false,
        code: "ask_limit_reached",
        detail: readLimitDetail(error.message),
      };
    }
    return { ok: false, code: "reserve_failed", message: error.message };
  }

  const row = asRecord(data);
  if (
    typeof row?.usage_id !== "string" ||
    typeof row.used !== "number" ||
    typeof row.cap !== "number" ||
    typeof row.resets_on !== "string"
  ) {
    return {
      ok: false,
      code: "reserve_failed",
      message: "ask_reserve_question() answered an unexpected shape",
    };
  }
  return {
    ok: true,
    reservation: {
      usageId: row.usage_id,
      used: row.used,
      cap: row.cap,
      resetsOn: row.resets_on,
    },
  };
}

/** `ask_limit_reached: 20 questions this month, resets on 2026-11-01` → the 429's detail. */
function readLimitDetail(message: string) {
  const match =
    /(\d+) questions this month, resets on (\d{4}-\d{2}-\d{2})/.exec(message);
  if (!match) return null;
  const cap = Number(match[1]);
  return { used: cap, cap, resets_on: match[2] };
}

// ── The question ─────────────────────────────────────────────────────────────

/** Why a plan could not be used, told back to the planner once. */
type PlanProblem = {
  kind: "unparseable" | "guard" | "database" | "range";
  detail: string;
};

/**
 * The one column this module adds to every result row
 * (`ASK_SCOPE_COUNT_COLUMN`, defined beside the prompts that name it): how
 * many matches `scope_sql` selected, read from the `matches` list
 * `ask_run_query` returns. It is the only number in the answer that says how
 * many matches it covers — the baseline run had the planner count them
 * itself and answered "from 4 matches against Timofey" over a one-match
 * scope. A planner column of the same name is overwritten, so the injected
 * value always wins.
 */
export { ASK_SCOPE_COUNT_COLUMN };

/**
 * A `_pct` column holding a value outside 0–100 is a wrong denominator (the
 * baseline run printed 118.5%); it is refused like a database error and told
 * back to the planner by column name. Checked after the query, before the
 * answer step ever sees the rows.
 */
export function percentageOutOfRange(rows: readonly AskRow[]): string | null {
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (!/_pct$/.test(column) || typeof value !== "number") continue;
      if (!Number.isFinite(value) || value < 0 || value > 100) return column;
    }
  }
  return null;
}

/** The rows with {@link ASK_SCOPE_COUNT_COLUMN} set on every one of them. */
export function withScopeCount(
  rows: readonly AskRow[],
  matchCount: number,
): AskRow[] {
  return rows.map((row) => ({ ...row, [ASK_SCOPE_COUNT_COLUMN]: matchCount }));
}

type PlanStep =
  | { ok: true; plan: AskPlanQuery; reply: string }
  | { ok: false; refusal: string; advice: boolean }
  | { ok: false; problem: PlanProblem; reply: string }
  | { ok: false; unavailable: true };

interface QueryResult {
  matches: AskSourceMatch[];
  rows: AskRow[];
}

export async function* askQuestion(
  input: AskQuestionInput,
): AsyncGenerator<AskEvent, void, undefined> {
  const { db, model } = input;
  let settled = false;

  const release = async () => {
    if (settled) return;
    settled = true;
    if (!input.reservation) return;
    const { error } = await rpc(db, "ask_release_question", {
      usage_id: input.reservation.usageId,
    });
    if (error) {
      console.error("[ask] could not release a question reservation", {
        sqlstate: error.code,
        error: error.message,
      });
    }
  };

  const fail = async (code: AskErrorCode, error: string): Promise<AskEvent> => {
    await release();
    return { type: "error", code, error };
  };

  try {
    yield { type: "status", stage: "planning" };

    // ── Plan, guard, run — with one retry ──────────────────────────────────
    // A plan the guard refuses, a reply that is not a plan, or a query the
    // database refuses is told back to the planner once. The second failure
    // of any kind ends the question.
    const today = input.now().toISOString().slice(0, 10);
    const systemPrompt = model.configured
      ? buildPlanPrompt({
          today,
          tags: input.tags.prompt,
          conversation: input.conversation,
        })
      : "";
    const messages: ChatMessage[] = [{ role: "user", content: input.question }];

    let plan: AskPlanQuery | null = null;
    let result: QueryResult | null = null;
    let queried = false;

    for (let attempt = 0; attempt < 2 && result === null; attempt += 1) {
      const step = await planOnce(model, systemPrompt, messages);
      if (!step.ok) {
        if ("unavailable" in step) {
          yield await fail("llm_unavailable", ASK_LLM_UNAVAILABLE_MESSAGE);
          return;
        }
        if ("refusal" in step) {
          yield await fail("cannot_answer", step.refusal);
          return;
        }
        if (attempt === 0) {
          messages.push(
            { role: "assistant", content: step.reply },
            { role: "user", content: feedback(step.problem) },
          );
          continue;
        }
        yield await fail("cannot_answer", ASK_CANNOT_ANSWER_MESSAGE);
        return;
      }

      const check = checkAskSql({
        scopeSql: step.plan.scope_sql,
        sql: step.plan.sql,
      });
      if (!check.ok) {
        if (attempt === 0) {
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({ kind: "guard", detail: check.reason }),
            },
          );
          continue;
        }
        yield await fail("cannot_answer", ASK_CANNOT_ANSWER_MESSAGE);
        return;
      }

      if (!queried) {
        queried = true;
        yield { type: "status", stage: "querying" };
      }
      const run = await runQuery(db, step.plan);
      if (!run.ok) {
        if (attempt === 0) {
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({ kind: "database", detail: run.error }),
            },
          );
          continue;
        }
        yield await fail("cannot_answer", ASK_CANNOT_ANSWER_MESSAGE);
        return;
      }
      const badColumn = percentageOutOfRange(run.result.rows);
      if (badColumn !== null) {
        if (attempt === 0) {
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({
                kind: "range",
                detail: `The column ${badColumn} holds a value below 0 or above 100. A percentage is round(100.0 * numerator / nullif(denominator, 0), 1) with the numerator and denominator the Percentages section pairs; check which counter the denominator should be.`,
              }),
            },
          );
          continue;
        }
        yield await fail("cannot_answer", ASK_CANNOT_ANSWER_MESSAGE);
        return;
      }
      plan = step.plan;
      result = {
        matches: run.result.matches,
        rows: withScopeCount(run.result.rows, run.result.matches.length),
      };
    }

    if (plan === null || result === null) {
      yield await fail("cannot_answer", ASK_CANNOT_ANSWER_MESSAGE);
      return;
    }

    if (result.matches.length === 0) {
      yield await fail("no_data", ASK_NO_DATA_MESSAGE);
      return;
    }

    // ── Answer ─────────────────────────────────────────────────────────────
    yield { type: "status", stage: "writing" };

    let chunks: AsyncIterable<string>;
    if (model.configured) {
      try {
        chunks = await model.stream(
          buildAnswerPrompt({
            question: input.question,
            rows: result.rows,
            matchCount: result.matches.length,
          }),
          [{ role: "user", content: ASK_ANSWER_USER_MESSAGE }],
        );
      } catch {
        yield await fail("llm_unavailable", ASK_LLM_UNAVAILABLE_MESSAGE);
        return;
      }
    } else {
      chunks = mockAskAnswerStream();
    }

    const rendered = renderAskAnswer(guardedStream(chunks), result.rows);
    try {
      for await (const event of rendered.events) {
        if (event.type === "error") {
          // The renderer's own refusal — a cell the result does not hold, or
          // nothing written — passes through with its code and sentence.
          await release();
          yield event;
          return;
        }
        yield event;
      }
    } catch (error) {
      if (error instanceof ProviderFailure) {
        yield await fail("llm_unavailable", ASK_LLM_UNAVAILABLE_MESSAGE);
        return;
      }
      throw error;
    }

    const answer = rendered.result;
    if (answer.failure) {
      // Belt and braces: the renderer emits an `error` event for every
      // failure, which returned above.
      yield await fail("answer_failed", ASK_ANSWER_FAILED_MESSAGE);
      return;
    }
    if (answer.droppedDigits.length > 0) {
      console.warn(ASK_DROPPED_DIGITS_LOG, {
        count: answer.droppedDigits.length,
        digits: answer.droppedDigits,
      });
    }
    if (answer.droppedVisuals.length > 0 || answer.droppedVisualRows > 0) {
      // Reasons, kinds and counts only: a drop's detail is fixed text, but a
      // block's labels and cells never leave the renderer. `rows` counts the
      // ROW lines left out of a block that was still sent.
      console.warn(ASK_DROPPED_VISUALS_LOG, {
        count: answer.droppedVisuals.length,
        reasons: answer.droppedVisuals.map((drop) => drop.reason),
        kinds: answer.droppedVisuals.map((drop) => drop.kind),
        rows: answer.droppedVisualRows,
      });
    }

    // The no-advice notice is this module's, never the model's: a signal
    // beside the answer, after whatever the model wrote, which the client
    // shows as `ASK_NO_ADVICE_SENTENCE`.
    if (plan.asks_for_advice) {
      yield { type: "notice", notice: "no_advice" };
    }

    // ── Save ───────────────────────────────────────────────────────────────
    const saved = await rpc(db, "ask_save_exchange", {
      p_conversation_id: input.conversationId,
      p_question: savedQuestion(input.question, input.tags),
      p_answer: savedAnswer(answer, result, plan, model.configured),
    });
    if (saved.error || typeof saved.data !== "string") {
      console.error("[ask] could not save the exchange", {
        sqlstate: saved.error?.code,
        error: saved.error?.message ?? "ask_save_exchange() answered no id",
      });
      yield await fail("answer_failed", ASK_SAVE_FAILED_MESSAGE);
      return;
    }

    settled = true;
    yield { type: "sources", matches: result.matches };
    yield {
      type: "done",
      conversationId: saved.data,
      ...(await spentCount(db, input.reservation)),
    };
  } finally {
    // A consumer that stopped reading before `done` — a closed tab — did not
    // receive an answer. Settled paths return at once.
    await release();
  }
}

// ── Plan step ────────────────────────────────────────────────────────────────

async function planOnce(
  model: AskModel,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<PlanStep> {
  if (!model.configured) {
    return {
      ok: true,
      plan: ASK_MOCK_PLAN,
      reply: JSON.stringify(ASK_MOCK_PLAN),
    };
  }

  let reply: string;
  try {
    const chunks = await model.stream(systemPrompt, messages);
    const parts: string[] = [];
    for await (const chunk of chunks) parts.push(chunk);
    reply = parts.join("");
  } catch {
    return { ok: false, unavailable: true };
  }

  const parsed = parsePlanReply(reply);
  if (parsed === null) {
    return {
      ok: false,
      reply,
      problem: {
        kind: "unparseable",
        detail:
          "The reply was not one JSON object with scope_sql and sql, or with cannot_answer.",
      },
    };
  }
  if ("cannot_answer" in parsed) {
    return {
      ok: false,
      refusal: oneSentence(parsed.cannot_answer) || ASK_CANNOT_ANSWER_MESSAGE,
      advice: parsed.asks_for_advice,
    };
  }
  return { ok: true, plan: parsed, reply };
}

const FENCE = /^\s*```[a-zA-Z]*\s*([\s\S]*?)\s*```\s*$/;

/**
 * The planner's reply as an {@link AskPlanReply}, or null when it is not
 * one. A fenced code block around the object is tolerated, and so is a
 * missing `asks_for_advice` (read as false): the contract asks for both to
 * be absent, and a small model forgets.
 */
export function parsePlanReply(reply: string): AskPlanReply | null {
  const text = FENCE.exec(reply)?.[1] ?? reply;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The object with prose around it: take the outermost braces.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      value = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  const record = asRecord(value);
  if (!record) return null;
  const advice = record.asks_for_advice === true;
  if (typeof record.cannot_answer === "string") {
    return { cannot_answer: record.cannot_answer, asks_for_advice: advice };
  }
  if (
    typeof record.scope_sql === "string" &&
    record.scope_sql.trim() !== "" &&
    typeof record.sql === "string" &&
    record.sql.trim() !== ""
  ) {
    return {
      scope_sql: record.scope_sql,
      sql: record.sql,
      asks_for_advice: advice,
    };
  }
  return null;
}

/** What the planner is told when its last reply could not be used. */
function feedback(problem: PlanProblem): string {
  const lead =
    problem.kind === "database"
      ? "The database refused that query."
      : problem.kind === "guard"
        ? "That query was refused before it ran."
        : problem.kind === "range"
          ? "That query returned a percentage outside 0 to 100."
          : "That reply could not be read.";
  return `${lead} ${oneLine(problem.detail)} Reply again with ONE JSON object and nothing else, following every rule.`;
}

// ── Run step ─────────────────────────────────────────────────────────────────

async function runQuery(
  db: AskDatabase,
  plan: AskPlanQuery,
): Promise<{ ok: true; result: QueryResult } | { ok: false; error: string }> {
  const { data, error } = await rpc(db, "ask_run_query", {
    scope_sql: plan.scope_sql,
    sql: plan.sql,
  });
  if (error) return { ok: false, error: error.message };

  const record = asRecord(data);
  if (
    !record ||
    !Array.isArray(record.matches) ||
    !Array.isArray(record.rows)
  ) {
    return {
      ok: false,
      error: "ask_run_query() answered an unexpected shape.",
    };
  }
  return {
    ok: true,
    result: {
      matches: record.matches.flatMap((row) => sourceMatch(row) ?? []),
      rows: record.rows.flatMap((row): AskRow[] => {
        const cells = asRecord(row);
        return cells ? [cells] : [];
      }),
    },
  };
}

/** One `ask.matches` row as the client's `AskSourceMatch`. */
function sourceMatch(value: unknown): AskSourceMatch | null {
  const row = asRecord(value);
  if (!row || typeof row.match_id !== "string") return null;
  return {
    matchId: row.match_id,
    opponentName: stringOrNull(row.opponent_name),
    playedOn: stringOrNull(row.played_on),
    // Null stays null: a score that cannot say is not a loss.
    iWon: typeof row.i_won === "boolean" ? row.i_won : null,
    scoreText: stringOrNull(row.score_text),
  };
}

// ── Answer step ──────────────────────────────────────────────────────────────

/** Marks a provider error raised while the answer was streaming. */
class ProviderFailure extends Error {}

/**
 * The model's chunks with a provider error mid-stream turned into one the
 * renderer's consumer can tell from a renderer bug.
 */
async function* guardedStream(
  chunks: AsyncIterable<string>,
): AsyncIterable<string> {
  try {
    for await (const chunk of chunks) yield chunk;
  } catch (error) {
    throw new ProviderFailure("provider failed mid-stream", { cause: error });
  }
}

// ── Save step ────────────────────────────────────────────────────────────────

/**
 * The saved question — what `readSavedQuestion()` reads back, and where
 * `ask_save_exchange()` takes the conversation's title from (`text`).
 */
export interface AskSavedQuestion {
  text: string;
  tags: AskResolvedTags["saved"];
}

/**
 * The saved answer. `headline`, `figures`, `visual`, `body`, `noAdvice` and
 * `sources` are what `readSavedAnswer()` shows; the rest is the audit trail —
 * the matches the answer was computed from and the SQL that produced it —
 * under keys the reader ignores. Nothing reads `sql` or `scopeSql` back to a
 * player.
 *
 * Answers saved before `visual` and `noAdvice` existed have neither key, and
 * carry `ASK_NO_ADVICE_SENTENCE` at the end of `body` instead of the flag;
 * the reader shows them as saved. Nothing migrates them.
 */
export interface AskSavedAnswer {
  headline: string;
  figures: AskAnswerResult["figures"];
  /** The visual block, resolved; null when the answer had none. */
  visual: AskVisual | null;
  body: string;
  /** True when the question asked for advice: the client shows the no-advice notice. */
  noAdvice: boolean;
  sources: AskSourceMatch[];
  matchIds: string[];
  sql: string;
  scopeSql: string;
  /** True when no provider was configured and the template answered. */
  mock: boolean;
}

function savedQuestion(
  question: string,
  tags: AskResolvedTags,
): AskSavedQuestion {
  return { text: question, tags: tags.saved };
}

function savedAnswer(
  answer: AskAnswerResult,
  result: QueryResult,
  plan: AskPlanQuery,
  configured: boolean,
): AskSavedAnswer {
  return {
    headline: answer.headline,
    figures: answer.figures,
    visual: answer.visual,
    body: answer.text,
    noAdvice: plan.asks_for_advice,
    sources: result.matches,
    matchIds: result.matches.map((match) => match.matchId),
    sql: plan.sql,
    scopeSql: plan.scope_sql,
    mock: !configured,
  };
}

/**
 * `used` and `cap` for the `done` event. The reservation already carries
 * them; in mock mode nothing was reserved, so the meter is read instead and
 * a failed read shows nothing rather than a made-up count.
 */
async function spentCount(
  db: AskDatabase,
  reservation: AskReservation | null,
): Promise<{ used: number; cap: number }> {
  if (reservation) return { used: reservation.used, cap: reservation.cap };
  const { data } = await rpc(db, "ask_quota");
  const row = asRecord(data);
  return typeof row?.used === "number" && typeof row.cap === "number"
    ? { used: row.used, cap: row.cap }
    : { used: 0, cap: 0 };
}

// ── Conversation turns ───────────────────────────────────────────────────────

/**
 * Saved messages as the plan prompt's earlier turns: a question's text with
 * what its tags named, an answer's headline and body. The SQL and the
 * sources are not turns.
 *
 * A saved question's tags (`AskSavedTag`: a match id with its chip label, or
 * an opponent's name) are appended to the turn as "(about: match <id> vs
 * <label>; opponent <name>)", so a follow-up with no tags of its own — "and
 * on second serves?" — can keep the earlier question's scope: the plan
 * prompt tells the planner to reuse those ids. Labels are database text, not
 * request text (`tags.ts`), and are flattened to one line.
 */
export function conversationTurnsFromMessages(
  messages: readonly { role: "user" | "assistant"; content: unknown }[],
): AskPromptTurn[] {
  return messages.flatMap((message): AskPromptTurn[] => {
    const record = asRecord(message.content);
    const text =
      message.role === "user"
        ? typeof message.content === "string"
          ? message.content
          : stringOrNull(record?.text)
        : [stringOrNull(record?.headline), stringOrNull(record?.body)]
            .filter((part) => part && part.trim() !== "")
            .join("\n\n");
    if (!text || text.trim() === "") return [];
    const about = message.role === "user" ? savedTagsAbout(record?.tags) : "";
    return [{ role: message.role, content: about ? `${text} ${about}` : text }];
  });
}

/** `(about: match <id> vs <label>; opponent <name>)` from a saved question's tags, or "". */
function savedTagsAbout(tags: unknown): string {
  if (!Array.isArray(tags)) return "";
  const parts = tags.flatMap((tag): string[] => {
    const record = asRecord(tag);
    const id = stringOrNull(record?.id);
    const label = stringOrNull(record?.label);
    if (!record || !id) return [];
    if (record.kind === "match") {
      return [`match ${oneLine(id)}${label ? ` vs ${oneLine(label)}` : ""}`];
    }
    if (record.kind === "opponent") {
      return [`opponent ${oneLine(label ?? id)}`];
    }
    return [];
  });
  return parts.length === 0 ? "" : `(about: ${parts.join("; ")})`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `.rpc()` with a thrown error (a network failure) folded into the result. */
async function rpc(
  db: AskDatabase,
  fn: string,
  args?: Record<string, unknown>,
): Promise<AskRpcResult> {
  try {
    return await db.rpc(fn, args);
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function oneSentence(text: string): string {
  return oneLine(text).slice(0, MAX_CANNOT_ANSWER_LENGTH);
}
