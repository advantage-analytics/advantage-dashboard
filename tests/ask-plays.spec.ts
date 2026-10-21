import { expect, test } from "@playwright/test";

import { parseMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent } from "@/lib/services/ask/events";

import {
  ASK_PLAYS_CLARIFY_OPTIONS,
  asksAboutPlays,
  asksForLosingPlays,
  asksForWinningPlays,
  buildLosingPlaysAnswer,
  buildWinningPlaysAnswer,
  isLosingPlaysSql,
  isWinningPlaysSql,
  rallyLengthOf,
  rallyFilterBand,
  rallyLengthOfPlaysSql,
  winningPlaysSql,
  winningPlaysSubject,
  losingPlaysSql,
  losingPlaysSubject,
  losingPlaysVoice,
} from "@/lib/services/ask/plays";
import type { AskPromptTag } from "@/lib/services/ask/prompts";
import { plusOneBreakdownAsked } from "@/lib/services/ask/serve-plus-one";
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
    expect(losingPlaysSql("opponent")).toContain(
      "where mine = false and direction",
    );
    expect(losingPlaysSql("opponent")).toContain("i_won = true");
    expect(losingPlaysSql("mine")).toContain("where mine = true and direction");
    expect(losingPlaysSql("mine")).toContain("i_won = false");
  });
  test("misses are counted per shot from ask.shots, lost points per point from ask.point_plays", () => {
    const sql = losingPlaysSql("mine");
    expect(sql.match(/from ask\.shots/g)).toHaveLength(1);
    expect(sql.match(/from ask\.point_plays/g)).toHaveLength(1);
    // The last shot's direction comes from the query's own pass over the
    // shots, by last_shot_number, never from the view's last_direction.
    expect(sql).toContain(
      "p.last_shot_type as shot_type, l.direction, p.last_result as result",
    );
    expect(sql).toContain("l.shot_number = p.last_shot_number");
    expect(sql).not.toContain("last_direction");
    expect(sql).toContain(
      "where has_shots and i_won = false and shot_type is not null",
    );
    expect(sql).toContain(
      "count(*) filter (where has_shots and i_won = false)",
    );
  });
  test("is recognised as the server's own", () => {
    expect(isLosingPlaysSql(losingPlaysSql("mine"))).toBe(true);
    expect(isLosingPlaysSql("select 1")).toBe(false);
  });
});

// ── The answer ──────────────────────────────────────────────────────────────

test.describe("the answer", () => {
  const voice = losingPlaysVoice("opponent", "Eli Stephenson");

  test("renders with every figure from a cell, and a tree of rally shots", async () => {
    const text = buildLosingPlaysAnswer(ROWS, voice, 1);
    expect(text).not.toBeNull();
    expect(text).toContain("WATCH: plays | opponent");
    const { events, result } = await rendered(text ?? "", ROWS);
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
    expect(result.droppedVisuals).toEqual([]);

    expect(result.headline).toBe(
      "Eli Stephenson's most-missed rally shots were the volley down the line (4 of 13, 30.8%) and the backhand down the line (8 of 48, 16.7%).",
    );
    expect(result.visual?.kind).toBe("tree");
    if (result.visual?.kind !== "tree") throw new Error("no tree");
    expect(result.visual.levels).toEqual(["Stroke", "Direction"]);
    expect(result.visual.countLabel).toBe("Shots");
    expect(result.visual.partLabel).toBe("Missed");
    expect(result.visual.shareLabel).toBe("Miss rate");
    expect(result.visual.branches.map((branch) => branch.steps)).toEqual([
      ["Volley", "down the line"],
      ["Backhand", "down the line"],
      ["Forehand", "down the line"],
      ["Backhand", "through the middle"],
    ]);
    expect(result.visual.branches[1]).toMatchObject({
      count: { value: 48, text: "48" },
      part: { value: 8, text: "8" },
      share: { value: 16.7, text: "16.7%" },
    });
    // Eli's backhand down the line opens the film on the points it was
    // hit in; the middle is a direction the filter does not offer.
    expect(parseMatchFilters(result.visual.branches[1].watch)).toMatchObject({
      customPlayer: "opponent",
      customStroke: ["Backhand"],
      customDirection: ["Down the Line"],
    });
    expect(result.visual.branches[3].watch).toBeUndefined();

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

test.describe("winning plays", () => {
  for (const question of [
    "What are this player's best plays from all his matches so far",
    "what are my winning shots?",
    "What are Emon's strengths?",
    "which shots won him the most points",
  ]) {
    test(`yes: ${question}`, () => {
      expect(asksForWinningPlays(question)).toBe(true);
    });
  }

  test("in a team, 'this player' is the program's player", () => {
    expect(
      winningPlaysSubject("What are this player's best plays?", [], true),
    ).toBe("mine");
    expect(
      winningPlaysSubject("What are his opponent's best plays?", [], true),
    ).toBe("opponent");
  });

  test("passes the guard, and credits the shot before the other side's miss", () => {
    for (const subject of ["mine", "opponent"] as const) {
      expect(
        checkAskSql({
          scopeSql: "select match_id from ask.matches",
          sql: winningPlaysSql(subject),
        }),
      ).toEqual({ ok: true });
    }
    expect(winningPlaysSql("mine")).toContain("prev_mine = true");
    // Per point: the last shot and the one before it come from the view,
    // never from a window over ask.shots.
    expect(winningPlaysSql("mine")).not.toContain("ask.shots");
    expect(winningPlaysSql("mine")).toContain(
      "where has_shots and i_won = true and last_mine = true and last_result = 'In'",
    );
    expect(winningPlaysSql("opponent")).toContain(
      "where has_shots and i_won = false and last_mine <> false and last_result in ('Out', 'Net')",
    );
  });

  test("renders with every figure from a cell", async () => {
    const rows: AskRow[] = [
      {
        section: "total",
        stroke: null,
        direction: null,
        points: 199,
        winners: 186,
        errors_drawn: 3,
      },
      {
        section: "play",
        stroke: "Backhand",
        direction: "Crosscourt",
        points: 25,
        winners: 7,
        errors_drawn: 18,
        points_pct: 12.6,
      },
      {
        section: "play",
        stroke: "Forehand",
        direction: "Down the Line",
        points: 24,
        winners: 12,
        errors_drawn: 12,
        points_pct: 12.1,
      },
    ];
    const text =
      buildWinningPlaysAnswer(
        rows,
        losingPlaysVoice("mine", "Emon van Loben Sels"),
        3,
      ) ?? "";
    const { events } = renderAskAnswer(
      (async function* chunks() {
        yield text;
      })(),
      rows,
    );
    const seen: AskAnswerEvent[] = [];
    for await (const event of events) seen.push(event);
    expect(seen.find((event) => event.type === "headline")).toEqual({
      type: "headline",
      text: "Emon van Loben Sels's best play was the backhand crosscourt: it won 25 points — 7 as their own winner and 18 by drawing an error.",
    });
    expect(seen.some((event) => event.type === "error")).toBe(false);
  });

  test("draws a tree whose rally shots each open the film on the points won with them", async () => {
    const rows: AskRow[] = [
      {
        section: "total",
        stroke: null,
        direction: null,
        points: 49,
        winners: 41,
        errors_drawn: 1,
        points_pct: null,
      },
      {
        section: "play",
        stroke: "Forehand",
        direction: "Crosscourt",
        points: 12,
        winners: 5,
        errors_drawn: 7,
        points_pct: 24.5,
      },
      {
        section: "play",
        stroke: "First Serve",
        direction: "T",
        points: 6,
        winners: 6,
        errors_drawn: 0,
        points_pct: 12.2,
      },
    ];
    const text =
      buildWinningPlaysAnswer(rows, losingPlaysVoice("mine", "Sam"), 1) ?? "";
    expect(text).toContain("WATCH: plays | mine | won\n");
    // The film holds every point won with the shot in the rally — more than
    // the ones it ended — and the copy says so.
    expect(text).toContain(
      "Each linked play below opens the film on every point won with it anywhere in the rally, so the film can hold more points than the play counts.",
    );
    expect(text).toContain(
      "A play's points won are its winners and the errors it drew.",
    );
    const { events, result } = await rendered(text, rows);
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.visual?.kind).toBe("tree");
    if (result.visual?.kind !== "tree") throw new Error("no tree");
    expect(result.visual.countLabel).toBe("Points won");
    expect(result.visual.partLabel).toBe("Winners");
    // The export's header and the screen reader name the share as one.
    expect(result.visual.shareLabel).toBe("Share of points won");
    expect(result.visual.branches[0]).toMatchObject({
      steps: ["Forehand", "crosscourt"],
      count: { value: 12, text: "12" },
      part: { value: 5, text: "5" },
      share: { value: 24.5, text: "24.5%" },
    });
    // The forehand crosscourt opens Sam's points won with it in the rally.
    expect(parseMatchFilters(result.visual.branches[0].watch)).toMatchObject({
      customPlayer: "you",
      customStroke: ["Forehand"],
      customDirection: ["Crosscourt"],
      resultOutcome: ["won"],
    });
    // A serve is no Custom stroke the Video filter offers: no link.
    expect(result.visual.branches[1].watch).toBeUndefined();
  });

  test("the query carries each play's share of all the points won", () => {
    const sql = winningPlaysSql("mine");
    // Of the total row's points won — not of the points a play accounts for.
    expect(sql).toContain(
      "select count(*) as points from ended where has_shots and i_won = true",
    );
    expect(sql).toContain(
      "round(100.0 * points / nullif((select points from won), 0), 1) as points_pct",
    );
    expect(sql).toContain("(select points from won) as points,");
  });

  const play = (stroke: string, points: number): AskRow => ({
    section: "play",
    stroke,
    direction: "Crosscourt",
    points,
    winners: points,
    errors_drawn: 0,
    points_pct: 1,
  });
  const total: AskRow = {
    section: "total",
    stroke: null,
    direction: null,
    points: 100,
    winners: 90,
    errors_drawn: 1,
    points_pct: null,
  };

  test("draws as many branches as the losing plays' tree", () => {
    const strokes = ["Forehand", "Backhand", "Volley", "Overhead"];
    const rows = [
      total,
      ...Array.from({ length: 12 }, (_, i) => play(strokes[i % 4], 20 - i)),
    ];
    const text =
      buildWinningPlaysAnswer(rows, losingPlaysVoice("mine", "Sam"), 1) ?? "";
    expect(
      text.split("\n").filter((line) => line.startsWith("ROW:")),
    ).toHaveLength(8);
  });

  test("serves alone open no film, so the answer promises none", () => {
    const text =
      buildWinningPlaysAnswer(
        [total, play("First Serve", 9), play("Second Serve", 3)],
        losingPlaysVoice("mine", "Sam"),
        1,
      ) ?? "";
    expect(text).not.toContain("opens the film");
  });

  test("a rally length the Video filter has a band for narrows the film too", async () => {
    const rows = [total, play("Forehand", 12)];
    const text =
      buildWinningPlaysAnswer(rows, losingPlaysVoice("mine", "Sam"), 1, {
        min: 1,
        max: 4,
      }) ?? "";
    expect(text).toContain("WATCH: plays | mine | won | short");
    const { result } = await rendered(text, rows);
    if (result.visual?.kind !== "tree") throw new Error("no tree");
    expect(parseMatchFilters(result.visual.branches[0].watch)).toMatchObject({
      customStroke: ["Forehand"],
      resultOutcome: ["won"],
      resultRallyLength: ["short"],
    });
  });

  test("over several matches, or with no linkable rally shot, the answer promises no film", () => {
    const voice = losingPlaysVoice("mine", "Sam");
    // The tree links only over one match.
    expect(
      buildWinningPlaysAnswer([total, play("Forehand", 12)], voice, 6),
    ).not.toContain("opens the film");
    // A middle is no direction the Video filter offers.
    const middle = { ...play("Forehand", 12), direction: "Middle" };
    expect(buildWinningPlaysAnswer([total, middle], voice, 1)).not.toContain(
      "opens the film",
    );
  });

  test("beside a branch with no link, the film is promised for the linked plays only", async () => {
    const middle = { ...play("Backhand", 9), direction: "Middle" };
    const rows = [total, play("Forehand", 12), middle];
    const text =
      buildWinningPlaysAnswer(rows, losingPlaysVoice("mine", "Sam"), 1) ?? "";
    expect(text).toContain("Each linked play below opens the film");
    const { result } = await rendered(text, rows);
    if (result.visual?.kind !== "tree") throw new Error("no tree");
    expect(result.visual.branches[0].watch).toBeDefined();
    expect(result.visual.branches[1].watch).toBeUndefined();
  });

  test("a rally length with no filter band draws no links rather than other rallies", () => {
    const text =
      buildWinningPlaysAnswer(
        [total, play("Forehand", 12)],
        losingPlaysVoice("mine", "Sam"),
        1,
        { min: 5, max: 9 },
      ) ?? "";
    expect(text).not.toContain("WATCH:");
    expect(text).not.toContain("opens the film");
  });

  test("the filter band holding exactly a rally length", () => {
    expect(rallyFilterBand({ min: 1, max: 4 })).toBe("short");
    expect(rallyFilterBand({ min: 0, max: 4 })).toBe("short");
    expect(rallyFilterBand({ min: 5, max: 8 })).toBe("medium");
    expect(rallyFilterBand({ min: 9, max: null })).toBe("long");
    // Ask's own medium and long bands, and any part of a band.
    expect(rallyFilterBand({ min: 5, max: 9 })).toBe(null);
    expect(rallyFilterBand({ min: 10, max: null })).toBe(null);
    expect(rallyFilterBand({ min: 1, max: 3 })).toBe(null);
    expect(rallyFilterBand({ min: 2, max: 4 })).toBe(null);
    expect(rallyFilterBand({ min: 1, max: 8 })).toBe(null);
  });
});

test.describe("a question about plays Ask cannot place", () => {
  test("is asked back, and every choice routes to its own answer", () => {
    expect(asksAboutPlays("What is this player's game plan?")).toBe(true);
    const [winning, losing, serve, ret] = ASK_PLAYS_CLARIFY_OPTIONS;
    const q = "What does he do well?";
    expect(asksForWinningPlays(`${q} (${winning})`)).toBe(true);
    expect(asksForLosingPlays(`${q} (${losing})`)).toBe(true);
    expect(plusOneBreakdownAsked(`${q} (${serve})`)).toBe("serve");
    expect(plusOneBreakdownAsked(`${q} (${ret})`)).toBe("return");
  });
});

test.describe("whose plays, in a team", () => {
  test("'his' and 'this player' are the program's player", () => {
    expect(losingPlaysSubject("Show his losing plays", [], true)).toBe("mine");
    expect(
      losingPlaysSubject("What are this player's weak shots?", [], true),
    ).toBe("mine");
  });
  test("the opponent, said or tagged alone, is the other side", () => {
    expect(losingPlaysSubject("his opponents' losing plays", [], true)).toBe(
      "opponent",
    );
    expect(
      losingPlaysSubject(
        "What is this players losing plays?",
        [OPPONENT_TAG],
        true,
      ),
    ).toBe("opponent");
  });
});

test("with both sides named, the side named first is whose plays", () => {
  expect(
    losingPlaysSubject("Which shots do I miss most against him?", [
      OPPONENT_TAG,
    ]),
  ).toBe("mine");
  expect(losingPlaysSubject("Where does he beat me?", [])).toBe("opponent");
});

test("a count of points won on a shot is not the winning-plays table", () => {
  expect(
    asksForWinningPlays("How many points did I win on my forehand shots?"),
  ).toBe(false);
  expect(asksForWinningPlays("which shots won him the most points")).toBe(true);
});

test.describe("winning plays in rallies of a length", () => {
  // "What are his best patterns of play for short rallies?" and "only
  // rallies that went up to 4 shots" were answered over every point.
  for (const [question, rally] of [
    [
      "What are his best patterns of play for short rallies?",
      { min: 1, max: 4 },
    ],
    ["best plays in rallies that went up to 4 shots", { min: 1, max: 4 }],
    ["Her winning shots in points under 5 shots", { min: 1, max: 4 }],
    ["my best plays within the first three shots", { min: 1, max: 3 }],
    ["What are my best plays in long rallies?", { min: 10, max: null }],
    ["best plays in rallies of 7 shots or more", { min: 7, max: null }],
    ["his strengths in medium rallies", { min: 5, max: 9 }],
    ["best plays in rallies of 5 to 9 shots", { min: 5, max: 9 }],
    ["my best plays in 1-4 shots", { min: 1, max: 4 }],
    ["best plays in rallies longer than 9 shots", { min: 10, max: null }],
    ["winning plays in points above 6 shots", { min: 7, max: null }],
  ] as const) {
    test(`reads: ${question}`, () => {
      expect(asksForWinningPlays(question)).toBe(true);
      expect(rallyLengthOf(question)).toEqual(rally);
    });
  }

  test('"longer than 9 shots" is ten or more', () => {
    // Feedback: the winning plays for "points ... longer than 9 shots" were
    // counted over every point of the match.
    expect(
      rallyLengthOf(
        "Give me all the points with a backhand rally and longer than 9 shots",
      ),
    ).toEqual({ min: 10, max: null });
  });

  test("a question naming no length reads none", () => {
    expect(rallyLengthOf("What is this player's best pattern of plays?")).toBe(
      null,
    );
  });

  test("the query keeps only those points, passes the guard and reads back", () => {
    const sql = winningPlaysSql("mine", { min: 1, max: 4 });
    expect(sql).toContain("and p.rally_length between 1 and 4");
    expect(
      checkAskSql({ scopeSql: "select match_id from ask.matches", sql }),
    ).toEqual({ ok: true });
    expect(isWinningPlaysSql(sql)).toBe(true);
    expect(rallyLengthOfPlaysSql(sql)).toEqual({ min: 1, max: 4 });

    const long = winningPlaysSql("opponent", { min: 10, max: null });
    expect(long).toContain("and p.rally_length >= 10");
    expect(isWinningPlaysSql(long)).toBe(true);
    expect(rallyLengthOfPlaysSql(long)).toEqual({ min: 10, max: null });

    // Unnarrowed, the query is the one it always was.
    expect(winningPlaysSql("mine", null)).toBe(winningPlaysSql("mine"));
    expect(winningPlaysSql("mine")).not.toContain("rally_length");
    expect(rallyLengthOfPlaysSql(winningPlaysSql("mine"))).toBe(null);
  });

  test("the answer says which rallies it counted", () => {
    const rows: AskRow[] = [
      {
        section: "total",
        stroke: null,
        direction: null,
        points: 40,
        winners: 30,
        errors_drawn: 2,
      },
      {
        section: "play",
        stroke: "Forehand",
        direction: "Crosscourt",
        points: 12,
        winners: 9,
        errors_drawn: 3,
      },
    ];
    const text =
      buildWinningPlaysAnswer(rows, losingPlaysVoice("mine", "Sam"), 2, {
        min: 1,
        max: 4,
      }) ?? "";
    expect(text.split("\n")[0]).toBe(
      "Sam's best play in rallies of up to four shots was the forehand crosscourt: it won {{r2.points}} points — {{r2.winners}} as their own winner and {{r2.errors_drawn}} by drawing an error.",
    );
    expect(text).toContain(
      "won {{r1.points}} points in rallies of up to four shots;",
    );
  });
});

test("which patterns to keep going to is the winning plays", () => {
  expect(asksForWinningPlays("So what patterns should I keep going")).toBe(
    true,
  );
  expect(asksForWinningPlays("which plays should she keep using?")).toBe(true);
  expect(asksForLosingPlays("So what patterns should I keep going")).toBe(
    false,
  );
  // Shots that keep missing are a complaint, not the plays to keep.
  expect(asksForWinningPlays("my backhand shots keep going out, why?")).toBe(
    false,
  );
  expect(asksForWinningPlays("which shots keep going into the net")).toBe(
    false,
  );
});
