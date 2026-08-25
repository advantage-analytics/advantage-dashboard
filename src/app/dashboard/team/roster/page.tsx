import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getRosterData } from "@/lib/data/team-roster-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { formatResetDate } from "@/lib/data/usage-format";
import { RosterTable } from "@/components/dashboard/team/roster-table";
import { RosterHeaderButtons } from "@/components/dashboard/team/roster-header-buttons";
import {
  invitesPendingLabel,
  playersLabel,
} from "@/components/dashboard/team/roster-vocabulary";

export const metadata = { title: "Roster" };

/**
 * Everyone on the program, and how each of them is playing.
 *
 * Design 6a: a title, one line of standing, and a single table carrying form,
 * last match and first serve — with the people a coach has emailed but who have
 * not joined yet living in that same list rather than in a second one below it.
 *
 * Both ways of growing a squad sit here rather than only in Settings › Team,
 * because this is where a coach notices somebody is missing. They are different
 * actions and the page says so: Add player creates the row now and needs no
 * account; Invite sends email and spends a seat when it is accepted.
 */
export default async function RosterPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active, viewer } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty roster belonging to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  const roster = await getRosterData(active.id);

  // A hidden control is not authorization — every write behind these re-checks
  // `is_program_staff` in SQL. This only decides what is worth rendering.
  const canManage = active.role !== "player";

  const playerCount = roster.members.filter((m) => m.role === "player").length;
  const visibility = roster.rosterVisible
    ? "visible to everyone on the team"
    : "visible to coaches only";

  // Assembled as text rather than as nested JSX: it is one sentence, and the
  // separators only read right when the empty clauses are gone before the join.
  // The rows an invitation can target: on the roster, no login yet. Derived
  // here rather than fetched again — `getRosterData` already has every field
  // the picker draws.
  const managedPlayers = roster.members
    .filter((m) => m.role === "player" && m.managedBy === "coach" && m.profileId)
    .map((m) => ({
      profileId: m.profileId as string,
      name: m.name,
      email: m.email,
      matchesPlayed: m.matchesPlayed,
      addedOn: m.addedOn,
    }));

  const unclaimed = managedPlayers.length;

  // Two of these clauses are the roster's own vocabulary rather than this
  // page's: Team Home's roster card prints the same standing in a 340px card,
  // and one spelling of "2 invites pending" is what stops two screens
  // describing the same two people differently.
  const standing = [
    playersLabel(playerCount),
    unclaimed > 0 && `${unclaimed} without an account`,
    roster.invites.length > 0 && invitesPendingLabel(roster.invites.length),
    visibility,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-6 py-8 sm:px-10">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-start lg:gap-10">
          <div>
            <h1 className="text-[30px] leading-9 font-light tracking-[-0.6px] text-[var(--ink-900)]">
              Roster
            </h1>
            <p className="mt-1 text-[12px] leading-[1.5] tabular-nums text-[var(--ink-700)]">
              {canManage
                ? standing
                : `Your coaching staff manage who is on the program and who can send video. Match results are ${visibility}.`}
            </p>
          </div>

          {canManage && (
            /* `roster` is the same array the table below already receives,
               not a projection of it — one copy in the payload, and one place
               to change when a note wants another field. Nothing is filtered:
               spots are shareable and names repeatable, which is the thing the
               two notes are about. */
            <RosterHeaderButtons
              managedPlayers={managedPlayers}
              seats={roster.seats}
              roster={roster.members}
              playersCanUpload={roster.playersCanUpload}
            />
          )}
        </div>

        <RosterTable
          members={roster.members}
          invites={roster.invites}
          canManage={canManage}
          viewerId={viewer.id}
        />

        {/* The two facts a row cannot state for itself: who may send video for
            somebody else, and when the program's analysis time comes back.
            When somebody has just claimed a profile, it also answers the
            question that raises — a coach's uploads keep their credit. */}
        <p className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
          {roster.playersCanUpload
            ? "Anyone on the team can upload for a teammate"
            : "Coaches can upload for any player"}
          {" — analysis time resets "}
          {formatResetDate(currentBillingMonth())}.
          {roster.members.some((m) => m.claimedToday) &&
            " Matches uploaded before a player claimed their profile still credit whoever added them."}
        </p>
      </div>
    </div>
  );
}
