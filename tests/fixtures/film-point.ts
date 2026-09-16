import type { MatchPoint } from "@/lib/data/match-points-server";

export function pt(
  overrides: Partial<MatchPoint> & { id: string },
): MatchPoint {
  return {
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
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
    duration: null,
    videoTime: null,
    saved: false,
    ...overrides,
  };
}
