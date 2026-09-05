import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { teamLabel } from "@/lib/workspace/types";
import { getRosterData } from "@/lib/data/team-roster-server";
import { getPendingJoinRequests } from "@/lib/data/join-requests-server";
import { RosterView } from "@/components/dashboard/team/roster-view";
import { RosterHeaderButtons } from "@/components/dashboard/team/roster-header-buttons";
import { JoinRequestsCard } from "@/components/dashboard/team/join-requests-card";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import {
  invitesPendingLabel,
  playersLabel,
} from "@/components/dashboard/team/roster-vocabulary";

export const metadata = { title: "Roster" };

/**
 * Everyone on the program, and how each of them is playing.
 *
 * Platform Audit `Tb4c` — the page a coach lands on: "Roster" in the title
 * slot with its summary line, ghost Invite beside primary Add player on the
 * baseline, one table card at full width on a white page. Nothing is
 * selected; the drawer (`Tb4`) is a consequence of a click, never furniture.
 *
 * The program is named in the summary line now — "Meridian State · Men's · 6
 * players · 2 invites pending" — rather than in an eyebrow above the title;
 * the audit's title-slot rule (19d) puts a top-level page's title in the
 * content with one line under it, and the eyebrow was a third line.
 *
 * Both ways of growing a squad sit here rather than only in Settings › Team,
 * because this is where a coach notices somebody is missing. They are different
 * actions and the page says so: Add player creates the row now and needs no
 * account; Invite sends email and spends a seat when it is accepted.
 */
export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string | string[] }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active, viewer } = workspace;
  // The rail only offers this destination inside a program. Somebody who typed
  // the URL from a personal workspace gets their own dashboard rather than an
  // empty roster belonging to nobody.
  if (active.kind !== "team") redirect("/dashboard");

  // A hidden control is not authorization — every write behind these re-checks
  // `is_program_staff` in SQL. This only decides what is worth rendering.
  const canManage = active.role !== "player";

  // `20f`: a deep link is the one case that lands with the drawer already open.
  const { player } = await searchParams;
  const initialSelectedId = typeof player === "string" ? player : null;

  // Two independent reads, so they go together rather than one after the other.
  // The join-request queue is staff-only: `program_join_requests` is SECURITY
  // DEFINER and hands a player the same empty array it hands a stranger; this
  // just declines to ask for a queue the database would refuse to fill.
  const [roster, joinRequests] = await Promise.all([
    getRosterData(active.id),
    canManage ? getPendingJoinRequests(active.id) : Promise.resolve([]),
  ]);

  const squad = teamLabel(active.team);
  const playerCount = roster.members.filter((m) => m.role === "player").length;

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
  // order — the same order the table below draws them in. Two people can claim
  // on the same day; every one of them is named and the lead pluralised.
  const claimants = roster.members.filter((m) => m.claimedToday);
  const claimant = claimants[0];
  const soloClaim = claimants.length === 1;
  const names = claimants.map((m) => m.name);
  const claimantNames = soloClaim
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  const title = (
    /* The actions sit on the title block's baseline — `Tb4`'s
       `align-items:flex-end` with 10px between everything in the row. */
    <div className="flex items-end gap-2.5">
      <div>
        <h1 className="text-display">Roster</h1>
        {/* 9px under the title, the one gap tuned by hand (Team Home carries
            the same number): 8 reads as attached, 12 as unrelated. The
            clauses are the roster's shared vocabulary — Team Home's card
            prints the same standing in a 340px card — with every count in
            tabular figures. */}
        <p className="text-body-sm mt-[9px]">
          {canManage ? (
            <>
              {active.name}
              {squad && <> · {squad}</>}
              {" · "}
              <span className="tabular">{playersLabel(playerCount)}</span>
              {unclaimed > 0 && (
                <>
                  {" · "}
                  <span className="tabular">{unclaimed} without an account</span>
                </>
              )}
              {roster.invites.length > 0 && (
                <>
                  {" · "}
                  <span className="tabular">
                    {invitesPendingLabel(roster.invites.length)}
                  </span>
                </>
              )}
            </>
          ) : (
            "Your coaching staff manage who is on the program and who can send video."
          )}
        </p>
      </div>
      <div className="flex-1" />
      {canManage && (
        /* `roster` is the same array the table receives, not a projection of
           it — one copy in the payload, and one place to change when a note
           wants another field. */
        <RosterHeaderButtons
          managedPlayers={managedPlayers}
          seats={roster.seats}
          roster={roster.members}
          playersCanUpload={roster.playersCanUpload}
        />
      )}
    </div>
  );

  const notices = (
    <>
      {/* Somebody bound a login to a roster row today. Stated once, above the
          table, in the terms a coach worries about: the credits stayed, and a
          seat moved. Rendered only on the day, and only when there was one. */}
      {claimant && (
        <div className="flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
          <UserCheck
            className="size-3.5 shrink-0 text-[var(--ink-600)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-[11px] leading-[1.6] text-[var(--ink-700)]">
            {/* "their", never "her" or "his": the roster carries no pronoun
                for anybody, and a name is not one. */}
            <strong className="font-medium text-[var(--ink-900)]">
              {claimantNames} now{" "}
              {soloClaim
                ? "manages their own profile"
                : "manage their own profiles"}
              .
            </strong>{" "}
            Upload credits unchanged, seats{" "}
            <span className="tabular">
              {roster.seats.used} of {roster.seats.seats}
            </span>
            .
          </p>
          <RowAction
            href={`/dashboard/team/roster/${claimant.playerId}`}
            ariaLabel={`View ${claimant.name}'s profile`}
            className="ml-auto shrink-0 whitespace-nowrap"
          >
            View profile
          </RowAction>
        </div>
      )}

      {/* Who has asked to come in — above the table, because it is the one
          thing on this page waiting on somebody. The card itself also returns
          nothing when its list empties. */}
      {canManage && joinRequests.length > 0 && (
        <JoinRequestsCard
          requests={joinRequests}
          seats={roster.seats}
          programName={active.name}
          openInviteEmails={roster.invites.map((invite) => invite.email)}
        />
      )}
    </>
  );

  return (
    <RosterView
      members={roster.members}
      invites={roster.invites}
      canManage={canManage}
      viewerId={viewer.id}
      initialSelectedId={initialSelectedId}
      title={title}
      notices={notices}
    />
  );
}
