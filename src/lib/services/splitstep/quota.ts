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

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatHoursLong, secondsLeft } from "@/lib/data/usage-format";
import {
  explainVideoRefusal,
  pendingReviewRefusal,
  type Workspace,
} from "@/lib/workspace/types";
import {
  currentBillingMonth,
  freeHoursReturnOn,
  getMonthlyCapSeconds,
  getPilotIndividualCapSeconds,
  type AccountType,
} from "./config";

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
export function accountTypeFor(
  workspace: Pick<Workspace, "kind">,
): AccountType {
  return workspace.kind === "team" ? "program" : "individual";
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
 * The cap does not. A VERIFIED collegiate program — org_type 'college',
 * entered through the claim flow's review — draws the 75-hour program figure
 * on its own. A self-serve custom org (club / high school / academy / other)
 * has no verification behind it and `create_custom_program` will mint one for
 * any signed-in account, so handing each the program figure would let one
 * account stack 75-hour allowances against the paid vendor. Custom orgs
 * therefore start on the INDIVIDUAL figure, and move to the program figure
 * only when an admin grants `programs.pilot_eligible` (`Workspace.pilotEligible`,
 * set through `admin_set_pilot_eligible` from Admin › Teams; the audit log
 * names who did it). The same predicate — `org_type = 'college' or
 * pilot_eligible` — is spelled in SQL by `admin_reserve_video_quota`,
 * `individual_tier_usage` and `individual_pool_usage`; change one, change all.
 *
 * NOTE: this supersedes the Stage 7 design's "same 75h" line — author
 * decision on the T2 re-run. PAID-PLAN MARKER: when the pricing-tier plan
 * lands (see memory: Pro gating intentionally unenforced today), a paid
 * custom org's tier is raised HERE, from whatever entitlement that plan
 * records — this function is the single seam.
 */
export function quotaTierFor(
  workspace: Pick<Workspace, "kind" | "orgType" | "pilotEligible">,
): AccountType {
  if (workspace.kind !== "team") return "individual";
  if (workspace.orgType === "college") return "program";
  return workspace.pilotEligible === true ? "program" : "individual";
}

/**
 * The monthly cap for a workspace, in seconds. The one spelling of
 * `getMonthlyCapSeconds(quotaTierFor(…))`, because the three surfaces that
 * show a cap (the wizard meter, Settings › Usage, Team home) and the one that
 * enforces it (`reserveQuota`) must all name the same number.
 *
 * A pilot individual's PERSONAL workspace draws the pilot figure instead
 * (`Workspace.individualPilot`); every other workspace — including a team the
 * pilot belongs to — is unchanged.
 */
export function monthlyCapSecondsFor(
  workspace: Pick<
    Workspace,
    "kind" | "orgType" | "individualPilot" | "pilotEligible"
  >,
): number {
  if (workspace.kind === "personal" && workspace.individualPilot) {
    return getPilotIndividualCapSeconds();
  }
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
 * A reservation RPC that failed outright — neither granted nor refused.
 *
 * Distinct from a refusal (`{ ok: false }`), which is an answer: this is the
 * absence of one, so nothing was reserved and the caller must not assume
 * either way. `code` is the RPC error's SQLSTATE when there was one —
 * `23505` is `processing_usage`'s unique index on `job_id`, i.e. this job
 * already holds a reservation, which a caller answers as "already submitted"
 * rather than "try again".
 */
export class QuotaReserveError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "QuotaReserveError";
    this.code = code;
  }
}

/** The one construction both reserve RPCs share. */
function reserveFailure(
  error: { message: string; code?: string } | null,
): QuotaReserveError {
  return new QuotaReserveError(
    `Could not reserve processing quota: ${error?.message ?? "no row returned"}`,
    error?.code ?? null,
  );
}

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

  // A personal workspace spends its free hours and then the player's own
  // credits, in one transaction. Credits are personal: a team workspace —
  // collegiate or custom org — never touches them, and there is no shared
  // house-wide band in front of either (Cj, 2026-10-16).
  if (workspace.kind === "personal") {
    return reservePersonal({
      supabase,
      jobId,
      userId,
      workspace,
      capSeconds,
      seconds,
      now,
    });
  }

  const { data, error } = await supabase
    .rpc("reserve_processing_quota", {
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

  if (error || !data) throw reserveFailure(error);

  const row = data as {
    ok: boolean;
    used_seconds: number;
    cap_seconds: number;
  };

  if (row.ok) {
    return {
      ok: true,
      usedSeconds: row.used_seconds,
      capSeconds: row.cap_seconds,
    };
  }

  const remaining = secondsLeft(row.used_seconds, row.cap_seconds);

  return {
    ok: false,
    usedSeconds: row.used_seconds,
    capSeconds: row.cap_seconds,
    message: capRefusalMessage({
      neededSeconds: seconds,
      remainingSeconds: remaining,
      capSeconds: row.cap_seconds,
    }),
  };
}

async function reservePersonal(params: {
  supabase: SupabaseClient;
  jobId: string;
  userId: string;
  workspace: Workspace;
  capSeconds: number;
  seconds: number;
  now?: Date;
}): Promise<QuotaReservation> {
  const { supabase, jobId, userId, workspace, capSeconds, seconds, now } =
    params;

  // The personal workspace's id IS the user's id; the SQL keys both the free
  // ledger and the credits on it. A mismatch would spend one person's credits
  // on another's ledger, so refuse it outright rather than trust the caller.
  if (workspace.id !== userId) {
    throw new QuotaReserveError(
      "Could not reserve processing quota: personal workspace is not the uploader's",
    );
  }

  // Atomic: free hours first, then credits oldest-expiring first, under the
  // same account+month lock reserve_processing_quota takes.
  const { data, error } = await supabase
    .rpc("reserve_personal_quota", {
      p_job_id: jobId,
      p_user_id: userId,
      p_billing_month: currentBillingMonth(now),
      p_seconds: Math.ceil(seconds),
      p_cap_seconds: capSeconds,
    })
    .single();

  if (error || !data) throw reserveFailure(error);

  const row = data as {
    ok: boolean;
    used_seconds: number;
    cap_seconds: number;
    credit_seconds: number;
    credit_spent_seconds: number;
  };

  if (row.ok) {
    return {
      ok: true,
      usedSeconds: row.used_seconds,
      capSeconds: row.cap_seconds,
    };
  }

  return {
    ok: false,
    usedSeconds: row.used_seconds,
    capSeconds: row.cap_seconds,
    message: personalRefusalMessage({
      neededSeconds: seconds,
      remainingSeconds:
        secondsLeft(row.used_seconds, row.cap_seconds) + row.credit_seconds,
      now,
    }),
  };
}

/**
 * A personal player's refusal: what it needs, what is left (free hours plus
 * credits), and the next step — add hours, shorten the trim, or wait for the
 * 1st. In December there is no 1st to wait for (free hours end Dec 31), so
 * the wait drops out. Never says "allowance": the player owns these hours.
 */
export function personalRefusalMessage(params: {
  neededSeconds: number;
  remainingSeconds: number;
  now?: Date;
}): string {
  const { neededSeconds, remainingSeconds, now } = params;
  const back = freeHoursReturnOn(now);
  const lead =
    remainingSeconds <= 0
      ? "You're out of video hours."
      : `This video needs ${formatHoursLong(neededSeconds)}. You have ` +
        `${formatHoursLong(remainingSeconds)} left.`;
  const next = back
    ? `Add hours on Settings › Plan to send it now, shorten the trim, or ` +
      `wait for your free hours on ${back}.`
    : `Add hours on Settings › Plan to send it now, or shorten the trim.`;
  return `${lead} ${next}`;
}

/**
 * A team workspace's allowance refusal, in one place. `reserveQuota()` says it at the spend;
 * `/api/splitstep/upload-url` says it before a credential exists, from
 * `peekQuota()`'s reading — the same words for the same answer.
 */
export function capRefusalMessage(params: {
  neededSeconds: number;
  remainingSeconds: number;
  capSeconds: number;
}): string {
  const { neededSeconds, remainingSeconds, capSeconds } = params;
  return (
    `This match needs ${formatMinutes(neededSeconds)} of analysis but only ` +
    `${formatMinutes(remainingSeconds)} is left in your monthly allowance ` +
    `(${formatMinutes(capSeconds)}). It resets at the start of next month; ` +
    `a shorter trim will fit sooner.`
  );
}

/** The two columns of `processing_usage` a month's total is summed from. */
export interface UsageRow {
  reserved_seconds: number | null;
  actual_seconds: number | null;
}

/**
 * Seconds a set of unreleased ledger rows count for, the way
 * `reserve_processing_quota` sums them: the vendor's actual figure where one
 * has landed, the reservation otherwise. Pure — the wizard's meter sums its
 * own rows with it too.
 */
export function sumUsedSeconds(rows: readonly UsageRow[]): number {
  return rows.reduce(
    (total, row) => total + (row.actual_seconds ?? row.reserved_seconds ?? 0),
    0,
  );
}

export interface QuotaPeek {
  /** Free hours used this month. */
  usedSeconds: number;
  /** The workspace's own monthly free figure. */
  capSeconds: number;
  /** Free hours left this month, never negative. */
  freeRemainingSeconds: number;
  /**
   * Usable credits (unexpired, unspent). Always 0 for a team workspace:
   * credits are personal and spend only in the owner's personal workspace.
   */
  creditSeconds: number;
  /** What the next upload can spend: free hours left plus credits. */
  remainingSeconds: number;
}

/**
 * `/api/splitstep/hours-left`'s answer, for the header's Beta pill: a peek cut
 * down to what the pill draws. `workspaceId` lets the pill drop an answer for
 * a workspace it has since left.
 */
export interface HoursLeft {
  workspaceId: string;
  /** Free hours left this month. */
  remainingSeconds: number;
  /** The workspace's own monthly figure — the ring's denominator. */
  capSeconds: number;
  /** Usable credits; 0 for a team workspace. */
  creditSeconds: number;
}

/**
 * The refusal an upload that needs `neededSeconds` gets from a peek, or null
 * when it fits. The same words `reserveQuota()` would say.
 */
export function peekRefusalMessage(
  peek: QuotaPeek,
  neededSeconds: number,
  workspace: Pick<Workspace, "kind">,
): string | null {
  if (neededSeconds <= peek.remainingSeconds) {
    return null;
  }
  if (workspace.kind === "personal") {
    return personalRefusalMessage({
      neededSeconds,
      remainingSeconds: peek.remainingSeconds,
    });
  }
  return capRefusalMessage({
    neededSeconds,
    remainingSeconds: peek.remainingSeconds,
    capSeconds: peek.capSeconds,
  });
}

/** A player's usable credit balance and when the next of it expires. */
export interface CreditBalance {
  seconds: number;
  /** ISO instant the oldest usable lot expires, or null with no credits. */
  nextExpiresAt: string | null;
}

/**
 * Sum a user's usable credits: unspent and unexpired, the rows
 * `reserve_personal_quota` would draw from. Works with either client — the
 * owner can read their own rows under RLS, and the service role reads anyone's.
 */
export async function readCreditBalance(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<CreditBalance> {
  const { data, error } = await supabase
    .from("video_credits")
    .select("remaining_seconds, expires_at")
    .eq("user_id", userId)
    .gt("remaining_seconds", 0)
    .gt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true });

  if (error) {
    throw new Error(`Could not read video credits: ${error.message}`);
  }

  const rows = (data ?? []) as {
    remaining_seconds: number;
    expires_at: string;
  }[];
  return {
    seconds: rows.reduce((sum, row) => sum + row.remaining_seconds, 0),
    nextExpiresAt: rows[0]?.expires_at ?? null,
  };
}

/**
 * READ the month's ledger for a workspace. Reserves nothing.
 *
 * For `/api/splitstep/upload-url`, which wants to refuse an upload that cannot
 * fit BEFORE the browser pushes gigabytes. Not the authority — it is a plain
 * read, so two uploads racing can both pass it; `reserveQuota()` at
 * `/api/splitstep/jobs` is atomic and still decides. Keyed exactly as that
 * reservation is (`accountTypeFor`, `workspace.id`, `currentBillingMonth`) and
 * summed the way the reserve functions sum: the vendor's actual figure where
 * one has landed, the reservation otherwise, released rows excluded. A
 * personal workspace adds the player's credits on top.
 *
 * `supabase` must be the service-role client, because `processing_usage` RLS
 * is per-creator and a program's ledger is everybody's rows. Handed in, like
 * `reserveQuota()`'s, rather than imported: `useUploadMatchWizard` (a client
 * hook) imports this module for its pure helpers, and any import of the
 * service-role factory here — dynamic included — puts it in that module graph
 * (`tests/client-bundle-boundary.spec.ts`). Throws on a failed read; the
 * caller decides what a missing answer means.
 */
export async function peekQuota(
  supabase: SupabaseClient,
  workspace: Workspace,
): Promise<QuotaPeek> {
  const capSeconds = monthlyCapSecondsFor(workspace);

  const [usage, credits] = await Promise.all([
    supabase
      .from("processing_usage")
      .select("reserved_seconds, actual_seconds")
      .eq("account_id", workspace.id)
      .eq("account_type", accountTypeFor(workspace))
      .eq("billing_month", currentBillingMonth())
      .eq("released", false),
    workspace.kind === "personal"
      ? readCreditBalance(supabase, workspace.id)
      : Promise.resolve<CreditBalance>({ seconds: 0, nextExpiresAt: null }),
  ]);

  if (usage.error) {
    throw new Error(`Could not read processing usage: ${usage.error.message}`);
  }

  const usedSeconds = sumUsedSeconds((usage.data ?? []) as UsageRow[]);
  return buildPeek(usedSeconds, capSeconds, credits.seconds);
}

/** A peek from its three figures. Pure, so meters can build one too. */
export function buildPeek(
  usedSeconds: number,
  capSeconds: number,
  creditSeconds: number,
): QuotaPeek {
  const freeRemainingSeconds = secondsLeft(usedSeconds, capSeconds);
  return {
    usedSeconds,
    capSeconds,
    freeRemainingSeconds,
    creditSeconds,
    remainingSeconds: freeRemainingSeconds + creditSeconds,
  };
}

/**
 * How an upload of `seconds` splits between free hours and credits, in the
 * order `reserve_personal_quota` spends them. `fits` is false when the two
 * together fall short. Pure — the wizard footer (B2) and paywall read it.
 */
export function splitSpend(
  peek: Pick<QuotaPeek, "freeRemainingSeconds" | "creditSeconds">,
  seconds: number,
): {
  freeSeconds: number;
  creditSeconds: number;
  shortBySeconds: number;
  fits: boolean;
} {
  const freeSeconds = Math.min(peek.freeRemainingSeconds, seconds);
  const need = seconds - freeSeconds;
  const creditSeconds = Math.min(peek.creditSeconds, need);
  const shortBySeconds = need - creditSeconds;
  return {
    freeSeconds,
    creditSeconds,
    shortBySeconds,
    fits: shortBySeconds <= 0,
  };
}

/** Hand back a reservation. Safe to call twice. */
export async function releaseQuota(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_processing_quota", {
    p_job_id: jobId,
  });

  if (error) {
    // Never fatal to the caller: this runs on failure paths that have already
    // gone wrong, and an un-refunded reservation is recoverable by hand.
    console.error("[splitstep] could not release quota", {
      jobId,
      error: error.message,
    });
  }
}

/** Replace the reserved estimate with the vendor's actual billed seconds. */
export async function reconcileQuota(
  supabase: SupabaseClient,
  jobId: string,
  actualSeconds: number,
): Promise<void> {
  const { error } = await supabase.rpc("reconcile_processing_quota", {
    p_job_id: jobId,
    p_actual_seconds: Math.ceil(actualSeconds),
  });

  if (error) {
    console.error("[splitstep] could not reconcile quota", {
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
