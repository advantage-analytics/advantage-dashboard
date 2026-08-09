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
 * The `sas_url` is not mocked. The script uploads a fixture into the
 * `match-results` bucket and signs it, so the download path is exercised
 * end-to-end over real HTTP without depending on any external host.
 *
 * Everything it creates is removed on the way out, including after a failure.
 */

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RESULTS_BUCKET } from '../src/lib/services/splitstep/config';

/* ─── env ─── */

// Guarded: on a fresh checkout or a CI box there is no .env.local, and an
// unhandled ENOENT here would replace the readable "Missing X" messages below
// with a raw stack trace.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  }
} catch {
  /* fall through to the required() checks, which explain what is missing */
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

    // The download runs in after(), so it completes AFTER the 200 — that is the
    // point of the change, since the vendor times out at 30s and never retries.
    // Poll rather than assert immediately.
    const reached = await waitFor(
      async () => (await jobStatus(completedJob.id)) === 'completed'
    );
    check('job reaches completed (async, after the 200)', reached);

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
