import { createClient } from "@/lib/supabase/server";
import { plansHaveBegun } from "@/lib/billing/plans";
import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";
import { isMissingFunction } from "@/lib/supabase/missing-function";
import {
  allowanceFor,
  allowanceResetsOn,
  type AllowanceWorkspace,
  type VideoAllowance,
} from "@/lib/services/splitstep/allowance";
import {
  NO_CREDITS,
  readCreditBalance,
  readProgramUsedSeconds,
  scopeToAllowance,
  windowArgs,
} from "@/lib/services/splitstep/quota";
import { formatResetDate } from "@/lib/data/usage-format";
import type { Workspace } from "@/lib/workspace/types";

/**
 * What Settings › Usage reads.
 *
 * "Used" is defined in exactly one place — the `reserve_processing_quota`
 * function — and both readers here mirror it: a released row is a refund and
 * does not count, and once a job finishes `actual_seconds` is the truth. A page
 * that showed a different total from the one that refuses a submission would be
 * worse than no page, because the person would believe the page.
 *
 * WHICH rows is `allowanceFor()`'s answer, the same one the reservation uses:
 * the calendar month until January 1, 2027, the allowance's own window after
 * (a subscription's month, a team's season). The month stepper still asks for
 * a `billingMonth`; the month `now` is in reads the current allowance, and
 * any other month reads that calendar month's ledger as history.
 */

/** What both usage shapes say about the period their figures cover. */
interface UsagePeriod {
  /**
   * The day the figures turn over, as `"Feb 1"` — `allowanceResetsOn()` for
   * the current allowance, the first of the next month for a past month.
   * Null when nothing comes back (no allowance, or no cap).
   */
  resetsOn?: string | null;
  /** ISO instant the period ends: the window's end, or the month's. */
  windowEnd?: string;
}

/**
 * The ledger scope and period for one read: the current allowance when
 * `billingMonth` is the month `now` is in, that calendar month otherwise.
 */
function periodFor(
  allowance: VideoAllowance,
  billingMonth: string,
): {
  scope: Pick<
    VideoAllowance,
    "windowed" | "billingMonth" | "windowStart" | "windowEnd"
  >;
  period: Required<UsagePeriod>;
} {
  if (billingMonth === allowance.billingMonth) {
    return {
      scope: allowance,
      period: {
        resetsOn: allowanceResetsOn(allowance),
        windowEnd: allowance.windowEnd.toISOString(),
      },
    };
  }
  const start = new Date(`${billingMonth}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    scope: {
      windowed: false,
      billingMonth,
      windowStart: start,
      windowEnd: end,
    },
    period: {
      resetsOn: formatResetDate(billingMonth),
      windowEnd: end.toISOString(),
    },
  };
}

export interface PersonalUsage extends UsagePeriod {
  usedSeconds: number;
  capSeconds: number;
  /** `YYYY-MM-01`, the `processing_usage.billing_month` key. */
  billingMonth: string;
  /**
   * Usable credits right now (unspent, unexpired) — a balance, not a month's
   * figure, so it is the same whichever month is being looked at.
   */
  creditSeconds: number;
  /** The granted part of `creditSeconds` — see `extraHoursWord()`. */
  grantedSeconds: number;
  /** When the oldest usable credits expire, or null with none. */
  nextCreditExpiresAt: string | null;
}

export interface ProgramUsageLine {
  userId: string;
  name: string;
  usedSeconds: number;
  matchCount: number;
}

export interface ProgramUsage extends UsagePeriod {
  usedSeconds: number;
  capSeconds: number;
  billingMonth: string;
  /**
   * Per-person breakdown. Staff get every line; a player gets only their own —
   * the database decides that, not this file.
   */
  lines: ProgramUsageLine[];
}

/**
 * The viewer's own allowance, for the month they are looking at.
 *
 * Takes the personal workspace rather than resolving it: every caller already
 * holds the workspace context, and asking GoTrue again only serialized a round
 * trip in front of a query that was ready to run. The workspace, not just the
 * id, because the cap and its window hang off the workspace's own fields —
 * `allowanceFor()` answers that, the same as the spend.
 */
export async function getPersonalUsage(
  personal: AllowanceWorkspace & Pick<Workspace, "id">,
  billingMonth: string,
  now: Date = new Date(),
): Promise<PersonalUsage> {
  const supabase = await createClient();
  const userId = personal.id;
  const allowance = allowanceFor(personal, now);
  const capSeconds = allowance.capSeconds;
  const { scope, period } = periodFor(allowance, billingMonth);

  // RLS already restricts this to `created_by = auth.uid()`; the account filter
  // is what separates a personal upload from one the same person made inside a
  // program, which bills the program's ledger instead.
  const [{ data, error }, credits] = await Promise.all([
    scopeToAllowance(
      supabase
        .from("processing_usage")
        .select("reserved_seconds, actual_seconds")
        .eq("account_id", userId)
        .eq("account_type", "individual")
        .eq("released", false),
      scope,
    ),
    // The owner reads their own credits under RLS. A failed read shows none
    // rather than failing the page; the reservation is still the authority.
    readCreditBalance(supabase, userId, now).catch((creditError: unknown) => {
      console.error("[usage] could not read video credits", {
        error:
          creditError instanceof Error
            ? creditError.message
            : String(creditError),
      });
      return NO_CREDITS;
    }),
  ]);
  const creditFields = {
    creditSeconds: credits.seconds,
    grantedSeconds: credits.grantedSeconds,
    nextCreditExpiresAt: credits.nextExpiresAt,
    ...period,
  };

  if (error) {
    console.error("[usage] could not read personal usage", {
      error: error.message,
    });
    return { usedSeconds: 0, capSeconds, billingMonth, ...creditFields };
  }

  const usedSeconds = (data ?? []).reduce(
    (total, row) => total + (row.actual_seconds ?? row.reserved_seconds ?? 0),
    0,
  );

  return { usedSeconds, capSeconds, billingMonth, ...creditFields };
}

/**
 * A program's zeroed ledger — what a caller outside a program should see.
 * The beta's program figure until January 1, 2027; after it, no program has
 * hours without a plan or a pilot, so the cap is zero too.
 */
export function emptyProgramUsage(
  billingMonth: string,
  now: Date = new Date(),
): ProgramUsage {
  return {
    usedSeconds: 0,
    capSeconds: plansHaveBegun(now) ? 0 : getMonthlyCapSeconds("program"),
    billingMonth,
    lines: [],
  };
}

/**
 * A program's shared allowance for one month.
 *
 * Both reads go through SECURITY DEFINER functions because
 * `processing_usage` is scoped to `created_by = auth.uid()` — a coach has no
 * policy that would let them see the ledger they are responsible for. The
 * functions carry the membership check, so a hand-typed program id returns
 * zero rather than someone else's roster.
 */
export async function getProgramUsage(
  programId: string,
  billingMonth: string,
  /**
   * The program's workspace, or the fields of it the allowance hangs off
   * (`org_type`, the pilot's switch and dates, the season plan). Decides the
   * cap and its window — `allowanceFor()`, the answer `reserveQuota()`
   * enforces. A page showing 75 hours while the spend refuses at 0 would be
   * exactly the divergence this file's header forbids, so a caller that
   * leaves a field out gets the fail-closed figure, never a guess.
   */
  tier: Omit<AllowanceWorkspace, "kind">,
  now: Date = new Date(),
): Promise<ProgramUsage> {
  const supabase = await createClient();
  const allowance = allowanceFor({ ...tier, kind: "team" }, now);
  const capSeconds = allowance.capSeconds;
  const { scope, period } = periodFor(allowance, billingMonth);

  const linesByMonth = () =>
    supabase.rpc("program_usage_by_member", {
      p_program_id: programId,
      p_billing_month: scope.billingMonth,
    });
  const [totalResult, linesResult] = await Promise.all([
    readProgramUsedSeconds(supabase, programId, scope),
    scope.windowed
      ? supabase
          .rpc("program_usage_by_member_between", {
            p_program_id: programId,
            ...windowArgs(scope),
          })
          // The month's lines if the window read is not on this database
          // yet — the same degradation `readProgramUsedSeconds()` makes.
          .then((result) =>
            result.error && isMissingFunction(result.error)
              ? linesByMonth()
              : result,
          )
      : linesByMonth(),
  ]);

  if (totalResult.error || linesResult.error) {
    console.error("[usage] could not read program usage", {
      total: totalResult.error?.message,
      lines: linesResult.error?.message,
    });
    return { usedSeconds: 0, capSeconds, billingMonth, lines: [], ...period };
  }

  const lines = (
    (linesResult.data ?? []) as {
      user_id: string;
      display_name: string | null;
      used_seconds: number | string;
      match_count: number | string;
    }[]
  ).map((row) => ({
    userId: row.user_id,
    // A member who has never filled in their profile still has to appear —
    // dropping the row would make the lines stop adding up to the total.
    name: row.display_name ?? "Unnamed member",
    usedSeconds: Number(row.used_seconds),
    matchCount: Number(row.match_count),
  }));

  return {
    usedSeconds: totalResult.usedSeconds,
    capSeconds,
    billingMonth,
    lines,
    ...period,
  };
}
