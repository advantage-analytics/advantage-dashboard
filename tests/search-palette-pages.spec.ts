import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The ⌘K palette's page shortcuts come from `nav.ts`, so they follow the rail:
 * coming-soon stubs never appear, Teams only for someone on a team, and the
 * workspace's own pages lead. The palette loads through `fixtures/vm-modules`
 * so the real `.tsx` runs offline.
 */

const loader = createLoader({
  markUnknown: true,
  stubs: {
    "next/navigation": {
      useRouter: () => ({ push() {} }),
      usePathname: () => "/",
    },
    "@/lib/supabase/client": { createClient: () => null },
  },
});

type Page = { label: string; href: string; group: string; area: string };

function pagesFor(kind: "team" | "personal", hasTeam: boolean): Page[] {
  const mod = loader.load(
    "src/components/dashboard/search/search-command-palette.tsx",
  ) as { pagesFor: (active: unknown, hasTeam: boolean) => Page[] };
  const active =
    kind === "team"
      ? { kind: "team", id: "p1", name: "UCLA", role: "coach" }
      : { kind: "personal", id: "u1", name: "Personal", role: "owner" };
  return mod.pagesFor(active, hasTeam);
}

test("a team workspace lists its live rail pages first, under its own name", () => {
  const pages = pagesFor("team", true);
  const workspace = pages.filter((page) => page.group === "workspace");
  expect(workspace.map((page) => page.label)).toEqual([
    "Team Home",
    "Matches",
    "Roster",
  ]);
  expect(workspace.every((page) => page.area === "UCLA")).toBe(true);
});

test("coming-soon pages are never shortcuts", () => {
  for (const kind of ["team", "personal"] as const) {
    const labels = pagesFor(kind, true).map((page) => page.label);
    for (const stub of ["Statistics", "Opponents", "Ask", "Schedule"]) {
      expect(labels).not.toContain(stub);
    }
  }
});

test("account pages are the settings sections, then Help Center", () => {
  const account = pagesFor("personal", true).filter(
    (page) => page.group === "account",
  );
  expect(account.map((page) => page.label)).toEqual([
    "Profile",
    "Account",
    "Preferences",
    "Usage",
    "Plan",
    "Teams",
    "Help Center",
  ]);
});

test("Teams is only listed for someone on a team", () => {
  const labels = pagesFor("personal", false).map((page) => page.label);
  expect(labels).not.toContain("Teams");
  expect(labels).toEqual([
    "Home",
    "Matches",
    "Profile",
    "Account",
    "Preferences",
    "Usage",
    "Plan",
    "Help Center",
  ]);
});
