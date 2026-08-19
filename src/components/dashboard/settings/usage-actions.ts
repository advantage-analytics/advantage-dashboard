"use server";

import { getProgramUsage, type ProgramUsage } from "@/lib/data/usage-server";

/**
 * Re-read a program's ledger for a different month.
 *
 * The month stepper is the only interactive thing on Settings › Usage, so it
 * gets an action rather than a route: one function, one caller, no URL surface
 * to keep in step with the page.
 *
 * No authorization here on purpose — `program_usage_total` and
 * `program_usage_by_member` are membership-gated in SQL, so a hand-edited
 * program id comes back as zeroes and an empty roster rather than someone
 * else's numbers. Re-checking here would be a second answer to a question the
 * database already answers.
 */
export async function loadProgramUsage(
  programId: string,
  billingMonth: string
): Promise<ProgramUsage> {
  return getProgramUsage(programId, billingMonth);
}
