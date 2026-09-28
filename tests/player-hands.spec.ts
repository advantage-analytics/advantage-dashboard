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
    expect(playerHands(m, true)).toEqual({ player1: "right", player2: "left" });
  });

  test("unknown or missing hand values become null per seat", () => {
    const m = match(undefined, "sinister");
    expect(playerHands(m, true)).toEqual({ player1: null, player2: null });
  });

  // The guardrail this helper exists to protect: `match.player1.hand` /
  // `match.player2.hand` are already seat-correct by the time the client
  // holds a `Match` (`transformDbMatchToMatch` resolves them via
  // `isUserPlayer1` server-side — see the doc comment on `playerHands`). This
  // asserts the client-side helper does NOT re-swap using `youIsPlayer1`: when
  // the account is seated at player2, its hand must still land under
  // `player2`, not get flipped back onto `player1`.
  test("when the account's player is player2, the account's hand lands under player2", () => {
    // youIsPlayer1 = false: the account is player2. The server has already
    // put the account's own hand ("left") on player2 and the opponent's
    // ("right") on player1 — exactly what transformDbMatchToMatch does.
    const accountIsPlayer2 = match("right", "left");
    const result = playerHands(accountIsPlayer2, false);
    expect(result.player2).toBe("left");
    expect(result.player1).toBe("right");
  });

  test("when the account's player is player1, the account's hand lands under player1", () => {
    const accountIsPlayer1 = match("left", "right");
    const result = playerHands(accountIsPlayer1, true);
    expect(result.player1).toBe("left");
    expect(result.player2).toBe("right");
  });
});
