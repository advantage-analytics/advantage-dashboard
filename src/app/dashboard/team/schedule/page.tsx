import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import { StaticSchedule } from "@/components/dashboard/schedule/static/static-schedule";
import { POPULATED_SCHEDULE } from "@/lib/schedule/fixtures";

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
 * ── Static as of the events-lineups rebuild ────────────────────────────────
 * The two paragraphs above describe the DB-wired body, which `ScheduleList`
 * still implements and which this route no longer runs: nothing here fetches
 * any more. The body is `StaticSchedule`, rendering artboards `7e` and `7d`
 * from `src/lib/schedule/fixtures.ts` — swap `POPULATED_SCHEDULE` for
 * `EMPTY_SCHEDULE` to land on the day-zero frame. `schedule-list.tsx` and the
 * loaders it needs (`getProgramSchedule`, `scheduleRowsFrom`,
 * `eventDetailFrom`) stay exactly where they are, dormant, for the re-wiring.
 *
 * The guards below are untouched, and both permission answers still come from
 * the workspace rather than from the fixtures: `isProgramStaff` gates the
 * drawer's "New event" CTA, and `canUploadForProgram` gates 7e's "One-off
 * match in Matches" — the same rule the DB-wired empty state applied to "Add
 * your own match".
 */
export default async function SchedulePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  return (
    <StaticSchedule
      schedule={POPULATED_SCHEDULE}
      canCreate={isProgramStaff(active)}
      canAddOwnMatch={canUploadForProgram(active)}
    />
  );
}
