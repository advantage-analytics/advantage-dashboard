import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The screen after "Save match" — `UploadMatchSuccess`. Source-level: the
 * component needs a live upload to render its states, and what these pin is
 * which copy and which exit each state carries.
 */
const src = readFileSync(
  resolve(
    __dirname,
    "../src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx",
  ),
  "utf8",
);

test("mid-upload, the instruction leads and the reassurance sits under it", () => {
  const keep = src.indexOf("Keep this tab open until the upload finishes.");
  const reassure = src.indexOf("You can keep using the dashboard.");
  expect(keep).toBeGreaterThan(-1);
  expect(reassure).toBeGreaterThan(keep);
});

test("Back to matches shows only once nothing in this tab is running, and never beside Back to the event", () => {
  expect(src).toContain('const MATCHES_HREF = "/dashboard/matches";');
  const exits = src.slice(
    src.indexOf("{backToEvent ? ("),
    src.indexOf("Back to matches"),
  );
  expect(exits).toContain("Back to the event");
  expect(exits).toContain("!view.busy &&");
  expect(exits).toContain("href={MATCHES_HREF}");
});
