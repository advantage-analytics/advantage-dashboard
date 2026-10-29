import type { MatchDetailData } from "@/lib/data/match-detail-server";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { PlayerStatistics } from "@/lib/data/types";

/**
 * A hand-written `getMatchDetailData` result carrying exactly the things the
 * anonymiser must scrub: two made-up "real" names (in match fields, an insight and
 * a key moment), real-looking uuids, a program tie, an uploader and a
 * bookmark. Small on purpose — two points — so a failure reads as one line.
 */

export const REAL_MATCH_ID = "7c1e4b2a-3f5d-4e8a-9b6c-1d2e3f4a5b6c";
export const REAL_PROGRAM_ID = "5f1c2a7e-9b3d-4c21-8e6a-2d4b7f9c1a30";
export const REAL_UPLOADER_ID = "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8";
export const REAL_POINT_IDS = [
  "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
] as const;
export const REAL_SHOT_ID = "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f";

function playerStats(overrides: Partial<PlayerStatistics>): PlayerStatistics {
  return {
    aces: 3,
    doubleFaults: 1,
    firstServeInPct: 64,
    firstServeWinPct: 72,
    secondServeWinPct: 55,
    breakpointsWon: 4,
    tiebreaksWon: 0,
    servicePointsWon: 30,
    serviceGamesWon: 8,
    serviceGamesWonPct: 100,
    returnPointsWon: 20,
    firstReturnPointsWon: 12,
    secondReturnPointsWon: 8,
    returnGamesWon: 4,
    firstReturnInPct: 70,
    secondReturnInPct: 80,
    firstReturnWonPct: 40,
    secondReturnWonPct: 55,
    returnGamesWonPct: 50,
    breakpointsWonPct: 57,
    totalPoints: 87,
    totalPointsWon: 50,
    serveRating: 250,
    returnRating: 140,
    underPressureRating: 180,
    shortRallyWonPct: 60,
    mediumRallyWonPct: 55,
    longRallyWonPct: 50,
    winners: 18,
    unforcedErrors: 12,
    forcedErrors: null,
    netPointsAppearances: 6,
    netPointsWon: 4,
    netPointsWonPct: 67,
    breakpointsSaved: 2,
    fractions: { firstServeIn: { made: 32, attempts: 50 } },
    serveWidePct: 40,
    serveBodyPct: 20,
    serveTpct: 40,
    returnCrossCourtPct: 50,
    returnDownTheLinePct: 30,
    returnMiddlePct: 20,
    returnContactInsidePct: 30,
    returnContactMiddlePct: 40,
    returnContactDeepPct: 30,
    ...overrides,
  };
}

function point(
  id: string,
  pointNumber: number,
  overrides: Partial<MatchPoint>,
): MatchPoint {
  return {
    id,
    pointNumber,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    pointScoreRaw: "0-0",
    resultType: "winner",
    eventType: "Forehand winner",
    description: "Forehand winner down the line",
    player: "player1",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 3,
    duration: 6.2,
    videoTime: 12.5,
    saved: false,
    savedBy: [],
    shots: [],
    ...overrides,
  };
}

export const SYNTHETIC_MATCH_DETAIL: MatchDetailData = {
  match: {
    id: REAL_MATCH_ID,
    tournamentName: "Northfield Spring Invitational",
    date: "March 5, 2026",
    matchType: "Dual match",
    courtType: "Hard",
    sourceProvider: "splitstep",
    round: "Singles 1",
    matchContext: "Win",
    duration: "1h 24m",
    durationSec: 5040,
    eventId: "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80",
    uploadedBy: "Coach Example",
    player1: {
      name: "Casey Brennan",
      school: "",
      hand: "Right",
      backhand: "Two",
    },
    player2: {
      name: "Theo Marsh",
      school: "",
      hand: "Right",
      backhand: "One",
    },
    score: {
      sets: [
        {
          player1: 6,
          player2: 2,
          player1Tiebreak: null,
          player2Tiebreak: null,
        },
        {
          player1: 6,
          player2: 2,
          player1Tiebreak: null,
          player2Tiebreak: null,
        },
      ],
      winner: "player1",
      finalScore: "6-2, 6-2",
    },
    won: false,
    isUserPlayer1: false,
    // Not on `Match`, but a tie the anonymiser is told to drop if present.
    ...({ programId: REAL_PROGRAM_ID } as object),
  },
  statsResult: {
    statistics: {
      summary: { totalPoints: 87, durationMinutes: 84, longestRally: 14 },
      player1Stats: playerStats({}),
      player2Stats: playerStats({ aces: 1, totalPointsWon: 37 }),
    },
    player1Name: "Casey Brennan",
    player2Name: "Theo Marsh",
  },
  points: [
    point(REAL_POINT_IDS[0], 1, {
      saved: true,
      savedBy: [{ userId: REAL_UPLOADER_ID, name: "Casey Brennan" }],
      shots: [
        {
          id: REAL_SHOT_ID,
          shotNumber: 1,
          isPlayer1: true,
          shotType: "Serve",
          spinType: "Flat",
          speedMph: 112,
          zone: "T",
          result: "In",
          videoTime: 12.5,
          bounceVideoTime: 13.1,
          contactX: 0.4,
          contactY: 0.2,
          landingX: -0.3,
          landingY: 17.5,
        },
      ],
    }),
    point(REAL_POINT_IDS[1], 2, {
      pointScore: "15-0",
      pointScoreRaw: "15-0",
      resultType: "unforced_error",
      eventType: "Backhand error",
      description: "Marsh backhand unforced error into the net",
      player: "player2",
    }),
  ],
  keyMoments: [
    {
      moment: "Early Break",
      description:
        "Casey broke Marsh in the opening game of the Northfield dual with a return winner.",
    },
  ],
  insights: {
    player1: {
      summary:
        "Casey Brennan won 72% behind the first serve and never faced a break point against Theo Marsh.",
      strengths: [
        {
          name: "First serve",
          value: 72,
          description: "Brennan's first serve held up all afternoon.",
        },
      ],
      weaknesses: [],
    },
    player2: {
      summary: "Marsh struggled on return, winning 40% of first-return points.",
    },
  },
  kpiHistory: {
    viewerIsPlayer: true,
    baseline: { firstServeIn: 61 },
    series: { firstServeIn: [58, 61, 64] },
  },
  foldUnreconciled: false,
};

/** The synthetic source's program, which a spec rewrites as a real one is. */
export const SYNTHETIC_REWRITES = [["Northfield", "Westbrook"]] as const;

/** Every word of the synthetic source that must not survive anonymising. */
export const SYNTHETIC_BANNED = [
  "Casey",
  "Brennan",
  "Theo",
  "Marsh",
  "Northfield",
] as const;
