import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The analysing match page's skeleton (`analysis-steps-pending.tsx`), T28's
 * layout fallback for T29. Offline: rendered to static markup and read as
 * text — the Carbon/DS contract, not pixels.
 *
 *   - one `role="status"`, labelled "Loading …"
 *   - the column matches `analysis-steps-column.tsx`'s `<section>`
 *   - exactly four mark + label rows
 *   - every bar `aria-hidden`
 */

const loader = createLoader({});
const { AnalysisStepsPending } = loader.load(
  "src/components/dashboard/loading/analysis-steps-pending.tsx",
) as { AnalysisStepsPending: React.ComponentType };

function render() {
  return renderToStaticMarkup(React.createElement(AnalysisStepsPending));
}

test("one status role, labelled Loading analysis progress", () => {
  const html = render();
  const statusMatches = html.match(/role="status"/g) ?? [];
  expect(statusMatches.length).toBe(1);
  expect(html).toContain(
    'role="status" aria-label="Loading analysis progress"',
  );
});

test("the column carries analysis-steps-column.tsx's classes", () => {
  const html = render();
  expect(html).toContain(
    "mx-auto w-full max-w-[488px] px-6 pt-[clamp(64px,18vh,176px)]",
  );
});

test("a title bar, a match-line bar, then exactly four mark + label rows", () => {
  const html = render();
  const marks = html.match(/class="[^"]*size-4 rounded-full[^"]*"/g) ?? [];
  expect(marks.length).toBe(4);
});

test("every bar sits under aria-hidden", () => {
  const html = render();
  const bars = html.match(/data-pending-bar=""/g) ?? [];
  expect(bars.length).toBeGreaterThan(0);
  // PendingFrame's own aria-hidden wrapper covers every PendingBar — none of
  // them carries a role or interactive attribute of its own.
  expect(html).not.toContain("<button");
  const hiddenWrapper = html.match(/aria-hidden="true"/g) ?? [];
  expect(hiddenWrapper.length).toBeGreaterThan(0);
});
