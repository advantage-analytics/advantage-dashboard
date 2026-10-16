import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ASK_VISUAL_KINDS } from "@/lib/services/ask/events";

import {
  ASK_EVAL_ERROR_CODES,
  expectProblems,
  failedReasons,
  gradeLabel,
  gradeTranscript,
  readShape,
  refusedGrade,
  renderedAnswer,
  tally,
  type AskEvalExpect,
  type AskEvalGrade,
  type AskEvalTranscript,
} from "../scripts/lib/ask-eval-grade";

/**
 * `scripts/lib/ask-eval-grade.ts` — how `scripts/ask-eval.ts` scores a
 * question's run against its `expect` block. Offline: fake transcripts, no
 * model, no database. The last block checks that the committed question
 * lists carry well-formed blocks, since a misspelt key would otherwise grade
 * as a pass it never checked.
 */

const PLAN_A =
  '{"scope_sql": "select match_id from ask.matches where played_on >= \'2026-01-01\'", "sql": "select round(100.0 * sum(s.first_serves_in) / nullif(sum(s.first_serves), 0), 1) as first_serve_pct from ask.match_stats s join scope using (match_id) where s.side = \'me\'", "asks_for_advice": false}';
const PLAN_B =
  '{"cannot_answer": "Ask covers your own matches, not another player\'s.", "asks_for_advice": false}';
const PLAN_C =
  '{"review": true, "scope_sql": "select match_id from ask.matches", "asks_for_advice": true}';
const PLAN_D =
  '{"compare": "opponent", "scope_sql": "select match_id from ask.matches where match_id in (\'871fa030-19a4-4e04-9269-8f7abb1a98c9\')", "asks_for_advice": true}';
const ANSWER =
  "Your first serve climbed over the season.\nFIGURE: First serve | {{r1.first_serve_pct}}\nIt rose from the mid fifties to the high sixties.";
const PATTERN_READING =
  '{"clarify": {"question": "Which serve?", "options": ["First serve", "Second serve"]}}';

/** A shape A run that answered: two model calls, one query, a trend. */
const answered: AskEvalTranscript = {
  seconds: 3.2,
  modelReplies: [PLAN_A, ANSWER],
  queries: [
    {
      scope: "select match_id from ask.matches where played_on >= '2026-01-01'",
      sql: "select round(100.0 * sum(s.first_serves_in) / nullif(sum(s.first_serves), 0), 1) as first_serve_pct from ask.match_stats s join scope using (match_id) where s.side = 'me'",
      error: null,
    },
  ],
  headline: "Your first serve climbed over the season.",
  figures: [{ label: "First serve", value: "68.3%" }],
  visual: { kind: "trend" },
  body: "It rose from 54.6% in February to 68.3% in September.",
  error: null,
  notice: false,
};

/** A shape B run: one model call, no query, the cannot_answer error. */
const refused: AskEvalTranscript = {
  seconds: 0.9,
  modelReplies: [PLAN_B],
  queries: [],
  headline: null,
  figures: [],
  visual: null,
  body: "",
  error: "cannot_answer",
  notice: false,
};

/** Every check an expect block can carry, each one satisfied by `answered`. */
const ALL_PASSING: AskEvalExpect = {
  error: "none",
  shape: "A",
  visual: "trend",
  notice: false,
  modelCalls: 2,
  queries: 1,
  seconds: 5,
  headline: ["climbed"],
  figures: ["68\\.3%", "First serve: "],
  body: ["february"],
  absent: ["\\b(you should|try|focus on|work on)\\b"],
  sql: ["first_serves_in", "played_on >= '2026-01-01'"],
  note: "the reference block",
};

/** Every check contradicted by `answered`. */
const ALL_FAILING: AskEvalExpect = {
  error: "no_data",
  shape: "D",
  visual: "none",
  notice: true,
  modelCalls: 1,
  queries: 0,
  seconds: 3,
  headline: ["fell"],
  figures: ["41\\.7%"],
  body: ["you should serve wider"],
  absent: ["climbed"],
  sql: ["opponent_hand"],
  shape_note: "ignored",
} as AskEvalExpect;

function scored(grade: AskEvalGrade) {
  if (!grade.scored) throw new Error("expected a scored grade");
  return grade;
}

test.describe("gradeTranscript", () => {
  test("a question with no expect block is unscored", () => {
    const grade = gradeTranscript(undefined, answered);
    expect(grade).toEqual({ scored: false });
    expect(gradeLabel(grade)).toBe("unscored");
    expect(failedReasons(grade)).toEqual([]);
  });

  test("an empty block scores as passed with no checks", () => {
    const grade = scored(gradeTranscript({}, answered));
    expect(grade.pass).toBe(true);
    expect(grade.checks).toEqual([]);
    expect(gradeLabel(grade)).toBe("PASS");
  });

  test("every check kind passes against a transcript that satisfies it, each with a one-line reason", () => {
    const grade = scored(gradeTranscript(ALL_PASSING, answered));
    expect(grade.pass).toBe(true);
    expect(grade.checks.map((check) => check.name)).toEqual([
      "error",
      "shape",
      "visual",
      "notice",
      "modelCalls",
      "queries",
      "seconds",
      "headline",
      "figures",
      "figures",
      "body",
      "absent",
      "sql",
      "sql",
    ]);
    for (const check of grade.checks) {
      expect(check.pass).toBe(true);
      expect(check.reason).not.toContain("\n");
      expect(check.reason.length).toBeGreaterThan(0);
    }
    expect(failedReasons(grade)).toEqual([]);
    expect(gradeLabel(grade)).toBe("PASS");
  });

  test("every check kind fails against a transcript that contradicts it, naming what was expected and what was found", () => {
    // The unknown key is reported first and alone: a block that is not
    // well-formed is not graded further.
    const malformed = scored(gradeTranscript(ALL_FAILING, answered));
    expect(malformed.pass).toBe(false);
    expect(malformed.checks).toEqual([
      { name: "expect", pass: false, reason: 'unknown key "shape_note"' },
    ]);

    const { shape_note: _ignored, ...failing } =
      ALL_FAILING as AskEvalExpect & {
        shape_note: string;
      };
    const grade = scored(gradeTranscript(failing, answered));
    expect(grade.pass).toBe(false);
    expect(grade.checks.every((check) => !check.pass)).toBe(true);
    expect(failedReasons(grade)).toEqual([
      "error: expected no_data, got none",
      "shape: expected D, got A",
      "visual: expected none, got trend",
      "notice: expected true, got false",
      "modelCalls: expected at most 1, got 2",
      "queries: expected at most 0, got 1",
      "seconds: expected at most 3, got 3.2",
      "headline: /fell/ not found in the answer",
      "figures: /41\\.7%/ not found in the answer",
      "body: /you should serve wider/ not found in the answer",
      'absent: /climbed/ found in the answer ("climbed")',
      "sql: /opponent_hand/ not found in the final query",
    ]);
    expect(gradeLabel(grade)).toMatch(
      /^FAIL error: expected no_data, got none; shape: expected D, got A; /,
    );
  });

  test("error: none means an answer, a code means that code, and a thrown pipeline is THROWN", () => {
    expect(
      scored(gradeTranscript({ error: "cannot_answer" }, refused)).pass,
    ).toBe(true);
    expect(scored(gradeTranscript({ error: "none" }, refused)).pass).toBe(
      false,
    );
    expect(
      failedReasons(gradeTranscript({ error: "no_data" }, refused)),
    ).toEqual(["error: expected no_data, got cannot_answer"]);
    expect(
      failedReasons(
        gradeTranscript({ error: "none" }, { ...answered, error: "THROWN" }),
      ),
    ).toEqual(["error: expected none, got THROWN"]);
  });

  test("visual: none means no block, a kind means that kind", () => {
    expect(scored(gradeTranscript({ visual: "none" }, refused)).pass).toBe(
      true,
    );
    expect(
      failedReasons(gradeTranscript({ visual: "table" }, answered)),
    ).toEqual(["visual: expected table, got trend"]);
    expect(failedReasons(gradeTranscript({ visual: "form" }, refused))).toEqual(
      ["visual: expected form, got none"],
    );
  });

  test("notice", () => {
    const noticed = { ...answered, notice: true };
    expect(scored(gradeTranscript({ notice: true }, noticed)).pass).toBe(true);
    expect(failedReasons(gradeTranscript({ notice: false }, noticed))).toEqual([
      "notice: expected false, got true",
    ]);
  });

  test("modelCalls, queries and seconds are ceilings: equal passes, more fails", () => {
    expect(
      scored(
        gradeTranscript({ modelCalls: 2, queries: 1, seconds: 3.2 }, answered),
      ).pass,
    ).toBe(true);
    expect(
      failedReasons(
        gradeTranscript({ modelCalls: 1, queries: 0, seconds: 1 }, answered),
      ),
    ).toEqual([
      "modelCalls: expected at most 1, got 2",
      "queries: expected at most 0, got 1",
      "seconds: expected at most 1, got 3.2",
    ]);
    // Zero is a ceiling too: a refusal makes no query.
    expect(scored(gradeTranscript({ queries: 0 }, refused)).pass).toBe(true);
  });

  test("headline, figures and body patterns run over the rendered answer: headline, figure lines, body", () => {
    expect(renderedAnswer(answered)).toBe(
      "Your first serve climbed over the season.\n- First serve: 68.3%\nIt rose from 54.6% in February to 68.3% in September.",
    );
    // Each name reaches every part, case-insensitively.
    for (const key of ["headline", "figures", "body"] as const) {
      expect(
        scored(
          gradeTranscript(
            { [key]: ["CLIMBED", "- first serve: 68", "september"] },
            answered,
          ),
        ).pass,
      ).toBe(true);
    }
    // A refusal renders to nothing, so a pattern cannot be found in it.
    expect(renderedAnswer(refused)).toBe("");
    expect(failedReasons(gradeTranscript({ body: ["."] }, refused))).toEqual([
      "body: /./ not found in the answer",
    ]);
  });

  test("absent patterns must not match anywhere in the rendered answer, and the reason quotes the match", () => {
    const advised = {
      ...answered,
      body: "You should work on your second serve.",
    };
    const advice = "\\b(you should|try|focus on|work on)\\b";
    expect(scored(gradeTranscript({ absent: [advice] }, answered)).pass).toBe(
      true,
    );
    expect(
      failedReasons(gradeTranscript({ absent: [advice] }, advised)),
    ).toEqual([`absent: /${advice}/ found in the answer ("You should")`]);
  });

  test("sql patterns run over the final query's scope_sql and sql together", () => {
    // The scope holds the filter, the sql the measure: both must be seen.
    expect(
      scored(
        gradeTranscript(
          { sql: ["played_on >= '2026-01-01'", "first_serves_in"] },
          answered,
        ),
      ).pass,
    ).toBe(true);
    // Only the last query counts: a retried planner's earlier query is not it.
    const retried: AskEvalTranscript = {
      ...answered,
      queries: [
        {
          scope: "select match_id from ask.matches",
          sql: "select 1",
          error: "42703 column does not exist",
        },
        ...answered.queries,
      ],
    };
    expect(
      scored(gradeTranscript({ sql: ["first_serves_in"] }, retried)).pass,
    ).toBe(true);
    expect(
      failedReasons(gradeTranscript({ sql: ["select 1$"] }, retried)),
    ).toEqual(["sql: /select 1$/ not found in the final query"]);
    // No query at all is a failure, once, whatever the patterns.
    expect(
      failedReasons(gradeTranscript({ sql: ["a", "b"] }, refused)),
    ).toEqual(["sql: no query ran"]);
  });

  test("shape is read from the last model reply that parses as a plan", () => {
    expect(readShape([PLAN_A, ANSWER])).toBe("A");
    expect(readShape([PLAN_B])).toBe("B");
    expect(readShape([PLAN_C])).toBe("C");
    expect(readShape([PLAN_D])).toBe("D");
    // A retried planner: the attempt the run went with is the last one.
    expect(readShape(["not a plan", PLAN_B, PLAN_A, ANSWER])).toBe("A");
    // The pattern reading never parses as a plan, so it does not hide one.
    expect(readShape([PLAN_A, PATTERN_READING, ANSWER])).toBe("A");
    // A fenced plan still parses.
    expect(readShape(["```json\n" + PLAN_D + "\n```"])).toBe("D");
    expect(readShape([])).toBeNull();
    expect(readShape([ANSWER])).toBeNull();

    expect(failedReasons(gradeTranscript({ shape: "C" }, answered))).toEqual([
      "shape: expected C, got A",
    ]);
    expect(
      failedReasons(
        gradeTranscript(
          { shape: "A" },
          { ...answered, modelReplies: [ANSWER] },
        ),
      ),
    ).toEqual(["shape: expected A, got none (no reply parsed as a plan)"]);
    expect(scored(gradeTranscript({ shape: "B" }, refused)).pass).toBe(true);
  });

  test("a pattern that does not compile fails the block as malformed", () => {
    const grade = scored(gradeTranscript({ body: ["("] }, answered));
    expect(grade.pass).toBe(false);
    expect(grade.checks).toEqual([
      {
        name: "expect",
        pass: false,
        reason: 'body pattern "(" does not compile',
      },
    ]);
  });
});

test.describe("expectProblems", () => {
  test("a well-formed block has none", () => {
    expect(expectProblems(ALL_PASSING)).toEqual([]);
    expect(expectProblems({})).toEqual([]);
  });

  test("names every problem, one line each", () => {
    expect(
      expectProblems({
        error: "timeout",
        visual: "pie",
        notice: "yes",
        shape: "E",
        modelCalls: -1,
        queries: "two",
        seconds: Number.NaN,
        headline: "climbed",
        figures: [1],
        absent: ["("],
        note: 7,
        want: "stray",
      }),
    ).toEqual([
      'unknown key "want"',
      `error must be "none" or one of ${ASK_EVAL_ERROR_CODES.join(", ")}`,
      `visual must be "none" or one of ${ASK_VISUAL_KINDS.join(", ")}`,
      "notice must be true or false",
      "shape must be one of A, B, C, D, or a list of them",
      "note must be a string",
      "modelCalls must be a number of 0 or more",
      "queries must be a number of 0 or more",
      "seconds must be a number of 0 or more",
      "headline must be an array of pattern strings",
      "figures must be an array of pattern strings",
      'absent pattern "(" does not compile',
    ]);
    expect(expectProblems(null)).toEqual(["expect is not an object"]);
    expect(expectProblems([])).toEqual(["expect is not an object"]);
  });
});

test.describe("refusedGrade", () => {
  test("a refused tag fails a graded question and leaves an ungraded one unscored", () => {
    const grade = refusedGrade({ shape: "D" }, "no opponent named Nobody");
    expect(grade).toEqual({
      scored: true,
      pass: false,
      checks: [
        {
          name: "tags",
          pass: false,
          reason: "tag refused: no opponent named Nobody",
        },
      ],
    });
    expect(gradeLabel(grade)).toBe(
      "FAIL tag refused: no opponent named Nobody",
    );
    expect(refusedGrade(undefined, "no opponent named Nobody")).toEqual({
      scored: false,
    });
  });
});

test.describe("tally", () => {
  test("counts passed, failed and unscored", () => {
    expect(
      tally([
        gradeTranscript(undefined, answered),
        gradeTranscript({}, answered),
        gradeTranscript({ shape: "A" }, answered),
        gradeTranscript({ shape: "B" }, answered),
        refusedGrade({ shape: "D" }, "refused"),
      ]),
    ).toEqual({ passed: 2, failed: 2, unscored: 1 });
    expect(tally([])).toEqual({ passed: 0, failed: 0, unscored: 0 });
  });
});

test.describe("the committed question lists", () => {
  for (const [file, count] of [
    ["scripts/ask-eval-season.json", 21],
    ["scripts/ask-eval-team.json", 32],
  ] as const) {
    test(`${file}: every entry carries a well-formed expect block`, () => {
      const list = JSON.parse(readFileSync(file, "utf8")) as {
        q: string;
        expect?: unknown;
      }[];
      expect(list).toHaveLength(count);
      for (const [index, entry] of list.entries()) {
        expect(entry.expect, `${index + 1}. ${entry.q}`).toBeDefined();
        expect(
          expectProblems(entry.expect),
          `${index + 1}. ${entry.q}`,
        ).toEqual([]);
      }
    });
  }

  test("the season list grades the seed's deterministic values where it can", () => {
    const list = JSON.parse(
      readFileSync("scripts/ask-eval-season.json", "utf8"),
    ) as { q: string; opponents?: string[]; expect: AskEvalExpect }[];
    const dvorsky = list.filter((entry) =>
      entry.opponents?.includes("Marek Dvorsky"),
    );
    expect(dvorsky).toHaveLength(2);
    for (const entry of dvorsky) {
      expect(entry.expect.shape).toBe("D");
      expect(entry.expect.figures).toContain("won 0 and lost 3");
    }
    // Every question whose figures depend on the verifier's other matches
    // says so, and pins no figure.
    for (const entry of list) {
      if (entry.expect.note?.includes("not pinned")) {
        expect(entry.expect.figures, entry.q).toBeUndefined();
      }
    }
    // The reviews: shape C with the notice and no advice words.
    const reviews = list.filter((entry) => entry.expect.shape === "C");
    expect(reviews.map((entry) => entry.q)).toEqual([
      "What should I work on?",
      "How can I improve for my next match?",
      "What went wrong in my last match?",
      "Where has my game slipped recently?",
    ]);
    for (const entry of reviews) {
      expect(entry.expect.notice).toBe(true);
      expect(entry.expect.absent).toEqual([
        "\\b(you should|try|focus on|work on)\\b",
      ]);
    }
  });
});
