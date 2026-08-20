/**
 * Grade a stored vendor results payload and record why.
 *
 * Lives in the service layer rather than in the webhook route so that the
 * webhook, a backfill, and any future reprocessing all run the *same* code. A
 * grading function that exists in two places is a grading function that will
 * eventually disagree with itself, and the whole point of the grade is that it
 * is comparable across jobs.
 *
 * The work is trivial — a full match parses and grades in about 3 ms — which is
 * why this does not need the Edge Function the original spec assumed. That
 * design was written against a 60-second Vercel ceiling and an unmeasured
 * workload; the ceiling is real, the workload turned out not to be. The webhook
 * calls this from `after()`, so the 200 is already sent before any of it runs,
 * which was the spec's other reason for moving it out of process.
 *
 * Grading only. It writes no `points`, no `shots`, and calls no stats function
 * — see docs/splitstep-vendor-questions.md §5 for why the write path is still
 * closed. Reassess the Edge Function question there, where bulk inserts have a
 * duration nobody has measured.
 */

import type { createAdminClient } from '@/lib/supabase/admin';
import { RESULTS_BUCKET } from './config';
import { analyzeResults, DERIVATION_VERSION } from './derivation';
import type { QualityReport } from './derivation';

const LOG = '[splitstep:grade]';

export type GradeOutcome =
  | { ok: true; quality: QualityReport }
  | { ok: false; reason: string };

/**
 * Read a results payload, grade it, and persist the grade.
 *
 * Never throws. A job whose analysis is stored but ungraded is one somebody can
 * grade later; a webhook handler that throws inside `after()` is a lost
 * delivery. Those are not close in cost, so every failure path here returns a
 * reason instead of propagating.
 */
export async function gradeResults(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
  objectKey: string;
  /** The payload as just downloaded, when the caller already holds it. */
  body?: string;
}): Promise<GradeOutcome> {
  const { supabase, jobId, objectKey, body } = params;

  try {
    let text = body;

    // Absent on a redelivery of an already-stored result: the download is
    // skipped upstream, so the bytes have to come back out of storage.
    if (text === undefined) {
      const { data, error } = await supabase.storage
        .from(RESULTS_BUCKET)
        .download(objectKey);
      if (error || !data) {
        const reason = `could not read stored results: ${error?.message ?? 'no data'}`;
        console.error(`${LOG} skipped`, { jobId, objectKey, reason });
        return { ok: false, reason };
      }
      text = await data.text();
    }

    // startTimeSeconds is deliberately not applied. Every quality check is
    // time-invariant — they count coordinates, identities and score
    // transitions — so fetching the trim offset would be a query that changes
    // no output. The offset matters when timestamps are persisted, which is the
    // write path's problem, not this one's.
    const analysis = analyzeResults(JSON.parse(text));

    // Deliberately does NOT write `derivation_version`. That column means "the
    // engine produced the points and shots rows", and `resolveAnalysisStatus()`
    // in src/lib/data/match-analysis.ts reads it as exactly that: a job that is
    // `completed` with a non-null version resolves to "Analyzed" rather than
    // "processed". Stamping it here made a graded-but-underived match claim to
    // be analysed while carrying zero points and zero match_stats, which is the
    // empty-charts state that column was introduced to prevent. Grading
    // produces a grade; the version of the grader travels inside the report.
    const { error } = await supabase
      .from('processing_jobs')
      .update({
        derivation_confidence: analysis.quality.grade,
        derivation_quality: { ...analysis.quality, gradedBy: DERIVATION_VERSION },
      })
      .eq('id', jobId);

    if (error) {
      const reason = `computed but could not be saved: ${error.message}`;
      console.error(`${LOG} ${reason}`, { jobId });
      return { ok: false, reason };
    }

    // A low grade logs at error level because it is the signal that a match
    // should not be shown to a coach, and it is otherwise invisible until
    // somebody thinks to query the column.
    const log = analysis.quality.grade === 'low' ? console.error : console.log;
    log(`${LOG} graded ${analysis.quality.grade}`, {
      jobId,
      strokes: analysis.strokes.length,
      rallies: analysis.rallies.length,
      failures: analysis.quality.failures,
      warnings: analysis.quality.warnings,
    });

    return { ok: true, quality: analysis.quality };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} threw — results are stored, grade is not`, {
      jobId,
      objectKey,
      reason,
    });
    return { ok: false, reason };
  }
}
