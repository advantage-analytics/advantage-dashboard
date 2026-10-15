import { expect, test } from "@playwright/test";

import {
  askQuestion,
  type AskDatabase,
  type AskModel,
  type AskQuestionInput,
  type AskRpcResult,
} from "@/lib/services/ask/ask";
import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent, AskEvent } from "@/lib/services/ask/events";
import { losingPlaysVoice } from "@/lib/services/ask/plays";
import { PERSONAL_ASK_SCOPE } from "@/lib/services/ask/scope";
import {
  asksForServePlusOne,
  buildServePlusOneAnswer,
  namesASide,
  plusOneBreakdownAsked,
  plusOneSides,
  plusOneWithSides,
  continuesServePlusOne,
  servePlusOneRequest,
  servePlusOneRequestOfSql,
  servePlusOneSql,
} from "@/lib/services/ask/serve-plus-one";
import { checkAskSql } from "@/lib/services/ask/sql-guard";
import type { AskResolvedTags } from "@/lib/services/ask/tags";

/**
 * Offline spec for the serve +1 breakdown, built from a real 2026-10-14
 * team conversation about Rudy Quan that went wrong four times over: the
 * model counted the return as the server's +1, mixed both players' serves,
 * a follow-up lost the player and the subject, and "his serve +1 patterns,
 * winning and losing" came back as his opponents' misses.
 */

const OPPONENT_TAG = {
  kind: "opponent",
  opponentName: "Eli Stephenson",
} as unknown as AskResolvedTags["prompt"][number];

// The questions as they were asked.
const ASKED = [
  "What ate Rudy's winning plays? for serve plus 1 pattern plays",
  "No for Rudy versus all his opponents. I want to see in detail serve plus 1 and specifically what stroke and the placement in a table",
  "No I want to see his serve plus 1's all patterns and what those winning and losing looks like?",
];
const FOLLOW_UP = "Can I see a table of all the plays compared?";

test.describe("which questions are the breakdown", () => {
  for (const question of [
    ...ASKED,
    "What are my serve +1 patterns?",
    "show me the serve and +1 breakdown",
  ]) {
    test(`yes: ${question}`, () => {
      expect(asksForServePlusOne(question)).toBe(true);
    });
  }
  for (const question of [
    // One named pattern is the pattern form's.
    "serve wide and down the line plus 1",
    "How often do I win serve +1 with a forehand inside out?",
    "How is my second serve percentage?",
    FOLLOW_UP,
  ]) {
    test(`no: ${question}`, () => {
      expect(asksForServePlusOne(question)).toBe(false);
    });
  }

  test("a follow-up asking for more of it carries on", () => {
    expect(continuesServePlusOne(FOLLOW_UP)).toBe(true);
    expect(continuesServePlusOne("what about forehands down the line?")).toBe(
      false,
    );
  });
});

test.describe("the return +1", () => {
  test("is its own breakdown, the returner's", () => {
    expect(plusOneBreakdownAsked("What are Rudy's return +1 patterns?")).toBe(
      "return",
    );
    expect(plusOneBreakdownAsked("show me his return plus one")).toBe("return");
    expect(
      servePlusOneRequest("What are Rudy's return +1 patterns?", [], true),
    ).toEqual({ phase: "return", subject: "mine", serveType: null });
    expect(
      servePlusOneRequest("their opponents' return +1 patterns", [], true)
        .subject,
    ).toBe("opponent");
  });
  test("one named return +1 is the pattern form's, not the breakdown", () => {
    expect(
      plusOneBreakdownAsked(
        "When Rudy returns down the middle and his plus 1 is crosscourt, how often does he win?",
      ),
    ).toBeNull();
  });
});

test.describe("whose serve", () => {
  test("in a team, 'his serve' is the program's player's", () => {
    for (const question of ASKED) {
      expect(servePlusOneRequest(question, [], true).subject).toBe("mine");
    }
  });
  test("the opponent's serve, said so, is the opponent's", () => {
    expect(
      servePlusOneRequest("their opponents' serve +1 patterns", [], true),
    ).toEqual({ phase: "serve", subject: "opponent", serveType: null });
  });
  test("on the personal page 'his serve' with an opponent tagged is that opponent's", () => {
    expect(
      servePlusOneRequest("his serve +1 patterns", [OPPONENT_TAG], false)
        .subject,
    ).toBe("opponent");
    expect(
      servePlusOneRequest("my first serve plus one", [OPPONENT_TAG], false),
    ).toEqual({ phase: "serve", subject: "mine", serveType: "first" });
  });
});

test.describe("the query", () => {
  for (const phase of ["serve", "return"] as const) {
    for (const subject of ["mine", "opponent"] as const) {
      for (const serveType of [null, "first", "second"] as const) {
        test(`${phase} ${subject} ${serveType ?? "both"}: passes the guard and reads back`, () => {
          const sql = servePlusOneSql({ phase, subject, serveType });
          expect(
            checkAskSql({ scopeSql: "select match_id from ask.matches", sql }),
          ).toEqual({ ok: true });
          expect(servePlusOneRequestOfSql(sql)).toEqual({
            phase,
            subject,
            serveType,
          });
        });
      }
    }
  }

  test("the +1 is the Video filter's: the server's shot 3, the returner's shot 4", () => {
    const serve = servePlusOneSql({
      phase: "serve",
      subject: "mine",
      serveType: null,
    });
    expect(serve).toContain("v.is_played_serve and v.mine = true");
    expect(serve).toContain("q.is_serve_plus_one and q.mine = true");
    const ret = servePlusOneSql({
      phase: "return",
      subject: "mine",
      serveType: "second",
    });
    expect(ret).toContain("r.is_return and r.mine = true");
    expect(ret).toContain("q.is_return_plus_one and q.mine = true");
    expect(ret).toContain("v.shot_type = 'Second Serve'");
    // The opponent's: their shots, and their points won.
    const theirs = servePlusOneSql({
      phase: "serve",
      subject: "opponent",
      serveType: null,
    });
    expect(theirs).toContain("v.mine = false");
    expect(theirs).toContain("(not pt.i_won) as won");
  });
});

// `servePlusOneSql({ subject: "mine" })` on Rudy Quan's six matches, live,
// 2026-10-14 (through ask_run_team_query, as the route runs it).
const RUDY: AskRow[] = [
  {
    section: "total",
    zone: null,
    stroke: null,
    direction: null,
    points: 244,
    won: 135,
    won_pct: 55.3,
  },
  {
    section: "opening",
    zone: null,
    stroke: null,
    direction: null,
    points: 326,
    won: 6,
    won_pct: null,
  },
  {
    section: "pattern",
    zone: "T",
    stroke: "Backhand",
    direction: "Crosscourt",
    points: 29,
    won: 14,
    won_pct: 48.3,
  },
  {
    section: "pattern",
    zone: "T",
    stroke: "Forehand",
    direction: "Inside Out",
    points: 20,
    won: 14,
    won_pct: 70,
  },
  {
    section: "pattern",
    zone: "T",
    stroke: "Backhand",
    direction: "Down the Line",
    points: 15,
    won: 8,
    won_pct: 53.3,
  },
  {
    section: "pattern",
    zone: "T",
    stroke: "Forehand",
    direction: "Down the Line",
    points: 15,
    won: 7,
    won_pct: 46.7,
  },
  {
    section: "pattern",
    zone: "Wide",
    stroke: "Forehand",
    direction: "Down the Line",
    points: 14,
    won: 6,
    won_pct: 42.9,
  },
  {
    section: "pattern",
    zone: "Body",
    stroke: "Backhand",
    direction: "Crosscourt",
    points: 13,
    won: 4,
    won_pct: 30.8,
  },
  {
    section: "pattern",
    zone: "Wide",
    stroke: "Forehand",
    direction: "Inside In",
    points: 12,
    won: 8,
    won_pct: 66.7,
  },
  {
    section: "pattern",
    zone: "Body",
    stroke: "Forehand",
    direction: "Crosscourt",
    points: 12,
    won: 7,
    won_pct: 58.3,
  },
];

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

test.describe("the answer", () => {
  const voice = losingPlaysVoice("mine", "Rudy Quan");
  const request = { phase: "serve", subject: "mine", serveType: null } as const;

  test("every pattern in a table, winning and losing named, every figure a cell", async () => {
    const text = buildServePlusOneAnswer(RUDY, voice, request) ?? "";
    const { events, result } = await rendered(text, RUDY);
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(result.droppedDigits).toEqual([]);
    expect(result.headline).toBe(
      "Rudy Quan's most-played serve plus one was a serve to the T then a backhand crosscourt: 29 points, 48.3% of them won.",
    );
    if (result.visual?.kind !== "table") throw new Error("no table");
    expect(result.visual.columns).toEqual(["Points", "Won", "Won %"]);
    expect(result.visual.rows).toHaveLength(8);
    expect(result.visual.rows[1]).toEqual({
      label: "T serve → forehand inside out",
      cells: ["20", "14", "70%"],
    });
    expect(result.text).toContain(
      "Across 244 serve-plus-one points, Rudy Quan won 135 (55.3%).",
    );
    expect(result.text).toContain(
      "The pattern that won most often was a serve to the T then a forehand inside out (won 14 of 20, 70%); the one that lost most often was a serve into the body then a backhand crosscourt (won 4 of 13, 30.8%).",
    );
    expect(result.text).toContain("Rudy Quan served 326 points in all");
  });

  test("no serve +1 recorded is no answer: the caller says there is no shot data", () => {
    expect(
      buildServePlusOneAnswer(
        [{ ...RUDY[0], points: 0 }, RUDY[1]],
        voice,
        request,
      ),
    ).toBeNull();
  });
});

// ── Routing, end to end ─────────────────────────────────────────────────────

const MATCH = "3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f";
const RUDY_SCOPE =
  "select match_id from ask.matches where player_name ilike '%rudy%'";
const TEAM = {
  kind: "team",
  programId: "eeeeeeee-0000-4000-8000-000000000005",
  programName: "Westbrook College",
} as const;

function fakeDb() {
  const runs: Record<string, unknown>[] = [];
  const db: AskDatabase = {
    rpc: async (fn, args): Promise<AskRpcResult> => {
      switch (fn) {
        case "ask_run_query":
        case "ask_run_team_query":
          runs.push(args ?? {});
          return {
            data: {
              matches: [
                {
                  match_id: MATCH,
                  played_on: "2026-09-26",
                  opponent_name: "Nikita Volonski",
                  player_name: "Rudy Quan",
                  i_won: true,
                  score_text: "7-5, 6-3",
                },
              ],
              rows: RUDY,
            },
            error: null,
          };
        case "ask_save_exchange":
          return { data: "bbbbbbbb-0000-4000-8000-000000000002", error: null };
        case "ask_last_answer_id":
          return { data: "00000000-0000-4000-8000-0000000000a1", error: null };
        case "ask_quota":
          return {
            data: { used: 1, cap: 20, resets_on: "2026-11-01" },
            error: null,
          };
        default:
          return { data: true, error: null };
      }
    },
  };
  return { db, runs };
}

function fakeModel(replies: string[]) {
  let calls = 0;
  const model: AskModel = {
    configured: true,
    stream: async () => {
      calls += 1;
      const reply = replies.shift() ?? "";
      return (async function* chunks() {
        yield reply;
      })();
    },
  };
  return { model, calls: () => calls };
}

function input(over: Partial<AskQuestionInput>): AskQuestionInput {
  return {
    now: () => new Date("2026-10-14T21:00:00Z"),
    question: ASKED[2],
    tags: { prompt: [], saved: [], matchIds: [] },
    conversation: [],
    conversationId: null,
    reservation: {
      usageId: "aaaaaaaa-0000-4000-8000-000000000001",
      used: 0,
      cap: 20,
      resetsOn: "2026-11-01",
    },
    scope: TEAM,
    ...over,
  } as AskQuestionInput;
}

async function collect(events: AsyncIterable<AskEvent>): Promise<AskEvent[]> {
  const out: AskEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

test.describe("routing", () => {
  test("the question that came back as his opponents' misses is his serve +1 breakdown", async () => {
    const { db, runs } = fakeDb();
    // The planner picks the scope (and here, wrongly, some SQL of its own).
    const { model, calls } = fakeModel([
      JSON.stringify({
        scope_sql: RUDY_SCOPE,
        sql: "select 1 as x",
        asks_for_advice: false,
      }),
    ]);
    const events = await collect(
      askQuestion(
        input({
          db,
          model,
          // As asked: the turn before named Rudy, this one says "his".
          conversation: [
            { role: "user", content: ASKED[1] },
            { role: "assistant", content: "Rudy uses a forehand …" },
          ],
        }),
      ),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      scope_sql: RUDY_SCOPE,
      sql: servePlusOneSql({
        phase: "serve",
        subject: "mine",
        serveType: null,
      }),
    });
    // The server writes the answer: the model was asked for the plan only.
    expect(calls()).toBe(1);
    const headline = events.find((event) => event.type === "headline");
    expect(headline).toMatchObject({
      text: expect.stringContaining("Rudy Quan's most-played serve plus one"),
    });
    expect(events.at(-1)?.type).toBe("done");
  });

  test("a follow-up asking for the table keeps the breakdown and Rudy", async () => {
    const { db, runs } = fakeDb();
    // The planner lost the player: every match in the program.
    const { model } = fakeModel([
      JSON.stringify({
        scope_sql: "select match_id from ask.matches",
        sql: "select 1 as x",
        asks_for_advice: false,
      }),
    ]);
    await collect(
      askQuestion(
        input({
          db,
          model,
          question: FOLLOW_UP,
          conversation: [
            { role: "user", content: ASKED[0] },
            {
              role: "assistant",
              content: "Rudy Quan's most-played serve +1 …",
            },
          ],
          previousPlan: {
            scope_sql: RUDY_SCOPE,
            sql: servePlusOneSql({
              phase: "serve",
              subject: "mine",
              serveType: null,
            }),
          },
        }),
      ),
    );
    expect(runs[0]).toMatchObject({
      scope_sql: RUDY_SCOPE,
      sql: servePlusOneSql({
        phase: "serve",
        subject: "mine",
        serveType: null,
      }),
    });
  });

  test("on the personal page it is the viewer's serve", async () => {
    const { db, runs } = fakeDb();
    const { model } = fakeModel([
      JSON.stringify({
        scope_sql: "select match_id from ask.matches",
        sql: "select 1 as x",
        asks_for_advice: false,
      }),
    ]);
    await collect(
      askQuestion(
        input({
          db,
          model,
          scope: PERSONAL_ASK_SCOPE,
          question: "What are my serve +1 patterns?",
        }),
      ),
    );
    expect(runs[0]).toMatchObject({
      sql: servePlusOneSql({
        phase: "serve",
        subject: "mine",
        serveType: null,
      }),
    });
  });
});

test.describe("by side", () => {
  test("a question names a split, one side, or neither", () => {
    expect(plusOneSides("his serve +1 patterns divided up by sides")).toEqual({
      bySide: true,
    });
    expect(plusOneSides("serve +1 on deuce and ad")).toEqual({ bySide: true });
    expect(plusOneSides("return +1 on the ad side")).toEqual({ court: "Ad" });
    expect(plusOneSides("serve +1 from the deuce court")).toEqual({
      court: "Deuce",
    });
    expect(plusOneSides("serve +1 patterns")).toEqual({});
  });

  test("a split groups by court too; one side filters to it", () => {
    const split = servePlusOneSql({
      phase: "serve",
      subject: "mine",
      serveType: null,
      bySide: true,
    });
    expect(split).toContain("group by court, zone, stroke, direction");
    expect(split).toContain("select o.court, o.zone");
    const ad = servePlusOneSql({
      phase: "return",
      subject: "mine",
      serveType: null,
      court: "Ad",
    });
    expect(ad).toContain("and pc.court = 'Ad'");
    for (const sql of [split, ad]) {
      expect(
        checkAskSql({ scopeSql: "select match_id from ask.matches", sql }),
      ).toEqual({ ok: true });
    }
    expect(servePlusOneRequestOfSql(ad)).toEqual({
      phase: "return",
      subject: "mine",
      serveType: null,
      court: "Ad",
    });
  });

  test("a follow-up's split replaces one side, and one side replaces a split", () => {
    const deuce = {
      phase: "serve",
      subject: "mine",
      serveType: null,
      court: "Deuce",
    } as const;
    expect(plusOneWithSides(deuce, { bySide: true })).toEqual({
      phase: "serve",
      subject: "mine",
      serveType: null,
      bySide: true,
    });
    expect(
      plusOneWithSides(
        { ...deuce, court: undefined, bySide: true },
        { court: "Ad" },
      ),
    ).toMatchObject({ court: "Ad" });
    expect(plusOneWithSides(deuce, {})).toBe(deuce);
  });

  test("each row says its side", async () => {
    const rows: AskRow[] = [
      {
        section: "total",
        court: null,
        zone: null,
        stroke: null,
        direction: null,
        points: 30,
        won: 16,
        won_pct: 53.3,
      },
      {
        section: "opening",
        court: null,
        zone: null,
        stroke: null,
        direction: null,
        points: 40,
        won: 2,
        won_pct: null,
      },
      {
        section: "pattern",
        court: "Ad",
        zone: "Wide",
        stroke: "Forehand",
        direction: "Inside Out",
        points: 9,
        won: 6,
        won_pct: 66.7,
      },
      {
        section: "pattern",
        court: "Deuce",
        zone: "T",
        stroke: "Backhand",
        direction: "Crosscourt",
        points: 8,
        won: 3,
        won_pct: 37.5,
      },
    ];
    const text =
      buildServePlusOneAnswer(rows, losingPlaysVoice("mine", "Rudy Quan"), {
        phase: "serve",
        subject: "mine",
        serveType: null,
        bySide: true,
      }) ?? "";
    const { result } = await rendered(text, rows);
    expect(result.droppedDigits).toEqual([]);
    if (result.visual?.kind !== "table") throw new Error("no table");
    expect(result.visual.caption).toContain("deuce and ad sides apart");
    expect(result.visual.rows.map((row) => row.label)).toEqual([
      "Ad · Wide serve → forehand inside out",
      "Deuce · T serve → backhand crosscourt",
    ]);
    expect(result.headline).toContain("on the ad side, a serve out wide");
  });
});

test("a follow-up with a question of its own is not the breakdown again", () => {
  expect(continuesServePlusOne("Which matches did he lose?")).toBe(false);
  expect(continuesServePlusOne("What was his record in all of them?")).toBe(
    false,
  );
  expect(continuesServePlusOne(FOLLOW_UP)).toBe(true);
});

test("on the personal page 'his serve +1' is the opponent's, tagged or not", () => {
  expect(servePlusOneRequest("his serve +1 patterns", [], false).subject).toBe(
    "opponent",
  );
});

test.describe("whose +1, with the other side named too", () => {
  test("'my +1 against their serve' is mine", () => {
    expect(
      servePlusOneRequest(
        "What is my return plus one against their first serve?",
        [],
        false,
      ),
    ).toMatchObject({ phase: "return", subject: "mine", serveType: "first" });
    expect(
      servePlusOneRequest(
        "How does my serve +1 do against their return?",
        [],
        true,
      ).subject,
    ).toBe("mine");
  });
  test("a bare 'opponents' is who was played, not whose +1", () => {
    expect(servePlusOneRequest(ASKED[1], [], true).subject).toBe("mine");
  });
  test("a named side sends a plays question to the planner", () => {
    expect(namesASide("what are my best shots on the ad side")).toBe(true);
    expect(namesASide("what are my best shots")).toBe(false);
  });
});
