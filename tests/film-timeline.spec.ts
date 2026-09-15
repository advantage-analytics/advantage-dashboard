import { expect, test } from "@playwright/test";

import {
  activeStopAt,
  breakSegments,
  deadTimeJump,
  filmStops,
  nextStop,
  prevStop,
  toFilmTime,
} from "@/components/dashboard/matches/match-detail/film/film-timeline";

import { pt } from "./fixtures/film-point";

/**
 * The film room seeks the TRIMMED file while points are timed against the
 * ORIGINAL recording. On the first real match the trim started at 15.136s, so
 * every seek landed 15 seconds late and the serve was already over. These pin
 * the conversion and everything that walks the converted clock.
 */

const OFFSET = 15.136;

const points = [
  pt({ id: "a", videoTime: 18.3, duration: 16.4, gameNumber: 1 }),
  pt({ id: "b", videoTime: 65.4, duration: 5, gameNumber: 1 }),
  pt({ id: "c", videoTime: 95.7, duration: null, gameNumber: 2 }),
  pt({ id: "d", videoTime: 130, duration: null, gameNumber: 2 }),
  pt({ id: "untimed", videoTime: null }),
];

test.describe("film clock", () => {
  test("a point seeks to its film time, not its recording time", () => {
    expect(toFilmTime(18.3, OFFSET)).toBeCloseTo(3.164, 3);
    expect(toFilmTime(5, OFFSET)).toBe(0);
  });

  test("stops drop untimed points and window on duration, then next start, then a default", () => {
    const stops = filmStops(points, OFFSET);
    expect(stops.map((s) => s.point.id)).toEqual(["a", "b", "c", "d"]);
    expect(stops[0].end - stops[0].start).toBeCloseTo(16.4, 6);
    expect(stops[2].end).toBeCloseTo(stops[3].start, 6);
    expect(stops[3].end - stops[3].start).toBe(10);
  });

  test("the active stop is the last one started, with clamped progress", () => {
    const stops = filmStops(points, OFFSET);
    expect(activeStopAt(stops, 1)).toBeNull();
    // A seek that lands a few ms early still counts as reaching the point.
    expect(activeStopAt(stops, stops[0].start - 0.03)?.stop.point.id).toBe("a");
    const mid = activeStopAt(stops, stops[0].start + 8.2);
    expect(mid?.stop.point.id).toBe("a");
    expect(mid?.progress).toBeCloseTo(0.5, 6);
    const late = activeStopAt(stops, stops[1].start - 1);
    expect(late?.stop.point.id).toBe("a");
    expect(late?.progress).toBe(1);
  });

  test("next/prev step with a half-second cushion", () => {
    const stops = filmStops(points, OFFSET);
    expect(nextStop(stops, stops[0].start)?.point.id).toBe("b");
    expect(prevStop(stops, stops[1].start + 0.2)?.point.id).toBe("a");
    expect(prevStop(stops, 0)).toBeNull();
    expect(nextStop(stops, 10_000)).toBeNull();
  });

  test("dead time jumps to the next start, and only from dead time", () => {
    const stops = filmStops(points, OFFSET);
    expect(deadTimeJump(stops, stops[0].start + 2)).toBeNull();
    expect(deadTimeJump(stops, stops[0].end + 1)).toBeCloseTo(
      stops[1].start,
      6,
    );
    expect(deadTimeJump(stops, 0.5)).toBeNull();
    expect(deadTimeJump(stops, stops[3].end + 5)).toBeNull();
  });
});

test.describe("breakSegments", () => {
  test("splits where a game was broken and tiles the whole duration", () => {
    const stops = filmStops(
      [
        pt({
          id: "1",
          videoTime: 20,
          gameNumber: 1,
          serverIsPlayer1: true,
          wonByPlayer1: true,
        }),
        pt({
          id: "2",
          videoTime: 40,
          gameNumber: 1,
          serverIsPlayer1: true,
          wonByPlayer1: true,
        }),
        pt({
          id: "3",
          videoTime: 60,
          gameNumber: 2,
          serverIsPlayer1: false,
          wonByPlayer1: false,
        }),
        pt({
          id: "4",
          videoTime: 80,
          gameNumber: 2,
          serverIsPlayer1: false,
          wonByPlayer1: true,
        }),
        pt({
          id: "5",
          videoTime: 100,
          gameNumber: 3,
          serverIsPlayer1: true,
          wonByPlayer1: true,
        }),
      ],
      0,
    );
    expect(breakSegments(stops, 200)).toEqual([
      { start: 0, end: 100 },
      { start: 100, end: 200 },
    ]);
  });

  test("no breaks, no points or no duration", () => {
    expect(breakSegments([], 90)).toEqual([{ start: 0, end: 90 }]);
    expect(breakSegments([], 0)).toEqual([]);
  });
});
