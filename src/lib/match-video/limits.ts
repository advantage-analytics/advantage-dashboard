/**
 * Numeric limits for SwingVision video attachment.
 *
 * Kept apart from the timing maths so a route handler, the wizard and a
 * migration comment can all cite the same constant instead of retyping it.
 * No Azure, no Supabase, no Next.js.
 */

import { fail, type MatchVideoResult } from "./types";

/**
 * Attachment size ceiling, in bytes.
 *
 * Deliberately a dedicated constant rather than a reference to the vendor
 * upload validator: attachments never reach the analysis vendor, so coupling
 * them to vendor eligibility would drag resolution and frame-rate rules along
 * with the number.
 */
export const MATCH_VIDEO_MAX_BYTES = 7_999_999_999;

/** What the wizard prints next to the drop zone. */
export const MATCH_VIDEO_MAX_BYTES_LABEL = "Under 8 GB";

/**
 * Slack allowed when checking whether the recording covers the match.
 *
 * Source timestamps come from a phone's clock and container durations are
 * rounded to a sample boundary, so demanding an exact fit would reject
 * recordings that are fine. A tenth of a second is far below one point.
 */
export const COVERAGE_TOLERANCE_SECONDS = 0.1;

/**
 * Fractional digits kept on the confirmed first-point position.
 *
 * The CONFIRMED time is rounded to milliseconds because that is what the input
 * field accepts and what the database stores. The SOURCE timestamps and the
 * offset derived from them are never rounded — rounding the offset would move
 * every seek in the match by up to half a millisecond for no reason.
 */
export const CONFIRMED_TIME_DECIMALS = 3;

/**
 * Cosmetic lead-in/lead-out around a point during playback.
 *
 * Presentation only. It is clamped to the file's edges AFTER validation and is
 * never evidence that the recording covers the match — a file that ends one
 * second after the final point is valid even though its padding is clipped.
 */
export const PLAYBACK_PADDING_SECONDS = 1.5;

/** Seconds a client waits before re-sending a completion that returned 202. */
export const COMPLETION_RETRY_SECONDS = 2;

/**
 * Containers accepted for attachment.
 *
 * AVI is absent on purpose: the pinned Mediabunny build ships no AVI reader, so
 * the server could not verify one. A selected .avi gets the MP4 export guidance
 * before any bytes move. An extension in this list is a precondition, not
 * acceptance — the file still has to decode and report a finite duration.
 */
export const MATCH_VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".m4v",
  ".mkv",
  ".webm",
] as const;

export const MATCH_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
  "video/webm",
] as const;

/**
 * Size gate, run before an upload credential is minted and again against the
 * measured blob. An empty file is refused separately from an oversized one:
 * a zero-byte upload usually means the transfer never started.
 */
export function checkAttachmentSize(
  sizeBytes: number,
): MatchVideoResult<number> {
  if (!Number.isFinite(sizeBytes) || !Number.isInteger(sizeBytes)) {
    return fail("empty_file", "size_not_an_integer");
  }
  if (sizeBytes <= 0) {
    return fail("empty_file", "size_not_positive");
  }
  if (sizeBytes > MATCH_VIDEO_MAX_BYTES) {
    return fail("file_too_large", "size_over_limit");
  }
  return { ok: true, value: sizeBytes };
}
