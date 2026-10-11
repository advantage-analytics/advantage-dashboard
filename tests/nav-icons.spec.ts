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
   */
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

    /**
     * Routes whose single `page.tsx` branches on workspace kind, so the
     * file-text rule cannot decide them: the file mentions `ComingSoonPage`
     * (the team branch) yet the personal page is real. Each entry states the
     * expected `comingSoon` flag per nav list; every other route keeps the
     * file-text rule. Remove an entry when both branches agree again.
     */
    const splitByWorkspace: Record<
      string,
      { personal: boolean; team: boolean }
    > = {
      "/dashboard/opponents": { personal: false, team: true },
    };

    const lists = [
      { kind: "personal", links: PERSONAL_NAV },
      { kind: "team", links: TEAM_NAV },
    ] as const;

    for (const { kind, links } of lists) {
      for (const link of links) {
        const split = splitByWorkspace[link.href];
        if (split) {
          expect(
            Boolean(link.comingSoon),
            `${link.href} in ${kind} nav should be comingSoon=${split[kind]}`,
          ).toBe(split[kind]);
          continue;
        }
        const file = routeToFile.get(link.href);
        // Fail loudly rather than skipping: an href we cannot resolve to a page
        // is exactly the silent hole this test exists to close.
        expect(file, `no page.tsx serves ${link.href}`).toBeTruthy();

        const rendersComingSoon = fs
          .readFileSync(file as string, "utf8")
          .includes("ComingSoonPage");

        expect(
          Boolean(link.comingSoon),
          rendersComingSoon
            ? `${link.href} renders ComingSoonPage but is not flagged comingSoon`
            : `${link.href} is flagged comingSoon but its page no longer renders ComingSoonPage`,
        ).toBe(rendersComingSoon);
      }
    }
  });
});
