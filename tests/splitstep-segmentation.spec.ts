import { expect, test } from "@playwright/test";

import {
  playerAtEnd,
  proposeSegmentation,
  SEGMENT_COSTS,
  type CompletedSet,
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
  /**
   * A tiebreak at 6–6: `points` are still relative to each point's server,
   * who rotates 1, 2-2, … from the player due to serve game 13.
   */
  tiebreak?: boolean;
}

/**
 * Seconds between consecutive rallies, last stroke to first stroke, as a
 * clean payload would carry them: a between-point pause, a changeover (the
 * ends swap, after odd games) and a set break. The changeover sits between
 * the segmenter's two gap thresholds (30 s and 80 s) so neither gap cost
 * fires on a fixture whose boundaries are where the rules put them.
 */
const POINT_GAP_S = 20;
const CHANGEOVER_GAP_S = 60;
const SET_BREAK_GAP_S = 120;

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
  // A tiebreak set is carried as { games, tiebreakPoints } so the end changes
  // inside the tiebreak place the next set's ends (position.ts).
  const completedSets: CompletedSet[] = [];
  let gamesPlayed = 0;
  let time = 0;

  for (const games of sets) {
    let gamesInSet = 0;
    let tiebreakPoints: number | null = null;
    for (const game of games) {
      const gameServer = gamesPlayed % 2 === 0 ? A : B;
      if (rallies.length > 0) {
        // The pause before this game, on top of the between-point gap.
        const last = completedSets.at(-1) ?? 0;
        const lastSet = typeof last === "number" ? last : last.games;
        const changeover =
          gamesInSet === 0 ? lastSet % 2 === 1 : gamesInSet % 2 === 1;
        if (gamesInSet === 0) time += SET_BREAK_GAP_S - POINT_GAP_S;
        else if (changeover) time += CHANGEOVER_GAP_S - POINT_GAP_S;
      }
      gameStarts.push(rallies.length);
      game.points.forEach((point, p) => {
        const rallyId = rallies.length + 1;
        // In a tiebreak the serve rotates 1, 2-2, … and the ends swap every six points.
        if (game.tiebreak && p > 0 && p % 6 === 0) {
          time += CHANGEOVER_GAP_S - POINT_GAP_S;
        }
        const server =
          game.tiebreak && ((p + 1) >> 1) % 2 === 1
            ? gameServer === A
              ? B
              : A
            : gameServer;
        const top = playerAtEnd({
          topAtStart: A,
          bottomAtStart: B,
          completedSets,
          gamesBeforeInSet: gamesInSet,
          end: "top",
          tiebreakPointsBefore: game.tiebreak ? p : 0,
        });
        const end = top === server ? "top" : "bottom";
        const side =
          game.sides && p in game.sides
            ? game.sides[p]
            : p % 2 === 0
              ? "deuce"
              : "ad";
        const serve = serveStroke(rallyId, server, time, end, side);
        time += POINT_GAP_S;
        rallies.push({ rallyId, strokes: [serve], server, serves: [serve] });
        outcomes.push({
          won: point === "S" ? "server" : "receiver",
          confidence: "high",
        });
        vendorGameStarts.push(p === 0);
      });
      if (game.tiebreak) tiebreakPoints = game.points.length;
      gamesPlayed += 1;
      gamesInSet += 1;
    }
    completedSets.push(
      tiebreakPoints === null
        ? gamesInSet
        : { games: gamesInSet, tiebreakPoints },
    );
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

  /**
   * Cut the second point of game 1 (an ad-court serve) into two rallies at
   * the serve, `gapS` seconds apart: a lone serve stroke the vendor took for
   * a point of its own, then the point as it was played.
   */
  function splitSecondPoint(gapS: number) {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const [first, second, ...rest] = input.rallies;
    const stub = serveStroke(
      2,
      A,
      second.strokes[0].videoTime - gapS,
      "top",
      "ad",
    );
    const realServe = { ...second.strokes[0], rallyId: 3 };
    const rally = {
      ...second.strokes[0],
      rallyId: 3,
      strokeNumber: 2,
      strokeType: "groundstroke" as const,
      playerLabel: B,
      videoTime: realServe.videoTime + 2,
    };
    const rallies: SplitStepRally[] = [
      first,
      { rallyId: 2, strokes: [stub], server: A, serves: [stub] },
      {
        rallyId: 3,
        strokes: [realServe, rally],
        server: A,
        serves: [realServe],
      },
      ...rest.map((r) => ({
        ...r,
        rallyId: r.rallyId + 1,
        strokes: r.strokes.map((s) => ({ ...s, rallyId: r.rallyId + 1 })),
      })),
    ];
    const outcomes: RallyOutcome[] = [
      input.outcomes[0],
      { won: null, confidence: "low" },
      ...input.outcomes.slice(1),
    ];
    const vendorGameStarts = [
      input.vendorGameStarts[0],
      false,
      ...input.vendorGameStarts.slice(1),
    ];
    return { ...input, rallies, outcomes, vendorGameStarts };
  }

  test("an ad→ad split point is merged", () => {
    const proposal = proposeSegmentation(splitSecondPoint(15));

    expect(proposal.status).toBe("fit");
    expect(proposal.merges).toEqual([[2, 3]]);
    expect(proposal.cost).toBe(SEGMENT_COSTS.merge);
    expect(proposal.costBreakdown.merge).toBe(SEGMENT_COSTS.merge);
    expect(proposal.costBreakdown.side).toBe(0);
    expect(proposal.games).toHaveLength(8);
    expect(proposal.games[0]).toMatchObject({
      firstRallyId: 1,
      lastRallyId: 5,
      winner: "player1",
    });
    expect(proposal.diff.gamesMoved).toBe(0);
    expect(proposal.diff.serversChanged).toBe(0);
  });

  test("the same pair with a 40 s gap is not merged", () => {
    const proposal = proposeSegmentation(splitSecondPoint(40));

    expect(proposal.merges).toEqual([]);
    expect(proposal.costBreakdown.merge).toBe(0);
    expect(proposal.cost).toBeGreaterThan(SEGMENT_COSTS.merge);
  });

  test("two equal-cost cuts give ambiguous, with the fewer-moves cut reported", () => {
    // Game 1 closes 4–1 in five rallies and game 2 takes five more, both
    // served from the same end. The vendor cut one rally late (after rally
    // 6); the winners of rallies 1–10 are unknown, rallies 7–10 carry no
    // side, and the pause is split 40 s / 40 s around rally 6 so the gap
    // evidence favours neither cut. Keeping the vendor's cut costs one side
    // mismatch (rally 6 served from the deuce court where the sixth point of
    // a game is served from the ad court); moving it to where the rules put
    // it costs one boundary moved plus one dropped. Equal cost, and the cut
    // that moves nothing wins.
    const fiveHold: GameSpec = { points: ["S", "S", "R", "S", "S"] };
    const games = [fiveHold, fiveHold, ...sixTwoSet().slice(2)];
    const { input, gameStarts } = build([games], { score: SIX_TWO });
    expect(gameStarts.slice(0, 3)).toEqual([0, 5, 10]);

    const vendorGameStarts = [...input.vendorGameStarts];
    vendorGameStarts[5] = false;
    vendorGameStarts[6] = true;
    const outcomes = input.outcomes.map((o, i) =>
      i < 10 ? { won: null, confidence: "low" as const } : o,
    );
    const times = input.rallies.map((r) => r.strokes[0].videoTime);
    const gaps = times.map((t, i) => (i === 0 ? 0 : t - times[i - 1]));
    gaps[5] = 40;
    gaps[6] = 40;
    let clock = 0;
    const retimed = gaps.map((gap) => (clock += gap));
    const rallies = input.rallies.map((rally, i) => {
      const strokes = rally.strokes.map((s) => ({
        ...s,
        videoTime: retimed[i],
        playerX: i >= 6 && i < 10 ? null : s.playerX,
      }));
      return { ...rally, strokes, serves: strokes };
    });

    const proposal = proposeSegmentation({
      ...input,
      rallies,
      outcomes,
      vendorGameStarts,
    });

    expect(proposal.status).toBe("ambiguous");
    expect(proposal.cost).toBe(SEGMENT_COSTS.side);
    expect(proposal.runnerUpCost).toBe(proposal.cost);
    expect(proposal.diff.gamesMoved).toBe(0);
    expect(proposal.games[0]).toMatchObject({
      firstRallyId: 1,
      lastRallyId: 6,
    });
    expect(proposal.games[1]).toMatchObject({
      firstRallyId: 7,
      lastRallyId: 10,
    });
  });

  /** Games 1–12 are all holds, then a tiebreak A takes 7–0 (A serves point 1). */
  function sevenSixSet(): GameSpec[] {
    const tiebreak: GameSpec = {
      points: ["S", "R", "R", "S", "S", "R", "R"],
      tiebreak: true,
    };
    return [...Array.from({ length: 12 }, () => hold), tiebreak];
  }

  test("a 7–6 set passes through its tiebreak to fit", () => {
    const { input } = build([sevenSixSet()], {
      score: { player1: [7], player2: [6] },
    });
    expect(input.rallies).toHaveLength(55);

    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.games).toHaveLength(13);
    expect(proposal.games[12]).toMatchObject({
      set: 1,
      game: 13,
      server: "player1",
      winner: "player1",
      firstRallyId: 49,
      lastRallyId: 55,
    });
    expect(proposal.diff.gamesMoved).toBe(0);
    expect(proposal.diff.serversChanged).toBe(0);
  });

  test("the set after a tiebreak opens with the tiebreak's first receiver serving", () => {
    // Set 2 opens with B serving (B received first in the tiebreak). Winners
    // A, A, A, B, A, B, A, A against servers B, A, B, A, B, A, B, A: 6–2.
    const set2 = [
      breakGame,
      hold,
      breakGame,
      breakGame,
      breakGame,
      breakGame,
      breakGame,
      hold,
    ];
    const { input } = build([sevenSixSet(), set2], {
      score: { player1: [7, 6], player2: [6, 2] },
    });

    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.games).toHaveLength(21);
    expect(proposal.games[13]).toMatchObject({
      set: 2,
      game: 1,
      server: "player2",
      winner: "player1",
    });
  });

  test("a 7–5 tiebreak's end change after point 6 carries into the next set", () => {
    // A serves point 1 of the tiebreak; the serve then rotates B, B, A, A, …
    // A takes points 1, 2, 4, 5, 8, 9 and 12 (7–5, 12 points), so the ends
    // changed once inside the tiebreak (after point 6) and once at its end:
    // set 2 opens on the match's starting ends, A at the top, B serving.
    // Without the in-tiebreak carry every set-2 rally would pay the end cost.
    const sevenFive: GameSpec = {
      points: ["S", "R", "S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
      tiebreak: true,
    };
    const set1 = [...Array.from({ length: 12 }, () => hold), sevenFive];
    const set2 = [
      breakGame,
      hold,
      breakGame,
      breakGame,
      breakGame,
      breakGame,
      breakGame,
      hold,
    ];
    const { input, gameStarts } = build([set1, set2], {
      score: { player1: [7, 6], player2: [6, 2] },
    });
    expect(input.rallies).toHaveLength(60 + 32);
    // The builder placed set 2's opening serve from the top (A's starting end).
    const opener = input.rallies[gameStarts[13]].strokes[0];
    expect(opener.playerLabel).toBe(B);
    expect(opener.playerY).toBeLessThan(0);

    const proposal = proposeSegmentation(input);

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.costBreakdown.end).toBe(0);
    expect(proposal.games).toHaveLength(21);
    expect(proposal.games[12]).toMatchObject({
      set: 1,
      game: 13,
      winner: "player1",
      firstRallyId: 49,
      lastRallyId: 60,
    });
    expect(proposal.games[13]).toMatchObject({
      set: 2,
      game: 1,
      server: "player2",
      firstRallyId: 61,
    });
  });

  test("a mid-match start gives no_fit / starts_mid_match", () => {
    const { input } = build([sixTwoSet()], { score: SIX_TWO });
    const rallies = input.rallies.map((rally, i) =>
      i === 0
        ? {
            ...rally,
            strokes: rally.strokes.map((s) => ({
              ...s,
              predGameScore: "2-1",
              predPointScore: "0-0",
              predSetScore: "0.0-0.0",
            })),
          }
        : rally,
    );
    const proposal = proposeSegmentation({ ...input, rallies });

    expect(proposal.status).toBe("no_fit");
    expect(proposal.reason).toBe("starts_mid_match");
    expect(proposal.games).toEqual([]);
    expect(proposal.closestScore).toBeNull();

    // Zero readings in either of the vendor's formats are a match start.
    const zeroed = input.rallies.map((rally, i) =>
      i === 0
        ? {
            ...rally,
            strokes: rally.strokes.map((s) => ({
              ...s,
              predGameScore: "0.0-0.0",
              predPointScore: "0-0",
              predSetScore: "0-0",
            })),
          }
        : rally,
    );
    expect(proposeSegmentation({ ...input, rallies: zeroed }).status).toBe(
      "fit",
    );
    expect(
      proposeSegmentation({ ...input, rallies: zeroed }).reason,
    ).toBeUndefined();
  });

  test("a changeover with no pause and a long gap inside a game are each paid for", () => {
    const { input, gameStarts } = build([sixTwoSet()], { score: SIX_TWO });
    // Close the pause before game 2 (a changeover) to 10 s, and open an
    // 80 s gap before the third point of game 3.
    const shift = (from: number, by: number) =>
      input.rallies.map((rally, i) =>
        i >= from
          ? {
              ...rally,
              strokes: rally.strokes.map((s) => ({
                ...s,
                videoTime: s.videoTime + by,
              })),
            }
          : rally,
      );
    const closed = proposeSegmentation({
      ...input,
      rallies: shift(gameStarts[1], -50),
    });
    expect(closed.status).toBe("fit");
    expect(closed.cost).toBe(SEGMENT_COSTS.changeoverShortGap);
    expect(closed.costBreakdown.changeoverShortGap).toBe(
      SEGMENT_COSTS.changeoverShortGap,
    );
    expect(closed.diff.gamesMoved).toBe(0);

    const stretched = proposeSegmentation({
      ...input,
      rallies: shift(gameStarts[2] + 2, 60),
    });
    expect(stretched.status).toBe("fit");
    expect(stretched.cost).toBe(SEGMENT_COSTS.longGapNotChangeover);
    expect(stretched.costBreakdown.longGapNotChangeover).toBe(
      SEGMENT_COSTS.longGapNotChangeover,
    );
    expect(stretched.diff.gamesMoved).toBe(0);
  });

  test("a 150-rally synthetic match completes in under 50 ms", () => {
    // Three sets of ten five-point games: 6–4, 4–6, 6–4.
    const five: GameSpec = { points: ["S", "S", "R", "S", "S"] };
    const fiveBreak: GameSpec = { points: ["R", "R", "S", "R", "R"] };
    let g = 0;
    const setOf = (winners: string[]) =>
      winners.map((winner) => {
        const server = g % 2 === 0 ? A : B;
        g += 1;
        return server === winner ? five : fiveBreak;
      });
    const sets = [
      setOf([A, A, A, B, A, B, A, B, B, A]),
      setOf([B, B, B, A, B, A, B, A, A, B]),
      setOf([A, A, A, B, A, B, A, B, B, A]),
    ];
    const { input } = build(sets, {
      score: { player1: [6, 4, 6], player2: [4, 6, 4] },
    });
    expect(input.rallies.length).toBe(150);

    // Warm up the JIT, then time one run.
    proposeSegmentation(input);
    const started = performance.now();
    const proposal = proposeSegmentation(input);
    const elapsed = performance.now() - started;

    expect(proposal.status).toBe("fit");
    expect(proposal.cost).toBe(0);
    expect(proposal.games).toHaveLength(30);
    expect(elapsed).toBeLessThan(50);
  });
});
