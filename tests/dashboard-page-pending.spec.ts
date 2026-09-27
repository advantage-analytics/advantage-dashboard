import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `src/app/dashboard/loading.tsx` (`DashboardPagePending`) — the root
 * boundary that catches every dashboard route with no `loading.tsx` of its
 * own. Offline: rendered to static markup and read as text.
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
