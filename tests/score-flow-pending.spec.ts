import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Add result page's skeleton (`schedule/[eventId]/score/loading.tsx`).
 * Offline: rendered to static markup and read as text — what is asserted is
 * the Carbon/DS contract, not pixels.
 *
 *   - one `role="status"`, labelled "Loading result form"
 *   - the title the page already knows is real text, from the page's constant
 *   - every skeleton-token element is hidden and pulses motion-safe
 *   - nothing interactive, no hex colour
 */

const loader = createLoader();
const { ScoreFlowPending } = loader.load(
  "src/components/dashboard/loading/score-flow-pending.tsx",
) as { ScoreFlowPending: React.ComponentType };
const { SCORE_FLOW_TITLE } = loader.load(
  "src/components/dashboard/schedule/score-flow-copy.ts",
) as { SCORE_FLOW_TITLE: string };

const html = renderToStaticMarkup(React.createElement(ScoreFlowPending));

test("one loading status, labelled for the result form", () => {
  expect(html.match(/role="status"/g)?.length).toBe(1);
  expect(html).toContain('role="status" aria-label="Loading result form"');
});

test("the title is real text, from the score flow's own constant", () => {
  expect(SCORE_FLOW_TITLE).toBe("The result.");
  expect(html).toMatch(/<h1[^>]*>The result\.<\/h1>/);
});

test("the flow's chrome is mirrored: one-step indicator, pinned strip, 64px footer", () => {
  expect(html).toContain('aria-valuemax="1"');
  expect(html).toContain(
    "h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]",
  );
  expect(html).toContain("pt-16 pb-10");
  expect(html).toContain("border-t border-[var(--border-hairline)]");
  expect(html).toContain("flex h-16 items-center gap-4");
  // ScoreBlock: two side rows of two 40px cells.
  expect(
    html.match(/h-10 w-10 rounded-\[var\(--radius-cell\)\]/g)?.length,
  ).toBe(4);
});

test("nothing is interactive and no colour is a hex", () => {
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("<input");
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
});

test("every skeleton element is hidden and pulses motion-safe", () => {
  // Walk the markup as a tag stack, so "under an aria-hidden ancestor" is
  // checked structurally rather than by position in the string.
  const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
  const stack: boolean[] = [];
  let skeletons = 0;
  for (const match of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = match;
    if (closing) {
      stack.pop();
      continue;
    }
    const hidden = /aria-hidden="true"/.test(attrs);
    const underHidden = stack.includes(true);
    if (attrs.includes("--surface-skeleton")) {
      skeletons++;
      expect(underHidden, attrs).toBe(true);
      expect(attrs).toContain("motion-safe:animate-pulse");
    }
    if (!selfClosing && !VOID.has(tag)) stack.push(hidden);
  }
  expect(skeletons).toBeGreaterThan(8);
  expect(html).not.toMatch(/(?<!motion-safe:)\banimate-pulse\b/);
});
