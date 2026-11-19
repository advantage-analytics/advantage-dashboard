import { expect, test } from "@playwright/test";

import type { Hand } from "@/components/dashboard/matches/match-detail/match-filters/shot-geometry";
import {
  approachLaneText,
  approachLeftLaneSide,
} from "@/components/dashboard/matches/match-detail/shots/court-art";
import {
  computeViz,
  EMPTY_VIZ_FILTERS,
  type VizDot,
  type VizDotMeta,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";

import { DRAWN_IN, MATCH } from "./fixtures/approach-points";

/**
 * The Approaches apron's three lane words when no one hand is passed (a
 * court over several opponents, the season's): read off the dots.
 */

const words = (dots: VizDot[]) => {
  const t = approachLaneText(approachLeftLaneSide(dots));
  return [t.left, t.middle, t.right];
};
const THEIR_RIGHTY = ["Their FH", "Middle", "Their BH"];
const THEIR_LEFTY = ["Their BH", "Middle", "Their FH"];
const HITTERS = ["Left", "Middle", "Right"];

/** You (player 1) approaching against `hand` over the shared net match. */
function matchDots(hand: Hand | null, points = MATCH): VizDot[] {
  return computeViz(points, "approaches", EMPTY_VIZ_FILTERS, true, "scatter", {
    youIsPlayer1: true,
    hands: { player1: "right", player2: hand },
  }).dots;
}

function dot(lateralM: number, meta: Partial<VizDotMeta>): VizDot {
  return {
    id: `d${lateralM}:${meta.wing}:${meta.opponentHand}`,
    outcome: "won",
    shape: "circle",
    lateralM,
    depthM: 6,
    atNet: false,
    meta: {
      setNumber: 1,
      pointScore: "15-0",
      wonBySubject: true,
      shotType: "Forehand",
      result: "In",
      isAce: false,
      entry: "approach",
      ...meta,
    },
  };
}

test.describe("approachLeftLaneSide — the apron's lane words off the dots", () => {
  test("the fixture match draws dots in both outer thirds and the middle", () => {
    const wings = new Set(matchDots("right").map((d) => d.meta?.wing));
    expect(wings).toEqual(new Set(["forehand", "backhand", "middle"]));
  });

  test("every dot from one known right-hander names their wings, FH on the left", () => {
    expect(words(matchDots("right"))).toEqual(THEIR_RIGHTY);
    // Two matches against right-handers: still one hand.
    expect(words([...matchDots("right"), ...matchDots("right")])).toEqual(
      THEIR_RIGHTY,
    );
  });

  test("every dot from one known left-hander names their wings the other way round", () => {
    expect(words(matchDots("left"))).toEqual(THEIR_LEFTY);
    expect(words([...matchDots("left"), ...matchDots("left")])).toEqual(
      THEIR_LEFTY,
    );
  });

  test("dots from a known right-hander and a known left-hander together read Left · Middle · Right", () => {
    expect(words([...matchDots("right"), ...matchDots("left")])).toEqual(
      HITTERS,
    );
    expect(words([...matchDots("left"), ...matchDots("right")])).toEqual(
      HITTERS,
    );
  });

  test("a left-hander's middle-third dot still counts: it names the left-hander alone and makes a right-hander's season mixed", () => {
    // DRAWN_IN lands in the middle third, so its wing says nothing about
    // the hand: the dot's own `opponentHand` does.
    const middle = matchDots("left", [DRAWN_IN]);
    expect(middle.map((d) => d.meta?.wing)).toEqual(["middle"]);
    expect(words(middle)).toEqual(THEIR_LEFTY);
    expect(words([...matchDots("right"), ...middle])).toEqual(HITTERS);
  });

  test("any dot whose hand was assumed reads Left · Middle · Right", () => {
    expect(words(matchDots(null))).toEqual(HITTERS);
    expect(words([...matchDots("right"), ...matchDots(null)])).toEqual(HITTERS);
    expect(words([...matchDots(null), ...matchDots("left")])).toEqual(HITTERS);
    // One assumed middle-third dot is enough.
    expect(
      words([...matchDots("right"), ...matchDots(null, [DRAWN_IN])]),
    ).toEqual(HITTERS);
  });

  test("hand-built dots without opponentHand: an outer-third wing from a known hand says the hand", () => {
    // Left third, their backhand: a left-hander.
    expect(words([dot(-2, { wing: "backhand", handAssumed: false })])).toEqual(
      THEIR_LEFTY,
    );
    expect(words([dot(3, { wing: "backhand", handAssumed: false })])).toEqual(
      THEIR_RIGHTY,
    );
    expect(
      words([
        dot(-2, { wing: "backhand", handAssumed: false }),
        dot(-2, { wing: "forehand", handAssumed: false }),
      ]),
    ).toEqual(HITTERS);
    expect(words([dot(-2, { wing: "forehand", handAssumed: true })])).toEqual(
      HITTERS,
    );
  });

  test("an empty court, or dots that cannot say, name the hitter's sides", () => {
    expect(words([])).toEqual(HITTERS);
    expect(words([dot(0, { wing: "middle", handAssumed: false })])).toEqual(
      HITTERS,
    );
  });
});
