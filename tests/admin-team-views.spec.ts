import { expect, test } from "@playwright/test";

import {
  TEAM_MAIN_SECTIONS,
  TEAM_RAIL_SECTIONS,
  TEAM_VIEWS,
  teamRailFor,
  teamViewFrom,
  teamViewTitle,
} from "@/components/admin/team-sections";

/**
 * Admin › Teams › the pill row filters the main column (decision
 * 2026-09-26): Overview shows every main card, each other view only its own,
 * and the rail stays — minus any rail card the view has moved into the main
 * column, so nothing renders twice.
 */
test.describe("admin team views", () => {
  test("no or unknown ?view= is Overview, with every main card", () => {
    for (const value of [null, undefined, "", "bogus"]) {
      const view = teamViewFrom(value);
      expect(view.id).toBe("overview");
      expect(view.main).toEqual(TEAM_MAIN_SECTIONS);
    }
  });

  test("each view names its own cards; People carries Requests", () => {
    expect(teamViewFrom("people").main).toEqual(["people", "requests"]);
    expect(teamViewFrom("roster").main).toEqual(["roster"]);
    expect(teamViewFrom("schedule").main).toEqual(["schedule"]);
    expect(teamViewFrom("activity").main).toEqual(["activity"]);
    expect(teamViewFrom("usage").main).toEqual(["usage"]);
  });

  test("the rail stays on every view and never repeats a main card", () => {
    expect(teamRailFor(teamViewFrom(null))).toEqual(TEAM_RAIL_SECTIONS);
    expect(teamRailFor(teamViewFrom("usage"))).toEqual([
      "pilot",
      "conference",
      "details",
    ]);
    for (const view of TEAM_VIEWS) {
      const rail = teamRailFor(view);
      for (const id of view.main) expect(rail).not.toContain(id);
    }
  });

  test("every section shows on Overview (main + rail)", () => {
    const overview = teamViewFrom(null);
    expect([...overview.main, ...teamRailFor(overview)].sort()).toEqual(
      [...TEAM_MAIN_SECTIONS, ...TEAM_RAIL_SECTIONS].sort(),
    );
  });

  test("the title is the program, then the view off Overview", () => {
    expect(teamViewTitle("Centennial High School", teamViewFrom(null))).toBe(
      "Centennial High School",
    );
    expect(
      teamViewTitle("Centennial High School", teamViewFrom("roster")),
    ).toBe("Centennial High School · Roster");
  });
});
