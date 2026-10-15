import { expect, test } from "@playwright/test";

import {
  ASK_ALL_MATCHES_SCOPE,
  ASK_NO_STATS_MESSAGE,
  ASK_TEAM_NO_DATA_MESSAGE,
  type AskDatabase,
  type AskModel,
  type AskQuestionInput,
  type AskRpcResult,
  type AskSavedAnswer,
  askQuestion,
  droppedPlayerFilter,
  foreignScopeName,
  inheritsPreviousScope,
  noDataMessage,
  overcountedMatches,
  parsePlanReply,
  playerOpponentScope,
  previousPlanFromMessages,
  scopeFromTags,
  scopeNameFilters,
  withResultFlags,
} from "@/lib/services/ask/ask";
import {
  type AskRow,
  columnLabel,
  renderAskAnswer,
  statedRows,
} from "@/lib/services/ask/answer-render";
import {
  ASK_COMPARE_ALL_MATCHES,
  ASK_COMPARE_BASELINE_SQL,
  ASK_COMPARE_MEASURES,
  ASK_COMPARE_OPPONENT_SQL,
  ASK_COMPARE_PLAYERS_SQL,
  ASK_COMPARE_SCOPE_MATCHES,
  ASK_COMPARE_TEAM_BASELINE_SQL,
  ASK_QUALITY_MEASURES,
  askQuality,
  asksForStrengths,
  asksToComparePlayers,
  asksWhatHappened,
  asksWhatToWorkOn,
  baselineIsWholeScope,
  compareColumn,
  compareKindOfSql,
  compareMisfit,
  movesPreviousQuestion,
  compareSql,
  plannerMeasures,
  projectCompareRows,
  questionMeasures,
  selectCompareMeasures,
} from "@/lib/services/ask/compare";
import type { AskAnswerEvent, AskEvent } from "@/lib/services/ask/events";
import { comparedPairs } from "@/lib/services/ask/facts";
import { ASK_MOCK_PLAN } from "@/lib/services/ask/mock";
import {
  absentMatchupLead,
  buildPairedAnswer,
  buildPlayersAnswer,
  namedPlayerRows,
} from "@/lib/services/ask/paired";
import {
  ASK_PLAN_EXAMPLE_NAMES,
  buildPlanPrompt,
} from "@/lib/services/ask/prompts";
import { ASK_REVIEW_MEASURES, ASK_REVIEW_SQL } from "@/lib/services/ask/review";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import type { AskResolvedTags } from "@/lib/services/ask/tags";

/**
 * Offline spec for the comparisons the server computes itself
 * (`compare.ts`), the answers `paired.ts` writes for them, and the
 * mechanical routing around the planner in `ask.ts`.
 *
 * What put them there: "How did Rudy do against Aidan Kim?" printed the
 * opponent's first-serve points won as 100% where the match held 71.4% — a
 * planner-written query, in range, that nothing could catch. So the query
 * is a constant now, and these tests hold it, the writers and the routing.
 * No network, no Supabase, no provider.
 */

// ── The canned queries ───────────────────────────────────────────────────────

const SQLS = {
  opponent: ASK_COMPARE_OPPONENT_SQL,
  players: ASK_COMPARE_PLAYERS_SQL,
  baseline: ASK_COMPARE_BASELINE_SQL,
  "team baseline": ASK_COMPARE_TEAM_BASELINE_SQL,
};

/** The columns a query returns: the aliases of its final select, not of its CTEs. */
function aliases(sql: string): string[] {
  const output = sql.slice(sql.lastIndexOf(") select "));
  return [...output.matchAll(/ as ([a-z0-9_]+)/g)].map((match) => match[1]);
}

test.describe("the comparison queries", () => {
  for (const [name, sql] of Object.entries(SQLS)) {
    test(`${name}: a constant that passes the guard over any scope`, () => {
      for (const scopeSql of [
        ASK_ALL_MATCHES_SCOPE,
        "select match_id from ask.matches where opponent_name ilike '%kim%'",
      ]) {
        expect(checkAskSql({ scopeSql, sql })).toEqual({ ok: true });
      }
      expect(sql).toContain("select match_id from scope");
      expect(sql).not.toMatch(/;|--/);
      expect(compareKindOfSql(sql)).toBe(name.replace("team ", ""));
    });
  }

  test("the opponent query returns every measure as a me_/opp_ pair, percentages pooled", () => {
    const names = new Set(aliases(ASK_COMPARE_OPPONENT_SQL));
    for (const measure of ASK_COMPARE_MEASURES) {
      expect(names).toContain(`me_${measure.key}`);
      expect(names).toContain(`opp_${measure.key}`);
    }
    // Summed made over summed attempts, each side from its own row.
    expect(ASK_COMPARE_OPPONENT_SQL).toContain(
      "max(case when a.side = 'opponent' then round(100.0 * a.first_serve_points_won / nullif(a.first_serves_in, 0), 1) end) as opp_first_serve_won_pct",
    );
    expect(ASK_COMPARE_OPPONENT_SQL).toContain(
      "max(case when a.side = 'opponent' then round(100.0 * a.second_serve_points_won / nullif(a.second_serves_in, 0), 1) end) as opp_second_serve_won_pct",
    );
    expect(ASK_COMPARE_OPPONENT_SQL).toContain(
      "round(100.0 * (a.first_return_points_won + a.second_return_points_won) / nullif((a.first_returns + a.second_returns), 0), 1) end) as me_return_won_pct",
    );
    expect(ASK_COMPARE_OPPONENT_SQL).toContain(
      "max(case when a.side = 'me' then a.winners end) as me_winners",
    );
    expect(ASK_COMPARE_OPPONENT_SQL).toContain("group by s.side");
    // Every pair reads as an opponent pair to the server's own convention.
    const row = Object.fromEntries([...names].map((name) => [name, 1]));
    const pairs = comparedPairs(row);
    expect(pairs.length).toBeGreaterThanOrEqual(ASK_COMPARE_MEASURES.length);
    expect(pairs.every((pair) => pair.kind === "opponent")).toBe(true);
  });

  test("the review's percentages are the same pairs of counters", () => {
    for (const review of ASK_REVIEW_MEASURES) {
      const measure = ASK_COMPARE_MEASURES.find(
        (entry) => entry.key === review.key,
      );
      if (!measure) continue;
      expect(measure.numerator).toEqual([review.numerator]);
      expect(measure.denominator ?? []).toEqual(
        review.denominator ? [review.denominator] : [],
      );
    }
  });

  test("the players query: one row per player, their own matches, counts per match", () => {
    expect(ASK_COMPARE_PLAYERS_SQL).toContain(
      "select a.player_name, a.n as group_matches,",
    );
    expect(ASK_COMPARE_PLAYERS_SQL).toContain("group by m.player_name");
    expect(ASK_COMPARE_PLAYERS_SQL).toContain("m.player_name is not null");
    expect(ASK_COMPARE_PLAYERS_SQL).toContain(
      "round(1.0 * a.unforced_errors / nullif(a.n, 0), 1) as unforced_errors_per_match",
    );
    expect(aliases(ASK_COMPARE_PLAYERS_SQL)).not.toContain("unforced_errors");
  });

  test("the baseline queries: each measure beside all_ or team_, the baseline never through scope", () => {
    for (const [sql, prefix] of [
      [ASK_COMPARE_BASELINE_SQL, "all_"],
      [ASK_COMPARE_TEAM_BASELINE_SQL, "team_"],
    ] as const) {
      const names = aliases(sql);
      expect(names).toContain("first_serve_pct");
      expect(names).toContain(`${prefix}first_serve_pct`);
      expect(names).toContain("winners_per_match");
      expect(names).toContain(`${prefix}winners_per_match`);
      expect(sql).toContain("where s.side = 'me'");
      const row = Object.fromEntries(names.map((name) => [name, 1]));
      const pairs = comparedPairs(row);
      expect(pairs.every((pair) => pair.kind === "baseline")).toBe(true);
      // The two match counts are not read as a measure and its baseline.
      expect(
        pairs.some((pair) => /stats_matches/.test(pair.subject + pair.other)),
      ).toBe(false);
    }
    expect(compareSql("baseline", true)).toBe(ASK_COMPARE_TEAM_BASELINE_SQL);
    expect(compareSql("baseline", false)).toBe(ASK_COMPARE_BASELINE_SQL);
  });

  test("a scope that is most of every match has no baseline", () => {
    const row = (scoped: number, every: number) => ({
      [ASK_COMPARE_SCOPE_MATCHES]: scoped,
      [ASK_COMPARE_ALL_MATCHES]: every,
    });
    expect(baselineIsWholeScope(row(17, 18))).toBe(true);
    expect(baselineIsWholeScope(row(6, 10))).toBe(false);
    expect(baselineIsWholeScope(row(2, 18))).toBe(false);
    expect(baselineIsWholeScope(undefined)).toBe(false);
  });
});

// ── The planner's reply ──────────────────────────────────────────────────────

test.describe("parsePlanReply — the comparison intent", () => {
  test("a kind and a scope; measures are optional and any sql beside them is ignored", () => {
    expect(
      parsePlanReply(
        '{"compare": "opponent", "scope_sql": "select match_id from ask.matches", "asks_for_advice": true}',
      ),
    ).toEqual({
      compare: "opponent",
      scope_sql: "select match_id from ask.matches",
      asks_for_advice: true,
    });
    expect(
      parsePlanReply(
        '```json\n{"compare": "Players", "scope_sql": "select match_id from ask.matches", "measures": ["serve", 3, "aces"], "sql": "select 1"}\n```',
      ),
    ).toEqual({
      compare: "players",
      scope_sql: "select match_id from ask.matches",
      measures: ["serve", "aces"],
      asks_for_advice: false,
    });
  });

  test("an unknown kind is not a comparison; without a scope it is not a plan", () => {
    expect(
      parsePlanReply(
        '{"compare": "everything", "scope_sql": "select match_id from ask.matches"}',
      ),
    ).toBeNull();
    expect(parsePlanReply('{"compare": "opponent"}')).toBeNull();
    // An unknown kind beside a full query is the query.
    expect(
      parsePlanReply(
        '{"compare": "x", "scope_sql": "select match_id from ask.matches", "sql": "select 1 as n from scope"}',
      ),
    ).toMatchObject({ sql: "select 1 as n from scope" });
  });

  test("a saved comparison is shown to the next plan as the app's own query", () => {
    const previous = previousPlanFromMessages([
      {
        role: "assistant",
        content: {
          scopeSql:
            "select match_id from ask.matches where player_name ilike '%rudy%'",
          sql: ASK_COMPARE_TEAM_BASELINE_SQL,
        },
      },
    ]);
    expect(previous).toEqual({
      scope_sql:
        "select match_id from ask.matches where player_name ilike '%rudy%'",
      sql: null,
      compare: "baseline",
    });
    const prompt = buildPlanPrompt({
      today: "2026-10-12",
      tags: [],
      conversation: [],
      previousPlan: previous,
    });
    expect(prompt).toContain(
      `sql: the app's own comparison query (shape D, "compare": "baseline")`,
    );
    expect(prompt).not.toContain("with tagged as");
  });
});

// ── Which measures ───────────────────────────────────────────────────────────

const keys = (question: string, requested: unknown = null) =>
  selectCompareMeasures(question, requested).measures.map(
    (measure) => measure.key,
  );

test.describe("selectCompareMeasures", () => {
  test("a vague quality word is read as stated measures, from one table", () => {
    expect(ASK_QUALITY_MEASURES.map((quality) => quality.word)).toEqual([
      "Consistent",
      "Clutch",
      "Aggressive",
      "Best overall",
    ]);
    expect(keys("Who is our most consistent player?")).toEqual([
      "unforced_errors",
      "total_points_won_pct",
    ]);
    expect(keys("Who is the most solid?")).toEqual([
      "unforced_errors",
      "total_points_won_pct",
    ]);
    expect(keys("Which player is most clutch?")).toEqual([
      "break_points_saved_pct",
      "break_points_converted_pct",
    ]);
    expect(keys("Who is our most aggressive player?")).toEqual([
      "winners",
      "net_points_appearances",
    ]);
    expect(keys("Who is our best player overall?")).toEqual([
      "total_points_won_pct",
    ]);
    const selection = selectCompareMeasures("Who is most consistent?", [
      "serve",
    ]);
    expect(selection.quality?.word).toBe("Consistent");
    expect(selection.explicit).toBe(true);
    expect(askQuality("How is Rudy serving?")).toBeNull();
    // Every measure the table names exists.
    for (const quality of ASK_QUALITY_MEASURES) {
      for (const key of quality.measures) {
        expect(ASK_COMPARE_MEASURES.map((measure) => measure.key)).toContain(
          key,
        );
      }
    }
  });

  test("the question's own words choose; a specific measure keeps its group out", () => {
    expect(questionMeasures("Compare Rudy and Emon on serve")).toEqual([
      "first_serve_pct",
      "first_serve_won_pct",
      "second_serve_won_pct",
      "aces",
      "double_faults",
    ]);
    expect(questionMeasures("Who double faults the most?")).toEqual([
      "double_faults",
    ]);
    expect(
      questionMeasures("Who has the best first serve percentage on the team?"),
    ).toEqual(["first_serve_pct", "first_serve_won_pct"]);
    // "return points won" is the return, not total points won.
    expect(
      questionMeasures("Compare our players on return points won"),
    ).toEqual([
      "return_won_pct",
      "first_return_won_pct",
      "second_return_won_pct",
      "break_points_converted_pct",
    ]);
    expect(questionMeasures("Who wins the most points won overall?")).toEqual([
      "total_points_won_pct",
    ]);
    expect(
      questionMeasures("Do I win more long rallies or short ones?"),
    ).toEqual([
      "short_rally_won_pct",
      "long_rally_won_pct",
      "long_rally_total",
    ]);
    expect(questionMeasures("Why did we lose?")).toEqual([]);
  });

  test("then the planner's list, then every standard measure", () => {
    expect(plannerMeasures(["return", "ACES", "nonsense", 4])).toEqual([
      "return_won_pct",
      "first_return_won_pct",
      "second_return_won_pct",
      "break_points_converted_pct",
      "aces",
    ]);
    expect(plannerMeasures(["me_winners", "winners_per_match"])).toEqual([
      "winners",
    ]);
    expect(keys("How is Emon doing?", ["net"])).toEqual([
      "net_points_won_pct",
      "net_points_appearances",
    ]);
    const all = selectCompareMeasures("How is Emon doing?", null);
    expect(all.explicit).toBe(false);
    expect(all.measures).toEqual(
      ASK_COMPARE_MEASURES.filter((measure) => measure.standard),
    );
    expect(all.measures.length).toBeGreaterThanOrEqual(12);
  });

  test("a count is a sum against the opponent and a per-match mean elsewhere", () => {
    const winners = ASK_COMPARE_MEASURES.find(
      (measure) => measure.key === "winners",
    )!;
    const pct = ASK_COMPARE_MEASURES[0];
    expect(compareColumn(winners, "opponent")).toBe("winners");
    expect(compareColumn(winners, "opponent", true)).toBe("winners_per_match");
    expect(compareColumn(winners, "players")).toBe("winners_per_match");
    expect(compareColumn(winners, "baseline")).toBe("winners_per_match");
    expect(compareColumn(pct, "players")).toBe("first_serve_pct");
    expect(
      selectCompareMeasures("How many winners do I hit per match?", null)
        .perMatch,
    ).toBe(true);
    expect(
      projectCompareRows(
        [
          {
            me_winners: 40,
            opp_winners: 30,
            me_winners_per_match: 20,
            opp_winners_per_match: 15,
            me_aces: 1,
          },
        ],
        "opponent",
        [winners],
        false,
        true,
      ),
    ).toEqual([{ me_winners_per_match: 20, opp_winners_per_match: 15 }]);
  });
});

// ── Routing the planner cannot get wrong ─────────────────────────────────────

test.describe("mechanical routing", () => {
  test("asksWhatToWorkOn: practise, work on, fix, improve, do differently — unless the subject is not recorded", () => {
    for (const question of [
      "What should Rudy practice?",
      "What should I practise this week?",
      "What do we need to work on?",
      "What should she fix?",
      "What can Emon improve?",
      "What should I do differently next time?",
    ]) {
      expect(asksWhatToWorkOn(question), question).toBe(true);
    }
    for (const question of [
      "What should I do to fix my footwork?",
      "Which drills should we run in practice?",
      "What is my record?",
      "Who has the best footwork on the team?",
    ]) {
      expect(asksWhatToWorkOn(question), question).toBe(false);
    }
  });

  test("asksToComparePlayers: who, which player or compare — with a measure or a quality word", () => {
    for (const question of [
      "Who is our most consistent player?",
      "Compare Rudy Quan and Emon van Loben Sels on serve",
      "Rudy versus Emon on returns",
      "Which of our players wins the most long rallies?",
      "Who double faults the most?",
    ]) {
      expect(asksToComparePlayers(question), question).toBe(true);
    }
    for (const question of [
      "Who has the best footwork on the team?",
      "Who did we play last week?",
      "How is Rudy serving?",
      "What is each player's record?",
    ]) {
      expect(asksToComparePlayers(question), question).toBe(false);
    }
  });

  test("compareMisfit: two groups against each other, or where a ball was hit", () => {
    for (const question of [
      "How do I do against left-handers compared with right-handers?",
      "Am I better on hard courts or clay?",
      "How do we do in dual matches compared with tournaments?",
      "Does Rudy play better in the first set or later sets?",
      "Where do I serve on big points?",
    ]) {
      expect(compareMisfit(question), question).not.toBeNull();
    }
    for (const question of [
      "Why did I lose to Marek?",
      "How was my serve in August?",
      "How do I do on clay?",
      "And against right-handers?",
    ]) {
      expect(compareMisfit(question), question).toBeNull();
    }
  });

  test("compareMisfit: which opponent or match is a ranking, not a pooled comparison", () => {
    for (const question of [
      "Which opponent gives me the most trouble?",
      "Which match was my best serving performance?",
      "Who is my toughest opponent?",
    ]) {
      expect(compareMisfit(question), question).toMatch(/a ranking/);
    }
    // Which PLAYER is the players comparison.
    expect(
      compareMisfit("Which of our players wins the most long rallies?"),
    ).toBeNull();
  });

  test("movesPreviousQuestion: an elliptical follow-up that names no measure", () => {
    expect(movesPreviousQuestion("And against right-handers?")).toBe(true);
    expect(movesPreviousQuestion("What about on clay?")).toBe(true);
    expect(movesPreviousQuestion("And how about his return?")).toBe(false);
    expect(movesPreviousQuestion("How do I do on clay?")).toBe(false);
    // A record, a reason or a ranking is a question of its own.
    expect(movesPreviousQuestion("And what is his record?")).toBe(false);
    expect(movesPreviousQuestion("And why did she lose?")).toBe(false);
    expect(movesPreviousQuestion("And which opponent was hardest?")).toBe(
      false,
    );
  });

  test("asksWhatHappened: what happened, why won or lost, summarize — over whole matches", () => {
    for (const question of [
      "What happened in my three-set matches?",
      "Why did she lose her last match?",
      "Why do I keep losing to Marek Dvorsky?",
      "Summarize this match",
    ]) {
      expect(asksWhatHappened(question), question).toBe(true);
    }
    for (const question of [
      "What happened in the third set?",
      "Why did I lose the tiebreak?",
      "Why do I lose more on clay than on hard courts?",
      "How did my last five matches go?",
      "Why is my footwork slow when I lose?",
    ]) {
      expect(asksWhatHappened(question), question).toBe(false);
    }
  });

  test("asksForStrengths", () => {
    expect(asksForStrengths("What are my strengths this season?")).toBe(true);
    expect(asksForStrengths("Where am I weakest?")).toBe(true);
    expect(asksForStrengths("How was my serve in August?")).toBe(false);
  });
});

// ── The players answer ───────────────────────────────────────────────────────

async function rendered(text: string, rows: AskRow[]) {
  const render = renderAskAnswer(
    (async function* chunks() {
      yield text;
    })(),
    rows,
  );
  const events: AskAnswerEvent[] = [];
  for await (const event of render.events) events.push(event);
  return { events, result: render.result };
}

const PLAYER_ROWS: AskRow[] = [
  {
    player_name: "Rudy Quan",
    group_matches: 6,
    unforced_errors_per_match: 30.7,
    total_points_won_pct: 52.4,
    first_serve_pct: 64.1,
    matches_in_scope: 10,
  },
  {
    player_name: "Emon van Loben Sels",
    group_matches: 3,
    unforced_errors_per_match: 49,
    total_points_won_pct: 47.5,
    first_serve_pct: 66.8,
    matches_in_scope: 10,
  },
  {
    player_name: "Andy Nguyen",
    group_matches: 1,
    unforced_errors_per_match: 36,
    total_points_won_pct: 54.1,
    first_serve_pct: 68.5,
    matches_in_scope: 10,
  },
];

const CONSISTENT = [
  { column: "unforced_errors_per_match", percentage: false },
  { column: "total_points_won_pct", percentage: true },
];

test.describe("buildPlayersAnswer", () => {
  test("three players: the headline names the highest and lowest of the first measure, by its name", async () => {
    const answer = buildPlayersAnswer(PLAYER_ROWS, {
      matchCount: 10,
      measures: CONSISTENT,
      explicit: true,
      notes: ['"Consistent" is read here as unforced errors per match.'],
    });
    expect(answer).not.toBeNull();
    // No digit typed by the server: every figure and name is a reference.
    expect(answer!.text.replace(/\{\{[^}]*\}\}/g, "")).not.toMatch(/\d/);
    const { result } = await rendered(answer!.text, answer!.rows);
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.headline).toBe(
      "Unforced errors per match: Emon van Loben Sels had the most (49) and Rudy Quan the fewest (30.7).",
    );
    // Three players fit as columns; the measures are the rows.
    expect(result.visual).toMatchObject({
      kind: "table",
      columns: ["Emon van Loben Sels", "Andy Nguyen", "Rudy Quan"],
      rows: [
        { label: "Unforced errors per match", cells: ["49", "36", "30.7"] },
        { label: "Total points won", cells: ["47.5%", "54.1%", "52.4%"] },
      ],
    });
    expect(result.text).toBe(
      'Total points won: Andy Nguyen was highest (54.1%) and Emon van Loben Sels lowest (47.5%). Matches with statistics: Emon van Loben Sels 3, Andy Nguyen 1 and Rudy Quan 6. Counts are per-match averages. "Consistent" is read here as unforced errors per match. From 10 matches in all.',
    );
  });

  test("more players than columns: one row each, ordered by the first measure, capped at the table's rows", async () => {
    const many: AskRow[] = Array.from({ length: 10 }, (_, index) => ({
      player_name: `Player ${String.fromCharCode(65 + index)}`,
      group_matches: index + 1,
      first_serve_pct: 50 + index,
      aces_per_match: index % 3,
      total_points_won_pct: 45 + index,
      double_faults_per_match: 1,
      matches_in_scope: 55,
    }));
    const answer = buildPlayersAnswer(many, {
      matchCount: 55,
      measures: [
        { column: "first_serve_pct", percentage: true },
        { column: "aces_per_match", percentage: false },
        { column: "total_points_won_pct", percentage: true },
        { column: "double_faults_per_match", percentage: false },
      ],
      explicit: false,
    });
    const { result } = await rendered(answer!.text, answer!.rows);
    expect(result.failure).toBeNull();
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedVisualRows).toBe(0);
    expect(result.headline).toBe(
      "First serves in: Player H was highest (57%) and Player A lowest (50%).",
    );
    const visual = result.visual;
    expect(visual?.kind).toBe("table");
    if (visual?.kind !== "table") return;
    // Three measures across, eight players down, the best first.
    expect(visual.columns).toEqual([
      "First serves in",
      "Aces per match",
      "Total points won",
    ]);
    expect(visual.rows).toHaveLength(8);
    expect(visual.rows[0]).toEqual({
      label: "Player H",
      cells: ["57%", "1", "52%"],
    });
    expect(result.text).toContain(
      "Double faults per match: the same for every player compared (1).",
    );
  });

  test("two players: who was higher on each measure, both figures beside the word", async () => {
    const answer = buildPlayersAnswer(PLAYER_ROWS.slice(0, 2), {
      matchCount: 10,
      measures: [
        { column: "first_serve_pct", percentage: true },
        ...CONSISTENT,
      ],
      explicit: true,
    });
    const { result } = await rendered(answer!.text, answer!.rows);
    expect(result.failure).toBeNull();
    expect(result.headline).toBe(
      "Emon van Loben Sels was higher on first serves in (66.8% to 64.1%) and had more unforced errors per match (49 to 30.7); Rudy Quan was higher on total points won (52.4% to 47.5%).",
    );
    expect(result.visual).toMatchObject({
      columns: ["Rudy Quan", "Emon van Loben Sels"],
      rows: [
        { label: "First serves in", cells: ["64.1%", "66.8%"] },
        { label: "Unforced errors per match", cells: ["30.7", "49"] },
        { label: "Total points won", cells: ["52.4%", "47.5%"] },
      ],
    });
    expect(result.text).toBe(
      "Matches with statistics: Rudy Quan 6 and Emon van Loben Sels 3. Counts are per-match averages. From 10 matches in all.",
    );
  });

  test("one ace against none does not head the answer: a count's gap has a floor", async () => {
    const rows: AskRow[] = [
      {
        player_name: "Rudy Quan",
        group_matches: 6,
        aces_per_match: 0,
        second_serve_won_pct: 51.8,
        matches_in_scope: 9,
      },
      {
        player_name: "Emon van Loben Sels",
        group_matches: 3,
        aces_per_match: 0.3,
        second_serve_won_pct: 41.8,
        matches_in_scope: 9,
      },
    ];
    const answer = buildPlayersAnswer(rows, {
      matchCount: 9,
      measures: [
        { column: "aces_per_match", percentage: false },
        { column: "second_serve_won_pct", percentage: true },
      ],
      explicit: false,
    });
    const { result } = await rendered(answer!.text, answer!.rows);
    expect(result.headline).toMatch(
      /^Rudy Quan was higher on second-serve points won \(51\.8% to 41\.8%\)/,
    );
  });

  test("not for one player, or for measures nobody shares", () => {
    const context = { matchCount: 6, measures: CONSISTENT, explicit: true };
    expect(buildPlayersAnswer(PLAYER_ROWS.slice(0, 1), context)).toBeNull();
    expect(
      buildPlayersAnswer(
        PLAYER_ROWS.map((row) => ({
          player_name: row.player_name,
          group_matches: row.group_matches,
          unforced_errors_per_match: null,
          total_points_won_pct: null,
        })),
        context,
      ),
    ).toBeNull();
  });

  test("namedPlayerRows: the players the question names, when it names two", () => {
    const named = (question: string) =>
      namedPlayerRows(PLAYER_ROWS, question).map((row) => row.player_name);
    expect(named("How is Rudy playing versus Emon")).toEqual([
      "Rudy Quan",
      "Emon van Loben Sels",
    ]);
    expect(named("Compare Quan and Nguyen on serve")).toEqual([
      "Rudy Quan",
      "Andy Nguyen",
    ]);
    // One name, or none, is every player.
    expect(named("Is Rudy our most consistent player?")).toHaveLength(3);
    expect(named("Who double faults the most?")).toHaveLength(3);
    // "van" inside another word is not a name.
    expect(named("Who has the advantage on serve?")).toHaveLength(3);
  });
});

// ── A matchup that was never played ──────────────────────────────────────────

test.describe("absentMatchupLead", () => {
  const MATCH = {
    playedOn: "2026-09-25",
    opponentName: "Eli Stephenson",
    playerName: "Emon van Loben Sels",
    iWon: false,
    scoreText: "3-6, 7-6, 4-6",
  };

  test("says the two never met, then retells the program's match against that opponent", async () => {
    const { lead, extraRow } = absentMatchupLead([MATCH], "Rudy Quan");
    const answer = buildPairedAnswer(
      [{ me_winners: 41, opp_winners: 37, matches_in_scope: 1 }],
      {
        team: true,
        matchCount: 1,
        opponentName: "Eli Stephenson",
        playerName: "Emon van Loben Sels",
        lead,
        extraRow,
      },
    );
    expect(answer!.text.replace(/\{\{[^}]*\}\}/g, "")).not.toMatch(/\d/);
    const { result } = await rendered(answer!.text, answer!.rows);
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
    expect(result.headline).toBe(
      "Rudy Quan has no recorded match against Eli Stephenson.",
    );
    expect(result.text).toBe(
      "The program's one match against Eli Stephenson: Sep 25, 2026: Emon van Loben Sels lost to Eli Stephenson, 3-6, 7-6, 4-6. Emon van Loben Sels had more winners (41 to 37). This is one match.",
    );
    expect(result.visual).toMatchObject({
      columns: ["Emon van Loben Sels", "Eli Stephenson"],
    });
  });

  test("several matches: the count is cited and the most recent are retold; an unknown player is 'that player'", () => {
    const matches = Array.from({ length: 5 }, (_, index) => ({
      ...MATCH,
      playedOn: `2026-09-2${index}`,
      iWon: index % 2 === 0,
    }));
    const { lead, extraRow } = absentMatchupLead(matches, null);
    expect(lead[0]).toBe(
      "That player has no recorded match against {{r1.paired_other_name}}.",
    );
    expect(lead[1]).toMatch(
      /^The program has \{\{r1\.matches_in_scope\}\} matches against \{\{r1\.paired_other_name\}\}; the most recent: /,
    );
    expect(Object.keys(extraRow)).toContain("paired_m3_score_text");
    expect(Object.keys(extraRow)).not.toContain("paired_m4_score_text");
  });
});

// ── Names and scopes ─────────────────────────────────────────────────────────

test.describe("names in a scope", () => {
  const scope = (where: string) =>
    `select match_id from ask.matches where ${where}`;

  test("scopeNameFilters reads every player and opponent filter", () => {
    expect(
      scopeNameFilters(
        scope("player_name ilike '%Rudy%' and opponent_name ilike '%eli%'"),
      ),
    ).toEqual([
      { column: "player_name", core: "rudy" },
      { column: "opponent_name", core: "eli" },
    ]);
    expect(scopeNameFilters(scope("court_type ilike '%hard%'"))).toEqual([]);
  });

  test("foreignScopeName: a name nobody mentioned, and whether it is one of the examples' placeholders", () => {
    const question = "And how about his return?";
    expect(
      foreignScopeName(scope("player_name ilike '%playera%'"), question),
    ).toEqual({ core: "playera", example: true });
    expect(
      foreignScopeName(scope("opponent_name ilike '%oppon%'"), question),
    ).toEqual({ core: "oppon", example: true });
    expect(
      foreignScopeName(scope("player_name ilike '%sokol%'"), question),
    ).toEqual({ core: "sokol", example: false });
    // In the question, a tag or the conversation: accounted for.
    expect(
      foreignScopeName(
        scope("player_name ilike '%emon%'"),
        `${question}\nEmon van Loben Sels`,
      ),
    ).toBeNull();
    // The opening letters are enough: a typed name may be misspelt.
    expect(
      foreignScopeName(
        scope("opponent_name ilike '%timofey%'"),
        "Why did I lose to Timofy?",
      ),
    ).toBeNull();
    expect(foreignScopeName(scope("played_on > date '2026-01-01'"), "x")).toBe(
      null,
    );
    // Every placeholder the prompts use is recognised as one.
    for (const name of ASK_PLAN_EXAMPLE_NAMES) {
      expect(
        foreignScopeName(
          scope(`player_name ilike '%${name.toLowerCase()}%'`),
          "",
        )?.example,
      ).toBe(true);
    }
  });

  test("inheritsPreviousScope: no tag, nobody new named, no filter of its own", () => {
    const previous = {
      scope_sql: scope("match_id in ('3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f')"),
      sql: null,
    };
    const lost = scope("player_name ilike '%sokol%'");
    expect(
      inheritsPreviousScope("And how about his return?", false, previous, lost),
    ).toBe(true);
    // The question itself names who the scope looks for.
    expect(
      inheritsPreviousScope("And for Sokolov?", false, previous, lost),
    ).toBe(false);
    // A period or a surface is the question's own filter.
    expect(
      inheritsPreviousScope(
        "And in the last two weeks?",
        false,
        previous,
        scope("played_on >= date '2026-10-01'"),
      ),
    ).toBe(false);
    expect(inheritsPreviousScope("And his return?", true, previous, lost)).toBe(
      false,
    );
    expect(inheritsPreviousScope("And his return?", false, null, lost)).toBe(
      false,
    );
    expect(
      inheritsPreviousScope(
        "And his return?",
        false,
        previous,
        previous.scope_sql,
      ),
    ).toBe(false);
  });

  test("droppedPlayerFilter also keeps a previous scope of tagged match ids", () => {
    const previous = {
      scope_sql: scope(
        "match_id in ('3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f', '8a7b6c5d-4e3f-4a2b-8c1d-9e8f7a6b5c4d')",
      ),
      sql: null,
    };
    expect(
      droppedPlayerFilter(
        "And how about his return?",
        previous,
        scope("played_on >= date '2026-08-01'"),
      ),
    ).toContain(
      "restrict scope_sql to match_id in ('3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f', '8a7b6c5d-4e3f-4a2b-8c1d-9e8f7a6b5c4d')",
    );
    expect(
      droppedPlayerFilter(
        "And the return?",
        previous,
        scope("played_on >= date '2026-08-01'"),
      ),
    ).toBeNull();
  });

  test("playerOpponentScope: one player against one opponent, by name or by tagged ids", () => {
    expect(
      playerOpponentScope(
        scope("player_name ilike '%rudy%' and opponent_name ilike '%eli%'"),
      ),
    ).toEqual({ player: "%rudy%", opponent: "eli", opponentPattern: "%eli%" });
    expect(
      playerOpponentScope(
        scope(
          "match_id in ('3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f') and opponent_name ilike '%eli%'",
        ),
      ),
    ).toMatchObject({ player: null, opponent: "eli" });
    expect(playerOpponentScope(scope("opponent_name ilike '%eli%'"))).toBe(
      null,
    );
    expect(playerOpponentScope(scope("player_name ilike '%rudy%'"))).toBe(null);
    expect(
      playerOpponentScope(
        scope("player_name ilike '%rudy%' or opponent_name ilike '%eli%'"),
      ),
    ).toBeNull();
  });

  test("scopeFromTags: exactly the tags' match ids, and only ids", () => {
    const tags = (matchIds: string[]): AskResolvedTags => ({
      prompt: [],
      saved: [],
      matchIds,
    });
    expect(scopeFromTags(tags([]))).toBeNull();
    const scopeSql = scopeFromTags(
      tags(["3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f", "x'); drop table users"]),
    );
    expect(scopeSql).toBe(
      "select match_id from ask.matches where match_id in ('3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f')",
    );
    expect(checkAskSql({ scopeSql: scopeSql!, sql: ASK_REVIEW_SQL })).toEqual({
      ok: true,
    });
  });

  test("noDataMessage names what was looked for", () => {
    expect(noDataMessage(true, ASK_ALL_MATCHES_SCOPE)).toBe(
      ASK_TEAM_NO_DATA_MESSAGE,
    );
    expect(
      noDataMessage(
        true,
        scope("player_name ilike '%rudy%' and opponent_name ilike '%zed%'"),
      ),
    ).toBe(
      `${ASK_TEAM_NO_DATA_MESSAGE} Looked for: a player named like "rudy", an opponent named like "zed".`,
    );
    expect(
      noDataMessage(false, scope("played_on >= date '2026-10-01'")),
    ).toMatch(/Looked for: the period asked about\.$/);
  });

  test("overcountedMatches: a group with more matches than the scope has counted rows", () => {
    expect(
      overcountedMatches([{ surface: "Hard Court", group_matches: 18 }], 10),
    ).toBe("group_matches");
    expect(
      overcountedMatches(
        [
          { player_matches: 6, all_matches: 40, matches_in_scope: 10 },
          { player_matches: 4, wins: 99 },
        ],
        10,
      ),
    ).toBeNull();
  });
});

// ── The stated-figures net ───────────────────────────────────────────────────

test.describe("an answer that ends with no figure", () => {
  const SETS: AskRow[] = [
    {
      set_1_points: 329,
      set_1_win_pct: 53.2,
      later_sets_points: 320,
      later_sets_win_pct: 51.6,
      matches_in_scope: 6,
    },
  ];
  const GROUPS: AskRow[] = [
    { court_type: "Hard Court", wins: 6, losses: 2, win_pct: 75, year: 2026 },
    { court_type: "Clay Court", wins: 1, losses: 3, win_pct: 25, year: 2026 },
  ];

  test("columnLabel: the dictionary's name, else the column's own words with a digit spelt out", () => {
    expect(columnLabel("total_points_won_pct")).toBe("Total points won");
    expect(columnLabel("team_first_serve_pct")).toBe("First serves in, team");
    expect(columnLabel("set_1_win_pct")).toBe("Set one win");
    expect(columnLabel("later_sets_points")).toBe("Later sets points");
  });

  test("statedRows: one row plainly; several rows each under its own label", () => {
    expect(statedRows(SETS)).toBe(
      "Set one points: 329. Set one win: 53.2%. Later sets points: 320. Later sets win: 51.6%.",
    );
    expect(statedRows(GROUPS)).toBe(
      "Hard Court: Wins 6, Losses 2, Matches won 75%. Clay Court: Wins 1, Losses 3, Matches won 25%.",
    );
    // Nothing to state, no label to state it under, or too many rows.
    expect(statedRows([{ opponent_name: "Alex" }])).toBe("");
    expect(statedRows([{ wins: 1 }, { wins: 2 }])).toBe("");
    expect(
      statedRows(
        Array.from({ length: 7 }, (_, n) => ({ court_type: `c${n}`, wins: n })),
      ),
    ).toBe("");
  });

  test("a claim whose chart was dropped ends with the figures, one row", async () => {
    // The probe: a headline, a bars block with a count in it (dropped), and
    // nothing else.
    const { result, events } = await rendered(
      "Rudy records a higher win percentage in the first set than in later sets.\nCHART: bars | By set.\nSERIES: First set | Later sets\nROW: Points | {{r1.set_1_points}} | {{r1.later_sets_points}}",
      SETS,
    );
    expect(result.failure).toBeNull();
    expect(result.visual).toBeNull();
    expect(result.droppedVisuals).toHaveLength(1);
    expect(result.text).toBe(statedRows(SETS));
    expect(events.at(-1)).toEqual({ type: "text", delta: statedRows(SETS) });
  });

  test("a claim over several labelled rows ends with each row's figures", async () => {
    const { result } = await rendered(
      "You do better on hard courts.\n\nThe gap is wide.",
      GROUPS,
    );
    expect(result.text).toBe(`The gap is wide.\n\n${statedRows(GROUPS)}`);
  });

  test("an answer that shows any figure is left as written", async () => {
    const cited = await rendered(
      "You do better on hard courts.\n\nYou won {{r1.wins}} there.",
      GROUPS,
    );
    expect(cited.result.text).toBe("You won 6 there.");
    const figure = await rendered(
      "You do better on hard courts.\nFIGURE: Matches won = {{r1.win_pct}}",
      GROUPS,
    );
    expect(figure.result.text).toBe("");
    expect(figure.result.figures).toHaveLength(1);
  });
});

// ── One question, end to end ─────────────────────────────────────────────────

const TEAM: AskScope = {
  kind: "team",
  programId: "a8e46b09-0000-4000-8000-000000000001",
  programName: "Test Program",
};
const NO_TAGS: AskResolvedTags = { prompt: [], saved: [], matchIds: [] };
const MATCH_A = "3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f";
const MATCH_B = "8a7b6c5d-4e3f-4a2b-8c1d-9e8f7a6b5c4d";

function match(over: Record<string, unknown> = {}) {
  return {
    match_id: MATCH_A,
    played_on: "2026-09-26",
    opponent_name: "Aidan Kim",
    player_name: "Rudy Quan",
    i_won: false,
    score_text: "4-6, 4-6",
    ...over,
  };
}

const OPPONENT_ROW = {
  me_first_serve_won_pct: 52.9,
  opp_first_serve_won_pct: 71.4,
  me_second_serve_won_pct: 60,
  opp_second_serve_won_pct: 33.3,
  me_winners: 16,
  opp_winners: 23,
  me_winners_per_match: 16,
  opp_winners_per_match: 23,
  me_net_points_won_pct: 28.6,
  opp_net_points_won_pct: 50,
};

interface Run {
  scope_sql: string;
  sql: string;
}

/** A database whose query function answers from the scope and sql it is given. */
function fakeDb(answer: (run: Run) => AskRpcResult) {
  const runs: Run[] = [];
  const saves: Record<string, unknown>[] = [];
  const db: AskDatabase = {
    rpc: async (fn, args) => {
      if (fn === "ask_run_query" || fn === "ask_run_team_query") {
        const run = {
          scope_sql: String(args?.scope_sql),
          sql: String(args?.sql),
        };
        runs.push(run);
        return answer(run);
      }
      if (fn === "ask_save_exchange_ids") {
        saves.push(args ?? {});
        return {
          data: {
            conversation_id: "bbbbbbbb-0000-4000-8000-000000000002",
            answer_id: "bbbbbbbb-0000-4000-8000-000000000003",
          },
          error: null,
        };
      }
      if (fn === "ask_quota")
        return { data: { used: 1, cap: 20 }, error: null };
      return { data: true, error: null };
    },
  };
  return { db, runs, saves };
}

const ok = (matches: unknown[], rows: unknown[]): AskRpcResult => ({
  data: { matches, rows },
  error: null,
});

function fakeModel(replies: string[], configured = true) {
  const calls: { system: string; messages: { content: string }[] }[] = [];
  const model: AskModel = {
    configured,
    stream: async (system, messages) => {
      calls.push({ system, messages: [...messages] });
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no scripted reply left");
      return (async function* chunks() {
        yield reply;
      })();
    },
  };
  return { model, calls };
}

function input(
  over: Partial<AskQuestionInput> & Pick<AskQuestionInput, "db" | "model">,
): AskQuestionInput {
  return {
    now: () => new Date("2026-10-12T15:00:00Z"),
    question: "How did Rudy do against Aidan Kim?",
    tags: NO_TAGS,
    conversation: [],
    conversationId: null,
    reservation: null,
    scope: TEAM,
    ...over,
  };
}

async function ask(over: Parameters<typeof input>[0]) {
  const events: AskEvent[] = [];
  for await (const event of askQuestion(input(over))) events.push(event);
  const headline = events.flatMap((event) =>
    event.type === "headline" ? [event.text] : [],
  )[0];
  const body = events
    .flatMap((event) => (event.type === "text" ? [event.delta] : []))
    .join("");
  const error = events.flatMap((event) =>
    event.type === "error" ? [event] : [],
  )[0];
  return { events, headline, body, error };
}

const compare = (kind: string, scopeSql: string, more = {}) =>
  JSON.stringify({ compare: kind, scope_sql: scopeSql, ...more });

test.describe("a comparison, end to end", () => {
  test("the opponent comparison: the app's query, no answer model, the figures as the query returned them", async () => {
    const scopeSql =
      "select match_id from ask.matches where player_name ilike '%rudy%' and opponent_name ilike '%aidan%'";
    const { db, runs, saves } = fakeDb(() => ok([match()], [OPPONENT_ROW]));
    const { model, calls } = fakeModel([compare("opponent", scopeSql)]);
    const { events, headline, body } = await ask({ db, model });

    expect(calls).toHaveLength(1);
    expect(runs).toEqual([
      { scope_sql: scopeSql, sql: ASK_COMPARE_OPPONENT_SQL },
    ]);
    expect(headline).toBe(
      "Rudy Quan was higher on second-serve points won (60% to 33.3%); Aidan Kim had more winners (23 to 16) and was higher on first-serve points won (71.4% to 52.9%).",
    );
    // The result of the match, counted from the matches and not by a model.
    expect(body).toBe("Rudy Quan lost the match. This is one match.");
    expect(events.at(-1)?.type).toBe("done");
    expect(events.some((event) => event.type === "notice")).toBe(false);
    const saved = saves[0].p_answer as AskSavedAnswer;
    expect(saved.sql).toBe(ASK_COMPARE_OPPONENT_SQL);
    expect(saved.scopeSql).toBe(scopeSql);
    expect(saved.mock).toBe(false);
  });

  test("measures the question names narrow it; advice asked carries the notice", async () => {
    const { db } = fakeDb(() => ok([match()], [OPPONENT_ROW]));
    const { model } = fakeModel([
      compare("opponent", ASK_ALL_MATCHES_SCOPE, { asks_for_advice: true }),
    ]);
    const { events, headline } = await ask({
      db,
      model,
      question: "How did we do at the net, and what should change?",
    });
    expect(headline).toBe(
      "Aidan Kim was higher on net points won (50% to 28.6%).",
    );
    expect(events).toContainEqual({ type: "notice", notice: "no_advice" });
  });

  test("a personal scope has no players to compare: the opponents' query runs instead", async () => {
    const { db, runs } = fakeDb(() =>
      ok([match({ player_name: null })], [OPPONENT_ROW]),
    );
    const { model } = fakeModel([compare("players", ASK_ALL_MATCHES_SCOPE)]);
    const { headline } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "Why did I lose?",
    });
    expect(runs[0].sql).toBe(ASK_COMPARE_OPPONENT_SQL);
    expect(headline).toMatch(/^You were higher on second-serve points won/);
  });

  test("a baseline over every match, or over most of them, falls back to the opponents", async () => {
    const baselineRow = {
      first_serve_won_pct: 60,
      all_first_serve_won_pct: 60,
      [ASK_COMPARE_SCOPE_MATCHES]: 17,
      [ASK_COMPARE_ALL_MATCHES]: 18,
    };
    for (const scopeSql of [
      ASK_ALL_MATCHES_SCOPE,
      "select match_id from ask.matches where played_on >= date '2026-01-01'",
    ]) {
      const { db, runs } = fakeDb((run) =>
        ok(
          [match({ player_name: null })],
          [run.sql === ASK_COMPARE_BASELINE_SQL ? baselineRow : OPPONENT_ROW],
        ),
      );
      const { model } = fakeModel([compare("baseline", scopeSql)]);
      const { headline } = await ask({
        db,
        model,
        scope: PERSONAL_ASK_SCOPE,
        question: "How have I been playing?",
      });
      expect(runs.map((run) => run.sql)).toEqual([
        ASK_COMPARE_BASELINE_SQL,
        ASK_COMPARE_OPPONENT_SQL,
      ]);
      expect(headline).toMatch(/^You were higher on/);
    }
  });

  test("a baseline over a narrower scope is written against all matches", async () => {
    const { db, runs } = fakeDb(() =>
      ok(
        [match({ player_name: null, i_won: true })],
        [
          {
            first_serve_pct: 65.8,
            all_first_serve_pct: 62.2,
            aces_per_match: 4,
            all_aces_per_match: 2.4,
            [ASK_COMPARE_SCOPE_MATCHES]: 2,
            [ASK_COMPARE_ALL_MATCHES]: 18,
          },
        ],
      ),
    );
    const { model } = fakeModel([
      compare(
        "baseline",
        "select match_id from ask.matches where played_on >= date '2026-08-01'",
      ),
    ]);
    const { headline, body } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "How was my serve in August?",
    });
    expect(runs).toHaveLength(1);
    expect(headline).toBe(
      "There were more aces per match than across all matches (4 to 2.4); first serves in was higher (65.8% to 62.2%).",
    );
    expect(body).toBe(
      "Counts are per-match averages. You won the match. This is one match.",
    );
  });

  test("a comparison whose matches hold no statistics is 'no data', said plainly", async () => {
    const { db } = fakeDb(() => ok([match()], [{ me_winners: null }]));
    const { model } = fakeModel([compare("opponent", ASK_ALL_MATCHES_SCOPE)]);
    const { error } = await ask({ db, model, question: "Why did we lose?" });
    expect(error).toMatchObject({
      code: "no_data",
      error: ASK_NO_STATS_MESSAGE,
    });
  });
});

test.describe("what happened, end to end", () => {
  test("a query the planner wrote for it is replaced by the comparison over its scope", async () => {
    const threeSets =
      "select match_id from ask.matches where length(score_text) - length(replace(score_text, ',', '')) + 1 = 3";
    const { db, runs } = fakeDb(() =>
      ok([match({ player_name: null })], [OPPONENT_ROW]),
    );
    const { model, calls } = fakeModel([
      JSON.stringify({
        scope_sql: threeSets,
        sql: "select round(avg(s.total_points)::numeric, 1) as avg_total_points from ask.match_stats s where s.side = 'me' and s.match_id in (select match_id from scope)",
      }),
    ]);
    const { headline } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "What happened in my three-set matches?",
    });
    expect(calls).toHaveLength(1);
    expect(runs).toEqual([
      { scope_sql: threeSets, sql: ASK_COMPARE_OPPONENT_SQL },
    ]);
    expect(headline).toMatch(/^You were higher on second-serve points won/);
  });
});

test.describe("a list of matches whose result is a word", () => {
  const rows = [
    {
      played_on: "2026-09-26",
      opponent_name: "Aidan Kim",
      player_name: "Rudy Quan",
      result: "Loss",
      score_text: "4-6, 4-6",
    },
    {
      played_on: "2026-09-25",
      opponent_name: "Toby Kodat",
      player_name: "Rudy Quan",
      result: "Win",
      score_text: "6-4, 6-3",
    },
  ];

  test("withResultFlags reads Win and Loss as i_won; anything else is left alone", () => {
    expect(withResultFlags(rows).map((row) => row.i_won)).toEqual([
      false,
      true,
    ]);
    const kept = [{ ...rows[0], i_won: true }];
    expect(withResultFlags(kept)).toEqual(kept);
    const other = [{ court_type: "Hard", result: "Win" }];
    expect(withResultFlags(other)).toEqual(other);
    const unknown = [{ ...rows[0], result: "Retired" }];
    expect(withResultFlags(unknown)).toEqual(unknown);
  });

  test("is retold by the server, each result from its own row", async () => {
    const { db } = fakeDb(() =>
      ok([match(), match({ match_id: MATCH_B, i_won: true })], rows),
    );
    const { model, calls } = fakeModel([
      JSON.stringify({
        scope_sql:
          "select match_id from ask.matches order by played_on desc nulls last, match_id desc limit 2",
        sql: "select m.played_on, m.player_name, m.opponent_name, case when m.i_won then 'Win' else 'Loss' end as result, m.score_text from ask.matches m where m.match_id in (select match_id from scope)",
      }),
    ]);
    const { headline, body } = await ask({
      db,
      model,
      question: "How did our last two matches go?",
    });
    expect(calls).toHaveLength(1);
    expect(headline).toBe("Won 1, lost 1.");
    expect(body).toBe(
      "Sep 25, 2026: Rudy Quan won against Toby Kodat, 6-4, 6-3. Sep 26, 2026: Rudy Quan lost to Aidan Kim, 4-6, 4-6.",
    );
  });
});

test.describe("players, end to end", () => {
  const playerRows = PLAYER_ROWS.map(({ matches_in_scope: _, ...row }) => row);
  const matches = [
    match(),
    match({ match_id: MATCH_B, player_name: "Emon van Loben Sels" }),
  ];

  test("a vague quality word: the players query whatever the planner wrote, and the headline says what was measured", async () => {
    const { db, runs } = fakeDb(() => ok(matches, playerRows));
    const { model, calls } = fakeModel([
      JSON.stringify({
        scope_sql: "select match_id from ask.matches where has_stats",
        sql: "select m.player_name, round(avg(s.avg_rally_length)::numeric, 1) as avg_rally_length from ask.match_stats s join ask.matches m on m.match_id = s.match_id where s.side = 'me' and s.match_id in (select match_id from scope) group by m.player_name",
      }),
    ]);
    const { headline, body } = await ask({
      db,
      model,
      question: "Who is our most consistent player?",
    });
    expect(calls).toHaveLength(1);
    expect(runs).toEqual([
      {
        scope_sql: "select match_id from ask.matches where has_stats",
        sql: ASK_COMPARE_PLAYERS_SQL,
      },
    ]);
    expect(headline).toBe(
      "Unforced errors per match: Emon van Loben Sels had the most (49) and Rudy Quan the fewest (30.7).",
    );
    expect(body).toContain(
      '"Consistent" is not something the matches record; it is read here as unforced errors per match and total points won.',
    );
  });

  test("a comparison of players is never refused", async () => {
    const { db, runs } = fakeDb(() => ok(matches, playerRows));
    const { model } = fakeModel([
      JSON.stringify({
        cannot_answer:
          "The program's matches do not record more than one player at a time.",
      }),
    ]);
    const { headline, error } = await ask({
      db,
      model,
      question: "Compare Rudy Quan and Emon van Loben Sels on serve",
    });
    expect(error).toBeUndefined();
    expect(runs).toEqual([
      { scope_sql: ASK_ALL_MATCHES_SCOPE, sql: ASK_COMPARE_PLAYERS_SQL },
    ]);
    // Two were named: the third player in scope is left out.
    expect(headline).toBe(
      "Emon van Loben Sels was higher on first serves in (66.8% to 64.1%).",
    );
  });

  test("but a question about something not recorded still is", async () => {
    const { db, runs } = fakeDb(() => ok(matches, playerRows));
    const { model } = fakeModel([
      JSON.stringify({ cannot_answer: "Footwork is not recorded." }),
    ]);
    const { error } = await ask({
      db,
      model,
      question: "Who has the best footwork on the team?",
    });
    expect(error).toMatchObject({ code: "cannot_answer" });
    expect(runs).toHaveLength(0);
  });

  test("one player in scope: that player against the team instead", async () => {
    const { db, runs } = fakeDb((run) =>
      run.sql === ASK_COMPARE_PLAYERS_SQL
        ? ok([match()], [playerRows[0]])
        : ok(
            [match()],
            [
              {
                first_serve_pct: 64.1,
                team_first_serve_pct: 65.5,
                [ASK_COMPARE_SCOPE_MATCHES]: 6,
                [ASK_COMPARE_ALL_MATCHES]: 10,
              },
            ],
          ),
    );
    const { model } = fakeModel([
      compare(
        "players",
        "select match_id from ask.matches where player_name ilike '%rudy%'",
      ),
    ]);
    const { headline } = await ask({
      db,
      model,
      question: "How does Rudy compare on first serve percentage?",
    });
    expect(runs.map((run) => run.sql)).toEqual([
      ASK_COMPARE_PLAYERS_SQL,
      ASK_COMPARE_TEAM_BASELINE_SQL,
    ]);
    expect(headline).toBe(
      "For Rudy Quan, first serves in was lower than for the team (64.1% to 65.5%).",
    );
  });
});

test.describe("what should … practise", () => {
  const reviewRows = ASK_REVIEW_MEASURES.map((measure, index) => ({
    ord: index + 1,
    measure: measure.key,
    higher_is_better: measure.higherIsBetter,
    last_match: measure.key === "winners" ? 10 : 50,
    prev5_avg: measure.key === "winners" ? 20 : 50,
    season_avg: measure.key === "winners" ? 20 : 50,
    recent5_avg: 50,
    earlier_avg: 50,
    last_matches: 1,
    prev5_matches: 5,
    season_matches: 7,
    recent5_matches: 5,
    earlier_matches: 3,
    last_played_on: "2026-09-26",
    last_opponent_name: "Aidan Kim",
    last_player_name: "Rudy Quan",
    players: 1,
  }));
  const REFUSAL = JSON.stringify({
    cannot_answer:
      "The program's matches do not record practice sessions or drills, so this cannot be measured.",
    asks_for_advice: true,
  });
  const PLAYER_TAG: AskResolvedTags = {
    prompt: [
      { kind: "player", playerName: "Rudy Quan", matchIds: [MATCH_A, MATCH_B] },
    ],
    saved: [],
    matchIds: [MATCH_A, MATCH_B],
  };

  test("a refusal becomes the review of the tagged scope, with the notice", async () => {
    const { db, runs } = fakeDb(() => ok([match()], reviewRows));
    const { model, calls } = fakeModel([REFUSAL]);
    const { events, headline, error } = await ask({
      db,
      model,
      question: "What should Rudy practice?",
      tags: PLAYER_TAG,
    });
    expect(error).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(runs).toEqual([
      {
        scope_sql: `select match_id from ask.matches where match_id in ('${MATCH_A}', '${MATCH_B}')`,
        sql: ASK_REVIEW_SQL,
      },
    ]);
    expect(headline).toBe(
      "Winners was worse than both of their own averages in Rudy Quan's last match.",
    );
    expect(events).toContainEqual({ type: "notice", notice: "no_advice" });
  });

  test("without tags it is the review of every match", async () => {
    const { db, runs } = fakeDb(() =>
      ok(
        [match({ player_name: null })],
        reviewRows.map((row) => ({ ...row, last_player_name: null })),
      ),
    );
    const { model } = fakeModel([REFUSAL]);
    const { headline } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "What should I work on?",
    });
    expect(runs[0]).toEqual({
      scope_sql: ASK_ALL_MATCHES_SCOPE,
      sql: ASK_REVIEW_SQL,
    });
    expect(headline).toMatch(
      /^Winners was worse than both of your own averages/,
    );
  });

  test("a subject no view records is still refused", async () => {
    const { db, runs } = fakeDb(() => ok([match()], reviewRows));
    const { model } = fakeModel([REFUSAL]);
    const { error } = await ask({
      db,
      model,
      question: "What should I do to fix my footwork?",
    });
    expect(error).toMatchObject({ code: "cannot_answer" });
    expect(runs).toHaveLength(0);
  });
});

test.describe("a player against an opponent they never played", () => {
  const scopeSql =
    "select match_id from ask.matches where player_name ilike '%rudy%' and opponent_name ilike '%eli%'";
  const against = match({
    opponent_name: "Eli Stephenson",
    player_name: "Emon van Loben Sels",
    played_on: "2026-09-25",
    score_text: "3-6, 7-6, 4-6",
  });

  test("the opponent alone is retried, behind a sentence that says the two never met", async () => {
    const { db, runs, saves } = fakeDb((run) => {
      if (run.scope_sql === scopeSql) return ok([], [{ me_winners: null }]);
      if (/opponent_name ilike '%eli%'$/.test(run.scope_sql)) {
        return ok([against], [OPPONENT_ROW]);
      }
      return ok(
        [match(), match({ match_id: MATCH_B })],
        [{ scope_matches: 2 }],
      );
    });
    const { model, calls } = fakeModel([
      compare("opponent", scopeSql, { asks_for_advice: true }),
    ]);
    const { events, headline, body } = await ask({
      db,
      model,
      question: "How should Rudy play against Eli?",
    });
    expect(calls).toHaveLength(1);
    expect(runs.map((run) => run.scope_sql)).toEqual([
      scopeSql,
      "select match_id from ask.matches where opponent_name ilike '%eli%'",
      "select match_id from ask.matches where player_name ilike '%rudy%'",
    ]);
    expect(runs[1].sql).toBe(ASK_COMPARE_OPPONENT_SQL);
    expect(headline).toBe(
      "Rudy Quan has no recorded match against Eli Stephenson.",
    );
    expect(body).toMatch(
      /^The program's one match against Eli Stephenson: Sep 25, 2026: Emon van Loben Sels lost to Eli Stephenson, 3-6, 7-6, 4-6\. Emon van Loben Sels was higher on second-serve points won \(60% to 33\.3%\)/,
    );
    // Facts only: the notice, and no sentence about how to play.
    expect(events).toContainEqual({ type: "notice", notice: "no_advice" });
    expect(`${headline} ${body}`).not.toMatch(/\bshould\b/i);
    expect((saves[0].p_answer as AskSavedAnswer).scopeSql).toBe(
      "select match_id from ask.matches where opponent_name ilike '%eli%'",
    );
  });

  test("a planner-written query over the same scope gets the same fallback", async () => {
    const { db, runs } = fakeDb((run) =>
      run.scope_sql === scopeSql
        ? ok([], [])
        : /opponent_name/.test(run.scope_sql)
          ? ok([against], [OPPONENT_ROW])
          : ok([match()], [{ scope_matches: 1 }]),
    );
    const { model } = fakeModel([
      JSON.stringify({
        scope_sql: scopeSql,
        sql: "select sum(s.winners) as winners from ask.match_stats s where s.side = 'me' and s.match_id in (select match_id from scope)",
      }),
    ]);
    const { headline } = await ask({
      db,
      model,
      question: "How should Rudy play against Eli?",
    });
    expect(runs[1].sql).toBe(ASK_COMPARE_OPPONENT_SQL);
    expect(headline).toBe(
      "Rudy Quan has no recorded match against Eli Stephenson.",
    );
  });

  test("an opponent nobody has played: no data, naming who was looked for", async () => {
    const { db } = fakeDb(() => ok([], []));
    const { model } = fakeModel([compare("opponent", scopeSql)]);
    const { error } = await ask({
      db,
      model,
      question: "How should Rudy play against Eli?",
    });
    expect(error).toMatchObject({
      code: "no_data",
      error: `${ASK_TEAM_NO_DATA_MESSAGE} Looked for: a player named like "rudy", an opponent named like "eli".`,
    });
  });
});

test.describe("a follow-up keeps its subject", () => {
  const emonScope = `select match_id from ask.matches where match_id in ('${MATCH_A}', '${MATCH_B}')`;
  const previousPlan = {
    scope_sql: emonScope,
    sql: null,
    compare: "baseline" as const,
  };
  const conversation = [
    {
      role: "user" as const,
      content: "How is Emon doing? (about: player Emon van Loben Sels)",
    },
    { role: "assistant" as const, content: "For Emon van Loben Sels, …" },
  ];
  const baselineRow = {
    return_won_pct: 40.1,
    team_return_won_pct: 42.3,
    [ASK_COMPARE_SCOPE_MATCHES]: 3,
    [ASK_COMPARE_ALL_MATCHES]: 10,
  };
  const emon = match({ player_name: "Emon van Loben Sels" });

  test("a placeholder copied from the examples is sent back, then replaced by the previous scope", async () => {
    const copied =
      "select match_id from ask.matches where player_name ilike '%playera%' and played_on >= date '2026-08-01'";
    const { db, runs } = fakeDb(() => ok([emon], [baselineRow]));
    const { model, calls } = fakeModel([
      compare("baseline", copied),
      compare("baseline", copied),
    ]);
    const { headline } = await ask({
      db,
      model,
      question: "And how about his return?",
      conversation,
      previousPlan,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain(
      "scope_sql filters on the name 'playera', which is not in the question, its tags or the conversation.",
    );
    expect(runs).toEqual([
      { scope_sql: emonScope, sql: ASK_COMPARE_TEAM_BASELINE_SQL },
    ]);
    expect(headline).toBe(
      "For Emon van Loben Sels, return points won was lower than for the team (40.1% to 42.3%).",
    );
  });

  test("with no previous turn the placeholder falls back to every match", async () => {
    const { db, runs } = fakeDb(() => ok([emon], [OPPONENT_ROW]));
    const copied =
      "select match_id from ask.matches where player_name ilike '%playera%'";
    const { model } = fakeModel([
      compare("opponent", copied),
      compare("opponent", copied),
    ]);
    await ask({ db, model, question: "And how about his return?" });
    expect(runs[0].scope_sql).toBe(ASK_ALL_MATCHES_SCOPE);
  });

  test("a name nobody mentioned that is not a placeholder is sent back once and then stands", async () => {
    const made =
      "select match_id from ask.matches where player_name ilike '%sokol%'";
    const { db, runs } = fakeDb(() => ok([emon], [OPPONENT_ROW]));
    const { model, calls } = fakeModel([
      compare("opponent", made),
      compare("opponent", made),
    ]);
    await ask({ db, model, question: "How did we serve?" });
    expect(calls).toHaveLength(2);
    expect(runs.map((run) => run.scope_sql)).toEqual([made]);
  });

  test("a name the question gives is never sent back", async () => {
    const { db } = fakeDb(() => ok([emon], [OPPONENT_ROW]));
    const { model, calls } = fakeModel([
      compare(
        "opponent",
        "select match_id from ask.matches where player_name ilike '%emon%'",
      ),
    ]);
    await ask({ db, model, question: "How did Emon serve?" });
    expect(calls).toHaveLength(1);
  });

  test("a scope that finds no match is rerun over the previous turn's", async () => {
    const lost =
      "select match_id from ask.matches where opponent_name ilike '%kim%'";
    const { db, runs } = fakeDb((run) =>
      run.scope_sql === emonScope ? ok([emon], [baselineRow]) : ok([], []),
    );
    const { model } = fakeModel([compare("baseline", lost)]);
    // "Kim" is in the conversation, so the name guard does not fire; the
    // question itself names nobody.
    const { headline, error } = await ask({
      db,
      model,
      question: "And the return?",
      conversation: [
        ...conversation,
        { role: "assistant" as const, content: "… against Aidan Kim." },
      ],
      previousPlan,
    });
    expect(error).toBeUndefined();
    expect(runs.map((run) => run.scope_sql)).toEqual([lost, emonScope]);
    expect(headline).toMatch(/^For Emon van Loben Sels, return points won/);
  });

  // A saved answer is its owner's to write (ask_save_exchange), so the scope
  // read back from one is not the app's own: carried over, it must meet the
  // same check as any other, or hand-written SQL reaches the database.
  test("a previous scope that is not a query the check allows never reaches the database", async () => {
    const lost =
      "select match_id from ask.matches where opponent_name ilike '%kim%'";
    const forged =
      "select match_id from ask.matches where (select set_config('default_transaction_read_only', 'on', false)) is not null";
    const { db, runs } = fakeDb(() => ok([], []));
    const { model } = fakeModel([compare("baseline", lost)]);
    await ask({
      db,
      model,
      question: "And the return?",
      conversation: [
        ...conversation,
        { role: "assistant" as const, content: "… against Aidan Kim." },
      ],
      previousPlan: { ...previousPlan, scope_sql: forged },
    });
    expect(runs.map((run) => run.scope_sql)).toEqual([lost]);
    expect(runs.some((run) => run.scope_sql.includes("set_config"))).toBe(
      false,
    );
  });

  test("'his' over a scope of every match is the previous turn's scope", async () => {
    const { db, runs } = fakeDb(() => ok([emon], [baselineRow]));
    const { model, calls } = fakeModel([
      compare("baseline", ASK_ALL_MATCHES_SCOPE),
    ]);
    await ask({
      db,
      model,
      question: "And how about his return?",
      conversation,
      previousPlan,
    });
    expect(calls).toHaveLength(1);
    expect(runs[0].scope_sql).toBe(emonScope);
  });

  test("a first question is never given a previous scope", async () => {
    const { db, runs } = fakeDb(() => ok([], []));
    const { model } = fakeModel([
      compare(
        "opponent",
        "select match_id from ask.matches where opponent_name ilike '%kim%'",
      ),
    ]);
    const { error } = await ask({ db, model, question: "How about Kim?" });
    expect(runs).toHaveLength(1);
    expect(error?.code).toBe("no_data");
  });
});

test.describe("a comparison chosen for a question it cannot answer", () => {
  test("two groups of matches against each other: told back once, and the planner's own query answers", async () => {
    const { db, runs } = fakeDb(() =>
      ok(
        [match({ player_name: null }), match({ match_id: MATCH_B })],
        [
          {
            opponent_hand: "left",
            win_pct: 40,
            total_points_won_pct: 48,
            group_matches: 1,
          },
          {
            opponent_hand: "right",
            win_pct: 60,
            total_points_won_pct: 52,
            group_matches: 1,
          },
        ],
      ),
    );
    const split =
      "select m.opponent_hand, count(*) as group_matches from ask.matches m where m.match_id in (select match_id from scope) group by m.opponent_hand";
    const { model, calls } = fakeModel([
      compare("opponent", ASK_ALL_MATCHES_SCOPE),
      JSON.stringify({ scope_sql: ASK_ALL_MATCHES_SCOPE, sql: split }),
    ]);
    const { headline } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "How do I do against left-handers compared with right-handers?",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain(
      "The question sets two groups of matches against each other",
    );
    expect(runs.map((run) => run.sql)).toEqual([split]);
    expect(headline).toMatch(/^Matches won was higher for right/);
  });

  test("the second time it stands", async () => {
    const { db, runs } = fakeDb(() =>
      ok([match({ player_name: null })], [OPPONENT_ROW]),
    );
    const { model } = fakeModel([
      compare("opponent", ASK_ALL_MATCHES_SCOPE),
      compare("opponent", ASK_ALL_MATCHES_SCOPE),
    ]);
    const { error } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "Am I better on hard courts or clay?",
    });
    expect(error).toBeUndefined();
    expect(runs).toHaveLength(1);
  });
});

test.describe("an elliptical follow-up to a query the planner wrote", () => {
  const previousSql =
    "select m.opponent_hand, count(*) as group_matches, round(100.0 * sum(case when m.i_won then 1 else 0 end) / nullif(sum(case when m.i_won is not null then 1 else 0 end), 0), 1) as win_pct from ask.matches m where m.match_id in (select match_id from scope) group by m.opponent_hand";
  const previousPlan = {
    scope_sql:
      "select match_id from ask.matches where opponent_hand in ('left', 'right')",
    sql: previousSql,
  };
  const right =
    "select match_id from ask.matches where opponent_hand = 'right'";

  test("keeps that query over the new scope, whatever comparison the planner chose", async () => {
    const { db, runs } = fakeDb(() =>
      ok(
        [match({ player_name: null })],
        [{ opponent_hand: "right", group_matches: 1, win_pct: 60 }],
      ),
    );
    const { model } = fakeModel([
      compare("baseline", right, { measures: ["serve"] }),
      "Against right-handers you won most matches.\nFIGURE: Matches won = {{r1.win_pct}}",
    ]);
    const { error } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "And against right-handers?",
      previousPlan,
    });
    expect(error).toBeUndefined();
    expect(runs).toEqual([{ scope_sql: right, sql: previousSql }]);
  });

  test("after one of the app's comparisons it keeps the comparison and the measures the earlier question named", async () => {
    const { db, runs } = fakeDb(() =>
      ok(
        [match()],
        [
          {
            first_serve_pct: 64.1,
            team_first_serve_pct: 65.5,
            total_points_won_pct: 52.4,
            team_total_points_won_pct: 50.8,
            [ASK_COMPARE_SCOPE_MATCHES]: 6,
            [ASK_COMPARE_ALL_MATCHES]: 10,
          },
        ],
      ),
    );
    const rudy =
      "select match_id from ask.matches where player_name ilike '%rudy%'";
    // The planner answers with a query of its own, and a list it copied.
    const { model } = fakeModel([
      JSON.stringify({
        scope_sql: rudy,
        sql: "select sum(s.aces) as aces from ask.match_stats s where s.side = 'me' and s.match_id in (select match_id from scope)",
      }),
    ]);
    const { headline } = await ask({
      db,
      model,
      question: "And Rudy?",
      conversation: [
        { role: "user", content: "How is Emon serving?" },
        { role: "assistant", content: "For Emon van Loben Sels, …" },
      ],
      previousPlan: {
        scope_sql:
          "select match_id from ask.matches where player_name ilike '%emon%'",
        sql: null,
        compare: "baseline",
      },
    });
    expect(runs).toEqual([
      { scope_sql: rudy, sql: ASK_COMPARE_TEAM_BASELINE_SQL },
    ]);
    // Serve, from the earlier question: total points won is not shown.
    expect(headline).toBe(
      "For Rudy Quan, first serves in was lower than for the team (64.1% to 65.5%).",
    );
  });

  test("a follow-up that names its own measure is a new question", async () => {
    const { db, runs } = fakeDb(() =>
      ok([match({ player_name: null })], [OPPONENT_ROW]),
    );
    const { model } = fakeModel([compare("opponent", right)]);
    await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "And my winners against right-handers?",
      previousPlan,
    });
    expect(runs[0].sql).toBe(ASK_COMPARE_OPPONENT_SQL);
  });
});

test.describe("a group with more matches than the scope", () => {
  const sql =
    "select m.court_type, count(*) as group_matches, round(100.0 * sum(s.total_points_won) / nullif(sum(s.total_points), 0), 1) as total_points_won_pct from ask.match_stats s join ask.matches m on m.match_id = s.match_id where s.side in ('me', 'opponent') and s.match_id in (select match_id from scope) group by m.court_type";
  const PLAN = JSON.stringify({ scope_sql: ASK_ALL_MATCHES_SCOPE, sql });
  const rows = (count: number) => [
    {
      court_type: "Hard Court",
      group_matches: count,
      total_points_won_pct: 51.9,
    },
    { court_type: "Clay Court", group_matches: 1, total_points_won_pct: 44 },
  ];
  const ANSWER =
    "Hard courts were higher.\nFIGURE: Total points won = {{r1.total_points_won_pct}}\n\nFrom {{r1.group_matches}} matches.";

  test("is sent back once, saying rows were counted; the retry answers", async () => {
    let n = 0;
    const { db } = fakeDb(() =>
      ok([match(), match({ match_id: MATCH_B })], rows(n++ === 0 ? 18 : 1)),
    );
    const { model, calls } = fakeModel([PLAN, PLAN, ANSWER]);
    const { error } = await ask({
      db,
      model,
      question: "Hard courts or clay?",
    });
    expect(error).toBeUndefined();
    expect(calls[1].messages.at(-1)?.content).toContain(
      "group_matches holds more matches than scope selected: it counted rows",
    );
  });

  test("still over the second time: the count is left out, never printed", async () => {
    const { db } = fakeDb(() =>
      ok(
        [match(), match({ match_id: MATCH_B })],
        [{ court_type: "Hard Court", group_matches: 18, wins: 4 }],
      ),
    );
    const { model, calls } = fakeModel([PLAN, PLAN, ANSWER]);
    const { events } = await ask({
      db,
      model,
      question: "Hard courts or clay?",
    });
    expect(calls[2].system).not.toContain("group_matches");
    expect(JSON.stringify(events)).not.toContain("18");
  });
});

test.describe("mock mode", () => {
  test("is untouched: the fixed plan, no rerouting, whatever is asked", async () => {
    const { db, runs } = fakeDb(() =>
      ok(
        [match({ player_name: null })],
        [{ matches: 1, wins: 0, losses: 1, second_serve_won_pct: 41.2 }],
      ),
    );
    const { model, calls } = fakeModel([], false);
    const { headline, events } = await ask({
      db,
      model,
      scope: PERSONAL_ASK_SCOPE,
      question: "What should I practice?",
    });
    expect(calls).toHaveLength(0);
    expect(runs).toEqual([
      { scope_sql: ASK_MOCK_PLAN.scope_sql, sql: ASK_MOCK_PLAN.sql },
    ]);
    expect(headline).toContain("Here is your record");
    expect(events.at(-1)?.type).toBe("done");
  });
});
