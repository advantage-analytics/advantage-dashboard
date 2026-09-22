import { expect, test } from "@playwright/test";

import {
  BALL_MATCH_TOLERANCE_SECONDS,
  BALL_TAIL_SECONDS,
  ballAt,
  bounceTimesByShot,
  filmBallPaths,
  parseBallPathsFile,
  type FilmBallPath,
} from "@/components/dashboard/matches/match-detail/film/film-ball";
import type { FilmClock } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import type { BallPathsFile } from "@/lib/services/splitstep/derivation/ball-paths";

/**
 * The two clocks. The file's times are SOURCE-video seconds; everything the
 * room compares against is film seconds. `filmBallPaths` is the one conversion,
 * and `bounceTimesByShot` works entirely on the film clock afterwards.
 */

const CLOCK: FilmClock = { offset: 30, duration: null };

const file = (strokes: BallPathsFile["strokes"]): BallPathsFile => ({
  version: 1,
  strokes,
});

const stroke = (
  contactTime: number,
  bounceTime: number | null,
  path: BallPathsFile["strokes"][number]["path"] = [],
) => ({ contactTime, bounceTime, path });

test("filmBallPaths moves contact, bounce and every sample onto the film clock", () => {
  const paths = filmBallPaths(
    file([
      stroke(130, 130.7, [
        [130, 1.2, 4, 1.1],
        [130.5, 0.4, 10, 0.9],
        [130.7, 0.1, 12.5, 0.05],
      ]),
    ]),
    CLOCK,
  );

  expect(paths).toHaveLength(1);
  expect(paths[0].contactTime).toBeCloseTo(100, 6);
  expect(paths[0].bounceTime).toBeCloseTo(100.7, 6);
  const times = paths[0].path.map((s) => s[0]);
  expect(times).toHaveLength(3);
  [100, 100.5, 100.7].forEach((expected, i) =>
    expect(times[i]).toBeCloseTo(expected, 6),
  );
  // Only `t` moves; the metres are untouched.
  expect(paths[0].path[1].slice(1)).toEqual([0.4, 10, 0.9]);
});

test("filmBallPaths does not clamp at film zero", () => {
  // A path the trim cut away converts negative. Clamping would stack its
  // leading samples on 0 and draw a ball frozen at the first frame.
  const paths = filmBallPaths(
    file([
      stroke(29, 29.6, [
        [29, 0, 0, 1],
        [29.6, 0, 5, 0.1],
      ]),
    ]),
    CLOCK,
  );
  expect(paths[0].contactTime).toBeCloseTo(-1, 6);
  expect(paths[0].bounceTime).toBeCloseTo(-0.4, 6);
  const times = paths[0].path.map((s) => s[0]);
  expect(times[0]).toBeCloseTo(-1, 6);
  expect(times[1]).toBeCloseTo(-0.4, 6);
});

test("filmBallPaths keeps a null bounce null", () => {
  const paths = filmBallPaths(file([stroke(130, null)]), CLOCK);
  expect(paths[0].bounceTime).toBeNull();
});

test("parseBallPathsFile accepts a version 1 file with an array of strokes", () => {
  const parsed = parseBallPathsFile({ version: 1, strokes: [stroke(1, 2)] });
  expect(parsed?.version).toBe(1);
  expect(parsed?.strokes).toHaveLength(1);
});

test("parseBallPathsFile answers null for anything malformed", () => {
  expect(parseBallPathsFile({ version: 2, strokes: [] })).toBeNull();
  expect(parseBallPathsFile({ version: 1, strokes: "x" })).toBeNull();
  expect(parseBallPathsFile(null)).toBeNull();
  expect(parseBallPathsFile(undefined)).toBeNull();
  expect(parseBallPathsFile("{}")).toBeNull();
  expect(parseBallPathsFile({})).toBeNull();
});

const filmPaths = (...strokes: FilmBallPath[]) => strokes;
const path = (
  contactTime: number,
  bounceTime: number | null,
): FilmBallPath => ({
  contactTime,
  bounceTime,
  path: [],
});

test("a shot inside the tolerance matches and one outside it does not", () => {
  expect(BALL_MATCH_TOLERANCE_SECONDS).toBe(0.15);
  const paths = filmPaths(path(100, 100.7));

  expect(bounceTimesByShot([{ id: "in", start: 100.1 }], paths).get("in")).toBe(
    100.7,
  );
  expect(bounceTimesByShot([{ id: "out", start: 100.2 }], paths).size).toBe(0);
});

test("two shots either side of one path give one entry, for the nearer", () => {
  const paths = filmPaths(path(100, 100.7));
  const map = bounceTimesByShot(
    [
      { id: "far", start: 99.9 },
      { id: "near", start: 100.05 },
    ],
    paths,
  );
  expect(map.size).toBe(1);
  expect(map.get("near")).toBe(100.7);
});

test("a path with a null bounce time yields no entry", () => {
  const map = bounceTimesByShot(
    [{ id: "s1", start: 100 }],
    filmPaths(path(100, null)),
  );
  expect(map.size).toBe(0);
});

test("each shot takes its own nearest path", () => {
  const map = bounceTimesByShot(
    [
      { id: "a", start: 100 },
      { id: "b", start: 101.4 },
    ],
    filmPaths(path(101.42, 102.1), path(100.01, 100.6)),
  );
  expect(map.get("a")).toBe(100.6);
  expect(map.get("b")).toBe(102.1);
});

test("a shot with no path in range is simply absent", () => {
  const map = bounceTimesByShot(
    [
      { id: "a", start: 100 },
      { id: "b", start: 140 },
    ],
    filmPaths(path(100, 100.6)),
  );
  expect(map.has("b")).toBe(false);
  expect(map.size).toBe(1);
});

test("the whole pipeline: file times match shots on the film clock", () => {
  const parsed = parseBallPathsFile({
    version: 1,
    strokes: [stroke(130, 130.7, [[130, 0, 0, 1]]), stroke(133, null)],
  });
  expect(parsed).not.toBeNull();
  const map = bounceTimesByShot(
    [
      { id: "s1", start: 100.02 },
      { id: "s2", start: 103 },
    ],
    filmBallPaths(parsed!, CLOCK),
  );
  expect(map.get("s1")).toBeCloseTo(100.7, 6);
  expect(map.has("s2")).toBe(false);
});

/**
 * ── `ballAt`: where the ball is at one instant ──────────────────────────────
 *
 * Everything below is on the FILM clock already — `filmBallPaths` did the one
 * conversion, and these build paths directly. `flight` takes samples as
 * `[t, x, y]`; the height is carried but never drawn, so it is a constant here.
 */
const flight = (samples: [number, number, number][]): FilmBallPath => ({
  contactTime: samples[0][0],
  bounceTime: null,
  path: samples.map(
    ([t, x, y]) => [t, x, y, 1] as [number, number, number, number],
  ),
});

const TWO_SAMPLES = flight([
  [10, 0, 0],
  [11, 2, 4],
]);

test("the tail window is 0.4s", () => {
  expect(BALL_TAIL_SECONDS).toBe(0.4);
});

test("ballAt interpolates between the two samples that bracket the time", () => {
  const at = ballAt([TWO_SAMPLES], 10.5);
  expect(at).not.toBeNull();
  expect(at!.x).toBeCloseTo(1, 6);
  expect(at!.y).toBeCloseTo(2, 6);
});

test("ballAt is null outside the path's own span", () => {
  expect(ballAt([TWO_SAMPLES], 9.9)).toBeNull();
  expect(ballAt([TWO_SAMPLES], 11.01)).toBeNull();
});

test("the tail is the samples in the window, oldest first, then the head", () => {
  const at = ballAt([TWO_SAMPLES], 10.2);
  expect(at).not.toBeNull();
  // The window is [9.8, 10.2]: the t=10 sample, and the interpolated head.
  expect(at!.tail).toHaveLength(2);
  expect(at!.tail[0].x).toBeCloseTo(0, 6);
  expect(at!.tail[0].y).toBeCloseTo(0, 6);
  expect(at!.tail[1].x).toBeCloseTo(at!.x, 6);
  expect(at!.tail[1].y).toBeCloseTo(at!.y, 6);
});

/**
 * The 10.95 case, and the one place T22's pinned numbers disagree with T22's
 * own rule.
 *
 * The task pins "for a path with samples at 10.0, 10.3, 10.6 and 10.9, the
 * tail at 10.95 starts at the 10.6 sample" — but it also pins that the result
 * is null outside a path's first-to-last span, and 10.95 is past 10.9. Read
 * literally the two cannot both hold. The RULE wins (the alternative is a ball
 * that hangs in the air after its flight's last measured frame, which is what
 * the "null outside every path" line exists to prevent), so the window
 * arithmetic is pinned here with 10.95 INSIDE the span: one more sample at
 * 11.2, nothing else changed. The tail still starts at 10.6, which is the
 * number the task was actually pinning — 10.95 − 0.4 = 10.55.
 */
test("the tail reaches back 0.4s and no further", () => {
  const at = ballAt(
    [
      flight([
        [10.0, 0, 0],
        [10.3, 1, 1],
        [10.6, 2, 2],
        [10.9, 3, 3],
        [11.2, 4, 4],
      ]),
    ],
    10.95,
  );
  expect(at).not.toBeNull();
  // 10.95 − 0.4 = 10.55, so the 10.6 sample is the first one inside it.
  expect(at!.tail[0].x).toBeCloseTo(2, 6);
  expect(at!.tail[0].y).toBeCloseTo(2, 6);
  // And the window ends at the head: 10.6, 10.9, then the interpolated point.
  expect(at!.tail).toHaveLength(3);
});

test("a time past the last sample is null, not the last sample held", () => {
  const at = ballAt(
    [
      flight([
        [10.0, 0, 0],
        [10.9, 3, 3],
      ]),
    ],
    10.95,
  );
  expect(at).toBeNull();
});

test("between two paths there is no ball at all", () => {
  const paths = [
    flight([
      [10, 0, 0],
      [11, 2, 4],
    ]),
    flight([
      [13, 2, 4],
      [14, 0, 0],
    ]),
  ];
  expect(ballAt(paths, 12)).toBeNull();
});

test("the tail never reaches into the path before it", () => {
  const paths = [
    flight([
      [10, -5, -5],
      [10.9, -5, -5],
    ]),
    flight([
      [11, 1, 1],
      [11.4, 2, 2],
    ]),
  ];
  const at = ballAt(paths, 11.1);
  expect(at).not.toBeNull();
  // Every tail point belongs to the second flight, though the first one's
  // last sample (at 10.9) is inside the 0.4s window.
  at!.tail.forEach((point) => {
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
  });
});

test("where two paths overlap at a contact, the later one wins", () => {
  const paths = [
    flight([
      [10, -3, -3],
      [10.5, -3, -3],
    ]),
    flight([
      [10.4, 7, 7],
      [11, 7, 7],
    ]),
  ];
  const at = ballAt(paths, 10.45);
  expect(at).not.toBeNull();
  expect(at!.x).toBeCloseTo(7, 6);
});

test("ballAt answers null for no paths and for a time that is not a number", () => {
  expect(ballAt([], 10)).toBeNull();
  expect(ballAt([TWO_SAMPLES], Number.NaN)).toBeNull();
});
