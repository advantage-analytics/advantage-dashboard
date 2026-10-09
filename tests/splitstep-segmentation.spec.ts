import { expect, test } from "@playwright/test";

import {
  playerAtEnd,
  proposeSegmentation,
  SEGMENT_COSTS,
  type RallyOutcome,
  type SegmentationInput,
  type SplitStepRally,
  type SplitStepStroke,
} from "@/lib/services/splitstep/derivation";

/**
 * The score-constrained segmenter over synthetic matches. Every fixture is
 * built from a per-game list of outcomes relative to the server ("S" the
 * server won the point, "R" the receiver did); the builder then derives the
 * serve's end from the changeover schedule and its side from the point
 * count, exactly as a clean vendor payload would carry them. Tests then
 * damage the vendor's game boundaries, the score, or the serve data, and
 * check what the path makes of it. Labels are "A" (player1) and "B".
 */

const A = "A";
const B = "B";

type Point = "S" | "R";

interface GameSpec {
  points: Point[];
  /** Override the side of the serve at a point index; `null` means unknown. */
  sides?: Record<number, "deuce" | "ad" | null>;
}

interface Built {
  input: SegmentationInput;
  /** Index of the first rally of each game, as the schedule actually cut it. */
  gameStarts: number[];
}

function serveStroke(
  rallyId: number,
  label: string,
  videoTime: number,
  end: "top" | "bottom",
  side: "deuce" | "ad" | null,
): SplitStepStroke {
  const playerY = end === "top" ? 10 : -10;
  const hittingToward = playerY < 0 ? 1 : -1;
  const playerX =
    side === null ? null : side === "deuce" ? hittingToward : -hittingToward;
  return {
    eventId: rallyId,
    videoTime,
    trimmedFrame: 0,
    bounceFrame: null,
    rallyId,
    strokeNumber: 1,
    playerLabel: label,
    predPointScore: null,
    predGameScore: null,
    predSetScore: null,
    strokeType: "serve",
    strokeSide: "forehand",
    strokeScore: null,
    sideScore: null,
    playerX,
    playerY,
    opponentX: null,
    opponentY: null,
    speedKmh: null,
    spinType: null,
    initialHeightM: null,
    heightAtNetM: null,
    netHit: false,
    bounceX: null,
    bounceY: null,
    bounceScore: null,
    in: true,
    lineConfidence: null,
  };
}

/**
 * A match as the rules of tennis would play it: A serves first and starts at
 * the top. Sets are given game by game; the caller is responsible for each
 * game closing legally under `adScoring` and each set closing on `score`.
 */
function build(
  sets: GameSpec[][],
  options: { adScoring?: boolean; score: SegmentationInput["score"] },
): Built {
  const { adScoring = true, score } = options;
  const rallies: SplitStepRally[] = [];
  const outcomes: RallyOutcome[] = [];
  const vendorGameStarts: boolean[] = [];
  const gameStarts: number[] = [];
  const completedSets: number[] = [];
  let gamesPlayed = 0;
  let time = 0;

  for (const games of sets) {
    let gamesInSet = 0;
    for (const game of games) {
      const server = gamesPlayed % 2 === 0 ? A : B;
      const top = playerAtEnd({
        topAtStart: A,
        bottomAtStart: B,
        completedSets,
        gamesBeforeInSet: gamesInSet,
        end: "top",
      });
      const end = top === server ? "top" : "bottom";
      gameStarts.push(rallies.length);
      game.points.forEach((point, p) => {
        const rallyId = rallies.length + 1;
        const side =
          game.sides && p in game.sides
            ? game.sides[p]
            : p % 2 === 0
              ? "deuce"
              : "ad";
        const serve = serveStroke(rallyId, server, time, end, side);
        time += 20;
        rallies.push({ rallyId, strokes: [serve], server, serves: [serve] });
        outcomes.push({
          won: point === "S" ? "server" : "receiver",
          confidence: "high",
        });
        vendorGameStarts.push(p === 0);
      });
      gamesPlayed += 1;
      gamesInSet += 1;
    }
    completedSets.push(gamesInSet);
  }

  return {
    gameStarts,
    input: {
      rallies,
      outcomes,
      vendorGameStarts,
      adScoring,
      bestOf: 3,
      score,
      topAtStart: A,
      player1Label: A,
      player2Label: B,
    },
  };
}

const hold: GameSpec = { points: ["S", "S", "S", "S"] };
const breakGame: GameSpec = { points: ["R", "R", "R", "R"] };

/** A serves games 1, 3, 5, 7. A wins games 1–3, 5, 7 and 8; B breaks in 4 and 6. */
function sixTwoSet(): GameSpec[] {
  const winners = [A, A, A, B, A, B, A, A];
  return winners.map((winner, g) =>
    (g % 2 === 0 ? A : B) === winner ? hold : breakGame,
  );
}

const SIX_TWO = { player1: [6], player2: [2] };

test.describe("proposeSegmentation", () => {
  test("a clean ad 6–2 set with the vendor's boundaries in place fits at zero cost", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.version).toBe(1);
    expect(proposal.cost).toBe(0);
    expect(proposal.diff.gamesMoved).toBe(0);
    expect(proposal.diff.serversChanged).toBe(0);
    expect(proposal.diff.rallies).toEqual([]);
    expect(proposal.runnerUpCost).toBeNull();
    expect(proposal.merges).toEqual([]);
    expect(proposal.closestScore).toBeNull();
    expect(proposal.games).toHaveLength(8);
    expect(proposal.games.map((g) => g.game)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(proposal.games.every((g) => g.set === 1)).toBe(true);
    expect(proposal.games.map((g) => g.server)).toEqual([
      "player1",
      "player2",
      "player1",
      "player2",
      "player1",
      "player2",
      "player1",
      "player2",
    ]);
    expect(proposal.games.map((g) => g.winner)).toEqual([
      "player1",
      "player1",
      "player1",
      "player2",
      "player1",
      "player2",
      "player1",
      "player1",
    ]);
    expect(proposal.games[0]).toMatchObject({
      firstRallyId: 1,
      lastRallyId: 4,
    });
    expect(proposal.games[7]).toMatchObject({
      firstRallyId: 29,
      lastRallyId: 32,
    });
    for (const row of Object.keys(SEGMENT_COSTS)) {
      expect(proposal.costBreakdown[row as keyof typeof SEGMENT_COSTS]).toBe(0);
    }
  });

  test("an ad deuce game the vendor cut in two is one proposed game", () => {
    // Game 1 goes to deuce and the server takes it from there: 8 points.
    const deuceHold: GameSpec = {
      points: ["S", "S", "R", "R", "S", "R", "S", "S"],
    };
    const games = [deuceHold, ...sixTwoSet().slice(1)];
    const { input } = build([games], { score: SIX_TWO });
    // The vendor's score stream opened a second game at the fifth point.
    const vendorGameStarts = [...input.vendorGameStarts];
    vendorGameStarts[4] = true;

    const proposal = proposeSegmentation({ ...input, vendorGameStarts });

    expect(proposal.status).toBe("fit");
    expect(proposal.games).toHaveLength(8);
    expect(proposal.games[0]).toMatchObject({
      set: 1,
      game: 1,
      server: "player1",
      winner: "player1",
      firstRallyId: 1,
      lastRallyId: 8,
    });
    expect(proposal.cost).toBe(SEGMENT_COSTS.vendorBoundaryDropped);
    expect(proposal.costBreakdown.vendorBoundaryDropped).toBe(
      SEGMENT_COSTS.vendorBoundaryDropped,
    );
    expect(proposal.diff.gamesMoved).toBe(1);
    expect(proposal.diff.rallies).toEqual([5]);
  });

  test("a vendor boundary one rally late at a same-end deuce→deuce changeover is moved", () => {
    // Game 1 closes 4–1 on its fifth point, served from the deuce court, and
    // the changeover after it puts game 2's server at the SAME end, opening
    // from the deuce court again. Only the score and the point count can
    // place that boundary.
    const fiveHold: GameSpec = { points: ["S", "S", "R", "S", "S"] };
    const games = [fiveHold, ...sixTwoSet().slice(1)];
    const { input, gameStarts } = build([games], { score: SIX_TWO });
    expect(gameStarts[1]).toBe(5);
    const vendorGameStarts = [...input.vendorGameStarts];
    vendorGameStarts[5] = false;
    vendorGameStarts[6] = true;

    const proposal = proposeSegmentation({ ...input, vendorGameStarts });

    expect(proposal.status).toBe("fit");
    expect(proposal.games).toHaveLength(8);
    expect(proposal.games[0]).toMatchObject({
      firstRallyId: 1,
      lastRallyId: 5,
    });
    expect(proposal.games[1]).toMatchObject({
      firstRallyId: 6,
      server: "player2",
    });
    expect(proposal.cost).toBe(
      SEGMENT_COSTS.vendorBoundaryMoved + SEGMENT_COSTS.vendorBoundaryDropped,
    );
    expect(proposal.diff.gamesMoved).toBe(1);
    expect(proposal.diff.rallies).toEqual([6, 7]);
  });

  test("an entered score no path reaches is no_fit with the closest score", () => {
    // 6–4 is ten games, at least 40 points; there are 32 rallies.
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const proposal = proposeSegmentation({
      ...input,
      score: { player1: [6], player2: [4] },
    });

    expect(proposal.status).toBe("no_fit");
    expect(proposal.closestScore).toEqual(SIX_TWO);
    expect(proposal.cost).toBe(0);
    expect(proposal.games).toHaveLength(8);
    expect(proposal.diff.gamesMoved).toBe(0);
  });

  test("a no-ad deciding point served to the ad court costs nothing on side", () => {
    // 3–3, then the server takes the deciding point from the ad court.
    const decided: GameSpec = {
      points: ["S", "S", "R", "R", "S", "R", "S"],
      sides: { 6: "ad" },
    };
    const noAdSet = [decided, ...sixTwoSet().slice(1)];
    const { input } = build([noAdSet], { adScoring: false, score: SIX_TWO });

    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.costBreakdown.side).toBe(0);
    expect(proposal.games[0]).toMatchObject({
      firstRallyId: 1,
      lastRallyId: 7,
      winner: "player1",
    });
  });

  test("the same deciding point under ad scoring is a side mismatch", () => {
    // Under ad scoring the seventh point is 4–3, not a deciding point, and is
    // still expected from the deuce court.
    const decided: GameSpec = {
      points: ["S", "S", "R", "R", "S", "R", "S", "S"],
      sides: { 6: "ad" },
    };
    const { input } = build([[decided, ...sixTwoSet().slice(1)]], {
      score: SIX_TWO,
    });
    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.costBreakdown.side).toBe(SEGMENT_COSTS.side);
  });

  test("a serve from the wrong end is paid for, and a flipped guess is cheaper than a wrong end", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    // Rally 9 opens game 3. Pretend its serve came from the other end, from
    // the same court (mirroring both axes keeps the side).
    const rallies = input.rallies.map((rally) =>
      rally.rallyId === 9
        ? {
            ...rally,
            strokes: rally.strokes.map((s) => ({
              ...s,
              playerX: -s.playerX!,
              playerY: -s.playerY!,
            })),
          }
        : rally,
    );
    const proposal = proposeSegmentation({ ...input, rallies });

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(SEGMENT_COSTS.end);
    expect(proposal.costBreakdown.end).toBe(SEGMENT_COSTS.end);
    expect(proposal.diff.gamesMoved).toBe(0);
  });

  test("a low-confidence outcome is flipped before a high-confidence one", () => {
    // The last point of game 6, B's hold, is guessed the other way. Reaching
    // 6–2 means flipping it back, and a guess is cheap to flip.
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const outcomes = input.outcomes.map((o, i) =>
      i === 23 ? { won: "receiver" as const, confidence: "low" as const } : o,
    );
    const proposal = proposeSegmentation({ ...input, outcomes });

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(SEGMENT_COSTS.flipLow);
    expect(proposal.costBreakdown.flipLow).toBe(SEGMENT_COSTS.flipLow);
    expect(proposal.costBreakdown.flipHigh).toBe(0);
  });

  test("player labels map through player1Label", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    // The same rallies with B as player1: the score is then 2–6.
    const proposal = proposeSegmentation({
      ...input,
      player1Label: B,
      player2Label: A,
      score: { player1: [2], player2: [6] },
    });

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.games[0]).toMatchObject({
      server: "player2",
      winner: "player2",
    });
  });

  test("a vendor server label the schedule contradicts counts as a changed server", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const rallies = input.rallies.map((rally) =>
      rally.rallyId === 2 ? { ...rally, server: B } : rally,
    );
    const proposal = proposeSegmentation({ ...input, rallies });

    expect(proposal.status).toBe("fit");
    expect(proposal.diff.serversChanged).toBe(1);
    expect(proposal.diff.rallies).toEqual([2]);
  });

  test("two sets, the first ending on an odd game count, fit with the ends swapped at the set break", () => {
    // Set 1: A wins 6–3 (9 games). Set 2: A wins 6–2.
    const winners1 = [A, A, A, B, A, B, A, B, A];
    let g = 0;
    const set1 = winners1.map((winner) => {
      const server = g % 2 === 0 ? A : B;
      g += 1;
      return server === winner ? hold : breakGame;
    });
    const winners2 = [A, A, A, B, A, B, A, A];
    const set2 = winners2.map((winner) => {
      const server = g % 2 === 0 ? A : B;
      g += 1;
      return server === winner ? hold : breakGame;
    });
    const { input } = build([set1, set2], {
      score: { player1: [6, 6], player2: [3, 2] },
    });
    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.games).toHaveLength(17);
    expect(proposal.games[9]).toMatchObject({
      set: 2,
      game: 1,
      server: "player2",
    });
  });

  test("never throws on empty rallies", () => {
    const { input } = build([], { score: { player1: [], player2: [] } });
    const empty = proposeSegmentation(input);
    expect(empty.status).toBe("fit");
    expect(empty.games).toEqual([]);

    const unreachable = proposeSegmentation({ ...input, score: SIX_TWO });
    expect(unreachable.status).toBe("no_fit");
    expect(unreachable.closestScore).toEqual({ player1: [], player2: [] });
    expect(unreachable.games).toEqual([]);
  });

  test("never throws on a serve without a position, which costs nothing", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const rallies = input.rallies.map((rally) => ({
      ...rally,
      strokes: rally.strokes.map((s) => ({
        ...s,
        playerX: null,
        playerY: null,
      })),
      serves: rally.serves.map((s) => ({ ...s, playerX: null, playerY: null })),
    }));
    const proposal = proposeSegmentation({ ...input, rallies });

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.diff.gamesMoved).toBe(0);
  });

  test("never throws on a rally with no strokes at all", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const rallies = input.rallies.map((rally) =>
      rally.rallyId === 3 ? { ...rally, strokes: [], serves: [] } : rally,
    );
    expect(() => proposeSegmentation({ ...input, rallies })).not.toThrow();
  });

  test("a 200-rally match completes quickly", () => {
    // Three sets: 6–4, 4–6, 6–4, every game to deuce and beyond.
    const long: GameSpec = {
      points: ["S", "S", "R", "R", "S", "R", "S", "R", "S", "S"],
    };
    const longBreak: GameSpec = {
      points: ["R", "R", "S", "S", "R", "S", "R", "S", "R", "R"],
    };
    let g = 0;
    const setOf = (winners: string[]) =>
      winners.map((winner) => {
        const server = g % 2 === 0 ? A : B;
        g += 1;
        return server === winner ? long : longBreak;
      });
    const sets = [
      setOf([A, A, A, B, A, B, A, B, B, A]),
      setOf([B, B, B, A, B, A, B, A, A, B]),
      setOf([A, A, A, B, A, B, A, B, B, A]),
    ];
    const { input } = build(sets, {
      score: { player1: [6, 4, 6], player2: [4, 6, 4] },
    });
    expect(input.rallies.length).toBe(300);

    const started = performance.now();
    const proposal = proposeSegmentation(input);
    const elapsed = performance.now() - started;

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.games).toHaveLength(30);
    expect(elapsed).toBeLessThan(500);
  });
});
