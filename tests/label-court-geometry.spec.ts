import { expect, test } from "@playwright/test";

import {
  COURT_LENGTH,
  COURT_VIEW_BOX,
  DOUBLES_HALF_WIDTH,
  NET_Y,
  fromCourt,
  fromCourtInHalf,
  halfCourtViewBox,
  halfOf,
  otherHalf,
  toCourt,
  toCourtInHalf,
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

test.describe("the half-court zoom (board 08i)", () => {
  test("each half is a 276 × 222 window with the run-off round it", () => {
    // 4.6 m beside each doubles sideline; 3.5 m behind the baseline; the
    // rest of the height runs just past the net.
    expect(halfCourtViewBox("near")).toBe("-10.085 11.046 20.17 16.224");
    expect(halfCourtViewBox("far")).toBe("-10.085 -3.5 20.17 16.224");
    const [, , width, height] = halfCourtViewBox("near").split(" ").map(Number);
    expect(width / height).toBeCloseTo(276 / 222, 3);
  });

  test("fixed points land where the board draws them", () => {
    // Near half: net along the top, baseline 3.5 m above the bottom edge.
    const nearNet = fromCourtInHalf("near", { x: 0, y: NET_Y });
    expect(nearNet.sx).toBeCloseTo(50, 9);
    expect(nearNet.sy).toBeCloseTo(5.17, 2);
    const nearBase = fromCourtInHalf("near", { x: -DOUBLES_HALF_WIDTH, y: 0 });
    expect(nearBase.sx).toBeCloseTo(22.81, 2);
    expect(nearBase.sy).toBeCloseTo(78.43, 2);
    // Far half: the mirror — far baseline near the top, net along the bottom.
    const farBase = fromCourtInHalf("far", {
      x: DOUBLES_HALF_WIDTH,
      y: COURT_LENGTH,
    });
    expect(farBase.sx).toBeCloseTo(77.19, 2);
    expect(farBase.sy).toBeCloseTo(21.57, 2);
    expect(fromCourtInHalf("far", { x: 0, y: NET_Y }).sy).toBeCloseTo(94.83, 2);
  });

  test("the surround is court too: a corner of the box is metres off the lines", () => {
    // Bottom-left of the near half: wide of the sideline, behind the baseline.
    const out = toCourtInHalf("near", { sx: 0, sy: 100 });
    expect(out.x).toBeCloseTo(-10.085, 9);
    expect(out.y).toBeCloseTo(-3.5, 9);
    // Top-right of the far half: long and wide.
    const long = toCourtInHalf("far", { sx: 100, sy: 0 });
    expect(long.x).toBeCloseTo(10.085, 9);
    expect(long.y).toBeCloseTo(27.27, 9);
  });

  test("toCourtInHalf inverts fromCourtInHalf, both ways, in both halves", () => {
    for (const half of ["near", "far"] as const) {
      for (const point of [
        { x: 0, y: 0 },
        { x: -5.485, y: 23.77 },
        { x: 9.9, y: -3.2 },
        { x: 1.234, y: 11.885 },
      ]) {
        const back = toCourtInHalf(half, fromCourtInHalf(half, point));
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
      }
      for (const point of [
        { sx: 0, sy: 0 },
        { sx: 100, sy: 100 },
        { sx: 12.5, sy: 61.25 },
      ]) {
        const back = fromCourtInHalf(half, toCourtInHalf(half, point));
        expect(back.sx).toBeCloseTo(point.sx, 9);
        expect(back.sy).toBeCloseTo(point.sy, 9);
      }
    }
  });

  test("a y is in the near half below the net, the far half from it up", () => {
    expect(halfOf(-2)).toBe("near");
    expect(halfOf(11.88)).toBe("near");
    expect(halfOf(NET_Y)).toBe("far");
    expect(halfOf(24)).toBe("far");
    expect(otherHalf("near")).toBe("far");
    expect(otherHalf("far")).toBe("near");
  });
});
