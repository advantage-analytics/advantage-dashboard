/**
 * Grade completed SplitStep jobs that predate the grading step.
 *
 * Calls the same `gradeResults()` the webhook calls, so this is a real
 * exercise of the production path rather than a reimplementation of it.
 *
 * Idempotent: a job already carrying the current `derivation_version` is
 * skipped, so re-running costs nothing. Pass --force to regrade anyway, which
 * is what you want after changing a threshold or adding a check.
 *
 * Run from repo root:
 *   npx tsx scripts/splitstep-backfill-grades.ts             # grade what needs it
 *   npx tsx scripts/splitstep-backfill-grades.ts --force     # regrade everything
 *   npx tsx scripts/splitstep-backfill-grades.ts --job <uuid>
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'node:fs';
import { createAdminClient } from '@/lib/supabase/admin';
import { gradeResults } from '@/lib/services/splitstep/grade-results';
import { DERIVATION_VERSION } from '@/lib/services/splitstep/derivation';

// Minimal .env.local loader, matching scripts/splitstep-submit.ts. A dotenv
// dependency for two variables in a script would be a dependency the app never
// needs at runtime.
try {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, k, v] = match;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '').trim();
  }
} catch {
  // Fine when the variables are already exported in the environment.
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const force = process.argv.includes('--force');
  const jobFlag = process.argv.indexOf('--job');
  const onlyJob = jobFlag !== -1 ? process.argv[jobFlag + 1] : null;

  // Refuse rather than widen. `--job` with its uuid missing or eaten by the
  // shell used to leave onlyJob undefined, which fell through the filter and
  // quietly ran against EVERY completed job — destructively so with --force.
  // A request to narrow that cannot be honoured must not silently broaden.
  if (jobFlag !== -1 && !UUID.test(onlyJob ?? '')) {
    console.error(
      `--job needs a job uuid; got ${onlyJob === undefined ? 'nothing' : `"${onlyJob}"`}.`
    );
    process.exit(1);
  }

  const supabase = createAdminClient();

  let query = supabase
    .from('processing_jobs')
    .select('id, match_id, results_object_key, derivation_quality, derivation_confidence')
    .eq('status', 'completed')
    .not('results_object_key', 'is', null);

  if (onlyJob) query = query.eq('id', onlyJob);

  const { data, error } = await query;
  if (error) {
    console.error('Could not list jobs:', error.message);
    process.exit(1);
  }

  const jobs = data ?? [];
  console.log(`${jobs.length} completed job(s) with stored results`);

  let graded = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    // Read the grader version out of the report, not out of
    // `derivation_version` — that column belongs to the row-writing engine and
    // grading must leave it null. See grade-results.ts.
    const gradedBy = (job.derivation_quality as { gradedBy?: string } | null)?.gradedBy;
    if (!force && gradedBy === DERIVATION_VERSION) {
      console.log(`  ${job.id}  skip (already ${gradedBy})`);
      skipped += 1;
      continue;
    }

    const outcome = await gradeResults({
      supabase,
      jobId: job.id,
      objectKey: job.results_object_key as string,
    });

    if (outcome.ok) {
      const q = outcome.quality;
      console.log(
        `  ${job.id}  ${q.grade.toUpperCase()}  ${q.strokeCount} strokes, ${q.rallyCount} rallies` +
          (q.failures.length ? `  failed: ${q.failures.join(', ')}` : '') +
          (q.warnings.length ? `  warned: ${q.warnings.join(', ')}` : '')
      );
      graded += 1;
    } else {
      console.error(`  ${job.id}  FAILED — ${outcome.reason}`);
      failed += 1;
    }
  }

  console.log(`\ngraded ${graded}, skipped ${skipped}, failed ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
