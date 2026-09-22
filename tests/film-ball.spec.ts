import { expect, test } from "@playwright/test";

import {
  BALL_MATCH_TOLERANCE_SECONDS,
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
