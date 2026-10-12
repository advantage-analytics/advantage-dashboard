import { expect, test } from "@playwright/test";

import type { ProposedPoint } from "@/lib/services/splitstep/derivation";
import {
  compareMerges,
  gameMatches,
  joinSessionTruth,
  scoreSessionTruth,
  type TruthLabelPoint,
  type TruthTranscriptPoint,
} from "@/lib/services/labels/session-truth";

/**
 * The join behind `splitstep-eval.ts --session`: label points onto transcript
 * points by the first vendor rally id, on synthetic rows only.
 */

const NAMES = { p1: "Player One", p2: "Player Two" };

function label(fields: Partial<TruthLabelPoint>): TruthLabelPoint {
  return {
    pointIndex: 1,
    vendorRallyIds: [],
    setNumber: 1,
    gameNumber: 1,
    server: "p1",
    winner: "p1",
    ending: "winner",
    status: "unchanged",
    checkedAt: "2026-10-01T00:00:00Z",
    ...fields,
  };
}

function point(fields: Partial<TruthTranscriptPoint>): TruthTranscriptPoint {
  return {
    rally_id: 0,
    point_number: 1,
    set_number: 1,
    game_number: 1,
    server_is_player1: true,
    won_by_player1: true,
    result_type: "Forehand Winner",
    ...fields,
  };
}

const POINTS = [
  point({ rally_id: 10, point_number: 1 }),
  point({ rally_id: 11, point_number: 2, won_by_player1: false }),
  point({ rally_id: 12, point_number: 3, result_type: "Unforced Error" }),
  point({ rally_id: 13, point_number: 4, game_number: 2 }),
];

test("a single-id point joins its rally and maps sides to names", () => {
  const { rows, unmatched } = joinSessionTruth({
    labels: [label({ pointIndex: 1, vendorRallyIds: [10], winner: "p2" })],
    points: POINTS,
    proposed: null,
    names: NAMES,
  });
  expect(unmatched).toHaveLength(0);
  expect(rows).toHaveLength(1);
  expect(rows[0].rallyId).toBe(10);
  expect(rows[0].mergedRallyIds).toEqual([]);
  expect(rows[0].truth.serverName).toBe("Player One");
  expect(rows[0].truth.winnerName).toBe("Player Two");
  expect(rows[0].published).toMatchObject({
    server: "p1",
    winner: "p1",
    ending: "winner",
  });
  expect(rows[0].proposed).toBeNull();
});

test("a multi-id point joins on its first id; the rest are the labeller's merge", () => {
  const labels = [label({ pointIndex: 2, vendorRallyIds: [11, 12] })];
  const { rows } = joinSessionTruth({
    labels,
    points: POINTS,
    proposed: null,
    names: NAMES,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].rallyId).toBe(11);
  expect(rows[0].mergedRallyIds).toEqual([12]);

  const merges = compareMerges(
    {
      merges: [
        [11, 12],
        [12, 13],
      ],
    },
    labels,
  );
  expect(merges.labelled).toEqual([[11, 12]]);
  expect(merges.agreed).toEqual([[11, 12]]);
});

test("a point with no matching rally, or no ids at all, is unmatched", () => {
  const { rows, unmatched } = joinSessionTruth({
    labels: [
      label({ pointIndex: 1, vendorRallyIds: [99] }),
      label({ pointIndex: 2, vendorRallyIds: [], status: "added" }),
    ],
    points: POINTS,
    proposed: null,
    names: NAMES,
  });
  expect(rows).toHaveLength(0);
  expect(unmatched.map((l) => l.pointIndex)).toEqual([1, 2]);
});

test("deleted and unchecked points are excluded", () => {
  const labels = [
    label({ pointIndex: 1, vendorRallyIds: [10], status: "deleted" }),
    label({ pointIndex: 2, vendorRallyIds: [11], checkedAt: null }),
    label({ pointIndex: 3, vendorRallyIds: [12], status: "edited" }),
    label({
      pointIndex: 4,
      vendorRallyIds: [13, 14],
      status: "deleted",
    }),
  ];
  const { rows, unmatched, excluded } = joinSessionTruth({
    labels,
    points: POINTS,
    proposed: null,
    names: NAMES,
  });
  expect(rows.map((r) => r.rallyId)).toEqual([12]);
  expect(unmatched).toHaveLength(0);
  expect(excluded).toBe(3);
  // A deleted merge is not the labeller's merge either.
  expect(compareMerges(null, labels).labelled).toEqual([]);
});

test("proposed values: server swapped keeps the server-relative outcome; firings scored on server and game", () => {
  // Labels: rallies 10–12 are game 5 served by p2; 13 is game 6 served by p1.
  const labels = [
    label({
      pointIndex: 1,
      vendorRallyIds: [10],
      gameNumber: 5,
      server: "p2",
      winner: "p2",
    }),
    label({
      pointIndex: 2,
      vendorRallyIds: [11],
      gameNumber: 5,
      server: "p2",
      winner: "p1",
    }),
    label({
      pointIndex: 3,
      vendorRallyIds: [12],
      gameNumber: 5,
      server: "p2",
      winner: "p2",
      ending: "error",
    }),
    label({
      pointIndex: 4,
      vendorRallyIds: [13],
      gameNumber: 6,
      server: "p1",
      winner: "p1",
    }),
  ];
  // Published: everything p1-served, 10–12 game 1, 13 game 2. The proposal
  // hands game 1 to p2 and leaves game 2 alone.
  const proposed = new Map<number, ProposedPoint>([
    [10, { set: 1, game: 1, server: "player2", mergedWith: null }],
    [11, { set: 1, game: 1, server: "player2", mergedWith: null }],
    [12, { set: 1, game: 1, server: "player2", mergedWith: null }],
    [13, { set: 1, game: 2, server: "player1", mergedWith: null }],
  ]);
  const { rows } = joinSessionTruth({
    labels,
    points: POINTS,
    proposed,
    names: NAMES,
  });
  // Server won rally 10 (p1 served and won) → under p2 serving, p2 won.
  expect(rows[0].proposed).toMatchObject({ server: "p2", winner: "p2" });
  // Receiver won rally 11 → under p2 serving, p1 won.
  expect(rows[1].proposed).toMatchObject({ server: "p2", winner: "p1" });
  expect(rows.map((r) => r.fired)).toEqual([true, true, true, false]);
  // Different numbers, same partition: games match.
  expect(gameMatches(rows, "published")).toEqual([true, true, true, true]);

  const score = scoreSessionTruth(rows);
  expect(score.published.server).toEqual({ right: 1, of: 4 });
  expect(score.proposed.server).toEqual({ right: 4, of: 4 });
  expect(score.published.winner).toEqual({ right: 1, of: 4 });
  expect(score.proposed.winner).toEqual({ right: 4, of: 4 });
  expect(score.proposed.ending).toEqual(score.published.ending);
  expect(score.firings).toEqual([
    { rallyId: 10, pointIndex: 1, hit: true },
    { rallyId: 11, pointIndex: 2, hit: true },
    { rallyId: 12, pointIndex: 3, hit: true },
  ]);
  expect(score.uncovered).toBe(0);
});

test("a firing that cuts the game in the wrong place is a miss", () => {
  const labels = [
    label({ pointIndex: 1, vendorRallyIds: [10], gameNumber: 1 }),
    label({ pointIndex: 2, vendorRallyIds: [11], gameNumber: 1 }),
    label({ pointIndex: 3, vendorRallyIds: [12], gameNumber: 1 }),
    label({ pointIndex: 4, vendorRallyIds: [13], gameNumber: 2 }),
  ];
  const proposed = new Map<number, ProposedPoint>([
    [10, { set: 1, game: 1, server: "player1", mergedWith: null }],
    [11, { set: 1, game: 1, server: "player1", mergedWith: null }],
    [12, { set: 1, game: 2, server: "player1", mergedWith: null }],
    [13, { set: 1, game: 2, server: "player1", mergedWith: null }],
  ]);
  const { rows } = joinSessionTruth({
    labels,
    points: POINTS,
    proposed,
    names: NAMES,
  });
  const score = scoreSessionTruth(rows);
  expect(score.firings).toEqual([{ rallyId: 12, pointIndex: 3, hit: false }]);
  // {10,11} and {12,13} against {10,11,12} and {13}: no row's game-mates match.
  expect(score.proposed.game).toEqual({ right: 0, of: 4 });
  expect(score.published.game).toEqual({ right: 4, of: 4 });
});

test("a renumbered game with the same rallies and server does not fire", () => {
  // 10–12 game 1 and 13 game 2 in the rows; the proposal keeps both groups
  // and servers but numbers them 4 and 5 in set 2.
  const labels = [10, 11, 12, 13].map((id, i) =>
    label({
      pointIndex: i + 1,
      vendorRallyIds: [id],
      gameNumber: id === 13 ? 2 : 1,
    }),
  );
  const proposed = new Map<number, ProposedPoint>(
    [10, 11, 12, 13].map((id) => [
      id,
      { set: 2, game: id === 13 ? 5 : 4, server: "player1", mergedWith: null },
    ]),
  );
  const { rows } = joinSessionTruth({
    labels,
    points: POINTS,
    proposed,
    names: NAMES,
  });
  expect(rows.map((r) => r.fired)).toEqual([false, false, false, false]);
  expect(scoreSessionTruth(rows).firings).toEqual([]);
});
