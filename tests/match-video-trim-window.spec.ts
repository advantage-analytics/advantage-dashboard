import { expect, test } from "@playwright/test";

import {
  planAlignment,
  summarizeSourceTiming,
  type SourcePoint,
  type SourceShot,
} from "@/lib/match-video/alignment";
import { ATTACHMENT_TRIM_PAD_SECONDS } from "@/lib/match-video/limits";
import {
  defaultAttachmentTrimWindow,
  markedTimeInTrimmedClip,
  planTrimmedAlignment,
} from "@/lib/match-video/trim-window";

/**
 * The window a SwingVision attachment is cut to before it uploads. A wrong
 * window does not look broken either: it uploads a clip missing the last rally,
 * or keeps the offset of a file that no longer exists. These pin the window,
 * the position the completion carries, and the coverage check run on the cut.
 */

/**
 * First serve at source 30s; the last point runs 120s → 130s, and one shot is
 * logged at 131s, after its point's stored duration. So the match needs
 * 101s of video after the marked serve (131 − 30), not 100.
 */
const POINTS: SourcePoint[] = [
  { pointNumber: 1, videoTime: 30, duration: 12 },
  { pointNumber: 2, videoTime: 70, duration: 9 },
  { pointNumber: 3, videoTime: 120, duration: 10 },
];
const SHOTS: SourceShot[] = [{ videoTime: 30.5 }, { videoTime: 131 }];

function timing() {
  const summary = summarizeSourceTiming(POINTS, SHOTS);
  if (!summary.ok) throw new Error("fixture timing must summarize");
  return summary.value;
}

test("the pad is ten seconds", () => {
  expect(ATTACHMENT_TRIM_PAD_SECONDS).toBe(10);
});

test.describe("defaultAttachmentTrimWindow", () => {
  test("pads the marked first point and the last required instant", () => {
    const window = defaultAttachmentTrimWindow({
      markedSeconds: 300,
      timing: timing(),
      videoDurationSeconds: 3600,
    });
    // 300 − 10, and 300 + (131 − 30) + 10. The late shot, not the final
    // point's end, is what the lead-out is measured from.
    expect(window).toEqual({ startSeconds: 290, endSeconds: 411 });
  });

  test("clamps the start to the beginning of the file", () => {
    const window = defaultAttachmentTrimWindow({
      markedSeconds: 4.25,
      timing: timing(),
      videoDurationSeconds: 3600,
    });
    expect(window.startSeconds).toBe(0);
    expect(window.endSeconds).toBeCloseTo(4.25 + 101 + 10, 6);
  });

  test("clamps the end to the file's duration", () => {
    const window = defaultAttachmentTrimWindow({
      markedSeconds: 300,
      timing: timing(),
      videoDurationSeconds: 405.5,
    });
    expect(window).toEqual({ startSeconds: 290, endSeconds: 405.5 });
  });

  test("bounds are quantised to milliseconds, so marked − start is exact", () => {
    const window = defaultAttachmentTrimWindow({
      markedSeconds: 25.123,
      timing: timing(),
      videoDurationSeconds: 3600,
    });
    expect(window.startSeconds).toBe(15.123);
    expect(markedTimeInTrimmedClip(25.123, window)).toBe(10);
  });
});

test.describe("planTrimmedAlignment", () => {
  const marked = 300;

  test("the default window passes, and moves the offset by exactly the cut start", () => {
    const window = defaultAttachmentTrimWindow({
      markedSeconds: marked,
      timing: timing(),
      videoDurationSeconds: 3600,
    });
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: SHOTS,
      markedSeconds: marked,
      window,
    });
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    // The completion carries the serve's position in the CUT…
    expect(cut.value.confirmedVideoTimeSeconds).toBe(10);
    expect(cut.value.coverage.videoDurationSeconds).toBe(121);

    // …and the server's `anchor − confirmed` from it is the offset the
    // original file would have had, moved by exactly the cut's start.
    const uncut = planAlignment({
      points: POINTS,
      shots: SHOTS,
      confirmedVideoTime: marked,
      videoDurationSeconds: 3600,
    });
    expect(uncut.ok).toBe(true);
    if (!uncut.ok) return;
    expect(cut.value.offsetSeconds).toBeCloseTo(
      uncut.value.offsetSeconds + window.startSeconds,
      9,
    );
  });

  test("a start clamped to zero still passes", () => {
    const window = defaultAttachmentTrimWindow({
      markedSeconds: 4,
      timing: timing(),
      videoDurationSeconds: 3600,
    });
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: SHOTS,
      markedSeconds: 4,
      window,
    });
    expect(cut.ok).toBe(true);
    if (cut.ok) expect(cut.value.confirmedVideoTimeSeconds).toBe(4);
  });

  test("a window that starts after the marked first point is insufficient", () => {
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: SHOTS,
      markedSeconds: marked,
      window: { startSeconds: marked + 0.5, endSeconds: 500 },
    });
    expect(cut.ok).toBe(false);
    if (cut.ok) return;
    expect(cut.error.code).toBe("insufficient_coverage");
    expect(cut.error.detail).toBe("trim_starts_after_first_point");
  });

  test("a window that clips an event before the anchor is insufficient", () => {
    // The shot at source 30.5 is after the anchor, so push one before it.
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: [...SHOTS, { videoTime: 29 }],
      markedSeconds: marked,
      window: { startSeconds: marked - 0.5, endSeconds: 500 },
    });
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.error.code).toBe("insufficient_coverage");
  });

  test("a window that ends before the last point's end is insufficient", () => {
    // The last required instant sits at marked + 101 = 401.
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: SHOTS,
      markedSeconds: marked,
      window: { startSeconds: 290, endSeconds: 400 },
    });
    expect(cut.ok).toBe(false);
    if (cut.ok) return;
    expect(cut.error.code).toBe("insufficient_coverage");
    expect(cut.error.detail).toBe("coverage_past_end");
  });

  test("a window that ends before the marked first point is insufficient", () => {
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: SHOTS,
      markedSeconds: marked,
      window: { startSeconds: 100, endSeconds: 200 },
    });
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.error.code).toBe("insufficient_coverage");
  });

  test("an empty window is insufficient", () => {
    const cut = planTrimmedAlignment({
      points: POINTS,
      shots: SHOTS,
      markedSeconds: marked,
      window: { startSeconds: 290, endSeconds: 290 },
    });
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.error.code).toBe("insufficient_coverage");
  });
});
