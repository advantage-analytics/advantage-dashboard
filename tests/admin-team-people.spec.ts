import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { adminPeopleRows } from "@/lib/data/admin-team-people";
import type {
  AdminTeamInvite,
  AdminTeamJoinRequest,
  AdminTeamMember,
} from "@/lib/data/admin-team-server";
import type { AdminTeamRosterPlayer } from "@/lib/data/admin-team-roster";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#people` — the one People list (`TeamDetail.dc.html`).
 *
 * Join requests first, then members and roster players together (a profile an
 * account has claimed drawn once, as that member's row), then the invitations
 * nobody has accepted yet. The only account state a row prints is
 * "No account · Invite", and nothing prints a last-activity time. The rows are
 * a pure function (`admin-team-people.ts`); the render goes through
 * `fixtures/vm-modules` with the router and the server actions stubbed.
 */

const member = (
  userId: string,
  name: string,
  role: AdminTeamMember["role"],
): AdminTeamMember => ({
  userId,
  name,
  email: `${userId}@example.com`,
  role,
  avatarUrl: null,
  uploadEnabled: true,
});

const player = (
  id: string,
  name: string,
  lineupSpot: number | null,
  claimedUserId: string | null,
): AdminTeamRosterPlayer => ({
  id,
  name,
  lineupSpot,
  classYear: null,
  email: null,
  hasAccount: claimedUserId !== null,
  claimedUserId,
  matchCount: 0,
  lastMatch: null,
});

const request: AdminTeamJoinRequest = {
  id: "r1",
  email: "riley@example.com",
  name: "Riley Request",
  note: null,
  role: "player",
  createdAt: "2026-10-01T00:00:00Z",
};

function invite(expired: boolean): AdminTeamInvite {
  return {
    id: expired ? "i-old" : "i-live",
    email: expired ? "old@example.com" : "live@example.com",
    role: "player",
    createdAt: "2026-09-01T12:00:00Z",
    invitedBy: null,
    playerId: null,
    expiresAt: "2026-09-08T12:00:00Z",
    invitedByName: null,
    expired,
  };
}

/**
 * The fixture: an owner, a coach who also has a roster profile, a player
 * member who claimed spot 1, a roster profile nobody claimed, and a player
 * member with no profile at all.
 */
const members = [
  member("u-player", "Paula Plays", "player"),
  member("u-owner", "Olive Owner", "owner"),
  member("u-loose", "Lou Loose", "player"),
  member("u-coach", "Casey Coach", "coach"),
];
const roster = [
  player("pp-paula", "Paula Plays", 1, "u-player"),
  player("pp-nora", "Nora Noaccount", 2, null),
  player("pp-casey", "Casey Coach", null, "u-coach"),
];

test.describe("adminPeopleRows", () => {
  const rows = adminPeopleRows({
    joinRequests: [request],
    members,
    roster,
    invites: [invite(false)],
  });

  test("requests, then people, then invitations", () => {
    expect(rows.map((row) => row.key)).toEqual([
      "request:r1",
      "member:u-owner",
      "member:u-coach",
      "member:u-player",
      "player:pp-nora",
      "member:u-loose",
      "invite:i-live",
    ]);
  });

  test("a roster profile claimed by a member appears once, on the member's row", () => {
    const paula = rows.filter(
      (row) =>
        (row.kind === "member" && row.member.name === "Paula Plays") ||
        (row.kind === "player" && row.player.name === "Paula Plays"),
    );
    expect(paula).toHaveLength(1);
    expect(paula[0]).toMatchObject({
      kind: "member",
      player: { id: "pp-paula" },
    });

    // A coach who also plays is drawn once, among the staff.
    const casey = rows.filter((row) => row.key.includes("casey"));
    expect(casey).toEqual([]);
    expect(rows.find((row) => row.key === "member:u-coach")).toMatchObject({
      player: { id: "pp-casey" },
    });
  });

  test("a claimed profile whose account is no member stays a player row", () => {
    const out = adminPeopleRows({
      joinRequests: [],
      members: [],
      roster: [player("pp-gone", "Gina Gone", 1, "u-gone")],
      invites: [],
    });
    expect(out.map((row) => row.key)).toEqual(["player:pp-gone"]);
  });
});

type ListProps = {
  programId: string;
  programName: string;
  joinRequests: readonly AdminTeamJoinRequest[];
  members: readonly AdminTeamMember[];
  roster: readonly AdminTeamRosterPlayer[];
  invites: readonly AdminTeamInvite[];
  seats: { seats: number; used: number; pending: number };
  claim: null;
};

function html(props: Partial<ListProps>): string {
  const loader = createLoader({
    stubs: {
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/lib/services/programs/admin-team-actions": {
        adminAddProgramPlayer: async () => ({ ok: true }),
        adminInviteMember: async () => ({ ok: true }),
        adminResolveJoinRequest: async () => ({ ok: true }),
        adminRevokeInvite: async () => ({ ok: true }),
        adminSetProgramMemberRole: async () => ({ ok: true }),
        adminSetMemberUploadEnabled: async () => ({ ok: true }),
        adminTransferProgramOwnership: async () => ({ ok: true }),
      },
      // A closed dialog draws nothing; its own specs cover it.
      "@/components/dashboard/team/add-player-dialog": {
        AddPlayerDialog: () => null,
      },
    },
  });
  const { AdminPeopleList } = loader.load(
    "src/components/admin/admin-people-card.tsx",
  ) as { AdminPeopleList: React.ComponentType<ListProps> };
  return renderToStaticMarkup(
    React.createElement(AdminPeopleList, {
      programId: "p1",
      programName: "ZZ Test Program",
      joinRequests: [],
      members: [],
      roster: [],
      invites: [],
      seats: { seats: 20, used: 0, pending: 0 },
      claim: null,
      ...props,
    }),
  );
}

test.describe("AdminPeopleList", () => {
  const out = html({
    joinRequests: [request],
    members,
    roster,
    invites: [invite(false)],
  });

  test("draws the request before anyone on the program", () => {
    const at = (text: string) => {
      const index = out.indexOf(text);
      expect(index, text).toBeGreaterThan(-1);
      return index;
    };
    expect(at("Riley Request")).toBeLessThan(at("Olive Owner"));
    expect(at(">Approve<")).toBeLessThan(at("Olive Owner"));
    expect(at(">Decline<")).toBeLessThan(at("Olive Owner"));
    expect(at("Olive Owner")).toBeLessThan(at("Nora Noaccount"));
    expect(at("Nora Noaccount")).toBeLessThan(at("live@example.com"));
  });

  test("a claimed profile's name is drawn once", () => {
    // As text: the upload switch's label names her too.
    expect(out.split(">Paula Plays<").length - 1).toBe(1);
  });

  test("the header carries Add player and Invite people", () => {
    expect(out).toContain(">Add player<");
    expect(out).toContain(">Invite people<");
  });

  test("the one account state is 'No account · Invite', on the unclaimed profile only", () => {
    expect(out.split("No account").length - 1).toBe(1);
    expect(out).toContain('aria-label="Invite Nora Noaccount"');
    for (const word of ["Active", "Joined", "Not claimed", "has an account"]) {
      expect(out).not.toContain(word);
    }
  });

  test("a live invitation reads 'expires'", () => {
    expect(html({ invites: [invite(false)] })).toContain("· expires ");
  });

  test("an expired invitation reads 'expired'", () => {
    const expired = html({ invites: [invite(true)] });
    expect(expired).toContain("· expired ");
    expect(expired).not.toContain("· expires ");
  });
});
