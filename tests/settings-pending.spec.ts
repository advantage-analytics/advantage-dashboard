import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Settings pages' loading states (`loading/settings-pending.tsx`).
 * Offline: rendered to static markup and read as text — what is asserted is
 * the Carbon/DS "T26" contract, not pixels.
 *
 *   - one `role="status"` per export, labelled for the page it stands in for
 *   - every skeleton bar is hidden and pulses motion-safe
 *   - nothing interactive, no hex colour, no spinner
 */

const VIEWER = {
  id: "viewer-1",
  email: "athlete@example.com",
  name: "Jordan Lee",
  firstName: "Jordan",
  initials: "JL",
  avatarUrl: null,
  plan: "pro",
  role: "player",
  memberSince: "Jan 2025",
  onboardedAt: "2025-01-01T00:00:00Z",
};

/** Team, owner role, a college org — exercises the richest set of branches
 * (team notifications, owner-only cards, the college Conference select). */
const TEAM_WORKSPACE = {
  id: "program-1",
  kind: "team",
  name: "Test University",
  team: "mens",
  orgType: "college",
  timeZone: "America/New_York",
  role: "owner",
  mark: "TU",
  iconUrl: null,
  canSubmitVideo: true,
  programStatus: "active",
  playersCanUpload: true,
  memberUploadEnabled: true,
  uploadPolicy: "staff",
  eventsPolicy: "staff",
  myPlayerId: null,
};

const WORKSPACE_CONTEXT = {
  active: TEAM_WORKSPACE,
  available: [TEAM_WORKSPACE],
  viewer: VIEWER,
};

const loader = createLoader({
  stubs: {
    "@/components/dashboard/workspace-provider": {
      useWorkspace: () => WORKSPACE_CONTEXT,
    },
    "next/navigation": {
      useParams: () => ({ programId: "program-1" }),
    },
  },
});

const {
  SettingsAccountPending,
  SettingsPlanPending,
  SettingsPreferencesPending,
  SettingsProfilePending,
  SettingsTeamDetailPending,
  SettingsTeamsPending,
  SettingsUsagePending,
} = loader.load("src/components/dashboard/loading/settings-pending.tsx") as {
  SettingsAccountPending: React.ComponentType;
  SettingsPlanPending: React.ComponentType;
  SettingsPreferencesPending: React.ComponentType;
  SettingsProfilePending: React.ComponentType;
  SettingsTeamDetailPending: React.ComponentType;
  SettingsTeamsPending: React.ComponentType;
  SettingsUsagePending: React.ComponentType;
};

const PAGES = [
  {
    name: "SettingsAccountPending",
    component: SettingsAccountPending,
    label: "Loading account",
  },
  {
    name: "SettingsPlanPending",
    component: SettingsPlanPending,
    label: "Loading plan",
  },
  {
    name: "SettingsPreferencesPending",
    component: SettingsPreferencesPending,
    label: "Loading preferences",
  },
  {
    name: "SettingsProfilePending",
    component: SettingsProfilePending,
    label: "Loading profile",
  },
  {
    name: "SettingsTeamDetailPending",
    component: SettingsTeamDetailPending,
    label: "Loading team",
  },
  {
    name: "SettingsTeamsPending",
    component: SettingsTeamsPending,
    label: "Loading teams",
  },
  {
    name: "SettingsUsagePending",
    component: SettingsUsagePending,
    label: "Loading usage",
  },
];

const TAG = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);

for (const { name, component, label } of PAGES) {
  const html = renderToStaticMarkup(React.createElement(component));

  test(`${name}: one loading status, labelled for the page`, () => {
    expect(html.match(/role="status"/g)?.length).toBe(1);
    expect(html).toContain(`role="status" aria-label="${label}"`);
  });

  test(`${name}: nothing is interactive, no colour is a hex, nothing spins`, () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<input");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain("animate-spin");
  });

  test(`${name}: every skeleton bar is hidden and pulses motion-safe`, () => {
    // Walk the markup as a tag stack, so "under an aria-hidden ancestor" is
    // checked structurally rather than by position in the string.
    const stack: boolean[] = [];
    let bars = 0;
    for (const match of html.matchAll(TAG)) {
      const [, closing, tag, attrs, selfClosing] = match;
      if (closing) {
        stack.pop();
        continue;
      }
      const hidden = /aria-hidden="true"/.test(attrs);
      const underHidden = stack.includes(true);
      if (/\sdata-pending-bar=""/.test(attrs)) {
        bars++;
        expect(underHidden, attrs).toBe(true);
        expect(attrs).toContain("motion-safe:animate-pulse");
      }
      if (!selfClosing && !VOID.has(tag)) stack.push(hidden);
    }
    expect(bars).toBeGreaterThan(0);
    expect(html).not.toMatch(/(?<!motion-safe:)\banimate-pulse\b/);
  });
}
