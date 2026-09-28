import { expect, test } from "@playwright/test";

import {
  COURT_LENGTH,
  COURT_VIEW_BOX,
  DOUBLES_HALF_WIDTH,
  NET_Y,
  fromCourt,
  toCourt,
} from "@/components/admin/labels/court-geometry";

/**
 * The labelling console's court frame (T5): metres in the `label_shots`
 * frame (x lateral from the centre line, y from the NEAR baseline) against
 * percent of board 08's art box, near baseline at the bottom.
 */

test("the art box is board 08's viewBox", () => {
  expect(COURT_VIEW_BOX).toBe("-6.2 -2.1 12.4 27.97");
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
  // Near baseline corners, at the bottom: 2.1 m of apron below them.
  close(
    fromCourt({ x: -DOUBLES_HALF_WIDTH, y: 0 }),
    (0.715 / 12.4) * 100,
    (25.87 / 27.97) * 100,
  );
  close(
    fromCourt({ x: DOUBLES_HALF_WIDTH, y: 0 }),
    100 - (0.715 / 12.4) * 100,
    (25.87 / 27.97) * 100,
  );
  // Far baseline centre, at the top.
  close(fromCourt({ x: 0, y: COURT_LENGTH }), 50, (2.1 / 27.97) * 100);
  // The box's own corners.
  close(fromCourt({ x: -6.2, y: 25.87 }), 0, 0);
  close(fromCourt({ x: 6.2, y: -2.1 }), 100, 100);
  // A board mark: a serve hit at (-0.80, -0.32) sits at 43.55% / 93.64%.
  const serve = fromCourt({ x: -0.8, y: -0.32 });
  expect(serve.sx).toBeCloseTo(43.55, 2);
  expect(serve.sy).toBeCloseTo(93.64, 2);
});

test("toCourt inverts fromCourt, both ways", () => {
  const metres = [
    { x: 0, y: 0 },
    { x: -5.485, y: 23.77 },
    { x: 3.2, y: 17.79 },
    { x: -6.2, y: -2.1 },
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
