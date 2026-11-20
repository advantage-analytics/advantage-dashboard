import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Autocapture masks all text and attributes, so a click on the labeller board
 * reached PostHog as an anonymous DOM path. The 2026-11-20 UX report could
 * only name the "Assigned to you" row (rage-clicked) and the In-progress lane
 * (dead-clicked) by matching `nth-child` selectors against the source. Both
 * now carry a fixed `controlName`, which posthog-js reads past the mask.
 */

const read = (path: string) => readFileSync(path, "utf8");

test("the Assigned to you row names its click", () => {
  const src = read("src/components/label/assigned-sessions-list.tsx");
  expect(src).toContain('{...controlName("label_assigned_row")}');
});

test("every label board lane names clicks inside it from its fixed id", () => {
  const src = read("src/components/label/label-board.tsx");
  const lane = src.slice(src.indexOf("export function Lane("));
  const section = lane.slice(0, lane.indexOf("</section>"));
  expect(section).toContain('{...controlName(id.replace(/-/g, "_"))}');
  // The ids are source literals, never data, so the names cannot carry a
  // player or a team.
  for (const id of src.matchAll(/<Lane\s+id=\{?([^\s>]+)/g)) {
    expect(id[1]).toMatch(/^"label-board-[a-z-]+"$/);
  }
});
