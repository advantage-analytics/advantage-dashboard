import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminTeamActivityEntry } from "@/lib/data/admin-team-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams detail — the Activity log as the default view's last section
 * (T21). The page renders `AdminActivityCard` with
 * `limit={ACTIVITY_LOG_PREVIEW}`: the newest entries up to that constant,
 * and a "Show all" control only when there are more.
 *
 * Rendered offline through `fixtures/vm-modules` with nothing stubbed, the
 * same way `admin-activity-card.spec.ts` renders the card. The clamp's
 * initial (collapsed) state is what a static render shows.
 */

type CardProps = {
  activity: readonly AdminTeamActivityEntry[];
  limit?: number;
};

function load() {
  const loader = createLoader();
  return loader.load("src/components/admin/admin-activity-card.tsx") as {
    AdminActivityCard: React.ComponentType<CardProps>;
    ACTIVITY_LOG_PREVIEW: number;
  };
}

function entries(count: number): AdminTeamActivityEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    action: "player.added",
    createdAt: "2026-09-10T12:00:00Z",
    actorUserId: `u${i + 1}`,
    actorName: `Actor ${i + 1}.`,
  }));
}

/** The page's own render: the card clamped to the named constant. */
function renderSection(count: number): string {
  const { AdminActivityCard, ACTIVITY_LOG_PREVIEW } = load();
  return renderToStaticMarkup(
    React.createElement(AdminActivityCard, {
      activity: entries(count),
      limit: ACTIVITY_LOG_PREVIEW,
    }),
  );
}

/** Entries drawn: each carries its own actor name, "Actor N." */
function entryCount(html: string): number {
  return html.match(/Actor \d+\./g)?.length ?? 0;
}

test("the preview constant is 8", () => {
  expect(load().ACTIVITY_LOG_PREVIEW).toBe(8);
});

test("fewer entries than the constant: all of them, no Show all", () => {
  const { ACTIVITY_LOG_PREVIEW } = load();
  const html = renderSection(ACTIVITY_LOG_PREVIEW - 3);
  expect(entryCount(html)).toBe(ACTIVITY_LOG_PREVIEW - 3);
  expect(html).not.toContain("Show all");
});

test("exactly the constant's number: all of them, no Show all", () => {
  const { ACTIVITY_LOG_PREVIEW } = load();
  const html = renderSection(ACTIVITY_LOG_PREVIEW);
  expect(entryCount(html)).toBe(ACTIVITY_LOG_PREVIEW);
  expect(html).not.toContain("Show all");
});

test("more than the constant: the newest ones, then Show all", () => {
  const { ACTIVITY_LOG_PREVIEW } = load();
  const html = renderSection(20);
  expect(entryCount(html)).toBe(ACTIVITY_LOG_PREVIEW);
  // Newest first, as the loader ordered them: the first eight are drawn.
  expect(html).toContain("Actor 1.");
  expect(html).toContain(`Actor ${ACTIVITY_LOG_PREVIEW}.`);
  expect(html).not.toContain(`Actor ${ACTIVITY_LOG_PREVIEW + 1}.`);
  expect(html).toContain("Show all");
  // The title still counts the whole log.
  expect(html).toContain("20 entries");
});

test("an empty log prints the card's empty line and no Show all", () => {
  const html = renderSection(0);
  expect(entryCount(html)).toBe(0);
  expect(html).toContain("No activity recorded on this program yet.");
  expect(html).not.toContain("Show all");
});

test("without a limit the card still draws every entry", () => {
  const { AdminActivityCard } = load();
  const html = renderToStaticMarkup(
    React.createElement(AdminActivityCard, { activity: entries(20) }),
  );
  expect(entryCount(html)).toBe(20);
  expect(html).not.toContain("Show all");
});
