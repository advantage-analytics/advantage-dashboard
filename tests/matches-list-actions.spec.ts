import { test, expect } from "@playwright/test";
import { matchesFilterGroups } from "../src/lib/data/match-filters";
test("roster selections union while other facets intersect", () => {
  const filters = [
    { key: "player", value: "Dana" },
    { key: "player", value: "Sam" },
    { key: "court", value: "Hard" },
  ];
  const rows = [
    { player: "Dana", court: "Hard" },
    { player: "Sam", court: "Hard" },
    { player: "Dana", court: "Clay" },
    { player: "Alex", court: "Hard" },
  ];
  expect(
    rows.filter((row) =>
      matchesFilterGroups(
        row,
        filters,
        (item, filter) =>
          item[filter.key as keyof typeof item] === filter.value,
      ),
    ),
  ).toEqual(rows.slice(0, 2));
  expect(matchesFilterGroups(rows[0], [], () => false)).toBe(true);
});
