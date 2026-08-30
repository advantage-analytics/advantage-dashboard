import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  getProgramSchedule,
  getProgramResultsScope,
  scheduleRowsFrom,
  eventDetailFrom,
} from "@/lib/data/schedule-server";
import { isProgramStaff, teamLabel } from "@/lib/workspace/types";
import { ScheduleList } from "@/components/dashboard/schedule/schedule-list";
import type { EventDetail } from "@/lib/schedule/types";

/**
 * 25a / 4c — the program's schedule, now a master-detail layout.
 *
 * Reads `program_events`, not `matches`. That is the whole reason this page
 * exists rather than a team filter over `/dashboard/matches`: a schedule has
 * rows before anyone has played anything, and a matches list by definition
 * does not.
 *
 * Fetches once — `getProgramSchedule` + `getProgramResultsScope` — and passes
 * the full data down so selection in the list swaps the detail pane with no
 * further round-trip.
 */
export default async function SchedulePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty schedule belonging to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  const [schedule, scope] = await Promise.all([
    getProgramSchedule(active.id),
    getProgramResultsScope(active.id, active.role),
  ]);

  const rows = scheduleRowsFrom(schedule, scope);

  // Build the detail map: every event's detail, keyed by id, so the client
  // component can swap panes without a fetch.
  const details: Record<string, EventDetail> = {};
  for (const event of schedule.events) {
    const detail = eventDetailFrom(schedule, event.id);
    if (detail) details[event.id] = detail;
  }

  // The eyebrow names the workspace this schedule belongs to — same pattern as
  // the roster page. A coach running both squads holds two of these, and
  // "Schedule" alone would not say which one is on screen.
  const squad = teamLabel(active.team);
  const eyebrow = squad ? `${active.name} · ${squad}` : active.name;

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col px-6 py-8 sm:px-10">
        <ScheduleList
          rows={rows}
          details={details}
          scope={scope}
          eyebrow={eyebrow}
          canCreate={isProgramStaff(active)}
        />
      </div>
    </div>
  );
}
