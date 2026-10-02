import { expect, test } from "@playwright/test";

import {
  BALL_PATHS_VERSION,
  deriveBallPaths,
} from "@/lib/services/splitstep/derivation";

/**
 * Node-style tests for the ball-path derivation: no browser, no fixtures on
 * disk. Every fixture is inline and small enough to work out by hand.
 *
 * The clock used throughout: strokes at trimmed frames 0 / 30 / 60 with video
 * times 100 / 101 / 102, i.e. 30 fps with a 100 s trim offset, so the fitted
 * line is t = 100 + frame / 30.
 */

const STROKES = [
  { trimmedFrame: 0, videoTime: 100 },
  { trimmedFrame: 30, videoTime: 101 },
  { trimmedFrame: 60, videoTime: 102 },
];

function row(
  strokeFrame: number,
  frame: number,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) {
  return {
    stroke_frame: strokeFrame,
    bounce_frame: -9999,
    frame,
    ball_x_px: 640,
    ball_y_px: 360,
    ball_x_m: x,
    ball_y_m: y,
    ball_z_m: 1,
    ...extra,
  };
}

test.describe("deriveBallPaths — shape and clock", () => {
  test("throws on a non-array payload, as parseStrokes does", () => {
    expect(() => deriveBallPaths({ rows: [] }, STROKES)).toThrow();
    expect(() => deriveBallPaths(null, STROKES)).toThrow();
  });

  test("version is 1", () => {
    expect(BALL_PATHS_VERSION).toBe(1);
    expect(deriveBallPaths([], STROKES)).toEqual({ version: 1, strokes: [] });
  });

  test("frame 45 lands at t = 101.5 and the vendor baseline becomes y 0", () => {
    const out = deriveBallPaths(
      [
        row(30, 30, 1.234, -11.885),
        row(30, 45, 0, 0.115),
        row(30, 58, -2, 5.115),
      ],
      // A sentinel frame must not drag the fit.
      [...STROKES, { trimmedFrame: -9999, videoTime: 5 }],
    );
    expect(out.strokes).toHaveLength(1);
    expect(out.strokes[0].path).toEqual([
      [101, 1.23, 0, 1],
      [101.5, 0, 12, 1],
      [101.93, -2, 17, 1],
    ]);
  });

  test("fewer than two distinct stroke frames returns no strokes", () => {
    const rows = [row(30, 30, 0, 0), row(30, 45, 0, 1)];
    const empty = { version: 1, strokes: [] };
    expect(deriveBallPaths(rows, [])).toEqual(empty);
    expect(deriveBallPaths(rows, [STROKES[1]])).toEqual(empty);
    expect(deriveBallPaths(rows, [STROKES[1], { ...STROKES[1] }])).toEqual(
      empty,
    );
    expect(
      deriveBallPaths(rows, [
        STROKES[1],
        { trimmedFrame: -9999, videoTime: 0 },
      ]),
    ).toEqual(empty);
  });

  test("contactTime is the stroke's own videoTime, not the fitted value", () => {
    const out = deriveBallPaths(
      [row(30, 30, 0, 0)],
      [STROKES[0], { trimmedFrame: 30, videoTime: 101.004 }, STROKES[2]],
    );
    expect(out.strokes[0].contactTime).toBe(101.004);
    // The fitted time of frame 30 is 101.0013…, which rounds to 101.
    expect(out.strokes[0].path[0][0]).toBe(101);
  });

  test("bounceTime is the fitted bounce frame, or null", () => {
    const bounceOf = (bounce: Record<string, unknown>) =>
      deriveBallPaths([row(30, 30, 0, 0, bounce)], STROKES).strokes[0]
        .bounceTime;

    expect(bounceOf({ bounce_frame: 50 })).toBe(101.67);
    expect(bounceOf({ bounce_frame: -9999 })).toBeNull();
    expect(bounceOf({ bounce_frame: undefined })).toBeNull();
    expect(bounceOf({ bounce_frame: 29 })).toBeNull();
  });
});

test.describe("deriveBallPaths — joining and dropping", () => {
  test("a stroke with no trajectory rows is omitted: exactly one entry", () => {
    const out = deriveBallPaths(
      [row(30, 30, 0, -5), row(30, 40, 0, 5)],
      [STROKES[0], STROKES[1]],
    );
    expect(out.strokes).toHaveLength(1);
    expect(out.strokes[0].contactTime).toBe(101);
  });

  test("a group matching no stroke is omitted", () => {
    const out = deriveBallPaths(
      [row(17, 17, 0, 0), row(30, 30, 0, 0)],
      STROKES,
    );
    expect(out.strokes.map((s) => s.contactTime)).toEqual([101]);
  });

  test("non-finite and implausible rows are dropped; missing z becomes 0", () => {
    const out = deriveBallPaths(
      [
        row(30, 30, 0, 0.115, { ball_z_m: undefined }),
        row(30, 33, null as unknown as number, 0),
        row(30, 36, 0, Number.NaN),
        row(30, 39, 0, 371.7),
        row(30, 42, 9.5, 0),
        row(30, 45, 0, 1.115),
      ],
      STROKES,
    );
    expect(out.strokes[0].path).toEqual([
      [101, 0, 12, 0],
      [101.5, 0, 13, 1],
    ]);
  });

  test("strokes come back sorted by contactTime, paths by t", () => {
    const out = deriveBallPaths(
      [row(60, 70, 0, 2), row(60, 60, 0, 1), row(0, 9, 0, 1), row(0, 0, 0, 0)],
      STROKES,
    );
    expect(out.strokes.map((s) => s.contactTime)).toEqual([100, 102]);
    expect(out.strokes[1].path.map((s) => s[0])).toEqual([102, 102.33]);
  });
});

test.describe("deriveBallPaths — downsampling", () => {
  // One stroke, 47 rows at 30 fps: frames 30…76, bouncing on frame 50.
  // y is chosen so the court-frame value is a round number: 2 at the first
  // row, 10 on the bounce, 20.4 at the last.
  const rows = Array.from({ length: 47 }, (_, i) =>
    row(30, 30 + i, 1.234, -9.885 + i * 0.4, {
      bounce_frame: 50,
      ball_z_m: 30 + i === 50 ? 0.01 : 1.5,
    }),
  );
  const [stroke] = deriveBallPaths(rows, STROKES).strokes;

  test("thins 47 rows to at most 20 samples", () => {
    expect(stroke.path.length).toBeLessThanOrEqual(20);
    expect(stroke.path.length).toBeGreaterThan(10);
  });

  test("starts on the first row and ends on the last", () => {
    expect(stroke.path[0]).toEqual([101, 1.23, 2, 1.5]);
    expect(stroke.path[stroke.path.length - 1]).toEqual([
      102.53, 1.23, 20.4, 1.5,
    ]);
  });

  test("keeps the bounce row's position", () => {
    expect(stroke.bounceTime).toBe(101.67);
    expect(stroke.path).toContainEqual([101.67, 1.23, 10, 0.01]);
  });

  test("kept samples are ≥ 0.1 s apart, bar the three forced rows", () => {
    const forced = new Set([101, 101.67, 102.53]);
    for (let i = 1; i < stroke.path.length; i += 1) {
      const t = stroke.path[i][0];
      if (forced.has(t)) continue;
      expect(t - stroke.path[i - 1][0]).toBeGreaterThanOrEqual(0.1 - 1e-9);
    }
  });
});
