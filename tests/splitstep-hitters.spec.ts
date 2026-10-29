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

const hitters = (rallies: SplitStepRally[]) =>
  rallies.map((r) => r.strokes.map((s) => s.playerLabel));

test("a whole-point swap is put back by the end it was struck from", () => {
  // Game 1: A at the top. Rally 2's labels are swapped for the whole point.
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5), stroke("A", 6)]),
    rally(2, [stroke("B", 5, "serve"), stroke("A", -5), stroke("B", 6)]),
    rally(3, [stroke("A", 5, "serve"), stroke("B", -4)]),
  ];
  const out = hittersByCourtEnd(rallies, { games: [game(1, 1, 1, 3)] }, labels);
  expect(hitters(out.rallies)[1]).toEqual(["A", "B", "A"]);
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
    { games: [game(1, 1, 1, 1), game(1, 2, 2, 2)] },
    labels,
  );
  // In game 2 the bottom end belongs to A, the top to B: the labels stand.
  expect(hitters(out.rallies)[1]).toEqual(["A", "B"]);
  expect(out.changed).toBe(0);
});

test("the set's orientation is the one the vendor's labels agree with most", () => {
  // Labels are right on two rallies, swapped on one: the vote keeps A on top.
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(2, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(3, [stroke("B", 5, "serve"), stroke("A", -5)]),
  ];
  const out = hittersByCourtEnd(rallies, { games: [game(1, 1, 1, 3)] }, labels);
  expect(out.rallies.map((r) => r.server)).toEqual(["A", "A", "A"]);
});

test("a stroke with no position takes the other player from the stroke before it", () => {
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("A", null), stroke("A", 5)]),
  ];
  const out = hittersByCourtEnd(rallies, { games: [game(1, 1, 1, 1)] }, labels);
  expect(hitters(out.rallies)[0]).toEqual(["A", "B", "A"]);
});

test("no fill follows a stroke the rule could not place", () => {
  // The serve has no position, so it keeps the vendor's label; the return
  // after it has none either, and is not filled from that unplaced label.
  const rallies = [
    rally(1, [stroke("B", null, "serve"), stroke("A", null), stroke("A", 5)]),
  ];
  const out = hittersByCourtEnd(rallies, { games: [game(1, 1, 1, 1)] }, labels);
  expect(hitters(out.rallies)[0]).toEqual(["B", "A", "A"]);
});

function oneGameSetFixture() {
  const rallies = [1, 2, 3, 4].map((id) =>
    rally(id, [stroke("A", 5, "serve"), stroke("B", -5)]),
  );
  const games = [
    game(1, 1, 1, 1),
    game(1, 2, 2, 2),
    game(1, 3, 3, 3),
    game(2, 1, 4, 4),
  ];
  return { rallies, games };
}

test("a match tiebreak takes the set before's orientation, not its own vote", () => {
  // Set 2 is played as game 1 only and scored 1-0 — a match tiebreak — and
  // every one of its labels says A is at the top. Set 1's games 2 and 3
  // outvote game 1, so B starts set 1 at the top; its 3 games carry 2 end
  // changes, so B starts the match tiebreak at the top too.
  const { rallies, games } = oneGameSetFixture();
  const out = hittersByCourtEnd(
    rallies,
    { games, score: { player1: [2, 1], player2: [1, 0] } },
    labels,
  );
  expect(hitters(out.rallies)[3]).toEqual(["B", "A"]);
});

test("a one-game set the score does not call 1-0 votes for itself", () => {
  // Same rallies, but the score has set 2 still at 0-0 in games: a video that
  // stopped one game in, not a match tiebreak. Its own vote keeps A on top.
  const { rallies, games } = oneGameSetFixture();
  const out = hittersByCourtEnd(
    rallies,
    { games, score: { player1: [2, 0], player2: [1, 0] } },
    labels,
  );
  expect(hitters(out.rallies)[3]).toEqual(["A", "B"]);
});

function tiebreakFixture() {
  const set1 = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(2, [stroke("B", 5, "serve"), stroke("A", -5)]),
  ];
  // Match tiebreak: 8 rallies, all struck from the top by its top player.
  const tb = [3, 4, 5, 6, 7, 8, 9, 10].map((id) =>
    rally(id, [stroke("A", 5, "serve"), stroke("B", -5)]),
  );
  return {
    rallies: [...set1, ...tb],
    games: [game(1, 1, 1, 1), game(1, 2, 2, 2), game(2, 1, 3, 10)],
    score: { player1: [1, 1], player2: [1, 0] },
  };
}

test("a match tiebreak entered as its points (10-8) is still one", () => {
  const { rallies, games } = tiebreakFixture();
  const out = hittersByCourtEnd(
    rallies,
    { games, score: { player1: [1, 10], player2: [1, 8] } },
    labels,
  );
  const servers = out.rallies.slice(2).map((r) => r.server);
  expect(new Set(servers.slice(0, 6)).size).toBe(1);
  expect(servers[6]).not.toBe(servers[0]);
});

test("a match tiebreak changes ends every 6 points", () => {
  const { rallies, games, score } = tiebreakFixture();
  const out = hittersByCourtEnd(rallies, { games, score }, labels);
  const servers = out.rallies.slice(2).map((r) => r.server);
  // Points 1–6 share an end owner; point 7 is after the change.
  expect(new Set(servers.slice(0, 6)).size).toBe(1);
  expect(servers[6]).not.toBe(servers[0]);
});

test("a merged-away rally is the same tiebreak point, not the next", () => {
  // Rally 5 continues rally 4's point, so rally 9 is point 6 (before the
  // change) and rally 10 point 7 (after it).
  const { rallies, games, score } = tiebreakFixture();
  const out = hittersByCourtEnd(
    rallies,
    { games, score, merges: [[4, 5]] },
    labels,
  );
  const servers = out.rallies.slice(2).map((r) => r.server);
  expect(new Set(servers.slice(0, 7)).size).toBe(1);
  expect(servers[7]).not.toBe(servers[0]);
});

test("rallies outside every proposed game keep the vendor's labels", () => {
  const rallies = [
    rally(1, [stroke("A", 5, "serve"), stroke("B", -5)]),
    rally(9, [stroke("B", 5, "serve"), stroke("A", -5)]),
  ];
  const out = hittersByCourtEnd(rallies, { games: [game(1, 1, 1, 1)] }, labels);
  expect(out.rallies[1]).toBe(rallies[1]);
});
