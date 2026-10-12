/**
 * The one video shape every browser we serve can play: H.264, no taller than
 * 1080p.
 *
 * A phone's default recording often is not that. iPhones write HEVC unless set
 * to "Most Compatible", and 4K at 60 fps only as HEVC. The uploader's own
 * browser decodes it, so every local check passes, and then a viewer on a
 * browser with no HEVC decoder gets a media error (the Rhodri v Bao match,
 * 2026-10-08: 4K HEVC at 43 Mbps, which also ran the vendor's GPU out of
 * memory).
 *
 * Pure, so the wizard, the trim plan and `scripts/scan-video-codecs.ts` agree.
 */

/** Mediabunny's name for H.264. */
export const PLAYBACK_SAFE_VIDEO_CODEC = "avc";

/** The vendor's floor and our ceiling: the short side of a 1080p frame. */
export const PLAYBACK_MAX_SHORT_SIDE = 1080;

/** Rows a 1080p stream may be padded by to fill its last macroblock. */
const CODED_PADDING_ROWS = 8;

export interface VideoShape {
  /** Mediabunny's codec name, or null when the container does not name one. */
  videoCodec: string | null;
  codedWidth: number;
  codedHeight: number;
}

export type NormaliseReason = "codec" | "resolution" | "codec-and-resolution";

/**
 * Why this video should be re-encoded before it is stored, or null when it is
 * already the safe shape. An unnamed codec is left alone: there is nothing to
 * hand an encoder, and the existing probe warnings already cover it.
 */
export function normaliseReason(shape: VideoShape): NormaliseReason | null {
  const codec =
    shape.videoCodec !== null && shape.videoCodec !== PLAYBACK_SAFE_VIDEO_CODEC;
  // The short side, so a portrait 1080×1920 clip is not called "above 1080p".
  // With a macroblock of slack: H.264 codes 1080 rows as 1088, and a container
  // that reports the padded height must not send a plain 1080p file to an
  // encoder.
  const resolution =
    Math.min(shape.codedWidth, shape.codedHeight) >
    PLAYBACK_MAX_SHORT_SIDE + CODED_PADDING_ROWS;
  if (codec && resolution) return "codec-and-resolution";
  if (codec) return "codec";
  if (resolution) return "resolution";
  return null;
}
