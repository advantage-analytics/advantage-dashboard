/**
 * Match-video thumbnails: the rules both sides of the wire share.
 *
 * One small still per match, shown beside a list row so the row never has to
 * open the video. The image lives in the video container under
 * `thumbnails/{matchId}/{uuid}.jpg`; `matches.video_thumbnail_key` names it.
 *
 * Client-safe: no storage SDK, no Supabase. The server half is
 * `services/match-thumbnail/`.
 *
 * ── Why the key is checked before it is signed ──────────────────────────────
 * A match's creator may update their own `matches` row, so the column is a
 * value a signed-in user can write. Signing whatever it holds would turn it
 * into "read any blob in the container" — somebody else's video included.
 * {@link isThumbnailKeyFor} is therefore asked on every read: a key is only
 * ever signed when it sits under THAT match's own prefix and has the exact
 * shape this module mints.
 */

/** Stored width. Twice the widest row slot, so it stays crisp at 2×. */
export const THUMBNAIL_WIDTH_PX = 320;
/** Stored height: always 16:9, letterboxed when the video is not. */
export const THUMBNAIL_HEIGHT_PX = 180;

/** A 320×180 JPEG is 10–25 KB; anything near this is not one. */
export const THUMBNAIL_MAX_BYTES = 200 * 1024;

export const THUMBNAIL_CONTENT_TYPE = "image/jpeg";

/** How far past the start of play the still is taken — past the warm-up. */
export const THUMBNAIL_LEAD_SECONDS = 90;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`);

export const THUMBNAIL_KEY_PREFIX = "thumbnails/";

/** `thumbnails/{matchId}/` — everything this match ever stored. */
export function thumbnailPrefixFor(matchId: string): string {
  return `${THUMBNAIL_KEY_PREFIX}${matchId.toLowerCase()}/`;
}

/**
 * `thumbnails/{matchId}/{imageId}.jpg`.
 *
 * A fresh `imageId` per upload rather than one fixed name: read URLs are
 * stable for hours so the browser can cache the image, and a replaced
 * thumbnail under the same name would keep showing the old frame.
 */
export function thumbnailObjectKey(matchId: string, imageId: string): string {
  if (!UUID_ONLY.test(matchId.toLowerCase())) {
    throw new Error("thumbnailObjectKey: matchId is not a UUID");
  }
  if (!UUID_ONLY.test(imageId.toLowerCase())) {
    throw new Error("thumbnailObjectKey: imageId is not a UUID");
  }
  return `${thumbnailPrefixFor(matchId)}${imageId.toLowerCase()}.jpg`;
}

/**
 * True only for a key this module could have minted FOR THIS MATCH.
 *
 * The one gate between the column and a signature. Not a prefix test alone:
 * `thumbnails/{matchId}/../../videos/…` starts with the prefix too.
 */
export function isThumbnailKeyFor(
  matchId: string,
  key: string | null | undefined,
): key is string {
  if (typeof key !== "string" || typeof matchId !== "string") return false;
  const id = matchId.toLowerCase();
  if (!UUID_ONLY.test(id)) return false;
  const prefix = thumbnailPrefixFor(id);
  if (!key.startsWith(prefix)) return false;
  return new RegExp(`^${UUID}\\.jpg$`).test(key.slice(prefix.length));
}

/**
 * The second the still is taken at.
 *
 * {@link THUMBNAIL_LEAD_SECONDS} past where play starts, so the frame shows a
 * rally rather than a warm-up or an empty court — but never past the midpoint
 * of what is left, so a two-minute clip does not get its last frame.
 *
 * `startSeconds` is the first point where it is known (an analysed match),
 * the trim start for a new upload, and 0 otherwise.
 */
export function thumbnailCaptureTime(input: {
  durationSeconds: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
}): number {
  const duration =
    Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
      ? input.durationSeconds
      : 0;
  const start = clamp(input.startSeconds ?? 0, 0, duration);
  const end = clamp(input.endSeconds ?? duration, start, duration);
  const midpoint = start + (end - start) / 2;
  return Math.min(start + THUMBNAIL_LEAD_SECONDS, midpoint);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** JPEG starts FF D8 FF. The only image type a thumbnail may be. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}
