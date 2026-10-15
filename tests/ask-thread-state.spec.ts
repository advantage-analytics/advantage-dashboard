import { expect, test } from "@playwright/test";

import {
  ASK_THREAD_STATE_FIELDS,
  MAX_ASK_THREAD_STATE_FIELD_LENGTH,
  emptyAskThreadState,
  previousHeadlineFromTurns,
  readAskThreadState,
  renderAskThreadState,
  threadStateFromMessages,
} from "@/lib/services/ask/thread-state";

/**
 * Pure-logic spec for thread memory as a state object (roadmap 4.5,
 * `src/lib/services/ask/thread-state.ts`): what a state reads as, how it
 * prints, and how it is found again in a saved conversation. No database,
 * no model.
 */

test.describe("readAskThreadState", () => {
  test("reads the four fields, flattened to one line and cut to the limit; a missing field is empty", () => {
    expect(
      readAskThreadState({
        scope: "  matches against\n  OpponentX ",
        measure: "second-serve points won",
        subject: "x".repeat(MAX_ASK_THREAD_STATE_FIELD_LENGTH + 20),
        extra: "ignored",
      }),
    ).toEqual({
      scope: "matches against OpponentX",
      measure: "second-serve points won",
      period: "",
      subject: "x".repeat(MAX_ASK_THREAD_STATE_FIELD_LENGTH),
    });
  });

  test("an all-empty state, a non-object or a non-string field is none", () => {
    expect(readAskThreadState(emptyAskThreadState())).toBeNull();
    expect(readAskThreadState({ scope: "  ", measure: 3 })).toBeNull();
    for (const value of [null, undefined, "scope", 4, ["scope"]]) {
      expect(readAskThreadState(value)).toBeNull();
    }
    expect(readAskThreadState({ period: "August" })).toEqual({
      scope: "",
      measure: "",
      period: "August",
      subject: "",
    });
  });

  test("the fields are the four the schema and the prompt name", () => {
    expect([...ASK_THREAD_STATE_FIELDS]).toEqual([
      "scope",
      "measure",
      "period",
      "subject",
    ]);
    expect(Object.keys(emptyAskThreadState())).toEqual([
      ...ASK_THREAD_STATE_FIELDS,
    ]);
  });
});

test("renderAskThreadState prints one line per field, (none) for an empty one", () => {
  expect(
    renderAskThreadState({
      scope: "all matches",
      measure: "first serves in",
      period: "",
      subject: "the first serve",
    }),
  ).toBe(
    "scope: all matches\nmeasure: first serves in\nperiod: (none)\nsubject: the first serve",
  );
});

test("threadStateFromMessages finds the last answer's state, and none when it has none", () => {
  const state = {
    scope: "matches in August",
    measure: "",
    period: "August",
    subject: "the serve",
  };
  expect(
    threadStateFromMessages([
      { role: "user", content: { text: "First?" } },
      {
        role: "assistant",
        content: { headline: "H.", state: { scope: "old" } },
      },
      { role: "user", content: { text: "Second?" } },
      { role: "assistant", content: { headline: "H2.", state } },
    ]),
  ).toEqual(state);
  expect(
    threadStateFromMessages([
      { role: "assistant", content: { headline: "H.", body: "B." } },
    ]),
  ).toBeNull();
  expect(threadStateFromMessages([])).toBeNull();
  expect(
    threadStateFromMessages([{ role: "assistant", content: "plain text" }]),
  ).toBeNull();
});

test("previousHeadlineFromTurns is the first line of the last answer turn", () => {
  expect(
    previousHeadlineFromTurns([
      { role: "user", content: "Why do I keep losing to Marek?" },
      {
        role: "assistant",
        content: "Unforced errors decided it.\n\nYou made more than he did.",
      },
      { role: "user", content: "And on clay?" },
    ]),
  ).toBe("Unforced errors decided it.");
  expect(
    previousHeadlineFromTurns([{ role: "user", content: "First?" }]),
  ).toBeNull();
  expect(
    previousHeadlineFromTurns([{ role: "assistant", content: "  \n\n " }]),
  ).toBeNull();
});
