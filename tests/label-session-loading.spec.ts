import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * A labeller's match (`/label/[sessionId]`) takes seconds to load, and the
 * route had no `loading.tsx`: the "Assigned to you" row on `/label` showed no
 * sign its click had landed, so labellers rage-clicked it and went back to the
 * board (PostHog, 2026-11-20). The route now draws the console's black full
 * screen while it loads.
 *
 * Offline: the skeleton is loaded from source and rendered to static markup.
 * What is asserted is the loading contract
 * (`.skills/advantage-analytics-design/reference/empty-and-loading.md`), not
 * pixels.
 */

const FILE = "src/app/label/[sessionId]/loading.tsx";
const loader = createLoader({ stubs: {} });

function render(): string {
  const { default: Loading } = loader.load(FILE) as {
    default: React.ComponentType;
  };
  return renderToStaticMarkup(React.createElement(Loading));
}

test("the label session route has its own loading.tsx", () => {
  expect(existsSync(FILE)).toBe(true);
});

test("it draws the console's black full screen with labelled status regions", () => {
  const html = render();
  expect(html).toContain("data-label-session-loading");
  expect(html).toContain("bg-black");
  const labels = [...html.matchAll(/role="status" aria-label="([^"]+)"/g)].map(
    (m) => m[1],
  );
  expect(labels).toEqual(["Loading the match", "Loading the points"]);
});

test("every bar is the shared PendingBar in its dark tone", () => {
  const html = render();
  const bars = html.match(/data-pending-bar=""/g) ?? [];
  expect(bars.length).toBeGreaterThan(3);
  expect(html).not.toContain("bg-[var(--surface-skeleton)]");
  expect(html).toContain("bg-white/[0.08]");
});
