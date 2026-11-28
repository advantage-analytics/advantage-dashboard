/**
 * The plan facts a video allowance hangs off that are not on the row every
 * loader already reads: a player's `users.plan_period_start` and
 * `plan_status`, and a team's `program_plans` row. Each builder of a billing `Workspace` — the
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
 * `program_plans.hours_from` arrives later still, with
 * `20261126110000_plans_2027_followups`. A select that names a missing column
 * fails whole (42703), so each read of the row asks with it and, on exactly
 * that error, again without (`withHoursFrom()`): the plan then reads as
 * counting from its first day, which is what it did before the column.
 *
 * No server-only import: the client is handed in, so this works with the
 * session client (its own row, its own teams) and the service role alike.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/data/season-points-cache";
import { isMissingColumn } from "@/lib/supabase/missing-function";
import {
  isCollegePlanId,
  isPlanTerm,
  type PlanPeriod,
  type ProgramPlanRef,
} from "./plans";

/** The `program_plans` columns a `ProgramPlanRef` is built from. */
export const PROGRAM_PLAN_REF_COLUMNS =
  "program_id, plan_id, plan_term, starts_on, ends_on";
/** The same, with the instant the season pool starts counting from. */
export const PROGRAM_PLAN_REF_COLUMNS_WITH_HOURS_FROM = `${PROGRAM_PLAN_REF_COLUMNS}, hours_from`;

/** A `program_plans` row as either column list returns it. */
export interface ProgramPlanRow {
  program_id?: string;
  plan_id: unknown;
  plan_term: unknown;
  starts_on: string;
  ends_on: string;
  hours_from?: string | null;
}

/**
 * Run a `program_plans` read with `hours_from`, and without it when this
 * database does not have the column yet. Any other error is the first read's.
 */
export async function withHoursFrom<
  T extends { error: { code?: string } | null },
>(read: (columns: string) => PromiseLike<T>): Promise<T> {
  const first = await read(PROGRAM_PLAN_REF_COLUMNS_WITH_HOURS_FROM);
  return first.error && isMissingColumn(first.error)
    ? read(PROGRAM_PLAN_REF_COLUMNS)
    : first;
}

/**
 * A `program_plans` row as a `ProgramPlanRef`, or null for a value this
 * build does not know — a plan newer than this code reads as no plan rather
 * than a guess. The table's CHECKs pin both value sets.
 */
export function toProgramPlanRef(
  row: ProgramPlanRow | null,
): ProgramPlanRef | null {
  if (!row || !isCollegePlanId(row.plan_id) || !isPlanTerm(row.plan_term)) {
    return null;
  }
  return {
    id: row.plan_id,
    term: row.plan_term,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    // Absent without the column: the pool then counts from `startsOn`.
    ...(row.hours_from ? { hoursFrom: row.hours_from } : {}),
  };
}

/** One team's season plan, or null. Never throws. */
export async function readProgramPlanRef(
  supabase: SupabaseClient,
  programId: string,
): Promise<ProgramPlanRef | null> {
  try {
    const { data, error } = await withHoursFrom((columns) =>
      supabase
        .from("program_plans")
        .select(columns)
        .eq("program_id", programId)
        .maybeSingle(),
    );
    if (error) {
      if (!isMissingTable(error)) {
        console.error("[plans] could not read the program plan", {
          programId,
          error: error.message,
        });
      }
      return null;
    }
    return toProgramPlanRef(data as ProgramPlanRow | null);
  } catch (error) {
    console.error("[plans] could not read the program plan", {
      programId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The season plans of several teams in one read, keyed by program id — for a
 * list that would otherwise ask once per row. A team with no plan has no
 * entry. Never throws; a failed read (or no table yet) is an empty map, the
 * same fail-closed "no plan" `readProgramPlanRef()` answers.
 */
export async function readProgramPlanRefs(
  supabase: SupabaseClient,
  programIds: readonly string[],
): Promise<Map<string, ProgramPlanRef>> {
  const plans = new Map<string, ProgramPlanRef>();
  if (programIds.length === 0) return plans;
  try {
    const { data, error } = await withHoursFrom((columns) =>
      supabase
        .from("program_plans")
        .select(columns)
        .in("program_id", [...programIds]),
    );
    if (error) {
      if (!isMissingTable(error)) {
        console.error("[plans] could not read the program plans", {
          error: error.message,
        });
      }
      return plans;
    }
    for (const row of (data ?? []) as unknown as (ProgramPlanRow & {
      program_id: string;
    })[]) {
      const ref = toProgramPlanRef(row);
      if (ref) plans.set(row.program_id, ref);
    }
  } catch (error) {
    console.error("[plans] could not read the program plans", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return plans;
}

/** What Settings › Plan and the checkout dialog say about a subscription. */
export interface PlanBilling {
  /** `users.plan` as the row holds it. Read it through `planFor()`. */
  plan: string | null;
  /** `users.plan_period_start`, an ISO instant: the hours window's anchor. */
  periodStart: string | null;
  /** `users.plan_period`, when it is one this build knows. */
  period: PlanPeriod | null;
  /** `users.plan_status`: `active`, `past_due`, `canceled`, or null for never. */
  status: string | null;
  /** `users.plan_period_end`, an ISO instant: the day the plan renews. */
  periodEnd: string | null;
  /**
   * Whether this account has ever held a subscription, by our own row. The
   * first-month discount is for accounts that have not — and checkout, which
   * also asks Stripe, has the last word (`customerHistory()`).
   */
  everSubscribed: boolean;
}

export const NO_PLAN_BILLING: PlanBilling = {
  plan: null,
  periodStart: null,
  period: null,
  status: null,
  periodEnd: null,
  everSubscribed: false,
};

/**
 * One user's own subscription facts, read under RLS. Never throws, and a
 * database the plan-model migration has not reached reads as "never
 * subscribed", like `readPlanWindow()` below. No Stripe id is selected:
 * the browser calls this too, and has no use for one.
 */
export async function readPlanBilling(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanBilling> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        "plan, plan_period, plan_status, plan_period_start, plan_period_end",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      if (!isMissingColumn(error)) {
        console.error("[plans] could not read the plan billing", {
          error: error.message,
        });
      }
      return NO_PLAN_BILLING;
    }
    const row = data as {
      plan?: string | null;
      plan_period_start?: string | null;
      plan_period?: string | null;
      plan_status?: string | null;
      plan_period_end?: string | null;
    } | null;
    const period = row?.plan_period;
    return {
      plan: row?.plan ?? null,
      periodStart: row?.plan_period_start ?? null,
      period: period === "monthly" || period === "yearly" ? period : null,
      status: row?.plan_status ?? null,
      periodEnd: row?.plan_period_end ?? null,
      everSubscribed: (row?.plan_status ?? null) !== null,
    };
  } catch (error) {
    console.error("[plans] could not read the plan billing", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NO_PLAN_BILLING;
  }
}

/** The two `users` columns a paid plan's hours window is read from. */
export interface PlanWindowFacts {
  /** `users.plan_period_start`, an ISO instant: the window's anchor. */
  periodStart: string | null;
  /** `users.plan_status`; `past_due` is a window with no plan hours. */
  status: string | null;
}

export const NO_PLAN_WINDOW: PlanWindowFacts = {
  periodStart: null,
  status: null,
};

/**
 * `users.plan_period_start` and `plan_status` for one user — the anchor of a
 * paid plan's hours window, and whether its last payment failed — or nulls.
 * Never throws.
 *
 * Its own read, never names in a wider select: a select that names a missing
 * column fails whole, and would take the rest of the row with it. The two
 * arrive with the same migration, so they are asked for together.
 */
export async function readPlanWindow(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanWindowFacts> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("plan_period_start, plan_status")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      if (!isMissingColumn(error)) {
        console.error("[plans] could not read the plan period", {
          error: error.message,
        });
      }
      return NO_PLAN_WINDOW;
    }
    const row = data as {
      plan_period_start?: string | null;
      plan_status?: string | null;
    } | null;
    return {
      periodStart: row?.plan_period_start ?? null,
      status: row?.plan_status ?? null,
    };
  } catch (error) {
    console.error("[plans] could not read the plan period", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NO_PLAN_WINDOW;
  }
}
