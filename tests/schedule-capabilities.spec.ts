import { expect, test } from "@playwright/test";

import {
  canUploadForProgram,
  scheduleCapabilitiesFor,
  type EventsPolicy,
  type ProgramRole,
  type ScheduleCapabilities,
  type Workspace,
} from "@/lib/workspace/types";

function workspace(
  role: ProgramRole,
  kind: Workspace["kind"] = "team",
  eventsPolicy: EventsPolicy = "staff",
): Workspace {
  return {
    id: "schedule-capabilities",
    kind,
    name: kind === "team" ? "Westfield University" : "Personal",
    team: kind === "team" ? "mens" : null,
    orgType: kind === "team" ? "college" : null,
    timeZone: "UTC",
    role,
    mark: "W",
    programStatus: "active",
    canSubmitVideo: true,
    playersCanUpload: kind === "team",
    memberUploadEnabled: true,
    uploadPolicy: "everyone",
    eventsPolicy,
    myPlayerId: role === "player" && kind === "team" ? "player-1" : null,
  };
}

const TEAM_CAPABILITIES: Record<ProgramRole, ScheduleCapabilities> = {
  owner: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canScore: true,
    canDelete: true,
  },
  coach: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canScore: true,
    canDelete: true,
  },
  staff: {
    canView: true,
    canCreate: true,
    canEdit: true,
    canScore: true,
    canDelete: false,
  },
  player: {
    canView: true,
    canCreate: false,
    canEdit: false,
    canScore: false,
    canDelete: false,
  },
};

test.describe("team Schedule capabilities", () => {
  for (const role of Object.keys(TEAM_CAPABILITIES) as ProgramRole[]) {
    test(`${role} receives the intended capabilities`, () => {
      expect(scheduleCapabilitiesFor(workspace(role))).toEqual(
        TEAM_CAPABILITIES[role],
      );
    });
  }

  test("personal workspaces grant no team Schedule capabilities", () => {
    expect(scheduleCapabilitiesFor(workspace("owner", "personal"))).toEqual({
      canView: false,
      canCreate: false,
      canEdit: false,
      canScore: false,
      canDelete: false,
    });
  });

  test("a player's upload entitlement does not grant scheduled-line writes", () => {
    const player = workspace("player");

    expect(canUploadForProgram(player)).toBe(true);
    expect(scheduleCapabilitiesFor(player)).toMatchObject({
      canCreate: false,
      canEdit: false,
      canScore: false,
      canDelete: false,
    });
  });

  test("the events policy narrows who may manage the schedule", () => {
    const manages = (policy: EventsPolicy) =>
      (["owner", "coach", "staff", "player"] as const).filter(
        (role) =>
          scheduleCapabilitiesFor(workspace(role, "team", policy)).canCreate,
      );

    expect(manages("owner")).toEqual(["owner"]);
    expect(manages("owner_coaches")).toEqual(["owner", "coach"]);
    expect(manages("staff")).toEqual(["owner", "coach", "staff"]);

    // Deleting keeps its own owner-or-coach rung under every policy.
    expect(
      scheduleCapabilitiesFor(workspace("coach", "team", "owner")).canDelete,
    ).toBe(false);
    expect(
      scheduleCapabilitiesFor(workspace("owner", "team", "owner")).canDelete,
    ).toBe(true);
  });
});
