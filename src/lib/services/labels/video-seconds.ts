/**
 * Seconds of match video a job covers. Dependency-free so the label queue
 * rules (`queue.ts`) can use it from a client component; `practice-server.ts`
 * re-exports it for the pay report and the admin matches loader.
 */

/** The `processing_jobs` columns a video length is read from. */
export interface JobVideoSpan {
  start_time_seconds: number | string | null;
  end_time_seconds: number | string | null;
  billable_seconds: number | null;
}

/** Seconds of match video a job covers: its trimmed span, else what was billed. */
export function jobVideoSeconds(job: JobVideoSpan): number {
  const start = Number(job.start_time_seconds ?? 0);
  const end = Number(job.end_time_seconds ?? NaN);
  if (Number.isFinite(end) && end > start) return end - start;
  return job.billable_seconds ?? 0;
}
