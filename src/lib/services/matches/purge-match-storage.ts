import type { SupabaseClient } from '@supabase/supabase-js';
import { RESULTS_BUCKET } from '@/lib/services/splitstep/config';
import { deleteVideoBlob } from '@/lib/services/splitstep/video-url';
import { MATCH_DATA_BUCKET } from '@/lib/services/upload/storage.service';

/**
 * Remove every stored object belonging to a set of matches.
 *
 * MUST run BEFORE the match rows are deleted, and that ordering is
 * load-bearing: `video_object_key`, `trimmed_object_key` and
 * `results_object_key` all live on `processing_jobs`, which cascades away with
 * the match. Delete the rows first and the keys are gone, leaving objects that
 * nothing can even name — a permanent multi-GB leak in the video store's case.
 *
 * Extracted from the match DELETE route so account deletion runs the identical
 * cleanup. A foreign-key `ON DELETE CASCADE` would have been the easy way to
 * make accounts deletable, and it would have skipped all of this: athlete video
 * left in Azure, still billed, still holding footage the person just asked to
 * have erased.
 *
 * Every step is best-effort. A stranded file is recoverable (see
 * `scripts/cleanup-orphan-storage.ts`); a match or account the user cannot
 * delete is not. So failures log and the caller proceeds regardless.
 */
export async function purgeMatchStorage(
  supabase: SupabaseClient,
  matchIds: string[],
  /** Prefixes the logs, so a stranded object says which path left it. */
  label = 'match delete'
): Promise<void> {
  if (matchIds.length === 0) return;

  // Both storage cleanups key off the same rows, so they are read once here
  // rather than issuing two near-identical SELECTs.
  //
  // The error is bound and logged rather than discarded. If this read fails,
  // both cleanups silently do nothing and the rows are deleted anyway — a
  // permanent multi-GB leak whose only trace would otherwise be its absence.
  const { data: jobs, error: jobsError } = await supabase
    .from('processing_jobs')
    .select('video_object_key, trimmed_object_key, results_object_key')
    .in('match_id', matchIds);

  if (jobsError) {
    console.error(
      `[${label}] could not read storage keys for ${matchIds.length} match(es) — ` +
        `video and results will be stranded, recover with ` +
        `scripts/cleanup-orphan-storage.ts:`,
      jobsError.message
    );
  }

  // The three cleanups key only off the ids and none reads another's output, so
  // they run concurrently rather than costing the sum of their latencies. Each
  // keeps its own try/catch: a throw in the video step must not skip the other
  // two, which is exactly what a single wrapping try would do.
  await Promise.all([
    (async () => {
      try {
        // 1. Videos. Deleted inline rather than through an edge function: this
        //    runtime already holds the storage account key, because the same key
        //    signs the vendor's read SAS.
        //
        //    BOTH keys, not just the source. `trimmed_object_key` is our copy of
        //    the vendor's re-encode, and once the sweeper has removed the source
        //    it is the ONLY video for this match — several GB of it.
        //
        //    Deduped: every job for one match points at the same source blob, so
        //    a re-submitted match would otherwise delete the same blob twice.
        const blobNames = [
          ...new Set(
            (jobs ?? [])
              .flatMap((j) => [
                j.video_object_key as string | null,
                j.trimmed_object_key as string | null,
              ])
              .filter((k): k is string => Boolean(k))
          ),
        ];

        const removed = await Promise.all(
          blobNames.map((blobName) => deleteVideoBlob({ blobName }))
        );

        const count = removed.filter((r) => r.deleted).length;
        if (count > 0) {
          console.log(`[${label}] removed ${count} video blob(s)`);
        }
      } catch (err) {
        console.error(`[${label}] video cleanup threw:`, err);
      }
    })(),

    (async () => {
      try {
        // 2. Raw provider results in Supabase Storage. Same bucket the webhook
        //    writes to, so this client can remove them directly.
        const resultKeys = (jobs ?? [])
          .map((j) => j.results_object_key as string | null)
          .filter((k): k is string => Boolean(k));

        if (resultKeys.length > 0) {
          const { error: resultsError } = await supabase.storage
            .from(RESULTS_BUCKET)
            .remove(resultKeys);

          if (resultsError) {
            console.error(
              `[${label}] results cleanup failed for ${RESULTS_BUCKET}:`,
              resultsError.message
            );
          }
        }
      } catch (err) {
        console.error(`[${label}] results cleanup threw:`, err);
      }
    })(),

    (async () => {
      try {
        // 3. Uploaded provider files (SwingVision .xlsx and friends). There is
        //    one bucket for these, so it is named directly rather than read from
        //    a row.
        const { data: files, error: filesError } = await supabase
          .from('match_files')
          .select('storage_path')
          .in('match_id', matchIds);

        if (filesError) {
          console.error(`[${label}] could not read match_files:`, filesError.message);
          return;
        }

        const paths = (files ?? [])
          .map((f) => f.storage_path as string | null)
          .filter((p): p is string => Boolean(p));

        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from(MATCH_DATA_BUCKET)
            .remove(paths);

          if (storageError) {
            console.error(
              `[${label}] storage cleanup failed for ${MATCH_DATA_BUCKET}:`,
              storageError.message
            );
          }
        }
      } catch (err) {
        console.error(`[${label}] storage cleanup threw:`, err);
      }
    })(),
  ]);
}
