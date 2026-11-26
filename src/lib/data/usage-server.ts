import { createClient } from "@/lib/supabase/server";
import { plansHaveBegun } from "@/lib/billing/plans";
import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";
import { withMonthFallback } from "@/lib/supabase/missing-function";
import {
  allowanceFor,
  allowanceResetsOn,
  type AllowanceScope,
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
  scope: AllowanceScope;
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
      ? // The month's lines if the window read is not on this database yet.
        withMonthFallback(
          () =>
            supabase.rpc("program_usage_by_member_between", {
              p_program_id: programId,
              ...windowArgs(scope),
            }),
          linesByMonth,
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

/** One match analysed in the viewer's current hours window. */
export interface PersonalUsageMatch {
  /** The match id, or the ledger row's own id for a match since removed. */
  id: string;
  /** `matches.player2_name`; null when the match is gone or unnamed. */
  opponent: string | null;
  /** `matches.date`, a calendar day — read it through `match-day.ts`. */
  date: string | null;
  seconds: number;
}

/**
 * The matches behind the personal meter: every unreleased ledger row in the
 * CURRENT hours window (`allowanceFor()`'s, the one `getPersonalUsage()`
 * sums), one line per match, newest first. A match analysed twice in the
 * window is one line with both runs' time, and a row whose match has since
 * been removed still shows, so the lines add up to the meter.
 *
 * Read as the viewer under RLS: their own ledger rows, their own jobs and
 * matches. A failed ledger read answers null and logs, so the card can say
 * the list could not be read rather than that nothing was analysed — the
 * meter above is still the figure.
 */
export async function getPersonalUsageMatches(
  personal: AllowanceWorkspace & Pick<Workspace, "id">,
  now: Date = new Date(),
): Promise<PersonalUsageMatch[] | null> {
  const supabase = await createClient();
  const allowance = allowanceFor(personal, now);

  const { data, error } = await scopeToAllowance(
    supabase
      .from("processing_usage")
      .select("id, job_id, reserved_seconds, actual_seconds, created_at")
      .eq("account_id", personal.id)
      .eq("account_type", "individual")
      .eq("released", false),
    allowance,
  ).order("created_at", { ascending: false });
  if (error) {
    console.error("[usage] could not read personal usage lines", {
      error: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as {
    id: string;
    job_id: string | null;
    reserved_seconds: number | null;
    actual_seconds: number | null;
  }[];
  if (rows.length === 0) return [];

  // Two batched reads rather than embeds: `processing_usage.job_id` is
  // nullable, and a to-one embed on a nullable key quietly drops rows.
  const jobIds = [...new Set(rows.flatMap((row) => row.job_id ?? []))];
  const jobs =
    jobIds.length > 0
      ? await supabase
          .from("processing_jobs")
          .select("id, match_id")
          .in("id", jobIds)
      : { data: [], error: null };
  const matchByJob = new Map<string, string>();
  for (const job of (jobs.data ?? []) as {
    id: string;
    match_id: string | null;
  }[]) {
    if (job.match_id) matchByJob.set(job.id, job.match_id);
  }

  const matchIds = [...new Set(matchByJob.values())];
  const matches =
    matchIds.length > 0
      ? await supabase
          .from("matches")
          .select("id, player2_name, date")
          .in("id", matchIds)
      : { data: [], error: null };
  if (jobs.error || matches.error) {
    console.error("[usage] could not name personal usage lines", {
      jobs: jobs.error?.message,
      matches: matches.error?.message,
    });
  }
  const matchById = new Map(
    (
      (matches.data ?? []) as {
        id: string;
        player2_name: string | null;
        date: string | null;
      }[]
    ).map((match) => [match.id, match]),
  );

  // Newest first, as the ledger came back; a second run of one match adds to
  // the line its newest run opened.
  const lines = new Map<string, PersonalUsageMatch>();
  for (const row of rows) {
    const matchId = row.job_id ? matchByJob.get(row.job_id) : undefined;
    const match = matchId ? matchById.get(matchId) : undefined;
    const key = match?.id ?? row.id;
    const seconds = row.actual_seconds ?? row.reserved_seconds ?? 0;
    const line = lines.get(key);
    if (line) line.seconds += seconds;
    else {
      lines.set(key, {
        id: key,
        opponent: match?.player2_name?.trim() || null,
        date: match?.date ?? null,
        seconds,
      });
    }
  }
  return [...lines.values()];
}
