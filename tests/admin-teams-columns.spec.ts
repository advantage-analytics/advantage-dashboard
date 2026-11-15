import { expect, test } from "@playwright/test";

import { TEAMS_COLUMNS } from "@/components/admin/teams-table-layout";
import {
  hoursFigureTone,
  teamFactsLine,
  teamWaitingLabel,
} from "@/components/admin/teams-table";
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

test("no open join request adds nothing to the facts line", () => {
  expect(teamWaitingLabel(row())).toBeNull();
  expect(teamFactsLine(row({ openRequestCount: 0 }))).toBe(
    "Men's · D-I · Pilot",
  );
});

test("one open join request reads as 1 waiting to join", () => {
  expect(teamWaitingLabel(row({ openRequestCount: 1 }))).toBe(
    "1 waiting to join",
  );
  expect(teamFactsLine(row({ openRequestCount: 1 }))).toBe(
    "Men's · D-I · Pilot · 1 waiting to join",
  );
});

test("several open join requests print their count", () => {
  expect(teamFactsLine(row({ openRequestCount: 3 }))).toBe(
    "Men's · D-I · Pilot · 3 waiting to join",
  );
});

test("the waiting count follows the status line when there are no facts", () => {
  expect(
    teamFactsLine(
      row({
        team: null,
        division: null,
        plan: "none",
        status: "claim_pending",
        openRequestCount: 2,
      }),
    ),
  ).toBe("Claim pending · 2 waiting to join");
});

test("an idle month draws the hours figure quiet", () => {
  expect(hoursFigureTone(0, 270000)).toBe("quiet");
});

test("ordinary use keeps the plain figure", () => {
  expect(hoursFigureTone(3600, 270000)).toBe("plain");
});

test("from 80% of the cap the figure takes emphasis", () => {
  expect(hoursFigureTone(216000, 270000)).toBe("emphasis");
  expect(hoursFigureTone(270000, 270000)).toBe("emphasis");
});
