import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHOTS = "src/components/dashboard/matches/match-detail/shots";
const read = (file: string) => readFileSync(resolve(SHOTS, file), "utf8");

test("the lightbox is loaded on open, not in the Shots tab's first chunk", () => {
  const tab = read("shots-tab.tsx");
  // No static import of the lightbox module (a type-only import would be fine).
  expect(tab).not.toMatch(/^import\s+\{[^}]*\bVizLightbox\b[^}]*\}\s+from/m);
  expect(tab).toMatch(
    /dynamic\(\s*\(\)\s*=>\s*import\(\s*"[^"]*shots\/viz-lightbox"/,
  );
});

test('modules with no hooks or browser APIs carry no "use client"', () => {
  for (const file of [
    "lifecycle-chip.tsx",
    "lightbox-stats.tsx",
    "lightbox-filters.tsx",
    "legend-mark.tsx",
  ]) {
    const source = read(file);
    expect(source.startsWith('"use client"'), file).toBe(false);
    expect(source, file).not.toMatch(
      /\buse(State|Effect|Ref|Memo|Callback|LayoutEffect)\(/,
    );
  }
});
