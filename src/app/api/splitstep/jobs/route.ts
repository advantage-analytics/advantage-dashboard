/**
 * Submit an uploaded match video for analysis (spec §3.3).
 *
 * The upload wizard has already created the `processing_jobs` row and put the
 * video in Azure Blob Storage; this is the step that spends an allowance and
 * hands the job to the vendor. Replaces `scripts/splitstep-submit.ts` for real
 * users — the script stays for the smoke test, where hardcoding metadata is the
 * point.
 *
 * Called automatically by the upload wizard the moment a transfer finishes —
 * see useUploadMatchWizard.ts. A submit failure here deliberately does NOT mark
 * the job failed: the bytes are safely in Azure and `status: 'uploaded'` is the
 * one state a retry needs nothing re-uploaded from.
 *
 * Order matters, and it is: verify ownership → reserve quota → mint URL →
 * submit → record. Quota is reserved BEFORE the vendor is called, because an
 * allowance only checked afterwards cannot refuse anything. Every failure past
 * the reservation hands it back.
 */

import { NextResponse, after, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { adoptOrphanedDeliveries } from '@/lib/services/splitstep/adopt-deliveries';
import { buildSplitStepJobRequest } from '@/lib/services/splitstep/job-request';
import { parseWebhookPayload } from '@/lib/services/splitstep/webhook-payload';
import { resolveWebhookUrl } from '@/lib/services/splitstep/config';
import {
  createVideoUrlStrategy,
  resolveAzureStorageConfig,
} from '@/lib/services/splitstep/video-url';
import { releaseQuota, reserveQuota } from '@/lib/services/splitstep/quota';
import { getWorkspaceContext } from '@/lib/workspace/active-workspace-server';
import { billingWorkspaceFor } from '@/lib/workspace/types';

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
   * ends every odd game; this refers only to the start. Get it wrong and every
   * statistic belongs to the wrong player, with nothing in the UI looking off.
   *
   * OPTIONAL, and that is new. This comment used to say "not persisted on
   * processing_jobs — no column exists", which stopped being true when
   * migration 20260807072714 added all three columns and this route started
   * writing them at submit. So the wizard still sends them on a first submit,
   * where the columns are still null; a resubmission sends none of them and
   * the row supplies the answers instead.
   *
   * That is what makes retry safe. The alternative — asking again — would put
   * the three questions that silently misattribute a whole match in front of
   * somebody whose only intent was to press "try again".
   */
  initialTopPlayerIsPlayer1?: boolean;
  adScoring?: boolean;
  fixedCamera?: boolean;
}

/**
 * Everything this deployment needs before a submission can possibly succeed.
 *
 * Checked once, up front, rather than at the three depths these used to sit
 * at — webhook URL after two lookups, vendor credentials after quota was
 * already reserved, Worker URL deeper still inside mint(). On a deployment
 * missing any of them (which is the current state until Vercel is configured)
 * every attempt burned a job lookup, a match lookup, and a full
 * reserve-then-release cycle before discovering it could never have worked.
 */
function resolveDeploymentConfig():
  | { ok: true; webhookUrl: string; apiUrl: string; apiKey: string }
  | { ok: false; missing: string } {
  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) {
    return { ok: false, missing: 'NEXT_PUBLIC_SITE_URL (absent, or points at localhost)' };
  }

  const apiUrl = process.env.SPLITSTEP_API_URL;
  const apiKey = process.env.SPLITSTEP_API_KEY;

  // The published vendor client still points at api.example.com; refuse rather
  // than POST a real job at a placeholder host.
  if (!apiUrl || apiUrl.includes('api.example.com')) {
    return { ok: false, missing: 'SPLITSTEP_API_URL (absent, or still the placeholder)' };
  }
  if (!apiKey) {
    return { ok: false, missing: 'SPLITSTEP_API_KEY' };
  }
  // createVideoUrlStrategy() throws on incomplete storage config —
  // synchronously, deep inside the submit path. Catch it here where it can
  // still be a clean 503.
  const storage = resolveAzureStorageConfig();
  if (!storage.ok) {
    return { ok: false, missing: storage.missing };
  }

  return { ok: true, webhookUrl, apiUrl, apiKey };
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

  // The orientation check used to sit here, before anything was loaded. It has
  // moved below the job AND match lookups, so a RESUBMISSION can take the
  // answer from a row instead of the body — see `effective*`. Still refused
  // rather than defaulted, just later and from three sources instead of one.

  // Before touching the database or an allowance: can this deployment finish
  // the job at all?
  const config = resolveDeploymentConfig();
  if (!config.ok) {
    console.error(`${LOG} refusing — deployment not configured`, {
      missing: config.missing,
    });
    return NextResponse.json(
      { error: 'Analysis is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

  // 2. Load the job and prove the caller owns it.
  const { data: jobRow, error: jobError } = await admin
    .from('processing_jobs')
    .select(
      'id, match_id, created_by, status, external_job_id, video_object_key, start_time_seconds, end_time_seconds, attempt_count, initial_top_player_is_player1, ad_scoring, fixed_camera'
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
    attempt_count: number | null;
    initial_top_player_is_player1: boolean | null;
    ad_scoring: boolean | null;
    fixed_camera: boolean | null;
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
    .select('id, player1_name, player2_name, score, match_type, program_id, format, fixed_camera, initial_top_player_is_player1')
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
    /** The workspace this match belongs to. NULL = personal. */
    program_id: string | null;
    /** `ad_scoring` lives in here, not in a column of its own. */
    format: { ad_scoring?: boolean } | null;
    fixed_camera: boolean | null;
    initial_top_player_is_player1: boolean | null;
  };

  // ── The three vendor answers: body, then job, then match ──────────────────
  //
  // A first submit carries them in the body — the wizard has just asked. A
  // RESUBMISSION carries none, because the only caller that knows them is a
  // wizard that closed long ago, and re-asking would put the three questions
  // that silently misattribute every statistic in front of somebody whose only
  // intent was to press "try again".
  //
  // Three sources because two were not enough, and the reason is worth keeping.
  // Migration 20260807072714 added these columns to `processing_jobs` so the
  // answers would outlive the request — but this route only WRITES them at
  // submit, and the outer catch marks a failed submit `failed`, not
  // `uploaded`. So a job still sitting at `uploaded` is precisely one where the
  // route was never reached or returned early, and its job columns are null.
  // The retry case and the populated-job case are disjoint.
  //
  // The match row is what closes that gap: the wizard writes
  // `initial_top_player_is_player1`, `fixed_camera` and `format.ad_scoring`
  // when it creates the match, before any upload begins. Those are the answers
  // the person actually gave.
  //
  // Order is most-specific-first. Body is an explicit statement of intent; the
  // job row is what the last attempt used; the match row is what was originally
  // answered.
  const effectiveTopPlayer =
    typeof initialTopPlayerIsPlayer1 === 'boolean'
      ? initialTopPlayerIsPlayer1
      : job.initial_top_player_is_player1 ?? match.initial_top_player_is_player1;
  const effectiveAdScoring =
    typeof adScoring === 'boolean'
      ? adScoring
      : job.ad_scoring ?? match.format?.ad_scoring;
  const effectiveFixedCamera =
    typeof fixedCamera === 'boolean'
      ? fixedCamera
      : job.fixed_camera ?? match.fixed_camera;

  if (typeof effectiveTopPlayer !== 'boolean') {
    // Refused rather than defaulted. A default here is a coin flip on which
    // player every statistic belongs to. Reaching this means neither the job
    // nor the match recorded an orientation, which is a match created before
    // those columns existed — a human has to answer again.
    return NextResponse.json(
      { error: 'initialTopPlayerIsPlayer1 is required and must be a boolean' },
      { status: 400 }
    );
  }

  // 5. Build and validate before anything is spent. buildSplitStepJobRequest
  //    enforces singles-only, a trim consistent with the score, and the
  //    top-player-first ordering of SetGameScores.
  const built = buildSplitStepJobRequest({
    matchId: job.match_id,
    videoUrl: '',
    allowEmptyVideoUrl: true,
    webhookUrl: config.webhookUrl,
    player1Name: match.player1_name,
    player2Name: match.player2_name,
    initialTopPlayerIsPlayer1: effectiveTopPlayer,
    startTimeSeconds: Number(job.start_time_seconds),
    endTimeSeconds: Number(job.end_time_seconds),
    player1Scores: match.score?.player1 ?? [],
    player2Scores: match.score?.player2 ?? [],
    // Passed through, NOT defaulted. These used to fall back to `true` here
    // while the wizard's own default was `false` — two silent, opposite guesses
    // at fields that change how the vendor reads the match. The builder refuses
    // a non-boolean now, so an omission becomes a 422 the caller can act on.
    adScoring: effectiveAdScoring ?? undefined,
    fixedCamera: effectiveFixedCamera ?? undefined,
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
  //
  // Billed to the MATCH's workspace, not whichever one the caller happens to
  // have selected. A coach can switch workspaces between starting an upload and
  // submitting it, and the budget that pays for a match is the one the match
  // belongs to. `billingWorkspaceFor()` is that rule, lifted out of this file so
  // `/api/splitstep/upload-url` asks its permission question about the same
  // workspace this one charges — a check aimed at a different budget is a check
  // that only looks enforced.
  const workspaceContext = await getWorkspaceContext();
  const billingWorkspace = billingWorkspaceFor(
    workspaceContext?.available ?? [],
    match.program_id
  );

  if (!billingWorkspace) {
    return NextResponse.json(
      { error: 'You do not have access to the workspace this match belongs to.' },
      { status: 403 }
    );
  }

  const reservation = await reserveQuota({
    supabase: admin,
    jobId: job.id,
    userId: user.id,
    workspace: billingWorkspace,
    seconds: billableSeconds,
  });

  if (!reservation.ok) {
    console.log(
      `${LOG} refused — ${reservation.permission ? 'not permitted' : 'monthly cap'}`,
      {
        jobId: job.id,
        usedSeconds: reservation.usedSeconds,
        capSeconds: reservation.capSeconds,
      }
    );
    return NextResponse.json(
      {
        error: reservation.message,
        usedSeconds: reservation.usedSeconds,
        capSeconds: reservation.capSeconds,
      },
      // 429 is what an exhausted allowance means and it keeps that meaning. A
      // player the program has not authorised is a 403: nothing about waiting
      // for the month to roll over changes the answer.
      { status: reservation.permission ? 403 : 429 }
    );
  }

  // Everything past here must hand the reservation back on failure.
  try {
    // Record what we are about to send. These three have no other home, and
    // the orientation especially must survive the request: Phase 2 maps
    // top-of-frame strokes back onto player1/player2 and has no other
    // authoritative source for which was which.
    await admin
      .from('processing_jobs')
      .update({
        status: 'submitting',
        billable_seconds: billableSeconds,
        // Counted, not pinned. This was `1`, which reset the tally on every
        // resubmission and made "how many times has this been tried" a
        // question the column could not answer.
        attempt_count: (job.attempt_count ?? 0) + 1,
        initial_top_player_is_player1: effectiveTopPlayer,
        ad_scoring: vendorRequest.Ad,
        fixed_camera: vendorRequest.FixedCamera,
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
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apiKey },
      body: JSON.stringify({ ...vendorRequest, VideoUrl: vendorUrl.url }),
      signal: AbortSignal.timeout(30_000),
    });

    const rawResponse = await response.text();

    if (!response.ok) {
      throw new Error(
        `Provider returned ${response.status}: ${rawResponse.slice(0, 500)}`
      );
    }

    // Same defensive read the webhook uses. Their response shape is
    // unconfirmed, and parseWebhookPayload already walks nested objects and
    // every casing we have guessed at — a second, narrower copy here would
    // reject shapes the webhook would happily accept.
    let externalJobId: string | null = null;
    try {
      externalJobId = parseWebhookPayload(JSON.parse(rawResponse)).externalJobId;
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

    // Pick up any delivery that beat this write. The vendor fires `job_queued`
    // on acceptance, and on the first real job it landed 0.9s after our POST —
    // before `external_job_id` existed to match it against, and their payload
    // does not echo `MatchID`, so the usual fallback had nothing to work with.
    //
    // In after(), and deliberately NOT inside the try above: a throw there runs
    // the catch block, which releases quota and retires the video URL. Undoing a
    // submission the vendor has already accepted, because a bookkeeping fixup
    // failed, would be far worse than the orphan it is fixing.
    after(async () => {
      try {
        const result = await adoptOrphanedDeliveries({
          supabase: admin,
          jobId: job.id,
          externalJobId,
        });

        if (result.adopted === 0) return;

        console.log(`${LOG} adopted ${result.adopted} early delivery/deliveries`, {
          jobId: job.id,
          jobStatus: result.jobStatus,
        });

        // The reason this is not merely cosmetic. A `job_failed` that lost the
        // race never reached the webhook's quota release, so those minutes would
        // stay spent against a 2-hour monthly cap with nothing to show for it.
        // releaseQuota() is idempotent via `released = false`.
        if (result.jobStatus === 'failed') {
          await releaseQuota(admin, job.id);
          console.log(`${LOG} quota released for adopted failure`, { jobId: job.id });
        }

        if (result.owedResultsDownload) {
          console.error(
            `${LOG} an adopted delivery carried a results URL that was never ` +
              `downloaded — fetch sas_url from splitstep_webhook_deliveries by ` +
              `hand; it stays valid about a week`,
            { jobId: job.id, externalJobId }
          );
        }
      } catch (err) {
        console.error(`${LOG} could not adopt early deliveries`, {
          jobId: job.id,
          externalJobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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

    // Hand the allowance back and record the credential as retired. Each step
    // is isolated rather than chained: createVideoUrlStrategy() throws
    // SYNCHRONOUSLY when the Azure storage config is incomplete, so a
    // `.catch()` on revoke()'s promise never sees it — and an escape here would
    // skip the one write that matters, leaving the job stuck at 'submitting'
    // forever with the caller getting an unhandled error instead of the 502
    // below.
    await releaseQuota(admin, job.id);

    try {
      await createVideoUrlStrategy(admin).markUrlRetired(job.id);
    } catch {
      /* Best effort, and worth little: this is bookkeeping only — a SAS cannot
         be withdrawn, which is why the method is not called revoke(). It costs
         nothing here because we are on the path where the POST never reached
         the vendor, so nobody outside this system has seen the URL. See
         video-url/azure-sas.ts. */
    }

    const { error: markError } = await admin
      .from('processing_jobs')
      .update({ status: 'failed', error_message: message })
      .eq('id', job.id);

    if (markError) {
      console.error(`${LOG} could not mark the job failed`, {
        jobId: job.id,
        error: markError.message,
      });
    }

    return NextResponse.json(
      { error: 'Could not submit this match for analysis.', detail: message },
      { status: 502 }
    );
  }
}
