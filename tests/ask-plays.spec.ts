import { expect, test } from "@playwright/test";

import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent } from "@/lib/services/ask/events";
import {
  asksForLosingPlays,
  buildLosingPlaysAnswer,
  isLosingPlaysSql,
  losingPlaysSql,
  losingPlaysSubject,
  losingPlaysVoice,
} from "@/lib/services/ask/plays";
import type { AskPromptTag } from "@/lib/services/ask/prompts";
import { checkAskSql } from "@/lib/services/ask/sql-guard";

/**
 * Offline spec for losing plays — "What are Eli's losing plays?". The answer
 * is read from the shots (stroke, direction, result), never from the match
 * totals the fixed comparisons use, and it says what happened, never what to
 * do about it.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * `losingPlaysSql("opponent")`'s rows for one video match (Sep 25, 187
 * points), as the database returned them. Abridged to the rows the answer
 * reads.
 */
const ROWS: AskRow[] = [
  {
    section: "total",
    stroke: null,
    direction: null,
    shots: 90,
    missed: 1,
    miss_pct: null,
    place: 1,
  },
  {
    section: "rally",
    stroke: "Volley",
    direction: "Down the Line",
    shots: 13,
    missed: 4,
    miss_pct: 30.8,
    place: 1,
  },
  {
    section: "rally",
    stroke: "Backhand",
    direction: "Down the Line",
    shots: 48,
    missed: 8,
    miss_pct: 16.7,
    place: 2,
  },
  {
    section: "rally",
    stroke: "Forehand",
    direction: "Down the Line",
    shots: 135,
    missed: 13,
    miss_pct: 9.6,
    place: 3,
  },
  {
    section: "rally",
    stroke: "Backhand",
    direction: "Middle",
    shots: 34,
    missed: 3,
    miss_pct: 8.8,
    place: 4,
  },
  {
    section: "serve",
    stroke: "First Serve",
    direction: "T",
    shots: 28,
    missed: 10,
    miss_pct: 35.7,
    place: 1,
  },
  {
    section: "serve",
    stroke: "First Serve",
    direction: "Wide",
    shots: 60,
    missed: 13,
    miss_pct: 21.7,
    place: 2,
  },
  {
    section: "serve",
    stroke: "Second Serve",
    direction: "Wide",
    shots: 15,
    missed: 2,
    miss_pct: 13.3,
    place: 3,
  },
  {
    section: "lost_error",
    stroke: "Forehand",
    direction: "Down the Line",
    shots: 13,
    missed: null,
    miss_pct: null,
    place: 1,
  },
  {
    section: "lost_error",
    stroke: "Backhand",
    direction: "Down the Line",
    shots: 8,
    missed: null,
    miss_pct: null,
    place: 2,
  },
  {
    section: "lost_winner",
    stroke: "Forehand",
    direction: "Crosscourt",
    shots: 12,
    missed: null,
    miss_pct: null,
    place: 1,
  },
  {
    section: "lost_winner",
    stroke: "Overhead",
    direction: "Crosscourt",
    shots: 5,
    missed: null,
    miss_pct: null,
    place: 2,
  },
].map((row) => ({ ...row, matches_in_scope: 1 }));

const OPPONENT_TAG: AskPromptTag = {
  kind: "opponent",
  opponentName: "Eli Stephenson",
  matchIds: ["19b3cdf6-691f-44e5-b519-c79887bacdce"],
};

async function rendered(text: string, rows: readonly AskRow[]) {
  const { events, result } = renderAskAnswer(
    (async function* chunks() {
      yield text;
    })(),
    rows,
  );
  const seen: AskAnswerEvent[] = [];
  for await (const event of events) seen.push(event);
  return { events: seen, result };
}

// ── Routing ─────────────────────────────────────────────────────────────────

test.describe("which questions are losing plays", () => {
  for (const question of [
    "What is this players losing plays?",
    "What are my losing plays?",
    "Which shots does Eli miss the most?",
    "Where does he miss?",
    "Which strokes break down under pressure?",
    "What are his worst shots?",
    "errors by stroke",
  ]) {
    test(`yes: ${question}`, () => {
      expect(asksForLosingPlays(question)).toBe(true);
    });
  }
  for (const question of [
    "How is my second serve?",
    "What happened against Eli?",
    "How can I improve for my next match?",
    "Where do I serve on break points?",
    "Who has the best record?",
  ]) {
    test(`no: ${question}`, () => {
      expect(asksForLosingPlays(question)).toBe(false);
    });
  }
});

test.describe("whose plays", () => {
  test("a tagged opponent with no first person is the opponent", () => {
    expect(
      losingPlaysSubject("What is this players losing plays?", [OPPONENT_TAG]),
    ).toBe("opponent");
  });
  test("a word for the other side is the opponent, tagged or not", () => {
    expect(losingPlaysSubject("Where does he miss?", [])).toBe("opponent");
  });
  test("the possessive decides whose plays, even with an opponent tagged", () => {
    expect(
      losingPlaysSubject("What are my losing plays against him?", [
        OPPONENT_TAG,
      ]),
    ).toBe("mine");
    expect(
      losingPlaysSubject("What are my losing plays?", [OPPONENT_TAG]),
    ).toBe("mine");
    expect(
      losingPlaysSubject("What are his losing plays against me?", []),
    ).toBe("opponent");
  });
  test("nothing said either way is the viewer", () => {
    expect(losingPlaysSubject("Which shots miss the most?", [])).toBe("mine");
  });
});

// ── The query ───────────────────────────────────────────────────────────────

test.describe("the query", () => {
  for (const subject of ["mine", "opponent"] as const) {
    test(`${subject}: passes the SQL guard`, () => {
      expect(
        checkAskSql({
          scopeSql: "select match_id from ask.matches",
          sql: losingPlaysSql(subject),
        }),
      ).toEqual({ ok: true });
    });
  }
  test("each side reads its own shots and its own lost points", () => {
    expect(losingPlaysSql("opponent")).toContain("where mine = false and zone");
    expect(losingPlaysSql("opponent")).toContain("i_won = true");
    expect(losingPlaysSql("mine")).toContain("where mine = true and zone");
    expect(losingPlaysSql("mine")).toContain("i_won = false");
  });
  test("is recognised as the server's own", () => {
    expect(isLosingPlaysSql(losingPlaysSql("mine"))).toBe(true);
    expect(isLosingPlaysSql("select 1")).toBe(false);
  });
});

// ── The answer ──────────────────────────────────────────────────────────────

test.describe("the answer", () => {
  const voice = losingPlaysVoice("opponent", "Eli Stephenson");

  test("renders with every figure from a cell, and a table of rally shots", async () => {
    const text = buildLosingPlaysAnswer(ROWS, voice, 1);
    expect(text).not.toBeNull();
    const { events, result } = await rendered(text ?? "", ROWS);
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);

    expect(result.headline).toBe(
      "Eli Stephenson's most-missed rally shots were the volley down the line (4 of 13, 30.8%) and the backhand down the line (8 of 48, 16.7%).",
    );
    expect(result.visual?.kind).toBe("table");
    if (result.visual?.kind !== "table") throw new Error("no table");
    expect(result.visual.columns).toEqual(["Shots", "Missed", "Miss rate"]);
    expect(result.visual.rows.map((row) => row.label)).toEqual([
      "Volley down the line",
      "Backhand down the line",
      "Forehand down the line",
      "Backhand through the middle",
    ]);

    expect(result.text).toContain(
      "Of the 90 points Eli Stephenson lost, the most common finish was their own miss: the forehand down the line (13) and the backhand down the line (8).",
    );
    expect(result.text).toContain(
      "The balls that won points against Eli Stephenson came most from the forehand crosscourt (12) and the overhead crosscourt (5).",
    );
    expect(result.text).toContain(
      "On serve, Eli Stephenson's first serves were faults on 10 of 28 to the T and 13 of 60 out wide; second serves were double faults on 2 of 15 out wide.",
    );
  });

  test("never says what to do about it", () => {
    const text = buildLosingPlaysAnswer(ROWS, voice, 1) ?? "";
    expect(text).not.toMatch(/\b(?:should|try|aim|target|attack|hit to)\b/i);
  });

  test("speaks to the viewer about their own plays", async () => {
    const text = buildLosingPlaysAnswer(
      ROWS,
      losingPlaysVoice("mine", null),
      1,
    );
    const { result } = await rendered(text ?? "", ROWS);
    expect(result.headline.startsWith("Your most-missed rally shots")).toBe(
      true,
    );
    expect(result.text).toContain("Of the 90 points you lost");
    expect(result.text).toContain("won points against you");
  });

  test("says when only some matches have shots", async () => {
    const rows = ROWS.map((row) => ({ ...row, matches_in_scope: 3 }));
    const text = buildLosingPlaysAnswer(rows, voice, 3);
    const { result } = await rendered(text ?? "", rows);
    expect(result.text).toContain(
      "Counted from the shots of 1 of the 3 matches here; the others have no shot-by-shot data.",
    );
  });

  test("no shot in any match is no answer at all, never the totals", () => {
    const rows: AskRow[] = [
      {
        section: "total",
        stroke: null,
        direction: null,
        shots: 0,
        missed: 0,
        miss_pct: null,
        place: 1,
        matches_in_scope: 1,
      },
    ];
    expect(buildLosingPlaysAnswer(rows, voice, 1)).toBeNull();
    expect(buildLosingPlaysAnswer([], voice, 1)).toBeNull();
  });
});
