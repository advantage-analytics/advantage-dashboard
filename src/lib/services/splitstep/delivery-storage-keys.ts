import {
  ballPathsUserSegment,
  playersObjectKey,
  resultsObjectKey,
  trajectoriesObjectKey,
} from "./object-keys";

/**
 * Choose the storage keys for a `completed` SplitStep delivery from the matched
 * job's attribution.
 *
 * Pulled out of `api/webhooks/splitstep/route.ts` so the orphan branching can
 * be unit-tested — the route itself is a Supabase-backed handler that cannot be.
 *
 * The JSON files — strokes (small), and since September 2026 the per-frame
 * players and trajectories files (larger, but still JSON) — are worth keeping
 * under any key just to have them. They ALWAYS get a key: the matched job's
 * `results/…` keys, or `orphaned/…` fallbacks when no job matched at all. The
 * three share one directory and differ by suffix.
 *
 * The vendor's trimmed video used to get a key here too; it is no longer
 * kept (retired 2026-11-12).
 *
 * The uploader path segment falls back to `former-member` when `created_by` is
 * null. That keeps every key's uploader segment non-null and — the load-bearing
 * part — keeps `match_id` as the THIRD path segment, which
 * `scripts/cleanup-orphan-storage.ts` reads to attribute an object to a match
 * (see the doc comment in `object-keys.ts`).
 */
export function selectDeliveryStorageKeys(params: {
  /** The matched `processing_jobs` id, or null when no job matched. */
  jobId: string | null;
  /** The job's uploader; null after they delete their account (see above). */
  createdBy: string | null;
  /** The job's match; null only when no job matched. */
  matchId: string | null;
  /** The vendor's job id, for the orphan fallback key. */
  externalJobId: string | null | undefined;
  /** This delivery's id, for the orphan fallback key. */
  deliveryId: string;
}): {
  /** The strokes JSON — `processing_jobs.results_object_key`. */
  resultsKey: string;
  playersKey: string;
  trajectoriesKey: string;
} {
  const { jobId, createdBy, matchId, externalJobId, deliveryId } = params;

  if (!jobId) {
    const orphanDir = `orphaned/${externalJobId ?? "unknown"}`;
    return {
      resultsKey: `${orphanDir}/${deliveryId}.json`,
      playersKey: `${orphanDir}/${deliveryId}.players.json`,
      trajectoriesKey: `${orphanDir}/${deliveryId}.trajectories.json`,
    };
  }

  const uploaderSegment = ballPathsUserSegment(createdBy);
  const ids = { userId: uploaderSegment, matchId: matchId!, jobId };

  return {
    resultsKey: resultsObjectKey(ids),
    playersKey: playersObjectKey(ids),
    trajectoriesKey: trajectoriesObjectKey(ids),
  };
}
