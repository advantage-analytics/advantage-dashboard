import { expect, test } from "@playwright/test";

import {
  normalizePlayerHand,
  playerHands,
} from "@/components/dashboard/matches/player-hands";
import type { Match } from "@/lib/data/types";

/** A minimal `Match` fixture, only carrying the fields `playerHands` reads. */
function match(
  player1Hand: string | undefined,
  player2Hand: string | undefined,
): Pick<Match, "player1" | "player2"> {
  return {
    player1: { name: "P1", school: "", hand: player1Hand },
    player2: { name: "P2", school: "", hand: player2Hand },
  };
}

test.describe("normalizePlayerHand", () => {
  for (const raw of [
    "right",
    "Right",
    "RIGHT",
    "RIGHT HANDED",
    "right handed",
    "right-handed",
    "R",
    "r",
    "  right  ",
  ]) {
    test(`"${raw}" -> "right"`, () => {
      expect(normalizePlayerHand(raw)).toBe("right");
    });
  }

  for (const raw of [
    "left",
    "Left",
    "LEFT",
    "LEFT HANDED",
    "left handed",
    "left-handed",
    "L",
    "l",
  ]) {
    test(`"${raw}" -> "left"`, () => {
      expect(normalizePlayerHand(raw)).toBe("left");
    });
  }

  for (const raw of [
    undefined,
    null,
    "",
    "   ",
    "ambidextrous",
    "two-handed",
  ]) {
    test(`${JSON.stringify(raw)} -> null`, () => {
      expect(normalizePlayerHand(raw)).toBeNull();
    });
  }
});

test.describe("playerHands", () => {
  test("normalises each seat's raw hand independently", () => {
    const m = match("Right Handed", "left");
    expect(playerHands(m)).toEqual({ player1: "right", player2: "left" });
  });

  test("unknown or missing hand values become null per seat", () => {
    const m = match(undefined, "sinister");
    expect(playerHands(m)).toEqual({ player1: null, player2: null });
  });

  // The guardrail this helper exists to protect: `match.player1.hand` /
  // `match.player2.hand` are already seat-correct by the time the client
  // holds a `Match` (`transformDbMatchToMatch` resolves them via
  // `isUserPlayer1` server-side — see the doc comment on `playerHands`). This
  // asserts the client-side helper does not re-derive attribution from which
  // seat the account holds — it takes no `youIsPlayer1` at all, and each
  // seat's hand lands under that same seat regardless of which one is "you".
  test("each seat's hand lands under that seat, regardless of which is the account", () => {
    expect(playerHands(match("right", "left"))).toEqual({
      player1: "right",
      player2: "left",
    });
    expect(playerHands(match("left", "right"))).toEqual({
      player1: "left",
      player2: "right",
    });
  });
});
