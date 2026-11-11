import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Match type list and the practice predicate (`lib/matches/match-type.ts`).
 * `match_type` still carries the discipline from older writers, so only
 * "Practice" may read as practice.
 */

const loader = createLoader();
const { MATCH_TYPE_OPTIONS, isPracticeMatch } = loader.load(
  "src/lib/matches/match-type.ts",
) as {
  MATCH_TYPE_OPTIONS: readonly { value: string; label: string }[];
  isPracticeMatch: (value: string | null | undefined) => boolean;
};

test("the options are Tournament, Dual Match, Practice, in that order", () => {
  expect(MATCH_TYPE_OPTIONS.map((o) => o.value)).toEqual([
    "Tournament",
    "Dual Match",
    "Practice",
  ]);
  expect(MATCH_TYPE_OPTIONS.map((o) => o.label)).toEqual([
    "Tournament",
    "Dual Match",
    "Practice",
  ]);
});

test("isPracticeMatch is true for Practice in any case or padding", () => {
  for (const v of ["Practice", " practice ", "PRACTICE"]) {
    expect(isPracticeMatch(v)).toBe(true);
  }
});

test("isPracticeMatch is false for everything else", () => {
  for (const v of [
    null,
    undefined,
    "",
    "Singles",
    "Doubles",
    "Dual",
    "Dual Match",
    "Tournament",
  ]) {
    expect(isPracticeMatch(v)).toBe(false);
  }
});
