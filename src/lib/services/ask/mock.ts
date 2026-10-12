import {
  ASK_FIGURE_LINE_PREFIX,
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
} from "@/lib/services/ask/answer-render";
import type { AskPlanQuery } from "@/lib/services/ask/prompts";

/**
 * What Ask runs on when no LLM provider is configured (design "Route → Mock
 * mode", plan step 6).
 *
 * `getLLMStream()` falls back to a fixed warning sentence, which is useless
 * as a query. So when `isLLMConfigured()` is false the route skips both model
 * calls and uses these instead: a fixed plan, and a fixed answer written in
 * the same reference syntax a model's answer uses. The query still runs
 * against the real views through `ask_run_query` and the template still goes
 * through `renderAskAnswer`, so mock mode exercises everything but the model.
 *
 * `tests/ask-prompt.spec.ts` holds the plan against `checkAskSql` and renders
 * the template: no typed digit, no failed reference.
 *
 * Pure: no database, no network, no Next.js.
 */

/**
 * The player's record and second-serve points won across all their matches.
 * One row: `matches`, `wins`, `losses`, `second_serve_won_pct`.
 *
 * The percentage is computed from summed counters, with the same denominator
 * `match_stats_with_percentages` uses (second serves that landed in), so it
 * agrees with the per-match figure the rest of the app shows.
 */
export const ASK_MOCK_PLAN: AskPlanQuery = {
  scope_sql: "select match_id from ask.matches",
  sql: `select
  count(*) as matches,
  coalesce(sum(case when m.i_won then 1 else 0 end), 0) as wins,
  coalesce(sum(case when m.i_won = false then 1 else 0 end), 0) as losses,
  (
    select round(100.0 * sum(s.second_serve_points_won) / nullif(sum(s.second_serves_in), 0), 1)
    from ask.match_stats s
    join scope on scope.match_id = s.match_id
    where s.side = 'me'
  ) as second_serve_won_pct
from ask.matches m
join scope on scope.match_id = m.match_id`,
  asks_for_advice: false,
};

/**
 * The answer mock mode streams in place of a model's. It is written against
 * the one row {@link ASK_MOCK_PLAN} returns and holds no digit of its own:
 * every figure is a cell reference. It carries one `table` block over that
 * row, so mock mode exercises the visual path too. The last paragraph says
 * what this is, so a developer never mistakes it for a reading of the
 * question they typed.
 */
export const ASK_MOCK_ANSWER_TEMPLATE = `Here is your record and how your second serve has held up across every match you have recorded.
${ASK_FIGURE_LINE_PREFIX} Wins = {{r1.wins}}
${ASK_FIGURE_LINE_PREFIX} Losses = {{r1.losses}}
${ASK_FIGURE_LINE_PREFIX} Second-serve points won = {{r1.second_serve_won_pct}}
${ASK_VISUAL_LINE_PREFIX} table ${ASK_VISUAL_FIELD_SEPARATOR} Your record across {{r1.matches}} recorded matches.
COLUMNS: Matches ${ASK_VISUAL_FIELD_SEPARATOR} Wins ${ASK_VISUAL_FIELD_SEPARATOR} Losses
ROW: All matches ${ASK_VISUAL_FIELD_SEPARATOR} {{r1.matches}} ${ASK_VISUAL_FIELD_SEPARATOR} {{r1.wins}} ${ASK_VISUAL_FIELD_SEPARATOR} {{r1.losses}}

Across {{r1.matches}} recorded matches you have won {{r1.wins}} and lost {{r1.losses}}. You won {{r1.second_serve_won_pct}} of the points played on your second serve.

This is a sample answer. No AI provider is configured, so your question was not read; the figures above are still computed from your own matches.`;

/** {@link ASK_MOCK_ANSWER_TEMPLATE} as the stream `renderAskAnswer()` takes. */
export async function* mockAskAnswerStream(): AsyncIterable<string> {
  yield ASK_MOCK_ANSWER_TEMPLATE;
}
