import { isUuid, UUID_RE } from "@/lib/admin/validation";
import type { ChatMessage } from "@/lib/llm/adapter";
import {
  ASK_AGENT_BOUNDS,
  askAgentPromptAppendix,
  runAskAgent,
  type AskAgentBounds,
  type AskAgentToolbox,
  type AskAgentToolTurn,
} from "@/lib/services/ask/agent";
import {
  ASK_ANSWER_FAILED_MESSAGE,
  type AskAnswerResult,
  type AskRow,
  renderAskAnswer,
} from "@/lib/services/ask/answer-render";
import {
  stringOrNull,
  type AskErrorCode,
  type AskEvent,
  type AskStatusEvent,
  type AskSourceMatch,
  type AskVisual,
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
import {
  type AskCompareKind,
  ASK_COMPARE_KINDS,
  ASK_COMPARE_OPPONENT_SQL,
  askQuality,
  asksForStrengths,
  asksToComparePlayers,
  asksWhatHappened,
  asksWhatToWorkOn,
  baselineIsWholeScope,
  compareMisfit,
  movesPreviousQuestion,
  compareColumn,
  compareKindOfSql,
  compareSql,
  projectCompareRows,
  qualityNote,
  selectCompareMeasures,
} from "@/lib/services/ask/compare";
import {
  ASK_UNFORCED_ERRORS_NOTE,
  askMeasure,
  unforcedErrorsNotes,
} from "@/lib/services/ask/measures";
import { ASK_MOCK_PLAN, mockAskAnswerStream } from "@/lib/services/ask/mock";
import type { AskExample } from "@/lib/services/ask/examples";
import {
  type AskThreadState,
  previousHeadlineFromTurns,
  readAskThreadState,
} from "@/lib/services/ask/thread-state";
import type { AskScope } from "@/lib/services/ask/scope";
import {
  type AskPlanQuery,
  type AskPlanReply,
  type AskPreviousPlan,
  type AskPromptTurn,
  ASK_PLAN_EXAMPLE_NAMES,
  ASK_PLAN_REPLY_SCHEMA,
  ASK_SCOPE_COUNT_COLUMN,
  askPromptStaticPrefixLength,
  buildAnswerPrompt,
  buildPlanPrompt,
  oneLine,
} from "@/lib/services/ask/prompts";
import {
  type AskPattern,
  type AskPatternNames,
  type AskPatternReading,
  asksForPattern,
  buildPatternAnswer,
  buildPatternPrompt,
  namesSequence,
  patternAnswerRows,
  patternNeedsPlayer,
  patternSql,
  readPatternReply,
} from "@/lib/services/ask/pattern";
import { patternVideoHref } from "@/lib/services/ask/pattern-video";
import type { AskPageSeat } from "@/lib/data/ask-server";
import {
  ASK_NO_SHOTS_MESSAGE,
  ASK_PLAYS_CLARIFY_OPTIONS,
  ASK_PLAYS_CLARIFY_QUESTION,
  type AskPlaysSubject,
  asksAboutPlays,
  asksForLosingPlays,
  asksForWinningPlays,
  buildLosingPlaysAnswer,
  buildWinningPlaysAnswer,
  winningPlaysSql,
  rallyLengthOf,
  rallyLengthOfPlaysSql,
  winningPlaysSubject,
  losingPlaysSql,
  losingPlaysSubject,
  losingPlaysVoice,
} from "@/lib/services/ask/plays";
import {
  asksForServePlusOne,
  buildServePlusOneAnswer,
  continuesServePlusOne,
  namesASide,
  plusOneSides,
  plusOneWithSides,
  servePlusOneRequest,
  servePlusOneRequestOfSql,
  servePlusOneSql,
  type AskServePlusOne,
} from "@/lib/services/ask/serve-plus-one";
import {
  ASK_REVIEW_SQL,
  type AskReviewMode,
  buildReviewAnswer,
  classifyReview,
  readAskReview,
  reviewAnswerRow,
} from "@/lib/services/ask/review";
import {
  absentMatchupLead,
  buildMatchListAnswer,
  buildPairedAnswer,
  buildPlayersAnswer,
  buildTrendAnswer,
  buildTwoGroupAnswer,
  namedPlayerRows,
  onlyName,
  pairLabel,
} from "@/lib/services/ask/paired";
import {
  asksAboutMomentum,
  buildMomentumAnswer,
} from "@/lib/services/ask/momentum";
import { asksForChart } from "@/lib/services/ask/chart-request";
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
 * Three more things are the server's and not the planner's (`compare.ts`).
 * A COMPARISON — the player against the opponents, the program's players
 * side by side, a narrower set of matches against all of them — is chosen
 * by the planner (`{"compare": …}`) and computed by a constant query, then
 * written by `paired.ts`: the planner once divided the wrong counters for an
 * opponent and printed 100% where the match held 71.4%. A follow-up keeps
 * its subject mechanically: a scope that names somebody neither the
 * question, its tags nor the conversation mentions is sent back and then
 * replaced, and a scope that finds no match falls back to the previous
 * turn's. And three refusals are not accepted: "what should … practise"
 * gets the review, a comparison of players gets the players query, and a
 * player-against-opponent scope that finds nothing is retried on the
 * opponent alone, with a first sentence that says the two never met.
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

/** Which step of a question a model call is for; the route names the call by it in LLM analytics. */
export type AskModelStage = "plan" | "pattern" | "answer";

/** What one model call asks of the adapter beyond its prompt. */
export interface AskModelCall {
  stage: AskModelStage;
  /**
   * 0 for the steps that read or write a plan: the same question should plan
   * the same way twice. Anthropic path only — Gemini refuses sampling
   * parameters, so production (`LLM_PROVIDER=openai`) does not send it.
   */
  temperature?: number;
  /** The reply's cap in tokens. Anthropic path only, as `temperature`. */
  maxTokens?: number;
  /** The reply must be one JSON object of this shape (the plan step). */
  jsonSchema?: {
    name: string;
    schema: { type: "object" } & Record<string, unknown>;
  };
  /** How many leading characters of the system prompt every call shares (`askPromptStaticPrefixLength`). */
  staticPrefixLength?: number;
}

/**
 * The model behind both steps. `configured` is `isLLMConfigured()` and
 * `stream` is `getLLMStream()` with the observability context already bound
 * (one context per question, so its calls share a trace) and the stage
 * passed on as the call's span name; the route builds this from
 * `adapter.ts`, the spec from strings.
 */
export interface AskModel {
  configured: boolean;
  stream(
    systemPrompt: string,
    messages: ChatMessage[],
    call?: AskModelCall,
  ): Promise<AsyncIterable<string>>;
  /** One tool turn (`getLLMToolTurn()`), for agent mode; absent, agent mode does not run. */
  toolTurn?: AskAgentToolTurn;
}

/** One spent question, as `ask_reserve_question()` returned it. */
export interface AskReservation {
  usageId: string;
  used: number;
  /** Null for a platform admin: no limit. */
  cap: number | null;
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
  /**
   * The match page's seat per match (`getAskPageSeats`), for pattern
   * answers' "Watch" links: a link is attached only where the page seats the
   * viewer where Ask does. Without it, no answer carries a link.
   */
  pageSeats?: (matchIds: string[]) => Promise<Map<string, AskPageSeat>>;
  /**
   * The nearest rated (question → plan) pairs to this question
   * (`examples.ts`), shown to the planner; absent or empty, the prompt's
   * fixed examples stand alone. May be a promise: the route passes the
   * retrieval still in flight, so the "planning" status goes out first and
   * the wait overlaps it.
   */
  examples?: readonly AskExample[] | PromiseLike<readonly AskExample[]>;
  /**
   * Agent mode (`agent.ts`, `ASK_AGENT=1`): the planner's first attempt is a
   * bounded tool loop over the connector's read tools. `toolbox` binds them
   * to the database it is handed — the one this question runs on. Absent,
   * or in mock mode, the one-shot planner runs alone.
   */
  agent?: {
    toolbox: (db: AskDatabase) => AskAgentToolbox;
    bounds?: AskAgentBounds;
    /** The loop's clock, for tests. */
    now?: () => number;
    /** The plan reply the loop finished with, as the parser reads it (the eval's shape check). */
    onReply?: (reply: string) => void;
  };
  /**
   * Coach mode (`coach.ts`): decided by the route from the flag, a team scope
   * and the viewer's role in the program. Read only for a team question that
   * asks for advice: the answer prompt may then recommend, and the notice is
   * `coach` instead of `no_advice`.
   */
  coach?: boolean;
}

// ── Sentences the error events carry ─────────────────────────────────────────

export const ASK_CANNOT_ANSWER_MESSAGE = "Your match data can't answer that.";
export const ASK_NO_DATA_MESSAGE =
  "None of your matches fit that question, so there was nothing to compute.";
export const ASK_TEAM_CANNOT_ANSWER_MESSAGE =
  "The program's match data can't answer that.";
export const ASK_TEAM_NO_DATA_MESSAGE =
  "None of the program's matches fit that question, so there was nothing to compute.";
export const ASK_NO_STATS_MESSAGE =
  "The matches that fit that question have no statistics recorded for it, so there was nothing to compare.";

/**
 * The no-data sentence with what was looked for, read from the scope's own
 * name filters: "… Looked for: an opponent named like "eli"." The names are
 * the planner's reading of the question, so they are the asker's own words.
 */
export function noDataMessage(team: boolean, scopeSql: string): string {
  const base = team ? ASK_TEAM_NO_DATA_MESSAGE : ASK_NO_DATA_MESSAGE;
  const looked = scopeNameFilters(scopeSql).map(
    (filter) =>
      `${filter.column === "player_name" ? "a player" : "an opponent"} named like "${filter.core}"`,
  );
  if (/\bplayed_on\b/i.test(scopeSql)) looked.push("the period asked about");
  return looked.length === 0
    ? base
    : `${base} Looked for: ${looked.slice(0, 3).join(", ")}.`;
}
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
    (typeof row.cap !== "number" && row.cap !== null) ||
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
    | "undocumented"
    | "siblings";
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

/** A match count over everything, not over one row's group: it may exceed the scope. */
const WHOLE_COUNT = /^(?:all|total|overall|team|program|career|every)_/;
const MATCH_COUNT = /^[a-z0-9_]+_(?:matches|match_count)$/;

/**
 * A per-group match count holding more matches than the scope selected, by
 * column name; null when every count fits. "Hard Court: 18 matches" over a
 * scope of ten is rows counted, not matches.
 */
export function overcountedMatches(
  rows: readonly AskRow[],
  matchCount: number,
): string | null {
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (column === ASK_SCOPE_COUNT_COLUMN || WHOLE_COUNT.test(column))
        continue;
      if (!MATCH_COUNT.test(column) || typeof value !== "number") continue;
      if (value > matchCount) return column;
    }
  }
  return null;
}

const WON_WORD = /^(?:w|win|won|victory)$/i;
const LOST_WORD = /^(?:l|loss|lost|defeat)$/i;

/**
 * A list of matches whose result came back as a word — `result: 'Win'` —
 * with `i_won` beside it, so the server's own retelling of a match list
 * (`buildMatchListAnswer`) and the win/loss strip can read it. Rows that
 * already carry `i_won`, or are not matches, are returned as they are.
 */
export function withResultFlags(rows: readonly AskRow[]): AskRow[] {
  const worded = rows.every(
    (row) =>
      !("i_won" in row) &&
      typeof row.played_on === "string" &&
      typeof row.opponent_name === "string" &&
      (row.result === null ||
        (typeof row.result === "string" &&
          (WON_WORD.test(row.result.trim()) ||
            LOST_WORD.test(row.result.trim())))),
  );
  if (!worded || rows.length === 0) return [...rows];
  return rows.map((row) => ({
    ...row,
    i_won:
      typeof row.result === "string" ? WON_WORD.test(row.result.trim()) : null,
  }));
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
  if (!refersBack(question)) return null;
  if (
    /player_name/i.test(scopeSql) ||
    /match_id\s+in\s*\(\s*'/i.test(scopeSql)
  ) {
    return null;
  }
  const filter = /player_name\s+ilike\s+'([^']+)'/i.exec(previous.scope_sql);
  if (!filter) {
    // The previous scope was a tag's match ids: the same rule, with the ids.
    const ids = /match_id\s+in\s*\(\s*'[^)]*\)/i.exec(previous.scope_sql);
    return ids
      ? `scope_sql does not keep the matches of the previous question, but the question refers back to them. A follow-up that names no player keeps the previous scope: restrict scope_sql to ${ids[0]}.`
      : null;
  }
  return `scope_sql does not filter on player_name, but the question refers back to the player of the previous question (player_name ilike '${filter[1]}'). A follow-up that names no player keeps the previous scope's player: add player_name ilike '${filter[1]}' to scope_sql.`;
}

/** Whether a question points back at the previous one's player or matches with a pronoun. */
export function refersBack(question: string): boolean {
  return /\b(?:she|he|her|hers|his|him|they|their|them)\b/i.test(question);
}

// ── Names in a scope ─────────────────────────────────────────────────────────

/** A name a scope filters on: `player_name ilike '%rudy%'` → `rudy`. */
export interface AskScopeNameFilter {
  column: "player_name" | "opponent_name";
  /** The literal without its wildcards, lowercased. */
  core: string;
}

/** Every player or opponent name `scope_sql` filters on. */
export function scopeNameFilters(scopeSql: string): AskScopeNameFilter[] {
  const filters: AskScopeNameFilter[] = [];
  for (const match of scopeSql.matchAll(
    /\b(player_name|opponent_name)\s+(?:not\s+)?(?:i?like|=)\s+'([^']*)'/gi,
  )) {
    const core = match[2].replace(/[%_]/g, " ").trim().toLowerCase();
    if (core.length < 2) continue;
    filters.push({
      column: match[1].toLowerCase() as AskScopeNameFilter["column"],
      core,
    });
  }
  return filters;
}

function isExampleName(core: string): boolean {
  return ASK_PLAN_EXAMPLE_NAMES.some((name) => {
    const example = name.toLowerCase();
    return (
      example.startsWith(core) || (core.length >= 4 && core.startsWith(example))
    );
  });
}

/**
 * A name `scope_sql` filters on that the planner cannot have read anywhere:
 * not in the question, its tags, the conversation or the previous scope.
 * `known` is all of those as one string. A planner only knows the names it
 * was shown, so such a name was made up or — `example` — copied out of the
 * prompt's own worked examples. Null when every name is accounted for; the
 * first four letters are enough, since the prompt asks for a name's opening
 * letters and a typed name may be misspelt.
 */
export function foreignScopeName(
  scopeSql: string,
  known: string,
): { core: string; example: boolean } | null {
  const text = known.toLowerCase();
  for (const { core } of scopeNameFilters(scopeSql)) {
    if (text.includes(core)) continue;
    // A placeholder is matched whole: "playera" is not accounted for by the
    // word "player" in a tag's label.
    const example = isExampleName(core);
    if (!example && core.length >= 4 && text.includes(core.slice(0, 4))) {
      continue;
    }
    return { core, example };
  }
  return null;
}

/** What the planner is told about a name in its scope that nobody mentioned. */
export function foreignNameReason(core: string): string {
  return `scope_sql filters on the name '${core}', which is not in the question, its tags or the conversation. Names in the examples (PlayerA, PlayerB, OpponentX) are placeholders, never data. Filter only on a name the question or the conversation gives; a follow-up that names nobody keeps the previous scope_sql, and a question that names nobody at all is about every match.`;
}

/** Scope columns that mean the question chose its own matches; a scope naming one is never swapped for the previous turn's. */
const OWN_FILTER =
  /\b(?:played_on|court_type|match_type|opponent_hand|opponent_backhand|tournament|round|i_won|score_text|limit)\b/i;

/**
 * Whether a follow-up whose scope found no match may be rerun over the
 * previous turn's scope: the question has no tag, the scope names nobody the
 * question itself names, and it filters on nothing but names and ids — no
 * period, surface or other filter of its own.
 */
export function inheritsPreviousScope(
  question: string,
  hasTags: boolean,
  previous: AskPreviousPlan | null,
  scopeSql: string,
): boolean {
  if (!previous || hasTags) return false;
  if (previous.scope_sql.trim() === scopeSql.trim()) return false;
  if (OWN_FILTER.test(scopeSql)) return false;
  const text = question.toLowerCase();
  return scopeNameFilters(scopeSql).every(
    (filter) =>
      !text.includes(filter.core) &&
      !(filter.core.length >= 4 && text.includes(filter.core.slice(0, 4))),
  );
}

/**
 * A team scope that asks for one player's matches against one opponent:
 * both names (the player's null when it came from a tag's match ids), or
 * null for any other scope.
 */
export function playerOpponentScope(
  scopeSql: string,
): { player: string | null; opponent: string; opponentPattern: string } | null {
  const opponent = /\bopponent_name\s+ilike\s+'([^']+)'/i.exec(scopeSql);
  if (!opponent) return null;
  const player = /\bplayer_name\s+ilike\s+'([^']+)'/i.exec(scopeSql);
  if (!player && !/match_id\s+in\s*\(\s*'/i.test(scopeSql)) return null;
  if (/\bor\b/i.test(scopeSql)) return null;
  return {
    player: player ? player[1] : null,
    opponent: opponent[1].replace(/[%_]/g, " ").trim(),
    opponentPattern: opponent[1],
  };
}

export const ASK_ALL_MATCHES_SCOPE = "select match_id from ask.matches";

/** The scope a question's tags name — exactly their match ids — or null without tags. */
export function scopeFromTags(tags: AskResolvedTags): string | null {
  const ids = tags.matchIds.filter((id) => UUID_RE.test(id));
  return ids.length === 0
    ? null
    : `${ASK_ALL_MATCHES_SCOPE} where match_id in (${ids.map((id) => `'${id}'`).join(", ")})`;
}

/**
 * Whether a planned scope dropped the question's tags: the question carries
 * tags, and the scope names none of their match ids and narrows by nothing
 * but `has_stats`. "Show me all the aces" on a tagged match is still about
 * that match — "all" is every ace in it, not every match. A scope that
 * narrows by anything else — a tag's name (`opponent_name ilike …`), a
 * surface, a period — is the planner's to keep.
 */
export function ignoresTags(scopeSql: string, tags: AskResolvedTags): boolean {
  const ids = tags.matchIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return false;
  const lower = scopeSql.toLowerCase();
  if (ids.some((id) => lower.includes(id.toLowerCase()))) return false;
  return !scopeIsNarrowed(
    scopeSql.replace(/\bwhere\s+(?:\w+\.)?has_stats(?:\s*=\s*true)?\s*$/i, ""),
  );
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
    const compare = compareKindOfSql(sql);
    // The state that answer saved (`thread-state.ts`), when it saved one.
    const state = readAskThreadState(record?.state);
    const plan: AskPreviousPlan = compare
      ? { scope_sql: scopeSql, sql: null, compare }
      : { scope_sql: scopeSql, sql: sql === ASK_REVIEW_SQL ? null : sql };
    return state ? { ...plan, state } : plan;
  }
  return null;
}

/** A comparison the planner chose: which one, and what it asked to narrow the measures to. */
interface CompareRequest {
  kind: AskCompareKind;
  measures: unknown;
}

type PlanStep =
  /**
   * `review` marks a plan whose sql is the server's own `ASK_REVIEW_SQL`;
   * `compare` one whose sql is a comparison query of `compare.ts`.
   */
  | {
      ok: true;
      plan: AskPlanQuery;
      review: boolean;
      compare: CompareRequest | null;
      reply: string;
      /** True when the server chose the plan itself: nothing to send back to the planner. */
      forced?: boolean;
      /** Set when the sql is `plays.ts`'s losing-plays query, for this side. */
      plays?: AskPlaysSubject;
      /** With `plays`: the winning plays' query rather than the losing plays'. */
      winning?: boolean;
      /** Set when the sql is `pattern.ts`'s query for this pattern. */
      pattern?: AskPattern;
      /** Set when the sql is `serve-plus-one.ts`'s breakdown, for this request. */
      plusOne?: AskServePlusOne;
    }
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
  const { model, scope } = input;
  const team = scope.kind === "team";
  const agentOn = Boolean(input.agent && model.configured && model.toolTurn);
  // In agent mode the plan is usually a query the loop already ran
  // (`finish` with a query_id), so the question's query results are kept
  // and an identical query is answered from them rather than sent again.
  const db = agentOn ? withQueryMemo(input.db) : input.db;
  // Agent mode (`agent.ts`): the read tools, bound to this question's
  // database — the run record's counting wrapper, when there is one.
  const agentToolbox = agentOn && input.agent ? input.agent.toolbox(db) : null;
  // Coach mode is a team matter; a personal flag, however it got there, is nothing.
  const coach = team && input.coach === true;
  /** The state the planner last wrote (`thread-state.ts`): saved with the answer for the next turn. */
  const planState: { value: AskThreadState | null } = { value: null };
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
    const examples = model.configured ? ((await input.examples) ?? []) : [];
    const systemPrompt = model.configured
      ? buildPlanPrompt({
          today,
          tags: input.tags.prompt,
          conversation: input.conversation,
          previousPlan: input.previousPlan ?? null,
          question: input.question,
          examples,
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
    // A shot pattern, read once by the reading step (`pattern.ts`). Never in
    // mock mode: its plan is fixed and there is no model to read with.
    const patternAsked =
      model.configured &&
      asksForPattern(input.question) &&
      // "All his serve +1 patterns" is the breakdown, not one pattern.
      !asksForServePlusOne(input.question) &&
      (!asksForLosingPlays(input.question) || namesSequence(input.question));
    let patternRead = false;
    /**
     * The matches a "Watch" link may be attached to: those the page seats the
     * viewer in exactly where Ask does, read off the same point — Ask's
     * `i_served` against the page's server seat.
     */
    const linkableMatches = async (
      rows: readonly AskRow[],
      scopeSql: string,
    ): Promise<Set<string>> => {
      const ids = rows.flatMap((row) =>
        typeof row.match_id === "string" &&
        typeof row.points === "number" &&
        row.points > 0 &&
        isUuid(row.match_id)
          ? [row.match_id]
          : [],
      );
      if (ids.length === 0 || !input.pageSeats) return new Set();
      const seats = await input.pageSeats(ids).catch(() => null);
      if (!seats || seats.size === 0) return new Set();
      const checks = [...seats].map(
        ([id, seat]) =>
          `(p.match_id = '${id}' and p.point_number = ${Math.trunc(seat.pointNumber)})`,
      );
      const read = await runQuery(
        db,
        {
          scope_sql: scopeSql,
          sql: `select p.match_id, p.i_served from ask.points p where p.match_id in (select match_id from scope) and (${checks.join(" or ")})`,
          asks_for_advice: false,
        },
        scope,
      );
      if (!read.ok) return new Set();
      const linkable = new Set<string>();
      for (const row of read.result.rows) {
        const seat =
          typeof row.match_id === "string" ? seats.get(row.match_id) : null;
        if (!seat || typeof row.i_served !== "boolean") continue;
        const mineIsPlayer1 = row.i_served
          ? seat.serverIsPlayer1
          : !seat.serverIsPlayer1;
        if (mineIsPlayer1 === seat.youIsPlayer1) {
          linkable.add(row.match_id as string);
        }
      }
      return linkable;
    };
    const readPattern = async (): Promise<AskPatternReading> => {
      const opponentTag = input.tags.prompt.find(
        (tag) => tag.kind === "opponent",
      );
      const playerTag = input.tags.prompt.find((tag) => tag.kind === "player");
      try {
        const reply = await collect(
          await model.stream(
            buildPatternPrompt({
              names: {
                mine: team
                  ? playerTag?.kind === "player"
                    ? playerTag.playerName
                    : "the program's player"
                  : "you",
                opponent:
                  opponentTag?.kind === "opponent"
                    ? opponentTag.opponentName
                    : "the opponent",
              },
              roster: [],
              team,
            }),
            [{ role: "user", content: input.question }],
            { stage: "pattern", temperature: 0 },
          ),
        );
        return readPatternReply(reply);
      } catch {
        return { kind: "none" };
      }
    };
    // A first result that ran but whose baselines all equalled the scoped
    // figures, with those columns already left out. If the planner's second
    // try fails in any way, this is the answer: a result without a baseline
    // is better than no answer.
    let fallback: { plan: AskPlanQuery; result: QueryResult } | null = null;
    /** Why a result with matches in scope could still not be answered. */
    let emptyReason: string | null = null;
    let foreignSentBack = false;
    let misfitSentBack = false;
    let overcountSentBack = false;
    const previous = input.previousPlan ?? null;
    const hasTags = input.tags.prompt.length > 0;
    const tagScope = scopeFromTags(input.tags);
    /** Everything a name in a scope could have been read from. */
    const known = [
      input.question,
      ...input.tags.prompt.map((tag) =>
        tag.kind === "player"
          ? tag.playerName
          : tag.kind === "opponent"
            ? tag.opponentName
            : `${tag.opponentName ?? ""} ${tag.playerName ?? ""}`,
      ),
      ...input.conversation.map((turn) => turn.content),
      previous?.scope_sql ?? "",
    ].join("\n");

    // "And against right-handers?": a follow-up that only moves the
    // previous question. What it measures is read from that question.
    const moved = previous !== null && movesPreviousQuestion(input.question);
    const measureText = moved
      ? `${[...input.conversation].reverse().find((turn) => turn.role === "user")?.content ?? ""} ${input.question}`
      : input.question;

    // The serve +1 breakdown, asked now or carried on from the last answer.
    const previousPlusOne = servePlusOneRequestOfSql(previous?.sql ?? null);
    const plusOneContinued =
      previousPlusOne !== null &&
      !asksForServePlusOne(input.question) &&
      continuesServePlusOne(input.question);
    const plusOne: AskServePlusOne | null = asksForServePlusOne(input.question)
      ? servePlusOneRequest(input.question, input.tags.prompt, team)
      : plusOneContinued && previousPlusOne
        ? // "Can you divide that by sides?": the same breakdown, with the
          // side this question names (or none, which keeps the last one's).
          plusOneWithSides(previousPlusOne, plusOneSides(input.question))
        : null;

    // Three refusals the server does not accept, and one choice it makes
    // itself (`compare.ts`). Never in mock mode, whose plan is fixed.
    const reroute = (step: PlanStep): PlanStep => {
      if (!model.configured) return step;
      const refused = !step.ok && "refusal" in step;
      const forced = (
        plan: AskPlanQuery,
        review: boolean,
        compare: CompareRequest | null,
        plays?: AskPlaysSubject,
        plusOne?: AskServePlusOne,
        winning?: boolean,
      ): PlanStep => ({
        ok: true,
        plan,
        review,
        compare,
        forced: true,
        ...(plays ? { plays } : {}),
        ...(winning ? { winning } : {}),
        ...(plusOne ? { plusOne } : {}),
        reply: JSON.stringify(
          review
            ? { review: true, scope_sql: plan.scope_sql }
            : { compare: compare?.kind, scope_sql: plan.scope_sql },
        ),
      });
      // "What are Rudy's serve +1 patterns?": every serve and the next shot,
      // by zone, stroke and direction, from the shots — or a follow-up to
      // that answer asking for more of it ("a table of all the plays
      // compared?"), which keeps its player when it names no other.
      if (plusOne !== null && (step.ok || refused)) {
        const planned = step.ok ? step.plan.scope_sql : null;
        const scopeSql =
          plusOneContinued && previous !== null
            ? planned === null || planned === ASK_ALL_MATCHES_SCOPE
              ? previous.scope_sql
              : planned
            : (planned ??
              tagScope ??
              previous?.scope_sql ??
              ASK_ALL_MATCHES_SCOPE);
        return forced(
          {
            scope_sql: scopeSql,
            sql: servePlusOneSql(plusOne),
            asks_for_advice: step.ok ? step.plan.asks_for_advice : false,
          },
          false,
          null,
          undefined,
          plusOne,
        );
      }
      // "What are Eli's losing plays?": strokes and directions, from the
      // shots. Only the planner's scope is kept — the fixed comparisons read
      // match totals and cannot say which shot a point was lost on.
      if (
        !patternAsked &&
        asksForLosingPlays(input.question) &&
        // A side named ("on the ad side") is the planner's to answer: the
        // fixed plays answers count the whole match and would drop it.
        !namesASide(input.question) &&
        // So is a rally length: the losing plays count every point.
        rallyLengthOf(input.question) === null &&
        (step.ok || refused)
      ) {
        const subject = losingPlaysSubject(
          input.question,
          input.tags.prompt,
          team,
        );
        return forced(
          {
            scope_sql: step.ok
              ? step.plan.scope_sql
              : (tagScope ?? previous?.scope_sql ?? ASK_ALL_MATCHES_SCOPE),
            sql: losingPlaysSql(subject),
            asks_for_advice: step.ok ? step.plan.asks_for_advice : false,
          },
          false,
          null,
          subject,
        );
      }
      // "What are this player's best plays?": the strokes and directions that
      // won points — winners, and the shot before the other side's miss.
      if (
        !patternAsked &&
        asksForWinningPlays(input.question) &&
        // A side named ("on the ad side") is the planner's to answer: the
        // fixed plays answers count the whole match and would drop it.
        !namesASide(input.question) &&
        (step.ok || refused)
      ) {
        const subject = winningPlaysSubject(
          input.question,
          input.tags.prompt,
          team,
        );
        return forced(
          {
            scope_sql: step.ok
              ? step.plan.scope_sql
              : (tagScope ?? previous?.scope_sql ?? ASK_ALL_MATCHES_SCOPE),
            // "Best plays in short rallies": only the points of that length.
            sql: winningPlaysSql(subject, rallyLengthOf(input.question)),
            asks_for_advice: step.ok ? step.plan.asks_for_advice : false,
          },
          false,
          null,
          subject,
          undefined,
          true,
        );
      }
      // "What should Rudy practice?" is the review of that scope, never
      // "practice sessions are not recorded".
      if (refused && asksWhatToWorkOn(input.question)) {
        return forced(
          {
            scope_sql: tagScope ?? ASK_ALL_MATCHES_SCOPE,
            sql: ASK_REVIEW_SQL,
            asks_for_advice: true,
          },
          true,
          null,
        );
      }
      if (team && asksToComparePlayers(input.question)) {
        // A comparison of players is never refused, and a vague quality
        // word ("most consistent") is never the planner's to interpret.
        const players = (scopeSql: string, advice: boolean) =>
          forced(
            {
              scope_sql: scopeSql,
              sql: compareSql("players", true),
              asks_for_advice: advice,
            },
            false,
            { kind: "players", measures: null },
          );
        if (refused) return players(tagScope ?? ASK_ALL_MATCHES_SCOPE, false);
        if (
          step.ok &&
          !step.review &&
          step.compare?.kind !== "players" &&
          askQuality(input.question) !== null
        ) {
          return players(step.plan.scope_sql, step.plan.asks_for_advice);
        }
      }
      // "What happened in …", "why did we lose": the comparison with the
      // opponents over the planner's own scope, not a query it made up.
      if (
        step.ok &&
        !step.review &&
        step.compare === null &&
        asksWhatHappened(input.question)
      ) {
        return forced(
          {
            scope_sql: step.plan.scope_sql,
            sql: compareSql("opponent", team),
            asks_for_advice: step.plan.asks_for_advice,
          },
          false,
          { kind: "opponent", measures: null },
        );
      }
      return step;
    };

    /**
     * A comparison's answer from the rows its query returned. A kind that
     * cannot be written falls through to the next: players (fewer than two
     * with statistics) → that scope against all matches → against the
     * opponents. Null when no match in scope has the figures asked for.
     */
    const compareAnswer = async (
      request: CompareRequest,
      planned: AskPlanQuery,
      first: QueryResult,
      extra: { lead?: string[]; extraRow?: AskRow },
    ): Promise<{
      plan: AskPlanQuery;
      result: QueryResult;
      text: string;
    } | null> => {
      const selection = selectCompareMeasures(measureText, request.measures);
      let kind: AskCompareKind =
        !team && request.kind === "players" ? "opponent" : request.kind;
      let current = planned;
      // Strengths and weaknesses are read against the opponents, whatever
      // the planner chose.
      if (kind === "baseline" && asksForStrengths(measureText)) {
        kind = "opponent";
        current = { ...current, sql: compareSql(kind, team) };
        const again = await runQuery(db, current, scope);
        if (!again.ok || again.result.matches.length === 0) return null;
        first = again.result;
      }
      let ran = first;
      for (let hop = 0; hop < ASK_COMPARE_KINDS.length; hop += 1) {
        const matchCount = ran.matches.length;
        const perMatch = kind === "opponent" && selection.perMatch;
        const rows = withScopeCount(
          projectCompareRows(
            ran.rows,
            kind,
            selection.measures,
            team,
            perMatch,
          ),
          matchCount,
        );
        const columns = selection.measures.map((measure) => ({
          column: compareColumn(measure, kind, perMatch),
          percentage: measure.denominator !== undefined,
        }));
        const notes = [
          ...(selection.quality
            ? [
                qualityNote(
                  selection.quality,
                  columns.map((entry) => {
                    const label = pairLabel(entry.column);
                    return label.charAt(0).toLowerCase() + label.slice(1);
                  }),
                ),
              ]
            : []),
          // Always, not `unforcedErrorsNotes`: these queries sum forced_errors
          // plainly, so a figure beside it does not vouch for every match.
          ...(selection.measures.some(
            (measure) => measure.key === "unforced_errors",
          )
            ? [ASK_UNFORCED_ERRORS_NOTE]
            : []),
        ];
        let written: { text: string; rows: AskRow[] } | null = null;
        if (kind === "players") {
          written = buildPlayersAnswer(namedPlayerRows(rows, input.question), {
            matchCount,
            measures: columns,
            explicit: selection.explicit,
            notes,
          });
        } else if (
          kind === "opponent" ||
          (scopeIsNarrowed(current.scope_sql) &&
            !baselineIsWholeScope(ran.rows[0]) &&
            equalBaselineColumns(rows, 1) === null)
        ) {
          written = buildPairedAnswer(rows, {
            team,
            matchCount,
            opponentName: onlyName(
              ran.matches.map((match) => match.opponentName),
            ),
            playerName: team
              ? onlyName(ran.matches.map((match) => match.playerName))
              : null,
            notes,
            ...(extra.lead
              ? { lead: extra.lead, extraRow: extra.extraRow ?? {} }
              : {
                  record: {
                    won: ran.matches.filter((match) => match.iWon === true)
                      .length,
                    lost: ran.matches.filter((match) => match.iWon === false)
                      .length,
                  },
                }),
          });
        }
        if (written !== null) {
          return {
            plan: current,
            result: { matches: ran.matches, rows: written.rows },
            text: written.text,
          };
        }
        if (kind === "opponent") return null;
        kind = kind === "players" ? "baseline" : "opponent";
        current = { ...current, sql: compareSql(kind, team) };
        const next = await runQuery(db, current, scope);
        if (!next.ok || next.result.matches.length === 0) return null;
        ran = next.result;
      }
      return null;
    };

    /**
     * "How should Rudy play against Eli?" when the two never met: the
     * program's matches against that opponent, compared with the fixed
     * query, behind a first sentence that says so. Null when the opponent
     * is in none of the program's matches either.
     */
    const absentMatchup = async (
      matchup: NonNullable<ReturnType<typeof playerOpponentScope>>,
      planned: AskPlanQuery,
    ) => {
      const scopeSql = `${ASK_ALL_MATCHES_SCOPE} where opponent_name ilike '${matchup.opponentPattern}'`;
      const retry: AskPlanQuery = {
        scope_sql: scopeSql,
        sql: ASK_COMPARE_OPPONENT_SQL,
        asks_for_advice: planned.asks_for_advice,
      };
      if (!checkAskSql({ scopeSql, sql: retry.sql }).ok) return null;
      const against = await runQuery(db, retry, scope);
      if (!against.ok || against.result.matches.length === 0) return null;
      // The player's name as the roster spells it: from the tag, or from
      // the matches their own filter finds.
      let absentName: string | null =
        input.tags.prompt.flatMap((tag) =>
          tag.kind === "player" ? [tag.playerName] : [],
        )[0] ?? null;
      if (absentName === null && matchup.player !== null) {
        const theirs = await runQuery(
          db,
          {
            scope_sql: `${ASK_ALL_MATCHES_SCOPE} where player_name ilike '${matchup.player}'`,
            sql: "select count(*) as scope_matches from scope",
            asks_for_advice: false,
          },
          scope,
        );
        absentName = theirs.ok
          ? onlyName(theirs.result.matches.map((match) => match.playerName))
          : null;
      }
      const newestFirst = [...against.result.matches].sort((a, b) =>
        String(b.playedOn ?? "").localeCompare(String(a.playedOn ?? "")),
      );
      const ordered = { matches: newestFirst, rows: against.result.rows };
      return compareAnswer(
        { kind: "opponent", measures: null },
        retry,
        ordered,
        absentMatchupLead(newestFirst, absentName),
      );
    };

    // Two tries for a query that ran and was sent back for what it measured.
    // A third only for a query that never ran: one refused by the guard or
    // by the database, or a reply that could not be read. The soft checks
    // below fire on the first try alone, so a second or third result stands.
    for (
      let attempt = 0;
      attempt < MAX_PLAN_ATTEMPTS && result === null;
      attempt += 1
    ) {
      let step = reroute(
        attempt === 0 && agentToolbox !== null && model.toolTurn
          ? yield* agentPlanOnce(
              model,
              model.toolTurn,
              agentToolbox,
              systemPrompt,
              messages,
              cannotAnswer,
              team,
              planState,
              {
                bounds: input.agent?.bounds,
                now: input.agent?.now,
                onReply: input.agent?.onReply,
              },
            )
          : await planOnce(
              model,
              systemPrompt,
              messages,
              cannotAnswer,
              team,
              planState,
            ),
      );
      // A shot pattern is read into a fixed form by the model and queried by
      // the server (`pattern.ts`); only the planner's scope is kept. Read
      // once: a reading that fails leaves the planner's own step.
      if (patternAsked && !patternRead && (step.ok || "refusal" in step)) {
        patternRead = true;
        const reading = await readPattern();
        if (reading.kind === "clarify") {
          await release();
          yield {
            type: "error",
            code: "needs_clarification",
            error: reading.question,
            options: reading.options,
          };
          return;
        }
        if (reading.kind === "pattern") {
          step = {
            ok: true,
            plan: {
              scope_sql: step.ok
                ? step.plan.scope_sql
                : (tagScope ?? ASK_ALL_MATCHES_SCOPE),
              sql: patternSql(reading.pattern),
              asks_for_advice: step.ok ? step.plan.asks_for_advice : false,
            },
            review: false,
            compare: null,
            forced: true,
            pattern: reading.pattern,
            reply: JSON.stringify({ pattern: reading.pattern }),
          };
        }
      }
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
          // A question about shots or plays the planner could not place is
          // asked back with the answers Ask has for one — never a dead end.
          if (model.configured && asksAboutPlays(input.question)) {
            await release();
            yield {
              type: "error",
              code: "needs_clarification",
              error: ASK_PLAYS_CLARIFY_QUESTION,
              options: [...ASK_PLAYS_CLARIFY_OPTIONS],
            };
            return;
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
        if (model.configured && asksAboutPlays(input.question)) {
          await release();
          yield {
            type: "error",
            code: "needs_clarification",
            error: ASK_PLAYS_CLARIFY_QUESTION,
            options: [...ASK_PLAYS_CLARIFY_OPTIONS],
          };
          return;
        }
        yield await fail("cannot_answer", cannotAnswer);
        return;
      }

      // The stored spelling of the shot values, whatever case the planner
      // typed: `zone = 't'` matches no row and reads as "no serves went there".
      // "And against right-handers?" after a query the planner wrote keeps
      // that query: a comparison chosen instead would measure something
      // else under the same question.
      // After one of the app's own comparisons it keeps that comparison,
      // with the measures the earlier question named.
      if (!step.review && !step.forced && moved && previous !== null) {
        if (previous.sql !== null && step.compare !== null) {
          step.plan.sql = previous.sql;
          step.compare = null;
        } else if (previous.compare) {
          const kind: AskCompareKind =
            !team && previous.compare === "players"
              ? "opponent"
              : previous.compare;
          step.plan.sql = compareSql(kind, team);
          step.compare = { kind, measures: null };
        }
      }
      const free =
        !step.review &&
        step.compare === null &&
        step.plays === undefined &&
        step.pattern === undefined;
      if (free) {
        step.plan.sql = withStoredSpelling(step.plan.sql);
        step.plan.scope_sql = withStoredSpelling(step.plan.scope_sql);
      }
      // A follow-up about "his" or "her" whose scope came back as every
      // match keeps the previous turn's scope: there is nothing in the new
      // one to keep.
      if (
        previous &&
        !hasTags &&
        refersBack(input.question) &&
        !scopeIsNarrowed(step.plan.scope_sql) &&
        scopeIsNarrowed(previous.scope_sql)
      ) {
        step.plan.scope_sql = previous.scope_sql;
      }
      // A name nobody mentioned. Sent back once; an example's placeholder
      // that comes back again is replaced by the previous turn's scope, the
      // tags' or every match.
      const foreign = foreignScopeName(step.plan.scope_sql, known);
      if (foreign !== null && foreignSentBack && foreign.example) {
        step.plan.scope_sql =
          previous?.scope_sql ?? tagScope ?? ASK_ALL_MATCHES_SCOPE;
      }
      // A tagged question planned over matches its tags do not name is
      // answered over exactly the tagged matches: a question answered
      // without its tags is a different question (`tags.ts`).
      if (
        tagScope !== null &&
        !step.review &&
        ignoresTags(step.plan.scope_sql, input.tags)
      ) {
        step.plan.scope_sql = tagScope;
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
      // A comparison the planner chose for a question it cannot answer —
      // two groups of matches against each other, or where a ball was hit.
      // Told back once; the second time it stands.
      const misfit =
        step.compare !== null && !step.forced && !misfitSentBack
          ? compareMisfit(input.question)
          : null;
      const check: typeof guard = !guard.ok
        ? guard
        : free && namesScopeCountColumn(step.plan.sql)
          ? { ok: false, reason: SCOPE_COUNT_COLUMN_REASON }
          : foreign !== null && !foreignSentBack
            ? { ok: false, reason: foreignNameReason(foreign.core) }
            : misfit !== null
              ? { ok: false, reason: misfit }
              : lostPlayer !== null
                ? { ok: false, reason: lostPlayer }
                : attempt === 0 &&
                    free &&
                    ignoresBigPoints(input.question, step.plan.sql)
                  ? { ok: false, reason: BIG_POINTS_REASON }
                  : guard;
      if (guard.ok && foreign !== null) foreignSentBack = true;
      if (misfit !== null) misfitSentBack = true;
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
      // ── No match in scope: two things to try before "no data" ──
      let ran = run.result;
      if (ran.matches.length === 0 && model.configured) {
        const matchup = team ? playerOpponentScope(step.plan.scope_sql) : null;
        if (matchup !== null) {
          // The player has never played that opponent. What IS recorded is
          // the program's matches against them.
          const absent = await absentMatchup(matchup, step.plan);
          if (absent !== null) {
            ({ plan, result } = absent);
            reviewText = absent.text;
            break;
          }
        } else if (
          inheritsPreviousScope(
            input.question,
            hasTags,
            previous,
            step.plan.scope_sql,
          ) &&
          previous
        ) {
          const again = await runQuery(
            db,
            { ...step.plan, scope_sql: previous.scope_sql },
            scope,
          );
          if (again.ok && again.result.matches.length > 0) {
            step.plan.scope_sql = previous.scope_sql;
            ran = again.result;
          }
        }
      }
      if (step.compare !== null && ran.matches.length > 0) {
        // The server's own query: nothing to send back to the planner.
        const compared = await compareAnswer(step.compare, step.plan, ran, {});
        if (compared === null) {
          plan = step.plan;
          result = { matches: ran.matches, rows: [] };
          emptyReason = ASK_NO_STATS_MESSAGE;
          break;
        }
        ({ plan, result } = compared);
        reviewText = compared.text;
        break;
      }
      if (step.pattern !== undefined && ran.matches.length > 0) {
        plan = step.plan;
        const rows = patternAnswerRows(ran.rows, ran.matches.length);
        if (rows === null) {
          result = { matches: ran.matches, rows: [] };
          emptyReason = ASK_NO_SHOTS_MESSAGE;
          break;
        }
        // A team pattern in "my" words over several players' matches is
        // nobody's in particular: asked, whatever the model read.
        const playerAsk = playerAskFor(
          team,
          input.question,
          input.tags.prompt,
          ran.matches,
        );
        if (playerAsk !== null) {
          await release();
          yield {
            type: "error",
            code: "needs_clarification",
            error: playerAsk.question,
            options: playerAsk.options,
          };
          return;
        }
        const names = patternNames(ran.matches);
        const labels = new Map(
          ran.matches.map((match) => [
            match.matchId,
            `${team && match.playerName ? `${match.playerName} vs ` : "vs "}${match.opponentName ?? "opponent"}`,
          ]),
        );
        reviewText = buildPatternAnswer(rows, step.pattern, names, labels);
        result = {
          matches: withPatternLinks(
            ran.matches,
            rows,
            step.pattern,
            await linkableMatches(rows, step.plan.scope_sql),
          ),
          rows,
        };
        break;
      }
      if (step.plusOne !== undefined && ran.matches.length > 0) {
        // The server's own query and answer, like the losing plays.
        plan = step.plan;
        // A team breakdown in "my" words over several players' serves is
        // nobody's in particular: asked, as for a pattern.
        const playerAsk = playerAskFor(
          team,
          input.question,
          input.tags.prompt,
          ran.matches,
        );
        if (playerAsk !== null) {
          await release();
          yield {
            type: "error",
            code: "needs_clarification",
            error: playerAsk.question,
            options: playerAsk.options,
          };
          return;
        }
        const plusOne = step.plusOne;
        const written = buildServePlusOneAnswer(
          ran.rows,
          subjectVoice(plusOne.subject, ran.matches, team),
          plusOne,
        );
        result = {
          matches: ran.matches,
          rows: written === null ? [] : ran.rows,
        };
        if (written === null) {
          emptyReason = ASK_NO_SHOTS_MESSAGE;
        } else {
          reviewText = written;
        }
        break;
      }
      if (step.plays !== undefined && ran.matches.length > 0) {
        // The server's own query and answer. No shot recorded in any match
        // in scope is "no data", said as such — never the match totals.
        plan = step.plan;
        const rows = withScopeCount(ran.rows, ran.matches.length);
        const voice = subjectVoice(step.plays, ran.matches, team);
        const written = step.winning
          ? buildWinningPlaysAnswer(
              rows,
              voice,
              ran.matches.length,
              rallyLengthOfPlaysSql(step.plan.sql),
            )
          : buildLosingPlaysAnswer(rows, voice, ran.matches.length);
        result = { matches: ran.matches, rows: written === null ? [] : rows };
        if (written === null) {
          emptyReason = ASK_NO_SHOTS_MESSAGE;
        } else {
          reviewText = written;
        }
        break;
      }
      let resultRows = ran.rows;
      const same =
        attempt === 0 && !fallback ? identicalSiblings(resultRows) : null;
      if (same !== null) {
        messages.push(
          { role: "assistant", content: step.reply },
          {
            role: "user",
            content: feedback({
              kind: "siblings",
              detail: `The columns ${same.join(", ")} are identical. Count each one from its own rows: a serve's direction is ask.shots.zone ('T', 'Body', 'Wide') on the serve's shot row, joined to ask.points on match_id and point_number; never the match totals in ask.match_stats repeated for every point.`,
            }),
          },
        );
        continue;
      }
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
      // A group's match count above the number of matches in scope has
      // counted rows, not matches: ask.match_stats has two a match. Sent
      // back once; a second time the column is left out.
      const overcounted =
        step.review || !model.configured
          ? null
          : overcountedMatches(resultRows, ran.matches.length);
      if (overcounted !== null) {
        if (
          !overcountSentBack &&
          attempt < MAX_PLAN_ATTEMPTS - 1 &&
          !fallback
        ) {
          overcountSentBack = true;
          messages.push(
            { role: "assistant", content: step.reply },
            {
              role: "user",
              content: feedback({
                kind: "database",
                detail: `The query ran, but ${overcounted} holds more matches than scope selected: it counted rows, and ask.match_stats has two rows per match. Count matches as count(distinct m.match_id), or filter s.side = 'me' before counting.`,
              }),
            },
          );
          continue;
        }
        resultRows = withoutColumns(resultRows, [overcounted]);
      }
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
          ran.matches.length,
        );
        reviewText = buildReviewAnswer(review, classifyReview(review, mode));
        result = { matches: ran.matches, rows };
        break;
      }

      // Every baseline equal to the figure it is compared with, over a scope
      // narrower than all matches: the baseline was summed over scope. Sent
      // back once; the second time the baseline columns are left out.
      // Per-match rows the query returned newest first are turned round:
      // the trend and the win/loss strip are drawn oldest first.
      let rows = oldestFirst(withResultFlags(resultRows));
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
              matches: ran.matches,
              rows: withScopeCount(withOrderSummary(rows), ran.matches.length),
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
          matches: ran.matches,
          rows: withScopeCount(withOrderSummary(rows), ran.matches.length),
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
      yield await fail("no_data", noDataMessage(team, plan.scope_sql));
      return;
    }
    if (emptyReason !== null) {
      yield await fail("no_data", emptyReason);
      return;
    }

    // A pair-shaped result — one row of me_/opp_ or measure/baseline pairs —
    // is written by the server too (`paired.ts`): which side of each pair is
    // higher is worked out in code, so no sentence can say it backwards.
    // Never in mock mode, whose template is the answer there.
    if (reviewText === null && model.configured) {
      const notes = unforcedErrorsNotes(result.rows);
      const paired = buildPairedAnswer(result.rows, {
        team,
        notes,
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
          notes,
        }) ??
        // Or a short list of matches to retell.
        buildMatchListAnswer(result.rows, { team }) ??
        // Or one measure over time.
        buildTrendAnswer(result.rows, {
          matchCount: result.matches.length,
          notes,
        }) ??
        // Or one match point by point, when the question asked how it
        // turned (`momentum.ts`): the shape alone — one row per point of
        // one match — is also what a plain point listing looks like.
        (asksAboutMomentum(input.question)
          ? buildMomentumAnswer(result.rows, {
              team,
              playerName: team
                ? onlyName(result.matches.map((match) => match.playerName))
                : null,
              matchCount: result.matches.length,
            })
          : null);
      if (written !== null) {
        reviewText = written.text;
        result = { matches: result.matches, rows: written.rows };
      }
    }

    // ── Answer ─────────────────────────────────────────────────────────────
    // The matches are settled here — every retry and fallback is behind us —
    // so the page can show "Computed from N matches" while the answer is
    // still being written, not after it was saved.
    yield { type: "sources", matches: result.matches };
    yield { type: "status", stage: "writing" };

    // The variant that may recommend: coach mode, advice asked, and the
    // model writing it. A review is server-written, so it keeps the notice.
    const coached = coach && plan.asks_for_advice && reviewText === null;

    let chunks: AsyncIterable<string>;
    if (reviewText !== null) {
      // Written by the server, not the model: the same syntax, through the
      // same renderer.
      chunks = oneChunk(reviewText);
    } else if (model.configured) {
      try {
        const answerPrompt = buildAnswerPrompt({
          question: input.question,
          rows: result.rows,
          matchCount: result.matches.length,
          // So a follow-up reads as one (`thread-state.ts`).
          previousHeadline: previousHeadlineFromTurns(input.conversation),
          ...(team ? { scope } : {}),
          ...(coached ? { coach: true } : {}),
        });
        chunks = await model.stream(
          answerPrompt,
          [{ role: "user", content: ASK_ANSWER_USER_MESSAGE }],
          {
            stage: "answer",
            staticPrefixLength: askPromptStaticPrefixLength(answerPrompt),
          },
        );
      } catch {
        yield await fail("llm_unavailable", ASK_LLM_UNAVAILABLE_MESSAGE);
        return;
      }
    } else {
      chunks = mockAskAnswerStream(scope);
    }

    const rendered = renderAskAnswer(guardedStream(chunks), result.rows, {
      // A question that asked for a chart gets the visual first (`3.10`).
      chartAsked: asksForChart(input.question),
    });
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
    // shows as `ASK_NO_ADVICE_SENTENCE`. In coach mode (`coach.ts`) the same
    // signal is `coach`: the answer was written by the variant that may
    // recommend, and the client says so instead.
    if (answer.droppedSentences > 0) {
      console.warn(ASK_DROPPED_SENTENCES_LOG, {
        count: answer.droppedSentences,
      });
    }

    // A review always carries the notice: it answers "how can I improve"
    // with what the matches show, whatever the planner flagged.
    const noAdvice = plan.asks_for_advice || reviewed;
    if (noAdvice) {
      yield { type: "notice", notice: coached ? "coach" : "no_advice" };
    }

    // ── Save ───────────────────────────────────────────────────────────────
    // One round trip saves both messages and returns both ids: the
    // conversation's, and the answer's for a thumbs up or down on it.
    const saved = await rpc(db, "ask_save_exchange_ids", {
      p_conversation_id: input.conversationId,
      p_question: savedQuestion(input.question, input.tags),
      p_answer: savedAnswer(answer, result, plan, noAdvice, model.configured, {
        state: planState.value,
        coach: coached,
      }),
      // Named only for a team question: a personal save is the three
      // arguments it always was.
      ...(scope.kind === "team" ? { p_program_id: scope.programId } : {}),
    });
    const ids = savedIds(saved.data);
    if (saved.error || ids === null) {
      console.error("[ask] could not save the exchange", {
        sqlstate: saved.error?.code,
        error: saved.error?.message ?? "ask_save_exchange_ids() answered no id",
      });
      yield await fail("answer_failed", ASK_SAVE_FAILED_MESSAGE);
      return;
    }

    settled = true;
    yield {
      type: "done",
      conversationId: ids.conversationId,
      ...(ids.answerId !== null ? { answerId: ids.answerId } : {}),
      ...(await spentCount(db, input.reservation)),
    };
  } finally {
    // A consumer that stopped reading before `done` — a closed tab — did not
    // receive an answer. Settled paths return at once.
    await release();
  }
}

/**
 * What `ask_save_exchange_ids()` answered: the conversation's id, and the
 * saved answer's when the function could read it back. Null when the
 * conversation id is missing — then nothing was saved that the page could
 * open — while a missing answer id only leaves the feedback control without
 * a target.
 */
function savedIds(
  data: unknown,
): { conversationId: string; answerId: string | null } | null {
  const record = asRecord(data);
  if (!record || typeof record.conversation_id !== "string") return null;
  return {
    conversationId: record.conversation_id,
    answerId: typeof record.answer_id === "string" ? record.answer_id : null,
  };
}

// ── Plan step ────────────────────────────────────────────────────────────────

async function planOnce(
  model: AskModel,
  systemPrompt: string,
  messages: ChatMessage[],
  cannotAnswer: string,
  team: boolean,
  /** Where the reply's `state` is left for the save step; the last reply's wins. */
  state: { value: AskThreadState | null } = { value: null },
): Promise<PlanStep> {
  if (!model.configured) {
    return {
      ok: true,
      plan: ASK_MOCK_PLAN,
      review: false,
      compare: null,
      reply: JSON.stringify(ASK_MOCK_PLAN),
    };
  }

  let reply: string;
  try {
    const chunks = await model.stream(systemPrompt, messages, {
      stage: "plan",
      temperature: 0,
      // A team query with a baseline runs to a few thousand characters; the
      // Anthropic path's default of 1024 tokens would cut it short.
      maxTokens: 4096,
      jsonSchema: ASK_PLAN_REPLY_SCHEMA,
      staticPrefixLength: askPromptStaticPrefixLength(systemPrompt),
    });
    const parts: string[] = [];
    for await (const chunk of chunks) parts.push(chunk);
    reply = parts.join("");
  } catch {
    return { ok: false, unavailable: true };
  }
  return stepOfReply(reply, cannotAnswer, team, state);
}

/**
 * The plan step a reply asks for — the one-shot planner's, or agent mode's
 * finish (`agent.ts`), which carries the same object.
 */
function stepOfReply(
  reply: string,
  cannotAnswer: string,
  team: boolean,
  state: { value: AskThreadState | null },
): PlanStep {
  const parsed = parsePlanReply(reply);
  if (parsed !== null) state.value = parsed.state ?? null;
  if (parsed === null) {
    return {
      ok: false,
      reply,
      problem: {
        kind: "unparseable",
        detail:
          "The reply was not one JSON object with scope_sql and sql, with compare and scope_sql, with review and scope_sql, or with cannot_answer.",
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
      compare: null,
      reply,
    };
  }
  if ("compare" in parsed) {
    // The planner chose the comparison and the matches; the query is the
    // server's. A personal scope has one player: "players" there is the
    // comparison with the opponents.
    const kind: AskCompareKind =
      !team && parsed.compare === "players" ? "opponent" : parsed.compare;
    return {
      ok: true,
      plan: {
        scope_sql: parsed.scope_sql,
        sql: compareSql(kind, team),
        asks_for_advice: parsed.asks_for_advice,
      },
      review: false,
      compare: { kind, measures: parsed.measures ?? null },
      reply,
    };
  }
  return { ok: true, plan: parsed, review: false, compare: null, reply };
}

/**
 * The question's database with its query results kept for the question's
 * life: the same `ask_run_query` / `ask_run_team_query` call with the same
 * arguments is answered from the first one, so a plan the agent already ran
 * is not run twice. A refused or failed call is not kept. Everything else
 * passes straight through.
 */
function withQueryMemo(db: AskDatabase): AskDatabase {
  const kept = new Map<string, Promise<AskRpcResult>>();
  return {
    rpc(fn, args) {
      if (fn !== "ask_run_query" && fn !== "ask_run_team_query") {
        return db.rpc(fn, args);
      }
      const key = JSON.stringify([fn, args ?? null]);
      const hit = kept.get(key);
      if (hit) return hit;
      const result = Promise.resolve(db.rpc(fn, args)).then(
        (answer) => {
          if (answer.error) kept.delete(key);
          return answer;
        },
        (error: unknown) => {
          kept.delete(key);
          throw error;
        },
      );
      kept.set(key, result);
      return result;
    },
  };
}

/**
 * Agent mode's plan step (`agent.ts`): the bounded tool loop, whose finish is
 * read as a plan reply. A loop that ends with nothing to finish on plans the
 * one-shot way, so agent mode never answers worse than no answer.
 */
async function* agentPlanOnce(
  model: AskModel,
  toolTurn: AskAgentToolTurn,
  toolbox: AskAgentToolbox,
  systemPrompt: string,
  messages: ChatMessage[],
  cannotAnswer: string,
  team: boolean,
  state: { value: AskThreadState | null },
  options: {
    bounds?: AskAgentBounds;
    now?: () => number;
    onReply?: (reply: string) => void;
  },
): AsyncGenerator<AskStatusEvent, PlanStep, undefined> {
  const question = messages[0]?.content ?? "";
  const outcome = yield* runAskAgent({
    toolTurn,
    toolbox,
    systemPrompt: `${systemPrompt}${askAgentPromptAppendix(options.bounds ?? ASK_AGENT_BOUNDS)}`,
    question,
    staticPrefixLength: askPromptStaticPrefixLength(systemPrompt),
    bounds: options.bounds,
    now: options.now,
  });
  if (outcome.reply !== null) {
    options.onReply?.(outcome.reply);
    return stepOfReply(outcome.reply, cannotAnswer, team, state);
  }
  return planOnce(model, systemPrompt, messages, cannotAnswer, team, state);
}

const FENCE = /^\s*```[a-zA-Z]*\s*([\s\S]*?)\s*```\s*$/;

/**
 * What a model writes in a required string field it means to leave empty:
 * `cannot_answer` is required by the plan schema, so a plan may arrive with
 * "N/A" or "None" there instead of "".
 */
const PLACEHOLDER = /^(?:n\/?a|none|null|nil|-+|—|\.+)$/i;

function isBlankPlaceholder(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "" || PLACEHOLDER.test(trimmed);
}

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
  // The thread state, when the reply carries one worth keeping; a missing or
  // all-empty one is simply absent, so a reply without it reads as before.
  const state = readAskThreadState(record.state);
  const withState = <T extends object>(plan: T): T =>
    state ? { ...plan, state } : plan;
  // A structured reply may carry every field of the schema, the unused ones
  // empty or filled with a placeholder: neither is a refusal.
  if (
    typeof record.cannot_answer === "string" &&
    !isBlankPlaceholder(record.cannot_answer)
  ) {
    return withState({
      cannot_answer: record.cannot_answer,
      asks_for_advice: advice,
    });
  }
  // The review: `review` exactly true and a scope. Any `sql` beside it is
  // ignored — the query is never the planner's.
  if (
    record.review === true &&
    typeof record.scope_sql === "string" &&
    record.scope_sql.trim() !== ""
  ) {
    return withState({
      review: true as const,
      scope_sql: record.scope_sql,
      asks_for_advice: true,
    });
  }
  // A comparison: `compare` one of the three kinds and a scope. Any `sql`
  // beside it is ignored — the query is never the planner's.
  if (
    typeof record.compare === "string" &&
    (ASK_COMPARE_KINDS as readonly string[]).includes(
      record.compare.trim().toLowerCase(),
    ) &&
    typeof record.scope_sql === "string" &&
    record.scope_sql.trim() !== ""
  ) {
    const measures = Array.isArray(record.measures)
      ? record.measures.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    return withState({
      compare: record.compare.trim().toLowerCase() as AskCompareKind,
      scope_sql: record.scope_sql,
      ...(measures.length > 0 ? { measures } : {}),
      asks_for_advice: advice,
    });
  }
  if (
    typeof record.scope_sql === "string" &&
    record.scope_sql.trim() !== "" &&
    typeof record.sql === "string" &&
    record.sql.trim() !== ""
  ) {
    return withState({
      scope_sql: record.scope_sql,
      sql: record.sql,
      asks_for_advice: advice,
    });
  }
  return null;
}

/** What the planner is told when its last reply could not be used. */
/**
 * The values ask.shots stores in zone, shot_type, result and spin_type, in
 * the spelling it stores them. A comparison is case-sensitive, and the
 * planner writes 't' and 'first serve' often enough to matter.
 */
const STORED_SHOT_VALUES = [
  "T",
  "Body",
  "Wide",
  "Crosscourt",
  "Down the Line",
  "Middle",
  "First Serve",
  "Second Serve",
  "Forehand",
  "Backhand",
  "Forehand Volley",
  "Backhand Volley",
  "Volley",
  "Overhead",
  "Feed",
  "In",
  "Net",
  "Out",
  "Backspin",
  "Flat",
  "Kick",
  "Sidespin",
  "Slice",
  "Topspin",
] as const;

const STORED_BY_LOWER = new Map<string, string>(
  STORED_SHOT_VALUES.map((value) => [value.toLowerCase(), value]),
);

/**
 * One of the four shot columns as the planner writes it — bare, or qualified
 * (`s.zone`, `ask.shots.zone`) — and nothing that merely contains its name:
 * `result_type` and `serve_zone` are other columns.
 */
const SHOT_COLUMN = String.raw`(?<![\w.])(?:\w+\.)*(?:zone|shot_type|result|spin_type)\b`;

const QUOTED = String.raw`'[^'%_]{1,20}'`;
const QUOTED_LITERALS = new RegExp(QUOTED, "g");
const WHEN_LITERAL = new RegExp(String.raw`(\bwhen\s+)(${QUOTED})`, "gi");

/** `zone = 't'`, `s.result <> 'IN'`, `spin_type != 'slice'`. */
const SHOT_EQUALS = new RegExp(
  String.raw`(${SHOT_COLUMN}\s*(?:=|<>|!=)\s*)(${QUOTED})`,
  "gi",
);

/** `shot_type in ('first serve', 'Second Serve')`, and `not in`. */
const SHOT_IN = new RegExp(
  String.raw`(${SHOT_COLUMN}\s+(?:not\s+)?in\s*\()(\s*${QUOTED}(?:\s*,\s*${QUOTED})*\s*)(?=\))`,
  "gi",
);

/** `case s.zone when 't' then … end`, up to its first `end`. */
const SHOT_CASE = new RegExp(
  String.raw`\bcase\s+${SHOT_COLUMN}\s[\s\S]*?\bend\b`,
  "gi",
);

function storedLiteral(literal: string): string {
  const inner = literal.slice(1, -1);
  const stored = STORED_BY_LOWER.get(inner.toLowerCase());
  return stored !== undefined && stored !== inner ? `'${stored}'` : literal;
}

/**
 * The query with each quoted literal that is COMPARED WITH A SHOT COLUMN and
 * names a stored shot value in another case turned to the stored spelling.
 *
 * Only there: after `zone`, `shot_type`, `result` or `spin_type` with `=`,
 * `<>` or `!=`, inside that column's `in (…)` list, and in the `when`s of a
 * `case <column> when '…'`. A literal anywhere else is another column's
 * value and is left alone — respelled, `opponent_name = 'slice'` or
 * `court_type = 'out'` would stop matching the rows it was written for. So
 * is one behind a function (`lower(s.zone) = 't'`), which already compares
 * in the case it asked for, and anything that is a pattern.
 */
export function withStoredSpelling(sql: string): string {
  return sql
    .replace(
      SHOT_EQUALS,
      (_match, head: string, literal: string) => head + storedLiteral(literal),
    )
    .replace(
      SHOT_IN,
      (_match, head: string, list: string) =>
        head + list.replace(QUOTED_LITERALS, storedLiteral),
    )
    .replace(SHOT_CASE, (block) =>
      block.replace(
        WHEN_LITERAL,
        (_match, head: string, literal: string) =>
          head + storedLiteral(literal),
      ),
    );
}

/**
 * The three serve directions, or the three rally lengths, returned as the
 * same number greater than zero: the query counted one thing three times
 * rather than three things. Names the columns, or null.
 */
export function identicalSiblings(rows: readonly AskRow[]): string[] | null {
  if (rows.length !== 1) return null;
  const row = rows[0];
  for (const words of [
    ["t", "body", "wide"],
    ["short", "medium", "long"],
  ]) {
    const groups = new Map<string, { column: string; value: number }[]>();
    for (const [column, value] of Object.entries(row)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const parts = column.split("_");
      const at = parts.findIndex((part) => words.includes(part));
      if (at === -1) continue;
      const key = [...parts.slice(0, at), "*", ...parts.slice(at + 1)].join(
        "_",
      );
      groups.set(key, [...(groups.get(key) ?? []), { column, value }]);
    }
    for (const group of groups.values()) {
      if (
        group.length === words.length &&
        group[0].value > 0 &&
        group.every((entry) => entry.value === group[0].value)
      ) {
        return group.map((entry) => entry.column);
      }
    }
  }
  return null;
}

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
                : problem.kind === "siblings"
                  ? "That query returned the same number for each of three things that are counted separately."
                  : "That reply could not be read.";
  return `${lead} ${oneLine(problem.detail)} Reply again with ONE JSON object and nothing else, following every rule.`;
}

// ── Run step ─────────────────────────────────────────────────────────────────

async function runQuery(
  db: AskDatabase,
  plan: AskPlanQuery,
  scope: AskScope,
): Promise<{ ok: true; result: QueryResult } | { ok: false; error: string }> {
  // Every string that reaches the database is checked HERE, whatever built
  // it: the planner, a canned comparison, a scope carried over from an
  // earlier turn. The earlier turn's scope is read back from a saved answer,
  // and a saved answer is something its owner can write (ask_save_exchange is
  // theirs to call) — so a call site that trusted it would let hand-written
  // SQL through. The callers' own checks are for their error messages; this
  // one is the rule.
  const checked = checkAskSql({ scopeSql: plan.scope_sql, sql: plan.sql });
  if (!checked.ok) {
    return { ok: false, error: `refused by the SQL check: ${checked.reason}` };
  }

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

/** A model reply, whole: the reading step wants JSON, not a stream. */
async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

/** Who a losing-plays or serve +1 answer speaks about: the one name the matches agree on, or a plain word. */
function subjectVoice(
  subject: AskPlaysSubject,
  matches: readonly AskSourceMatch[],
  team: boolean,
) {
  return losingPlaysVoice(
    subject,
    onlyName(
      matches.map((match) =>
        subject === "opponent"
          ? match.opponentName
          : team
            ? match.playerName
            : null,
      ),
    ),
  );
}

/** Asks which player when a team question in "my" words spans several players' matches. */
function playerAskFor(
  team: boolean,
  question: string,
  tags: readonly { kind: string }[],
  matches: readonly AskSourceMatch[],
) {
  return patternNeedsPlayer({
    team,
    question,
    rosterInScope: [
      ...new Set(
        matches.flatMap((match) =>
          match.playerName ? [match.playerName] : [],
        ),
      ),
    ],
    playerTagged: tags.some((tag) => tag.kind === "player"),
  });
}

/** The two sides as a pattern answer names them: one name the matches agree on, or a plain word. */
function patternNames(matches: readonly AskSourceMatch[]): AskPatternNames {
  return {
    mine: onlyName(matches.map((match) => match.playerName)) ?? "you",
    opponent:
      onlyName(matches.map((match) => match.opponentName)) ?? "the opponent",
  };
}

/**
 * Each match the pattern came up in, with a link that opens those points in
 * the match's Video view (`pattern-video.ts`) and the count it opens.
 */
function withPatternLinks(
  matches: readonly AskSourceMatch[],
  rows: readonly AskRow[],
  pattern: AskPattern,
  linkable: ReadonlySet<string>,
): AskSourceMatch[] {
  const points = new Map(
    rows.flatMap((row) =>
      typeof row.match_id === "string" && typeof row.points === "number"
        ? [[row.match_id, row.points] as const]
        : [],
    ),
  );
  return matches.map((match) => {
    const count = points.get(match.matchId) ?? 0;
    // A match whose seats the page and Ask read differently gets no link: its
    // "you" would be the other player.
    if (count === 0 || !linkable.has(match.matchId)) return match;
    const href = patternVideoHref(match.matchId, pattern);
    return href ? { ...match, watch: { href, points: count } } : match;
  });
}

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
  /** True when the question asked for a chart: the page draws the visual first. */
  visualLead?: boolean;
  body: string;
  /** True when the question asked for advice: the client shows the no-advice notice. */
  noAdvice: boolean;
  sources: AskSourceMatch[];
  matchIds: string[];
  sql: string;
  scopeSql: string;
  /** True when no provider was configured and the template answered. */
  mock: boolean;
  /**
   * What the planner said the conversation is about after this answer
   * (`thread-state.ts`); the next turn's plan prompt reads it back. Absent
   * when the planner wrote none.
   */
  state?: AskThreadState;
  /**
   * True when the answer was written in coach mode to a question that asked
   * for advice: it may recommend, so `noAdvice` is false, and a reader may
   * show the coach notice (`ASK_COACH_SENTENCE`) instead. Absent otherwise.
   */
  coach?: true;
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
  thread: { state: AskThreadState | null; coach: boolean } = {
    state: null,
    coach: false,
  },
): AskSavedAnswer {
  const coached = thread.coach;
  return {
    headline: answer.headline,
    figures: answer.figures,
    visual: answer.visual,
    ...(answer.visualLead ? { visualLead: true as const } : {}),
    body: answer.text,
    // A coached answer may recommend: the no-advice sentence would be false.
    noAdvice: coached ? false : noAdvice,
    sources: result.matches,
    matchIds: result.matches.map((match) => match.matchId),
    sql: plan.sql,
    scopeSql: plan.scope_sql,
    mock: !configured,
    ...(thread.state ? { state: thread.state } : {}),
    ...(coached ? { coach: true as const } : {}),
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
): Promise<{ used: number; cap: number | null }> {
  if (reservation) return { used: reservation.used, cap: reservation.cap };
  const { data } = await rpc(db, "ask_quota");
  const row = asRecord(data);
  return typeof row?.used === "number" &&
    (typeof row.cap === "number" || row.cap === null)
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

function oneSentence(text: string): string {
  return oneLine(text).slice(0, MAX_CANNOT_ANSWER_LENGTH);
}
