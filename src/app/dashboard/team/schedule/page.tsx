import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getScheduleRows } from "@/lib/data/schedule-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { ScheduleList } from "@/components/dashboard/schedule/schedule-list";

/**
 * 25a — the program's schedule.
 *
 * Reads `program_events`, not `matches`. That is the whole reason this page
 * exists rather than a team filter over `/dashboard/matches`: a schedule has
 * rows before anyone has played anything, and a matches list by definition
 * does not.
 */
export default async function SchedulePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty schedule belonging to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  const rows = await getScheduleRows(active.id);

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col px-6 py-8 sm:px-10">
        <ScheduleList rows={rows} canCreate={isProgramStaff(active)} />
      </div>
    </div>
  );
}
