"use server";

import {
  emptyProgramUsage,
  getProgramUsage,
  type ProgramUsage,
} from "@/lib/data/usage-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * Re-read a program's ledger for a different month.
 *
 * The month stepper is the only interactive thing on Settings › Usage, so it
 * gets an action rather than a route: one function, one caller, no URL surface
 * to keep in step with the page.
 *
 * Which program is server state, so the stepper sends only the month. The two
 * RPCs are membership-gated in SQL either way — this is not the guard, it is
 * one fewer identifier crossing the boundary for the server to look up anyway.
 */
export async function loadProgramUsage(
  billingMonth: string
): Promise<ProgramUsage> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return emptyProgramUsage(billingMonth);
  }
  return getProgramUsage(workspace.active.id, billingMonth);
}
