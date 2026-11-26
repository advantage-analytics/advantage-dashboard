/**
 * The two plan facts a video allowance hangs off that are not on the row
 * every loader already reads: a player's `users.plan_period_start` and a
 * team's `program_plans` row. Each builder of a billing `Workspace` — the
 * dashboard's loader, the admin console's, the auto-retry's — asks here, so
 * they cannot differ on what a missing migration means.
 *
 * Both arrive with `20261126060000_plans_2027_plan_model`, a migration
 * applied by hand, and this code can be deployed before it. A missing column
 * or table reads as "no period" / "no plan", which is true until billing or
 * an admin can write one, and is not logged. Any other failure is logged and
 * answers the same: the fail-closed direction for a number that meters paid
 * vendor spend. The missing-migration branches can go once it is live.
 *
 * No server-only import: the client is handed in, so this works with the
 * session client (its own row, its own teams) and the service role alike.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/data/season-points-cache";
import { isMissingColumn } from "@/lib/supabase/missing-function";
import { isCollegePlanId, isPlanTerm, type ProgramPlanRef } from "./plans";

/** The `program_plans` columns a `ProgramPlanRef` is built from. */
export const PROGRAM_PLAN_REF_COLUMNS =
  "program_id, plan_id, plan_term, starts_on, ends_on";

/**
 * A `program_plans` row as a `ProgramPlanRef`, or null for a value this
 * build does not know — a plan newer than this code reads as no plan rather
 * than a guess. The table's CHECKs pin both value sets.
 */
export function toProgramPlanRef(
  row: {
    plan_id: unknown;
    plan_term: unknown;
    starts_on: string;
    ends_on: string;
  } | null,
): ProgramPlanRef | null {
  if (!row || !isCollegePlanId(row.plan_id) || !isPlanTerm(row.plan_term)) {
    return null;
  }
  return {
    id: row.plan_id,
    term: row.plan_term,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/** One team's season plan, or null. Never throws. */
export async function readProgramPlanRef(
  supabase: SupabaseClient,
  programId: string,
): Promise<ProgramPlanRef | null> {
  try {
    const { data, error } = await supabase
      .from("program_plans")
      .select(PROGRAM_PLAN_REF_COLUMNS)
      .eq("program_id", programId)
      .maybeSingle();
    if (error) {
      if (!isMissingTable(error)) {
        console.error("[plans] could not read the program plan", {
          programId,
          error: error.message,
        });
      }
      return null;
    }
    return toProgramPlanRef(data);
  } catch (error) {
    console.error("[plans] could not read the program plan", {
      programId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * `users.plan_period_start` for one user — the anchor of a paid plan's hours
 * window — or null. Never throws.
 *
 * Its own read, never a name in a wider select: a select that names a missing
 * column fails whole, and would take the rest of the row with it.
 */
export async function readPlanPeriodStart(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("plan_period_start")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      if (!isMissingColumn(error)) {
        console.error("[plans] could not read the plan period", {
          error: error.message,
        });
      }
      return null;
    }
    return (
      (data as { plan_period_start?: string | null } | null)
        ?.plan_period_start ?? null
    );
  } catch (error) {
    console.error("[plans] could not read the plan period", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
