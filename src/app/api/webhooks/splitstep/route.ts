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
 * So: verify → record → fetch the results JSON → return. Derivation runs
 * afterwards in a Supabase Edge Function, mirroring the SwingVision
 * `process-match` fire-and-forget pattern.
 *
 * The one thing kept inline is the results download. That URL is short-lived
 * with no documented way to re-request it (§7 Q5), so it is fetched while we
 * certainly still have it. A JSON fetch is fast; derivation is not.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseWebhookPayload } from '@/lib/services/splitstep/webhook-payload';
import { resultsObjectKey } from '@/lib/services/splitstep/object-keys';

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

/** Bucket for raw provider results — see the 20260805005801 migration. */
const RESULTS_BUCKET = 'match-results';

/** Ceiling on the results fetch, leaving headroom inside maxDuration. */
const RESULTS_FETCH_TIMEOUT_MS = 25_000;

/**
 * Shared-secret check.
 *
 * TODO(splitstep-q4): replace with the vendor's real signing scheme once they
 * document algorithm, header name, signing payload and rotation. Until then a
 * shared secret is the whole of the authentication.
 *
 * Accepted UNSIGNED when SPLITSTEP_WEBHOOK_SECRET is unset, so the smoke test
 * can run before the vendor has implemented anything on their side — they are
 * not blocked on us for the signing scheme. Every unsigned delivery is logged
 * as such and recorded with signature_verified = false, so this cannot quietly
 * become the production posture.
 *
 * While unset, this endpoint is an open write path against `processing_jobs`
 * for anyone who finds the URL. Acceptable for a test with a throwaway video;
 * NOT acceptable once real athlete video goes through.
 */
function verifySecret(request: NextRequest): {
  ok: boolean;
  verified: boolean;
} {
  const expected = process.env.SPLITSTEP_WEBHOOK_SECRET;

  if (!expected) {
    console.warn(
      `${LOG} UNSIGNED — SPLITSTEP_WEBHOOK_SECRET is not set. Accepting without ` +
        `authentication. This must not remain true once real match video is processed.`
    );
    return { ok: true, verified: false };
  }

  const auth = request.headers.get('authorization');
  const presented =
    request.headers.get('x-webhook-secret') ??
    request.headers.get('x-api-key') ??
    (auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null);

  if (!presented) {
    return { ok: false, verified: false };
  }

  // Hash both sides so timingSafeEqual gets equal-length buffers regardless of
  // what was presented — comparing lengths directly would itself leak.
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();

  return { ok: timingSafeEqual(a, b), verified: true };
}

/** Headers worth keeping, without dragging the secret into the database. */
function safeHeaders(request: NextRequest): Record<string, string> {
  const redacted = new Set([
    'authorization',
    'x-webhook-secret',
    'x-api-key',
    'cookie',
  ]);

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

  // 2. Authenticate.
  const { ok, verified } = verifySecret(request);
  if (!ok) {
    console.error(`${LOG} rejected — bad or missing shared secret`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // 5. Results download. Only on completion, and only once.
  if (payload.nextStatus === 'completed' && payload.sasUrl && !record.already_stored) {
    const stored = await storeResults({
      supabase,
      sasUrl: payload.sasUrl,
      objectKey: record.matched_job_id
        ? resultsObjectKey({
            userId: record.created_by!,
            matchId: record.match_id!,
            jobId: record.matched_job_id,
          })
        : `orphaned/${payload.externalJobId ?? 'unknown'}/${record.delivery_id}.json`,
    });

    await supabase.rpc('finalize_splitstep_results', {
      p_delivery_id: record.delivery_id,
      p_job_id: record.matched_job_id,
      p_results_object_key: stored.ok ? stored.objectKey : null,
      p_error: stored.ok ? null : stored.error,
    });

    if (!stored.ok) {
      // 500 so they retry while the URL is still valid. The envelope is already
      // recorded above, so even if they never retry, the sas_url is on disk and
      // a human can fetch it by hand before it expires.
      console.error(`${LOG} results download FAILED — returning 500 to invite a retry`, {
        deliveryId: record.delivery_id,
        jobId: record.matched_job_id,
        error: stored.error,
      });
      return NextResponse.json(
        { error: 'Failed to store results' },
        { status: 500 }
      );
    }

    console.log(`${LOG} results stored`, {
      jobId: record.matched_job_id,
      objectKey: stored.objectKey,
      bytes: stored.bytes,
    });
  }

  // TODO(splitstep-phase2): trigger the derivation Edge Function here, once it
  // exists. Fire-and-forget — do not await it (handoff §2.2). Phase 2 is hard
  // gated on a real results fixture, so a completed job currently and correctly
  // rests at "processed, analysis pending".

  return NextResponse.json({ received: true, deliveryId: record.delivery_id });
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
