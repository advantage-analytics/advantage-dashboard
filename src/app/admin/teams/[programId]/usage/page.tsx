import { notFound } from "next/navigation";

import { ProgramUsageCard } from "@/components/dashboard/settings/program-usage-card";
import { getAdminTeam } from "@/lib/data/admin-team-server";
import { adminLoadProgramUsage } from "@/lib/services/programs/admin-team-actions";
import { currentBillingMonth } from "@/lib/services/splitstep/config";

export const metadata = { title: "Usage" };

/**
 * The Admin › Teams detail page's Usage tab: this program's shared hours,
 * one month at a time.
 *
 * Reuses `ProgramUsageCard` — the same month stepper Settings › Usage
 * renders for a program's own staff — rather than a second card, passing
 * `load={adminLoadProgramUsage}` so the stepper re-reads through the admin
 * path instead of `loadProgramUsage`'s membership lookup, which would refuse
 * every program this console exists to look at. `ProgramUsageCard`'s default
 * behavior is unchanged for every other caller.
 *
 * Calls `getAdminTeam(programId)` again rather than taking the layout's copy,
 * for the reason the Overview tab gives: there is no channel from a layout to
 * `{children}`, and the call is `cache()`-wrapped, so this dedupes with the
 * layout's own call within the same request. `notFound()` on a null result
 * for the same reason — the layout having already run is not guaranteed.
 *
 * `program` is built from `data.program` (an `AdminTeamProgram`, which
 * extends `TeamIdentity`) rather than a `Workspace` this admin doesn't have:
 * an admin is by definition not a member, so there is no workspace to draw
 * `mark` and `iconUrl` from. Both are derived exactly as
 * `getWorkspaceContext()` derives them for a real team workspace — the school
 * name's first letter, and `crestUrl` off the program's `crest_path` — so the
 * card renders the same square a member would see.
 */
export default async function AdminTeamUsagePage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const data = await getAdminTeam(programId);

  if (!data) {
    notFound();
  }

  const billingMonth = currentBillingMonth();

  return (
    <div className="max-w-[640px]">
      <ProgramUsageCard
        program={{
          id: data.program.id,
          name: data.program.name,
          kind: "team",
          mark: data.program.schoolName.trim().charAt(0).toUpperCase(),
          iconUrl: data.program.crestUrl,
          team: data.program.team,
        }}
        initial={data.usage}
        currentMonth={billingMonth}
        load={adminLoadProgramUsage}
      />
    </div>
  );
}
