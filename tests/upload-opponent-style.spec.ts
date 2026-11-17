import { expect, test } from "@playwright/test";

import { opponentStyleOnNaming } from "@/components/dashboard/matches/new-match-wizard/opponent-style";

/**
 * The opponent's hand and backhand when their name is settled — Enter,
 * leaving the field, or a pick from the menu all go through this.
 */

const blank = { hand: undefined, backhand: undefined };

test("answers given before any name survive naming someone new", () => {
  expect(
    opponentStyleOnNaming({
      current: { hand: "left", backhand: "two-handed" },
      enteredBeforeName: true,
    }),
  ).toEqual({ hand: "left", backhand: "two-handed", source: undefined });
});

test("the coach's answer beats what an older match remembered", () => {
  expect(
    opponentStyleOnNaming({
      current: { hand: "left", backhand: undefined },
      enteredBeforeName: true,
      remembered: { hand: "right", backhand: "one-handed" },
    }),
  ).toEqual({ hand: "left", backhand: "one-handed", source: "history" });
});

test("a remembered style fills a blank form, marked as history", () => {
  expect(
    opponentStyleOnNaming({
      current: blank,
      enteredBeforeName: true,
      remembered: { hand: "right", backhand: "two-handed" },
    }),
  ).toEqual({ hand: "right", backhand: "two-handed", source: "history" });
});

test("a previous opponent's style is never carried to the next one", () => {
  expect(
    opponentStyleOnNaming({
      current: { hand: "right", backhand: "one-handed" },
      enteredBeforeName: false,
    }),
  ).toEqual({ hand: undefined, backhand: undefined, source: undefined });
});

test("replacing an opponent takes the new one's remembered style", () => {
  expect(
    opponentStyleOnNaming({
      current: { hand: "right", backhand: "one-handed" },
      enteredBeforeName: false,
      remembered: { hand: "left", backhand: null },
    }),
  ).toEqual({ hand: "left", backhand: undefined, source: "history" });
});

test("values outside the two answers read as blank", () => {
  expect(
    opponentStyleOnNaming({
      current: blank,
      enteredBeforeName: true,
      remembered: { hand: "ambidextrous", backhand: "" },
    }),
  ).toEqual({ hand: undefined, backhand: undefined, source: undefined });
});
