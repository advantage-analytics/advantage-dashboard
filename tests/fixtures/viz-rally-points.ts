import type { MatchShot } from "@/lib/data/match-points-server";
import { servePoint } from "./viz-serve-points";

export function rallyShot(
  id: string,
  player1: boolean,
  highEnd: boolean,
  lateral: number,
  depth: number,
  overrides: Partial<MatchShot> = {},
): MatchShot {
  return {
    id,
    isPlayer1: player1,
    shotNumber: 1,
    shotType: "Forehand",
    spinType: null,
    speedMph: null,
    zone: null,
    result: "In",
    videoTime: null,
    contactX: highEnd ? -1 : 1,
    contactY: highEnd ? 24 : -0.2,
    landingX: highEnd ? -lateral : lateral,
    landingY: 11.885 + (highEnd ? -depth : depth),
    ...overrides,
  };
}

// Every shot deliberately collides at shotNumber=1: role, not index, decides
// what is a serve/return. Both players hit several rally shots in each point.
export const RALLY_POINTS = [false, true].map((highEnd) => {
  const id = highEnd ? "high" : "low";
  const point = servePoint({ id, highEnd });
  const shot = (
    suffix: string,
    player1: boolean,
    lateral: number,
    depth: number,
    overrides: Partial<MatchShot> = {},
  ) =>
    rallyShot(
      `${id}-${suffix}`,
      player1,
      player1 ? highEnd : !highEnd,
      lateral,
      depth,
      overrides,
    );
  return {
    ...point,
    shots: [
      shot("feed", true, 1, 2, { shotType: "Feed" }),
      ...point.shots!,
      shot("return", false, 2, 3, { shotType: "Backhand" }),
      shot("p1-deep", true, -2.7, 10),
      shot("p2-short", false, 1.4, 3),
      shot("p1-wide", true, 5, 8, { result: "Out" }),
      shot("p2-net", false, -0.8, 2, { result: "Net", shotType: "Backhand" }),
      shot("p1-net", true, -1.2, -0.4, { result: null }),
      shot("p2-deep", false, -3, 9, { result: null }),
      shot("missing-landing", true, 1, 2, { landingX: null }),
      shot("missing-end", true, 1, 2, { contactY: null }),
      shot("invalid", false, 1, 2, { landingY: Number.NaN }),
    ],
  };
});
