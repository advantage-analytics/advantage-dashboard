import { expect, test } from "@playwright/test";

import { TEAMS_COLUMNS } from "@/components/admin/teams-table-layout";
import { teamFactsLine } from "@/components/admin/teams-table";
import type { AdminTeamRow } from "@/lib/data/admin-teams-server";

/**
 * Admin › Teams (T9, AdminTeams artboard) — pure, no I/O.
 *
 * The table is Program · Members · Video hours this month · Owner. Division,
 * Conference, State and Plan left as columns; squad, division and "Pilot"
 * read as one facts line under the program's name.
 */

const row = (over: Partial<AdminTeamRow> = {}): AdminTeamRow => ({
  id: "p1",
  name: "Westbrook University",
  team: "mens",
  orgType: "college",
  division: "D-I",
  conference: "Ivy League",
  state: "NJ",
  status: "active",
  crestUrl: null,
  memberCount: 14,
  ownerName: "R. Dunn",
  ownerPhotoUrl: null,
  claimedAt: "2026-09-01T00:00:00Z",
  plan: "pilot",
  openRequestCount: 0,
  videoUsedSeconds: 3600,
  videoCapSeconds: 72000,
  ...over,
});

test("the columns are exactly Program, Members, Video hours this month, Owner", () => {
  expect(TEAMS_COLUMNS.map((column) => column.label)).toEqual([
    "Program",
    "Members",
    "Video hours this month",
    "Owner",
  ]);
});

test("squad, division and Pilot print as one facts line", () => {
  expect(teamFactsLine(row())).toBe("Men's · D-I · Pilot");
});

test("a program outside the pilot leaves Pilot off", () => {
  expect(teamFactsLine(row({ plan: "approve", team: "womens" }))).toBe(
    "Women's · D-I",
  );
});

test("a row with no facts says where it stands instead", () => {
  expect(
    teamFactsLine(
      row({
        team: null,
        division: null,
        plan: "none",
        status: "claim_pending",
      }),
    ),
  ).toBe("Claim pending");
});
