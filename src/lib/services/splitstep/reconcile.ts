/**
 * Status reconciliation — recovery from a *lost or missing webhook*.
 *
 * Distinct from resubmission (resubmit-job.ts), which recovers a *failed*
 * job. Two failure modes are invisible without this:
 *
 *   • `JOB_STALE` — reported ONLY via `GET {BASE_URL}/jobs/{job_id}`, never
 *     as a webhook. Without polling, a stale job sits at `processing` forever.
 *   • A completed job whose delivery was lost. The vendor has NO retry
 *     policy, so a delivery that missed its 30s window is gone permanently —
 *     and the status response does not include `sas_url`, so the results
 *     cannot be recovered this way. The honest outcome is a failed state that
 *     routes the user to the manual resubmit path.
 *
 * Runs on the READ PATH, not a schedule: this app is on Vercel Hobby, where
 * cron fires once a day — useless against a 30-minute staleness window. The
 * precedent is `reap_stalled_uploads()`, called by the same two loaders
 * (matches list, match detail) at the same moment: a stale row only misleads
 * while someone is looking at it. `last_polled_at` is the rate limiter —
 * stamped on EVERY attempt, so a flapping vendor endpoint sees at most one
 * request per job per 10 minutes however often the page reloads.
 *
 * A failed poll (network error, `JOB_NOT_FOUND`, `STATUS_UNAVAILABLE`, or an
 * unparseable body) never mutates job state — only the stamp.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseKey, parseWebhookPayload } from './webhook-payload';
import { releaseQuota } from './quota';
import { isDownloadFailure, resubmitJob } from './resubmit-job';
import { resolveSplitstepVendorApiConfig } from './deployment-config';

const LOG = '[splitstep-reconcile]';

/** Only these statuses can be waiting on a vendor transition. */
const POLLABLE_STATUSES = ['submitting', 'queued', 'processing'] as const;

/** Nothing younger than this is considered stuck. */
const STALE_AFTER_MS = 30 * 60 * 1000;

/** Minimum gap between polls of the same job. */
const POLL_GAP_MS = 10 * 60 * 1000;

/** Ceiling per page load — reconciliation must never dominate a render. */
const DEFAULT_CAP = 3;

const POLL_TIMEOUT_MS = 10_000;

export interface ReconcileOutcome {
  polled: number;
  transitioned: number;
}

/**
 * Poll the vendor for jobs that look stuck and apply what it says.
 *
 * `matchIds` scopes the sweep to rows the calling page is actually showing —
 * which, arriving from an RLS-scoped read, also keeps it to the viewer's own
 * jobs. Pass no matchIds (undefined) to sweep every non-terminal job, which is
 * what scripts/splitstep-reconcile.ts does by hand.
 */
export async function reconcileVendorJobs(params: {
  /** Service-role client — writes status columns and reads the API key path. */
  supabase: SupabaseClient;
  matchIds?: string[];
  cap?: number;
  now?: Date;
}): Promise<ReconcileOutcome> {
  const { supabase, matchIds, cap = DEFAULT_CAP, now = new Date() } = params;
  const outcome: ReconcileOutcome = { polled: 0, transitioned: 0 };

  // Unconfigured deployments (local dev without vendor keys) skip silently —
  // the same posture the submit route takes, minus the 503, because nobody
  // asked for this call directly. Only the vendor-API half of the deployment
  // config: polling needs neither a webhook URL nor Azure storage, and
  // requiring them (as the full resolver does) would silently stop
  // reconciliation on a deployment where only those are incomplete.
  const config = resolveSplitstepVendorApiConfig();
  if (!config.ok) return outcome;
  const { apiUrl, apiKey } = config;

  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  const polledBefore = new Date(now.getTime() - POLL_GAP_MS).toISOString();

  let query = supabase
    .from('processing_jobs')
    .select('id, external_job_id, status, updated_at, last_polled_at')
    .in('status', [...POLLABLE_STATUSES])
    .not('external_job_id', 'is', null)
    .lt('updated_at', staleBefore)
    .or(`last_polled_at.is.null,last_polled_at.lt.${polledBefore}`)
    // Oldest first: the job that has waited longest is the one most likely to
    // be genuinely lost rather than merely slow.
    .order('updated_at', { ascending: true })
    .limit(cap);

  if (matchIds !== undefined) {
    if (matchIds.length === 0) return outcome;
    query = query.in('match_id', matchIds);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`${LOG} could not list pollable jobs`, { error: error.message });
    return outcome;
  }

  const jobs = (data ?? []) as {
    id: string;
    external_job_id: string;
    status: string;
  }[];

  if (jobs.length === 0) return outcome;

  // Stamp FIRST, unconditionally, in ONE write for the whole batch. If
  // everything after this throws, the rows still record that an attempt
  // happened and the 10-minute gap holds — and one UPDATE beats one per job
  // on a path that runs inside a page render.
  await supabase
    .from('processing_jobs')
    .update({ last_polled_at: now.toISOString() })
    .in('id', jobs.map((j) => j.id));
  outcome.polled = jobs.length;

  // The FETCHES run concurrently — they target different jobs, they don't
  // read each other, and serial polls would put cap × POLL_TIMEOUT_MS of
  // worst-case wall clock in front of a render. The failure WRITES below run
  // sequentially on purpose: they can end in resubmitJob(), whose
  // no-concurrent-duplicate guard is a read-then-insert, and two failures for
  // the same match applied in parallel could both pass it.
  const polls = await Promise.all(
    jobs.map(async (job): Promise<PolledFailure | null> => {
      let raw: string;
      let httpStatus: number;
      try {
        const response = await fetch(
          `${apiUrl.replace(/\/$/, '')}/${encodeURIComponent(job.external_job_id)}`,
          {
            headers: { 'X-Api-Key': apiKey },
            signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
          }
        );
        httpStatus = response.status;
        raw = await response.text();
      } catch (err) {
        console.warn(`${LOG} poll failed — leaving the job untouched`, {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      let parsedJson: unknown = null;
      try {
        parsedJson = raw.trim() === '' ? null : JSON.parse(raw);
      } catch {
        /* handled below as unparseable */
      }

      // The status endpoint's own error shape (JOB_NOT_FOUND,
      // STATUS_UNAVAILABLE) arrives as a non-2xx with an error body. None of
      // it may move the job: JOB_NOT_FOUND could be their id churn,
      // STATUS_UNAVAILABLE is their outage, and both are polling problems,
      // not job outcomes.
      if (httpStatus < 200 || httpStatus >= 300 || parsedJson === null) {
        console.warn(`${LOG} status endpoint gave no usable answer`, {
          jobId: job.id,
          httpStatus,
          body: raw.slice(0, 300),
        });
        return null;
      }

      // Same defensive read the webhook and submit paths use — one parser,
      // one set of guesses about the vendor's field naming.
      const parsed = parseWebhookPayload(parsedJson);

      // JOB_STALE never arrives as a webhook and may not phrase itself as a
      // failed status; recognise it by code, or by the status/state field
      // itself. Only those fields — a "stale" appearing in a message or a
      // filename must not fail a job.
      const statusText = statusFieldOf(parsedJson);
      const isStale =
        parsed.errorCode === 'JOB_STALE' ||
        (statusText !== null && /stale/i.test(statusText));

      if (parsed.nextStatus === 'failed' || isStale) {
        return {
          jobId: job.id,
          // isStale wins over whatever error object happened to be present —
          // a status/state field matching /stale/i is definitive; a
          // leftover, unrelated error.code (e.g. a stray VIDEO_UNREACHABLE
          // from a different field) must never override that classification
          // and risk isDownloadFailure() misreading a stale job as retryable.
          errorCode: isStale ? 'JOB_STALE' : parsed.errorCode,
          errorCategory: isStale ? 'internal' : parsed.errorCategory,
          errorStep: isStale ? null : parsed.errorStep,
          errorMessage:
            parsed.errorMessage ??
            'The analysis could not be completed. You can retry it.',
        };
      }

      if (parsed.nextStatus === 'completed') {
        // Their half finished but our row never heard: the delivery is lost,
        // and with it the results SAS — the status response cannot hand it
        // back. Do not pretend otherwise: the only path to statistics is a
        // new submission, so this surfaces as a failed state whose message
        // says exactly that, wired to the manual resubmit path.
        return {
          jobId: job.id,
          // OUR code, not a vendor one — vendor codes come from their error
          // object, and this failure is the delivery's, not the job's.
          errorCode: 'RESULTS_DELIVERY_LOST',
          errorCategory: 'internal',
          errorStep: null,
          errorMessage:
            'The analysis finished, but its results never arrived. Retry the analysis.',
        };
      }

      // queued/processing or anything unrecognised: their answer matches (or
      // does not contradict) ours. The stamp is the only write.
      return null;
    })
  );

  for (const failure of polls) {
    if (failure === null) continue;
    const transitioned = await applyPolledFailure({ supabase, ...failure });
    if (transitioned) outcome.transitioned += 1;
  }

  return outcome;
}

interface PolledFailure {
  jobId: string;
  errorCode: string | null;
  errorCategory: string | null;
  errorStep: string | null;
  errorMessage: string;
}

/**
 * The render-path entry point: reconcile, but never fatally.
 *
 * Owns the admin client and the try/catch so the two Server Component pages
 * that call this (matches list, match detail) share one copy of the
 * "log and carry on" policy instead of each maintaining its own. Server-only
 * by dependency — nothing under a client module graph may import this file.
 */
export async function reconcileBeforePageRead(
  matchIds: string[],
  pageTag: string
): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    await reconcileVendorJobs({ supabase: createAdminClient(), matchIds });
  } catch (err) {
    // Never fatal — the page is more useful slightly stale than not at all.
    console.warn(`[${pageTag}] reconciliation failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** The top-level `status`/`state` string of a parsed body, if one exists. */
function statusFieldOf(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const normalised = normaliseKey(key);
    if ((normalised === 'status' || normalised === 'state') && typeof value === 'string') {
      return value;
    }
  }
  return null;
}

/**
 * Apply a failure learned via polling — the same shape the webhook's
 * `job_failed` branch produces, guarded so a webhook that raced in wins.
 *
 * Auto-resubmission runs for the same single class the webhook retries
 * (download-step failures) and no other. `JOB_STALE` and
 * `RESULTS_DELIVERY_LOST` are `internal` and never auto-retried — they
 * surface, and the manual button is the recovery.
 */
async function applyPolledFailure(params: {
  supabase: SupabaseClient;
  jobId: string;
  errorCode: string | null;
  errorCategory: string | null;
  errorStep: string | null;
  errorMessage: string;
}): Promise<boolean> {
  const { supabase, jobId, errorCode, errorCategory, errorStep, errorMessage } =
    params;

  // Conditional on still being pollable: if a webhook landed between our read
  // and this write, its answer is fresher and this update matches zero rows.
  const { data, error } = await supabase
    .from('processing_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      error_code: errorCode,
      error_category: errorCategory,
      error_step: errorStep,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', [...POLLABLE_STATUSES])
    .select('id');

  if (error) {
    console.error(`${LOG} could not apply polled failure`, {
      jobId,
      error: error.message,
    });
    return false;
  }
  if (!data || data.length === 0) return false;

  console.log(`${LOG} job failed via status poll`, { jobId, errorCode });

  // Same order as the webhook's failed branch: hand the reservation back
  // before anything might reserve again.
  await releaseQuota(supabase, jobId);

  if (isDownloadFailure(errorCode, errorStep)) {
    const result = await resubmitJob({ supabase, jobId, auto: true });
    if (result.ok) {
      console.log(`${LOG} auto-resubmitted after polled download failure`, {
        jobId,
        newJobId: result.jobId,
      });
    } else {
      console.warn(`${LOG} auto-resubmit declined`, {
        jobId,
        reason: result.reason,
      });
    }
  }

  return true;
}
