import type { MatchPoint } from "@/lib/data/match-points-server";

/** Source world frame: low-y deuce server stands at +x, serves diagonally
 * into negative x. At the high-y end BOTH source axes rotate. These fixtures
 * start from those physical positions, never the legacy normalized dots. */
export function servePoint({
  id = "serve",
  player1 = true,
  highEnd = false,
  lateral = -3.4,
  depth = 4,
  won = true,
  result = "In",
  second = false,
}: {
  id?: string;
  player1?: boolean;
  highEnd?: boolean;
  lateral?: number;
  depth?: number;
  won?: boolean;
  result?: string;
  second?: boolean;
} = {}): MatchPoint {
  const landingX = highEnd ? -lateral : lateral;
  const landingY = 11.885 + (highEnd ? -depth : depth);
  const shotType = second ? "Second Serve" : "First Serve";
  return {
    id,
    pointNumber: 1,
    setNumber: highEnd ? 2 : 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: lateral < 0 ? "0-0" : "15-0",
    resultType: "Winner",
    eventType: "Rally",
    description: "Serve fixture",
    player: player1 ? "player1" : "player2",
    wonByPlayer1: won === player1,
    serverIsPlayer1: player1,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 3,
    duration: null,
    videoTime: null,
    saved: false,
    savedBy: [],
    firstShotType: shotType,
    firstShotResult: result,
    firstShotLandingX: landingX,
    firstShotLandingY: landingY,
    // Deliberately wrong metadata: geometric zone membership is authoritative.
    firstShotZone: "Body",
    shots: [
      {
        id: `${id}-shot`,
        shotNumber: 1,
        isPlayer1: player1,
        shotType,
        spinType: null,
        speedMph: null,
        zone: "Body",
        result,
        videoTime: null,
        contactX: (lateral < 0 ? 1 : -1) * (highEnd ? -1 : 1),
        contactY: highEnd ? 24.5 : -0.8,
        landingX,
        landingY,
      },
    ],
  };
}

export const SERVE_ZONE_KEYS = [
  "deuce-wide",
  "deuce-body",
  "deuce-t",
  "ad-t",
  "ad-body",
  "ad-wide",
] as const;
const LATERALS = [-3.4, -2.1, -0.4, 0.8, 1.9, 3.7];

/** Each person plays from both ends and to both service sides. Distinct
 * zone populations (2,4,6,8,10,12 vs 12,10,8,6,4,2) expose a mirror swap
 * that a balanced fixture hides. Every zone has exactly two wins. */
export const ASYMMETRIC_SERVES = [true, false].flatMap((player1) =>
  [false, true].flatMap((highEnd) =>
    LATERALS.flatMap((lateral, zone) =>
      Array.from({ length: player1 ? zone + 1 : 6 - zone }, (_, i) =>
        servePoint({
          id: `${player1 ? "p1" : "p2"}-${highEnd ? "high" : "low"}-${zone}-${i}`,
          player1,
          highEnd,
          lateral,
          depth: 2.2 + zone * 0.4,
          won: i === 0,
          second: i % 2 === 1,
        }),
      ),
    ),
  ),
);
