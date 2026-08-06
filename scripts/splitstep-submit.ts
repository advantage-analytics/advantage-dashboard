/**
 * SplitStep smoke test — submit one job by hand.
 *
 * Deliberately a script and not `POST /api/splitstep/jobs` (handoff §3). The
 * goal is one real job producing one real results JSON, which is what closes
 * Q1–Q3 and unblocks the derivation engine. Quota reservation, ownership checks
 * and the upload path are Phase 1 proper and are not needed to get there.
 *
 * Run from repo root:
 *   npx tsx scripts/splitstep-submit.ts             # dry run — prints, sends nothing
 *   npx tsx scripts/splitstep-submit.ts --submit    # mint URL, POST, record the job
 *
 * The dry run is the default on purpose. The two fields most likely to be wrong
 * — InitialTopPlayer and the ordering of SetGameScores — are invisible when
 * wrong: every statistic ends up attributed to the wrong player and nothing in
 * the UI looks off. So the dry run prints the payload in plain English and asks
 * you to read it before anything is spent.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_APP_URL, R2_PUBLIC_WORKER_URL, SPLITSTEP_API_URL, SPLITSTEP_API_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

import { buildSplitStepJobRequest } from '../src/lib/services/splitstep/job-request';
import { videoObjectKey } from '../src/lib/services/splitstep/object-keys';
import { createVideoUrlStrategy } from '../src/lib/services/splitstep/video-url';
import { parseWebhookPayload } from '../src/lib/services/splitstep/webhook-payload';

// ---------------------------------------------------------------------------
// EDIT THIS BLOCK — the match being submitted.
// ---------------------------------------------------------------------------
//
// Video requirements the vendor enforces: ≥1080p, ≥30fps, singles, camera behind
// the baseline and elevated. Do NOT route the file through src/lib/video/compress.ts
// on the way in — it transcodes to 720p, under their floor (handoff §8).

const MATCH = {
  /** `matches.id`. Must be a real row — the job row FKs to it. */
  matchId: '',
  /** `users.id` — the owner. Must be a real row. */
  userId: '',

  player1Name: '',
  player2Name: '',

  /**
   * True when PLAYER 1 stood at the TOP of frame in the FIRST FRAME of the
   * trimmed video. Camera-relative, not a property of the player — they change
   * ends every odd game, so this describes the start of the video only.
   */
  initialTopPlayerIsPlayer1: true,

  /**
   * Trim window in seconds against the ORIGINAL video. Must bracket COMPLETE
   * games consistent with the score below: start just before the first serve,
   * end just after the last point.
   */
  startTimeSeconds: 0,
  endTimeSeconds: 0,

  /**
   * Per-set GAME counts, player1 first — the builder reorders to top-first.
   * A 7-6 set is [7, 6]; never the tiebreak points.
   */
  player1Scores: [] as (number | null)[],
  player2Scores: [] as (number | null)[],

  /** Ad scoring (false = no-ad). */
  adScoring: true,
  /** Camera stationary for the whole recording. */
  fixedCamera: true,

  /** File name of the video already uploaded to R2 — sets the object key. */
  videoFileName: 'original.mp4',
};

// ---------------------------------------------------------------------------

// Minimal .env.local loader, matching scripts/cleanup-orphan-storage.ts.
try {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '').trim();
  }
} catch {
  // Fall through to the required-env check below.
}

const SUBMIT = process.argv.includes('--submit');

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`${name} is not set in .env.local.`);
  return value;
}

async function main() {
  if (!MATCH.matchId || !MATCH.userId) {
    fail('Edit the MATCH block at the top of this script first (matchId, userId).');
  }

  const appUrl = requireEnv('NEXT_PUBLIC_APP_URL');
  const webhookUrl = `${appUrl.replace(/\/+$/, '')}/api/webhooks/splitstep`;

  if (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) {
    fail(
      `NEXT_PUBLIC_APP_URL points at localhost (${appUrl}). The vendor calls the ` +
        `webhook from their infrastructure and cannot reach it. Use the deployed origin.`
    );
  }

  const objectKey = videoObjectKey({
    userId: MATCH.userId,
    matchId: MATCH.matchId,
    fileName: MATCH.videoFileName,
  });

  // Build with a placeholder URL first, so a dry run needs no Worker, no R2 and
  // no job row — just the metadata.
  const draft = buildSplitStepJobRequest({
    ...MATCH,
    matchId: MATCH.matchId,
    videoUrl: '',
    webhookUrl,
    allowEmptyVideoUrl: true,
  });

  if (!draft.ok) {
    fail(`Match metadata is incomplete:\n  - ${draft.errors.join('\n  - ')}`);
  }

  const request = draft.request;

  // The safety readout. Read this before spending a processing job.
  console.log('\n─── Job payload ' + '─'.repeat(50));
  console.log(JSON.stringify({ ...request, VideoUrl: '<minted at submit>' }, null, 2));
  console.log('\n─── Read this back in plain English ' + '─'.repeat(30));
  console.log(`  Top of frame at video start : ${request.InitialTopPlayer}`);
  console.log(`  Bottom of frame             : ${request.InitialBottomPlayer}`);
  console.log(
    `  Set scores (TOP player first): ${request.SetGameScores.map((s) => s.join('-')).join(', ')}`
  );
  console.log(
    `  Trim window                 : ${request.StartTime}s → ${request.EndTime}s ` +
      `(${(request.EndTime - request.StartTime).toFixed(0)}s billable)`
  );
  console.log(`  Scoring                     : ${request.Ad ? 'ad' : 'no-ad'}`);
  console.log(`  Webhook                     : ${request.WebhookUrl}`);
  console.log(`  Expected R2 object key      : ${objectKey}`);
  console.log('─'.repeat(66) + '\n');

  if (!SUBMIT) {
    console.log('Dry run — nothing sent. Re-run with --submit once the readout above is right.');
    console.log(`Upload the video to R2 at: ${objectKey}\n`);
    return;
  }

  const apiUrl = requireEnv('SPLITSTEP_API_URL');
  const apiKey = requireEnv('SPLITSTEP_API_KEY');
  requireEnv('R2_PUBLIC_WORKER_URL');

  if (apiUrl.includes('api.example.com')) {
    fail(
      'SPLITSTEP_API_URL is still the placeholder from the vendor docs. ' +
        'Get the real base URL from Josh before submitting (handoff §4).'
    );
  }

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Job row first — the webhook needs something to attach to, and the token
  //    mint writes onto it.
  const { data: job, error: jobError } = await supabase
    .from('processing_jobs')
    .insert({
      match_id: MATCH.matchId,
      created_by: MATCH.userId,
      status: 'submitting',
      start_time_seconds: request.StartTime,
      end_time_seconds: request.EndTime,
      billable_seconds: Math.ceil(request.EndTime - request.StartTime),
    })
    .select('id')
    .single();

  if (jobError || !job) {
    fail(`Could not create the processing_jobs row: ${jobError?.message}`);
  }

  console.log(`✓ processing_jobs row ${job.id}`);

  // 2. Mint the vendor-facing URL. Points at the Worker, not R2 — this smoke
  //    test is the single best chance to observe WHEN they fetch, which is the
  //    queue latency they declined to disclose (handoff §3).
  const strategy = createVideoUrlStrategy(supabase);
  const vendorUrl = await strategy.mint({ jobId: job.id, objectKey });
  console.log(`✓ video URL minted, expires ${vendorUrl.expiresAt?.toISOString() ?? 'never'}`);

  // 3. Submit.
  const body = { ...request, VideoUrl: vendorUrl.url };
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log(`\n─── Vendor response (${response.status}) ` + '─'.repeat(35));
  console.log(responseText.slice(0, 4000));
  console.log('─'.repeat(66) + '\n');

  if (!response.ok) {
    await supabase
      .from('processing_jobs')
      .update({
        status: 'failed',
        error_message: `Submit failed: ${response.status} ${responseText.slice(0, 500)}`,
      })
      .eq('id', job.id);
    fail(`Vendor rejected the job (${response.status}). Job marked failed.`);
  }

  // Their response shape is unconfirmed, so extract the job id the same
  // defensive way the webhook does rather than assuming a field name.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    console.warn('⚠ Response is not JSON — external_job_id could not be extracted.');
  }
  const externalJobId = parsed ? parseWebhookPayload(parsed).externalJobId : null;

  await supabase
    .from('processing_jobs')
    .update({
      status: 'queued',
      external_job_id: externalJobId,
      submitted_at: new Date().toISOString(),
      attempt_count: 1,
    })
    .eq('id', job.id);

  if (!externalJobId) {
    console.warn(
      '⚠ No job id found in the response. The webhook will fall back to matching\n' +
        '  on the echoed MatchID, so deliveries should still attach — but note the\n' +
        "  vendor's actual field name and tell the webhook about it.\n"
    );
  }

  console.log(`✓ Submitted. job=${job.id} external_job_id=${externalJobId ?? '(none)'}`);
  console.log('\nWatch for deliveries:');
  console.log(
    '  select received_at, event, external_job_id, job_id, results_object_key\n' +
      '    from splitstep_webhook_deliveries order by received_at desc;\n'
  );
  console.log('Watch for the vendor fetching the video (= processing actually started):');
  console.log(
    `  select vendor_first_downloaded_at, vendor_request_count\n` +
      `    from processing_jobs where id = '${job.id}';\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
