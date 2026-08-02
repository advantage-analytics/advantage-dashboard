/**
 * R2 object key layout (spec §3.2).
 *
 * Originals and results live in separate buckets (R2_BUCKET_VIDEOS /
 * R2_BUCKET_RESULTS), so these prefixes are redundant within their own bucket.
 * They are kept anyway: the keys show up in logs and in the Worker, and a bare
 * `{user_id}/{match_id}/original.mp4` reads identically in both buckets.
 *
 * Keys are never exposed to the vendor. The URL they receive carries an opaque
 * token; the Worker resolves that to a key server-side. Anything derivable from
 * a key — user id, match id — therefore stays internal.
 */

import { ACCEPTED_VIDEO_EXTENSIONS } from './config';

export type AcceptedVideoExtension = (typeof ACCEPTED_VIDEO_EXTENSIONS)[number];

/**
 * Extension for a source video, derived from the file name.
 *
 * Throws rather than defaulting: an unrecognised container should have been
 * rejected by the validator long before a key is built, so reaching here with
 * one means the validation gate was bypassed.
 */
export function videoExtensionFor(fileName: string): AcceptedVideoExtension {
  const lower = fileName.toLowerCase();
  const match = ACCEPTED_VIDEO_EXTENSIONS.find((ext) => lower.endsWith(ext));

  if (!match) {
    throw new Error(
      `Unsupported video container for "${fileName}". Expected one of ${ACCEPTED_VIDEO_EXTENSIONS.join(', ')}.`
    );
  }

  return match;
}

/** `videos/{user_id}/{match_id}/original.{ext}` */
export function videoObjectKey(params: {
  userId: string;
  matchId: string;
  fileName: string;
}): string {
  const ext = videoExtensionFor(params.fileName);
  return `videos/${params.userId}/${params.matchId}/original${ext}`;
}

/** `results/{user_id}/{match_id}/{job_id}.json` */
export function resultsObjectKey(params: {
  userId: string;
  matchId: string;
  jobId: string;
}): string {
  return `results/${params.userId}/${params.matchId}/${params.jobId}.json`;
}
