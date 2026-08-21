/**
 * Pilot processing caps.
 *
 * The pilot allows 75 processing-hours/month per collegiate program and 2 per
 * individual. Those numbers were written down long before anything enforced
 * them; this is the enforcement.
 *
 * Every call goes through a database function rather than a read-then-write
 * here, because the check and the insert must be atomic — two submissions
 * racing would both see the same "used" total, both pass, and the cap would be
 * exceeded by exactly the amount that matters. See
 * 20260807070337_splitstep_processing_quota_functions.sql.
 *
 * ── On `program` ─────────────────────────────────────────────────────────────
 * Only `individual` is reachable today. `public.users` has `plan` and `role`
 * but nothing tying a user to a program, so there is no membership to read and
 * inventing one would silently give every user a 75-hour allowance. The tier
 * exists in the ledger and in getMonthlyCapSeconds(); it needs a membership
 * model before accountTypeFor() can ever return it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Workspace } from '@/lib/workspace/types';
import {
  currentBillingMonth,
  getMonthlyCapSeconds,
  type AccountType,
} from './config';

/**
 * Which allowance a submission draws against.
 *
 * Takes the workspace, because the workspace already knows. It used to take
 * nothing and return `'individual'` unconditionally, which was correct only
 * while no team workspace could exist — the moment one could, a coach in a
 * program would have billed their personal 2-hour cap instead of the program's
 * 75, silently and with no error anywhere.
 *
 * `Workspace.id` IS `processing_usage.account_id`: a personal workspace is
 * keyed by user id, which is what that ledger has always used, and a team one
 * by program id.
 */
export function accountTypeFor(workspace: Pick<Workspace, 'kind'>): AccountType {
  return workspace.kind === 'team' ? 'program' : 'individual';
}

export type QuotaReservation =
  | { ok: true; usedSeconds: number; capSeconds: number }
  | { ok: false; usedSeconds: number; capSeconds: number; message: string };

/**
 * Reserve `seconds` against a user's monthly allowance.
 *
 * Reserves the trimmed length rather than waiting for the vendor's figure: an
 * allowance that is only spent after the fact cannot refuse anything. The
 * estimate is replaced by `reconcileQuota` when the job completes, and handed
 * back by `releaseQuota` if it fails.
 */
export async function reserveQuota(params: {
  supabase: SupabaseClient;
  jobId: string;
  userId: string;
  /** The workspace being billed. Decides both the ledger and the cap. */
  workspace: Workspace;
  seconds: number;
  now?: Date;
}): Promise<QuotaReservation> {
  const { supabase, jobId, userId, workspace, seconds, now } = params;

  // The one choke point every submission passes through, which is why the
  // check belongs here rather than in the wizard. A program still under review
  // can invite staff and build a roster but must not spend the vendor budget —
  // that spend cannot be taken back, and /claim/review promises it is paused.
  if (!workspace.canSubmitVideo) {
    return {
      ok: false,
      usedSeconds: 0,
      capSeconds: 0,
      message:
        `${workspace.name} is still being confirmed. You can invite staff and ` +
        `build your roster now; sending video opens as soon as that's done.`,
    };
  }

  const accountType = accountTypeFor(workspace);
  const capSeconds = getMonthlyCapSeconds(accountType);

  const { data, error } = await supabase
    .rpc('reserve_processing_quota', {
      p_job_id: jobId,
      // The workspace's own id: the user for a personal workspace, the program
      // for a team one. Two workspaces, one ledger.
      p_account_id: workspace.id,
      p_account_type: accountType,
      p_created_by: userId,
      p_billing_month: currentBillingMonth(now),
      p_seconds: Math.ceil(seconds),
      p_cap_seconds: capSeconds,
    })
    .single();

  if (error || !data) {
    throw new Error(
      `Could not reserve processing quota: ${error?.message ?? 'no row returned'}`
    );
  }

  const row = data as { ok: boolean; used_seconds: number; cap_seconds: number };

  if (row.ok) {
    return { ok: true, usedSeconds: row.used_seconds, capSeconds: row.cap_seconds };
  }

  const remaining = Math.max(0, row.cap_seconds - row.used_seconds);

  return {
    ok: false,
    usedSeconds: row.used_seconds,
    capSeconds: row.cap_seconds,
    message:
      `This match needs ${formatMinutes(seconds)} of analysis but only ` +
      `${formatMinutes(remaining)} is left in your monthly allowance ` +
      `(${formatMinutes(row.cap_seconds)}). It resets at the start of next month; ` +
      `a shorter trim will fit sooner.`,
  };
}

/** Hand back a reservation. Safe to call twice. */
export async function releaseQuota(
  supabase: SupabaseClient,
  jobId: string
): Promise<void> {
  const { error } = await supabase.rpc('release_processing_quota', {
    p_job_id: jobId,
  });

  if (error) {
    // Never fatal to the caller: this runs on failure paths that have already
    // gone wrong, and an un-refunded reservation is recoverable by hand.
    console.error('[splitstep] could not release quota', {
      jobId,
      error: error.message,
    });
  }
}

/** Replace the reserved estimate with the vendor's actual billed seconds. */
export async function reconcileQuota(
  supabase: SupabaseClient,
  jobId: string,
  actualSeconds: number
): Promise<void> {
  const { error } = await supabase.rpc('reconcile_processing_quota', {
    p_job_id: jobId,
    p_actual_seconds: Math.ceil(actualSeconds),
  });

  if (error) {
    console.error('[splitstep] could not reconcile quota', {
      jobId,
      error: error.message,
    });
  }
}

function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
