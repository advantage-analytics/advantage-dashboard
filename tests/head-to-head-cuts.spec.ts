import { expect, test } from "@playwright/test";

import {
  H2H_GROUPS,
  buildStatRows,
  sideCut,
  type H2HRowConfig,
} from "@/components/dashboard/matches/match-detail/head-to-head-card";
import {
  DEFAULT_FILM_FILTERS,
  type FilmFilters,
} from "@/components/dashboard/matches/match-detail/film/filters/types";

/**
 * The head-to-head rows that open their points in the Video tab (Advantage
 * Intelligence UI T3).
 *
 * Pure and offline. What goes wrong here never shows on the card: a cut with
 * a misspelt key is spread over the defaults by `mergeFilmCut` and silently
 * ignored, so the Video tab opens on every point and looks like it worked. A
 * row that gains or loses a cut changes what a click does with nothing drawn
 * differently. So the table is pinned exactly, and every key is checked
 * against the filter model's own defaults.
 */

const ALL_ROWS: H2HRowConfig[] = H2H_GROUPS.flatMap((group) => group.configs);

const EXPECTED_CUTS: Record<string, Partial<FilmFilters>> = {
  Aces: { serve: ["ace"] },
  "Double faults": { serve: ["double-fault"] },
  "First serve points won": { ball: "first" },
  "Second serve points won": { ball: "second" },
  "Break points saved": { pressure: "break" },
  Winners: { result: ["winner"] },
  "Unforced errors": { result: ["unforced"] },
};

test.describe("head-to-head cuts", () => {
  test("the cut table is exactly the configured mapping", () => {
    const actual = Object.fromEntries(
      ALL_ROWS.filter((row) => row.cut).map((row) => [row.label, row.cut]),
    );
    expect(actual).toEqual(EXPECTED_CUTS);
  });

  test("rows without a point-level equivalent carry no cut", () => {
    const uncut = ALL_ROWS.filter((row) => !row.cut).map((row) => row.label);
    expect(uncut).toContain("Service games won");
    expect(uncut).toContain("Return winners");
  });

  test("every cut uses only keys of DEFAULT_FILM_FILTERS", () => {
    const known = new Set(Object.keys(DEFAULT_FILM_FILTERS));
    for (const row of ALL_ROWS) {
      if (!row.cut) continue;
      for (const key of Object.keys(row.cut)) {
        expect(known.has(key), `${row.label} → ${key}`).toBe(true);
      }
      // And for the per-cell cut the card actually sends.
      for (const side of ["you", "opp"] as const) {
        for (const key of Object.keys(sideCut(row.cut, side))) {
          expect(known.has(key), `${row.label} (${side}) → ${key}`).toBe(true);
        }
      }
    }
  });

  test("serve rows take the side as the server", () => {
    for (const label of [
      "Aces",
      "Double faults",
      "First serve points won",
      "Second serve points won",
      "Break points saved",
    ]) {
      const cut = EXPECTED_CUTS[label];
      expect(sideCut(cut, "you")).toEqual({ ...cut, server: "you" });
      expect(sideCut(cut, "opp")).toEqual({ ...cut, server: "opp" });
    }
  });

  test("result rows take the side as the point's outcome", () => {
    // A winner is struck by the player who wins the point.
    expect(sideCut({ result: ["winner"] }, "you")).toEqual({
      result: ["winner"],
      outcome: "you",
    });
    expect(sideCut({ result: ["winner"] }, "opp")).toEqual({
      result: ["winner"],
      outcome: "opp",
    });
    // An unforced error is made by the player who LOSES the point, so the
    // viewer's errors are the points the opponent won.
    expect(sideCut({ result: ["unforced"] }, "you")).toEqual({
      result: ["unforced"],
      outcome: "opp",
    });
    expect(sideCut({ result: ["unforced"] }, "opp")).toEqual({
      result: ["unforced"],
      outcome: "you",
    });
  });

  test("sideCut never mutates the configured cut", () => {
    const row = ALL_ROWS.find((r) => r.label === "Aces");
    sideCut(row!.cut!, "you");
    expect(row!.cut).toEqual({ serve: ["ace"] });
  });

  test("built rows carry their config's cut", () => {
    const rows = buildStatRows(ALL_ROWS, { fractions: {} }, { fractions: {} });
    rows.forEach((row, i) => expect(row.cut).toEqual(ALL_ROWS[i].cut));
  });
});
