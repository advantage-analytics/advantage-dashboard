import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProgramUsage } from "@/lib/data/usage-server";
import type { ProgramOrgType } from "@/lib/workspace/types";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#usage` — the "Usage in <month>" rail card (T16).
 *
 * Rendered offline through `fixtures/vm-modules` with nothing stubbed, so the
 * copy, the figures and the footer come from the real card and the real
 * `getMonthlyCapSeconds` / `quotaTierFor`.
 */

type Tier = { orgType: ProgramOrgType | null; pilotEligible?: boolean };

type CardProps = Tier & {
  usage: ProgramUsage;
  pilotEligible: boolean;
  members: { userId: string; avatarUrl: string | null }[];
};

function load() {
  const loader = createLoader();
  return loader.load("src/components/admin/admin-usage-card.tsx") as {
    AdminUsageCard: React.ComponentType<CardProps>;
    poolRuleNote: (tier: Tier) => string;
  };
}

function render(props: CardProps): string {
  const { AdminUsageCard } = load();
  return text(renderToStaticMarkup(React.createElement(AdminUsageCard, props)));
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const SEPTEMBER: ProgramUsage = {
  usedSeconds: 22.6 * 3600 + 17.1 * 3600,
  capSeconds: 75 * 3600,
  billingMonth: "2026-09-01",
  lines: [
    {
      userId: "u1",
      name: "Avery Lin",
      usedSeconds: 22.6 * 3600,
      matchCount: 5,
    },
    {
      userId: "u2",
      name: "Jordan Park",
      usedSeconds: 17.1 * 3600,
      matchCount: 4,
    },
  ],
};

test("titles the month and counts the videos from data.usage", () => {
  const out = render({
    usage: SEPTEMBER,
    orgType: "college",
    pilotEligible: false,
    members: [],
  });
  expect(out).toContain("Usage in September");
  expect(out).toContain("9 videos");
});

test("draws one row per member with their hours", () => {
  const out = render({
    usage: SEPTEMBER,
    orgType: "college",
    pilotEligible: false,
    members: [],
  });
  expect(out).toContain("AL Avery Lin 22.6 h");
  expect(out).toContain("JP Jordan Park 17.1 h");
  // No per-member cap: team uploads never draw an individual allowance.
  expect(out).not.toMatch(/of 2 h/);
});

test("a quiet month keeps the card and says so", () => {
  const out = render({
    usage: { ...SEPTEMBER, usedSeconds: 0, lines: [] },
    orgType: "college",
    pilotEligible: false,
    members: [],
  });
  expect(out).toContain("Usage in September");
  expect(out).toContain("0 videos");
  expect(out).toContain("No video analysed yet this month.");
});

test("the footer never prints the canvas' false ordering", () => {
  const { poolRuleNote } = load();
  for (const orgType of [
    "college",
    "club",
    "high_school",
    "academy",
    "other",
    null,
  ] as const) {
    expect(poolRuleNote({ orgType })).not.toContain("before the team pool");
  }
  const onPool =
    "Uploads here draw on the team pool. A member’s own 2 h covers their personal uploads only.";
  const shared =
    "This team is on the individual 2 h figure, shared by every member.";
  expect(poolRuleNote({ orgType: "college" })).toBe(onPool);
  expect(poolRuleNote({ orgType: "club" })).toBe(shared);
  expect(poolRuleNote({ orgType: null })).toBe(shared);
  // The admin-granted half of the tier: an eligible club reads as a college.
  expect(poolRuleNote({ orgType: "club", pilotEligible: true })).toBe(onPool);
  expect(poolRuleNote({ orgType: "club", pilotEligible: false })).toBe(shared);
});
