/**
 * Reprocessing — an admin resending an already-COMPLETED job to the vendor to
 * pick up a newer model's output (new `ball_*` stroke columns, trajectories
 * past the bounce). Not billable, never athlete-facing.
 *
 * There is no column for it, and none is needed: `resubmitJob()` only ever
 * links a child to a `failed` or `cancelled` parent, except in its
 * `reprocess` mode, which only links one to a `completed` parent. So
 *
 *     a job is a reprocess child  ⇔  its `resubmitted_from_job_id` names a
 *                                     job whose status is `completed`
 *
 * and the parent's status cannot move off `completed` afterwards
 * (`splitstep_status_rank()` never lets a terminal row go backwards).
 *
 * What a reprocess child changes downstream, and where:
 *   • the match page and lists ignore it until it, too, is `completed`
 *     (`hideInFlightReprocess`, in `loadMatchAnalysis`) — the athlete keeps
 *     their report while the vendor works, and a failed reprocess is never
 *     shown as "analysis failed";
 *   • `deriveAndPublish()` treats it as a rebuild — the player mapping pinned
 *     to the published rows, a refusal (hand labels included) keeps the job
 *     `completed` — and carries the parent's labelled `fold` across;
 *   • `notifyAnalysisOutcome()` sends the athlete nothing for it;
 *   • `resubmitJob()` never auto-retries it and never lets the athlete's
 *     "Retry analysis" spend quota on its chain.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const LOG = "[splitstep-reprocess]";

/** The two columns the pure check reads. */
export interface ReprocessLinkRow {
  id: string;
  status: string;
  resubmitted_from_job_id: string | null;
}

/**
 * Is `row` a reprocess child, judged from the match's own job rows? Pure —
 * the loaders already hold every row for the match.
 */
export function isReprocessChildIn(
  row: ReprocessLinkRow,
  rows: readonly ReprocessLinkRow[],
): boolean {
  if (!row.resubmitted_from_job_id) return false;
  const parent = rows.find((r) => r.id === row.resubmitted_from_job_id);
  return parent?.status === "completed";
}

/**
 * The rows the athlete-facing analysis state should choose from: every row
 * except a reprocess child that has not completed. A completed child stays —
 * it is the newest finished analysis and its files are the ones to read.
 */
export function hideInFlightReprocess<T extends ReprocessLinkRow>(
  rows: readonly T[],
): T[] {
  return rows.filter(
    (row) => row.status === "completed" || !isReprocessChildIn(row, rows),
  );
}

/**
 * `isReprocessChildIn` for a caller holding only a job id. Reads two rows.
 * A read that fails (or throws) answers `reprocess: false` — the ordinary path — and logs;
 * the callers use it to SUPPRESS things (mail, a failed status), so the safe
 * miss is to behave as before this existed.
 */
export async function readReprocessParent(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ reprocess: boolean; parentId: string | null }> {
  try {
    return await readLineage(supabase, jobId);
  } catch (err) {
    console.warn(`${LOG} lineage read threw`, {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { reprocess: false, parentId: null };
  }
}

async function readLineage(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ reprocess: boolean; parentId: string | null }> {
  const { data: job, error } = await supabase
    .from("processing_jobs")
    .select("resubmitted_from_job_id")
    .eq("id", jobId)
    .maybeSingle();
  const parentId =
    (job as { resubmitted_from_job_id: string | null } | null)
      ?.resubmitted_from_job_id ?? null;
  if (error || !parentId) {
    if (error) {
      console.warn(`${LOG} could not read the job's lineage`, {
        jobId,
        error: error.message,
      });
    }
    return { reprocess: false, parentId: null };
  }

  const { data: parent, error: parentError } = await supabase
    .from("processing_jobs")
    .select("status")
    .eq("id", parentId)
    .maybeSingle();
  if (parentError) {
    console.warn(`${LOG} could not read the parent's status`, {
      jobId,
      parentId,
      error: parentError.message,
    });
    return { reprocess: false, parentId };
  }
  return {
    reprocess: (parent as { status: string } | null)?.status === "completed",
    parentId,
  };
}
