/**
 * SplitStep results webhook.
 *
 * The vendor POSTs here when a job changes state. Expect at least two
 * deliveries per job (`job_queued`, then `job_completed`), plus retries.
 *
 * NOTHING SLOW BEFORE THE 200. Webhook senders retry on timeout, so inline work
 * produces duplicate deliveries against partial state. The shape is therefore:
 * verify → record → return 200 → do everything else in after().
 *
 * Derivation runs in that after() block, NOT in a Supabase Edge Function as the
 * spec's §2 diagram assumed. That design was written against the 60s Vercel
 * ceiling and an unmeasured workload. The ceiling is real — maxDuration is set
 * explicitly below — but the workload is not: parsing and grading a full match
 * takes about 3 ms and the whole write lands well under two seconds, none of it
 * on the vendor's critical path because the response has already gone. An Edge
 * Function would have meant a second copy of the derivation in Deno, and the
 * player mapping and shot numbering are precisely the subtleties that drift
 * between two copies — each of which misattributes an entire match when it does.
 *
 * What DOES still need building is reprocessing: when DERIVATION_VERSION bumps,
 * every stored match must be rebuilt and no webhook will fire for those jobs
 * again. That wants a paged cron route calling the same deriveAndPublish().
 *
 * A completion carries TWO urls, and both are short-lived SAS:
 *   • `sas_url` — the stroke-by-stroke results JSON, downloaded and written to
 *     the `match-results` bucket.
 *   • `trimmed_video_url` — their trimmed, re-encoded video, copied server-side
 *     into our own container. This one was dropped entirely until now, while
 *     the code below deleted our source video, so a successful job used to end
 *     with no video anywhere.
 *
 * Nothing slow happens before the response. The vendor confirmed a 30s
 * connection timeout and NO retry policy, which makes their timeout the hard
 * deadline: a delivery we fail to answer in time is gone permanently, and a
 * non-2xx buys nothing because nothing retries it. The only work before the 200
 * is recording the envelope, which is what makes everything else recoverable.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseWebhookPayload } from '@/lib/services/splitstep/webhook-payload';
import { selectDeliveryStorageKeys } from '@/lib/services/splitstep/delivery-storage-keys';
import { RESULTS_BUCKET } from '@/lib/services/splitstep/config';
import {
  deleteVideoBlob,
  startTrimmedVideoCopy,
  trimmedCopyStatus,
} from '@/lib/services/splitstep/video-url';
import { releaseQuota } from '@/lib/services/splitstep/quota';
import {
  isDownloadFailure,
  resubmitJob,
} from '@/lib/services/splitstep/resubmit-job';
import { gradeResults } from '@/lib/services/splitstep/grade-results';
import { deriveAndPublish } from '@/lib/services/splitstep/derive-and-publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Set explicitly rather than inherited. The route is bounded by design, but the
 * results download is a network call against a vendor host with no published
 * latency guarantee, and an unset maxDuration silently takes the platform
 * default — which is exactly the kind of thing that is invisible until the one
 * delivery that matters times out.
 */
export const maxDuration = 60;

const LOG = '[splitstep-webhook]';

/* Bucket for raw provider results (created by the 20260805005801 migration).
   Imported rather than re-declared: the verification script reads the same
   bucket, and two literals would drift silently. */

/** Ceiling on the results fetch, leaving headroom inside maxDuration. */
const RESULTS_FETCH_TIMEOUT_MS = 25_000;

/**
 * Headers the signature might arrive in.
 *
 * `x-hmac-signature` is the vendor's answer, given by email and since added to
 * their published docs, so it leads. The rest stay for two reasons. They are
 * still a cheap hedge until a real delivery confirms the documented name — the
 * log below prints the full header set whenever none of these match. And this
 * list is also the redaction set for safeHeaders(): dropping `authorization` or
 * `x-api-key` from it would start writing credential values into the delivery
 * row, which is a worse outcome than carrying a few dead candidates.
 */
const SIGNATURE_HEADERS = [
  'x-hmac-signature',
  'x-splitstep-signature',
  'x-webhook-signature',
  'x-signature',
  'x-signature-256',
  'x-hub-signature-256',
  'signature',
  'x-webhook-secret',
  'x-api-key',
  'authorization',
] as const;

type AuthOutcome = {
  /** Whether to process this delivery at all. */
  ok: boolean;
  /** Recorded on the row. True only for a real HMAC match. */
  verified: boolean;
  /** For the log; never includes the signature or the secret. */
  reason: string;
};

/**
 * Verify a delivery against the documented scheme:
 * base64(HMAC-SHA256(secret, raw_body)), compared to a signature header.
 *
 *   digest = hmac.new(secret, raw_body, sha256).digest()
 *   expected = base64.b64encode(digest)
 *
 * ── Why a missing signature is accepted, not rejected ────────────────────────
 * The vendor has NO retry policy and a 30s connection timeout, so a delivery we
 * refuse is gone permanently — there is no second attempt to fix it on. Paired
 * with a header name nobody has written down, rejecting on "no signature found"
 * risks discarding perfectly valid results because we looked in the wrong place.
 *
 * So: a signature that is present and WRONG is refused (that is a real failure).
 * A signature we cannot find is accepted, recorded `signature_verified = false`,
 * and logged with the full header set — which is what tells us the header name.
 *
 * Set SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true to flip to fail-closed. Do that
 * as soon as one real delivery has confirmed the header, and before any real
 * athlete video goes through.
 */
function verifyWebhookAuth(request: NextRequest, rawBody: string): AuthOutcome {
  const secret = process.env.SPLITSTEP_WEBHOOK_SECRET;

  if (!secret) {
    console.warn(
      `${LOG} UNSIGNED — SPLITSTEP_WEBHOOK_SECRET is not set. Accepting without ` +
        `authentication. This must not remain true once real match video is processed.`
    );
    return { ok: true, verified: false, reason: 'no secret configured' };
  }

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

  // Equal-length compare via digests, so nothing leaks through timing or length.
  const matches = (presented: string, against: string) =>
    timingSafeEqual(
      createHash('sha256').update(presented).digest(),
      createHash('sha256').update(against).digest()
    );

  let sawCandidate = false;

  for (const header of SIGNATURE_HEADERS) {
    const raw = request.headers.get(header);
    if (!raw) continue;
    sawCandidate = true;

    const presented = header === 'authorization' ? raw.replace(/^Bearer\s+/i, '') : raw.trim();

    if (matches(presented, expected)) {
      return { ok: true, verified: true, reason: `HMAC verified via ${header}` };
    }

    // Tolerated, not trusted: some senders put the shared secret itself in the
    // header rather than a signature over the body. It proves they hold the
    // secret, which is worth accepting, but it is not a signature — it says
    // nothing about whether the body was modified in transit.
    if (matches(presented, secret)) {
      console.warn(
        `${LOG} ${header} carried the raw shared secret, not an HMAC of the body. ` +
          `Accepted, but recorded unverified — ask the vendor to send ` +
          `base64(HMAC-SHA256(secret, raw_body)).`
      );
      return { ok: true, verified: false, reason: `raw secret via ${header}` };
    }
  }

  if (sawCandidate) {
    // A signature was presented and it did not match. That is a real failure,
    // not an unknown-header problem.
    return { ok: false, verified: false, reason: 'signature present but did not match' };
  }

  const requireSignature = process.env.SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE === 'true';

  console.warn(
    `${LOG} no signature header found${requireSignature ? ' — REJECTING' : ' — accepting unverified'}`,
    {
      searched: SIGNATURE_HEADERS,
      // The header NAMES are what identify the right one. Values are redacted
      // by safeHeaders() before anything is stored or logged.
      received: [...request.headers.keys()],
    }
  );

  return {
    ok: !requireSignature,
    verified: false,
    reason: 'no signature header found',
  };
}

/**
 * Headers worth keeping, without dragging a credential into the database.
 *
 * Every candidate signature header is redacted along with `cookie`. The NAMES
 * still land in the row, which is the part that identifies where the vendor
 * puts the signature; the values never do.
 */
function safeHeaders(request: NextRequest): Record<string, string> {
  const redacted = new Set<string>([...SIGNATURE_HEADERS, 'cookie']);

  const out: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    out[key] = redacted.has(key.toLowerCase()) ? '[redacted]' : value;
  });
  return out;
}

export async function POST(request: NextRequest) {
  // 1. Raw body FIRST, before any parsing or validation can throw. If the
  //    payload differs from the vendor's docs at all, this is the only thing
  //    that will tell us (handoff §3).
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error(`${LOG} could not read request body`, err);
    return NextResponse.json({ error: 'Unreadable body' }, { status: 400 });
  }

  console.log(`${LOG} received`, {
    bytes: rawBody.length,
    contentType: request.headers.get('content-type'),
    body: rawBody.slice(0, 4000),
  });

  // 2. Authenticate. Must run against the exact bytes received — the HMAC is
  //    over the raw body, so re-serializing would break it.
  const auth = verifyWebhookAuth(request, rawBody);
  if (!auth.ok) {
    console.error(`${LOG} rejected — ${auth.reason}`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const verified = auth.verified;

  // 3. Interpret. Never fatal: an unparseable body is still recorded verbatim.
  let parsedJson: unknown = null;
  try {
    parsedJson = rawBody.trim() === '' ? null : JSON.parse(rawBody);
  } catch {
    console.warn(`${LOG} body is not valid JSON — recording raw only`);
  }

  const payload = parseWebhookPayload(parsedJson);
  console.log(`${LOG} interpreted`, {
    externalJobId: payload.externalJobId,
    event: payload.event,
    nextStatus: payload.nextStatus,
    matchId: payload.matchId,
    hasSasUrl: Boolean(payload.sasUrl),
  });

  const fingerprint = createHash('sha256').update(rawBody).digest('hex');
  const supabase = createAdminClient();

  // 4. Record durably. This is the step that must succeed before we return 200 —
  //    it is what makes the envelope, and the sas_url inside it, recoverable by
  //    hand if everything downstream fails.
  const { data, error } = await supabase
    .rpc('record_splitstep_webhook', {
      p_fingerprint: fingerprint,
      p_raw_body: rawBody,
      p_parsed: parsedJson,
      p_headers: safeHeaders(request),
      p_signature_verified: verified,
      p_external_job_id: payload.externalJobId,
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

  if (error || !data) {
    // 500 on purpose: a retry is the only path back to this payload, and the
    // record call is idempotent, so being retried costs nothing.
    console.error(`${LOG} FAILED TO RECORD — returning 500 to invite a retry`, {
      error: error?.message,
      fingerprint,
    });
    return NextResponse.json({ error: 'Failed to record delivery' }, { status: 500 });
  }

  const record = data as {
    delivery_id: string;
    matched_job_id: string | null;
    match_id: string | null;
    created_by: string | null;
    job_status: string | null;
    results_object_key: string | null;
    already_stored: boolean;
    trimmed_object_key: string | null;
  };

  if (!record.matched_job_id) {
    // Not an error: the payload is safe in splitstep_webhook_deliveries, and a
    // retry would orphan identically, so 200 is honest. Loud because during the
    // pilot this most likely means the vendor's job-id field is not named what
    // the docs say.
    console.warn(`${LOG} ORPHAN — no processing_jobs row matched this delivery`, {
      deliveryId: record.delivery_id,
      externalJobId: payload.externalJobId,
      matchId: payload.matchId,
    });
  }

  // 5. Results download — AFTER the response is committed, not before.
  //
  // The vendor has a 30s connection timeout and NO retry policy. Downloading
  // inline meant a slow vendor host could hold the response past their timeout,
  // and a timed-out delivery is gone permanently — there is no second attempt.
  // So the 200 goes out as soon as the envelope is durable, and the fetch runs
  // in after(), still inside this invocation's maxDuration.
  //
  // The old code returned 500 here "to invite a retry". That was wrong: they
  // confirmed no retry policy exists, so a 500 bought nothing and only risked
  // the timeout. Recovery is by hand from the stored sas_url, or via
  // GET {BASE_URL}/jobs/{job_id}, which the docs now expose.
  if (payload.nextStatus === 'completed') {
    const deliveryId = record.delivery_id;
    const jobId = record.matched_job_id;

    // Two independent assets with two independent guards. Gating both on
    // `already_stored` — which is only ever about the JSON — would mean a video
    // copy that failed once never got another chance, on a url that expires.
    const sasUrl = record.already_stored ? null : payload.sasUrl;
    const trimmedVideoUrl = record.trimmed_object_key
      ? null
      : payload.trimmedVideoUrl;

    // Pick this delivery's two storage keys. The results JSON is always keyed;
    // the trimmed video is kept only when the match is nameable — which includes
    // a retained match whose uploader deleted their account. The retain/orphan
    // policy and its full rationale live in selectDeliveryStorageKeys.
    const { resultsKey, trimmedKey } = selectDeliveryStorageKeys({
      jobId,
      createdBy: record.created_by,
      matchId: record.match_id,
      externalJobId: payload.externalJobId,
      deliveryId,
    });

    if (sasUrl || trimmedVideoUrl) {
      after(async () => {
        // Is the analysis durably ours? Either an earlier delivery stored it or
        // this one does. Tracked rather than assumed, because it is what gates
        // the delete below — and a completion that arrives with no sas_url at
        // all must NOT be read as "nothing left to save".
        let resultsSecured = record.already_stored;

        // Set only when this delivery did the download. Left undefined on a
        // redelivery, which makes gradeResults read from storage instead.
        let resultsBody: string | undefined;

        // Where the analysis actually is, which is not always where this
        // request would compute it to be. A delivery that arrived before its
        // job id was known was stored under the `orphaned/…` fallback below;
        // once adopt-deliveries.ts matches it to a job, the row still points
        // at that key. Trust the recorded key over a recomputed one, and the
        // key we just wrote over both.
        let storedKey = record.results_object_key ?? resultsKey;

        if (sasUrl) {
          const stored = await storeResults({
            supabase,
            sasUrl,
            objectKey: resultsKey,
          });

          await supabase.rpc('finalize_splitstep_results', {
            p_delivery_id: deliveryId,
            p_job_id: jobId,
            p_results_object_key: stored.ok ? stored.objectKey : null,
            p_error: stored.ok ? null : stored.error,
          });

          resultsSecured = stored.ok;

          if (stored.ok) {
            resultsBody = stored.body;
            storedKey = stored.objectKey;
            console.log(`${LOG} results stored`, {
              jobId,
              objectKey: stored.objectKey,
              bytes: stored.bytes,
            });
          } else {
            // Loud, because nothing retries this. The sas_url is in the delivery
            // row and stays valid for days — it can be fetched by hand.
            console.error(
              `${LOG} results download FAILED — recover from the stored sas_url`,
              { deliveryId, jobId, error: stored.error }
            );
          }
        }

        // The trimmed video. Attempted even when the results download failed:
        // they are separate urls on separate expiries, and skipping this would
        // lose the video for a reason that has nothing to do with it.
        //
        // This is the only video that survives the job — ours is deleted below
        // and theirs is a SAS with about a week on it.
        if (trimmedVideoUrl && trimmedKey && jobId) {
          await copyTrimmedVideo({
            supabase,
            jobId,
            sourceUrl: trimmedVideoUrl,
            blobName: trimmedKey,
          });
        }

        // The source video has done its job. Deleting it is the real bound on
        // the vendor URL's lifetime: a SAS cannot be withdrawn once signed (see
        // video-url/azure-sas.ts), so removing the bytes is the only revocation
        // available. It also stops us paying to store a multi-GB file.
        //
        // Strictly after BOTH artifacts are safe, never before: while this is
        // the only copy of the match, it is also the only way to re-run a job.
        // In practice a cross-account copy of a real match is still `pending`
        // when this runs, so the delete usually defers to
        // scripts/cleanup-orphan-storage.ts — which is the intended behaviour,
        // not a fallback. The cost is that the vendor's 14-day read SAS on the
        // original stays live until the sweeper runs.
        if (jobId && resultsSecured) {
          await deleteSourceVideo({ supabase, jobId });
        }

        // Grade last. It is the only step here that is purely informational —
        // everything above either secures an asset or frees storage, and none
        // of them should wait behind it.
        //
        // Gated on resultsSecured rather than on this delivery having done the
        // download, so a redelivery still grades a job whose first attempt
        // stored the analysis but failed to grade it.
        if (jobId && resultsSecured) {
          await gradeResults({
            supabase,
            jobId,
            objectKey: storedKey,
            body: resultsBody,
          });

          // Then derive. After grading, so `derivation_quality` is already on
          // the row, and last overall because it is the only step here that can
          // be re-run by hand from the stored results — everything above either
          // secures an asset that expires or frees storage that costs money.
          //
          // Not an Edge Function. Measured at well under two seconds against a
          // route that already declares maxDuration = 60 and has returned its
          // 200 before any of this starts. The spec asked for one against an
          // unmeasured workload; the workload turned out not to need it.
          await deriveAndPublish({ supabase, jobId });
        }
      });
    }
  }

  // A job the vendor accepted and then failed on kept its reserved minutes
  // forever. releaseQuota had exactly one caller — the submit-failure path in
  // api/splitstep/jobs, which fires only when the POST itself throws — so a
  // failure during processing left the allowance spent with nothing to show
  // for it. Against a 2-hour monthly cap and no vendor cancel endpoint, that is
  // the leak that made automatic submission dangerous rather than merely bold.
  //
  // Safe to run on a redelivery: release_processing_quota() updates only where
  // `released = false`, so a second failure notice for the same job credits
  // nothing.
  //
  // Nothing is reconciled on success, deliberately. The vendor's completion
  // payload carries no duration, and the reservation is already the trim window
  // we asked them to analyse — so the estimate IS the actual, and calling
  // reconcileQuota() would mean inventing a number to pass it.
  if (payload.nextStatus === 'failed' && record.matched_job_id) {
    const failedJobId = record.matched_job_id;
    // Read once outside after(): the auto-retry decision keys on THIS
    // delivery's error fields, not on whatever the row says by the time the
    // block runs. The classifier itself lives in resubmit-job.ts — one rule,
    // shared with the reconciler's polled-failure path.
    const retryable = isDownloadFailure(payload.errorCode, payload.errorStep);

    after(async () => {
      // Release first: the child's reservation below is a fresh spend against
      // the same budget, and holding both at once could refuse a retry the
      // budget actually has room for.
      await releaseQuota(supabase, failedJobId);
      console.log(`${LOG} quota released for failed job`, { jobId: failedJobId });

      // Auto-resubmit — this failure class and ONLY this class. A download
      // failure with a valid SAS means the file, submission and metadata are
      // all good, so retrying is nearly free and nearly always works. The one
      // real occurrence arrived as code INTERNAL_ERROR with step
      // 'downloading_video', which is why step outranks code here: a bare
      // INTERNAL_ERROR anywhere else says "contact support", and
      // video-quality rejections can never succeed on retry. Unknown codes
      // are surfaced, never retried.
      //
      // resubmitJob() itself enforces the rest: one automatic attempt per
      // chain, the 3-attempt ceiling, no non-terminal duplicate, and that the
      // source blob still exists.
      if (!retryable) return;

      const result = await resubmitJob({
        supabase,
        jobId: failedJobId,
        auto: true,
      });

      if (result.ok) {
        console.log(`${LOG} auto-resubmitted after download failure`, {
          failedJobId,
          newJobId: result.jobId,
          externalJobId: result.externalJobId,
        });
      } else {
        console.warn(`${LOG} auto-resubmit declined — surfacing to the user`, {
          failedJobId,
          reason: result.reason,
          message: result.message,
        });
      }
    });
  }

  // Grading AND derivation both run in the completed-branch after() above, and
  // neither is an Edge Function. The spec's §2 design assumed one because of the
  // 60-second Vercel ceiling against an unmeasured workload: parsing and grading
  // is ~3 ms and the whole write is well under two seconds, while after() has
  // already sent the 200, which was the other reason given. A Deno copy of the
  // derivation would have been the more expensive mistake — the player mapping
  // and the shot numbering are exactly the subtleties that drift between two
  // copies, and both misattribute an entire match when they do.
  //
  // Still open, and genuinely needed: reprocessing. When DERIVATION_VERSION
  // bumps, every stored match must be rebuilt and no webhook will ever fire for
  // those jobs again. That wants a paged, authenticated route driven by a
  // scheduler — the src/app/api/cron/reclaim-videos pattern — calling the same
  // deriveAndPublish() this does, not a second implementation.

  return NextResponse.json({ received: true, deliveryId: record.delivery_id });
}

/**
 * Copy the vendor's trimmed video into our own container.
 *
 * Until now we threw the url away and then deleted our own source, so a finished
 * job ended with no video anywhere.
 *
 * Note what this asset is NOT. "Trimmed" means trimmed to the StartTime/EndTime
 * window we sent, not dead time removed — so for a player who selected their
 * whole video it is the same match at a lower bitrate, and deleting our source
 * in its favour is a downgrade rather than an upgrade. See webhook-payload.ts
 * for the measurement.
 *
 * Best-effort, like every other cleanup step here: a failure logs and returns
 * rather than throwing, because aborting after() would take the source-video
 * delete down with it. The url survives on `processing_jobs.trimmed_video_url`
 * for about a week either way, which is the manual recovery path.
 *
 * The copy is STARTED, not awaited. Azure moves the bytes server-side; see
 * startTrimmedVideoCopy(). `pending` is the expected outcome for a real match
 * and is not a failure.
 */
async function copyTrimmedVideo(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
  sourceUrl: string;
  blobName: string;
}): Promise<void> {
  const { supabase, jobId, sourceUrl, blobName } = params;

  try {
    const { copyStatus } = await startTrimmedVideoCopy({ blobName, sourceUrl });

    // Recorded as soon as the copy is accepted, not once it finishes. The key
    // is what a later delivery checks to avoid starting a second copy, and what
    // the sweeper needs to know a source video has a successor.
    const { error } = await supabase.rpc('record_splitstep_trimmed_copy', {
      p_job_id: jobId,
      p_trimmed_object_key: blobName,
    });

    if (error) {
      // The bytes are on their way to a key nothing points at. Loud, because
      // the only way back is reading this line.
      console.error(
        `${LOG} trimmed copy started but the key was NOT recorded — ` +
          `the blob will be orphaned`,
        { jobId, blobName, error: error.message }
      );
      return;
    }

    console.log(`${LOG} trimmed video copy ${copyStatus}`, { jobId, blobName });
  } catch (err) {
    console.error(
      `${LOG} trimmed video copy FAILED — recover from trimmed_video_url ` +
        `on the job row, which is valid for about a week`,
      { jobId, error: err instanceof Error ? err.message : String(err) }
    );
  }
}

/**
 * Delete a completed job's source video, once something better is safely ours.
 *
 * Best-effort by construction — every failure here logs and returns. The blob
 * is not lost if this misses: scripts/cleanup-orphan-storage.ts sweeps it once
 * the match is gone, and it expires from the vendor's reach on its own when the
 * SAS does. Throwing would abort the after() block for a cleanup step, which is
 * a worse trade than a stranded file.
 *
 * ── Why this is now conditional ──────────────────────────────────────────────
 * It used to delete unconditionally as soon as the results JSON stored, on the
 * reasoning that nobody reads the video again. That reasoning skipped the
 * vendor's trimmed re-encode, which we were not capturing — so the delete was
 * destroying the last video in existence for that match. It now refuses unless
 * a trimmed copy is confirmed `success`.
 *
 * Two consequences worth stating rather than discovering:
 *   • A real match is still copying when this runs, so this usually declines
 *     and the sweeper does it later.
 *   • A job whose payload carried no trimmed url keeps its source video
 *     indefinitely. That is deliberate: one video beats none.
 */
async function deleteSourceVideo(params: {
  supabase: ReturnType<typeof createAdminClient>;
  jobId: string;
}): Promise<void> {
  const { supabase, jobId } = params;

  // Not carried on the delivery record — record_splitstep_webhook() returns the
  // results key, not the video's. One read, after the response is already out.
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('video_object_key, trimmed_object_key')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !data?.video_object_key) {
    if (error) {
      console.warn(`${LOG} could not read video_object_key for cleanup`, {
        jobId,
        error: error.message,
      });
    }
    return;
  }

  if (!data.trimmed_object_key) {
    console.log(
      `${LOG} keeping source video — no trimmed copy exists for this job`,
      { jobId }
    );
    return;
  }

  const copyStatus = await trimmedCopyStatus({
    blobName: data.trimmed_object_key,
  });

  if (copyStatus !== 'success') {
    console.log(
      `${LOG} keeping source video — trimmed copy is ${copyStatus}; ` +
        `the sweeper will delete it once the copy lands`,
      { jobId }
    );
    return;
  }

  try {
    const { deleted } = await deleteVideoBlob({
      blobName: data.video_object_key,
    });
    console.log(`${LOG} source video ${deleted ? 'deleted' : 'already gone'}`, {
      jobId,
    });
  } catch (err) {
    console.warn(`${LOG} source video cleanup failed — the sweeper will catch it`, {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fetch the results JSON and put it in Supabase Storage.
 *
 * Returns rather than throws: the caller decides the HTTP outcome, and the
 * failure reason has to reach `finalize_splitstep_results` either way.
 */
async function storeResults(params: {
  supabase: ReturnType<typeof createAdminClient>;
  sasUrl: string;
  objectKey: string;
}): Promise<
  | { ok: true; objectKey: string; bytes: number; body: string }
  | { ok: false; error: string }
> {
  const { supabase, sasUrl, objectKey } = params;

  let body: string;
  try {
    const response = await fetch(sasUrl, {
      signal: AbortSignal.timeout(RESULTS_FETCH_TIMEOUT_MS),
      // No credentials — the URL carries its own.
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Vendor returned ${response.status} ${response.statusText}`,
      };
    }

    body = await response.text();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown fetch error',
    };
  }

  if (body.trim() === '') {
    return { ok: false, error: 'Vendor returned an empty body' };
  }

  const { error } = await supabase.storage
    .from(RESULTS_BUCKET)
    .upload(objectKey, new Blob([body], { type: 'application/json' }), {
      contentType: 'application/json',
      // Overwrite: a retry that got past the already_stored guard should land on
      // the same key rather than accumulating near-identical copies.
      upsert: true,
    });

  if (error) {
    return { ok: false, error: `Storage upload failed: ${error.message}` };
  }

  // The body comes back with the result so the grading step can work from what
  // is already in memory. Re-reading it from storage would be a second network
  // round trip for bytes we are holding.
  return { ok: true, objectKey, bytes: body.length, body };
}

/**
 * Liveness check, so the endpoint URL can be handed over and confirmed
 * reachable before either side has wired anything up. Returns nothing that is
 * not already public knowledge to whoever holds the URL.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: 'splitstep-webhook',
    status: 'ready',
    method: 'POST',
  });
}
