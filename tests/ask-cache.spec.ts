import { expect, test } from "@playwright/test";

import type {
  AskDatabase,
  AskModel,
  AskQuestionInput,
  AskRpcResult,
} from "@/lib/services/ask/ask";
import {
  askCacheKey,
  captureAskAnswer,
  readCachedAnswer,
  replayCachedAnswer,
  type AskCachedAnswer,
} from "@/lib/services/ask/cache";
import type { AskEvent } from "@/lib/services/ask/events";
import type { AskRunRecord } from "@/lib/services/ask/runs";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";

/** The answer cache's two wrappers and its key. Offline: the database is a fake. */

const CONVERSATION = "bbbbbbbb-0000-4000-8000-000000000002";
const ANSWER = "cccccccc-0000-4000-8000-000000000003";
const MATCH = "aaaaaaaa-0000-4000-8000-000000000001";
const TEAM: AskScope = {
  kind: "team",
  programId: "pppppppp-0000-4000-8000-000000000001",
  programName: "Westbrook College",
};

const TAGS: AskQuestionInput["tags"] = {
  prompt: [],
  saved: [{ kind: "match", id: MATCH, label: "vs Anna Lee" }],
  matchIds: [MATCH],
};

const CACHED: AskCachedAnswer = {
  events: [
    {
      type: "sources",
      matches: [
        {
          matchId: MATCH,
          opponentName: "Anna Lee",
          playedOn: "2026-09-14",
          iWon: true,
          scoreText: "6-4, 6-3",
          playerName: null,
        },
      ],
    },
    { type: "headline", text: "Your second serve held up." },
    { type: "figure", label: "Second-serve points won", value: "54.6%" },
    { type: "text", delta: "You won more than half of them." },
    { type: "notice", notice: "no_advice" },
  ],
  answer: { headline: "Your second serve held up.", body: "…", mock: false },
};

function fakeDb(script: { save?: AskRpcResult } = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const db: AskDatabase = {
    rpc: async (fn, args): Promise<AskRpcResult> => {
      calls.push({ fn, args });
      switch (fn) {
        case "ask_save_exchange_ids":
          return (
            script.save ?? {
              data: { conversation_id: CONVERSATION, answer_id: ANSWER },
              error: null,
            }
          );
        case "ask_quota":
          return {
            data: { used: 3, cap: 20, resets_on: "2026-11-01" },
            error: null,
          };
        default:
          return { data: null, error: null };
      }
    },
  };
  return { db, calls };
}

async function collect(
  events: AsyncGenerator<AskEvent, void, undefined>,
): Promise<AskEvent[]> {
  const seen: AskEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

test.describe("askCacheKey", () => {
  test("folds case and whitespace, orders the tags, and keeps scopes apart", () => {
    const base = askCacheKey({
      question: "How is my second serve?",
      tags: TAGS,
      scope: PERSONAL_ASK_SCOPE,
    });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(
      askCacheKey({
        question: "  how IS my   second serve? ",
        tags: TAGS,
        scope: PERSONAL_ASK_SCOPE,
      }),
    ).toBe(base);
    expect(
      askCacheKey({
        question: "How is my second serve?",
        tags: { ...TAGS, matchIds: [] },
        scope: PERSONAL_ASK_SCOPE,
      }),
    ).not.toBe(base);
    expect(
      askCacheKey({
        question: "How is my second serve?",
        tags: TAGS,
        scope: TEAM,
      }),
    ).not.toBe(base);
    expect(
      askCacheKey({
        question: "How is my first serve?",
        tags: TAGS,
        scope: PERSONAL_ASK_SCOPE,
      }),
    ).not.toBe(base);
  });
});

test.describe("readCachedAnswer", () => {
  test("accepts a payload with events and an answer; rejects anything else", () => {
    expect(readCachedAnswer(CACHED)).toEqual(CACHED);
    expect(readCachedAnswer(null)).toBeNull();
    expect(readCachedAnswer({ events: [], answer: {} })).toBeNull();
    expect(readCachedAnswer({ events: "no", answer: {} })).toBeNull();
    expect(readCachedAnswer({ events: CACHED.events })).toBeNull();
  });
});

test.describe("replayCachedAnswer", () => {
  test("saves the cached answer into this conversation, replays the events, ends with done from the quota, and records a cache run", async () => {
    const { db, calls } = fakeDb();
    const runs: AskRunRecord[] = [];
    const events = await collect(
      replayCachedAnswer({
        db,
        cached: CACHED,
        question: "How is my second serve?",
        tags: TAGS,
        conversationId: null,
        scope: PERSONAL_ASK_SCOPE,
        onRun: (run) => {
          runs.push(run);
        },
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "sources",
      "headline",
      "figure",
      "text",
      "notice",
      "done",
    ]);
    expect(events.at(-1)).toEqual({
      type: "done",
      conversationId: CONVERSATION,
      answerId: ANSWER,
      used: 3,
      cap: 20,
    });
    expect(calls.map((call) => call.fn)).toEqual([
      "ask_save_exchange_ids",
      "ask_quota",
    ]);
    expect(calls[0].args).toEqual({
      p_conversation_id: null,
      p_question: { text: "How is my second serve?", tags: TAGS.saved },
      p_answer: CACHED.answer,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      outcome: "done",
      route: "cache",
      modelCalls: 0,
      queryCount: 0,
      matchCount: 1,
      asksForAdvice: true,
      conversationId: CONVERSATION,
    });
  });

  test("a team replay names the program on the save; a failed save is answer_failed", async () => {
    const team = fakeDb();
    await collect(
      replayCachedAnswer({
        db: team.db,
        cached: CACHED,
        question: "q",
        tags: TAGS,
        conversationId: CONVERSATION,
        scope: TEAM,
      }),
    );
    expect(team.calls[0].args).toMatchObject({
      p_conversation_id: CONVERSATION,
      p_program_id: TEAM.programId,
    });

    const failed = fakeDb({
      save: { data: null, error: { code: "42501", message: "not yours" } },
    });
    const error = console.error;
    console.error = () => {};
    let events: AskEvent[];
    try {
      events = await collect(
        replayCachedAnswer({
          db: failed.db,
          cached: CACHED,
          question: "q",
          tags: TAGS,
          conversationId: null,
          scope: PERSONAL_ASK_SCOPE,
        }),
      );
    } finally {
      console.error = error;
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "answer_failed" });
  });
});

test.describe("captureAskAnswer", () => {
  const configured: AskModel = {
    configured: true,
    stream: async () => {
      throw new Error("not called");
    },
  };

  function input(db: AskDatabase, model: AskModel): AskQuestionInput {
    return {
      db,
      model,
      now: () => new Date("2026-10-15T12:00:00Z"),
      question: "How is my second serve?",
      tags: TAGS,
      conversation: [],
      previousPlan: null,
      conversationId: null,
      reservation: null,
      scope: PERSONAL_ASK_SCOPE,
    };
  }

  /** A stand-in for the stream: saves through `db`, then yields a finished answer. */
  function stream(
    events: AskEvent[],
  ): (input: AskQuestionInput) => AsyncGenerator<AskEvent, void, undefined> {
    return async function* (seen) {
      for (const event of events) {
        if (event.type === "done") {
          await seen.db.rpc("ask_save_exchange_ids", {
            p_conversation_id: null,
            p_question: { text: seen.question, tags: [] },
            p_answer: { headline: "h", body: "b" },
          });
        }
        yield event;
      }
    };
  }

  const FINISHED: AskEvent[] = [
    { type: "status", stage: "planning" },
    { type: "sources", matches: [] },
    { type: "status", stage: "writing" },
    { type: "headline", text: "h" },
    { type: "text", delta: "One. " },
    { type: "text", delta: "Two." },
    { type: "done", conversationId: CONVERSATION, used: 1, cap: 20 },
  ];

  test("a finished answer is put away after done, with the text as one delta and the saved answer", async () => {
    const { db, calls } = fakeDb();
    const events = await collect(
      captureAskAnswer(input(db, configured), stream(FINISHED), {
        key: "k",
        version: "v",
      }),
    );
    expect(events).toEqual(FINISHED);
    const put = calls.find((call) => call.fn === "ask_cache_put");
    expect(put?.args).toMatchObject({
      p_cache_key: "k",
      p_data_version: "v",
      p_program_id: null,
    });
    const payload = put?.args?.p_payload as AskCachedAnswer;
    expect(payload.answer).toEqual({ headline: "h", body: "b" });
    expect(payload.events).toEqual([
      { type: "sources", matches: [] },
      { type: "headline", text: "h" },
      { type: "text", delta: "One. Two." },
    ]);
  });

  test("nothing is kept for a mock answer, or for one that did not reach done", async () => {
    const mock = fakeDb();
    await collect(
      captureAskAnswer(
        input(mock.db, { ...configured, configured: false }),
        stream(FINISHED),
        { key: "k", version: "v" },
      ),
    );
    expect(mock.calls.some((call) => call.fn === "ask_cache_put")).toBe(false);

    const failed = fakeDb();
    await collect(
      captureAskAnswer(
        input(failed.db, configured),
        stream([
          { type: "headline", text: "h" },
          { type: "error", code: "answer_failed", error: "no" },
        ]),
        { key: "k", version: "v" },
      ),
    );
    expect(failed.calls.some((call) => call.fn === "ask_cache_put")).toBe(
      false,
    );
  });
});
