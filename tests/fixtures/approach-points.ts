import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";

/**
 * A small match of net points, shared by `tests/approach.spec.ts` (the
 * classifier) and `tests/viz-model.spec.ts` (the Approaches cut), so the two
 * are checked against the same points.
 *
 * Player 1 plays the low end (y < the net), player 2 the high end. Court
 * frame: y 0 → 23.77, the net at 11.885, x about the centre line.
 */

export const NET = 11.885;

let shotId = 0;
export function s(
  shotNumber: number,
  isPlayer1: boolean,
  shotType: string,
  o: {
    cy?: number | null;
    lx?: number | null;
    ly?: number | null;
    t?: number | null;
    result?: string;
    zone?: string | null;
  } = {},
): MatchShot {
  shotId += 1;
  return {
    id: `s${shotId}`,
    shotNumber,
    isPlayer1,
    shotType,
    spinType: null,
    zone: o.zone ?? null,
    result: o.result ?? "In",
    videoTime: o.t === undefined ? shotNumber * 1.3 : o.t,
    bounceVideoTime: null,
    contactX: 0,
    contactY: o.cy === undefined ? null : o.cy,
    landingX: o.lx === undefined ? 0 : o.lx,
    landingY: o.ly === undefined ? null : o.ly,
  };
}

export function p(
  id: string,
  o: {
    server: 1 | 2;
    winner: 1 | 2;
    resultType: string;
    shots: MatchShot[];
  },
): MatchPoint {
  return {
    id,
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: o.resultType,
    eventType: "",
    description: "",
    player: o.winner === 1 ? "player1" : "player2",
    wonByPlayer1: o.winner === 1,
    serverIsPlayer1: o.server === 1,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: o.shots.length,
    duration: null,
    videoTime: 10,
    saved: false,
    savedBy: [],
    shots: o.shots,
  };
}

export const LOB_T = 30;
export const LOBS: ReadonlySet<number> = new Set([LOB_T]);

// You serve and volley, and win it on the volley.
export const SERVE_VOLLEY = p("serve-volley", {
  server: 1,
  winner: 1,
  resultType: "Volley Winner",
  shots: [
    s(1, true, "First Serve", { cy: 0, lx: 2, ly: 17, zone: "Wide" }),
    s(2, false, "Backhand", { cy: 22, ly: 7 }),
    s(3, true, "Forehand Volley", { cy: 9 }),
  ],
});

/** You approach (shot 4) to `lx`, then are passed by a reply in `zone`. */
export const passedBy = (id: string, zone: string | null, lx = -3) =>
  p(id, {
    server: 2,
    winner: 2,
    resultType: "Forehand Winner",
    shots: [
      s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
      s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
      s(3, false, "Backhand", { cy: 22, ly: 2 }),
      s(4, true, "Forehand", { cy: 3, lx, ly: 21, zone: "Down the Line" }),
      s(5, false, "Backhand", { cy: 22, ly: 6 }),
      s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
      s(7, false, "Forehand", { cy: 21, ly: 3, zone }),
    ],
  });

export const PASSED_DTL = passedBy("passed-dtl", "Down the Line");
export const PASSED_CC = passedBy("passed-cc", "Crosscourt");

// A short ball drags you in; you net the volley.
export const DRAWN_IN = p("drawn-in", {
  server: 2,
  winner: 2,
  resultType: "Volley Unforced Error",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: NET - 2 }),
    s(4, true, "Forehand", { cy: 8.5, lx: 0.5, ly: 20, zone: "Middle" }),
    s(5, false, "Backhand", { cy: 21, ly: 7 }),
    s(6, true, "Forehand Volley", { cy: 9.5, result: "Net" }),
  ],
});

// You approach and the opponent lobs you (a lob only with lob keys).
export const LOBBED = p("lobbed", {
  server: 2,
  winner: 2,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: 3 }),
    s(4, true, "Forehand", { cy: 2, lx: 3, ly: 21, zone: "Crosscourt" }),
    s(5, false, "Backhand", { cy: 22, ly: 5 }),
    s(6, true, "Backhand Volley", { cy: 9, ly: 20 }),
    s(7, false, "Forehand", { cy: 21, ly: 1, t: LOB_T, zone: "Crosscourt" }),
  ],
});

// You approach and the opponent misses the pass.
export const OPP_ERROR = p("opp-error", {
  server: 1,
  winner: 1,
  resultType: "Forehand Unforced Error",
  shots: [
    s(1, true, "First Serve", { cy: 0, ly: 17 }),
    s(2, false, "Backhand", { cy: 22, ly: 3 }),
    s(3, true, "Forehand", { cy: 2, ly: 21 }),
    s(4, false, "Backhand", { cy: 22, ly: 6 }),
    s(5, true, "Forehand Volley", { cy: 9.5, ly: 20 }),
    s(6, false, "Forehand", { cy: 21, result: "Net" }),
  ],
});

// The opponent (high end) approaches and you pass them.
export const OPP_APPROACH = p("opp-approach", {
  server: 2,
  winner: 1,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Forehand", { cy: 21, lx: 3, ly: 2, zone: "Crosscourt" }),
    s(4, true, "Backhand", { cy: 1, ly: 22 }),
    s(5, false, "Forehand Volley", { cy: 14, ly: 5 }),
    s(6, true, "Forehand", { cy: 3, ly: 20, zone: "Down the Line" }),
  ],
});

// Nobody comes in.
export const BASELINE = p("baseline", {
  server: 2,
  winner: 2,
  resultType: "Forehand Winner",
  shots: [
    s(1, false, "First Serve", { cy: 23.5, ly: 7 }),
    s(2, true, "Forehand", { cy: 0.5, ly: 20 }),
    s(3, false, "Backhand", { cy: 22, ly: 3 }),
    s(4, true, "Backhand", { cy: 1, ly: 22 }),
    s(5, false, "Forehand", { cy: 22.5, ly: 2 }),
  ],
});

export const MATCH = [
  SERVE_VOLLEY,
  PASSED_DTL,
  PASSED_CC,
  DRAWN_IN,
  LOBBED,
  OPP_ERROR,
  OPP_APPROACH,
  BASELINE,
];

/**
 * `point` with no landing on any shot — as tracking that recorded where a
 * shot was hit from, or nothing, but never where it bounced (real match
 * 9e4d293e). Its approach still counts; it draws no mark.
 */
export function withoutLanding(point: MatchPoint): MatchPoint {
  return {
    ...point,
    shots: point.shots?.map((shot) => ({
      ...shot,
      landingX: null,
      landingY: null,
    })),
  };
}
