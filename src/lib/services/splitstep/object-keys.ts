/**
 * Object key layout (spec §3.2).
 *
 * Videos live in an Azure container and results in a Supabase Storage bucket, so
 * the leading prefix is redundant within either one. It is kept anyway: keys
 * show up in logs and in the sweeper, a bare `{user_id}/{match_id}/original.mp4`
 * reads identically in both stores, and cleanup-orphan-storage.ts identifies an
 * orphan by the match id being the THIRD path segment — which only holds while
 * every layout here carries a prefix.
 *
 * ── Keys are no longer private ───────────────────────────────────────────────
 * Under R2 the vendor received an opaque token and a Worker resolved it to a key
 * server-side, so user and match ids stayed internal. A SAS URL has no such
 * indirection: it names the blob. The vendor therefore sees the user id and
 * match id of anything we hand them, and both are opaque uuids that grant
 * nothing on their own. Do not read a new secret into this layout.
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

/**
 * `trimmed/{user_id}/{match_id}/{job_id}.mp4` — our copy of the vendor's
 * trimmed, re-encoded video.
 *
 * Keyed by job rather than by match, like the results key and unlike
 * videoObjectKey: a match resubmitted after a failure produces a second job, and
 * both trimmed videos are legitimately different cuts of the same match. Keying
 * by match would have the retry silently overwrite the first.
 *
 * `.mp4` is asserted, not derived. The vendor re-encodes rather than passing the
 * container through, and their docs describe the output only as "trimmed and
 * re-encoded" — so there is no source extension to carry over and nothing to
 * derive one from. If a job ever comes back in another container, this is the
 * line that is wrong.
 */
export function trimmedObjectKey(params: {
  userId: string;
  matchId: string;
  jobId: string;
}): string {
  return `trimmed/${params.userId}/${params.matchId}/${params.jobId}.mp4`;
}
