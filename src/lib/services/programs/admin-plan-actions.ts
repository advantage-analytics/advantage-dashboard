"use server";

import { revalidatePath } from "next/cache";
import { planDraftProblem, setProgramPlanArgs } from "@/lib/billing/plan-draft";
import type { CollegePlanId, PlanTerm } from "@/lib/billing/plans";
import { isMissingFunction } from "@/lib/supabase/missing-function";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./admin-guard";

/**
 * The Admin › Teams Plan card's two writes: put a team on a season plan, and
 * take it off.
 *
 * `admin_set_program_plan` and `admin_clear_program_plan`
 * (20261126060000_plans_2027_plan_model.sql) are the only writers of
 * `program_plans`. Both re-check `is_admin()` against `auth.uid()` and write
 * the `plan.set` / `plan.cleared` audit row naming the admin, so they run on
 * the SESSION client, like every pilot write beside them. Through the service
 * role `auth.uid()` is null and the functions refuse.
 *
 * `requireAdmin()` first all the same: the layout guard protects the page,
 * not the write, and it saves a round trip for a caller the RPC would refuse.
 */

/** Everything under the admin console re-renders after either of these. */
const ADMIN_PATH = "/admin";
const NOT_AUTHORIZED = "Not authorized.";

/** The migration is applied by hand and this code can be deployed before it. */
const NOT_APPLIED =
  "Plans cannot be saved yet. The plan model's database migration has not been applied.";

export type PlanActionResult = { ok: true } | { ok: false; error: string };

type RpcError = { code?: string; message?: string };

function refusal(error: RpcError, fallback: string): string {
  const code = error.code ?? "";
  if (isMissingFunction(error)) return NOT_APPLIED;
  if (code === "42501") return NOT_AUTHORIZED;
  if (code === "P0002") return "That team no longer exists.";
  // The RPC's own argument refusals are written as sentences to show.
  if (code === "22023" && error.message?.trim()) return error.message.trim();
  return fallback;
}

/**
 * Assign or replace a team's season plan.
 *
 * The plan and term are checked against the plan module's ids and the dates
 * as real calendar days before the RPC is asked, so a refusal reads as a
 * sentence and not as the driver's wording. The RPC checks all of it again.
 * Saving also pulls a pilot still running on `startsOn` back to the day
 * before, inside the RPC.
 */
export async function setProgramPlan(input: {
  programId: string;
  planId: CollegePlanId;
  term: PlanTerm;
  /** `YYYY-MM-DD`, the first day of the season, inclusive. */
  startsOn: string;
  /** `YYYY-MM-DD`, the last day of the season, inclusive. */
  endsOn: string;
  /** The invoice or PO reference. Empty or null stores none. */
  note: string | null;
}): Promise<PlanActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_AUTHORIZED };

  if (typeof input?.programId !== "string" || input.programId === "") {
    return { ok: false, error: "Choose a team first." };
  }
  const problem = planDraftProblem(input);
  if (problem) return { ok: false, error: problem };

  const args = setProgramPlanArgs(input.programId, {
    planId: input.planId,
    term: input.term,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    note: input.note ?? "",
  });
  if (!args) return { ok: false, error: "Couldn't save the plan." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_program_plan", args);
  if (error) {
    return { ok: false, error: refusal(error, "Couldn't save the plan.") };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/**
 * Take a team off its plan. The RPC deletes the row and logs what it was; a
 * team with no plan is left alone and nothing is logged. It does not put the
 * pilot's old end date back.
 */
export async function clearProgramPlan(
  programId: string,
): Promise<PlanActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: NOT_AUTHORIZED };

  if (typeof programId !== "string" || programId === "") {
    return { ok: false, error: "Choose a team first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_clear_program_plan", {
    p_program_id: programId,
  });
  if (error) {
    return { ok: false, error: refusal(error, "Couldn't remove the plan.") };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}
