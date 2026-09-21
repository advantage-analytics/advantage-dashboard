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

import { ACCEPTED_VIDEO_EXTENSIONS } from "./config";

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
      `Unsupported video container for "${fileName}". Expected one of ${ACCEPTED_VIDEO_EXTENSIONS.join(", ")}.`,
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
 * `results/{user_id}/{match_id}/{job_id}.players.json` — the vendor's per-frame
 * player tracking (`players_url`, September 2026 API).
 *
 * Beside the strokes file, not under a new prefix: it is the same job's output,
 * and the sweeper attributes by the third segment regardless of the suffix.
 * The strokes file keeps the bare `.json` name so nothing that already reads
 * `results_object_key` has to change.
 */
export function playersObjectKey(params: {
  userId: string;
  matchId: string;
  jobId: string;
}): string {
  return `results/${params.userId}/${params.matchId}/${params.jobId}.players.json`;
}

/** `results/{user_id}/{match_id}/{job_id}.trajectories.json` — per-frame ball trajectory. */
export function trajectoriesObjectKey(params: {
  userId: string;
  matchId: string;
  jobId: string;
}): string {
  return `results/${params.userId}/${params.matchId}/${params.jobId}.trajectories.json`;
}

/**
 * `results/{user_id}/{match_id}/{job_id}.ball-paths.json` — OUR derived file,
 * one compact flight path per stroke (derivation/ball-paths.ts).
 *
 * Beside the vendor files it is derived from, for the same reason they sit
 * together: one job's output, and the match id stays the THIRD segment, which
 * is how cleanup-orphan-storage.ts attributes it. Deterministic on purpose —
 * there is no column recording it, so a reader rebuilds this key from the job.
 */
export function ballPathsObjectKey(params: {
  userId: string;
  matchId: string;
  jobId: string;
}): string {
  return `results/${params.userId}/${params.matchId}/${params.jobId}.ball-paths.json`;
}

/**
 * The user segment of a job's ball-paths key, from `processing_jobs.created_by`.
 *
 * `former-member` mirrors delivery-storage-keys.ts: a retained team match
 * whose uploader deleted their account keeps its match id and loses
 * `created_by`, and its vendor files already sit under that segment. The
 * writer (ball-paths-store.ts) and the reader (ball-paths-access.ts) both go
 * through this, because the key is recorded nowhere — a reader that built the
 * segment any other way would never find the file.
 */
export function ballPathsUserSegment(createdBy: string | null): string {
  return createdBy ?? "former-member";
}

/** A usable id: a non-empty string that cannot introduce a path segment. */
function isKeySegment(value: unknown): value is string {
  return typeof value === "string" && value !== "" && !value.includes("/");
}

/**
 * The user segment a job's files were WRITTEN under, read back off its
 * recorded `results_object_key` — or `null` when that key does not prove one.
 *
 * Why it exists: `ball-paths.json` is recorded nowhere, and
 * `processing_jobs.created_by` is nulled when the uploader leaves, after which
 * `ballPathsUserSegment` answers `former-member` and a file written earlier
 * under the uploader's uuid can no longer be recomputed. It always sits beside
 * the results key the webhook recorded in the same delivery, so that key's
 * segment names it.
 *
 * ANCHORED, never a search. The key must be EXACTLY
 * `results/{segment}/{match_id}/{job_id}.json` for the ids given, with a
 * non-empty segment: four parts, the literal prefix, this match, this job's
 * bare `.json` name. Anything else is `null` — a null or non-string key, an
 * empty or slash-bearing id, an adopted `orphaned/…` key, another match's or
 * job's key, a `.players.json` name. Callers feed the segment to a service-role
 * `download` or `remove`, so a loose match here would reach another match's
 * files.
 *
 * Returns the SEGMENT, not a finished key: every caller still builds its key
 * through `ballPathsObjectKey`, so there is one place that spells the layout.
 */
export function resultsKeyUserSegment(params: {
  resultsObjectKey: unknown;
  matchId: unknown;
  jobId: unknown;
}): string | null {
  const { resultsObjectKey, matchId, jobId } = params;
  if (typeof resultsObjectKey !== "string") return null;
  if (!isKeySegment(matchId) || !isKeySegment(jobId)) return null;

  const parts = resultsObjectKey.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "results" ||
    parts[1] === "" ||
    parts[2] !== matchId ||
    parts[3] !== `${jobId}.json`
  ) {
    return null;
  }
  return parts[1];
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
