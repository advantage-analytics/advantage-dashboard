import { expect, test } from "@playwright/test";

import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent } from "@/lib/services/ask/events";
import {
  type AskPattern,
  asksForPattern,
  buildPatternAnswer,
  describePattern,
  patternAnswerRows,
  patternNeedsPlayer,
  patternSql,
  readAskPattern,
  readPatternReply,
} from "@/lib/services/ask/pattern";
import {
  patternMatchFilters,
  patternVideoHref,
} from "@/lib/services/ask/pattern-video";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import { serializeMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * Offline spec for shot patterns. The model only reads the question into a
 * fixed form; the server builds the query and the answer. These pin that a
 * reading outside the lists is refused rather than repaired, that every
 * query the form can produce passes the SQL guard, and that the answer says
 * how the question was read with every figure from a cell.
 */

const NAMES = { mine: "Emon van Loben Sels", opponent: "Eli Stephenson" };

const SERVE_PLUS_ONE: AskPattern = {
  serve: { server: "mine", zones: ["Wide"], type: null },
  returnShot: null,
  plusOne: null,
  shots: [
    { player: "mine", strokes: [], directions: ["Down the Line"], within: 3 },
  ],
};

const FOREHAND_THEN_DTL: AskPattern = {
  serve: null,
  returnShot: null,
  plusOne: null,
  shots: [
    {
      player: "mine",
      strokes: ["Forehand"],
      directions: ["Crosscourt"],
      within: 7,
    },
    { player: "mine", strokes: [], directions: ["Down the Line"], within: 7 },
  ],
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

test.describe("which questions are patterns", () => {
  for (const question of [
    "serve wide and down the line plus 1",
    "How often do I win when I hit a forehand cross then down the line within 7 shots?",
    "return down the line then a volley",
    "What happens after my serve +1 to the T?",
    "forehand inside out",
  ]) {
    test(`yes: ${question}`, () => {
      expect(asksForPattern(question)).toBe(true);
    });
  }
  for (const question of [
    "How is my second serve percentage?",
    "What happened against Eli?",
    "How can I improve for my next match?",
  ]) {
    test(`no: ${question}`, () => {
      expect(asksForPattern(question)).toBe(false);
    });
  }
});

test.describe("reading the model's reply", () => {
  test("a pattern inside the lists is read", () => {
    const reading = readPatternReply(
      JSON.stringify({
        pattern: {
          serve: { server: "mine", zones: ["Wide"] },
          shots: [{ player: "mine", directions: ["Down the Line"], within: 3 }],
        },
      }),
    );
    expect(reading).toEqual({ kind: "pattern", pattern: SERVE_PLUS_ONE });
  });

  test("a value outside a list is refused, never repaired", () => {
    expect(readAskPattern({ shots: [{ strokes: ["Tweener"] }] })).toBeNull();
    expect(
      readAskPattern({ shots: [{ directions: ["crosscourt"] }] }),
    ).toBeNull();
    expect(readAskPattern({ shots: [{ within: 13 }] })).toBeNull();
    expect(readAskPattern({ shots: [{}, {}, { player: "mine" }] })).toBeNull();
  });

  test("a pattern that constrains nothing is no pattern", () => {
    expect(readAskPattern({ serve: {}, shots: [{}] })).toBeNull();
  });

  test("a clarifying question needs two to four choices", () => {
    expect(
      readPatternReply(
        '{"clarify": {"question": "Whose forehand?", "options": ["Emon", "Eli"]}}',
      ),
    ).toEqual({
      kind: "clarify",
      question: "Whose forehand?",
      options: ["Emon", "Eli"],
    });
    expect(
      readPatternReply(
        '{"clarify": {"question": "Whose?", "options": ["Emon"]}}',
      ),
    ).toEqual({ kind: "none" });
  });

  test("anything unreadable is none", () => {
    expect(readPatternReply("I think it's a serve +1")).toEqual({
      kind: "none",
    });
    expect(readPatternReply('{"none": true}')).toEqual({ kind: "none" });
  });
});

test.describe("the query", () => {
  const shapes: Record<string, AskPattern> = {
    "serve +1": SERVE_PLUS_ONE,
    "forehand then down the line": FOREHAND_THEN_DTL,
    "return only": {
      serve: { server: "opponent", zones: [], type: "second" },
      returnShot: { strokes: ["Backhand"], zones: ["Down the Line"] },
      plusOne: null,
      shots: [],
    },
    "every stroke kind": {
      serve: null,
      returnShot: null,
      plusOne: null,
      shots: [
        {
          player: null,
          strokes: ["Forehand", "Backhand", "Volley", "Overhead"],
          directions: ["Inside Out", "Inside In", "Middle"],
          within: null,
        },
      ],
    },
  };
  for (const [name, pattern] of Object.entries(shapes)) {
    test(`${name}: passes the SQL guard`, () => {
      expect(
        checkAskSql({
          scopeSql: "select match_id from ask.matches",
          sql: patternSql(pattern),
        }),
      ).toEqual({ ok: true });
    });
  }

  test("a later shot is later in the same point", () => {
    const sql = patternSql(FOREHAND_THEN_DTL);
    expect(sql).toContain("b.shot_number > a.shot_number");
    expect(sql).toContain("a.direction in ('Crosscourt')");
    expect(sql).toContain("b.direction in ('Down the Line')");
  });

  test("the serve and the return are picked by role, the shots view read once", () => {
    const sql = patternSql(SERVE_PLUS_ONE);
    expect(sql.match(/from ask\.shots/g)).toHaveLength(1);
    expect(sql).toContain("v.is_played_serve");
  });
});

test.describe("saying how it was read", () => {
  test("serve +1", () => {
    expect(describePattern(SERVE_PLUS_ONE, NAMES)).toBe(
      "Emon van Loben Sels hit a serve wide, then Emon van Loben Sels hit a shot down the line within the first three shots",
    );
  });

  test("two shots", () => {
    expect(describePattern(FOREHAND_THEN_DTL, NAMES)).toBe(
      "Emon van Loben Sels hit a forehand crosscourt within the first seven shots, then later in the point Emon van Loben Sels hit a shot down the line within the first seven shots",
    );
  });

  test("never with a digit the renderer would drop", () => {
    expect(describePattern(FOREHAND_THEN_DTL, NAMES)).not.toMatch(/\d/);
  });
});

test.describe("the answer", () => {
  const perMatch: AskRow[] = [
    { match_id: "m1", points: 4, won: 3, won_pct: 75 },
    { match_id: "m2", points: 2, won: 1, won_pct: 50 },
    { match_id: "m3", points: 0, won: 0, won_pct: null },
  ];
  const labels = new Map([
    ["m1", "vs Eli Stephenson"],
    ["m2", "vs Rudy Quan"],
  ]);

  test("totals the matches and renders with every figure from a cell", async () => {
    const rows = patternAnswerRows(perMatch, 3);
    expect(rows?.[0]).toMatchObject({ points: 6, won: 4, won_pct: 66.7 });
    const text = buildPatternAnswer(rows ?? [], SERVE_PLUS_ONE, NAMES, labels);
    const { events, result } = await rendered(text, rows ?? []);
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(result.droppedDigits).toEqual([]);
    expect(result.headline).toBe(
      "That pattern came up on 6 points, and Emon van Loben Sels won 4 of them (66.7%).",
    );
    expect(result.text).toContain("Read as: points where Emon van Loben Sels");
    expect(result.text).toContain("small sample");
    if (result.visual?.kind !== "table") throw new Error("no table");
    expect(result.visual.rows.map((row) => row.label)).toEqual([
      "vs Eli Stephenson",
      "vs Rudy Quan",
    ]);
  });

  test("a pattern that never came up says so", async () => {
    const rows = patternAnswerRows(
      [{ match_id: "m1", points: 0, won: 0, won_pct: null }],
      1,
    );
    const text = buildPatternAnswer(rows ?? [], SERVE_PLUS_ONE, NAMES, labels);
    const { result } = await rendered(text, rows ?? []);
    expect(result.headline).toBe(
      "That pattern did not come up in the 1 matches with shot data.",
    );
  });

  test("no match with shots is no answer: the caller says there is no shot data", () => {
    expect(patternAnswerRows([], 2)).toBeNull();
  });
});

test.describe("the server's own clarifying question", () => {
  test("a team pattern in 'my' words over several players asks which", () => {
    expect(
      patternNeedsPlayer({
        team: true,
        question: "how often do I win serve +1 to the T",
        rosterInScope: ["Emon van Loben Sels", "Rudy Quan"],
        playerTagged: false,
      }),
    ).toEqual({
      question: "Which player's matches should this count?",
      options: ["Emon van Loben Sels", "Rudy Quan"],
    });
  });
  test("a named or tagged player, or one player in scope, asks nothing", () => {
    const base = {
      team: true,
      question: "how often do I win serve +1",
      rosterInScope: ["Emon van Loben Sels", "Rudy Quan"],
      playerTagged: false,
    };
    expect(patternNeedsPlayer({ ...base, playerTagged: true })).toBeNull();
    expect(
      patternNeedsPlayer({ ...base, question: "Rudy Quan serve +1" }),
    ).toBeNull();
    expect(
      patternNeedsPlayer({ ...base, rosterInScope: ["Rudy Quan"] }),
    ).toBeNull();
    expect(patternNeedsPlayer({ ...base, team: false })).toBeNull();
  });
});

test.describe("the Video link", () => {
  test("the pattern becomes the Video filter, field for field", () => {
    const filters = patternMatchFilters(FOREHAND_THEN_DTL);
    expect(filters).toMatchObject({
      customPlayer: "you",
      customStroke: ["Forehand"],
      customDirection: ["Crosscourt"],
      customRallyShot: [1, 2, 3, 4, 5, 6, 7],
      thenPlayer: "you",
      thenDirection: ["Down the Line"],
      thenRallyShot: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(patternMatchFilters(SERVE_PLUS_ONE)).toMatchObject({
      server: "you",
      serveZone: ["Wide"],
      customPlayer: "you",
    });
  });

  test("opens the match's Video view with the filters in the address", () => {
    const href = patternVideoHref("m1", SERVE_PLUS_ONE);
    expect(href?.startsWith("/dashboard/matches/m1?")).toBe(true);
    const query = new URLSearchParams(href?.split("?")[1]);
    expect(query.get("tab")).toBe("film");
    const filters = patternMatchFilters(SERVE_PLUS_ONE);
    expect(query.get("f")).toBe(filters ? serializeMatchFilters(filters) : "");
  });

  test("a direction the Video filter cannot select gets no link", () => {
    const middle: AskPattern = {
      serve: null,
      returnShot: null,
      plusOne: null,
      shots: [
        { player: "mine", strokes: [], directions: ["Middle"], within: null },
      ],
    };
    expect(patternVideoHref("m1", middle)).toBeNull();
  });
});

test.describe("the reading's own rules", () => {
  test("a later shot with no player is the same player's", () => {
    const read = readAskPattern({
      shots: [
        { player: "mine", strokes: ["Forehand"], directions: ["Crosscourt"] },
        {
          strokes: ["Forehand", "Backhand", "Volley", "Overhead"],
          directions: ["Down the Line"],
          within: 7,
        },
      ],
    });
    expect(read?.shots[1]).toEqual({
      player: "mine",
      strokes: [],
      directions: ["Down the Line"],
      within: 7,
    });
  });
});

test.describe("the +1, exactly", () => {
  const RETURN_PLUS_ONE: AskPattern = {
    serve: { server: "opponent", zones: [], type: null },
    returnShot: { strokes: [], zones: ["Middle"] },
    plusOne: { after: "return", strokes: [], directions: ["Crosscourt"] },
    shots: [],
  };

  test("is read from plus_one, and every stroke listed is no stroke", () => {
    expect(
      readAskPattern({
        serve: { server: "opponent" },
        return: { zones: ["Middle"] },
        plus_one: {
          after: "return",
          strokes: ["Forehand", "Backhand", "Volley", "Overhead"],
          directions: ["Crosscourt"],
        },
      }),
    ).toEqual(RETURN_PLUS_ONE);
    expect(readAskPattern({ plus_one: { after: "rally" } })).toBeNull();
  });

  test("is the returner's shot four, hit by the returner", () => {
    const sql = patternSql(RETURN_PLUS_ONE);
    expect(sql).toContain("q.is_return_plus_one");
    expect(sql).toContain("q.mine = true");
    expect(sql).toContain("q.direction in ('Crosscourt')");
    expect(sql).toContain("numbered.shot_number = 4 as is_return_plus_one");
    expect(
      checkAskSql({ scopeSql: "select match_id from ask.matches", sql }),
    ).toEqual({ ok: true });
  });

  test("is said as the returner's next ball", () => {
    expect(describePattern(RETURN_PLUS_ONE, NAMES)).toBe(
      "Eli Stephenson hit a serve, then Emon van Loben Sels hit a return through the middle, then Emon van Loben Sels's next ball (the returner's plus one) was a shot crosscourt",
    );
  });

  test("opens the Video view on Hit 4 by the returner", () => {
    expect(patternMatchFilters(RETURN_PLUS_ONE)).toMatchObject({
      server: "opponent",
      returnZone: ["Middle"],
      customPlayer: "you",
      customDirection: ["Crosscourt"],
      customRallyShot: [4],
    });
    expect(
      patternMatchFilters({
        ...RETURN_PLUS_ONE,
        serve: { server: "mine", zones: ["T"], type: null },
        returnShot: null,
        plusOne: { after: "serve", strokes: ["Forehand"], directions: [] },
      }),
    ).toMatchObject({
      customPlayer: "you",
      customStroke: ["Forehand"],
      customRallyShot: [3],
    });
  });
});
