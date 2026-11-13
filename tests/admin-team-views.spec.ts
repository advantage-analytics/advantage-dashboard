import { expect, test } from "@playwright/test";

import {
  TEAM_PEOPLE_CARDS,
  TEAM_VIEWS,
  teamViewFrom,
  teamViewHref,
  teamViewTitle,
} from "@/components/admin/team-sections";

/**
 * Admin › Teams detail — one centred column (T12). The default view is the
 * composed page; `?view=` shows the cards the artboard has no place for, one
 * view at a time. `next.config.ts` redirects the five old sub-routes to
 * `?view=<slug>` (`tests/admin-routes.spec.ts`), so every slug must land.
 */
test.describe("admin team views", () => {
  test("no, unknown or `roster` ?view= is the default view", () => {
    for (const value of [null, undefined, "", "bogus", "roster"]) {
      const view = teamViewFrom(value);
      expect(view.id).toBe("overview");
      expect(view.cards).toEqual([]);
    }
  });

  test("each other view names its own cards", () => {
    expect(teamViewFrom("people").cards).toEqual([
      "requests",
      "people",
      "roster",
      "contacts",
    ]);
    expect(teamViewFrom("schedule").cards).toEqual(["schedule"]);
    expect(teamViewFrom("usage").cards).toEqual(["pilot", "usage"]);
    expect(teamViewFrom("activity").cards).toEqual(["activity"]);
  });

  test("the default People section is today's three cards, Contacts aside", () => {
    expect(TEAM_PEOPLE_CARDS).toEqual(["requests", "people", "roster"]);
  });

  test("every old sub-route slug lands on a view", () => {
    for (const slug of ["people", "roster", "schedule", "usage", "activity"]) {
      const view = teamViewFrom(slug);
      expect(TEAM_VIEWS).toContain(view);
      expect(view.id).toBe(slug === "roster" ? "overview" : slug);
    }
  });

  test("view links: the default is the bare path", () => {
    expect(teamViewHref("p1", "overview")).toBe("/admin/teams/p1");
    expect(teamViewHref("p1", "usage")).toBe("/admin/teams/p1?view=usage");
    expect(teamViewHref("p1", "activity")).toBe(
      "/admin/teams/p1?view=activity",
    );
  });

  test("the title is the program, then the view off the default", () => {
    expect(teamViewTitle("Centennial High School", teamViewFrom(null))).toBe(
      "Centennial High School",
    );
    expect(teamViewTitle("Centennial High School", teamViewFrom("usage"))).toBe(
      "Centennial High School · Usage",
    );
  });
});
