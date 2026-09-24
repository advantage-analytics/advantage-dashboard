import { expect, test } from "@playwright/test";

import {
  bounceVideoTimes,
  normalizeStroke,
  type RawSplitStepStroke,
} from "@/lib/services/splitstep/derivation";

/**
 * Node-style tests for the frame clock and the bounce frame it converts. No
 * browser, no fixtures on disk.
 *
 * The clock: strokes at trimmed frames 0 / 30 / 60 with video times
 * 100 / 101 / 102 — 30 fps with a 100 s trim offset, so t = 100 + frame / 30.
 */

const STROKES = [
  { trimmedFrame: 0, videoTime: 100, bounceFrame: 45 },
  { trimmedFrame: 30, videoTime: 101, bounceFrame: null },
  { trimmedFrame: 60, videoTime: 102, bounceFrame: 75 },
];

/** The smallest raw stroke `normalizeStroke` accepts, with the bounce under test. */
function raw(bounce_frame: unknown, frame: unknown = 120): RawSplitStepStroke {
  return {
    frame,
    time: 4,
    event_id: 1,
    pred_rally_id: 1,
    pred_rally_stroke_number: 1,
    pred_player_id: "near",
    bounce_frame,
  } as unknown as RawSplitStepStroke;
}

test.describe("normalizeStroke — bounceFrame", () => {
  test("carries a bounce frame at or after the contact frame", () => {
    expect(normalizeStroke(raw(150), 0)?.bounceFrame).toBe(150);
  });

  test("null when the field is missing", () => {
    expect(normalizeStroke(raw(undefined), 0)?.bounceFrame).toBeNull();
  });

  test("null when the value is not finite", () => {
    expect(normalizeStroke(raw(Number.NaN), 0)?.bounceFrame).toBeNull();
    expect(
      normalizeStroke(raw(Number.POSITIVE_INFINITY), 0)?.bounceFrame,
    ).toBeNull();
  });

  test("null on the -9999 sentinel", () => {
    expect(normalizeStroke(raw(-9999), 0)?.bounceFrame).toBeNull();
    expect(normalizeStroke(raw(-9999.0), 0)?.bounceFrame).toBeNull();
  });

  test("null when the bounce precedes the contact frame", () => {
    expect(normalizeStroke(raw(119, 120), 0)?.bounceFrame).toBeNull();
    // Equal is not "before": a bounce on the contact frame survives.
    expect(normalizeStroke(raw(120, 120), 0)?.bounceFrame).toBe(120);
  });

  test("null when there is no contact frame to order it against", () => {
    expect(normalizeStroke(raw(150, null), 0)?.bounceFrame).toBeNull();
  });
});

test.describe("bounceVideoTimes", () => {
  test("fits each bounce frame onto the strokes' own clock", () => {
    const times = bounceVideoTimes(STROKES);
    expect(times).toHaveLength(3);
    expect(times[0]).toBeCloseTo(101.5, 9);
    expect(times[1]).toBeNull();
    expect(times[2]).toBeCloseTo(102.5, 9);
  });

  test("keeps the trim offset: the result is on the original video's clock", () => {
    const [t] = bounceVideoTimes([STROKES[0]]);
    // One stroke cannot fit a clock, but two can — and the offset must survive.
    expect(t).toBeNull();
    const [withClock] = bounceVideoTimes(STROKES.slice(0, 2));
    expect(withClock).toBeCloseTo(101.5, 9);
  });

  test("null for every stroke when fewer than two distinct frames exist", () => {
    expect(
      bounceVideoTimes([
        { trimmedFrame: 10, videoTime: 100, bounceFrame: 20 },
        { trimmedFrame: 10, videoTime: 100.5, bounceFrame: 25 },
      ]),
    ).toEqual([null, null]);
    expect(bounceVideoTimes([])).toEqual([]);
  });

  test("a sentinel frame does not join the fit but still gets a time", () => {
    const times = bounceVideoTimes([
      ...STROKES,
      { trimmedFrame: -1, videoTime: 999, bounceFrame: 90 },
    ]);
    // 999 would wreck the line if -1 were fitted; 90 → 103 says it was not.
    expect(times[3]).toBeCloseTo(103, 9);
  });
});
