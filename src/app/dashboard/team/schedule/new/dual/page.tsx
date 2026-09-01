import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { StaticDualBuilder } from "@/components/dashboard/schedule/static/static-dual-builder";

/**
 * 2c/25b — the new dual: find the school, then date, site and lineup.
 *
 * ── Static as of the events-lineups rebuild ────────────────────────────────
 * This route no longer reads anything. It used to run four loaders in parallel
 * — the ladder, the team settings, the conference table and the whole program
 * schedule — plus `opponentDualHistory()` over the last of them and a
 * `toDirectoryRow()` helper that shaped a conference row into the directory
 * row both of step one's lists take. All of it is gone with the fetch. The
 * body is `StaticDualBuilder`, rendering artboard `2c` from
 * `src/lib/schedule/fixtures.ts`; step two is a named stub inside it.
 *
 * `dual-form.tsx` and `school-search.tsx` are the DB-wired implementation of
 * these two steps and stay exactly where they are, dormant, along with the
 * loaders they need (`getLadder`, `getTeamSettings`, `getConferenceTable`,
 * `getProgramSchedule`, `opponentDualHistory`, `divisionLabel`). The re-wiring
 * is this route reading again and handing `DualForm` the same props it always
 * did.
 *
 * The guards below are untouched.
 */
export default async function NewDualPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  // A hidden menu item is not authorization. A player who types this URL gets
  // the schedule they are allowed to read, not a form whose every write the
  // database would refuse.
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  return <StaticDualBuilder />;
}
