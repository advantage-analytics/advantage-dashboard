import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `DashboardPagePending` — `ComingSoonPage`'s frame while it loads
 * (`team/schedule/loading.tsx`). Offline: rendered to static markup and read
 * as text.
 *
 *   - one `role="status"`, labelled "Loading page"
 *   - exactly one skeleton bar, and it pulses motion-safe under the hidden wrapper
 *   - nothing interactive
 */

const loader = createLoader();
const { DashboardPagePending } = loader.load(
  "src/components/dashboard/loading/page-skeletons.tsx",
) as { DashboardPagePending: React.ComponentType };

const html = renderToStaticMarkup(React.createElement(DashboardPagePending));

test("one loading status, labelled for the page", () => {
  expect(html.match(/role="status"/g)?.length).toBe(1);
  expect(html).toContain('role="status" aria-label="Loading page"');
});

test("exactly one skeleton bar, hidden and pulsing motion-safe", () => {
  expect(html.match(/\sdata-pending-bar=""/g)?.length).toBe(1);
  const bar = html.match(/<span[^>]*\sdata-pending-bar=""[^>]*\/?>/)?.[0] ?? "";
  expect(bar).toContain('aria-hidden="true"');
  expect(bar).toContain("bg-[var(--surface-skeleton)]");
});

test("nothing is interactive, no colour is a hex, nothing spins", () => {
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("<input");
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(html).not.toContain("animate-spin");
});

/**
 * Next prefetches a dynamic route only down to its first `loading.tsx`. A
 * boundary that wraps several routes is therefore what every one of them
 * paints first, a round trip before its own skeleton: the dashboard root's
 * lone title bar did that to every page, and `team/loading.tsx` drew Team
 * Home's skeleton over Roster, Ask and the rest. Each route's skeleton must be
 * its first boundary under the shell.
 */
test("no loading boundary wraps more than one dashboard route", () => {
  for (const file of [
    "src/app/dashboard/loading.tsx",
    "src/app/dashboard/team/loading.tsx",
  ]) {
    expect(fs.existsSync(path.join(process.cwd(), file)), file).toBe(false);
  }
});
