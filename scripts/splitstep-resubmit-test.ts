/**
 * Proves resubmission and status reconciliation, with the vendor mocked.
 *
 * The webhook suite (splitstep-webhook-test.ts) runs against a DEPLOYED url
 * and therefore can never assert a SUCCESSFUL auto-resubmission — on a real
 * deployment that would POST an actual job at the vendor. So the chain-level
 * guarantees live here instead: this script calls resubmitJob() and
 * reconcileVendorJobs() directly, pointing SPLITSTEP_API_URL at a local HTTP
 * server it controls, against the real database and (when configured) a real
 * throwaway blob in the videos container.
 *
 * Run from repo root:
 *   npx tsx scripts/splitstep-resubmit-test.ts
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * The Azure credentials (AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_KEY) unlock the
 * success-path cases — without them the blob-existence check cannot pass and
 * those cases are skipped, loudly.
 *
 * Quota reservations are made against a THROWAWAY account id (a random uuid —
 * processing_usage.account_id carries no FK), so no real user's or program's
 * monthly allowance is touched. Everything created is removed on the way out.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* ─── env, BEFORE the service imports read it ─── */

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  }
} catch {
  /* fall through to the required() checks */
}

// The deployment-config preflight refuses a localhost site url; the webhook
// url only ever lands in the mock's request body, so a placeholder is honest.
if (
  !process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL.includes('localhost')
) {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://resubmit-test.invalid';
}
// `||`, not `??` — .env.local can define the key as an EMPTY string, which is
// nullish to nobody and "missing" to the deployment-config preflight.
process.env.SPLITSTEP_API_KEY = process.env.SPLITSTEP_API_KEY || 'test-key';
// SPLITSTEP_API_URL is set below, once the mock server has a port.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Add it to .env.local.`);
    process.exit(1);
  }
  return v;
}

const supabase: SupabaseClient = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

/* ─── assertions ─── */

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}`, detail !== undefined ? detail : '');
  }
}

/* ─── mock vendor ─── */

/** Per-external-job-id GET responses the tests configure. */
const statusResponses = new Map<string, { status: number; body: unknown }>();
let submissions = 0;

const server = createServer((req, res) => {
  const url = req.url ?? '';
  if (req.method === 'POST') {
    submissions++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ job_id: `mock-job-${submissions}` }));
    return;
  }
  if (req.method === 'GET') {
    const id = decodeURIComponent(url.split('/').pop() ?? '');
    const configured = statusResponses.get(id);
    if (configured) {
      res.writeHead(configured.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(configured.body));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'JOB_NOT_FOUND' } }));
    return;
  }
  res.writeHead(405);
  res.end();
});

/* ─── fixtures ─── */

const throwawayAccount = randomUUID();
const createdJobIds: string[] = [];
const TEST_BLOB = `__resubmit_test__/${Date.now()}.mp4`;

interface TestMatch {
  id: string;
  created_by: string;
}

/** A match with no live job, so the in-flight-duplicate guard sees only ours. */
async function findQuietMatch(): Promise<TestMatch> {
  const { data } = await supabase
    .from('matches')
    .select('id, created_by')
    .not('created_by', 'is', null)
    .limit(20);
  for (const row of (data ?? []) as TestMatch[]) {
    const { count } = await supabase
      .from('processing_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', row.id)
      .not('status', 'in', '(failed,completed,derivation_failed)');
    if ((count ?? 0) === 0) return row;
  }
  throw new Error('No match without a live processing job to attach tests to.');
}

async function makeJob(
  match: TestMatch,
  fields: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .insert({
      match_id: match.id,
      created_by: match.created_by,
      provider: 'splitstep',
      ...fields,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Could not create test job: ${error.message}`);
  const id = (data as { id: string }).id;
  createdJobIds.push(id);
  return id;
}

async function jobRow(id: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function childrenOf(id: string): Promise<Record<string, unknown>[]> {
  const { data } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('resubmitted_from_job_id', id);
  const rows = (data ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const rowId = row.id as string;
    if (!createdJobIds.includes(rowId)) createdJobIds.push(rowId);
  }
  return rows;
}

async function cleanup(): Promise<void> {
  // Children may have been created after the last childrenOf() call; sweep
  // one more generation before deleting.
  for (const id of [...createdJobIds]) await childrenOf(id);
  if (createdJobIds.length) {
    // usage rows cascade with the jobs.
    await supabase.from('processing_jobs').delete().in('id', createdJobIds);
  }
  await supabase
    .from('processing_usage')
    .delete()
    .eq('account_id', throwawayAccount);

  try {
    const { resolveAzureStorageConfig, deleteVideoBlob } = await import(
      '../src/lib/services/splitstep/video-url'
    );
    if (resolveAzureStorageConfig().ok) {
      await deleteVideoBlob({ blobName: TEST_BLOB });
    }
  } catch {
    console.error(`Could not remove ${TEST_BLOB} — delete it by hand.`);
  }

  server.close();
}

/* ─── the run ─── */

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Mock server did not bind a port.');
  }
  process.env.SPLITSTEP_API_URL = `http://127.0.0.1:${address.port}/jobs`;

  // Imported AFTER the env is final — these read process.env at call time,
  // but late importing also keeps the Azure config resolver from caching a
  // half-set world.
  const { resubmitJob } = await import('../src/lib/services/splitstep/resubmit-job');
  const { reconcileVendorJobs } = await import('../src/lib/services/splitstep/reconcile');
  const { resolveAzureStorageConfig, videoContainerClient } = await import(
    '../src/lib/services/splitstep/video-url'
  );
  const { currentBillingMonth } = await import('../src/lib/services/splitstep/config');
  type Workspace = import('../src/lib/workspace/types').Workspace;

  const azure = resolveAzureStorageConfig().ok;
  const match = await findQuietMatch();

  const workspace: Workspace = {
    id: throwawayAccount,
    kind: 'personal',
    name: 'Resubmit test',
    team: null,
    role: 'owner',
    mark: 'T',
    canSubmitVideo: true,
    playersCanUpload: false,
    memberUploadEnabled: true,
  };

  const failedFields = {
    status: 'failed',
    start_time_seconds: 0,
    end_time_seconds: 300,
    initial_top_player_is_player1: true,
    ad_scoring: true,
    fixed_camera: true,
    error_code: 'INTERNAL_ERROR',
    error_category: 'internal',
    error_step: 'downloading_video',
  };

  console.log('1. a non-failed job is refused');
  {
    const liveId = await makeJob(match, { status: 'completed' });
    const r = await resubmitJob({ supabase, jobId: liveId, auto: true });
    check(
      "refused with reason 'not_failed'",
      !r.ok && r.reason === 'not_failed',
      r
    );
  }

  console.log('2. a failed job whose blob is gone is unrecoverable');
  {
    const goneId = await makeJob(match, {
      ...failedFields,
      video_object_key: `__resubmit_test__/definitely-missing-${Date.now()}.mp4`,
    });
    if (azure) {
      const r = await resubmitJob({ supabase, jobId: goneId, auto: true });
      check(
        "refused with reason 'video_unavailable'",
        !r.ok && r.reason === 'video_unavailable',
        r
      );
      check('no child row was created', (await childrenOf(goneId)).length === 0);
    } else {
      console.log('  SKIP  needs Azure credentials in .env.local');
    }
  }

  if (!azure) {
    console.log(
      '3–5. SKIP — the success-path cases need AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_KEY'
    );
  } else {
    await videoContainerClient()
      .getBlockBlobClient(TEST_BLOB)
      .upload('bytes', 5);

    console.log('3. VIDEO_UNREACHABLE-class failure auto-resubmits exactly once');
    let parentId = '';
    let childId = '';
    {
      parentId = await makeJob(match, {
        ...failedFields,
        video_object_key: TEST_BLOB,
      });
      // The parent's reservation names the throwaway account; the auto path
      // must bill the same ledger.
      await supabase.from('processing_usage').insert({
        account_id: throwawayAccount,
        account_type: 'individual',
        billing_month: currentBillingMonth(),
        job_id: parentId,
        created_by: match.created_by,
        reserved_seconds: 300,
        released: true,
      });

      const r = await resubmitJob({ supabase, jobId: parentId, auto: true });
      check('resubmission succeeded', r.ok, r);
      const children = await childrenOf(parentId);
      check('exactly one child row exists', children.length === 1, children.length);
      const child = children[0];
      childId = (child?.id as string) ?? '';
      check('child carries the parent link', child?.resubmitted_from_job_id === parentId);
      check('child is marked auto_resubmitted', child?.auto_resubmitted === true);
      check('child reached queued with a vendor id',
        child?.status === 'queued' && Boolean(child?.external_job_id),
        { status: child?.status, externalJobId: child?.external_job_id });

      const { data: usage } = await supabase
        .from('processing_usage')
        .select('released, account_id')
        .eq('job_id', childId)
        .maybeSingle();
      const u = usage as { released: boolean; account_id: string } | null;
      check('a fresh, unreleased reservation exists for the child',
        u !== null && u.released === false, u);
      check('billed to the same account as the parent',
        u?.account_id === throwawayAccount, u?.account_id);
    }

    console.log('4. a second identical failure gets NO second automatic attempt');
    {
      await supabase
        .from('processing_jobs')
        .update({ status: 'failed', error_step: 'downloading_video' })
        .eq('id', childId);

      const r = await resubmitJob({ supabase, jobId: childId, auto: true });
      check(
        "refused with reason 'already_auto_resubmitted'",
        !r.ok && r.reason === 'already_auto_resubmitted',
        r
      );
      check('still exactly one child of the parent', (await childrenOf(parentId)).length === 1);
      check('the surfaced state is the failed child',
        (await jobRow(childId))?.status === 'failed');
    }

    console.log('5. a manual retry works where auto stopped — then hits the ceiling');
    {
      const r = await resubmitJob({
        supabase,
        jobId: childId,
        auto: false,
        workspace,
      });
      check('manual resubmission of the auto-retried failure succeeded', r.ok, r);
      const grandchildId = r.ok ? r.jobId : '';

      await supabase
        .from('processing_jobs')
        .update({ status: 'failed' })
        .eq('id', grandchildId);

      const r2 = await resubmitJob({
        supabase,
        jobId: grandchildId,
        auto: false,
        workspace,
      });
      check(
        "the fourth attempt is refused with 'attempt_ceiling'",
        !r2.ok && r2.reason === 'attempt_ceiling',
        r2
      );
    }
  }

  console.log('6. reconciliation — JOB_STALE fails the job, no auto-retry');
  const future = new Date(Date.now() + 40 * 60 * 1000);
  {
    const staleExt = `mock-stale-${Date.now()}`;
    const staleId = await makeJob(match, {
      status: 'processing',
      external_job_id: staleExt,
    });
    statusResponses.set(staleExt, {
      status: 200,
      body: {
        job_id: staleExt,
        status: 'JOB_STALE',
        error: { code: 'JOB_STALE', category: 'internal' },
      },
    });

    // `now` is pushed 40 minutes out because updated_at is trigger-maintained
    // and cannot be backdated — the window logic is what is under test, not
    // the clock.
    await reconcileVendorJobs({ supabase, matchIds: [match.id], now: future });

    const row = await jobRow(staleId);
    check('job moved to failed', row?.status === 'failed', row?.status);
    check('error_code is JOB_STALE', row?.error_code === 'JOB_STALE', row?.error_code);
    check('error_category is internal', row?.error_category === 'internal');
    check('last_polled_at is stamped', Boolean(row?.last_polled_at));
    check('no auto-resubmission for a stale job', (await childrenOf(staleId)).length === 0);
  }

  console.log('7. reconciliation — a lost completion surfaces as unrecoverable');
  {
    const lostExt = `mock-lost-${Date.now()}`;
    const lostId = await makeJob(match, {
      status: 'processing',
      external_job_id: lostExt,
    });
    statusResponses.set(lostExt, {
      status: 200,
      body: { job_id: lostExt, status: 'completed' },
    });

    await reconcileVendorJobs({ supabase, matchIds: [match.id], now: future });

    const row = await jobRow(lostId);
    check('job moved to failed', row?.status === 'failed', row?.status);
    check(
      'marked RESULTS_DELIVERY_LOST, not pretended recoverable',
      row?.error_code === 'RESULTS_DELIVERY_LOST',
      row?.error_code
    );
  }

  console.log('8. a failed poll mutates nothing but the stamp');
  {
    const downExt = `mock-down-${Date.now()}`;
    const downId = await makeJob(match, {
      status: 'processing',
      external_job_id: downExt,
    });
    statusResponses.set(downExt, {
      status: 503,
      body: { error: { code: 'STATUS_UNAVAILABLE' } },
    });

    await reconcileVendorJobs({ supabase, matchIds: [match.id], now: future });

    const row = await jobRow(downId);
    check('status untouched', row?.status === 'processing', row?.status);
    check('error columns untouched', row?.error_code == null, row?.error_code);
    check('last_polled_at stamped anyway', Boolean(row?.last_polled_at));
  }
}

main()
  .then(async () => {
    await cleanup();
    if (failures) {
      console.error(`\n${failures} check(s) failed.\n`);
      process.exit(1);
    }
    console.log('\nAll checks passed.\n');
    process.exit(0);
  })
  .catch(async (err) => {
    await cleanup();
    console.error('\nRun aborted:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
