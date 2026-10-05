import { expect, test } from "@playwright/test";

import {
  COURT_LENGTH,
  COURT_VIEW_BOX,
  DOUBLES_HALF_WIDTH,
  NET_Y,
  fromCourt,
  toCourt,
  turnScreen,
} from "@/components/admin/labels/court-geometry";

/**
 * The labelling console's court frame (T5): metres in the `label_shots`
 * frame (x lateral from the centre line, y from the NEAR baseline) against
 * percent of board 08's art box, near baseline at the bottom.
 */

test("the art box is board 08's viewBox", () => {
  expect(COURT_VIEW_BOX).toBe("-7.265 -4.5 14.53 32.77");
});

test("fixed points land where the board draws them", () => {
  const close = (
    actual: { sx: number; sy: number },
    sx: number,
    sy: number,
  ) => {
    expect(actual.sx).toBeCloseTo(sx, 6);
    expect(actual.sy).toBeCloseTo(sy, 6);
  };

  // Net centre: dead centre of the box.
  close(fromCourt({ x: 0, y: NET_Y }), 50, 50);
  // Near baseline corners, at the bottom: 4.5 m of apron below them.
  close(
    fromCourt({ x: -DOUBLES_HALF_WIDTH, y: 0 }),
    (1.78 / 14.53) * 100,
    (28.27 / 32.77) * 100,
  );
  close(
    fromCourt({ x: DOUBLES_HALF_WIDTH, y: 0 }),
    100 - (1.78 / 14.53) * 100,
    (28.27 / 32.77) * 100,
  );
  // Far baseline centre, at the top.
  close(fromCourt({ x: 0, y: COURT_LENGTH }), 50, (4.5 / 32.77) * 100);
  // The box's own corners.
  close(fromCourt({ x: -7.265, y: 28.27 }), 0, 0);
  close(fromCourt({ x: 7.265, y: -4.5 }), 100, 100);
  // A hit 3.65 m behind the near baseline — the depth that used to clip —
  // is inside the box.
  expect(fromCourt({ x: 0, y: -3.65 }).sy).toBeLessThan(100);
  // A serve hit at (-0.80, -0.32) sits at 44.49% / 87.24%.
  const serve = fromCourt({ x: -0.8, y: -0.32 });
  expect(serve.sx).toBeCloseTo(44.49, 2);
  expect(serve.sy).toBeCloseTo(87.24, 2);
});

test("toCourt inverts fromCourt, both ways", () => {
  const metres = [
    { x: 0, y: 0 },
    { x: -5.485, y: 23.77 },
    { x: 3.2, y: 17.79 },
    { x: -7.265, y: -4.5 },
    { x: 1.234, y: 11.885 },
  ];
  for (const point of metres) {
    const back = toCourt(fromCourt(point));
    expect(back.x).toBeCloseTo(point.x, 9);
    expect(back.y).toBeCloseTo(point.y, 9);
  }

  const percents = [
    { sx: 0, sy: 0 },
    { sx: 100, sy: 100 },
    { sx: 43.55, sy: 93.64 },
    { sx: 12.5, sy: 61.25 },
  ];
  for (const point of percents) {
    const back = fromCourt(toCourt(point));
    expect(back.sx).toBeCloseTo(point.sx, 9);
    expect(back.sy).toBeCloseTo(point.sy, 9);
  }
});

test.describe("the court the other way up (Flip side)", () => {
  test("turnScreen is half a turn about the box's centre, and its own inverse", () => {
    expect(turnScreen({ sx: 0, sy: 0 })).toEqual({ sx: 100, sy: 100 });
    expect(turnScreen({ sx: 50, sy: 50 })).toEqual({ sx: 50, sy: 50 });
    expect(turnScreen({ sx: 12.5, sy: 61.25 })).toEqual({
      sx: 87.5,
      sy: 38.75,
    });
    for (const point of [
      { sx: 0, sy: 0 },
      { sx: 100, sy: 100 },
      { sx: 12.5, sy: 61.25 },
    ]) {
      expect(turnScreen(turnScreen(point))).toEqual(point);
    }
  });

  test("turned, the near baseline is at the top and the net stays put", () => {
    const base = turnScreen(fromCourt({ x: 0, y: 0 }));
    expect(base.sy).toBeCloseTo(13.73, 2);
    const net = turnScreen(fromCourt({ x: 0, y: NET_Y }));
    expect(net.sx).toBeCloseTo(50, 9);
    expect(net.sy).toBeCloseTo(50, 9);
    // A click at the top of a turned box reads as the near apron.
    expect(toCourt(turnScreen({ sx: 50, sy: 0 })).y).toBeCloseTo(-4.5, 9);
  });
});
