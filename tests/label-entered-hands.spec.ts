import { expect, test } from "@playwright/test";

import { enteredHandsFor } from "@/lib/data/labels-server";

// The match row's player_* / opponent_* hands are the account holder's and
// the other side's (as the match page reads them), placed on their seats.

const none = () => null;
const row = (fields: Parameters<typeof enteredHandsFor>[0]) => fields;

test("the wizard's row: the player is seat 1", () => {
  expect(
    enteredHandsFor(
      row({
        player_hand: "Right",
        opponent_hand: "left-handed",
        player1_id: "me",
        player2_id: null,
        opponent_player_id: null,
      }),
      none,
    ),
  ).toEqual({ p1: "right", p2: "left" });
});

test("a row seating the account holder second puts their hand on seat 2", () => {
  // As four old SwingVision imports do: only player2_id is set.
  expect(
    enteredHandsFor(
      row({
        player_hand: "right",
        opponent_hand: "left",
        player1_id: null,
        player2_id: "me",
        opponent_player_id: null,
      }),
      none,
    ),
  ).toEqual({ p1: "left", p2: "right" });
});

test("no entered hand falls back to each seat's profile, by its id", () => {
  const profiles: Record<string, string> = { me: "L", rival: "right" };
  const lookup = (id: string) => profiles[id] ?? null;
  expect(
    enteredHandsFor(
      row({
        player_hand: null,
        opponent_hand: null,
        player1_id: "me",
        player2_id: null,
        opponent_player_id: "rival",
      }),
      lookup,
    ),
  ).toEqual({ p1: "left", p2: "right" });
  // Seated second, the opponent's roster id is seat 1's.
  expect(
    enteredHandsFor(
      row({
        player_hand: null,
        opponent_hand: null,
        player1_id: null,
        player2_id: "me",
        opponent_player_id: "rival",
      }),
      lookup,
    ),
  ).toEqual({ p1: "right", p2: "left" });
  expect(enteredHandsFor(null, lookup)).toEqual({ p1: null, p2: null });
});
