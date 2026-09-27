/**
 * Source-to-video alignment for SwingVision attachments.
 *
 * A SwingVision match is imported from a spreadsheet whose timestamps are
 * measured against a recording we never received. Attaching a video means
 * finding the first point's serve contact in THAT file and saving one number:
 *
 *   offsetSeconds = firstPointSourceTime - confirmedVideoTime
 *   videoTime     = sourceTime - offsetSeconds
 *
 * Nothing in the imported data is rewritten, so a correction is always computed
 * from the source clock again and never from the previous offset. Two
 * corrections in a row that both land on the same video position must produce
 * the same offset; anything else would drift the whole match a little further
 * every time someone nudged the alignment.
 *
 * Pure module: no Azure, no Supabase, no Next.js, no DOM.
 */

import { COVERAGE_TOLERANCE_SECONDS, CONFIRMED_TIME_DECIMALS } from "./limits";
import { fail, type MatchVideoResult } from "./types";

/* -------------------------------------------------------------------------
 * Source rows
 * ---------------------------------------------------------------------- */

/**
 * One imported point, as `points` stores it.
 *
 * `videoTime` and `duration` are both nullable in the live schema and both are
 * routinely null in real imports — 111 of 2,391 points in the sampled data had
 * no timestamp. A null is missing data, never a zero.
 */
export interface SourcePoint {
  pointNumber: number;
  videoTime: number | null;
  duration: number | null;
}

/** One imported shot. Shots hang off a point and carry their own timestamp. */
export interface SourceShot {
  videoTime: number | null;
}

/**
 * What the source timeline says, once it is known to be alignable.
 *
 * `anchorSourceSeconds` is the FIRST point by `point_number` — not the earliest
 * timestamp, and not the first point the Film filter happens to show. Choosing
 * a later point silently would align the whole match against the wrong serve.
 */
export interface SourceTimingSummary {
  anchorPointNumber: number;
  anchorSourceSeconds: number;
  finalPointNumber: number;
  /**
   * The last instant that must exist in the file: the final point's end, or a
   * later known point end or shot time if the data has one.
   */
  requiredSourceEndSeconds: number;
  /** Earliest known source instant, which may be a shot before the anchor. */
  earliestSourceSeconds: number;
  /** Points whose timestamp is null. They stay visible but cannot be seeked. */
  untimedPointCount: number;
  /** Shots whose timestamp is null. */
  untimedShotCount: number;
}

/* -------------------------------------------------------------------------
 * Strict time parsing
 * ---------------------------------------------------------------------- */

const CLOCK_SEGMENT = /^\d+$/;
const SECONDS_SEGMENT = /^\d+(?:\.\d{1,3})?$/;

/** Round to millisecond precision. */
function roundToMilliseconds(seconds: number): number {
  const factor = 10 ** CONFIRMED_TIME_DECIMALS;
  return Math.round(seconds * factor) / factor;
}

/**
 * Parse a confirmed first-point position.
 *
 * Accepts a finite non-negative number of seconds, or an `hh:mm:ss.sss`,
 * `mm:ss.sss` or `ss.sss` string. Rejects everything else — including `NaN`,
 * `Infinity`, negatives, exponent notation, blank strings and more than three
 * fractional digits, which would otherwise be rounded away without the user
 * seeing it happen.
 *
 * A numeric input (the player's `currentTime`) IS rounded to milliseconds:
 * that is the stored precision, and it is the confirmed position being
 * quantised, not the source timestamps the offset is derived from.
 *
 * Zero is a legitimate answer — a recording can start exactly at the serve —
 * so it is accepted here and it is the wizard's job to require that the user
 * chose it rather than left the field untouched.
 */
export function parseConfirmedVideoTime(
  input: unknown,
): MatchVideoResult<number> {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return fail("invalid_alignment", "confirmed_time_not_finite");
    }
    if (input < 0) {
      return fail("invalid_alignment", "confirmed_time_negative");
    }
    return { ok: true, value: roundToMilliseconds(input) };
  }

  if (typeof input !== "string") {
    return fail("invalid_alignment", "confirmed_time_not_a_time");
  }

  const text = input.trim();
  if (text.length === 0) {
    return fail("invalid_alignment", "confirmed_time_empty");
  }

  const parts = text.split(":");
  if (parts.length > 3) {
    return fail("invalid_alignment", "confirmed_time_too_many_segments");
  }

  const secondsText = parts[parts.length - 1];
  if (!SECONDS_SEGMENT.test(secondsText)) {
    return fail("invalid_alignment", "confirmed_time_malformed");
  }

  const leading = parts.slice(0, -1);
  if (leading.some((part) => !CLOCK_SEGMENT.test(part))) {
    return fail("invalid_alignment", "confirmed_time_malformed");
  }

  let seconds = Number(secondsText);
  // Only the leftmost segment may exceed 59: "90:00" is ninety minutes, but
  // "1:90:00" is a typo, not two and a half hours.
  if (leading.length > 0 && seconds >= 60) {
    return fail("invalid_alignment", "confirmed_time_seconds_overflow");
  }
  if (leading.length === 2) {
    const minutes = Number(leading[1]);
    if (minutes >= 60) {
      return fail("invalid_alignment", "confirmed_time_minutes_overflow");
    }
    seconds += minutes * 60 + Number(leading[0]) * 3600;
  } else if (leading.length === 1) {
    seconds += Number(leading[0]) * 60;
  }

  if (!Number.isFinite(seconds)) {
    return fail("invalid_alignment", "confirmed_time_not_finite");
  }
  return { ok: true, value: roundToMilliseconds(seconds) };
}

/** Format seconds as the `hh:mm:ss.sss` the alignment field displays. */
export function formatConfirmedVideoTime(seconds: number): string {
  const rounded = Math.max(0, roundToMilliseconds(seconds));
  const whole = Math.floor(rounded);
  const millis = Math.round((rounded - whole) * 1000);
  const hh = String(Math.floor(whole / 3600)).padStart(2, "0");
  const mm = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const ss = String(whole % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}.${String(millis).padStart(3, "0")}`;
}

/* -------------------------------------------------------------------------
 * Source timing summary
 * ---------------------------------------------------------------------- */

/** A source timestamp is usable only if it is a finite, non-negative number. */
function isUsableTime(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A present-but-broken timestamp: not null, but not a usable time either. */
function isCorruptTime(value: number | null): boolean {
  return value !== null && !isUsableTime(value);
}

/**
 * Reduce the imported rows to the handful of facts alignment needs.
 *
 * Refuses when the anchor or the final point has no usable timing, when any
 * present timestamp is nonfinite or negative, or when `point_number` is
 * ambiguous. Null interior timestamps are counted, not repaired: this feature
 * attaches a video, it does not invent times the import never had.
 */
export function summarizeSourceTiming(
  points: readonly SourcePoint[],
  shots: readonly SourceShot[],
): MatchVideoResult<SourceTimingSummary> {
  if (points.length === 0) {
    return fail("missing_source_timing", "no_points");
  }

  const seen = new Set<number>();
  for (const point of points) {
    if (!Number.isFinite(point.pointNumber)) {
      return fail("missing_source_timing", "point_number_not_finite");
    }
    if (seen.has(point.pointNumber)) {
      return fail("missing_source_timing", "ambiguous_point_order");
    }
    seen.add(point.pointNumber);

    if (isCorruptTime(point.videoTime)) {
      return fail("missing_source_timing", "point_time_invalid");
    }
    // A null duration is unknown; a negative or nonfinite one is corrupt.
    if (
      point.duration !== null &&
      (!Number.isFinite(point.duration) || point.duration < 0)
    ) {
      return fail("missing_source_timing", "point_duration_invalid");
    }
  }

  for (const shot of shots) {
    if (isCorruptTime(shot.videoTime)) {
      return fail("missing_source_timing", "shot_time_invalid");
    }
  }

  const ordered = [...points].sort((a, b) => a.pointNumber - b.pointNumber);
  const anchor = ordered[0];
  const final = ordered[ordered.length - 1];

  if (!isUsableTime(anchor.videoTime)) {
    return fail("missing_source_timing", "missing_first_point_time");
  }
  if (!isUsableTime(final.videoTime)) {
    return fail("missing_source_timing", "missing_final_point_time");
  }
  // The final point must have a positive duration, because the recording has
  // to contain the point's END, not just the serve that started it. A zero
  // duration is "unknown" in this data, and unknown is not good enough here.
  if (final.duration === null || final.duration <= 0) {
    return fail("missing_source_timing", "missing_final_point_duration");
  }

  // The window every known event has to fit inside. The final point's end is
  // always part of it, but it is not necessarily the last instant: a shot may
  // be recorded after its point's stored duration ends, and an interior point
  // with a long duration can run past the final point in malformed data. Every
  // KNOWN bound participates — that is what the file has to contain.
  let earliest = anchor.videoTime;
  let latest = final.videoTime + final.duration;

  let untimedPointCount = 0;
  for (const point of ordered) {
    if (!isUsableTime(point.videoTime)) {
      untimedPointCount += 1;
      continue;
    }
    earliest = Math.min(earliest, point.videoTime);
    latest = Math.max(latest, point.videoTime);
    // A zero or null duration is unknown, not an instant end; it contributes
    // nothing rather than inventing one.
    if (point.duration !== null && point.duration > 0) {
      latest = Math.max(latest, point.videoTime + point.duration);
    }
  }

  let untimedShotCount = 0;
  for (const shot of shots) {
    if (!isUsableTime(shot.videoTime)) {
      untimedShotCount += 1;
      continue;
    }
    earliest = Math.min(earliest, shot.videoTime);
    latest = Math.max(latest, shot.videoTime);
  }

  return {
    ok: true,
    value: {
      anchorPointNumber: anchor.pointNumber,
      anchorSourceSeconds: anchor.videoTime,
      finalPointNumber: final.pointNumber,
      requiredSourceEndSeconds: latest,
      earliestSourceSeconds: earliest,
      untimedPointCount,
      untimedShotCount,
    },
  };
}

/* -------------------------------------------------------------------------
 * Alignment
 * ---------------------------------------------------------------------- */

/** Convert a source timestamp to the attached file's clock. */
export function sourceToVideoSeconds(
  sourceSeconds: number,
  offsetSeconds: number,
): number {
  return sourceSeconds - offsetSeconds;
}

export interface AlignmentCoverage {
  /** Video-clock instant of the earliest known source event. */
  requiredVideoStartSeconds: number;
  /** Video-clock instant of the final point's end. */
  requiredVideoEndSeconds: number;
  videoDurationSeconds: number;
  toleranceSeconds: number;
}

export interface Alignment {
  /** `firstSourceTime - confirmedVideoTime`; negative values are valid. */
  offsetSeconds: number;
  confirmedVideoTimeSeconds: number;
  timing: SourceTimingSummary;
  coverage: AlignmentCoverage;
}

export interface AlignmentInput {
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  /** Raw user/client input; parsed strictly here. */
  confirmedVideoTime: unknown;
  /** Server-verified duration of the file. */
  videoDurationSeconds: number;
}

/**
 * Validate an alignment and compute its offset.
 *
 * Runs in the browser before upload and again on the server before activation
 * or correction, from the same source rows, so the two can never disagree.
 *
 * Order matters: source timing is checked before the entered time, because a
 * match that cannot be aligned at all should say so rather than blame whatever
 * the user typed.
 */
export function planAlignment(
  input: AlignmentInput,
): MatchVideoResult<Alignment> {
  const timing = summarizeSourceTiming(input.points, input.shots);
  if (!timing.ok) return timing;

  const confirmed = parseConfirmedVideoTime(input.confirmedVideoTime);
  if (!confirmed.ok) return confirmed;

  const duration = input.videoDurationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) {
    return fail("unsupported_media", "video_duration_unusable");
  }
  if (confirmed.value > duration) {
    return fail("invalid_alignment", "confirmed_time_past_end");
  }

  // Derived from the source clock every time. Never from a stored offset, and
  // never rounded — the confirmed position carries the millisecond
  // quantisation, the source timestamps keep their own precision.
  const offsetSeconds = timing.value.anchorSourceSeconds - confirmed.value;

  const requiredVideoStartSeconds = sourceToVideoSeconds(
    timing.value.earliestSourceSeconds,
    offsetSeconds,
  );
  const requiredVideoEndSeconds = sourceToVideoSeconds(
    timing.value.requiredSourceEndSeconds,
    offsetSeconds,
  );

  const coverage: AlignmentCoverage = {
    requiredVideoStartSeconds,
    requiredVideoEndSeconds,
    videoDurationSeconds: duration,
    toleranceSeconds: COVERAGE_TOLERANCE_SECONDS,
  };

  // Cosmetic playback padding is NOT considered here. A file that ends one
  // second after the final point covers the match; its lead-out is simply
  // clipped during playback.
  if (requiredVideoStartSeconds < -COVERAGE_TOLERANCE_SECONDS) {
    return fail("insufficient_coverage", "coverage_before_start");
  }
  if (requiredVideoEndSeconds > duration + COVERAGE_TOLERANCE_SECONDS) {
    return fail("insufficient_coverage", "coverage_past_end");
  }

  return {
    ok: true,
    value: {
      offsetSeconds,
      confirmedVideoTimeSeconds: confirmed.value,
      timing: timing.value,
      coverage,
    },
  };
}
