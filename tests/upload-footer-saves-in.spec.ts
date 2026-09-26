import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The wizard footer's "Saves in <program>": one line that truncates a long
 * name, with the whole name — and why it matters — on hover or focus.
 */
const src = readFileSync(
  resolve(
    __dirname,
    "../src/components/dashboard/matches/new-match-wizard/UploadWizardFooter.tsx",
  ),
  "utf8",
);

test("the program name truncates on one line instead of wrapping", () => {
  expect(src).toContain("max-w-[320px] min-w-0 truncate");
  expect(src).toMatch(/whitespace-nowrap text-\[var\(--ink-500\)\]/);
});

test("hover or focus shows the full name and what it means", () => {
  expect(src).toContain("label={`Saves in ${workspaces.active.name}`}");
  expect(src).toContain(
    'detail="The match is saved here, and any video hours come from this program."',
  );
  // Reachable by keyboard, not hover alone.
  expect(src).toContain("tabIndex={0}");
});
