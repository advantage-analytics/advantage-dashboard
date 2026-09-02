import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import {
  getProgramSchedule,
  scheduleRowsFrom,
  seasonSummaryFrom,
} from "@/lib/data/schedule-server";
import { StaticSchedule } from "@/components/dashboard/schedule/static/static-schedule";
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
 *
 * ── Back on the database, against the rebuilt body ─────────────────────────
 * The `events-lineups` run re-pointed this route at `StaticSchedule` reading
 * `src/lib/schedule/fixtures.ts`, so that the `7e`/`7d`/`7c`/`4c` artboards
 * could be built without a query. The body stays; the fixtures go. Everything
 * below `getWorkspaceContext` is the pre-static read verbatim — the same three
 * loaders, the same details map — plus `seasonSummaryFrom` for `7d`'s season
 * block, which the fixtures used to answer with one hard-coded sentence and
 * four hard-coded marks.
 *
 * `rows.length === 0` is what selects the `7e` day-zero frame, which is why
 * nothing here branches on it: a program with no events hands the component an
 * empty `rows` and the component already knows what that means. That is the
 * branch `EMPTY_SCHEDULE` used to stand in for.
 *
 * The guards are untouched from both eras, and both permission answers still
 * come from the workspace rather than from the schedule: `isProgramStaff` gates
 * the drawer's "New event" CTA, and `canUploadForProgram` gates 7e's "One-off
 * match in Matches" — the same rule the DB-wired empty state applied to "Add
 * your own match".
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
  // Built from the loop's own `event` rather than through `eventDetailFrom`,
  // which re-`find()`s the very array this is iterating — an O(n²) walk over
  // the season for a map we already hold both halves of.
  const details: Record<string, EventDetail> = {};
  for (const event of schedule.events) {
    details[event.id] = {
      event,
      entries: schedule.entriesByEvent.get(event.id) ?? [],
    };
  }

  return (
    <StaticSchedule
      schedule={{ rows, details }}
      season={seasonSummaryFrom(schedule)}
      canCreate={isProgramStaff(active)}
      canAddOwnMatch={canUploadForProgram(active)}
    />
  );
}
