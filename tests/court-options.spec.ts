import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Court field's one list (`new-match-wizard/court-options.ts`).
 *
 *   - the upload wizard and the Edit match dialog both draw it, and neither
 *     keeps a list of its own — two lists is how Edit match came to offer
 *     "hard" and "carpet" beside the wizard's "Outdoor Hard Court"
 *   - Edit match maps only the bare legacy spellings onto it; every other
 *     stored value opens, and saves, exactly as it was
 */

const loader = createLoader();
const { COURT_OPTIONS, legacyCourtType } = loader.load(
  "src/components/dashboard/matches/new-match-wizard/court-options.ts",
) as {
  COURT_OPTIONS: readonly { value: string; label: string }[];
  legacyCourtType: (value: string) => string;
};

const source = (path: string) => readFileSync(resolve(path), "utf8");
const dialog = source(
  "src/components/dashboard/matches/match-actions/edit-match-dialog.tsx",
);
const details = source(
  "src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx",
);

test("the Court list is the wizard's four surfaces", () => {
  expect(COURT_OPTIONS).toEqual([
    { value: "Outdoor Hard Court", label: "Hard" },
    { value: "Indoor Hard Court", label: "Hard · Indoor" },
    { value: "Clay Court", label: "Clay" },
    { value: "Grass Court", label: "Grass" },
  ]);
});

test("the wizard and Edit match both draw the shared list", () => {
  expect(details).toMatch(
    /import \{ COURT_OPTIONS \} from "\.\/court-options";/,
  );
  expect(details).toContain("options={COURT_OPTIONS}");
  expect(dialog).toMatch(
    /import \{[^}]*\bCOURT_OPTIONS\b[^}]*\} from "@\/components\/dashboard\/matches\/new-match-wizard\/court-options";/,
  );
  expect(dialog).toContain("withLegacy(courtType, COURT_OPTIONS)");
  // Neither keeps a court list of its own.
  for (const file of [dialog, details]) {
    expect(file).not.toMatch(/const COURT_\w*OPTIONS\b/);
    expect(file).not.toMatch(/"carpet"/i);
  }
});

test("bare legacy spellings open on their option", () => {
  for (const [stored, value] of [
    ["hard", "Outdoor Hard Court"],
    ["Hard", "Outdoor Hard Court"],
    ["HARD", "Outdoor Hard Court"],
    ["clay", "Clay Court"],
    ["Clay", "Clay Court"],
    ["grass", "Grass Court"],
    ["Grass", "Grass Court"],
  ]) {
    expect(legacyCourtType(stored), stored).toBe(value);
    expect(COURT_OPTIONS.map((o) => o.value)).toContain(value);
  }
});

test("every other value stays exactly as stored", () => {
  for (const stored of [
    ...COURT_OPTIONS.map((o) => o.value),
    "Indoor Clay Court",
    "Outdoor hard court",
    "Hard court",
    " hard",
    "carpet",
    "Carpet",
    "constructor",
    "",
  ]) {
    expect(legacyCourtType(stored), JSON.stringify(stored)).toBe(stored);
  }
});

test("Edit match reads a stored surface through the exact mapping only", () => {
  expect(dialog).toContain("legacyCourtType(value)");
  expect(dialog).not.toContain("surfaceToCourtType");
});

test("admin uploads accept the shared list, plus the bare labels they always took", async () => {
  const { adminUploadCourt } = await import("@/lib/admin/uploads/court");
  for (const { value } of COURT_OPTIONS)
    expect(adminUploadCourt(value), value).toBe(value);
  for (const legacy of ["Hard", "Clay", "Grass", "Carpet"])
    expect(adminUploadCourt(legacy), legacy).toBe(legacy);
  for (const unanswered of ["", null, undefined])
    expect(adminUploadCourt(unanswered)).toBeNull();
  for (const refused of ["hard", "Indoor Clay Court", 7])
    expect(adminUploadCourt(refused), String(refused)).toBeUndefined();
});
