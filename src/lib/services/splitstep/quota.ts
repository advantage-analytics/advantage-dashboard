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
 * The membership model this section once said was missing exists now
 * (`program_members`), and `accountTypeFor()` reads it via the workspace. Two
 * different questions hang off it, split across two functions below: which
 * LEDGER a submission files under (`accountTypeFor` — every team workspace is
 * `'program'`, keyed by program id) and which FIGURE caps it (`quotaTierFor` —
 * only a verified collegiate program draws the 75 hours; a self-serve custom
 * org draws the individual figure). Collapsing them into one answer is exactly
 * how a custom org would either vanish from Settings › Usage or mint a
 * 75-hour allowance, depending on which half won.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  explainVideoRefusal,
  pendingReviewRefusal,
  type Workspace,
} from '@/lib/workspace/types';
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

/**
 * Which monthly FIGURE that allowance is capped at — a different question from
 * `accountTypeFor()`, and deliberately a separate function.
 *
 * `accountTypeFor()` names the ledger: every team workspace files under
 * `account_type = 'program'` keyed by program id, because that is the row
 * shape `program_usage_total()`, Settings › Usage, and the wizard's
 * remaining-quota read all filter on. That stays true for a custom org.
 *
 * The cap does not. Only a VERIFIED collegiate program — org_type 'college',
 * entered through the claim flow's review — draws the 75-hour program figure.
 * A self-serve custom org (club / high school / academy / other) has no
 * verification behind it and `create_custom_program` will mint one for any
 * signed-in account, so handing each the program figure would let one account
 * stack 75-hour allowances against the paid vendor. Custom orgs therefore
 * start on the INDIVIDUAL figure.
 *
 * NOTE: this supersedes the Stage 7 design's "same 75h" line — author
 * decision on the T2 re-run. PAID-PLAN MARKER: when the pricing-tier plan
 * lands (see memory: Pro gating intentionally unenforced today), a paid
 * custom org's tier is raised HERE, from whatever entitlement that plan
 * records — this function is the single seam.
 */
export function quotaTierFor(
  workspace: Pick<Workspace, 'kind' | 'orgType'>
): AccountType {
  if (workspace.kind !== 'team') return 'individual';
  return workspace.orgType === 'college' ? 'program' : 'individual';
}

/**
 * The monthly cap for a workspace, in seconds. The one spelling of
 * `getMonthlyCapSeconds(quotaTierFor(…))`, because the three surfaces that
 * show a cap (the wizard meter, Settings › Usage, Team home) and the one that
 * enforces it (`reserveQuota`) must all name the same number.
 */
export function monthlyCapSecondsFor(
  workspace: Pick<Workspace, 'kind' | 'orgType'>
): number {
  return getMonthlyCapSeconds(quotaTierFor(workspace));
}

export type QuotaReservation =
  | { ok: true; usedSeconds: number; capSeconds: number }
  | {
      ok: false;
      usedSeconds: number;
      capSeconds: number;
      message: string;
      /**
       * Refused because of who is asking, not because of what is left.
       *
       * Set only by the upload-permission check below. A caller that turns a
       * refusal into an HTTP status wants 403 for these and 429 for a real
       * allowance refusal — the two are not the same answer and retrying next
       * month does not help one of them.
       */
      permission?: boolean;
    };

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
      // The words moved to `workspace/types.ts` because
      // `/api/splitstep/upload-url` says them too, before the browser is handed
      // a write credential; a second copy here is a second copy to edit. The
      // check did not move: this is the choke point, and it answers first so a
      // program under review is refused on its claim state, never on a flag.
      message: pendingReviewRefusal(workspace),
    };
  }

  // The other half of the same argument, and the reason it is HERE.
  //
  // The two upload flags — `programs.players_can_upload` and this member's
  // `program_members.upload_enabled` — were enforced in exactly one place: the
  // route guard on `/dashboard/team/upload`. But `/dashboard/matches/new`
  // renders the identical wizard with no guard at all, `useUploadMatchWizard`
  // files under the active workspace whatever the viewer's role, and the "New
  // match" button plus the global ⌘U reach that route from five surfaces. So a
  // coach who switched a player's "Can send video" off got a switch that
  // persisted, looked like it had worked, and stopped nothing.
  //
  // A guard on the second page would have closed that door and left the next
  // one open. This line is the door: nothing spends a minute of anyone's
  // allowance without passing through here, so it holds whichever page opened
  // the wizard and whichever caller is added later.
  //
  // Personal uploads are untouched — `explainVideoRefusal()` answers on `kind`
  // before it reads a flag, because `canUploadForProgram()` says false for a
  // personal workspace and a bare call here would refuse every individual in
  // the product. Staff are untouched for the same structural reason one level
  // in. See both notes in `workspace/types.ts`.
  const refusal = explainVideoRefusal(workspace);
  if (refusal) {
    return {
      ok: false,
      usedSeconds: 0,
      capSeconds: 0,
      message: refusal,
      permission: true,
    };
  }

  const accountType = accountTypeFor(workspace);
  // The cap is tiered by verification, not by ledger: a custom org files under
  // the program ledger but draws the individual figure. See quotaTierFor().
  const capSeconds = monthlyCapSecondsFor(workspace);

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
