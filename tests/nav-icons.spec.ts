import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { ChartLine, UsersRound } from "lucide-react";

import { PERSONAL_NAV, TEAM_NAV } from "@/lib/dashboard/nav";

/**
 * Nav data regression: the icon swap (ChartLine for Statistics, UsersRound
 * for Roster) and the `comingSoon` flag placement are both easy to silently
 * drift — a copy-pasted entry keeps the old icon, or a new route picks up
 * `comingSoon` it shouldn't. This locks both down against the nav data
 * directly rather than rendered output.
 */
test.describe("nav data: icons and comingSoon flags", () => {
  test("both Statistics entries use ChartLine", () => {
    const personalStatistics = PERSONAL_NAV.find(
      (link) => link.name === "Statistics",
    );
    const teamStatistics = TEAM_NAV.find((link) => link.name === "Statistics");

    expect(personalStatistics?.icon).toBe(ChartLine);
    expect(teamStatistics?.icon).toBe(ChartLine);
  });

  test("Roster uses UsersRound", () => {
    const roster = TEAM_NAV.find((link) => link.name === "Roster");
    expect(roster?.icon).toBe(UsersRound);
  });

  /**
   * The invariant, asserted against the pages rather than against a second
   * copy of the flag list: a nav entry is flagged exactly when its page
   * renders `ComingSoonPage`.
   *
   * The earlier version of this test listed the flagged hrefs and checked
   * `nav.ts` still said the same thing — a tautology that could only restate
   * whatever the nav data said, and it duly passed while Opponents rendered
   * `ComingSoonPage` unflagged. This version fails in both directions: a new
   * stub route nobody flagged, and — the one that will actually bite — a page
   * that graduates out of `ComingSoonPage` while the nav still promises
   * "coming soon".
   *
   * `BUILT_AHEAD_OF_NAV` is the one way out, and it closes itself. A feature
   * that lands over several commits has a page before it has everything the
   * page needs, and its nav entry keeps saying "coming soon" until the last
   * piece is in. An href listed here must be in exactly that state — flagged,
   * and no longer rendering `ComingSoonPage` — so the commit that unflags it
   * fails this test until the href is taken off the list. Empty is the
   * normal state.
   */
  const BUILT_AHEAD_OF_NAV: readonly string[] = [];

  test("a nav entry is flagged exactly when its page renders ComingSoonPage", () => {
    const appDir = path.join(process.cwd(), "src/app");

    /** Every `page.tsx`, keyed by the route it serves. */
    const routeToFile = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name === "page.tsx") {
          // Route groups — `(home)` — are organisational, not part of the URL.
          const route =
            "/" +
            path
              .relative(appDir, dir)
              .split(path.sep)
              .filter((segment) => !segment.startsWith("("))
              .join("/");
          routeToFile.set(route === "/" ? "/" : route, full);
        }
      }
    };
    walk(appDir);

    for (const link of [...PERSONAL_NAV, ...TEAM_NAV]) {
      const file = routeToFile.get(link.href);
      // Fail loudly rather than skipping: an href we cannot resolve to a page
      // is exactly the silent hole this test exists to close.
      expect(file, `no page.tsx serves ${link.href}`).toBeTruthy();

      const rendersComingSoon = fs
        .readFileSync(file as string, "utf8")
        .includes("ComingSoonPage");

      if (BUILT_AHEAD_OF_NAV.includes(link.href)) {
        expect(
          Boolean(link.comingSoon) && !rendersComingSoon,
          `${link.href} is listed in BUILT_AHEAD_OF_NAV but is no longer a built page behind a comingSoon flag — take it off the list`,
        ).toBe(true);
        continue;
      }

      expect(
        Boolean(link.comingSoon),
        rendersComingSoon
          ? `${link.href} renders ComingSoonPage but is not flagged comingSoon`
          : `${link.href} is flagged comingSoon but its page no longer renders ComingSoonPage`,
      ).toBe(rendersComingSoon);
    }
  });
});
