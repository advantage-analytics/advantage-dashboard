import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Merge `patch` into the job's `derivation_quality`, which `grade-results.ts`
 * wrote at grade time — every key it holds (`grade`, `checks`, `failures`, …)
 * and any key not in `patch` is kept. Used for `fold` (an unreconciled fold,
 * or a hand-labelled publish's own answer) and `segmentation` (the segmenter's
 * proposal). A read-modify-write rather than a jsonb `||` because there is no
 * RPC for it and nothing else writes the job while it is derived or published.
 *
 * Bookkeeping only: the rows are already published, so a failure here is
 * logged and swallowed — it must never turn a finished publish into a failed
 * one.
 */
export async function mergeDerivationQuality(
  supabase: AdminClient,
  jobId: string,
  patch: Record<string, unknown>,
  log: string,
): Promise<void> {
  try {
    const existing = await readDerivationQuality(supabase, jobId);
    const { error: writeError } = await supabase
      .from("processing_jobs")
      .update({ derivation_quality: { ...existing, ...patch } })
      .eq("id", jobId);
    if (writeError) throw new Error(writeError.message);
  } catch (err) {
    console.error(`${log} could not merge derivation_quality`, {
      jobId,
      keys: Object.keys(patch),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** The job's `derivation_quality` as an object — `{}` when it holds none. */
export async function readDerivationQuality(
  supabase: AdminClient,
  jobId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("derivation_quality")
    .eq("id", jobId)
    .single<{ derivation_quality: Record<string, unknown> | null }>();
  if (error) throw new Error(error.message);
  const existing = data?.derivation_quality;
  return existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing
    : {};
}

/**
 * The job whose `derivation_quality.fold` the match report reads: the match's
 * latest completed one (`resolveFoldUnreconciled`, match-detail-server.ts).
 * A writer that means the report to see its fold writes it here.
 */
export async function reportedJobId(
  supabase: AdminClient,
  matchId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("match_id", matchId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0]?.id as string | undefined) ?? null;
}
