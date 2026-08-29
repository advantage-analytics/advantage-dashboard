/**
 * Real analysis state, read from `processing_jobs`.
 *
 * This is the swap point the mock in match-analysis.ts has been standing in
 * for. `getMatchAnalysis()` hash-cycled a fixture array and never touched the
 * database, so every status and percentage in the matches list was fabricated —
 * harmless while nothing real existed, actively misleading once it does.
 *
 * Loaded for a whole page of matches in one query rather than per row: the
 * matches list renders up to 50 at a time and a call each would be 50
 * round-trips for one screen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type MatchAnalysis,
  importedAnalysis,
  manualAnalysis,
  pipelinePercent,
  resolveAnalysisStatus,
} from './match-analysis';
import { formatClock } from '@/components/dashboard/matches/new-match-wizard/utils';

interface JobRow {
  id: string;
  match_id: string;
  updated_at: string;
  status: string;
  upload_progress_percent: number | null;
  error_message: string | null;
  billable_seconds: number | null;
  external_job_id: string | null;
  created_at: string;
  /**
   * Stamped by the derivation engine. Null means the vendor's `completed` has
   * not been turned into points and shots yet — see resolveAnalysisStatus().
   */
  derivation_version: string | null;
}

/**
 * Analysis state for each of `matchIds`, keyed by match id.
 *
 * A match with no job row is absent from the map — the caller decides whether
 * that means `imported` or `manual`, since only it knows the source provider.
 */
export async function loadMatchAnalysis(
  supabase: SupabaseClient,
  matchIds: string[],
  options: { reap?: boolean } = {}
): Promise<Map<string, MatchAnalysis>> {
  const out = new Map<string, MatchAnalysis>();
  if (matchIds.length === 0) return out;

  // Vendor-status reconciliation does NOT live here, deliberately, though it
  // fires at the same moments as `reap`. This module is imported by client
  // components (new-reports-subline, recent-activity) despite the -server
  // name, and the reconciler needs the admin client and @azure/storage-blob's
  // dependents — code that must never enter a client module graph. The two
  // Server Component pages that pass `reap: true` call
  // services/splitstep/reconcile.ts themselves, right before this loader.

  // Retire stalled uploads before reading, so a job whose tab was closed shows
  // "Failed" rather than a progress bar frozen at whatever percent it reached.
  //
  // On the read path rather than a schedule because that is exactly when it
  // matters — a stale row is only misleading while someone is looking at it —
  // and it avoids enabling pg_cron for one statement. Runs under the caller's
  // RLS, so a user only ever reaps their own. The predicate almost always
  // matches nothing and is served by processing_jobs_status_idx.
  //
  // OPT-IN, because it is a WRITE. It belongs to the surfaces that draw a
  // progress bar large enough for a frozen one to mislead — the matches list
  // and match detail. When the header activity tray started calling this
  // loader, the reap came with it and began firing an UPDATE on every dashboard
  // page in the app, twice per request on the matches list. A read path that
  // quietly writes is only safe while its callers are few enough to enumerate.
  if (options.reap) {
    const { error: reapError } = await supabase.rpc('reap_stalled_uploads');
    if (reapError) {
      // Never fatal — the list is more useful slightly stale than not at all.
      console.warn('[match-analysis] could not reap stalled uploads', {
        error: reapError.message,
      });
    }
  }

  const { data, error } = await supabase
    .from('processing_jobs')
    .select(
      'id, match_id, status, upload_progress_percent, error_message, billable_seconds, external_job_id, created_at, updated_at, derivation_version'
    )
    .in('match_id', matchIds)
    // Newest first, so the reduce below keeps the latest attempt per match.
    .order('created_at', { ascending: false });

  if (error) {
    // Not fatal. A matches list that renders without analysis state is far
    // better than one that does not render, and the mock this replaces could
    // not fail at all — so a failure here must not become a page crash.
    console.error('[match-analysis] could not load processing jobs', {
      error: error.message,
    });
    return out;
  }

  for (const row of (data ?? []) as JobRow[]) {
    // First row wins: the query is newest-first, so a resubmitted match shows
    // its current attempt rather than a stale one.
    if (out.has(row.match_id)) continue;

    const status = resolveAnalysisStatus(row.status, row.derivation_version);
    if (!status) {
      console.warn('[match-analysis] unmapped processing_jobs.status', {
        status: row.status,
      });
      continue;
    }

    const uploadPercent =
      status === 'uploading' && row.upload_progress_percent !== null
        ? row.upload_progress_percent
        : undefined;

    out.set(row.match_id, {
      status,
      progressPercent: pipelinePercent(status, uploadPercent),
      // Only the upload has a real number. The vendor sends status transitions
      // with no percentage, so anything shown for queued/processing/deriving
      // would be invented — better a bare status word than a fake bar.
      uploadPercent,
      startedAt: row.created_at,
      // Both only exist so a stalled submission can be retried — see
      // `isSubmitStalled`. `updatedAt` and not `createdAt`, because a job sits
      // at `uploaded` from the moment the transfer finishes, and created_at is
      // when it STARTED: on a 4 GB upload those are an hour apart, which would
      // make a healthy job look stalled the second it landed.
      jobId: row.id,
      updatedAt: row.updated_at,
      providerId: 'splitstep',
      jobReference: row.external_job_id ?? undefined,
      window: formatWindow(row.billable_seconds),
      failNote: row.error_message ?? undefined,
    });
  }

  return out;
}

/**
 * Fill in matches that have no job row.
 *
 * Kept beside the loader so both call sites resolve "no job" the same way:
 * a file import is `imported`, a hand-scored match is `manual`.
 */
export function analysisFor(
  jobs: Map<string, MatchAnalysis>,
  match: { id: string; sourceProvider?: string; verificationStatus?: string }
): MatchAnalysis {
  const job = jobs.get(match.id);
  if (job) return job;

  if (!match.sourceProvider) return manualAnalysis();
  return importedAnalysis(match.sourceProvider, Boolean(match.verificationStatus));
}

/**
 * `billable_seconds` as the pre-formatted window the UI expects.
 *
 * The guard stays here rather than delegating entirely: formatClock renders 0
 * as "0:00", which reads as a real zero-length window, where undefined lets the
 * caller omit the field. The arithmetic itself is formatClock's.
 */
function formatWindow(seconds: number | null): string | undefined {
  if (seconds === null || seconds <= 0) return undefined;
  return formatClock(seconds);
}
