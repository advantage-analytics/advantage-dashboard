import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminTeamProgram } from "@/lib/data/admin-team-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#details` — the Details rail card (T18).
 *
 * Rendered offline through `fixtures/vm-modules`. The card pulls in the T10
 * `AdminTeamDetailsDialog` to back its `Edit` button, and that dialog in turn
 * calls the `admin-team-actions` server action module — a `"use server"` file
 * that cannot be `require()`d directly — so that one module is stubbed, same
 * as `admin-conference-card.spec.ts` stubs its own action module. The dialog
 * renders closed (`open=false`) in every case here, so Radix's `DialogContent`
 * never mounts and nothing about the dialog's own body is under test; this
 * spec is only the card's six rows and its `Edit` trigger.
 */

function load() {
  const loader = createLoader({
    stubs: {
      "@/lib/services/programs/admin-team-actions": {
        adminUpdateProgramDetails: async () => ({ ok: true }),
      },
    },
  });
  return loader.load("src/components/admin/admin-details-card.tsx") as {
    AdminDetailsCard: React.ComponentType<{ program: AdminTeamProgram }>;
  };
}

function html(program: AdminTeamProgram): string {
  const { AdminDetailsCard } = load();
  return renderToStaticMarkup(
    React.createElement(AdminDetailsCard, { program }),
  );
}

function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

const BASE: AdminTeamProgram = {
  id: "dartmouth",
  name: "Dartmouth College (Women's)",
  programKey: "dartmouth-college-womens",
  schoolName: "Dartmouth College",
  team: "womens",
  conference: "Ivy League (IVY)",
  division: "D1",
  city: "Hanover",
  state: "NH",
  staffPageUrl: "https://dartmouthsports.com/sports/wten/coaches",
  rosterPublic: false,
  homeVenue: "Boss Tennis Center",
  defaultSurface: "hard",
  playersCanUpload: true,
  uploadPolicy: "everyone",
  eventsPolicy: "staff",
  crestPath: null,
  timeZone: "America/New_York",
  status: "active",
  orgType: "college",
  primaryDomain: "dartmouth.edu",
  createdAt: "2026-01-01T00:00:00Z",
  claimedAt: "2026-02-01T00:00:00Z",
  crestUrl: null,
};

test.describe("AdminDetailsCard", () => {
  test("titles the card and lists the six rows in order with mapped labels", () => {
    const markup = html(BASE);
    const out = text(markup);

    expect(out).toContain("Details");
    expect(out).toContain("Edit");

    const order = [
      "Program key",
      "Staff page",
      "Time zone",
      "Who can upload",
      "Who edits the schedule",
      "Roster",
    ];
    let cursor = -1;
    for (const label of order) {
      const at = out.indexOf(label);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }

    expect(out).toContain("dartmouth-college-womens");
    expect(out).toContain("dartmouthsports.com");
    expect(out).toContain("Eastern");
    expect(out).toContain("Everyone on the team");
    expect(out).toContain("All staff");
    expect(out).toContain("Private");

    expect(markup).toContain(
      'href="https://dartmouthsports.com/sports/wten/coaches"',
    );
    expect(out).not.toContain("/sports/wten/coaches");
  });

  test("roster prints Public when programs.roster_public is true", () => {
    const out = text(html({ ...BASE, rosterPublic: true }));
    expect(out).toContain("Public");
    expect(out).not.toContain("Private");
  });

  test("upload and events policies map through uploadPolicyLabel, not a literal", () => {
    const out = text(
      html({ ...BASE, uploadPolicy: "owner_coaches", eventsPolicy: "owner" }),
    );
    expect(out).toContain("Owner and coaches");
    expect(out).toContain("Owner only");
  });

  test("a null program key and a null staff page each print an em dash", () => {
    const out = text(html({ ...BASE, programKey: null, staffPageUrl: null }));
    expect(out).toContain("—");
    expect(out).not.toContain("null");
  });

  test("an unrecognised time zone prints the raw IANA string verbatim", () => {
    const out = text(html({ ...BASE, timeZone: "Europe/London" }));
    expect(out).toContain("Europe/London");
  });

  test("a staff page URL with no scheme falls back to the raw string as text", () => {
    const out = text(html({ ...BASE, staffPageUrl: "dartmouthsports.com" }));
    expect(out).toContain("dartmouthsports.com");
    const markup = html({ ...BASE, staffPageUrl: "dartmouthsports.com" });
    expect(markup).not.toContain("<a ");
  });

  test("a non-http scheme is never rendered as a link", () => {
    for (const staffPageUrl of [
      "javascript://alert(1)",
      "JavaScript://%0aalert(1)",
      "data://text/html,hi",
    ]) {
      const markup = html({ ...BASE, staffPageUrl });
      expect(markup).not.toContain("<a ");
      expect(markup).not.toMatch(/href=/);
    }
  });
});
