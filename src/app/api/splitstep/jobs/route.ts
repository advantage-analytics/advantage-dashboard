/**
 * Submit an uploaded match video for analysis (spec §3.3).
 *
 * The upload wizard has already created the `processing_jobs` row and put the
 * video in R2; this is the step that spends an allowance and hands the job to
 * the vendor. Replaces `scripts/splitstep-submit.ts` for real users — the
 * script stays for the smoke test, where hardcoding metadata is the point.
 *
 * Order matters, and it is: verify ownership → reserve quota → mint URL →
 * submit → record. Quota is reserved BEFORE the vendor is called, because an
 * allowance only checked afterwards cannot refuse anything. Every failure past
 * the reservation hands it back.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSplitStepJobRequest } from '@/lib/services/splitstep/job-request';
import { videoObjectKey } from '@/lib/services/splitstep/object-keys';
import { createVideoUrlStrategy } from '@/lib/services/splitstep/video-url';
import { releaseQuota, reserveQuota } from '@/lib/services/splitstep/quota';

export const runtime = 'nodejs';

/**
 * Talking to the vendor is a network call with no published latency guarantee.
 * Set explicitly rather than inheriting the platform default, which is the kind
 * of thing that is invisible until the one submission that matters times out.
 */
export const maxDuration = 60;

const LOG = '[splitstep-submit]';

interface SubmitBody {
  jobId?: string;
  /**
   * Camera-relative at the FIRST FRAME, not player1/player2. Players change
   * ends every odd game; this refers only to the start.
   *
   * Not persisted on processing_jobs — no column exists — so the client sends
   * it at submit time. That is the weakest link here: get it wrong and every
   * statistic is attributed to the wrong player, with nothing in the UI looking
   * off. A column for this (and the two below) is the obvious hardening.
   */
  initialTopPlayerIsPlayer1?: boolean;
  adScoring?: boolean;
  fixedCamera?: boolean;
}

export async function POST(request: NextRequest) {
  // 1. Who is calling.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobId, initialTopPlayerIsPlayer1, adScoring, fixedCamera } = body;

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  if (typeof initialTopPlayerIsPlayer1 !== 'boolean') {
    // Refused rather than defaulted. A default here is a coin flip on which
    // player every statistic belongs to.
    return NextResponse.json(
      { error: 'initialTopPlayerIsPlayer1 is required and must be a boolean' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 2. Load the job and prove the caller owns it.
  const { data: jobRow, error: jobError } = await admin
    .from('processing_jobs')
    .select(
      'id, match_id, created_by, status, external_job_id, video_object_key, start_time_seconds, end_time_seconds'
    )
    .eq('id', jobId)
    .maybeSingle();

  if (jobError) {
    console.error(`${LOG} job lookup failed`, { jobId, error: jobError.message });
    return NextResponse.json({ error: 'Could not load the job' }, { status: 500 });
  }

  // Same 404 for "does not exist" and "not yours" — never confirm the existence
  // of another user's job.
  if (!jobRow || jobRow.created_by !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const job = jobRow as {
    id: string;
    match_id: string;
    created_by: string;
    status: string;
    external_job_id: string | null;
    video_object_key: string | null;
    start_time_seconds: number | null;
    end_time_seconds: number | null;
  };

  // 3. Is it actually submittable?
  if (job.external_job_id) {
    return NextResponse.json(
      { error: 'This match has already been submitted for analysis.' },
      { status: 409 }
    );
  }

  if (job.status !== 'uploaded') {
    return NextResponse.json(
      {
        error:
          job.status === 'uploading'
            ? 'The video is still uploading. Try again once it finishes.'
            : `This job is ${job.status} and cannot be submitted.`,
      },
      { status: 409 }
    );
  }

  if (!job.video_object_key) {
    return NextResponse.json(
      { error: 'No video is attached to this job.' },
      { status: 409 }
    );
  }

  if (job.start_time_seconds === null || job.end_time_seconds === null) {
    return NextResponse.json(
      { error: 'This job has no trim window set.' },
      { status: 409 }
    );
  }

  // 4. Match metadata — players, scores, and the singles/doubles gate.
  const { data: matchRow, error: matchError } = await admin
    .from('matches')
    .select('id, player1_name, player2_name, score, match_type')
    .eq('id', job.match_id)
    .maybeSingle();

  if (matchError || !matchRow) {
    return NextResponse.json(
      { error: 'Could not load the match for this job.' },
      { status: 500 }
    );
  }

  const match = matchRow as {
    player1_name: string;
    player2_name: string;
    score: { player1: number[]; player2: number[] } | null;
    match_type: string | null;
  };

  const webhookUrl = buildWebhookUrl();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Analysis is not configured on this deployment.' },
      { status: 503 }
    );
  }

  // 5. Build and validate before anything is spent. buildSplitStepJobRequest
  //    enforces singles-only, a trim consistent with the score, and the
  //    top-player-first ordering of SetGameScores.
  const built = buildSplitStepJobRequest({
    matchId: job.match_id,
    videoUrl: '',
    allowEmptyVideoUrl: true,
    webhookUrl,
    player1Name: match.player1_name,
    player2Name: match.player2_name,
    initialTopPlayerIsPlayer1,
    startTimeSeconds: Number(job.start_time_seconds),
    endTimeSeconds: Number(job.end_time_seconds),
    player1Scores: match.score?.player1 ?? [],
    player2Scores: match.score?.player2 ?? [],
    adScoring: adScoring ?? true,
    fixedCamera: fixedCamera ?? true,
    matchType: match.match_type,
  });

  if (!built.ok) {
    return NextResponse.json(
      { error: 'This match cannot be analysed yet.', details: built.errors },
      { status: 422 }
    );
  }

  const vendorRequest = built.request;
  const billableSeconds = Math.ceil(
    vendorRequest.EndTime - vendorRequest.StartTime
  );

  // 6. Reserve the allowance. Refuses here, before a job is spent.
  const reservation = await reserveQuota({
    supabase: admin,
    jobId: job.id,
    userId: user.id,
    seconds: billableSeconds,
  });

  if (!reservation.ok) {
    console.log(`${LOG} refused — monthly cap`, {
      jobId: job.id,
      usedSeconds: reservation.usedSeconds,
      capSeconds: reservation.capSeconds,
    });
    return NextResponse.json(
      {
        error: reservation.message,
        usedSeconds: reservation.usedSeconds,
        capSeconds: reservation.capSeconds,
      },
      { status: 429 }
    );
  }

  // Everything past here must hand the reservation back on failure.
  try {
    const apiUrl = process.env.SPLITSTEP_API_URL;
    const apiKey = process.env.SPLITSTEP_API_KEY;

    if (!apiUrl || !apiKey || apiUrl.includes('api.example.com')) {
      // The published client script still points at api.example.com; refuse
      // rather than POST a real job at a placeholder host.
      throw new Error('Analysis provider is not configured.');
    }

    await admin
      .from('processing_jobs')
      .update({
        status: 'submitting',
        billable_seconds: billableSeconds,
        attempt_count: 1,
      })
      .eq('id', job.id);

    // 7. Mint the vendor URL. Points at our Worker, not R2 — the Worker's
    //    download log is the processing-started signal the vendor declined to
    //    send.
    const vendorUrl = await createVideoUrlStrategy(admin).mint({
      jobId: job.id,
      objectKey: job.video_object_key,
    });

    // 8. Submit.
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ ...vendorRequest, VideoUrl: vendorUrl.url }),
      signal: AbortSignal.timeout(30_000),
    });

    const rawResponse = await response.text();

    if (!response.ok) {
      throw new Error(
        `Provider returned ${response.status}: ${rawResponse.slice(0, 500)}`
      );
    }

    let externalJobId: string | null = null;
    try {
      const parsed = JSON.parse(rawResponse) as Record<string, unknown>;
      for (const key of ['job_id', 'jobId', 'JobId', 'JobID', 'id']) {
        const value = parsed[key];
        if (typeof value === 'string' && value) {
          externalJobId = value;
          break;
        }
      }
    } catch {
      console.warn(`${LOG} provider response was not JSON`, {
        jobId: job.id,
        body: rawResponse.slice(0, 500),
      });
    }

    if (!externalJobId) {
      // Without it the webhook has nothing to match on, so the job would be
      // accepted and then permanently orphaned. Better to fail loudly now.
      throw new Error(
        'Provider accepted the job but returned no job id — the webhook would ' +
          'have nothing to match against.'
      );
    }

    await admin
      .from('processing_jobs')
      .update({
        status: 'queued',
        external_job_id: externalJobId,
        submitted_at: new Date().toISOString(),
        video_url_expires_at: vendorUrl.expiresAt?.toISOString() ?? null,
        error_message: null,
      })
      .eq('id', job.id);

    console.log(`${LOG} submitted`, {
      jobId: job.id,
      externalJobId,
      billableSeconds,
    });

    return NextResponse.json({
      jobId: job.id,
      externalJobId,
      status: 'queued',
      billableSeconds,
      usedSeconds: reservation.usedSeconds,
      capSeconds: reservation.capSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error(`${LOG} submission failed`, { jobId: job.id, message });

    // Hand the allowance back, and retire the credential — the vendor either
    // never got it or cannot use it.
    await releaseQuota(admin, job.id);
    await createVideoUrlStrategy(admin)
      .revoke(job.id)
      .catch(() => {
        /* best effort; an unused token expiring on its own is untidy, not unsafe */
      });

    await admin
      .from('processing_jobs')
      .update({ status: 'failed', error_message: message })
      .eq('id', job.id);

    return NextResponse.json(
      { error: 'Could not submit this match for analysis.', detail: message },
      { status: 502 }
    );
  }
}

/**
 * Absolute URL the vendor POSTs results to. They call us from outside, so a
 * relative path or a localhost origin is useless.
 */
function buildWebhookUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;

  const origin = base.replace(/\/+$/, '');
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return null;

  return `${origin}/api/webhooks/splitstep`;
}
