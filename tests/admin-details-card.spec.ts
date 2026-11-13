import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminTeamProgram } from "@/lib/data/admin-team-server";
import type { AdminTeamJoinLink } from "@/lib/data/admin-team-links";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#details` — the Details section (T18, reshaped in T12 to
 * a row of facts with one `Edit details` and the two join links).
 *
 * Rendered offline through `fixtures/vm-modules`. The card pulls in the T10
 * `AdminTeamDetailsDialog` to back its `Edit` button, and that dialog in turn
 * calls the `admin-team-actions` server action module — a `"use server"` file
 * that cannot be `require()`d directly — so that one module is stubbed, same
 * as `admin-conference-card.spec.ts` stubs its own action module. The dialog
 * renders closed (`open=false`) in every case here, so Radix's `DialogContent`
 * never mounts and nothing about the dialog's own body is under test; this
 * spec is only the section's facts, links and its `Edit details` trigger.
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
    AdminDetailsCard: React.ComponentType<{
      program: AdminTeamProgram;
      playerLink: AdminTeamJoinLink | null;
      coachLink: string | null;
      conference?: React.ReactNode;
    }>;
  };
}

function html(
  program: AdminTeamProgram,
  links: {
    playerLink?: AdminTeamJoinLink | null;
    coachLink?: string | null;
    conference?: React.ReactNode;
  } = {},
): string {
  const { AdminDetailsCard } = load();
  return renderToStaticMarkup(
    React.createElement(AdminDetailsCard, {
      program,
      playerLink: links.playerLink ?? null,
      coachLink: links.coachLink ?? null,
      conference: links.conference,
    }),
  );
}

// Fake values only — never a real token.
const PLAYER_LINK: AdminTeamJoinLink = {
  url: "https://example.test/join/fake-token",
  mode: "open",
};
const COACH_LINK = "https://example.test/claim/dartmouth-college-womens";

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
  playersCanShareVideo: false,
  crestPath: null,
  timeZone: "America/New_York",
  status: "active",
  orgType: "college",
  pilotEligible: false,
  primaryDomain: "dartmouth.edu",
  createdAt: "2026-01-01T00:00:00Z",
  claimedAt: "2026-02-01T00:00:00Z",
  crestUrl: null,
};

test.describe("AdminDetailsCard", () => {
  test("titles the section and lists the facts in order with mapped labels", () => {
    const markup = html(BASE);
    const out = text(markup);

    expect(out).toContain("Details");
    expect(out.match(/Edit details/g)).toHaveLength(1);

    const order = ["Time zone", "Who can upload", "Roster", "Staff page"];
    let cursor = -1;
    for (const label of order) {
      const at = out.indexOf(label);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }

    expect(out).toContain("dartmouthsports.com");
    expect(out).toContain("Eastern");
    expect(out).toContain("Everyone on the team");
    expect(out).toContain("Private");
    // The schedule is switched off, so who edits it is not a fact.
    expect(out).not.toContain("Who edits the schedule");
    expect(out).not.toContain("All staff");

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

  test("the upload policy maps through uploadPolicyLabel, not a literal", () => {
    const out = text(
      html({ ...BASE, uploadPolicy: "owner_coaches", eventsPolicy: "owner" }),
    );
    expect(out).toContain("Owner and coaches");
    expect(out).not.toContain("Owner only");
  });

  test("no staff page leaves the fact out rather than printing a dash", () => {
    const out = text(html({ ...BASE, staffPageUrl: null }));
    expect(out).not.toContain("Staff page");
    expect(out).not.toContain("—");
    expect(out).not.toContain("null");
  });

  test("the conference slot is drawn first in the facts row", () => {
    const markup = html(BASE, {
      conference: React.createElement(
        "div",
        { id: "conference" },
        React.createElement("dt", null, "Conference"),
        React.createElement("dd", null, "Ivy League"),
      ),
    });
    const out = text(markup);
    expect(out.indexOf("Conference")).toBeGreaterThan(-1);
    expect(out.indexOf("Conference")).toBeLessThan(out.indexOf("Time zone"));
    expect(markup).toMatch(/<dl[^>]*><div id="conference">/);
  });

  test("both links print with a Copy each, worded for the player link's mode", () => {
    const open = text(
      html(BASE, { playerLink: PLAYER_LINK, coachLink: COACH_LINK }),
    );
    expect(open).toContain("Player link, anyone can join");
    expect(open).toContain(PLAYER_LINK.url);
    expect(open).toContain("Coach link, recorded contacts");
    expect(open).toContain(COACH_LINK);
    expect(open.match(/\bCopy\b/g)).toHaveLength(2);

    const approve = text(
      html(BASE, {
        playerLink: { ...PLAYER_LINK, mode: "approve" },
        coachLink: COACH_LINK,
      }),
    );
    expect(approve).toContain("Player link, joins with approval");
    expect(approve).not.toContain("anyone can join");
  });

  test("a missing link is omitted, not printed empty", () => {
    const none = text(html(BASE));
    expect(none).not.toContain("Player link");
    expect(none).not.toContain("Coach link");
    expect(none).not.toContain("Copy");

    const coachOnly = text(html(BASE, { coachLink: COACH_LINK }));
    expect(coachOnly).not.toContain("Player link");
    expect(coachOnly).toContain("Coach link, recorded contacts");
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
