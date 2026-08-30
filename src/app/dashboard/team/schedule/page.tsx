import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  getProgramSchedule,
  scheduleRowsFrom,
  eventDetailFrom,
} from "@/lib/data/schedule-server";
import { isProgramStaff, teamLabel } from "@/lib/workspace/types";
import { ScheduleList } from "@/components/dashboard/schedule/schedule-list";
import type { EventDetail } from "@/lib/schedule/types";

/**
 * 25a / 4c -- the program's schedule, now a master-detail layout.
 *
 * Reads `program_events`, not `matches`. That is the whole reason this page
 * exists rather than a team filter over `/dashboard/matches`: a schedule has
 * rows before anyone has played anything, and a matches list by definition
 * does not.
 *
 * Fetches once -- `getProgramSchedule` -- and passes the full data down so
 * selection in the list swaps the detail pane with no further round-trip.
 */
export default async function SchedulePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const schedule = await getProgramSchedule(active.id);

  const rows = scheduleRowsFrom(schedule);

  // Build the detail map: every event's detail, keyed by id, so the client
  // component can swap panes without a fetch.
  const details: Record<string, EventDetail> = {};
  for (const event of schedule.events) {
    const detail = eventDetailFrom(schedule, event.id);
    if (detail) details[event.id] = detail;
  }

  const squad = teamLabel(active.team);
  const eyebrow = squad ? `${active.name} · ${squad}` : active.name;

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col px-6 py-8 sm:px-10">
        <ScheduleList
          rows={rows}
          details={details}
          eyebrow={eyebrow}
          canCreate={isProgramStaff(active)}
        />
      </div>
    </div>
  );
}
