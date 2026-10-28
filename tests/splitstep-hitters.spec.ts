import { expect, test } from "@playwright/test";

import {
  hittersByCourtEnd,
  type ProposedGame,
  type SplitStepRally,
  type SplitStepStroke,
} from "@/lib/services/splitstep/derivation";

/**
 * Who hit each stroke, from the end it was struck at under the proposed games.
 * "A" serves game 1 from the top; ends change after games 1, 3, 5, …
 */

let nextEvent = 1;

function stroke(
  playerLabel: string,
  playerY: number | null,
  strokeType: SplitStepStroke["strokeType"] = "groundstroke",
): SplitStepStroke {
  return {
    eventId: nextEvent++,
    playerLabel,
    playerY,
    strokeType,
  } as SplitStepStroke;
}

function rally(rallyId: number, strokes: SplitStepStroke[]): SplitStepRally {
  return {
    rallyId,
    strokes,
    server: strokes[0]?.playerLabel ?? "",
    serves: strokes.filter((s) => s.strokeType === "serve"),
  };
}

function game(
  set: number,
  g: number,
  first: number,
  last: number,
): ProposedGame {
  return {
    set,
    game: g,
    server: "player1",
    firstRallyId: first,
    lastRallyId: last,
    winner: "player1",
  };
}

const labels = ["A", "B"] as const;

test("a whole-point swap is put back by the end it was struck from", () => {
  // Game 1: A at the top. Rally 2's labels are swapped for the whole point.
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5), stroke("A", 6)]),
    rally(2, [stroke("B", 5, "serve"), stroke("A", -5), stroke("B", 6)]),
    rally(3, [stroke("A", 5, "serve"), stroke("B", -4)]),
  ];
  const out = hittersByCourtEnd(rallies, [game(1, 1, 1, 3)], labels);
  expect(out.rallies[1].strokes.map((s) => s.playerLabel)).toEqual([
    "A",
    "B",
    "A",
  ]);
  expect(out.rallies[1].server).toBe("A");
  expect(out.changed).toBe(3);
});

test("ends change after game 1, so game 2's top player is B", () => {
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(2, [stroke("A", -5, "serve"), stroke("B", 5)]),
  ];
  const out = hittersByCourtEnd(
    rallies,
    [game(1, 1, 1, 1), game(1, 2, 2, 2)],
    labels,
  );
  // In game 2 the bottom end belongs to A, the top to B: the labels stand.
  expect(out.rallies[1].strokes.map((s) => s.playerLabel)).toEqual(["A", "B"]);
  expect(out.changed).toBe(0);
});

test("the set's orientation is the one the vendor's labels agree with most", () => {
  // Labels are right on two rallies, swapped on one: the vote keeps A on top.
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(2, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(3, [stroke("B", 5, "serve"), stroke("A", -5)]),
  ];
  const out = hittersByCourtEnd(rallies, [game(1, 1, 1, 3)], labels);
  expect(out.rallies.map((r) => r.server)).toEqual(["A", "A", "A"]);
});

test("a stroke with no position takes the other player from the stroke before it", () => {
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("A", null), stroke("A", 5)]),
  ];
  const out = hittersByCourtEnd(rallies, [game(1, 1, 1, 1)], labels);
  expect(out.rallies[0].strokes.map((s) => s.playerLabel)).toEqual([
    "A",
    "B",
    "A",
  ]);
});

test("a match tiebreak takes the set before's orientation, not its own vote", () => {
  // Set 2 is played as game 1 only — a match tiebreak — and every one of its
  // labels says A is at the top. Set 1's games 2 and 3 outvote game 1, so B
  // starts set 1 at the top; its 3 games carry 2 end changes, so B starts
  // the match tiebreak at the top too, whatever its own labels say.
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(2, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(3, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(4, [stroke("A", 5, "serve"), stroke("B", -5)]),
  ];
  const sets = [
    game(1, 1, 1, 1),
    game(1, 2, 2, 2),
    game(1, 3, 3, 3),
    game(2, 1, 4, 4),
  ];
  const out = hittersByCourtEnd(rallies, sets, labels);
  expect(out.rallies[3].strokes.map((s) => s.playerLabel)).toEqual(["B", "A"]);
});

test("a match tiebreak changes ends every 6 points", () => {
  const set1 = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(2, [stroke("B", 5, "serve"), stroke("A", -5)]),
  ];
  // Match tiebreak: 7 points, all struck from the top by its top player.
  const tb = [3, 4, 5, 6, 7, 8, 9].map((id) =>
    rally(id, [stroke("A", 5, "serve"), stroke("B", -5)]),
  );
  const out = hittersByCourtEnd(
    [...set1, ...tb],
    [game(1, 1, 1, 1), game(1, 2, 2, 2), game(2, 1, 3, 9)],
    labels,
  );
  const servers = out.rallies.slice(2).map((r) => r.server);
  // The first six points share an end owner; the seventh is after a change.
  expect(new Set(servers.slice(0, 6)).size).toBe(1);
  expect(servers[6]).not.toBe(servers[0]);
});

test("rallies outside every proposed game keep the vendor's labels", () => {
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(9, [stroke("B", 5, "serve"), stroke("A", -5)]),
  ];
  const out = hittersByCourtEnd(rallies, [game(1, 1, 1, 1)], labels);
  expect(out.rallies[1]).toBe(rallies[1]);
});
