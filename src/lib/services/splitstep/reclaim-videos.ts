/**
 * Reclaim source videos that a confirmed trimmed copy has superseded.
 *
 * ── Why this is not in the webhook ───────────────────────────────────────────
 * The webhook starts an Azure server-side copy and returns; for a multi-gigabyte
 * match that copy is still `pending` when the request ends, so the delete there
 * essentially never fires. A vendor redelivery cannot pick it up either — by
 * then both artifacts are recorded, so the webhook takes no after() path at all.
 *
 * Without this, the automatic deletion the webhook used to do was simply gone,
 * and ~5 GB per completed match accumulated until a human remembered to run a
 * script. That is what this closes: a cron calls it daily, and
 * scripts/cleanup-orphan-storage.ts calls the same function so the two cannot
 * drift the way a re-implementation would.
 *
 * Distinct from the orphan sweep in that script. That one deletes bytes for
 * matches that no longer exist; this deletes bytes for matches that very much
 * do, on the grounds that we hold a better copy of the same match.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { deleteVideoBlob, trimmedCopyStatus } from './video-url';

export interface ReclaimOutcome {
  /** Jobs holding both a source key and a trimmed key. */
  examined: number;
  /** Sources whose trimmed copy Azure confirms complete — safe to remove. */
  eligible: number;
  /**
   * Source blobs actually removed. Equals `eligible` on a clean apply run, and
   * is always 0 on a dry run. Tracked separately so a delete that threw shows up
   * as 2/3 rather than being quietly excluded from both numbers.
   */
  reclaimed: number;
  /** Copies still running. Checked again next run; nothing to do. */
  pending: number;
  /**
   * Copies Azure reports `failed` or `aborted`.
   *
   * These need a human: the job claims a trimmed copy it does not have, and
   * `trimmed_video_url` — the only way to fetch it again — expires about a week
   * after the completion. Surfaced separately from `pending` precisely so it
   * does not read as routine.
   */
  broken: { jobId: string; blobName: string; status: string }[];
}

/**
 * @param apply False lists what would be deleted without deleting it.
 * @param log Progress sink. The script prints these; the cron route logs them.
 */
export async function reclaimSupersededSources(params: {
  supabase: SupabaseClient;
  apply: boolean;
  log?: (line: string) => void;
}): Promise<ReclaimOutcome> {
  const { supabase, apply } = params;
  const log = params.log ?? (() => {});

  const outcome: ReclaimOutcome = {
    examined: 0,
    eligible: 0,
    reclaimed: 0,
    pending: 0,
    broken: [],
  };

  const { data, error } = await supabase
    .from('processing_jobs')
    .select('id, video_object_key, trimmed_object_key')
    .not('video_object_key', 'is', null)
    .not('trimmed_object_key', 'is', null);

  if (error) {
    // Not thrown: the caller is a cron or a sweep script, and neither should
    // fail loudly enough to page someone over a storage-reclamation read.
    log(`could not read processing_jobs: ${error.message}`);
    return outcome;
  }

  const jobs = (data ?? []) as {
    id: string;
    video_object_key: string;
    trimmed_object_key: string;
  }[];

  outcome.examined = jobs.length;

  for (const job of jobs) {
    // Per job rather than batched: Azure reports copy state only on the
    // destination blob itself. The candidate set is jobs that completed, which
    // is dozens even in a busy month.
    const status = await trimmedCopyStatus({ blobName: job.trimmed_object_key });

    if (status === 'failed' || status === 'aborted') {
      outcome.broken.push({
        jobId: job.id,
        blobName: job.trimmed_object_key,
        status,
      });
      continue;
    }

    if (status !== 'success') {
      outcome.pending++;
      continue;
    }

    outcome.eligible++;

    if (!apply) {
      log(`would delete ${job.video_object_key}`);
      continue;
    }

    try {
      await deleteVideoBlob({ blobName: job.video_object_key });

      // Cleared so the query above stops matching this job. Without it every
      // future run re-examines the same rows, re-issues a delete for a blob that
      // is already gone, and reports "N found / 0 deleted" forever — which on a
      // destructive script is indistinguishable from a broken sweep.
      //
      // Nothing is lost by clearing it: the blob it named does not exist, and
      // the submit route refuses a job in any status but `uploaded` long before
      // it reads this column.
      const { error: clearError } = await supabase
        .from('processing_jobs')
        .update({ video_object_key: null })
        .eq('id', job.id);

      if (clearError) {
        // The bytes are gone but the row still points at them. Harmless except
        // that the next run repeats the no-op delete.
        log(
          `deleted ${job.video_object_key} but could not clear the key: ${clearError.message}`
        );
      }

      outcome.reclaimed++;
      log(`reclaimed ${job.video_object_key}`);
    } catch (err) {
      log(
        `could not delete ${job.video_object_key}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return outcome;
}
