/**
 * The Admin › Teams detail page's People list, as rows — pure, so
 * `tests/admin-team-people.spec.ts` can hold the order and the merge without a
 * database or a render.
 *
 * `TeamDetail.dc.html` draws one list where the page used to carry three
 * cards (Requests, People, Roster): join requests first, then everyone on the
 * program, then the invitations nobody has accepted yet.
 *
 * ── Members and roster players are different things ─────────────────────────
 * A member is a `program_members` row: a login with a role. A roster player is
 * a `program_players` row: a coach-managed profile that holds matches whether
 * or not anybody ever signs in. An athlete can be either or both — both when
 * their account has claimed the profile (`claimed_by_user_id`). The list draws
 * that pair as ONE row, the member's, carrying the profile beside it; drawing
 * both would tell an admin a program has two people where it has one.
 *
 * A claimed profile whose account is not (or no longer) a member stays a
 * player row: the profile is still on the roster, and the account simply
 * holds no role here.
 */

import type {
  AdminTeamInvite,
  AdminTeamJoinRequest,
  AdminTeamMember,
} from "@/lib/data/admin-team-server";
import type { AdminTeamRosterPlayer } from "@/lib/data/admin-team-roster";

export type AdminPeopleRow =
  | { kind: "request"; key: string; request: AdminTeamJoinRequest }
  | {
      kind: "member";
      key: string;
      member: AdminTeamMember;
      /** The roster profile this account has claimed, if any. */
      player: AdminTeamRosterPlayer | null;
    }
  | { kind: "player"; key: string; player: AdminTeamRosterPlayer }
  | { kind: "invite"; key: string; invite: AdminTeamInvite };

/** Owner, then coaches, then staff — the order a program reads its staff. */
const STAFF_RANK: Record<string, number> = { owner: 0, coach: 1, staff: 2 };

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * Requests, then people, then invitations.
 *
 * People are the staff (owner, coaches, staff, by role then name), then the
 * players in roster order — lineup spot, null spots last, which is the order
 * `rosterWithMatchCounts` already returns — then any player member with no
 * roster profile, by name. Each member appears once, each roster profile
 * appears once, and a profile claimed by a member is folded into that
 * member's row wherever the member sits (a coach who also plays is drawn once,
 * among the staff).
 */
export function adminPeopleRows(input: {
  joinRequests: readonly AdminTeamJoinRequest[];
  members: readonly AdminTeamMember[];
  roster: readonly AdminTeamRosterPlayer[];
  invites: readonly AdminTeamInvite[];
}): AdminPeopleRow[] {
  const { joinRequests, members, roster, invites } = input;

  const memberById = new Map(members.map((member) => [member.userId, member]));
  // The profile each member has claimed. A broken claim — two live profiles
  // bound to one account — keeps the first in roster order; the second still
  // draws, as a player row, so nothing on the roster goes missing.
  const profileOf = new Map<string, AdminTeamRosterPlayer>();
  for (const player of roster) {
    const userId = player.claimedUserId;
    if (userId && memberById.has(userId) && !profileOf.has(userId)) {
      profileOf.set(userId, player);
    }
  }
  const folded = new Set([...profileOf.values()].map((player) => player.id));

  const memberRow = (member: AdminTeamMember): AdminPeopleRow => ({
    kind: "member",
    key: `member:${member.userId}`,
    member,
    player: profileOf.get(member.userId) ?? null,
  });

  const staff = members
    .filter((member) => member.role !== "player")
    .sort(
      (a, b) =>
        (STAFF_RANK[a.role] ?? 3) - (STAFF_RANK[b.role] ?? 3) || byName(a, b),
    )
    .map(memberRow);

  const shown = new Set(
    members
      .filter((member) => member.role !== "player")
      .map((member) => member.userId),
  );

  const players: AdminPeopleRow[] = [];
  for (const player of roster) {
    if (!folded.has(player.id)) {
      players.push({ kind: "player", key: `player:${player.id}`, player });
      continue;
    }
    const member = memberById.get(player.claimedUserId as string);
    if (member && !shown.has(member.userId)) {
      shown.add(member.userId);
      players.push(memberRow(member));
    }
  }

  const unrostered = members
    .filter((member) => !shown.has(member.userId))
    .sort(byName)
    .map(memberRow);

  return [
    ...joinRequests.map((request): AdminPeopleRow => ({
      kind: "request",
      key: `request:${request.id}`,
      request,
    })),
    ...staff,
    ...players,
    ...unrostered,
    ...invites.map((invite): AdminPeopleRow => ({
      kind: "invite",
      key: `invite:${invite.id}`,
      invite,
    })),
  ];
}

/** How many people the list holds — members plus unfolded roster profiles. */
export function adminPeopleCount(rows: readonly AdminPeopleRow[]): number {
  return rows.filter((row) => row.kind === "member" || row.kind === "player")
    .length;
}
