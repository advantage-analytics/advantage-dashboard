import { expect, test } from "@playwright/test";

import {
  summariseSeek,
  type TraceEvent,
} from "@/components/dashboard/matches/match-detail/film/film-trace";

/**
 * The seek trace's summary (T14). Three shapes, one per explanation an
 * on-screen "reload" after a point jump can have: a jump inside what the
 * element already holds, a jump the pipeline has to fetch for, and a jump the
 * element did not survive.
 */

test("a buffered seek lands without waiting", () => {
  const events: TraceEvent[] = [
    { type: "seek", t: 1000, time: 42, buffered: [[30, 60]] },
    { type: "seeking", t: 1001, time: 42 },
    { type: "seeked", t: 1030, time: 42 },
    { type: "playing", t: 1035, time: 42 },
  ];
  expect(summariseSeek(events)).toEqual({
    seekToSeekedMs: 30,
    seekToPlayingMs: 35,
    waitingCount: 0,
    stalled: false,
    bufferedAtSeek: true,
    remounted: false,
  });
});

test("an unbuffered seek waits, then plays", () => {
  const events: TraceEvent[] = [
    // Something from before the seek is not this seek's.
    { type: "waiting", t: 500 },
    {
      type: "seek",
      t: 1000,
      time: 1800,
      buffered: [
        [0, 12],
        [40, 55],
      ],
    },
    { type: "seeking", t: 1001, time: 1800 },
    { type: "waiting", t: 1002, time: 1800 },
    { type: "stalled", t: 3000, time: 1800 },
    { type: "seeked", t: 4200, time: 1800 },
    { type: "playing", t: 4400, time: 1800 },
  ];
  expect(summariseSeek(events)).toEqual({
    seekToSeekedMs: 3200,
    seekToPlayingMs: 3400,
    waitingCount: 1,
    stalled: true,
    bufferedAtSeek: false,
    remounted: false,
  });
});

test("a remount mid-seek is reported as one", () => {
  const events: TraceEvent[] = [
    { type: "seek", t: 1000, time: 300, buffered: [] },
    { type: "seeking", t: 1001, time: 300 },
    { type: "error", t: 1500, time: 300 },
    { type: "generation", t: 1900 },
    { type: "seeked", t: 2600, time: 300 },
  ];
  expect(summariseSeek(events)).toEqual({
    seekToSeekedMs: 1600,
    seekToPlayingMs: null,
    waitingCount: 0,
    stalled: false,
    bufferedAtSeek: false,
    remounted: true,
  });
});

test("a list with no seek summarises to nothing", () => {
  expect(summariseSeek([{ type: "playing", t: 1 }])).toEqual({
    seekToSeekedMs: null,
    seekToPlayingMs: null,
    waitingCount: 0,
    stalled: false,
    bufferedAtSeek: false,
    remounted: false,
  });
});
