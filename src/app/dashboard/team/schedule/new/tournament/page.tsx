import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { StaticTournamentBuilder } from "@/components/dashboard/schedule/static/static-tournament-builder";

/**
 * 3c — the new tournament, master and detail: the ladder on the left is what
 * the field is built from, so the roster fetch is not decoration here. Without
 * it the right pane has nothing to enter.
 *
 * ── Static as of the events-lineups rebuild ────────────────────────────────
 * The paragraph above describes the DB-wired body, which `TournamentForm` still
 * implements and which this route no longer runs: nothing here fetches. It used
 * to run `getLadder` and `getTeamSettings` in parallel and hand the results
 * down as `roster` and `defaultSurface`; both are gone with the fetch, and so
 * is the Surface cell that `defaultSurface` answered — `3c` draws Name, Starts,
 * Ends, Site and Format, and no surface or host field. The body is
 * `StaticTournamentBuilder`, rendering artboard `3c` from
 * `src/lib/schedule/fixtures.ts`.
 *
 * `tournament-form.tsx` and the `entry-editor.tsx` pair it composes
 * (`RosterRail`, `EntryList`) are the DB-wired implementation of this screen
 * and stay exactly where they are, dormant, along with the loaders they need
 * (`getLadder`, `getTeamSettings`) and the `createTournament` action they
 * write through. The re-wiring is this route reading again and handing
 * `TournamentForm` the same two props it always did.
 *
 * The guards below are untouched.
 */
export default async function NewTournamentPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  return <StaticTournamentBuilder />;
}
