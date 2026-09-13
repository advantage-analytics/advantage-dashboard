import { expect, test } from "@playwright/test";

import {
  isDestination,
  PERSONAL_BOTTOM,
  PERSONAL_NAV,
  TEAM_BOTTOM,
  TEAM_NAV,
} from "@/lib/dashboard/nav";

/**
 * `isDestination` decides which of the header's two treatments a path gets:
 * a destination gets the workspace title, a position within a flow gets the
 * breadcrumb trail. Get the boundary wrong and a page ends up with neither —
 * or a step inside a wizard gets relabelled with the workspace name it left
 * behind three clicks ago.
 *
 * It is backed by `DESTINATIONS`, which spreads `PERSONAL_NAV`, `TEAM_NAV`,
 * `PERSONAL_BOTTOM` and `TEAM_BOTTOM` — deliberately not `ALL_LINKS`, which
 * also folds in `UNLISTED`. `team/upload` lives in `UNLISTED` so the
 * breadcrumb can still say "Upload video"; it is a step inside the upload
 * flow, not a place the rail sends you, so `DESTINATIONS` must leave it out.
 */
test.describe("isDestination recognises every rail entry", () => {
  // Every array `DESTINATIONS` spreads, so adding a rail row adds its test
  // rather than needing one written by hand.
  //
  // Deduped by href because the menus overlap on purpose (see nav.ts's own
  // comment): `/dashboard/matches` is in both, and PERSONAL_BOTTOM and
  // TEAM_BOTTOM are identical today. Playwright refuses two tests with the
  // same title, and the assertion is identical either way.
  const hrefs = [
    ...new Set(
      [...PERSONAL_NAV, ...TEAM_NAV, ...PERSONAL_BOTTOM, ...TEAM_BOTTOM].map(
        (link) => link.href,
      ),
    ),
  ];

  for (const href of hrefs) {
    test(`${href} is a destination`, () => {
      expect(isDestination(href)).toBe(true);
    });
  }
});

test.describe("isDestination excludes UNLISTED", () => {
  test("team/upload is named for the breadcrumb but is not a place", () => {
    // This is the one that regresses silently if someone later reaches for
    // ALL_LINKS instead of the rail arrays: ALL_LINKS folds UNLISTED in,
    // DESTINATIONS deliberately does not.
    expect(isDestination("/dashboard/team/upload")).toBe(false);
  });
});

test.describe("isDestination refuses a position within a flow", () => {
  test("a match detail page is not a destination", () => {
    expect(isDestination("/dashboard/matches/abc123")).toBe(false);
  });

  test("the upload wizard is not a destination", () => {
    expect(isDestination("/dashboard/matches/new")).toBe(false);
  });

  test("a schedule create screen is not a destination", () => {
    expect(isDestination("/dashboard/team/schedule/new/dual")).toBe(false);
  });

  test("a settings sub-page is not a destination", () => {
    expect(isDestination("/dashboard/settings/usage")).toBe(false);
  });
});

test.describe("isDestination matches exactly, never by prefix", () => {
  test("a trailing slash on a real destination is refused", () => {
    // `/dashboard/matches` is a destination; `/dashboard/matches/` is not the
    // same string, and a `startsWith` check would have waved it through.
    expect(isDestination("/dashboard/matches")).toBe(true);
    expect(isDestination("/dashboard/matches/")).toBe(false);
  });
});

test.describe("isDestination on an unrecognised path", () => {
  test("a path with no entry anywhere is not a destination", () => {
    expect(isDestination("/dashboard/nonexistent")).toBe(false);
  });
});
