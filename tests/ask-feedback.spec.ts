import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  ASK_FEEDBACK_REASONS,
  isMissingEmbed,
  MAX_ASK_FEEDBACK_NOTE,
  readAskFeedbackRequest,
  readAskFeedbackRow,
} from "@/lib/services/ask/feedback";
import {
  askThreadReducer,
  emptyAskThread,
  exchangesFromMessages,
  type AskThreadState,
} from "@/components/dashboard/ask/use-ask-stream";

/**
 * Offline spec for Ask feedback: the route's body reader, the saved row's
 * reader, the thread reducer's handling of an answer's id and thumb, and the
 * migration's list of reasons agreeing with the code's.
 */

const ID = "00000000-0000-4000-8000-000000000001";

test.describe("the request body", () => {
  test("a thumbs down keeps its reasons and trimmed note", () => {
    expect(
      readAskFeedbackRequest({
        answerId: ID,
        rating: "down",
        reasons: ["misread", "misread", "other"],
        note: "  read it as my opponent's serve ",
      }),
    ).toEqual({
      ok: true,
      value: {
        answerId: ID,
        rating: "down",
        reasons: ["misread", "other"],
        note: "read it as my opponent's serve",
      },
    });
  });

  test("a thumbs up or a take-back drops reasons and note", () => {
    for (const rating of ["up", null] as const) {
      const read = readAskFeedbackRequest({
        answerId: ID,
        rating,
        reasons: ["other"],
        note: "x",
      });
      expect(read).toEqual({
        ok: true,
        value: { answerId: ID, rating, reasons: [], note: null },
      });
    }
  });

  test("anything off the lists is refused, never trimmed", () => {
    const refused = [
      [],
      { answerId: "not-a-uuid", rating: "up" },
      { answerId: ID, rating: "meh" },
      { answerId: ID, rating: "down", reasons: ["rude"] },
      { answerId: ID, rating: "down", note: 4 },
      {
        answerId: ID,
        rating: "down",
        note: "x".repeat(MAX_ASK_FEEDBACK_NOTE + 1),
      },
      { answerId: ID, rating: "up", userId: ID },
    ];
    for (const body of refused) {
      expect(readAskFeedbackRequest(body).ok).toBe(false);
    }
  });
});

test("a saved row reads back, and one that does not read whole is none", () => {
  expect(
    readAskFeedbackRow({ rating: "down", reasons: ["misread", "x"], note: "" }),
  ).toEqual({ rating: "down", reasons: ["misread"], note: null });
  expect(readAskFeedbackRow(null)).toBeNull();
  expect(readAskFeedbackRow({ rating: "sideways" })).toBeNull();
});

test.describe("the thread", () => {
  test("a saved answer carries its own id and its thumb", () => {
    const [exchange] = exchangesFromMessages([
      { id: "q1", role: "user", content: { text: "How did I serve?" } },
      {
        id: ID,
        role: "assistant",
        content: { headline: "Well." },
        feedback: { rating: "up", reasons: [], note: null },
      },
    ]);
    expect(exchange.answer.answerId).toBe(ID);
    expect(exchange.answer.feedback).toEqual({
      rating: "up",
      reasons: [],
      note: null,
    });
  });

  test("done names the answer, and a thumb lands on that answer only", () => {
    let state: AskThreadState = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "a1",
      question: { text: "How did I serve?", tags: [] },
    });
    state = askThreadReducer(state, {
      type: "event",
      event: {
        type: "done",
        conversationId: "c1",
        answerId: ID,
        used: 1,
        cap: 20,
      },
    });
    expect(state.exchanges[0].answer.answerId).toBe(ID);

    const down = {
      rating: "down",
      reasons: ["not_useful"],
      note: null,
    } as const;
    state = askThreadReducer(state, {
      type: "feedback",
      answerId: ID,
      feedback: { ...down, reasons: [...down.reasons] },
    });
    expect(state.exchanges[0].answer.feedback?.rating).toBe("down");
    const untouched = askThreadReducer(state, {
      type: "feedback",
      answerId: "someone-else",
      feedback: null,
    });
    expect(untouched.exchanges[0].answer.feedback?.rating).toBe("down");
  });

  test("a done with no id leaves the answer unrateable", () => {
    let state: AskThreadState = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "a1",
      question: { text: "How did I serve?", tags: [] },
    });
    state = askThreadReducer(state, {
      type: "event",
      event: { type: "done", conversationId: "c1", used: 1, cap: 20 },
    });
    expect(state.exchanges[0].answer.answerId).toBeNull();
  });
});

test("the migration lists the same reasons as the code", () => {
  const sql = readFileSync(
    "supabase/migrations/20261014203258_ask_feedback.sql",
    "utf8",
  );
  const listed = sql.match(/reasons <@ array\[([^\]]+)\]/)?.[1] ?? "";
  expect(
    listed.split(",").map((value) => value.trim().replace(/'/g, "")),
  ).toEqual([...ASK_FEEDBACK_REASONS]);
});

test("a missing ask_feedback embed is recognised so the thread still loads", () => {
  // The exact error PostgREST returned in PostHog issue 01a13bf3 / 01a13bf2.
  expect(
    isMissingEmbed({
      code: "PGRST200",
      message:
        "Could not find a relationship between 'ask_messages' and 'ask_feedback' in the schema cache",
    } as { code: string }),
  ).toBe(true);
  // Any other read failure still throws "Could not load the conversation".
  expect(isMissingEmbed({ code: "42501" })).toBe(false);
  expect(isMissingEmbed({ code: "PGRST116" })).toBe(false);
  expect(isMissingEmbed(null)).toBe(false);
});
