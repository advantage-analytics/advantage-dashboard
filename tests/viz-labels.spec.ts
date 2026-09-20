import { expect, test } from "@playwright/test";
import { truncatePillLabels } from "@/components/dashboard/matches/match-detail/shots/viz-labels";

test("truncatePillLabels passes a short list through unchanged", () => {
  expect(truncatePillLabels(["Won", "Break points"])).toEqual([
    "Won",
    "Break points",
  ]);
});

test("truncatePillLabels passes a list exactly at the max through unchanged", () => {
  expect(truncatePillLabels(["a", "b", "c"])).toEqual(["a", "b", "c"]);
});

test("truncatePillLabels caps at 3 by default and appends a +n summary", () => {
  expect(truncatePillLabels(["a", "b", "c", "d", "e"])).toEqual([
    "a",
    "b",
    "c",
    "+2",
  ]);
});

test("truncatePillLabels honors a custom max", () => {
  expect(truncatePillLabels(["a", "b", "c", "d"], 1)).toEqual(["a", "+3"]);
});

test("truncatePillLabels on an empty list stays empty", () => {
  expect(truncatePillLabels([])).toEqual([]);
});
