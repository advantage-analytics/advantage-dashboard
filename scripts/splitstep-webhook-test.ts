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
 * Defaults to NEXT_PUBLIC_APP_URL. Sends the shared secret when
 * SPLITSTEP_WEBHOOK_SECRET is set, and exercises the unsigned path when it is
 * not — both are supported modes, see .env.example.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * The `sas_url` is not mocked. The script uploads a fixture into the
 * `match-results` bucket and signs it, so the download path is exercised
 * end-to-end over real HTTP without depending on any external host.
 *
 * Everything it creates is removed on the way out, including after a failure.
 */

import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* ─── env ─── */

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
}

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

const baseUrl = (flag('--url') ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('No target. Pass --url https://your-deployment or set NEXT_PUBLIC_APP_URL.');
  process.exit(1);
}

const endpoint = `${baseUrl}/api/webhooks/splitstep`;
const secret = process.env.SPLITSTEP_WEBHOOK_SECRET ?? null;
const supabase: SupabaseClient = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

const RESULTS_BUCKET = 'match-results';
const FIXTURE_KEY = `__webhook_test__/${Date.now()}-strokes.json`;
/* Shaped like a stroke array so the bytes that land are the bytes we expect. */
const FIXTURE = JSON.stringify([
  { pred_rally_id: 1, pred_rally_stroke_number: 1, stroke_type: 'serve', in: true },
]);

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

async function post(body: unknown): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret) headers['x-webhook-secret'] = secret;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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

const createdJobIds: string[] = [];

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
  createdJobIds.push(job.id);
  return job;
}

async function cleanup(): Promise<void> {
  if (createdJobIds.length) {
    await supabase.from('processing_jobs').delete().in('id', createdJobIds);
  }
  await supabase.storage.from(RESULTS_BUCKET).remove([FIXTURE_KEY]);
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

  console.log('2. job_completed — results fetched and stored');
  {
    const r = await post({
      status: 'job_completed',
      externalJobId: completedExtId,
      sas_url: sasUrl,
    });
    check('returns 200', r.status === 200, r);
    check('job reaches completed', (await jobStatus(completedJob.id)) === 'completed');

    const { data } = await supabase
      .from('processing_jobs')
      .select('results_object_key')
      .eq('id', completedJob.id)
      .maybeSingle();
    const key = (data as { results_object_key: string | null } | null)?.results_object_key;
    check('results_object_key is set', Boolean(key), key);

    if (key) {
      const dl = await supabase.storage.from(RESULTS_BUCKET).download(key);
      const text = dl.data ? await dl.data.text() : '';
      check('stored bytes match the fixture byte-for-byte', text === FIXTURE, {
        got: text.slice(0, 120),
      });
      await supabase.storage.from(RESULTS_BUCKET).remove([key]);
    }
  }

  console.log('3. duplicate delivery is a no-op');
  {
    const before = await deliveryCount(completedExtId);
    const r = await post({
      status: 'job_completed',
      externalJobId: completedExtId,
      sas_url: sasUrl,
    });
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

  console.log('6. unmatched delivery is kept, not dropped');
  {
    const r = await post({ status: 'queued', externalJobId: unknownExtId });
    check('returns 200 — a retry would orphan identically', r.status === 200, r);
    check('payload still persisted for forensics', (await deliveryCount(unknownExtId)) === 1);
    await supabase.from('splitstep_webhook_deliveries').delete().eq('external_job_id', unknownExtId);
  }

  console.log('7. unparseable body is recorded rather than lost');
  {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret) headers['x-webhook-secret'] = secret;
    const res = await fetch(endpoint, { method: 'POST', headers, body: 'not json{' });
    check('does not 5xx on malformed input', res.status < 500, res.status);
  }

  if (secret) {
    console.log('8. a wrong secret is rejected');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-secret': 'wrong' },
      body: JSON.stringify({ status: 'queued', externalJobId: completedExtId }),
    });
    check('returns 401', res.status === 401, res.status);
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
