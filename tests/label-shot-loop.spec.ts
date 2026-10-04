import { expect, test } from "@playwright/test";

import { labelFilmStops } from "@/components/admin/labels/label-film-stops";
import {
  SHOT_LOOP_MIN_SECONDS,
  SHOT_LOOP_TAIL_SECONDS,
  shotLoopWindow,
} from "@/components/admin/labels/label-shot-loop";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";

/**
 * The window a clicked shot loops over, in FILE seconds.
 *
 * The fixture's point 1 has live strokes at 2472.0 (`s-serve`), 2473.1
 * (`s-return`) and 2474.4 (`s-added`), and a tombstone at 2473.6
 * (`s-phantom`); point 2 has one stroke at 2490.2.
 */

const { P1, P2 } = FIXTURE_POINT_IDS;

function pointsFixture(): LabelPoint[] {
  return labelSessionFixture().points;
}

function pointOf(points: readonly LabelPoint[], id: string): LabelPoint {
  const point = points.find((p) => p.id === id);
  if (!point) throw new Error(`no point ${id}`);
  return point;
}

/** The fixture with one point's strokes swapped for others. */
function withShots(
  pointId: string,
  shots: (point: LabelPoint) => LabelShot[],
): LabelPoint[] {
  return pointsFixture().map((point) =>
    point.id === pointId ? { ...point, shots: shots(point) } : point,
  );
}

function stroke(id: string, pointId: string, videoTime: number | null) {
  return {
    ...pointsFixture()[0].shots[0],
    id,
    labelPointId: pointId,
    status: "kept",
    videoTime,
  } as LabelShot;
}

test("the tail and the floor are the documented lengths", () => {
  expect(SHOT_LOOP_TAIL_SECONDS).toBe(1.5);
  expect(SHOT_LOOP_MIN_SECONDS).toBe(0.5);
});

test("a middle stroke's window ends at the next live stroke", () => {
  const p1 = pointOf(pointsFixture(), P1);
  expect(shotLoopWindow(p1, "s-serve", 0)).toEqual({
    start: 2472.0,
    end: 2473.1,
  });
  // The tombstone at 2473.6 is stepped over: the return runs to 2474.4.
  expect(shotLoopWindow(p1, "s-return", 0)).toEqual({
    start: 2473.1,
    end: 2474.4,
  });
});

test("the point's last stroke runs the tail", () => {
  const p1 = pointOf(pointsFixture(), P1);
  const window = shotLoopWindow(p1, "s-added", 0);
  expect(window?.start).toBe(2474.4);
  expect(window?.end).toBeCloseTo(2474.4 + SHOT_LOOP_TAIL_SECONDS, 6);
});

test("the last stroke's tail is capped by the point's end", () => {
  // Point 2 now opens 0.9s after point 1's last stroke — inside the tail.
  const points = withShots(P2, () => [stroke("s-next", P2, 2475.3)]);
  const stops = labelFilmStops(points, 0);
  const window = shotLoopWindow(pointOf(points, P1), "s-added", 0, stops);
  expect(window).toEqual({ start: 2474.4, end: 2475.3 });
  // Measured on its own, the same stroke would have run the whole tail.
  expect(shotLoopWindow(pointOf(points, P1), "s-added", 0)?.end).toBeCloseTo(
    2474.4 + SHOT_LOOP_TAIL_SECONDS,
    6,
  );
});

test("a deleted stroke, one without a time, or an unknown id: no window", () => {
  const p1 = pointOf(pointsFixture(), P1);
  expect(shotLoopWindow(p1, "s-phantom", 0)).toBeNull();
  expect(shotLoopWindow(p1, "s-nowhere", 0)).toBeNull();

  const points = withShots(P1, (point) => [
    ...point.shots,
    stroke("s-untimed", P1, null),
  ]);
  expect(shotLoopWindow(pointOf(points, P1), "s-untimed", 0)).toBeNull();
});

test("the offset is subtracted, and the start never goes below zero", () => {
  const p1 = pointOf(pointsFixture(), P1);
  const window = shotLoopWindow(p1, "s-serve", 2400);
  expect(window?.start).toBeCloseTo(72.0, 6);
  expect(window?.end).toBeCloseTo(73.1, 6);

  // An offset past the stroke itself: clamped, like `labelFilmStops`.
  const clamped = shotLoopWindow(p1, "s-serve", 2472.5);
  expect(clamped?.start).toBe(0);
  expect(clamped?.end).toBeCloseTo(0.6, 6);
  const last = shotLoopWindow(p1, "s-added", 5000);
  expect(last).toEqual({ start: 0, end: SHOT_LOOP_MIN_SECONDS });
});

test("a tiny window is held open to the floor so the loop cannot spin", () => {
  // Two strokes 0.1s apart, then a third.
  const points = withShots(P1, () => [
    stroke("s-a", P1, 100.0),
    stroke("s-b", P1, 100.1),
    stroke("s-c", P1, 101.0),
  ]);
  const p1 = pointOf(points, P1);
  const window = shotLoopWindow(p1, "s-a", 0);
  expect(window?.start).toBe(100.0);
  expect(window?.end).toBeCloseTo(100.0 + SHOT_LOOP_MIN_SECONDS, 6);
  // An ordinary gap is left exactly as labelled.
  expect(shotLoopWindow(p1, "s-b", 0)).toEqual({ start: 100.1, end: 101.0 });

  // The floor also outranks a point end that cuts the last stroke short.
  const tight = withShots(P2, () => [stroke("s-next", P2, 101.2)]);
  const tightP1 = {
    ...pointOf(tight, P1),
    shots: p1.shots,
  };
  const all = tight.map((point) => (point.id === P1 ? tightP1 : point));
  const capped = shotLoopWindow(tightP1, "s-c", 0, labelFilmStops(all, 0));
  expect(capped?.start).toBe(101.0);
  expect(capped?.end).toBeCloseTo(101.0 + SHOT_LOOP_MIN_SECONDS, 6);
});
