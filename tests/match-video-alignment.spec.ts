import { expect, test } from "@playwright/test";

import {
  formatConfirmedVideoTime,
  parseConfirmedVideoTime,
  planAlignment,
  sourceToVideoSeconds,
  summarizeSourceTiming,
  type SourcePoint,
  type SourceShot,
} from "@/lib/match-video/alignment";
import {
  checkAttachmentSize,
  COVERAGE_TOLERANCE_SECONDS,
  MATCH_VIDEO_MAX_BYTES,
} from "@/lib/match-video/limits";
import {
  isMatchVideoMode,
  matchVideoError,
  MATCH_VIDEO_MODES,
  modeRequiresActiveAttachment,
  modeUploadsFile,
} from "@/lib/match-video/types";

/**
 * SwingVision points are timed against a recording we never received. Attaching
 * a video saves ONE offset between that source clock and the uploaded file, and
 * every seek in the match room is derived from it. A wrong offset does not look
 * broken on screen — it just plays the wrong ten seconds — so these pin the
 * arithmetic, both trim directions, and every refusal.
 */

/** A point timed at `videoTime` on the source clock. */
function pt(
  pointNumber: number,
  videoTime: number | null,
  duration: number | null = null,
): SourcePoint {
  return { pointNumber, videoTime, duration };
}

function shot(videoTime: number | null): SourceShot {
  return { videoTime };
}

/**
 * A three-point match: first serve at source 30s, last point running from
 * source 120s to 130s. Its shots sit inside those points.
 */
const POINTS: SourcePoint[] = [pt(1, 30, 12), pt(2, 70, 9), pt(3, 120, 10)];
const SHOTS: SourceShot[] = [shot(30.5), shot(72.25), shot(124)];

function align(confirmedVideoTime: unknown, videoDurationSeconds = 200) {
  return planAlignment({
    points: POINTS,
    shots: SHOTS,
    confirmedVideoTime,
    videoDurationSeconds,
  });
}

test.describe("offset arithmetic", () => {
  test("a recording with a long lead-in gets a positive offset", () => {
    // Source says the first point starts at 30s; in this file it is at 10s, so
    // the recording started 20s LATER than the source clock's zero.
    const result = align(10);
    if (!result.ok) throw new Error(result.error.detail);

    expect(result.value.offsetSeconds).toBeCloseTo(20, 9);
    // The anchor lands exactly where the user said it does.
    expect(sourceToVideoSeconds(30, result.value.offsetSeconds)).toBeCloseTo(
      10,
      9,
    );
    // And the last point's end follows it by the same shift.
    expect(result.value.coverage.requiredVideoEndSeconds).toBeCloseTo(110, 9);
  });

  test("a recording that started earlier gets a negative offset", () => {
    // The first point is at 50s in this file: it has 20s more lead-in than the
    // source clock had. Negative offsets are ordinary, not an error case.
    const result = align(50);
    if (!result.ok) throw new Error(result.error.detail);

    expect(result.value.offsetSeconds).toBeCloseTo(-20, 9);
    expect(sourceToVideoSeconds(120, result.value.offsetSeconds)).toBeCloseTo(
      140,
      9,
    );
  });

  test("an explicit zero is a real answer, not a missing one", () => {
    // A recording can start exactly on the serve. Zero must produce the full
    // source offset rather than being treated as "nothing entered".
    const result = align(0);
    if (!result.ok) throw new Error(result.error.detail);

    expect(result.value.confirmedVideoTimeSeconds).toBe(0);
    expect(result.value.offsetSeconds).toBeCloseTo(30, 9);
    expect(result.value.coverage.requiredVideoStartSeconds).toBeCloseTo(0, 9);
  });

  test("fractional input keeps millisecond precision", () => {
    const result = align("00:00:10.250");
    if (!result.ok) throw new Error(result.error.detail);

    expect(result.value.confirmedVideoTimeSeconds).toBe(10.25);
    expect(result.value.offsetSeconds).toBeCloseTo(19.75, 9);
  });

  test("confirming to the millisecond does not round away source precision", () => {
    // The confirmed position is quantised to ms; the SOURCE timestamp is not.
    // If the offset were rounded too, every seek would move by up to half a
    // millisecond for no reason.
    const result = planAlignment({
      points: [pt(1, 30.123456, 12), pt(2, 120.98765, 10)],
      shots: [],
      confirmedVideoTime: 10.0004,
      videoDurationSeconds: 200,
    });
    if (!result.ok) throw new Error(result.error.detail);

    expect(result.value.confirmedVideoTimeSeconds).toBe(10);
    expect(result.value.offsetSeconds).toBeCloseTo(20.123456, 9);
  });

  test("repeated corrections never accumulate", () => {
    // Every correction recomputes from the source clock. Correcting to 10s,
    // then 40s, then back to 10s must return the ORIGINAL offset — if a
    // correction were applied on top of the saved offset instead, the match
    // would drift further out of sync with every nudge.
    const first = align(10);
    const second = align(40);
    const third = align(10);
    if (!first.ok || !second.ok || !third.ok) throw new Error("refused");

    expect(second.value.offsetSeconds).toBeCloseTo(-10, 9);
    expect(third.value.offsetSeconds).toBe(first.value.offsetSeconds);
    expect(third.value.confirmedVideoTimeSeconds).toBe(
      first.value.confirmedVideoTimeSeconds,
    );
  });
});

test.describe("point ordering", () => {
  test("the anchor is the first point by number, not the earliest timestamp", () => {
    // Rows arrive in whatever order the query returned them, and a stray early
    // timestamp must not become the anchor: aligning to the wrong serve puts
    // the entire match off by a point.
    const summary = summarizeSourceTiming(
      [pt(3, 120, 10), pt(1, 30, 12), pt(2, 70, 9)],
      [shot(12)],
    );
    if (!summary.ok) throw new Error(summary.error.detail);

    expect(summary.value.anchorPointNumber).toBe(1);
    expect(summary.value.anchorSourceSeconds).toBe(30);
    expect(summary.value.finalPointNumber).toBe(3);
    expect(summary.value.requiredSourceEndSeconds).toBe(130);
    // A shot before the anchor still has to fit inside the file.
    expect(summary.value.earliestSourceSeconds).toBe(12);
  });

  test("a duplicate point number is ambiguous and refuses", () => {
    const summary = summarizeSourceTiming([pt(1, 30, 12), pt(1, 70, 9)], []);
    expect(summary.ok).toBe(false);
    if (summary.ok) return;
    expect(summary.error.code).toBe("missing_source_timing");
    expect(summary.error.detail).toBe("ambiguous_point_order");
  });
});

test.describe("refusals from the source data", () => {
  test("a missing first-point timestamp refuses without picking a later point", () => {
    const result = planAlignment({
      points: [pt(1, null, 12), pt(2, 70, 9), pt(3, 120, 10)],
      shots: [],
      confirmedVideoTime: 10,
      videoDurationSeconds: 200,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toBe("missing_first_point_time");
    expect(result.error.message).toBe(
      "This match is missing the timing data needed to align a video.",
    );
  });

  test("a missing final-point timestamp refuses", () => {
    const result = planAlignment({
      points: [pt(1, 30, 12), pt(2, null, null)],
      shots: [],
      confirmedVideoTime: 10,
      videoDurationSeconds: 200,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toBe("missing_final_point_time");
  });

  test("the final point needs a positive duration, because its END must exist", () => {
    for (const duration of [null, 0]) {
      const result = planAlignment({
        points: [pt(1, 30, 12), pt(2, 120, duration)],
        shots: [],
        confirmedVideoTime: 10,
        videoDurationSeconds: 200,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.detail).toBe("missing_final_point_duration");
    }
  });

  test("nonfinite and negative source timestamps refuse", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = planAlignment({
        points: [pt(1, 30, 12), pt(2, bad, 4), pt(3, 120, 10)],
        shots: [],
        confirmedVideoTime: 10,
        videoDurationSeconds: 200,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.detail).toBe("point_time_invalid");
    }
  });

  test("a corrupt shot timestamp refuses", () => {
    const result = planAlignment({
      points: POINTS,
      shots: [shot(Number.NEGATIVE_INFINITY)],
      confirmedVideoTime: 10,
      videoDurationSeconds: 200,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toBe("shot_time_invalid");
  });

  test("a match with no points refuses", () => {
    const summary = summarizeSourceTiming([], []);
    expect(summary.ok).toBe(false);
    if (summary.ok) return;
    expect(summary.error.code).toBe("missing_source_timing");
  });

  test("null interior timestamps are counted, not repaired", () => {
    // Real imports routinely have gaps in the middle. Those points stay in the
    // match without a seek target; they must not block alignment and no time
    // is invented for them.
    const result = planAlignment({
      points: [
        pt(1, 30, 12),
        pt(2, null, null),
        pt(3, null, 5),
        pt(4, 120, 10),
      ],
      shots: [shot(31), shot(null)],
      confirmedVideoTime: 10,
      videoDurationSeconds: 200,
    });
    if (!result.ok) throw new Error(result.error.detail);

    expect(result.value.timing.untimedPointCount).toBe(2);
    expect(result.value.timing.untimedShotCount).toBe(1);
    expect(result.value.offsetSeconds).toBeCloseTo(20, 9);
    // The gap does not move the required window.
    expect(result.value.coverage.requiredVideoEndSeconds).toBeCloseTo(110, 9);
  });
});

test.describe("confirmed-time parsing", () => {
  test("accepts seconds, mm:ss and hh:mm:ss with millisecond fractions", () => {
    const cases: Array<[unknown, number]> = [
      [0, 0],
      [12.345, 12.345],
      ["0", 0],
      ["12.5", 12.5],
      ["1:30", 90],
      ["01:30.250", 90.25],
      ["1:00:00", 3600],
      ["00:02:03.004", 123.004],
    ];
    for (const [input, expected] of cases) {
      const parsed = parseConfirmedVideoTime(input);
      if (!parsed.ok)
        throw new Error(`${String(input)}: ${parsed.error.detail}`);
      expect(parsed.value).toBe(expected);
    }
  });

  test("a numeric player position is rounded to the stored millisecond", () => {
    const parsed = parseConfirmedVideoTime(10.00049);
    if (!parsed.ok) throw new Error(parsed.error.detail);
    expect(parsed.value).toBe(10);
  });

  test("NaN, infinity and negatives are refused", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0.5,
    ]) {
      const parsed = parseConfirmedVideoTime(bad);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error.code).toBe("invalid_alignment");
    }
  });

  test("malformed time strings are refused rather than coerced", () => {
    // Number("") is 0 and Number(" 12 ") is 12; a parser that leaned on Number
    // would silently accept an empty field as "align at zero".
    for (const bad of [
      "",
      "   ",
      "abc",
      "1e3",
      "-5",
      "+5",
      "NaN",
      "Infinity",
      "1:2:3:4",
      "1:90",
      "1:2:90",
      "1:90:00",
      "12.3456",
      "1,5",
      null,
      undefined,
      {},
      [],
      true,
    ]) {
      const parsed = parseConfirmedVideoTime(bad);
      expect(parsed.ok, `expected ${JSON.stringify(bad)} to be refused`).toBe(
        false,
      );
    }
  });

  test("formatting round-trips through the field's own format", () => {
    expect(formatConfirmedVideoTime(0)).toBe("00:00:00.000");
    expect(formatConfirmedVideoTime(123.004)).toBe("00:02:03.004");
    expect(formatConfirmedVideoTime(3661.5)).toBe("01:01:01.500");

    const parsed = parseConfirmedVideoTime(formatConfirmedVideoTime(90.25));
    if (!parsed.ok) throw new Error(parsed.error.detail);
    expect(parsed.value).toBe(90.25);
  });
});

test.describe("coverage", () => {
  test("a recording that ends exactly at the final point is long enough", () => {
    // Anchor at video 10 ⇒ offset 20 ⇒ final point ends at video 110.
    const result = align(10, 110);
    expect(result.ok).toBe(true);
  });

  test("coverage passes at the tolerance edge and fails just beyond it", () => {
    // The last required instant is video 110. Media durations are rounded to a
    // sample boundary, so a tenth of a second of slack is allowed — but not a
    // second, which would be a genuinely short recording.
    const atEdge = align(10, 110 - COVERAGE_TOLERANCE_SECONDS);
    expect(atEdge.ok).toBe(true);

    const pastEdge = align(10, 110 - COVERAGE_TOLERANCE_SECONDS * 2);
    expect(pastEdge.ok).toBe(false);
    if (pastEdge.ok) return;
    expect(pastEdge.error.code).toBe("insufficient_coverage");
    expect(pastEdge.error.detail).toBe("coverage_past_end");
    expect(pastEdge.error.message).toBe("This video is not long enough.");
  });

  test("a short file refuses with the coverage message", () => {
    const result = align(10, 60);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("This video is not long enough.");
    expect(result.error.status).toBe(422);
  });

  test("an event before video zero refuses", () => {
    // A shot 12s into the source clock cannot exist in a file whose anchor sits
    // only 1s in — that would put it 17s before the recording started.
    const result = planAlignment({
      points: POINTS,
      shots: [shot(12)],
      confirmedVideoTime: 1,
      videoDurationSeconds: 400,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("insufficient_coverage");
    expect(result.error.detail).toBe("coverage_before_start");
  });

  test("an out-of-range shot after the final point still fails coverage", () => {
    const result = planAlignment({
      points: POINTS,
      shots: [shot(195)],
      confirmedVideoTime: 10,
      videoDurationSeconds: 120,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toBe("coverage_past_end");
  });

  test("every known bound counts, not just the final point's end", () => {
    // The final point ends at source 130, but a shot is recorded at 140. The
    // file has to contain THAT too — checking only the final point's end would
    // accept a recording that cuts off mid-rally.
    const summary = summarizeSourceTiming(POINTS, [shot(140)]);
    if (!summary.ok) throw new Error(summary.error.detail);
    expect(summary.value.requiredSourceEndSeconds).toBe(140);

    // Same for an interior point whose stored duration runs long.
    const longInterior = summarizeSourceTiming(
      [pt(1, 30, 12), pt(2, 70, 80), pt(3, 120, 10)],
      [],
    );
    if (!longInterior.ok) throw new Error(longInterior.error.detail);
    expect(longInterior.value.requiredSourceEndSeconds).toBe(150);
  });

  test("playback padding is not coverage evidence", () => {
    // The player draws 1.5s of lead-in/lead-out around a point. A file ending
    // 0.2s after the final point covers the match; its padding is simply
    // clipped. Counting the padding would reject a perfectly usable recording.
    const result = align(10, 110.2);
    if (!result.ok) throw new Error(result.error.detail);
    expect(result.value.coverage.requiredVideoEndSeconds).toBeCloseTo(110, 9);
    expect(result.value.coverage.videoDurationSeconds).toBe(110.2);
  });

  test("an unusable video duration refuses as media, not as coverage", () => {
    for (const duration of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = align(10, duration);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("unsupported_media");
    }
  });

  test("a confirmed time past the end of the file refuses as alignment", () => {
    const result = align(500, 200);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_alignment");
    expect(result.error.detail).toBe("confirmed_time_past_end");
  });
});

test.describe("shared contracts", () => {
  test("the modes are add, replace and align, with their step shapes", () => {
    expect([...MATCH_VIDEO_MODES]).toEqual(["add", "replace", "align"]);
    expect(isMatchVideoMode("replace")).toBe(true);
    for (const bad of ["adjust", "ADD", "", "delete", null, 1]) {
      expect(isMatchVideoMode(bad)).toBe(false);
    }

    // Align is the one-step flow: it never moves bytes.
    expect(modeUploadsFile("align")).toBe(false);
    expect(modeUploadsFile("add")).toBe(true);
    expect(modeUploadsFile("replace")).toBe(true);

    // Add is the only mode that may run with no attachment present.
    expect(modeRequiresActiveAttachment("add")).toBe(false);
    expect(modeRequiresActiveAttachment("replace")).toBe(true);
    expect(modeRequiresActiveAttachment("align")).toBe(true);
  });

  test("error codes map to their planned statuses", () => {
    const expected: Array<[Parameters<typeof matchVideoError>[0], number]> = [
      ["unauthenticated", 401],
      ["match_not_found", 404],
      ["forbidden", 403],
      ["workspace_mismatch", 403],
      ["stale_attachment", 409],
      ["pending_attempt_conflict", 409],
      ["mode_conflict", 409],
      ["file_too_large", 413],
      ["empty_file", 413],
      ["unsupported_media", 422],
      ["media_probe_budget", 422],
      ["invalid_alignment", 422],
      ["missing_source_timing", 422],
      ["insufficient_coverage", 422],
      ["storage_unavailable", 503],
    ];
    for (const [code, status] of expected) {
      expect(matchVideoError(code, "test").status, code).toBe(status);
    }
  });

  test("only coverage says the video is not long enough", () => {
    const notLongEnough = "This video is not long enough.";
    expect(matchVideoError("insufficient_coverage", "t").message).toBe(
      notLongEnough,
    );
    for (const code of [
      "missing_source_timing",
      "unsupported_media",
      "invalid_alignment",
      "media_probe_budget",
    ] as const) {
      expect(matchVideoError(code, "t").message).not.toBe(notLongEnough);
    }
  });

  test("a probe budget refusal is distinct from a storage failure", () => {
    // One means "this file cannot be inspected, export an MP4"; the other means
    // "try again in a moment". Collapsing them would tell a user to re-encode a
    // perfectly good file because Azure blipped.
    const probe = matchVideoError("media_probe_budget", "t");
    const storage = matchVideoError("storage_unavailable", "t");
    expect(probe.status).toBe(422);
    expect(storage.status).toBe(503);
    expect(probe.message).not.toBe(storage.message);
  });

  test("the size limit is 7,999,999,999 bytes, and empty files are refused", () => {
    expect(MATCH_VIDEO_MAX_BYTES).toBe(7_999_999_999);

    expect(checkAttachmentSize(MATCH_VIDEO_MAX_BYTES).ok).toBe(true);
    expect(checkAttachmentSize(1).ok).toBe(true);

    const tooBig = checkAttachmentSize(MATCH_VIDEO_MAX_BYTES + 1);
    expect(tooBig.ok).toBe(false);
    if (tooBig.ok) return;
    expect(tooBig.error.code).toBe("file_too_large");
    expect(tooBig.error.status).toBe(413);

    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = checkAttachmentSize(bad);
      expect(result.ok, `expected ${bad} to be refused`).toBe(false);
    }
  });
});
