import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { NewTournamentFlow } from "@/components/dashboard/schedule/static/new-tournament-flow";

/**
 * 3c, under the wizard's chrome: the weekend, then the field.
 *
 * The roster fetch is not decoration here — the field step is one list over the
 * ladder, and without it the second step has nobody to enter.
 *
 * ── The body this route renders ────────────────────────────────────────────
 * `NewTournamentFlow` (`static/new-tournament-flow.tsx`) frames two steps of
 * `matches/new-match-wizard`'s `WizardShell`, the same chrome the new dual and
 * the upload wizard use. It draws `TournamentWeekendStep` and
 * `TournamentFieldStep` out of `static/static-tournament-builder.tsx` over that
 * file's `useTournamentDraft`. The two-pane composite this route used to render
 * — a roster rail beside an entries table — is gone.
 *
 * The two loaders below are unchanged: `getLadder` and `getTeamSettings`, in
 * parallel, arriving as the same two props.
 *
 * `defaultSurface` has no cell to fill. The weekend step draws Name, Starts,
 * Ends, Site and Format, and no surface or host field, so the value travels as
 * the surface the created event will carry rather than as a control:
 * `createTournament` takes a `surface`, and the program's own answer is the
 * only non-invented one available. Nothing here defaults it to a court type the
 * program never chose.
 *
 * Submitting writes: the draft calls `createTournament` and navigates to the
 * event it created.
 *
 * The guards below are untouched.
 */
export default async function NewTournamentPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!canManageTeamSchedule(active)) redirect("/dashboard/team/schedule");

  const [roster, settings] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
  ]);

  return (
    <NewTournamentFlow
      roster={roster}
      defaultSurface={settings?.program.defaultSurface ?? null}
    />
  );
}
