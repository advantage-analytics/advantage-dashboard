import { test, expect } from "@playwright/test";
import { errorSplitJudged } from "@/lib/data/error-split";

const MARKED = "2026-10-29T12:00:00Z";

test("a SwingVision match is always judged", () => {
  expect(
    errorSplitJudged({
      sourceProvider: "swing-vision",
      verified: false,
      errorsJudgedAt: null,
    }),
  ).toBe(true);
});

test("a verified video match with the marker is judged", () => {
  expect(
    errorSplitJudged({
      sourceProvider: "splitstep",
      verified: true,
      errorsJudgedAt: MARKED,
    }),
  ).toBe(true);
});

test("a verified video match with no marker (verified before judging) is not", () => {
  expect(
    errorSplitJudged({
      sourceProvider: "splitstep",
      verified: true,
      errorsJudgedAt: null,
    }),
  ).toBe(false);
});

test("an unverified video match is not judged, even with a marker (reopened)", () => {
  expect(
    errorSplitJudged({
      sourceProvider: "splitstep",
      verified: false,
      errorsJudgedAt: null,
    }),
  ).toBe(false);
  expect(
    errorSplitJudged({
      sourceProvider: "splitstep",
      verified: false,
      errorsJudgedAt: MARKED,
    }),
  ).toBe(false);
});

test("the misspelt provider is not SwingVision", () => {
  expect(
    errorSplitJudged({
      sourceProvider: "swingvision",
      verified: false,
      errorsJudgedAt: null,
    }),
  ).toBe(false);
});
