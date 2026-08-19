import { createClient } from "@/lib/supabase/server";
import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";

/**
 * What Settings › Usage reads.
 *
 * "Used" is defined in exactly one place — the `reserve_processing_quota`
 * function — and both readers here mirror it: a released row is a refund and
 * does not count, and once a job finishes `actual_seconds` is the truth. A page
 * that showed a different total from the one that refuses a submission would be
 * worse than no page, because the person would believe the page.
 */

export interface PersonalUsage {
  usedSeconds: number;
  capSeconds: number;
  /** `YYYY-MM-01`, the `processing_usage.billing_month` key. */
  billingMonth: string;
}

export interface ProgramUsageLine {
  userId: string;
  name: string;
  usedSeconds: number;
  matchCount: number;
}

export interface ProgramUsage {
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
 * Takes the id rather than resolving it: every caller already holds the
 * workspace context, and asking GoTrue again only serialized a round trip in
 * front of a query that was ready to run.
 */
export async function getPersonalUsage(
  userId: string,
  billingMonth: string
): Promise<PersonalUsage> {
  const supabase = await createClient();
  const capSeconds = getMonthlyCapSeconds("individual");

  // RLS already restricts this to `created_by = auth.uid()`; the account filter
  // is what separates a personal upload from one the same person made inside a
  // program, which bills the program's ledger instead.
  const { data, error } = await supabase
    .from("processing_usage")
    .select("reserved_seconds, actual_seconds")
    .eq("account_id", userId)
    .eq("account_type", "individual")
    .eq("billing_month", billingMonth)
    .eq("released", false);

  if (error) {
    console.error("[usage] could not read personal usage", {
      error: error.message,
    });
    return { usedSeconds: 0, capSeconds, billingMonth };
  }

  const usedSeconds = (data ?? []).reduce(
    (total, row) => total + (row.actual_seconds ?? row.reserved_seconds ?? 0),
    0
  );

  return { usedSeconds, capSeconds, billingMonth };
}

/** A program's zeroed ledger — what a caller outside a program should see. */
export function emptyProgramUsage(billingMonth: string): ProgramUsage {
  return {
    usedSeconds: 0,
    capSeconds: getMonthlyCapSeconds("program"),
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
  billingMonth: string
): Promise<ProgramUsage> {
  const supabase = await createClient();
  const capSeconds = getMonthlyCapSeconds("program");

  const [totalResult, linesResult] = await Promise.all([
    supabase.rpc("program_usage_total", {
      p_program_id: programId,
      p_billing_month: billingMonth,
    }),
    supabase.rpc("program_usage_by_member", {
      p_program_id: programId,
      p_billing_month: billingMonth,
    }),
  ]);

  if (totalResult.error || linesResult.error) {
    console.error("[usage] could not read program usage", {
      total: totalResult.error?.message,
      lines: linesResult.error?.message,
    });
    return { usedSeconds: 0, capSeconds, billingMonth, lines: [] };
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
    usedSeconds: Number(totalResult.data ?? 0),
    capSeconds,
    billingMonth,
    lines,
  };
}
