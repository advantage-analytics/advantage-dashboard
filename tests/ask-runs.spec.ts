import { expect, test } from "@playwright/test";

import type {
  AskDatabase,
  AskModel,
  AskQuestionInput,
  AskRpcResult,
} from "@/lib/services/ask/ask";
import { ASK_REVIEW_SQL } from "@/lib/services/ask/review";
import { compareSql } from "@/lib/services/ask/compare";
import type { AskEvent } from "@/lib/services/ask/events";
import { losingPlaysSql } from "@/lib/services/ask/plays";
import {
  askRunProperties,
  askRunRoute,
  askRunRow,
  recordAskRun,
  type AskRunRecord,
} from "@/lib/services/ask/runs";
import { PERSONAL_ASK_SCOPE } from "@/lib/services/ask/scope";
import { servePlusOneSql } from "@/lib/services/ask/serve-plus-one";

/**
 * `recordAskRun()` — every question leaves one record, however it ended.
 * Offline: the database and the model are fakes; mock mode (no model
 * configured) drives the real `askQuestion()` through its fixed plan.
 */

const MATCH = "aaaaaaaa-0000-4000-8000-000000000001";
const CONVERSATION = "bbbbbbbb-0000-4000-8000-000000000002";
const ANSWER = "cccccccc-0000-4000-8000-000000000003";

function fakeDb(script: { query?: AskRpcResult } = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const db: AskDatabase = {
    rpc: async (fn, args): Promise<AskRpcResult> => {
      calls.push({ fn, args });
      switch (fn) {
        case "ask_run_query":
          return (
            script.query ?? {
              data: {
                matches: [
                  {
                    match_id: MATCH,
                    played_on: "2026-09-14",
                    opponent_name: "Anna Lee",
                    i_won: true,
                    score_text: "6-4, 6-3",
                    player_name: null,
                  },
                ],
                rows: [
                  {
                    matches_won: 1,
                    matches_lost: 0,
                    second_serve_won_pct: 41.2,
                  },
                ],
              },
              error: null,
            }
          );
        case "ask_save_exchange_ids":
          return {
            data: { conversation_id: CONVERSATION, answer_id: ANSWER },
            error: null,
          };
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
  return { db, calls };
}

const unconfigured: AskModel = {
  configured: false,
  stream: async () => {
    throw new Error("mock mode never calls the model");
  },
};

function input(db: AskDatabase, model: AskModel): AskQuestionInput {
  return {
    db,
    model,
    now: () => new Date("2026-10-15T12:00:00Z"),
    question: "How is my second serve?",
    tags: {
      prompt: [],
      saved: [],
      matchIds: [],
    } as unknown as AskQuestionInput["tags"],
    conversation: [],
    previousPlan: null,
    conversationId: null,
    reservation: null,
    scope: PERSONAL_ASK_SCOPE,
  };
}

async function collect(
  events: AsyncGenerator<AskEvent, void, undefined>,
): Promise<AskEvent[]> {
  const seen: AskEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

test.describe("recordAskRun", () => {
  test("a completed mock-mode question: outcome done, route mock, one query, no model call, timings set", async () => {
    const { db, calls } = fakeDb();
    const runs: AskRunRecord[] = [];
    let tick = 1_000;
    const events = await collect(
      recordAskRun(input(db, unconfigured), {
        onRun: (run) => {
          runs.push(run);
        },
        preStreamMs: 120,
        now: () => (tick += 10),
      }),
    );

    expect(events.at(-1)?.type).toBe("done");
    expect(runs).toHaveLength(1);
    const run = runs[0];
    expect(run.outcome).toBe("done");
    expect(run.route).toBe("mock");
    expect(run.mock).toBe(true);
    expect(run.modelCalls).toBe(0);
    expect(run.planAttempts).toBe(0);
    expect(run.queryCount).toBe(1);
    expect(run.rowCount).toBe(1);
    expect(run.matchCount).toBe(1);
    expect(run.conversationId).toBe(CONVERSATION);
    expect(run.preStreamMs).toBe(120);
    expect(run.planMs).toBeGreaterThan(0);
    expect(run.queryMs).toBeGreaterThan(0);
    expect(run.answerMs).toBeGreaterThan(0);
    expect(run.toHeadlineMs).toBeGreaterThan(0);
    expect(run.totalMs).toBeGreaterThanOrEqual(run.toHeadlineMs ?? 0);
    expect(run.question).toBe("How is my second serve?");
    // The wrapper changes nothing the generator does.
    expect(calls.map((call) => call.fn)).toEqual([
      "ask_run_query",
      "ask_save_exchange_ids",
      "ask_quota",
    ]);
  });

  test("a reader that stops early records an abandoned run, once", async () => {
    const { db } = fakeDb();
    const runs: AskRunRecord[] = [];
    const events = recordAskRun(input(db, unconfigured), {
      onRun: (run) => {
        runs.push(run);
      },
    });
    for await (const event of events) {
      if (event.type === "headline") break;
    }
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("abandoned");
    expect(runs[0].toHeadlineMs).not.toBeNull();
  });

  test("a failed query records the error outcome and the query count", async () => {
    const { db } = fakeDb({
      query: { data: null, error: { code: "42601", message: "syntax error" } },
    });
    const runs: AskRunRecord[] = [];
    const error = console.error;
    console.error = () => {};
    let events: AskEvent[];
    try {
      events = await collect(
        recordAskRun(input(db, unconfigured), {
          onRun: (run) => {
            runs.push(run);
          },
        }),
      );
    } finally {
      console.error = error;
    }
    expect(events.at(-1)?.type).toBe("error");
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe((events.at(-1) as { code: string }).code);
    expect(runs[0].queryCount).toBeGreaterThanOrEqual(1);
    expect(runs[0].rowCount).toBeNull();
  });

  test("a recorder that throws is logged, and the stream is unharmed", async () => {
    const { db } = fakeDb();
    const errors: unknown[] = [];
    const error = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };
    let events: AskEvent[];
    try {
      events = await collect(
        recordAskRun(input(db, unconfigured), {
          onRun: () => {
            throw new Error("database away");
          },
        }),
      );
    } finally {
      console.error = error;
    }
    expect(events.at(-1)?.type).toBe("done");
    expect(errors).toContain("[ask] could not record the run");
  });
});

test.describe("askRunRoute", () => {
  const base = {
    configured: true,
    team: false,
    patternRead: false,
    answerWritten: true,
  };
  test("names the server's fixed queries, the model's own, and mock mode", () => {
    expect(askRunRoute({ ...base, configured: false, sql: null })).toBe("mock");
    expect(askRunRoute({ ...base, sql: null })).toBeNull();
    expect(askRunRoute({ ...base, sql: ASK_REVIEW_SQL })).toBe("review");
    expect(askRunRoute({ ...base, sql: compareSql("opponent", false) })).toBe(
      "compare",
    );
    expect(
      askRunRoute({ ...base, team: true, sql: compareSql("players", true) }),
    ).toBe("compare");
    expect(askRunRoute({ ...base, sql: losingPlaysSql("mine") })).toBe("plays");
    expect(
      askRunRoute({
        ...base,
        sql: servePlusOneSql({
          phase: "serve",
          subject: "mine",
          serveType: null,
        }),
      }),
    ).toBe("serve_plus_one");
    expect(
      askRunRoute({ ...base, patternRead: true, sql: "select 1 as n" }),
    ).toBe("pattern");
    expect(askRunRoute({ ...base, sql: "select 1 as n" })).toBe("model");
    expect(
      askRunRoute({ ...base, answerWritten: false, sql: "select 1 as n" }),
    ).toBe("server_written");
  });
});

test.describe("the record's two shapes", () => {
  const run: AskRunRecord = {
    question: "Why do I lose to Dvorsky?",
    programId: null,
    conversationId: CONVERSATION,
    outcome: "done",
    route: "compare",
    planAttempts: 1,
    modelCalls: 1,
    queryCount: 1,
    preStreamMs: 90,
    planMs: 1200,
    queryMs: 80,
    answerMs: 400,
    toHeadlineMs: 1700,
    totalMs: 2100,
    visualKind: "table",
    rowCount: 1,
    matchCount: 3,
    asksForAdvice: true,
    planModel: null,
    answerModel: "gemini-3.5-flash-lite",
    mock: false,
  };

  test("the database row carries the question; the PostHog event only its length", () => {
    const row = askRunRow(run);
    expect(row.question).toBe(run.question);
    expect(row.outcome).toBe("done");
    expect(row.to_headline_ms).toBe(1700);
    expect(row.asks_for_advice).toBe(true);

    const properties = askRunProperties(run, PERSONAL_ASK_SCOPE);
    expect(properties).not.toHaveProperty("question");
    expect(properties.question_length).toBe(run.question.length);
    expect(properties.scope).toBe("personal");
    expect(properties.route).toBe("compare");
    expect(JSON.stringify(properties)).not.toContain("Dvorsky");
  });
});
