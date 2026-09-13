"use server";

import {
  emptyProgramUsage,
  getProgramUsage,
  type ProgramUsage,
} from "@/lib/data/usage-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * Re-read one program's ledger for a different month.
 *
 * The month stepper is the only interactive thing on Settings › Usage, so it
 * gets an action rather than a route: one function, one caller, no URL surface
 * to keep in step with the page.
 *
 * The page lists every team the viewer belongs to, so the stepper names which
 * one. The id is looked up in the viewer's own workspaces rather than trusted —
 * that also supplies the `org_type` the cap figure depends on. The two RPCs are
 * membership-gated in SQL either way; this is not the only guard.
 */
export async function loadProgramUsage(
  programId: string,
  billingMonth: string,
): Promise<ProgramUsage> {
  const workspace = await getWorkspaceContext();
  const program = workspace?.available.find(
    (candidate) => candidate.kind === "team" && candidate.id === programId,
  );
  if (!program) return emptyProgramUsage(billingMonth);
  return getProgramUsage(program.id, billingMonth, program.orgType);
}
