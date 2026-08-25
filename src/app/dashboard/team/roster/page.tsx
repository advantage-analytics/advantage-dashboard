import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { teamLabel } from "@/lib/workspace/types";
import { getRosterData } from "@/lib/data/team-roster-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { formatResetDate } from "@/lib/data/usage-format";
import { RosterTable } from "@/components/dashboard/team/roster-table";
import { RosterHeaderButtons } from "@/components/dashboard/team/roster-header-buttons";
import { RowAction } from "@/components/dashboard/schedule/row-action";

export const metadata = { title: "Roster" };

/**
 * Everyone on the program, and how each of them is playing.
 *
 * Design 9a: the program named above the title, one line of standing, and a
 * single table carrying lineup order, form, last match and first serve — with
 * the people a coach has emailed but who have not joined yet living in that
 * same list rather than in a second one below it.
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

  // The eyebrow names the workspace this roster belongs to. A coach running
  // both squads holds two of these, and "Roster" alone would not say which one
  // is on screen — the squad is the whole difference between them.
  const squad = teamLabel(active.team);
  const eyebrow = squad ? `${active.name} · ${squad}` : active.name;

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

  // Design 9d's receipt. Everyone who bound a login today, in the roster's own
  // order — the same order the table below draws them in.
  //
  // The design draws one claimer, because one is the ordinary day. Two people
  // can claim on the same day, and the rule this page follows is: **name every
  // one of them**, pluralise the lead, and sum "matches kept" across them. The
  // alternative — the most recent claimer alone — is not available anyway:
  // `claimedToday` is a boolean, `claimed_at` never reaches the client, and
  // ordering by it would need a new field this task is not adding.
  const claimants = roster.members.filter((m) => m.claimedToday);
  const claimant = claimants[0];
  const matchesKept = claimants.reduce((total, m) => total + m.matchesPlayed, 0);
  // Asked once and reused: the sentence below inflects in three places, and
  // three separate length tests are three chances to disagree.
  const soloClaim = claimants.length === 1;
  // "A", "A and B", "A, B and C" — the last separator is a word, because the
  // lead is a sentence rather than a list.
  const names = claimants.map((m) => m.name);
  const claimantNames = soloClaim
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  const standing = [
    `${playerCount} ${playerCount === 1 ? "player" : "players"}`,
    unclaimed > 0 && `${unclaimed} without an account`,
    roster.invites.length > 0 &&
      `${roster.invites.length} ${roster.invites.length === 1 ? "invite" : "invites"} pending`,
    visibility,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-6 py-8 sm:px-10">
        {/* The actions sit on the heading's baseline rather than its top edge
            (9a): the eyebrow makes the block three lines tall, and buttons
            aligned to the top of it float away from the title they act on. */}
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end lg:gap-10">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="text-display mt-3">Roster</h1>
            <p className="text-body-sm tabular mt-1">
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
            />
          )}
        </div>

        {/* The claim is the one roster change that looks like a loss until it
            is spelled out — the row a coach built now answers to somebody else.
            So it is stated once, above the table, in the terms a coach worries
            about: the history stayed, the credits stayed, and a seat moved.
            Rendered only on the day of the claim, and only when there was one:
            no claimer, no element and no gap, because `gap-5` on the column
            would otherwise reserve space for an empty box every other day. */}
        {claimant && (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
            <UserCheck
              className="mt-0.5 size-3.5 shrink-0 text-[var(--ink-600)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[11px] leading-[1.6] text-[var(--ink-700)]">
              {/* "their", never "her" or "his": the roster carries no pronoun
                  for anybody, and a name is not one. */}
              <strong className="font-medium text-[var(--ink-900)]">
                {claimantNames} claimed{" "}
                {soloClaim ? "their profile" : "their profiles"}.
              </strong>{" "}
              Same {soloClaim ? "row" : "rows"}, now self-managed —{" "}
              <span className="tabular">{matchesKept}</span>{" "}
              {matchesKept === 1 ? "match" : "matches"} kept, upload credits
              unchanged, seats{" "}
              <span className="tabular">
                {roster.seats.used} of {roster.seats.seats}
              </span>
              .
            </p>
            {/* One action can only carry one profile, so it carries the first
                name in the sentence — the topmost claimed row in the table
                below. The label stays what the design wrote; the accessible
                name says whose. */}
            <RowAction
              href={`/dashboard/team/roster/${claimant.playerId}`}
              ariaLabel={`View ${claimant.name}'s profile`}
              className="mt-px ml-auto shrink-0 whitespace-nowrap"
            >
              View profile
            </RowAction>
          </div>
        )}

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
          {claimant &&
            " Matches uploaded before a player claimed their profile still credit whoever added them."}
        </p>
      </div>
    </div>
  );
}
