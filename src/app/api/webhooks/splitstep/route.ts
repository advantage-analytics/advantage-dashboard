/**
 * SplitStep results webhook.
 *
 * The vendor POSTs here when a job changes state. Expect at least two
 * deliveries per job (`job_queued`, then `job_completed`), plus retries.
 *
 * DELIBERATELY THIN (handoff §2.2). The spec's §2 diagram had this route also
 * running the derivation engine and calling `calculate_match_stats`; that is
 * wrong twice over. Webhook senders retry on timeout, so slow inline work
 * produces duplicate deliveries against partial state — and this app is on
 * Vercel Hobby, where the platform ceiling is 60s. A full match of strokes
 * through derivation is not something to bet on fitting.
 *
 * So: verify → record → return 200 → fetch the results JSON in after().
 * Derivation runs later in a Supabase Edge Function, mirroring the SwingVision
 * `process-match` fire-and-forget pattern.
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
import { resultsObjectKey } from '@/lib/services/splitstep/object-keys';
import { RESULTS_BUCKET } from '@/lib/services/splitstep/config';
import { deleteVideoBlob } from '@/lib/services/splitstep/video-url';

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
      p_error_message: payload.errorMessage,
      p_match_id: payload.matchId,
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
  if (payload.nextStatus === 'completed' && payload.sasUrl && !record.already_stored) {
    const objectKey = record.matched_job_id
      ? resultsObjectKey({
          userId: record.created_by!,
          matchId: record.match_id!,
          jobId: record.matched_job_id,
        })
      : `orphaned/${payload.externalJobId ?? 'unknown'}/${record.delivery_id}.json`;

    const sasUrl = payload.sasUrl;
    const deliveryId = record.delivery_id;
    const jobId = record.matched_job_id;

    after(async () => {
      const stored = await storeResults({ supabase, sasUrl, objectKey });

      await supabase.rpc('finalize_splitstep_results', {
        p_delivery_id: deliveryId,
        p_job_id: jobId,
        p_results_object_key: stored.ok ? stored.objectKey : null,
        p_error: stored.ok ? null : stored.error,
      });

      if (!stored.ok) {
        // Loud, because nothing retries this. The sas_url is in the delivery
        // row and stays valid for days — it can be fetched by hand.
        console.error(`${LOG} results download FAILED — recover from the stored sas_url`, {
          deliveryId,
          jobId,
          error: stored.error,
        });
        return;
      }

      console.log(`${LOG} results stored`, {
        jobId,
        objectKey: stored.objectKey,
        bytes: stored.bytes,
      });

      // The source video has done its job. Deleting it here is the real bound
      // on the vendor URL's lifetime: a SAS cannot be withdrawn once signed
      // (see video-url/azure-sas.ts), so removing the bytes is the only
      // revocation available. It also stops us paying to store a multi-GB file
      // nobody reads again — nothing deleted videos post-completion before.
      //
      // Strictly after the results are stored, never before: while this is the
      // only copy of the match, it is also the only way to re-run a job.
      if (jobId) await deleteSourceVideo({ supabase, jobId });
    });
  }

  // TODO(splitstep-phase2): trigger the derivation Edge Function here, once it
  // exists. Fire-and-forget — do not await it (handoff §2.2). Phase 2 is hard
  // gated on a real results fixture, so a completed job currently and correctly
  // rests at "processed, analysis pending".

  return NextResponse.json({ received: true, deliveryId: record.delivery_id });
}

/**
 * Delete a completed job's source video.
 *
 * Best-effort by construction — every failure here logs and returns. The blob
 * is not lost if this misses: scripts/cleanup-orphan-storage.ts sweeps it once
 * the match is gone, and it expires from the vendor's reach on its own when the
 * SAS does. Throwing would abort the after() block for a cleanup step, which is
 * a worse trade than a stranded file.
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
    .select('video_object_key')
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
  { ok: true; objectKey: string; bytes: number } | { ok: false; error: string }
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

  return { ok: true, objectKey, bytes: body.length };
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
