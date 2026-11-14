import { expect, test } from "@playwright/test";

import {
  TEAMS_VIEW_PILLS,
  teamsPageViewFrom,
  teamsPillView,
  teamsViewPill,
  teamsViewPillFrom,
  teamsViewPillParam,
} from "@/components/admin/teams-views";

/**
 * Admin › Teams' view row — three pills, Programs, Pilot players and
 * Conferences, mapped to and from `?view=` by `teams-views.ts`. Old links that
 * name one of the loader's retired program views must still read as Programs.
 */
test.describe("admin teams views", () => {
  test("the view row has three pills, in order", () => {
    expect(TEAMS_VIEW_PILLS).toEqual(["programs", "pilots", "conferences"]);
  });

  test("every pill round-trips through the URL", () => {
    for (const pill of TEAMS_VIEW_PILLS) {
      expect(teamsViewPillFrom(teamsViewPillParam(pill))).toBe(pill);
      expect(teamsViewPill(teamsPillView(pill))).toBe(pill);
    }
  });

  test("Programs writes no ?view=; the others name themselves", () => {
    expect(teamsViewPillParam("programs")).toBeNull();
    expect(teamsViewPillParam("pilots")).toBe("pilots");
    expect(teamsViewPillParam("conferences")).toBe("conferences");
  });

  test("an old ?view=in_pilot link still reads as Programs", () => {
    expect(teamsViewPillFrom("in_pilot")).toBe("programs");
    // …and keeps naming its own program view for the loader.
    expect(teamsPageViewFrom("in_pilot")).toBe("in_pilot");
    for (const old of ["on_advantage", "needs_review", "all"]) {
      expect(teamsViewPillFrom(old)).toBe("programs");
    }
  });

  test("no, empty or unknown ?view= is Programs", () => {
    for (const value of [null, undefined, "", "  ", "bogus"]) {
      expect(teamsViewPillFrom(value)).toBe("programs");
      expect(teamsPageViewFrom(value)).toBe("on_advantage");
    }
  });
});
