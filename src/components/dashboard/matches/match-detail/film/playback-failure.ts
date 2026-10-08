/**
 * Why a `<video>` on a signed playback URL raised `error`, for the two hosts
 * that have no endpoint to re-sign it (the Advantage Intelligence film and the
 * admin label console).
 *
 * The element's own code cannot say on its own: `MEDIA_ERR_SRC_NOT_SUPPORTED`
 * is what a browser reports for a file it has no decoder for AND for a 403 on
 * a link that has run out. The link carries its own expiry (`se=`), so a
 * decode-shaped error on a link that is still good is the file — in practice
 * 4K HEVC from a phone, which a browser without that decoder refuses — and
 * reloading signs a fresh link to the same unplayable bytes.
 *
 * Pure and JSX-free so both hosts and a spec can read it.
 */

export type PlaybackFailure = "format" | "link";

/** `MediaError.MEDIA_ERR_DECODE` and `MEDIA_ERR_SRC_NOT_SUPPORTED`. */
const DECODE_SHAPED_CODES = new Set([3, 4]);

/** The `se=` expiry of an Azure SAS URL, in epoch ms; null when it has none. */
export function signedUrlExpiry(url: string): number | null {
  const raw = /[?&]se=([^&#]+)/.exec(url)?.[1];
  if (!raw) return null;
  let expiry: string;
  try {
    expiry = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const at = Date.parse(expiry);
  return Number.isFinite(at) ? at : null;
}

export function playbackFailure(input: {
  /** `video.error?.code`. */
  code: number | null | undefined;
  url: string;
  now: number;
}): PlaybackFailure {
  if (input.code == null || !DECODE_SHAPED_CODES.has(input.code)) return "link";
  const expiry = signedUrlExpiry(input.url);
  // No readable expiry: keep the answer this panel has always given.
  if (expiry === null || input.now >= expiry) return "link";
  return "format";
}
