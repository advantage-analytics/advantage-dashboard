import { expect, test } from "@playwright/test";

import {
  TEAM_VIEWS,
  teamViewFrom,
  teamViewHref,
  teamViewTitle,
} from "@/components/admin/team-sections";

/**
 * Admin › Teams detail — one full-width column (T12; full width 2026-11-13). The default view is the
 * composed page; `?view=` shows the cards the artboard has no place for, one
 * view at a time. `next.config.ts` redirects the five old sub-routes to
 * `?view=<slug>` (`tests/admin-routes.spec.ts`), so every slug must land.
 */
test.describe("admin team views", () => {
  test("no, unknown, `roster` or `activity` ?view= is the default view", () => {
    // The activity log is the default view's last section (T21), so
    // `?view=activity` — the old link, and the old sub-route's redirect —
    // lands there rather than on a view of its own.
    for (const value of [null, undefined, "", "bogus", "roster", "activity"]) {
      const view = teamViewFrom(value);
      expect(view.id).toBe("overview");
      expect(view.cards).toEqual([]);
    }
  });

  test("each other view names its own cards", () => {
    expect(teamViewFrom("people").cards).toEqual(["people", "contacts"]);
    expect(teamViewFrom("schedule").cards).toEqual(["schedule"]);
    expect(teamViewFrom("usage").cards).toEqual(["pilot", "plan", "usage"]);
  });

  test("every old sub-route slug lands on a view", () => {
    for (const slug of ["people", "roster", "schedule", "usage", "activity"]) {
      const view = teamViewFrom(slug);
      expect(TEAM_VIEWS).toContain(view);
      expect(view.id).toBe(
        slug === "roster" || slug === "activity" ? "overview" : slug,
      );
    }
  });

  test("view links: the default is the bare path", () => {
    expect(teamViewHref("p1", "overview")).toBe("/admin/teams/p1");
    expect(teamViewHref("p1", "usage")).toBe("/admin/teams/p1?view=usage");
  });

  test("no view is named activity any more", () => {
    expect(TEAM_VIEWS.map((view) => view.id)).not.toContain("activity");
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
