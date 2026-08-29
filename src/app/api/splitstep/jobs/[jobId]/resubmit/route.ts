/**
 * Manual resubmission — the "Retry analysis" button on a failed job.
 *
 * Thin on purpose: ownership and billing are resolved here because they need
 * the session; everything else — terminal-state check, attempt ceiling,
 * duplicate guard, blob existence, quota, the vendor POST — lives in
 * resubmitJob(), shared with the webhook's automatic path so the two cannot
 * drift on what a legal retry is.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  resubmitJob,
  type ResubmitRefusalReason,
} from '@/lib/services/splitstep/resubmit-job';
import { getWorkspaceContext } from '@/lib/workspace/active-workspace-server';
import {
  billingWorkspaceFor,
  NO_BILLING_WORKSPACE_REFUSAL,
} from '@/lib/workspace/types';

export const runtime = 'nodejs';

/** Vendor POST plus lookups — same bound as the submit route, same reason. */
export const maxDuration = 60;

const LOG = '[splitstep-resubmit-route]';

/**
 * Each refusal maps to the status its meaning already has elsewhere in this
 * API: 429 is an exhausted allowance, 409 a state conflict, 502 the vendor.
 */
const REFUSAL_STATUS: Record<ResubmitRefusalReason, number> = {
  not_found: 404,
  not_failed: 409,
  in_flight_duplicate: 409,
  attempt_ceiling: 409,
  already_auto_resubmitted: 409,
  video_unavailable: 409,
  quota: 429,
  not_configured: 503,
  invalid_metadata: 422,
  submit_failed: 502,
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Ownership: the job's creator, checked before anything else runs. Same 404
  // for "does not exist" and "not yours" — never confirm another user's job.
  const { data: jobRow, error: jobError } = await admin
    .from('processing_jobs')
    .select('id, created_by, match_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError) {
    console.error(`${LOG} job lookup failed`, { jobId, error: jobError.message });
    return NextResponse.json({ error: 'Could not load the job' }, { status: 500 });
  }
  if (!jobRow || (jobRow as { created_by: string }).created_by !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Billing: the MATCH's workspace, exactly as the submit route charges it —
  // a coach can switch workspaces between the failure and the retry, and the
  // budget that pays for a match is the one the match belongs to. The two
  // reads are independent (one hits matches, one resolves the session), so
  // they share a round trip.
  const [{ data: matchRow }, workspaceContext] = await Promise.all([
    admin
      .from('matches')
      .select('program_id')
      .eq('id', (jobRow as { match_id: string }).match_id)
      .maybeSingle(),
    getWorkspaceContext(),
  ]);
  const billingWorkspace = billingWorkspaceFor(
    workspaceContext?.available ?? [],
    (matchRow as { program_id: string | null } | null)?.program_id ?? null
  );

  if (!billingWorkspace) {
    return NextResponse.json(
      { error: NO_BILLING_WORKSPACE_REFUSAL },
      { status: 403 }
    );
  }

  const result = await resubmitJob({
    supabase: admin,
    jobId,
    auto: false,
    workspace: billingWorkspace,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, reason: result.reason },
      { status: REFUSAL_STATUS[result.reason] }
    );
  }

  return NextResponse.json({
    jobId: result.jobId,
    externalJobId: result.externalJobId,
    status: 'queued',
  });
}
