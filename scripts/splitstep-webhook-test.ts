/**
 * Proves our half of the webhook loop, with the vendor uninvolved.
 *
 * This is the first item in the smoke test for a reason: once it passes, any
 * later failure is unambiguously on their side. Without it, a silent webhook
 * during the pilot has two suspects and no way to tell them apart.
 *
 * Run from repo root, against a DEPLOYED url (they POST to it, so localhost
 * proves nothing):
 *   npx tsx scripts/splitstep-webhook-test.ts --url https://app.advantage-analytics.com
 *
 * Defaults to NEXT_PUBLIC_SITE_URL. Sends the shared secret when
 * SPLITSTEP_WEBHOOK_SECRET is set, and exercises the unsigned path when it is
 * not — both are supported modes, see .env.example.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Neither url on a completion is mocked. The script uploads two fixtures into
 * the `match-results` bucket and signs them — one standing in for the results
 * JSON, one for the trimmed video — so both the download and the Azure
 * server-side copy run end-to-end over real HTTP without an external host.
 *
 * The copy is worth testing precisely because its failure is silent: the vendor
 * sends `trimmed_video_url` alongside `sas_url`, we used to ignore it, and the
 * webhook then deleted our own source video. Nothing about that looked wrong
 * until someone went looking for the match and found no video at all.
 *
 * Everything it creates is removed on the way out, including after a failure,
 * and that now includes a blob in the real videos container.
 */

import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './lib/env';
import { RESULTS_BUCKET } from '../src/lib/services/splitstep/config';
import {
  resultsObjectKey,
  trimmedObjectKey,
} from '../src/lib/services/splitstep/object-keys';
import {
  AZURE_STORAGE_ENV_VARS,
  deleteVideoBlob,
  resolveAzureStorageConfig,
  trimmedCopyStatus,
} from '../src/lib/services/splitstep/video-url';

/* ─── env ─── */

loadEnvLocal();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Add it to .env.local.`);
    process.exit(1);
  }
  return v;
}

const baseUrl = (flag('--url') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('No target. Pass --url https://your-deployment or set NEXT_PUBLIC_SITE_URL.');
  process.exit(1);
}

const endpoint = `${baseUrl}/api/webhooks/splitstep`;
const secret = process.env.SPLITSTEP_WEBHOOK_SECRET ?? null;
const supabase: SupabaseClient = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

const FIXTURE_KEY = `__webhook_test__/${Date.now()}-strokes.json`;
/* Shaped like a stroke array so the bytes that land are the bytes we expect. */
const FIXTURE = JSON.stringify([
  { pred_rally_id: 1, pred_rally_stroke_number: 1, stroke_type: 'serve', in: true },
]);

/**
 * Stands in for the vendor's trimmed video.
 *
 * A handful of bytes rather than a real encode: what is under test is that the
 * url is parsed, the Azure server-side copy is started and the key recorded —
 * none of which cares what the bytes are. A real video would make the run take
 * minutes and prove nothing extra.
 *
 * It does have to be genuinely fetchable over public HTTPS, because AZURE pulls
 * it, not this script. A mock url would fail in Azure with nothing to read.
 */
const VIDEO_FIXTURE_KEY = `__webhook_test__/${Date.now()}-trimmed.mp4`;
const VIDEO_FIXTURE = 'not-a-real-video-just-bytes-to-copy';

/* ─── assertions ─── */

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`, detail !== undefined ? detail : '');
  }
}

/**
 * Poll until a condition holds, or give up.
 *
 * The webhook answers 200 before it downloads results — deliberately, because
 * the vendor times out at 30s and never retries — so anything that happens in
 * after() cannot be asserted synchronously.
 */
async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 20_000,
  intervalMs = 500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * base64(HMAC-SHA256(secret, raw_body)) — the scheme the vendor publishes.
 * Signed over the exact bytes sent, which is why the body is stringified once
 * and reused rather than serialized twice.
 */
function sign(rawBody: string): string {
  return createHmac('sha256', secret!).update(rawBody, 'utf8').digest('base64');
}

async function post(body: unknown): Promise<{ status: number; json: unknown }> {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret) headers['x-splitstep-signature'] = sign(rawBody);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: rawBody,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* a non-JSON body is itself the finding; status still tells the story */
  }
  return { status: res.status, json };
}

async function jobStatus(jobId: string): Promise<string | null> {
  const { data } = await supabase
    .from('processing_jobs')
    .select('status')
    .eq('id', jobId)
    .maybeSingle();
  return (data as { status: string } | null)?.status ?? null;
}

async function deliveryCount(externalJobId: string): Promise<number> {
  const { count } = await supabase
    .from('splitstep_webhook_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('external_job_id', externalJobId);
  return count ?? 0;
}

/* ─── fixtures ─── */

/**
 * Every job this run created, with the ids needed to DERIVE the object keys the
 * webhook will write under.
 *
 * Deriving beats observing. An earlier version removed the results object only
 * inside `if (key)` after its assertion passed, and the trimmed blob only after
 * a poll succeeded — so the run that failed was exactly the run that leaked, and
 * it did: an 82-byte result object sat in `match-results` under a real match
 * until someone went looking. The keys are pure functions of these three ids, so
 * cleanup can name them whether or not anything worked.
 */
const createdJobs: { id: string; matchId: string; userId: string }[] = [];

/**
 * Whether this machine can talk to Azure.
 *
 * The COPY always happens — it runs on the server under test, which has its own
 * credentials. This only decides whether the script can verify and clean up
 * afterwards. Same resolver the app uses, so "configured" means one thing.
 */
const azureConfigured = resolveAzureStorageConfig().ok;

async function makeJob(externalJobId: string): Promise<{ id: string }> {
  const { data: match } = await supabase
    .from('matches')
    .select('id, created_by')
    .not('created_by', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!match) throw new Error('No match row to attach a test job to.');

  const row = match as { id: string; created_by: string };
  const { data, error } = await supabase
    .from('processing_jobs')
    .insert({
      match_id: row.id,
      created_by: row.created_by,
      provider: 'splitstep',
      external_job_id: externalJobId,
      status: 'submitting',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not create test job: ${error.message}`);

  const job = data as { id: string };
  createdJobs.push({ id: job.id, matchId: row.id, userId: row.created_by });
  return job;
}

async function cleanup(): Promise<void> {
  // Object keys FIRST, while the ids are still meaningful, then the rows.
  //
  // Both keys are derived rather than read back from the job row, so a run that
  // failed halfway still removes whatever the webhook managed to write. Removing
  // a key that was never written is a no-op in both stores.
  const resultKeys = createdJobs.map((j) =>
    resultsObjectKey({ userId: j.userId, matchId: j.matchId, jobId: j.id })
  );

  await supabase.storage
    .from(RESULTS_BUCKET)
    .remove([FIXTURE_KEY, VIDEO_FIXTURE_KEY, ...resultKeys]);

  // Blobs the webhook copied into the REAL videos container. Nothing else will
  // ever remove them: the orphan sweeper only deletes blobs whose match is gone,
  // and this test attaches to a match that very much still exists.
  for (const j of createdJobs) {
    const blobName = trimmedObjectKey({
      userId: j.userId,
      matchId: j.matchId,
      jobId: j.id,
    });

    if (!azureConfigured) {
      console.error(
        `LEFTOVER: ${blobName} may be in the videos container and this machine ` +
          `has no Azure credentials to remove it. Delete it by hand.`
      );
      continue;
    }

    try {
      await deleteVideoBlob({ blobName });
    } catch (err) {
      console.error(
        `Could not remove the test blob ${blobName} — delete it by hand:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (createdJobs.length) {
    await supabase
      .from('processing_jobs')
      .delete()
      .in('id', createdJobs.map((j) => j.id));
  }
  // Results the webhook itself wrote, under the real key layout.
  const { data: leftovers } = await supabase.storage
    .from(RESULTS_BUCKET)
    .list('__webhook_test__');
  if (leftovers?.length) {
    await supabase.storage
      .from(RESULTS_BUCKET)
      .remove(leftovers.map((f) => `__webhook_test__/${f.name}`));
  }
}

/* ─── the run ─── */

async function main(): Promise<void> {
  console.log(`\nTarget: ${endpoint}`);
  console.log(`Secret: ${secret ? 'set — signed deliveries' : 'UNSET — exercising the unsigned path'}\n`);

  // A signed URL to our own fixture stands in for the vendor's sas_url, so the
  // download is real HTTP rather than a mock that proves nothing.
  const upload = await supabase.storage
    .from(RESULTS_BUCKET)
    .upload(FIXTURE_KEY, new Blob([FIXTURE], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    });
  if (upload.error) throw new Error(`Fixture upload failed: ${upload.error.message}`);

  const signed = await supabase.storage
    .from(RESULTS_BUCKET)
    .createSignedUrl(FIXTURE_KEY, 600);
  if (signed.error || !signed.data) {
    throw new Error(`Could not sign fixture: ${signed.error?.message}`);
  }
  const sasUrl = signed.data.signedUrl;

  // The same treatment for the trimmed video, so the copy path runs against a
  // real url that Azure can reach rather than a string that only looks like one.
  const videoUpload = await supabase.storage
    .from(RESULTS_BUCKET)
    .upload(VIDEO_FIXTURE_KEY, new Blob([VIDEO_FIXTURE], { type: 'video/mp4' }), {
      contentType: 'video/mp4',
      upsert: true,
    });
  if (videoUpload.error) {
    throw new Error(`Video fixture upload failed: ${videoUpload.error.message}`);
  }

  const signedVideo = await supabase.storage
    .from(RESULTS_BUCKET)
    .createSignedUrl(VIDEO_FIXTURE_KEY, 600);
  if (signedVideo.error || !signedVideo.data) {
    throw new Error(`Could not sign video fixture: ${signedVideo.error?.message}`);
  }
  const trimmedVideoUrl = signedVideo.data.signedUrl;

  const completedExtId = `test-completed-${Date.now()}`;
  const failedExtId = `test-failed-${Date.now()}`;
  const unknownExtId = `test-orphan-${Date.now()}`;

  const completedJob = await makeJob(completedExtId);
  const failedJob = await makeJob(failedExtId);

  console.log('1. queued');
  {
    const r = await post({ status: 'queued', externalJobId: completedExtId });
    check('returns 200', r.status === 200, r);
    check('job moves to queued', (await jobStatus(completedJob.id)) === 'queued');
    check('delivery recorded', (await deliveryCount(completedExtId)) === 1);
  }

  // Declared once and reused by the duplicate check below, because "identical
  // body" is the entire premise of that test and dedupe is on a hash of the
  // bytes. Two hand-maintained copies drifted the moment a field was added to
  // one of them, and the duplicate test failed for a reason that had nothing to
  // do with deduping.
  const completionBody = {
    status: 'job_completed',
    externalJobId: completedExtId,
    sas_url: sasUrl,
    // Named exactly as the vendor's docs have it. If they ever rename it, this
    // is the check that fails rather than a silent loss of the video.
    trimmed_video_url: trimmedVideoUrl,
  };

  console.log('2. job_completed — results fetched and stored, trimmed video copied');
  {
    const r = await post(completionBody);
    check('returns 200', r.status === 200, r);

    // The download runs in after(), so it completes AFTER the 200 — that is the
    // point of the change, since the vendor times out at 30s and never retries.
    // Poll rather than assert immediately.
    const reached = await waitFor(
      async () => (await jobStatus(completedJob.id)) === 'completed'
    );
    check('job reaches completed (async, after the 200)', reached);

    // Polled, not read once. `status` flips synchronously inside
    // record_splitstep_webhook, so the wait above returns the instant the 200
    // lands — while the download it is standing in for has not started. Reading
    // the key straight after was a race that happened to keep winning.
    let key: string | null | undefined;
    const gotKey = await waitFor(async () => {
      const { data } = await supabase
        .from('processing_jobs')
        .select('results_object_key')
        .eq('id', completedJob.id)
        .maybeSingle();
      key = (data as { results_object_key: string | null } | null)?.results_object_key;
      return Boolean(key);
    });
    check('results_object_key is set', gotKey, key);

    if (key) {
      const dl = await supabase.storage.from(RESULTS_BUCKET).download(key);
      const text = dl.data ? await dl.data.text() : '';
      check('stored bytes match the fixture byte-for-byte', text === FIXTURE, {
        got: text.slice(0, 120),
      });
      await supabase.storage.from(RESULTS_BUCKET).remove([key]);
    }

    // The trimmed video. Its own poll: the copy is started in the same after()
    // block but finishes independently of the results download.
    const gotTrimmedKey = await waitFor(async () => {
      const { data } = await supabase
        .from('processing_jobs')
        .select('trimmed_object_key')
        .eq('id', completedJob.id)
        .maybeSingle();
      return Boolean((data as { trimmed_object_key: string | null } | null)?.trimmed_object_key);
    });
    check('trimmed_object_key is set — the video url was not dropped', gotTrimmedKey);

    const { data: jobRow } = await supabase
      .from('processing_jobs')
      .select('trimmed_object_key, trimmed_video_url, video_object_key')
      .eq('id', completedJob.id)
      .maybeSingle();
    const job = jobRow as {
      trimmed_object_key: string | null;
      trimmed_video_url: string | null;
      video_object_key: string | null;
    } | null;

    check("the vendor's url is recorded for recovery", Boolean(job?.trimmed_video_url));

    // No bookkeeping for cleanup here — it derives the key from the job's ids,
    // so a failure anywhere above still gets swept.
    if (job?.trimmed_object_key) {
      if (azureConfigured) {
        // A few bytes cross-account still is not instantaneous, so poll. A real
        // match takes minutes, which is exactly why the source delete defers to
        // the sweeper rather than blocking the webhook.
        const copied = await waitFor(
          async () =>
            (await trimmedCopyStatus({ blobName: job.trimmed_object_key! })) === 'success',
          30_000
        );
        check('Azure reports the copy succeeded', copied);
      } else {
        console.log(
          `  SKIP  copy verification — ${AZURE_STORAGE_ENV_VARS.join(' / ')} not in .env.local`
        );
      }
    }
  }

  console.log('3. duplicate delivery is a no-op');
  {
    const before = await deliveryCount(completedExtId);
    const r = await post(completionBody);
    check('returns 200', r.status === 200, r);
    check('job still completed', (await jobStatus(completedJob.id)) === 'completed');
    check(
      'no duplicate row for an identical body',
      (await deliveryCount(completedExtId)) === before
    );
  }

  console.log('4. late out-of-order delivery cannot drag the job backwards');
  {
    // The whole point of splitstep_status_rank(). A retried `queued` arriving
    // after completion must not reopen a finished job.
    const r = await post({ status: 'queued', externalJobId: completedExtId, note: 'late retry' });
    check('returns 200', r.status === 200, r);
    check(
      'job stays completed, not dragged back to queued',
      (await jobStatus(completedJob.id)) === 'completed'
    );
  }

  console.log('5. job_failed records the message verbatim');
  {
    const message = 'Underlying: frame decode error at 00:12:31 [raw]';
    const r = await post({
      status: 'job_failed',
      externalJobId: failedExtId,
      message,
    });
    check('returns 200', r.status === 200, r);
    check('job moves to failed', (await jobStatus(failedJob.id)) === 'failed');

    const { data } = await supabase
      .from('processing_jobs')
      .select('error_message')
      .eq('id', failedJob.id)
      .maybeSingle();
    check(
      'message stored verbatim, unparsed',
      (data as { error_message: string | null } | null)?.error_message === message
    );
  }

  console.log('5b. structured error object lands in the error columns');
  {
    // The real failure shape, confirmed 2026-08-28: a top-level message with
    // raw internals (never shown), and an error object whose message is the
    // designated end-user string. The webhook must store the object's fields
    // and prefer its message.
    const structuredExtId = `test-structured-${Date.now()}`;
    const structuredJob = await makeJob(structuredExtId);
    const r = await post({
      status: 'job_failed',
      externalJobId: structuredExtId,
      message: "Failed to download video: HTTPSConnectionPool(host='x'): Read timed out.",
      error: {
        code: 'VIDEO_UNREACHABLE',
        category: 'video_access',
        step: 'downloading_video',
        message: 'We could not download your video.',
        detail: "HTTPSConnectionPool(host='x'): Read timed out.",
      },
    });
    check('returns 200', r.status === 200, r);
    check('job moves to failed', (await jobStatus(structuredJob.id)) === 'failed');

    const { data } = await supabase
      .from('processing_jobs')
      .select('error_code, error_category, error_step, error_message')
      .eq('id', structuredJob.id)
      .maybeSingle();
    const row = data as {
      error_code: string | null;
      error_category: string | null;
      error_step: string | null;
      error_message: string | null;
    } | null;
    check('error_code recorded', row?.error_code === 'VIDEO_UNREACHABLE', row);
    check('error_category recorded', row?.error_category === 'video_access');
    check('error_step recorded', row?.error_step === 'downloading_video');
    check(
      "error_message is error.message, NOT the unparseable top-level one",
      row?.error_message === 'We could not download your video.',
      row?.error_message
    );

    // This failure class triggers the auto-resubmit attempt in after() — but
    // the test job has no video_object_key, so resubmitJob must decline at
    // the video check without creating a child row. A deployed webhook cannot
    // be allowed to reach a real vendor from a test, which is why the
    // SUCCESSFUL auto-resubmission is asserted in splitstep-resubmit-test.ts
    // against a mocked vendor instead.
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const { count } = await supabase
      .from('processing_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('resubmitted_from_job_id', structuredJob.id);
    check(
      'declined auto-resubmit creates no child row',
      (count ?? 0) === 0,
      count
    );
  }

  console.log('5c. a video-quality failure is never auto-resubmitted');
  {
    // VIDEO_RESOLUTION_TOO_LOW can never succeed on retry — the classifier
    // must not even attempt one (no step match, no code match).
    const qualityExtId = `test-quality-${Date.now()}`;
    const qualityJob = await makeJob(qualityExtId);
    const r = await post({
      status: 'job_failed',
      externalJobId: qualityExtId,
      error: {
        code: 'VIDEO_RESOLUTION_TOO_LOW',
        category: 'video_quality',
        step: 'validating_video',
        message: 'The video resolution is too low to analyse.',
      },
    });
    check('returns 200', r.status === 200, r);
    check('job moves to failed', (await jobStatus(qualityJob.id)) === 'failed');

    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const { count } = await supabase
      .from('processing_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('resubmitted_from_job_id', qualityJob.id);
    check('no auto-resubmission row exists', (count ?? 0) === 0, count);
  }

  console.log('6. unmatched delivery is kept, not dropped');
  {
    const r = await post({ status: 'queued', externalJobId: unknownExtId });
    check('returns 200 — a retry would orphan identically', r.status === 200, r);
    check('payload still persisted for forensics', (await deliveryCount(unknownExtId)) === 1);
    await supabase.from('splitstep_webhook_deliveries').delete().eq('external_job_id', unknownExtId);
  }

  console.log('7. unparseable body is recorded rather than lost');
  {
    // Signed like any other delivery — the HMAC is over raw bytes, so it does
    // not care that those bytes are not JSON.
    const rawBody = 'not json{';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret) headers['x-splitstep-signature'] = sign(rawBody);
    const res = await fetch(endpoint, { method: 'POST', headers, body: rawBody });
    check('does not 5xx on malformed input', res.status < 500, res.status);
  }

  if (secret) {
    console.log('8. a bad signature is rejected');
    {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-splitstep-signature': 'wrong' },
        body: JSON.stringify({ status: 'queued', externalJobId: completedExtId }),
      });
      check('garbage signature returns 401', res.status === 401, res.status);
    }

    console.log('9. a signature over DIFFERENT bytes is rejected');
    {
      // The real thing HMAC protects against: a valid signature replayed onto a
      // tampered body. Sign one payload, send another.
      const signedBody = JSON.stringify({ status: 'queued', externalJobId: completedExtId });
      const tamperedBody = JSON.stringify({ status: 'job_completed', externalJobId: completedExtId });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-splitstep-signature': sign(signedBody),
        },
        body: tamperedBody,
      });
      check('signature/body mismatch returns 401', res.status === 401, res.status);
    }
  }
}

main()
  .then(async () => {
    await cleanup();
    if (failures) {
      console.error(`\n${failures} check(s) failed.\n`);
      process.exit(1);
    }
    console.log('\nAll checks passed. Our half of the loop works.\n');
  })
  .catch(async (err) => {
    await cleanup();
    console.error('\nRun aborted:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
