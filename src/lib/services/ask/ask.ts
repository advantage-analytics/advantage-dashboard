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
import {
  equalBaselineColumns,
  measureColumnCount,
  oldestFirst,
  scopeIsNarrowed,
  undocumentedPercentages,
  withOrderSummary,
  withoutColumns,
} from "@/lib/services/ask/facts";
import { askMeasure } from "@/lib/services/ask/measures";
import { ASK_MOCK_PLAN, mockAskAnswerStream } from "@/lib/services/ask/mock";
import type { AskScope } from "@/lib/services/ask/scope";
import {
  ASK_SCOPE_COUNT_COLUMN,
  type AskPlanQuery,
  type AskPlanReply,
  type AskPreviousPlan,
  type AskPromptTurn,
  buildAnswerPrompt,
  buildPlanPrompt,
} from "@/lib/services/ask/prompts";
import {
  ASK_REVIEW_SQL,
  type AskReviewMode,
  buildReviewAnswer,
  classifyReview,
  readAskReview,
  reviewAnswerRow,
} from "@/lib/services/ask/review";
import {
  buildMatchListAnswer,
  buildPairedAnswer,
  buildTwoGroupAnswer,
  onlyName,
} from "@/lib/services/ask/paired";
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
 * Scope: `input.scope` says whose matches the question is about. A personal
 * question runs `ask_run_query` and saves with three arguments, exactly as
 * before team Ask existed. A team question runs `ask_run_team_query` with the
 * program's id — which selects, and never grants: the views test membership
 * against `auth.uid()` — is planned and answered with the team prompts, and
 * saves with `p_program_id` so the conversation belongs to that workspace.
 * The quota is the asker's own in both.
 *
 * Two things the server does to a plan beyond checking it. A result whose
 * every baseline equals the figure it is compared with — "August against all
 * matches" as two identical bars — is sent back to the planner once, and if
 * it comes back the same the baseline columns are left out of what the answer
 * step sees (`equalBaselineColumns`). And a REVIEW ("how can I improve for my
 * next match?") is not planned at all: the planner chooses the matches, the
 * query is the constant `ASK_REVIEW_SQL`, and the answer is written by
 * `review.ts` from the server's own classification — no answer model call,
 * the same renderer, the same events, and always the no-advice notice. A
 * result in date order also gets each measure's first, last, lowest and
 * highest value copied onto its first row (`withOrderSummary`), so the
 * answer can cite them without having to name the right row. And a
 * PAIR-SHAPED result — one row of me_/opp_ or measure/baseline pairs — is
 * answered by `paired.ts` the way a review is: the server writes the
 * comparison, and the answer model is not called.
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
  /**
   * How the turn before this one was planned (`previousPlanFromMessages()`),
   * or null/absent for a first question. The planner is shown it, and a
   * follow-up that shrinks many measures to one is sent back once.
   */
  previousPlan?: AskPreviousPlan | null;
  /** The conversation to append to, or null to start one. */
  conversationId: string | null;
  /** From `reserveAskQuestion()`; null in mock mode. */
  reservation: AskReservation | null;
  /** Whose matches the question is about; the route has already checked membership. */
  scope: AskScope;
}

// ── Sentences the error events carry ─────────────────────────────────────────

export const ASK_CANNOT_ANSWER_MESSAGE = "Your match data can't answer that.";
export const ASK_NO_DATA_MESSAGE =
  "None of your matches fit that question, so there was nothing to compute.";
export const ASK_TEAM_CANNOT_ANSWER_MESSAGE =
  "The program's match data can't answer that.";
export const ASK_TEAM_NO_DATA_MESSAGE =
  "None of the program's matches fit that question, so there was nothing to compute.";
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
export const ASK_DROPPED_SENTENCES_LOG =
  "[ask] renderer dropped same-cell range sentences";

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
  kind:
    | "unparseable"
    | "guard"
    | "database"
    | "range"
    | "baseline"
    | "followup"
    | "undocumented";
  detail: string;
};

/**
 * What the planner is told when every baseline in its result equals the
 * figure beside it. Names the columns; says how a baseline is written.
 */
export function equalBaselineDetail(columns: readonly string[]): string {
  return `The baseline ${columns.length === 1 ? "column" : "columns"} ${columns.join(", ")} came out exactly equal to the scoped ${columns.length === 1 ? "figure" : "figures"}, so the baseline was computed over scope. A baseline must be computed over all matches, not joined to scope: sum it straight from the view (from ask.match_stats s where s.side = 'me', with no join to scope and no match_id in (select match_id from scope) around it), and put the scoped figure beside it as sum(case when s.match_id in (select match_id from scope) then … else 0 end).`;
}

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

/** The rows without any `_pct` column that holds a value outside 0–100 in some row. */
export function withoutOutOfRangePercentages(
  rows: readonly AskRow[],
): AskRow[] {
  const bad = new Set<string>();
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (!/_pct$/.test(column) || typeof value !== "number") continue;
      if (!Number.isFinite(value) || value < 0 || value > 100) bad.add(column);
    }
  }
  return withoutColumns(rows, [...bad]);
}

/** The rows with {@link ASK_SCOPE_COUNT_COLUMN} set on every one of them. */
export function withScopeCount(
  rows: readonly AskRow[],
  matchCount: number,
): AskRow[] {
  return rows.map((row) => ({ ...row, [ASK_SCOPE_COUNT_COLUMN]: matchCount }));
}

/** What the planner is told when its sql names a column after the server's scope count. */
export const SCOPE_COUNT_COLUMN_REASON = `sql names a column ${ASK_SCOPE_COUNT_COLUMN}. The app adds that column itself and never reads yours. Name a group's own number of matches group_matches (player_matches for a player), and do not count the matches in scope at all.`;

/** Whether model-written sql aliases a column as the scope count. */
export function namesScopeCountColumn(sql: string): boolean {
  return new RegExp(
    String.raw`\bas\s+"?${ASK_SCOPE_COUNT_COLUMN}"?(?![a-z0-9_])`,
    "i",
  ).test(sql);
}

/**
 * The column a query ranks by, descending without `nulls last`, when the
 * first row it returned has no figure there; null otherwise. Read from the
 * last `order by` of the sql — the outermost one.
 */
export function topRowHasNoRankingFigure(
  sql: string,
  rows: readonly AskRow[],
): string | null {
  const first = rows[0];
  if (!first || rows.length < 1) return null;
  const at = sql.toLowerCase().lastIndexOf("order by");
  if (at === -1) return null;
  const match =
    /^order\s+by\s+(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s+desc\b(?!\s+nulls\s+last)/i.exec(
      sql.slice(at),
    );
  if (!match) return null;
  const column = match[1];
  return column in first && first[column] === null ? column : null;
}

/** A previous query with at least this many measures is one a follow-up is expected to keep. */
export const MIN_FOLLOW_UP_MEASURES = 3;

/** The measure columns a query's sql names: its `as` aliases the dictionary knows, or that are percentages. */
export function sqlMeasureAliases(sql: string): string[] {
  const names = new Set<string>();
  for (const match of sql.matchAll(/\bas\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
    const name = match[1].toLowerCase();
    if (askMeasure(name) !== null || /(?:^|_)pct$/.test(name)) names.add(name);
  }
  return [...names];
}

/**
 * Why a follow-up's result reads as having dropped what the previous turn
 * measured, or null: the previous query named three or more measures and
 * this one came back as one row holding a single one. "And against
 * right-handers?" after a ten-measure diagnostic, answered with one
 * invented percentage.
 */
export function followUpShrank(
  previous: AskPreviousPlan | null,
  rows: readonly AskRow[],
): string | null {
  if (!previous || previous.sql === null || rows.length !== 1) return null;
  const before = sqlMeasureAliases(previous.sql);
  if (before.length < MIN_FOLLOW_UP_MEASURES) return null;
  if (measureColumnCount(rows[0]) !== 1) return null;
  return `The previous question returned ${before.length} measures (${before.slice(0, 6).join(", ")}${before.length > 6 ? ", …" : ""}); this one returned a single figure. A follow-up that changes only who, when or where keeps the previous query's columns and changes the scope and the filters: reply with the previous sql and the new scope_sql. If the question really asks for this one figure and nothing else, reply the same again.`;
}

/**
 * Why a follow-up's scope reads as having dropped the previous turn's
 * player, or null: the previous scope filtered `player_name ilike`, the
 * question refers back with a pronoun, and the new scope names neither a
 * player nor a list of match ids.
 */
export function droppedPlayerFilter(
  question: string,
  previous: AskPreviousPlan | null,
  scopeSql: string,
): string | null {
  if (!previous) return null;
  const filter = /player_name\s+ilike\s+'([^']+)'/i.exec(previous.scope_sql);
  if (!filter) return null;
  if (!/\b(?:she|he|her|hers|his|him|they|their|them)\b/i.test(question)) {
    return null;
  }
  if (
    /player_name/i.test(scopeSql) ||
    /match_id\s+in\s*\(\s*'/i.test(scopeSql)
  ) {
    return null;
  }
  return `scope_sql does not filter on player_name, but the question refers back to the player of the previous question (player_name ilike '${filter[1]}'). A follow-up that names no player keeps the previous scope's player: add player_name ilike '${filter[1]}' to scope_sql.`;
}

/** What the planner is told about a percentage with no documented definition and no counts beside it. */
export function undocumentedDetail(columns: readonly string[]): string {
  return `${columns.join(", ")} ${columns.length === 1 ? "is not a documented measure" : "are not documented measures"} and the result holds nothing ${columns.length === 1 ? "it" : "they"} could be made from. Use the documented measures of the Percentages section, or return the two counts ${columns.length === 1 ? "it is" : "each is"} made from beside it.`;
}

/**
 * The previous turn's plan, from the saved messages of a conversation: the
 * last answer's `scopeSql` and `sql`, which every saved answer records. A
 * review's query is the server's and is reported as null. Null when there is
 * no earlier answer or it holds no plan.
 */
export function previousPlanFromMessages(
  messages: readonly { role: "user" | "assistant"; content: unknown }[],
): AskPreviousPlan | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const record = asRecord(message.content);
    const scopeSql = stringOrNull(record?.scopeSql);
    const sql = stringOrNull(record?.sql);
    if (!scopeSql || !sql || record?.mock === true) return null;
    return { scope_sql: scopeSql, sql: sql === ASK_REVIEW_SQL ? null : sql };
  }
  return null;
}

type PlanStep =
  /** `review` marks a plan whose sql is the server's own `ASK_REVIEW_SQL`. */
  | { ok: true; plan: AskPlanQuery; review: boolean; reply: string }
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
  const { db, model, scope } = input;
  const team = scope.kind === "team";
  const cannotAnswer = team
    ? ASK_TEAM_CANNOT_ANSWER_MESSAGE
    : ASK_CANNOT_ANSWER_MESSAGE;
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
          previousPlan: input.previousPlan ?? null,
          ...(team ? { scope } : {}),
        })
      : "";
    const messages: ChatMessage[] = [{ role: "user", content: input.question }];

    let plan: AskPlanQuery | null = null;
    let result: QueryResult | null = null;
    let reviewed = false;
    /** A server-written answer in the renderer's syntax: the review's, or a pair-shaped result's. */
    let reviewText: string | null = null;
    let queried = false;
    let followUpRefusalRetried = false;
    // A first result that ran but whose baselines all equalled the scoped
    // figures, with those columns already left out. If the planner's second
    // try fails in any way, this is the answer: a result without a baseline
    // is better than no answer.
    let fallback: { plan: AskPlanQuery; result: QueryResult } | null = null;

    // Two tries for a query that ran and was sent back for what it measured.
    // A third only for a query that never ran: one refused by the guard or
    // by the database, or a reply that could not be read. The soft checks
    // below fire on the first try alone, so a second or third result stands.
    for (
      let attempt = 0;
      attempt < MAX_PLAN_ATTEMPTS && result === null;
      attempt += 1
    ) {
      const step = await planOnce(model, systemPrompt, messages, cannotAnswer);
      if (!step.ok && fallback) {
        ({ plan, result } = fallback);
        break;
      }
      if (!step.ok) {
        if ("unavailable" in step) {
          yield await fail("llm_unavailable", ASK_LLM_UNAVAILABLE_MESSAGE);
          return;
        }
        if ("refusal" in step) {
          // A follow-up ("why did she lose?", "and on clay?") refused on its
          // first try is usually a pronoun or an ellipsis left unresolved.
          // The planner is pointed at the previous query once; a second
          // refusal stands.
          if (input.previousPlan && !followUpRefusalRetried) {
            followUpRefusalRetried = true;
            messages.push(
              {
                role: "assistant",
                content: JSON.stringify({ cannot_answer: step.refusal }),
              },
              { role: "user", content: FOLLOW_UP_REFUSAL_FEEDBACK },
            );
            continue;
          }
          yield await fail("cannot_answer", step.refusal);
          return;
        }
        if (attempt < MAX_PLAN_ATTEMPTS - 1) {
          messages.push(
            { role: "assistant", content: step.reply },
            { role: "user", content: feedback(step.problem) },
          );
          continue;
        }
        yield await fail("cannot_answer", cannotAnswer);
        return;
      }

      const guard = checkAskSql({
        scopeSql: step.plan.scope_sql,
        sql: step.plan.sql,
      });
      // The scope count is the server's column. A planner that names one of
      // its own that way has counted something else under the name, and the
      // server's value would silently replace it.
      // And a follow-up about "she" or "his" whose scope lost the previous
      // turn's player: told back once, and the second time it stands.
      const lostPlayer =
        attempt === 0
          ? droppedPlayerFilter(
              input.question,
              input.previousPlan ?? null,
              step.plan.scope_sql,
            )
          : null;
      const check: typeof guard = !guard.ok
        ? guard
        : !step.review && namesScopeCountColumn(step.plan.sql)
          ? { ok: false, reason: SCOPE_COUNT_COLUMN_REASON }
          : lostPlayer !== null
            ? { ok: false, reason: lostPlayer }
            : attempt === 0 &&
                !step.review &&
                ignoresBigPoints(input.question, step.plan.sql)
              ? { ok: false, reason: BIG_POINTS_REASON }
              : guard;
      if (!check.ok) {
        if (fallback) {
          ({ plan, result } = fallback);
          break;
        }
        if (attempt < MAX_PLAN_ATTEMPTS - 1) {
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({ kind: "guard", detail: check.reason }),
            },
          );
          continue;
        }
        yield await fail("cannot_answer", cannotAnswer);
        return;
      }

      if (!queried) {
        queried = true;
        yield { type: "status", stage: "querying" };
      }
      const run = await runQuery(db, step.plan, scope);
      if (!run.ok) {
        if (fallback) {
          ({ plan, result } = fallback);
          break;
        }
        if (attempt < MAX_PLAN_ATTEMPTS - 1) {
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({
                kind: "database",
                detail: databaseHint(run.error),
              }),
            },
          );
          continue;
        }
        yield await fail("cannot_answer", cannotAnswer);
        return;
      }
      let resultRows = run.result.rows;
      const badColumn = percentageOutOfRange(resultRows);
      if (badColumn !== null) {
        if (fallback) {
          ({ plan, result } = fallback);
          break;
        }
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
        // Out of range a second time. The columns that are wrong are left
        // out; if the rest still holds a measure, that is the answer —
        // counts and the percentages that were right are not thrown away
        // with the ones that were not.
        const usable = withoutOutOfRangePercentages(resultRows);
        if (usable.length === 0 || measureColumnCount(usable[0]) === 0) {
          yield await fail("cannot_answer", cannotAnswer);
          return;
        }
        resultRows = usable;
      }
      // "order by loss_pct desc limit 1" with a null in front: Postgres puts
      // rows with no figure first when descending, so the top row is one
      // with nothing to rank. Sent back once; a second time it stands.
      const unranked = step.review
        ? null
        : topRowHasNoRankingFigure(step.plan.sql, resultRows);
      if (unranked !== null && attempt === 0 && !fallback) {
        messages.push(
          { role: "assistant", content: step.reply },
          {
            role: "user",
            content: feedback({
              kind: "database",
              detail: `The query ran, but its first row has no figure for ${unranked}: order by ${unranked} desc puts rows with no figure first. Write order by ${unranked} desc nulls last, and check the nullif in ${unranked} divides by zero only when there is nothing to divide.`,
            }),
          },
        );
        continue;
      }

      if (step.review) {
        // The server's own query: nothing to send back to the planner. No
        // match with statistics in scope is "no data", decided below.
        const review = readAskReview(resultRows);
        plan = step.plan;
        reviewed = true;
        if (review === null) {
          result = { matches: [], rows: [] };
          break;
        }
        const mode: AskReviewMode = !team
          ? "personal"
          : scopeIsNarrowed(step.plan.scope_sql) && review.players === 1
            ? "player"
            : "team";
        const rows = withScopeCount(
          [reviewAnswerRow(review)],
          run.result.matches.length,
        );
        reviewText = buildReviewAnswer(review, classifyReview(review, mode));
        result = { matches: run.result.matches, rows };
        break;
      }

      // Every baseline equal to the figure it is compared with, over a scope
      // narrower than all matches: the baseline was summed over scope. Sent
      // back once; the second time the baseline columns are left out.
      // Per-match rows the query returned newest first are turned round:
      // the trend and the win/loss strip are drawn oldest first.
      let rows = oldestFirst(resultRows);
      const narrowed = scopeIsNarrowed(step.plan.scope_sql);
      // Over every match, an all-matches baseline is the figure a second
      // time by definition: one equal pair is enough, and there is nothing
      // to send back — the columns are simply left out.
      const equal = equalBaselineColumns(rows, narrowed ? 2 : 1);
      if (equal !== null) {
        rows = withoutColumns(rows, equal);
        if (narrowed && attempt === 0) {
          fallback = {
            plan: step.plan,
            result: {
              matches: run.result.matches,
              rows: withScopeCount(
                withOrderSummary(rows),
                run.result.matches.length,
              ),
            },
          };
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({
                kind: "baseline",
                detail: equalBaselineDetail(equal),
              }),
            },
          );
          continue;
        }
      }
      // Two shapes that are sent back once and stand the second time: a
      // follow-up that shrank the previous question's measures to one, and a
      // percentage nobody documented with nothing beside it to define it.
      const shrunk = followUpShrank(input.previousPlan ?? null, rows);
      const undocumented = undocumentedPercentages(rows);
      const problem: PlanProblem | null =
        shrunk !== null
          ? { kind: "followup", detail: shrunk }
          : undocumented !== null
            ? { kind: "undocumented", detail: undocumentedDetail(undocumented) }
            : null;
      const answered = {
        plan: step.plan,
        result: {
          matches: run.result.matches,
          rows: withScopeCount(
            withOrderSummary(rows),
            run.result.matches.length,
          ),
        },
      };
      if (problem !== null && attempt === 0 && !fallback) {
        fallback = answered;
        messages.push(
          { role: "assistant", content: step.reply },
          { role: "user", content: feedback(problem) },
        );
        continue;
      }
      ({ plan, result } = answered);
    }

    if (plan === null || result === null) {
      yield await fail("cannot_answer", cannotAnswer);
      return;
    }

    if (result.matches.length === 0) {
      yield await fail(
        "no_data",
        team ? ASK_TEAM_NO_DATA_MESSAGE : ASK_NO_DATA_MESSAGE,
      );
      return;
    }

    // A pair-shaped result — one row of me_/opp_ or measure/baseline pairs —
    // is written by the server too (`paired.ts`): which side of each pair is
    // higher is worked out in code, so no sentence can say it backwards.
    // Never in mock mode, whose template is the answer there.
    if (reviewText === null && model.configured) {
      const paired = buildPairedAnswer(result.rows, {
        team,
        matchCount: result.matches.length,
        opponentName: onlyName(
          result.matches.map((match) => match.opponentName),
        ),
        playerName: team
          ? onlyName(result.matches.map((match) => match.playerName))
          : null,
      });
      // Or two rows, one per group, with the same measures in both.
      const written =
        paired ??
        buildTwoGroupAnswer(result.rows, {
          matchCount: result.matches.length,
        }) ??
        // Or a short list of matches to retell.
        buildMatchListAnswer(result.rows, { team });
      if (written !== null) {
        reviewText = written.text;
        result = { matches: result.matches, rows: written.rows };
      }
    }

    // ── Answer ─────────────────────────────────────────────────────────────
    yield { type: "status", stage: "writing" };

    let chunks: AsyncIterable<string>;
    if (reviewText !== null) {
      // Written by the server, not the model: the same syntax, through the
      // same renderer.
      chunks = oneChunk(reviewText);
    } else if (model.configured) {
      try {
        chunks = await model.stream(
          buildAnswerPrompt({
            question: input.question,
            rows: result.rows,
            matchCount: result.matches.length,
            ...(team ? { scope } : {}),
          }),
          [{ role: "user", content: ASK_ANSWER_USER_MESSAGE }],
        );
      } catch {
        yield await fail("llm_unavailable", ASK_LLM_UNAVAILABLE_MESSAGE);
        return;
      }
    } else {
      chunks = mockAskAnswerStream(scope);
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
    if (answer.droppedSentences > 0) {
      console.warn(ASK_DROPPED_SENTENCES_LOG, {
        count: answer.droppedSentences,
      });
    }

    // A review always carries the notice: it answers "how can I improve"
    // with what the matches show, whatever the planner flagged.
    const noAdvice = plan.asks_for_advice || reviewed;
    if (noAdvice) {
      yield { type: "notice", notice: "no_advice" };
    }

    // ── Save ───────────────────────────────────────────────────────────────
    const saved = await rpc(db, "ask_save_exchange", {
      p_conversation_id: input.conversationId,
      p_question: savedQuestion(input.question, input.tags),
      p_answer: savedAnswer(answer, result, plan, noAdvice, model.configured),
      // Named only for a team question: a personal save is the three
      // arguments it always was.
      ...(scope.kind === "team" ? { p_program_id: scope.programId } : {}),
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
  cannotAnswer: string,
): Promise<PlanStep> {
  if (!model.configured) {
    return {
      ok: true,
      plan: ASK_MOCK_PLAN,
      review: false,
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
          "The reply was not one JSON object with scope_sql and sql, with review and scope_sql, or with cannot_answer.",
      },
    };
  }
  if ("cannot_answer" in parsed) {
    return {
      ok: false,
      refusal: oneSentence(parsed.cannot_answer) || cannotAnswer,
      advice: parsed.asks_for_advice,
    };
  }
  if ("review" in parsed) {
    // The planner chose the matches; the query is the server's.
    return {
      ok: true,
      plan: {
        scope_sql: parsed.scope_sql,
        sql: ASK_REVIEW_SQL,
        asks_for_advice: true,
      },
      review: true,
      reply,
    };
  }
  return { ok: true, plan: parsed, review: false, reply };
}

const FENCE = /^\s*```[a-zA-Z]*\s*([\s\S]*?)\s*```\s*$/;

/**
 * The planner's reply as an {@link AskPlanReply}, or null when it is not
 * one. A fenced code block around the object is tolerated, and so is a
 * missing `asks_for_advice` (read as false): the contract asks for both to
 * be absent, and a small model forgets. `{"review": true, "scope_sql"}` is
 * the review intent, whose `asks_for_advice` is always true.
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
  // The review: `review` exactly true and a scope. Any `sql` beside it is
  // ignored — the query is never the planner's.
  if (
    record.review === true &&
    typeof record.scope_sql === "string" &&
    record.scope_sql.trim() !== ""
  ) {
    return { review: true, scope_sql: record.scope_sql, asks_for_advice: true };
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
const BIG_POINTS_REASON =
  "The question is about big points (break points, set points, match points), but the query reads every point. Restrict it to ask.points rows where is_break_point or is_set_point or is_match_point is true, joined to ask.shots on match_id and point_number when a shot is needed, and name the columns for what they hold (big_point_…).";

/**
 * True when the question asks about big, pressure or break points and the
 * query never reads the columns that mark them: the answer would describe
 * every point under a question about a few. Told back once.
 */
export function ignoresBigPoints(question: string, sql: string): boolean {
  if (
    !/\b(?:big|pressure|clutch|crucial|important|break|set|match)[ -]points?\b/i.test(
      question,
    )
  ) {
    return false;
  }
  return !/\bis_(?:break|set|match)_point\b|break_points?_|set_points?_/i.test(
    sql,
  );
}

/** How many times the planner is asked before the question is refused. */
const MAX_PLAN_ATTEMPTS = 3;

const FOLLOW_UP_REFUSAL_FEEDBACK =
  "This question follows the previous one. A pronoun (she, he, they, it) or a missing subject means the player, opponent, period or matches of the previous query: reuse its scope and filters. Refuse again only if what is asked is not recorded in the views. Reply again with ONE JSON object and nothing else, following every rule.";

/**
 * The database's error, with the fix spelled out for the one the planner
 * keeps making: Postgres has round(numeric, integer) and no
 * round(double precision, integer).
 */
export function databaseHint(error: string): string {
  return /round\(double precision/i.test(error)
    ? `${error} Cast the value to numeric before rounding: round((…)::numeric, 1).`
    : error;
}

function feedback(problem: PlanProblem): string {
  const lead =
    problem.kind === "database"
      ? "The database refused that query."
      : problem.kind === "guard"
        ? "That query was refused before it ran."
        : problem.kind === "range"
          ? "That query returned a percentage outside 0 to 100."
          : problem.kind === "baseline"
            ? "That query's baseline is the same as the figure it is compared with."
            : problem.kind === "followup"
              ? "That query measures one thing where the previous question measured several."
              : problem.kind === "undocumented"
                ? "That query returned a percentage with no documented definition."
                : "That reply could not be read.";
  return `${lead} ${oneLine(problem.detail)} Reply again with ONE JSON object and nothing else, following every rule.`;
}

// ── Run step ─────────────────────────────────────────────────────────────────

async function runQuery(
  db: AskDatabase,
  plan: AskPlanQuery,
  scope: AskScope,
): Promise<{ ok: true; result: QueryResult } | { ok: false; error: string }> {
  const team = scope.kind === "team";
  const { data, error } = team
    ? await rpc(db, "ask_run_team_query", {
        p_program_id: scope.programId,
        scope_sql: plan.scope_sql,
        sql: plan.sql,
      })
    : await rpc(db, "ask_run_query", {
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
      matches: record.matches.flatMap((row) => sourceMatch(row, team) ?? []),
      rows: record.rows.flatMap((row): AskRow[] => {
        const cells = asRecord(row);
        return cells ? [cells] : [];
      }),
    },
  };
}

/**
 * One `ask.matches` row as the client's `AskSourceMatch`. `player_name` is
 * read in a team scope only: in a personal one the view states the viewer's
 * own name there, which is not something to print back at them.
 */
function sourceMatch(value: unknown, team: boolean): AskSourceMatch | null {
  const row = asRecord(value);
  if (!row || typeof row.match_id !== "string") return null;
  return {
    matchId: row.match_id,
    opponentName: stringOrNull(row.opponent_name),
    playedOn: stringOrNull(row.played_on),
    // Null stays null: a score that cannot say is not a loss.
    iWon: typeof row.i_won === "boolean" ? row.i_won : null,
    scoreText: stringOrNull(row.score_text),
    playerName: team ? stringOrNull(row.player_name) : null,
  };
}

// ── Answer step ──────────────────────────────────────────────────────────────

/** Server-written answer text as the one-chunk stream the renderer takes. */
async function* oneChunk(text: string): AsyncIterable<string> {
  yield text;
}

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
  noAdvice: boolean,
  configured: boolean,
): AskSavedAnswer {
  return {
    headline: answer.headline,
    figures: answer.figures,
    visual: answer.visual,
    body: answer.text,
    noAdvice,
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
    if (record.kind === "player") {
      // The label is the roster's name; the id is a uuid the planner cannot use.
      return label ? [`player ${oneLine(label)}`] : [];
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
