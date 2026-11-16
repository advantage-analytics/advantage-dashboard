import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `UrgencyMark` (T26) — three rising bars and a word. Rendered offline; the
 * component has no imports, so nothing is stubbed.
 */

type Level = "express" | "priority" | "standard";

function render(level: Level): string {
  const { UrgencyMark } = createLoader({ stubs: {} }).load(
    "src/components/admin/labels/urgency-mark.tsx",
  ) as { UrgencyMark: React.ComponentType<{ level: Level }> };
  return renderToStaticMarkup(React.createElement(UrgencyMark, { level }));
}

const CASES: ReadonlyArray<[Level, string, number]> = [
  ["express", "Express", 3],
  ["priority", "Priority", 2],
  ["standard", "Standard", 1],
];

for (const [level, word, filled] of CASES) {
  test(`${level} shows "${word}" with ${filled} filled bar(s)`, () => {
    const html = render(level);
    expect(html).toContain(`>${word}</span>`);
    expect(html.match(/<rect /g)).toHaveLength(3);
    expect(html.match(/data-filled="true"/g) ?? []).toHaveLength(filled);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="14" height="14"');
  });
}

test("Standard's word takes the quieter ink", () => {
  expect(render("standard")).toContain("text-[var(--ink-700)]");
  expect(render("express")).toContain("text-[var(--ink-900)]");
});
