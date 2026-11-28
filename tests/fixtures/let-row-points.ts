import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";

/**
 * One game of a hand-labelled match with a replayed let in it: the viewer
 * (player1) serves, wins 15–0, the next point is played out and called a
 * let, and the replay at 15–0 is an ace. The let is the loader's
 * `letReplayed` row: its `wonByPlayer1` is the placeholder (the server).
 */

export const LET_ROW_MATCH: Match = {
  id: "let-row-match",
  tournamentName: "Spring Invitational",
  date: "2026-04-18",
  matchType: "Singles",
  round: "R1",
  player1: { name: "Marcus Reid", school: "Riverside" },
  player2: { name: "Jordan Alvarez", school: "Northgate" },
  score: {
    sets: [{ player1: 6, player2: 4 }],
    winner: "player1",
    finalScore: "6-4",
  },
  won: true,
  isUserPlayer1: true,
  verificationPending: false,
};

function point(overrides: Partial<MatchPoint> & { id: string }): MatchPoint {
  return {
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    gameScoreRaw: "0-0",
    pointScore: "0-0",
    pointScoreRaw: "0-0",
    resultType: "Forehand Winner",
    eventType: "Forehand Winner",
    description: "Rally",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 4,
    duration: 6,
    videoTime: null,
    saved: false,
    savedBy: [],
    shots: [],
    ...overrides,
  };
}

/** The points that count, as `MatchDataProvider`'s `points` holds them. */
export const LET_ROW_POINTS: MatchPoint[] = [
  point({ id: "p1", pointNumber: 1, videoTime: 12, lastShotType: "Forehand" }),
  point({
    id: "p3",
    pointNumber: 3,
    videoTime: 40,
    pointScore: "15-0",
    pointScoreRaw: "15-0",
    resultType: "Ace",
    eventType: "Ace",
    rallyLength: 1,
  }),
  point({
    id: "p4",
    pointNumber: 4,
    videoTime: 58,
    pointScore: "30-0",
    pointScoreRaw: "30-0",
    resultType: "Backhand Unforced Error",
    eventType: "Backhand Unforced Error",
    player: "player2",
    wonByPlayer1: true,
  }),
  point({
    id: "p5",
    pointNumber: 5,
    videoTime: 80,
    pointScore: "40-0",
    pointScoreRaw: "40-0",
    resultType: "Forehand Winner",
    eventType: "Forehand Winner",
    player: "player2",
    wonByPlayer1: false,
  }),
];

/** The replayed let, as `MatchDataProvider`'s `letPoints` holds it. */
export const LET_ROW_LETS: MatchPoint[] = [
  point({
    id: "let-2",
    pointNumber: 2,
    videoTime: 24,
    pointScore: "15-0",
    pointScoreRaw: "15-0",
    resultType: "Let",
    eventType: "Let",
    rallyLength: 0,
    letReplayed: true,
  }),
];
