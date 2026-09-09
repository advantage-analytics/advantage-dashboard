import { Fragment } from "react";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  isProgramStaff,
  teamLabel,
  type UploadPolicy,
} from "@/lib/workspace/types";
import { getRosterData } from "@/lib/data/team-roster-server";
import { getPendingJoinRequests } from "@/lib/data/join-requests-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { formatResetDate } from "@/lib/data/usage-format";
import { RosterView } from "@/components/dashboard/team/roster-view";
import { RosterDayZero } from "@/components/dashboard/team/roster-day-zero";
import { RosterHeaderButtons } from "@/components/dashboard/team/roster-header-buttons";
import { JoinRequestsCard } from "@/components/dashboard/team/join-requests-card";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import {
  coachedByLine,
  invitesPendingLabel,
  playersLabel,
} from "@/components/dashboard/team/roster-vocabulary";

export const metadata = { title: "Roster" };

/**
 * Everyone who plays for the program, and the order they play in.
 *
 * Platform Audit `Tb4c`, as revised in review. The page a coach lands on:
 * "Roster" in the title slot with one line of standing, a ghost Invite beside
 * the primary Add player, and one table card at full width. Nothing is
 * selected; the drawer is a consequence of a click, never furniture.
 *
 * ── The table is players only ───────────────────────────────────────────────
 * Staff used to be rows in it, told apart only by the words under their name,
 * which made a coach read as a player ranked #7 and put dashes in the `#`
 * column. They are named in a sentence under the table now — with the way
 * through to Settings › Team, where roles and seats already live — and the
 * list above stays one kind of thing: six players you rank against each other.
 *
 * ── The program's name is not in the summary ────────────────────────────────
 * The rail's workspace row carries it two inches to the left. The squad
 * qualifier stays, because the rail shows it only inside the open switcher and
 * a coach running both squads holds two workspaces with one name.
 *
 * Both ways of growing a squad sit here rather than only in Settings › Team,
 * because this is where a coach notices somebody is missing. They are different
 * actions and the page says so: Add player creates the row now and needs no
 * account; Invite sends email and spends a seat when it is accepted.
 */
/** The footer's one sentence about who may send video, per `upload_policy`. */
const UPLOAD_COPY: Record<UploadPolicy, string> = {
  owner: "Only the owner can upload for a player",
  owner_coaches: "The owner and coaches can upload for any player",
  staff: "Coaches can upload for any player",
  everyone: "Anyone on the team can upload for a teammate",
};

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
  //
  // Through the shared predicate rather than `active.role !== "player"` spelled
  // here. That hand-rolled form was right only because the redirect above has
  // already ruled out a personal workspace — right by an ordering coincidence,
  // in a file where this answer now also decides whether day zero offers a
  // coach any way in at all. `isProgramStaff` is the one spelling every other
  // team route uses, and its doc comment exists because the rail and the Team
  // page once wrote this rule in opposite directions.
  const canManage = isProgramStaff(active);

  // A deep link is the one case that lands with the drawer already open.
  const { player } = await searchParams;
  const initialSelectedId = typeof player === "string" ? player : null;

  // Two independent reads, so they go together. The join-request queue is
  // staff-only: `program_join_requests` is SECURITY DEFINER and hands a player
  // the same empty array it hands a stranger, so this only declines to ask for
  // a queue the database would refuse to fill.
  const [roster, joinRequests] = await Promise.all([
    getRosterData(active.id),
    canManage ? getPendingJoinRequests(active.id) : Promise.resolve([]),
  ]);

  // The one split this page turns on. `getRosterData` returns both kinds
  // because the footer needs the staff and Team Home needs the whole list;
  // only the table is players.
  const players = roster.members.filter((m) => m.role === "player");
  const staff = roster.members.filter((m) => m.role !== "player");

  const squad = teamLabel(active.team);

  // The rows an invitation can target: on the roster, no login yet. Derived
  // here rather than fetched again — `getRosterData` already has every field
  // the picker draws.
  const managedPlayers = players
    .filter((m) => m.managedBy === "coach" && m.profileId)
    .map((m) => ({
      profileId: m.profileId as string,
      name: m.name,
      email: m.email,
      matchesPlayed: m.matchesPlayed,
      addedOn: m.addedOn,
    }));

  const unclaimed = managedPlayers.length;

  /**
   * Day zero: nobody plays for the program, nobody has been invited, and
   * nobody has asked in.
   *
   * The last two clauses are what keep this honest. An open invitation and a
   * pending join request are both a person in flight — the table has an
   * Invited section for one and a card above it for the other — and replacing
   * a page that is holding somebody's request with "Every player starts here"
   * would lose the one thing on it waiting on a coach. Same rule as Matches,
   * where a half-finished draft keeps the list.
   *
   * The third clause is staff-only by construction, not by oversight: a player
   * never fetches the queue (it is hardcoded `[]` above), so for them this is a
   * two-clause rule. That asymmetry is correct — a player cannot act on a
   * request and is not shown one — so do not "fix" it by fetching the queue for
   * everybody.
   */
  const dayZero =
    players.length === 0 &&
    roster.invites.length === 0 &&
    joinRequests.length === 0;

  if (dayZero) {
    return (
      /* RosterView's own frame, minus the title row and the footer: the offer
         carries the page's one primary. See `RosterDayZero`. */
      <div className="flex w-full flex-1 bg-[var(--surface-card)]">
        <div className="flex min-w-0 flex-1 flex-col px-14 pt-5 pb-8">
          <RosterDayZero
            canManage={canManage}
            managedPlayers={managedPlayers}
            seats={roster.seats}
            roster={players}
            playersCanUpload={roster.playersCanUpload}
          />
        </div>
      </div>
    );
  }

  // Design 9d's receipt. Everyone who bound a login today, in the roster's own
  // order. Two people can claim on the same day; every one is named and the
  // lead pluralised.
  const claimants = players.filter((m) => m.claimedToday);
  const claimant = claimants[0];
  const soloClaim = claimants.length === 1;
  const names = claimants.map((m) => m.name);
  const claimantNames = soloClaim
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  const title = (
    /* Every element that crosses to `RosterView` as a prop carries a key —
       the fragment children below AND these two. React drops the
       "statically created" marker on JSX serialised from a server component,
       and then treats a two-child `<div>` like a keyless array. */
    <div>
      <h1 key="title" className="text-display">
        Roster
      </h1>
      {/* 9px under the title, the one gap tuned by hand — 8 reads as attached,
          12 as unrelated. The clauses are the roster's shared vocabulary, so
          Team Home's card and this page cannot describe the same two people
          differently. */}
      <p key="summary" className="text-body-sm mt-[9px]">
        {canManage ? (
          /* Keyed fragments, not bare ones. This JSX is built in a server
             component and handed to a client one as a prop; across that wire
             React loses the "statically created" marker on a fragment's
             children and warns about a keyless array. The keys cost nothing
             and make the warning impossible. */
          <>
            {squad && <Fragment key="squad">{squad} · </Fragment>}
            <span key="players" className="tabular">
              {playersLabel(players.length)}
            </span>
            {unclaimed > 0 && (
              <Fragment key="unclaimed">
                {" · "}
                <span className="tabular">{unclaimed} without an account</span>
              </Fragment>
            )}
            {roster.invites.length > 0 && (
              <Fragment key="invites">
                {" · "}
                <span className="tabular">
                  {invitesPendingLabel(roster.invites.length)}
                </span>
              </Fragment>
            )}
          </>
        ) : (
          "Your coaching staff manage who is on the program and who can send video."
        )}
      </p>
    </div>
  );

  const actions = canManage ? (
    /* `players` rather than the whole roster: Add player's duplicate note and
       the invite picker are both about people who play. */
    <RosterHeaderButtons
      managedPlayers={managedPlayers}
      seats={roster.seats}
      roster={players}
      playersCanUpload={roster.playersCanUpload}
    />
  ) : null;

  const notices = (
    <>
      {/* Somebody bound a login to a roster row today. Stated once, above the
          table, in the terms a coach worries about: the credits stayed, and a
          seat moved. Rendered only on the day, and only when there was one. */}
      {claimant && (
        <div
          key="claim"
          className="flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3"
        >
          <UserCheck
            className="size-3.5 shrink-0 text-[var(--ink-600)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-[11px] leading-[1.6] text-[var(--ink-700)]">
            {/* "their", never "her" or "his": the roster carries no pronoun for
                anybody, and a name is not one. */}
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
          thing on this page waiting on somebody. The card returns nothing when
          its list empties, which is the case this test cannot see. */}
      {canManage && joinRequests.length > 0 && (
        <JoinRequestsCard
          key="requests"
          requests={joinRequests}
          seats={roster.seats}
          programName={active.name}
          openInviteEmails={roster.invites.map((invite) => invite.email)}
        />
      )}
    </>
  );

  /* Two sentences, both left, staff first.
     The staff line carries a name and a way through, so it leads; the quota
     line is housekeeping. Right-aligning either would give prose a ragged left
     edge — the right edge is for short numeric readouts, which neither is.
     This is the shape Schedule's own footer already uses. */
  const footer = (
    <div className="flex flex-col gap-2">
      {staff.length > 0 && (
        <p
          key="staff"
          className="flex flex-wrap items-center gap-2.5 text-[11px] leading-[1.6] text-[var(--ink-600)]"
        >
          <span key="coached">{coachedByLine(staff.map((m) => m.name))}</span>
          {/* A player sees the sentence and not the link: knowing who coaches
              the program is fair, managing them is not theirs, and a link that
              refuses on click is worse than no link. */}
          {canManage && (
            <RowAction
              key="manage"
              href={`/dashboard/settings/teams/${active.id}`}
              ariaLabel="Manage staff in Team settings"
              className="whitespace-nowrap"
            >
              Manage staff →
            </RowAction>
          )}
        </p>
      )}
      <p
        key="quota"
        className="text-[11px] leading-[1.6] text-[var(--ink-500)]"
      >
        {UPLOAD_COPY[roster.uploadPolicy]}
        {" — analysis time resets "}
        {formatResetDate(currentBillingMonth())}.
        {claimant &&
          " Matches uploaded before a player claimed their profile still credit whoever added them."}
      </p>
    </div>
  );

  return (
    <RosterView
      members={players}
      invites={roster.invites}
      canManage={canManage}
      viewerId={viewer.id}
      initialSelectedId={initialSelectedId}
      title={title}
      actions={actions}
      notices={notices}
      footer={footer}
    />
  );
}
