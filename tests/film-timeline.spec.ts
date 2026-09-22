import { expect, test } from "@playwright/test";

import {
  activeStopAt,
  setSegments,
  deadTimeJump,
  filmClock,
  filmStops,
  nextStop,
  playingStopAt,
  POINT_BUFFER_SECONDS,
  prevStop,
  toFilmTime,
  toPointTime,
  type FilmClock,
} from "@/components/dashboard/matches/match-detail/film/film-timeline";

import { pt } from "./fixtures/film-point";

/**
 * The film room seeks the file we serve while points are timed against another
 * clock entirely. Two lineages arrive here and both must land on the serve:
 *
 * - **Advantage Intelligence.** On the first real match the trim started at
 *   15.136s, so every seek landed 15 seconds late and the serve was already
 *   over. The offset is zero or positive and the file's length is unmeasured.
 * - **A SwingVision attachment.** The offset is
 *   `firstPointSourceTime - confirmedVideoTime`, NEGATIVE whenever the camera
 *   was rolling before the first point, and the file's length is server-
 *   verified.
 *
 * These pin the conversion, the bounds it respects, and everything that walks
 * the converted clock.
 */

/** Legacy lineage: positive trim offset, nothing measured. */
const PROVIDER: FilmClock = { offset: 15.136, duration: null };

/** Our own upload, already on the analysis clock. */
const LEGACY_ZERO: FilmClock = { offset: 0, duration: null };

/**
 * An attachment whose camera started 42.5s before the source clock's first
 * point, in a file measured at 600s.
 */
const ATTACHED: FilmClock = { offset: -42.5, duration: 600 };

const points = [
  pt({ id: "a", videoTime: 18.3, duration: 16.4, gameNumber: 1 }),
  pt({ id: "b", videoTime: 65.4, duration: 5, gameNumber: 1 }),
  pt({ id: "c", videoTime: 95.7, duration: null, gameNumber: 2 }),
  pt({ id: "d", videoTime: 130, duration: null, gameNumber: 2 }),
  pt({ id: "untimed", videoTime: null }),
];

test.describe("film clock", () => {
  test("a point seeks to its film time, not its recording time", () => {
    expect(toFilmTime(18.3, PROVIDER)).toBeCloseTo(3.164, 3);
    expect(toFilmTime(5, PROVIDER)).toBe(0);
  });

  test("stops drop untimed points and window on duration, then next start, then a default", () => {
    const stops = filmStops(points, PROVIDER);
    expect(stops.map((s) => s.point.id)).toEqual(["a", "b", "c", "d"]);
    // 1.5s before serve contact, 1.5s after the point's own end.
    expect(stops[0].start).toBeCloseTo(3.164 - 1.5, 3);
    expect(stops[0].end - stops[0].start).toBeCloseTo(16.4 + 3, 6);
    expect(stops[2].end).toBeCloseTo(stops[3].start, 6);
    expect(stops[3].end - stops[3].start).toBeCloseTo(10 + 3, 6);
  });

  test("the buffer never runs before film zero or into the next point", () => {
    const stops = filmStops(
      [
        pt({ id: "early", videoTime: 16, duration: 2, gameNumber: 1 }),
        pt({ id: "close", videoTime: 20, duration: 1, gameNumber: 1 }),
      ],
      PROVIDER,
    );
    expect(stops[0].start).toBe(0);
    // early ends at 0.864 + 2 + 1.5 = 4.364, but close opens at 4.864 - 1.5.
    expect(stops[0].end).toBeCloseTo(stops[1].start, 6);
  });

  test("the active stop is the last one started, with clamped progress", () => {
    const stops = filmStops(points, PROVIDER);
    expect(activeStopAt(stops, 1)).toBeNull();
    // A seek that lands a few ms early still counts as reaching the point.
    expect(activeStopAt(stops, stops[0].start - 0.03)?.stop.point.id).toBe("a");
    const mid = activeStopAt(stops, stops[0].start + 9.7);
    expect(mid?.stop.point.id).toBe("a");
    expect(mid?.progress).toBeCloseTo(0.5, 6);
    const late = activeStopAt(stops, stops[1].start - 1);
    expect(late?.stop.point.id).toBe("a");
    expect(late?.progress).toBe(1);
  });

  test("next/prev step with a half-second cushion", () => {
    const stops = filmStops(points, PROVIDER);
    expect(nextStop(stops, stops[0].start)?.point.id).toBe("b");
    expect(prevStop(stops, stops[1].start + 0.2)?.point.id).toBe("a");
    expect(prevStop(stops, 0)).toBeNull();
    expect(nextStop(stops, 10_000)).toBeNull();
  });

  test("dead time jumps to the next start, and only from dead time", () => {
    const stops = filmStops(points, PROVIDER);
    expect(deadTimeJump(stops, stops[0].start + 2)).toBeNull();
    expect(deadTimeJump(stops, stops[0].end + 1)).toBeCloseTo(
      stops[1].start,
      6,
    );
    expect(deadTimeJump(stops, 0.5)).toBeNull();
    expect(deadTimeJump(stops, stops[3].end + 5)).toBeNull();
  });
});

/**
 * Between points (R7) the room says nothing: no point name, no position
 * counter, no lit row, an empty court. `activeStopAt` cannot express that — it
 * keeps the last point reached forever — so `playingStopAt` walks the same
 * windows and reports containment alone. These pin the four shapes the film
 * actually produces, including the one where there is no gap to find.
 */
test.describe("playingStopAt", () => {
  const stops = filmStops(points, PROVIDER);

  test("inside a point's window, it is that point", () => {
    expect(playingStopAt(stops, stops[0].start + 5)?.point.id).toBe("a");
    expect(playingStopAt(stops, stops[1].start + 1)?.point.id).toBe("b");
    // A seek that lands a few ms early is still inside the point, exactly as
    // it is for `activeStopAt`.
    expect(playingStopAt(stops, stops[0].start - 0.03)?.point.id).toBe("a");
  });

  test("the gap after a point belongs to no point", () => {
    // a's window closes at 21.06s and b's opens at 48.76s: real dead time.
    expect(playingStopAt(stops, stops[0].end + 1)).toBeNull();
    expect(playingStopAt(stops, stops[1].start - 2)).toBeNull();
    // …where `activeStopAt` still names the point just played, which is what
    // keeps the board's score on screen through the changeover.
    expect(activeStopAt(stops, stops[0].end + 1)?.stop.point.id).toBe("a");
  });

  test("before the first point there is no point", () => {
    expect(playingStopAt(stops, 0)).toBeNull();
    expect(playingStopAt(stops, stops[0].start - 1)).toBeNull();
    expect(playingStopAt([], 12)).toBeNull();
  });

  test("windows that touch never read as between points", () => {
    // c has no recorded duration, so its window is clamped to d's start and
    // there is no second of film between them to fall through.
    expect(stops[2].end).toBeCloseTo(stops[3].start, 6);
    expect(playingStopAt(stops, stops[2].end - 0.001)?.point.id).toBe("c");
    expect(playingStopAt(stops, stops[2].end)?.point.id).toBe("d");
    for (let t = stops[2].start; t < stops[3].end; t += 0.25) {
      expect(playingStopAt(stops, t), `at ${t}`).not.toBeNull();
    }
  });
});

/**
 * The offset is subtracted ONCE. A second application is the classic failure
 * here — it does not crash, it just puts every seek at twice the error — so
 * each of these names the doubled value it must not be.
 */
test.describe("the offset is applied exactly once", () => {
  test("a positive offset lands on the serve, not twice past it", () => {
    const stops = filmStops([pt({ id: "a", videoTime: 100 })], PROVIDER);
    expect(stops[0].serve).toBeCloseTo(84.864, 6);
    expect(stops[0].serve).not.toBeCloseTo(100 - 2 * 15.136, 6);
  });

  test("a negative offset lands on the serve, not twice past it", () => {
    const stops = filmStops([pt({ id: "a", videoTime: 100 })], ATTACHED);
    expect(stops[0].serve).toBeCloseTo(142.5, 6);
    expect(stops[0].serve).not.toBeCloseTo(100 + 2 * 42.5, 6);
  });

  test("the window's edges come off the converted serve, never a second conversion", () => {
    const stops = filmStops(
      [pt({ id: "a", videoTime: 100, duration: 8 })],
      ATTACHED,
    );
    const { serve, start, end } = stops[0];
    expect(start).toBeCloseTo(serve - POINT_BUFFER_SECONDS, 6);
    expect(end).toBeCloseTo(serve + 8 + POINT_BUFFER_SECONDS, 6);
  });

  test("point → film → point is the identity inside the film", () => {
    for (const clock of [PROVIDER, LEGACY_ZERO, ATTACHED]) {
      expect(toPointTime(toFilmTime(120, clock), clock)).toBeCloseTo(120, 6);
    }
  });

  test("a correction is computed from the source again, never compounded", () => {
    // Someone re-confirms the serve 2.5s earlier in the file, then puts the
    // alignment back. Two corrections that land on the same video position
    // must give the same times — otherwise the whole match drifts a little
    // further every time somebody nudges it.
    const nudged: FilmClock = { offset: -40, duration: 600 };
    const first = filmStops(points, ATTACHED);
    const corrected = filmStops(points, nudged);
    const restored = filmStops(points, ATTACHED);

    expect(corrected[0].serve).toBeCloseTo(18.3 + 40, 6);
    expect(corrected[0].serve - first[0].serve).toBeCloseTo(-2.5, 6);
    expect(restored.map((s) => s.serve)).toEqual(first.map((s) => s.serve));
    expect(restored.map((s) => s.start)).toEqual(first.map((s) => s.start));
    expect(restored.map((s) => s.end)).toEqual(first.map((s) => s.end));
  });

  test("the source rows are never rewritten", () => {
    const source = points.map((p) => ({ ...p }));
    filmStops(points, ATTACHED);
    expect(points.map((p) => p.videoTime)).toEqual(
      source.map((p) => p.videoTime),
    );
    expect(points.map((p) => p.duration)).toEqual(
      source.map((p) => p.duration),
    );
  });
});

test.describe("a negative attachment offset", () => {
  test("every window sits later in the film than its source time", () => {
    const stops = filmStops(points, ATTACHED);
    expect(stops.map((s) => s.point.id)).toEqual(["a", "b", "c", "d"]);
    expect(stops[0].serve).toBeCloseTo(60.8, 6);
    expect(stops[0].start).toBeCloseTo(59.3, 6);
    expect(stops[0].end).toBeCloseTo(60.8 + 16.4 + 1.5, 6);
    // No window opens at zero: the lead-in the camera caught is real footage.
    expect(stops.every((s) => s.start > 0)).toBe(true);
  });

  test("active row, next/previous and dead time all walk the shifted windows", () => {
    const stops = filmStops(points, ATTACHED);
    expect(activeStopAt(stops, 10)).toBeNull();
    expect(activeStopAt(stops, stops[1].start + 1)?.stop.point.id).toBe("b");
    expect(nextStop(stops, stops[0].start)?.point.id).toBe("b");
    expect(prevStop(stops, stops[2].start)?.point.id).toBe("b");
    expect(deadTimeJump(stops, stops[0].end + 2)).toBeCloseTo(
      stops[1].start,
      6,
    );
  });

  test("a point before frame one is pulled back to the start of the film", () => {
    // A correction that pushes the alignment past an early point: it has
    // nowhere earlier to go, so it sits on the first frame rather than at a
    // negative currentTime.
    const stops = filmStops([pt({ id: "a", videoTime: 4, duration: 3 })], {
      offset: 12,
      duration: 600,
    });
    expect(stops[0].serve).toBe(0);
    expect(stops[0].start).toBe(0);
  });
});

test.describe("video bounds", () => {
  test("a padded window never runs past the verified duration", () => {
    const stops = filmStops(
      [pt({ id: "last", videoTime: 552, duration: 12 })],
      ATTACHED,
    );
    // Serve at 594.5, so the run-out would reach 608 in a 600s file.
    expect(stops[0].serve).toBeCloseTo(594.5, 6);
    expect(stops[0].end).toBe(600);
    expect(stops[0].start).toBeCloseTo(593, 6);
  });

  test("the assumed window for an untimed-length final point is bounded too", () => {
    const stops = filmStops([pt({ id: "last", videoTime: 555 })], ATTACHED);
    // 597.5 + 10 + 1.5 would be 609.
    expect(stops[0].end).toBe(600);
  });

  test("a source time past the last frame, within alignment tolerance, sits on it", () => {
    expect(toFilmTime(557.55, ATTACHED)).toBe(600);
    const stops = filmStops([pt({ id: "edge", videoTime: 557.55 })], ATTACHED);
    expect(stops[0].serve).toBe(600);
    expect(stops[0].start).toBeCloseTo(598.5, 6);
    // Never inverted, even against the final frame.
    expect(stops[0].end).toBeGreaterThanOrEqual(stops[0].start);
    expect(stops[0].end).toBe(600);
  });

  test("an unmeasured film is unbounded — the legacy path is untouched", () => {
    const [bounded] = filmStops(
      [pt({ id: "last", videoTime: 552, duration: 12 })],
      ATTACHED,
    );
    const [unbounded] = filmStops(
      [pt({ id: "last", videoTime: 552, duration: 12 })],
      { offset: -42.5, duration: null },
    );
    expect(bounded.end).toBe(600);
    expect(unbounded.end).toBeCloseTo(594.5 + 12 + 1.5, 6);
  });
});

test.describe("filtered and saved cuts", () => {
  /** What `film-tab.tsx` builds for `walkStops`: the same stops, fewer rows. */
  const walk = (ids: string[]) =>
    filmStops(points, ATTACHED).filter((s) => ids.includes(s.point.id));

  test("a filtered cut keeps each row's aligned window and steps over the rest", () => {
    const all = filmStops(points, ATTACHED);
    const saved = walk(["a", "d"]);
    expect(saved.map((s) => s.serve)).toEqual([all[0].serve, all[3].serve]);
    // Previous/next skip straight past the filtered-out points.
    expect(nextStop(saved, all[0].start)?.point.id).toBe("d");
    expect(prevStop(saved, all[3].start)?.point.id).toBe("a");
    // But the playing row is still read from the full timeline, so the
    // playhead inside a filtered-out point names that point.
    expect(activeStopAt(all, all[1].start + 1)?.stop.point.id).toBe("b");
    expect(activeStopAt(saved, all[1].start + 1)?.stop.point.id).toBe("a");
  });
});

/**
 * The room's Loop reads a window's own edges and seeks back to its start.
 * Whatever the offset's sign, that round trip has to land on the same frame it
 * started from.
 */
test.describe("loop", () => {
  for (const [name, clock] of [
    ["legacy zero offset", LEGACY_ZERO],
    ["provider trim", PROVIDER],
    ["attachment, negative offset", ATTACHED],
  ] as const) {
    test(`a loop over ${name} returns to the window's own start`, () => {
      const stops = filmStops(points, clock);
      const stop = stops[1];
      // Playing to the end of the window puts the playhead past it…
      expect(activeStopAt(stops, stop.end)?.progress).toBe(1);
      // …and the seek back re-enters the same point at its lead-in.
      const back = activeStopAt(stops, stop.start);
      expect(back?.stop.point.id).toBe(stop.point.id);
      expect(back?.progress).toBe(0);
    });
  }
});

test.describe("filmClock", () => {
  test("an attachment carries its verified duration", () => {
    expect(
      filmClock({
        startTimeSeconds: -42.5,
        attachment: { durationSeconds: 600 },
      }),
    ).toEqual({ offset: -42.5, duration: 600 });
  });

  test("the provider lineage has no measured duration", () => {
    expect(filmClock({ startTimeSeconds: 15.136, attachment: null })).toEqual({
      offset: 15.136,
      duration: null,
    });
    expect(filmClock({ startTimeSeconds: 0, attachment: null })).toEqual(
      LEGACY_ZERO,
    );
  });

  test("a duration that is not a positive number is unmeasured, not zero", () => {
    for (const durationSeconds of [0, -3, Number.NaN, Number.POSITIVE_INFINITY])
      expect(
        filmClock({ startTimeSeconds: 4, attachment: { durationSeconds } })
          .duration,
      ).toBeNull();
  });
});

test.describe("setSegments", () => {
  test("splits at each new set's first serve and tiles the whole duration", () => {
    const stops = filmStops(
      [
        pt({ id: "1", videoTime: 20, setNumber: 1, gameNumber: 1 }),
        pt({ id: "2", videoTime: 40, setNumber: 1, gameNumber: 2 }),
        pt({ id: "3", videoTime: 60, setNumber: 2, gameNumber: 1 }),
        pt({ id: "4", videoTime: 80, setNumber: 2, gameNumber: 2 }),
        pt({ id: "5", videoTime: 100, setNumber: 3, gameNumber: 1 }),
      ],
      LEGACY_ZERO,
    );
    const segments = setSegments(stops, 200);
    expect(segments).toHaveLength(3);
    expect(segments[0].start).toBe(0);
    expect(segments[1].start).toBe(stops[2].serve);
    expect(segments[2].start).toBe(stops[4].serve);
    expect(segments[2].end).toBe(200);
    segments.slice(1).forEach((segment, i) => {
      expect(segment.start).toBe(segments[i].end);
    });
  });

  test("a break of serve inside a set is not a cut", () => {
    const stops = filmStops(
      [
        pt({
          id: "1",
          videoTime: 20,
          gameNumber: 1,
          serverIsPlayer1: true,
          wonByPlayer1: false,
        }),
        pt({ id: "2", videoTime: 60, gameNumber: 2, serverIsPlayer1: false }),
      ],
      LEGACY_ZERO,
    );
    expect(setSegments(stops, 90)).toEqual([{ start: 0, end: 90 }]);
  });

  test("no points or no duration", () => {
    expect(setSegments([], 90)).toEqual([{ start: 0, end: 90 }]);
    expect(setSegments([], 0)).toEqual([]);
  });
});
