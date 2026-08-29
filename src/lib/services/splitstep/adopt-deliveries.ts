/**
 * Attach webhook deliveries that arrived before we knew the vendor's job id.
 *
 * ── The race, as observed ────────────────────────────────────────────────────
 * Submission is: reserve quota → mint the video URL → POST to the vendor →
 * record `external_job_id`. The vendor fires `job_queued` the moment they accept,
 * and on the first real job that webhook landed **0.9 seconds** after our POST —
 * while the route was still writing the id it would have been matched on.
 *
 * `record_splitstep_webhook()` looks the job up by `external_job_id`, finds
 * nothing, and falls back to the `MatchID` we echo on the request. That fallback
 * does not save us here: the vendor's payload carries `job_id` and `video_id`
 * but does NOT echo `MatchID`, so there is nothing to fall back to. The delivery
 * is recorded with `job_id = null` and stays there.
 *
 * ── Why it matters more than it looks ────────────────────────────────────────
 * For `job_queued` the cost is cosmetic — a missing `queued_ack_at` and one
 * absent entry in `raw_webhook_payload`. For `job_failed` it is not: the webhook
 * only releases the quota reservation for a job it can find, so a failure that
 * arrives inside the race window spends the allowance permanently against a
 * 2-hour monthly cap, with no vendor cancel endpoint to recover it.
 *
 * ── The fix ─────────────────────────────────────────────────────────────────
 * Replay the orphans through `record_splitstep_webhook()` once the id is known.
 * That function is idempotent on a SHA-256 fingerprint of the raw body, so a
 * replay returns the existing delivery row rather than duplicating it — but this
 * time the job lookup succeeds, so it links the row, advances the status under
 * the usual rank guard, and appends the payload. No new SQL, no second code path
 * that could disagree with the first.
 *
 * The durable fix is the vendor echoing `MatchID` on their webhooks, which would
 * make the existing fallback do this for free. Worth asking for.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { parseWebhookPayload } from './webhook-payload';

export interface AdoptionResult {
  /** Deliveries newly linked to the job. */
  adopted: number;
  /** The job's status after replaying them, or null if nothing was adopted. */
  jobStatus: string | null;
  /**
   * The classification of the LAST adopted delivery, present only when
   * `jobStatus === 'failed'`. Deliberately NOT auto-resubmitted from inside
   * this function — `resubmitJob()` lives in `resubmit-job.ts`, which already
   * imports this module, so calling back in would be a circular import.
   * Callers classify with `isDownloadFailure(errorCode, errorStep)` and call
   * `resubmitJob({ auto: true })` themselves, exactly mirroring what the
   * webhook's own `job_failed` branch does for a delivery that arrived on
   * time — an orphan-adopted failure must not silently lose its shot at the
   * same automatic recovery.
   */
  errorCode: string | null;
  errorStep: string | null;
  /**
   * True when an adopted delivery carried a results URL we never downloaded.
   *
   * Only reachable if a COMPLETION lost the race, which needs the vendor to
   * finish before our POST returns — so, realistically, never. Reported rather
   * than handled: the download lives in the webhook's after() block, and
   * duplicating it here would be a second copy of the trickiest code in the
   * integration to serve a case that has never occurred. The sas_url is on the
   * delivery row and stays valid about a week, so the log line is enough.
   */
  owedResultsDownload: boolean;
}

interface OrphanRow {
  id: string;
  fingerprint: string;
  raw_body: string;
  parsed: unknown;
  headers: unknown;
  signature_verified: boolean;
}

/**
 * @param supabase Must be a service-role client — `splitstep_webhook_deliveries`
 *   has no policy for `authenticated`, by design, so an RLS-scoped client sees
 *   an empty table rather than an error.
 */
export async function adoptOrphanedDeliveries(params: {
  supabase: SupabaseClient;
  jobId: string;
  externalJobId: string;
}): Promise<AdoptionResult> {
  const { supabase, jobId, externalJobId } = params;

  const { data, error } = await supabase
    .from('splitstep_webhook_deliveries')
    .select('id, fingerprint, raw_body, parsed, headers, signature_verified')
    .eq('external_job_id', externalJobId)
    .is('job_id', null)
    // Oldest first, so statuses replay in the order they were sent. The rank
    // guard would stop a backwards move anyway; this keeps queued_ack_at and
    // the payload array in the order they actually happened.
    .order('received_at', { ascending: true });

  if (error) {
    throw new Error(`Could not read orphaned deliveries: ${error.message}`);
  }

  const orphans = (data ?? []) as OrphanRow[];
  if (orphans.length === 0) {
    return {
      adopted: 0,
      jobStatus: null,
      errorCode: null,
      errorStep: null,
      owedResultsDownload: false,
    };
  }

  let jobStatus: string | null = null;
  let errorCode: string | null = null;
  let errorStep: string | null = null;
  let owedResultsDownload = false;
  let adopted = 0;

  for (const orphan of orphans) {
    // Re-derived rather than stored: the delivery row keeps the payload, not our
    // interpretation of it, so this is the same reading record_splitstep_webhook
    // was given the first time.
    const payload = parseWebhookPayload(orphan.parsed);

    const { data: recorded, error: recordError } = await supabase
      .rpc('record_splitstep_webhook', {
        p_fingerprint: orphan.fingerprint,
        p_raw_body: orphan.raw_body,
        p_parsed: orphan.parsed,
        p_headers: orphan.headers,
        // Preserved, never re-asserted. Whether that delivery was signed is a
        // fact about the request we received, and a replay must not upgrade it.
        p_signature_verified: orphan.signature_verified,
        p_external_job_id: externalJobId,
        p_event: payload.event,
        p_next_status: payload.nextStatus,
        p_sas_url: payload.sasUrl,
        p_trimmed_video_url: payload.trimmedVideoUrl,
        p_error_message: payload.errorMessage,
        p_match_id: payload.matchId,
        p_error_code: payload.errorCode,
        p_error_category: payload.errorCategory,
        p_error_step: payload.errorStep,
      })
      .single();

    if (recordError || !recorded) {
      throw new Error(
        `Could not adopt delivery ${orphan.id}: ${recordError?.message ?? 'no row returned'}`
      );
    }

    const record = recorded as {
      matched_job_id: string | null;
      job_status: string | null;
      already_stored: boolean;
    };

    // Guard against adopting into the wrong job. The id is unique per vendor
    // job, so this should be impossible — but silently attaching another job's
    // delivery would corrupt exactly the forensic record this table exists for.
    if (record.matched_job_id && record.matched_job_id !== jobId) {
      throw new Error(
        `Delivery ${orphan.id} matched job ${record.matched_job_id}, not ${jobId}`
      );
    }

    if (record.matched_job_id) {
      adopted++;
      jobStatus = record.job_status;
      // Newest replayed delivery's classification wins, same as jobStatus
      // above — orphans replay oldest-first, so the last one is the most
      // recent state, matching what a live-delivered job_failed would carry.
      errorCode = payload.errorCode;
      errorStep = payload.errorStep;
      if (payload.sasUrl && !record.already_stored) owedResultsDownload = true;
    }
  }

  return { adopted, jobStatus, errorCode, errorStep, owedResultsDownload };
}
