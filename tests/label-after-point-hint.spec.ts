import { expect, test } from "@playwright/test";

import { markHover } from "@/lib/services/labels/marks-copy";
import { shotAfterPointEnd } from "@/lib/services/labels/marks-state";
import type { LabelShot } from "@/lib/services/labels/session";
import { POINT_1_SHOTS } from "./fixtures/label-session";

/**
 * "Shot after the point ended?" (marks-state.ts `shotAfterPointEnd`): the
 * one hint read off the labelled rows — a stroke whose own coordinates say
 * out or net, with exactly one stroke after it.
 */

const NAMES = { p1: "Lee", p2: "Vargas" };

/** A stroke hit from the near baseline; `landing` decides in, out or net. */
function stroke(
  id: string,
  landing: { x: number; y: number } | null,
  over: Partial<LabelShot> = {},
): LabelShot {
  return {
    ...POINT_1_SHOTS[0],
    id,
    status: "kept",
    stroke: "forehand",
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    contactX: 0,
    contactY: 0,
    landingX: landing?.x ?? null,
    landingY: landing?.y ?? null,
    ...over,
  };
}

const IN = { x: 0, y: 20 };
const LONG = { x: 0, y: 25 };
const NETTED = { x: 0, y: 8 };

test("the second-to-last stroke lands out, one stroke follows", () => {
  const point = {
    shots: [stroke("a", IN), stroke("b", LONG), stroke("c", IN)],
  };
  const hint = shotAfterPointEnd(point);
  expect(hint).toEqual({
    code: "shot_after_point_end",
    tier: "hint",
    scope: "point",
    params: { landed: 2, extra: 3, result: "out" },
  });
  expect(markHover(hint!, NAMES)).toBe(
    "Shot 2 lands out and one more shot follows. Shot 3 may be a swing after the point ended.",
  );
});

test("in the net reads as the net", () => {
  const hint = shotAfterPointEnd({
    shots: [stroke("a", NETTED), stroke("b", IN)],
  });
  expect(hint?.params).toEqual({ landed: 1, extra: 2, result: "net" });
  expect(markHover(hint!, NAMES)).toContain("Shot 1 lands in the net");
});

test("nothing when the stroke before the last is in, unplaced, or a serve", () => {
  expect(
    shotAfterPointEnd({ shots: [stroke("a", IN), stroke("b", LONG)] }),
  ).toBeNull();
  expect(
    shotAfterPointEnd({ shots: [stroke("a", null), stroke("b", IN)] }),
  ).toBeNull();
  // A serve that misses is a fault, and the stroke after it another matter.
  expect(
    shotAfterPointEnd({
      shots: [stroke("a", LONG, { stroke: "first_serve" }), stroke("b", IN)],
    }),
  ).toBeNull();
});

test("only the stroke before the LAST one: two strokes after it is a rally", () => {
  expect(
    shotAfterPointEnd({
      shots: [stroke("a", LONG), stroke("b", IN), stroke("c", IN)],
    }),
  ).toBeNull();
  expect(shotAfterPointEnd({ shots: [stroke("a", LONG)] })).toBeNull();
  expect(shotAfterPointEnd({ shots: [] })).toBeNull();
});

test("deleting the extra stroke clears it; tombstones and ghosts are not strokes", () => {
  const a = stroke("a", IN);
  const b = stroke("b", LONG);
  const c = stroke("c", IN);
  expect(
    shotAfterPointEnd({ shots: [a, b, { ...c, status: "deleted" }] }),
  ).toBeNull();
  // A ghost between or after them is numbered and counted as nothing.
  const ghost = stroke("g", IN, { siteRemoval: "hit_after_fault" });
  expect(shotAfterPointEnd({ shots: [a, b, ghost, c] })?.params).toEqual({
    landed: 2,
    extra: 3,
    result: "out",
  });
  expect(shotAfterPointEnd({ shots: [a, b, ghost] })).toBeNull();
});
