import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { StaticTournamentBuilder } from "@/components/dashboard/schedule/static/static-tournament-builder";

/**
 * 3c — the new tournament, master and detail: the ladder on the left is what
 * the field is built from, so the roster fetch is not decoration here. Without
 * it the right pane has nothing to enter.
 *
 * ── Back on the database, against the rebuilt body ─────────────────────────
 * The `events-lineups` run re-pointed this route at `StaticTournamentBuilder`
 * reading `src/lib/schedule/fixtures.ts`, so `3c` could be built without a
 * query. The body stays; the fixtures go. The two loaders below are the
 * pre-static read verbatim — `getLadder` and `getTeamSettings`, in parallel —
 * and they arrive as the same two props `TournamentForm` always took.
 *
 * `defaultSurface` has no cell to fill. `3c` draws Name, Starts, Ends, Site and
 * Format, and no surface or host field, so the value travels as the surface the
 * created event will carry rather than as a control: `createTournament` takes a
 * `surface`, and the program's own answer is the only non-invented one
 * available. Nothing here defaults it to a court type the program never chose.
 *
 * Submitting is not wired yet — the builder holds its own draft and the Create
 * button is still inert. `tournament-form.tsx` and the `entry-editor.tsx` pair
 * it composes stay dormant where they are until that lands, along with the
 * `createTournament` action they write through.
 *
 * The guards below are untouched.
 */
export default async function NewTournamentPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const [roster, settings] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
  ]);

  return (
    <StaticTournamentBuilder
      roster={roster}
      defaultSurface={settings?.program.defaultSurface ?? null}
    />
  );
}
