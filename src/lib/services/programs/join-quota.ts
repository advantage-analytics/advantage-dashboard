import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import type { ProgramOrgType } from "@/lib/workspace/types";

/**
 * The two allowances 8.2's footer compares, in hours.
 *
 * Read on the server, from the function `reserveQuota()` asks when it decides
 * whether a submission is refused — so the number a player is shown at the
 * moment they agree to join is the number that will actually be enforced.
 * Which is why it takes the program's org type: a custom org's allowance is
 * the reduced tier (`quotaTierFor()`), and quoting a club's invitee the
 * collegiate 75 hours would break exactly the promise this comment makes.
 *
 * The one rule: this file is server-only by construction and must stay that
 * way. Pages hand the join components two plain numbers rather than letting
 * them import it, because the modules it reads carry the vendor's internal
 * name and none of that belongs in a client bundle. It lives here rather than
 * in a page so the second surface that shows the footer reads the same
 * numbers instead of copying them.
 */
export function quotaHours(orgType: ProgramOrgType): {
  programHours: number;
  personalHours: number;
} {
  return {
    programHours: monthlyCapSecondsFor({ kind: "team", orgType }) / 3600,
    personalHours: getMonthlyCapSeconds("individual") / 3600,
  };
}
