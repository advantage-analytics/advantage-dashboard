import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  hasActiveMatchFilters,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  appliedChips,
  removeChip,
} from "@/components/dashboard/matches/match-detail/match-filters/applied-chips";
import {
  escClosesRail,
  filterRailReducer,
} from "@/components/dashboard/matches/match-detail/match-filters/rail-state";

/**
 * The match filters' pure UI halves, which the Video tab keeps: the applied
 * chips (`applied-chips.ts` — the Film list draws them) and the filters
 * rail's open/close model (`rail-state.ts`, driven by `filter-rail.tsx`,
 * which is unmounted until the rail is re-hosted for the Video tab). Moved
 * here from `match-filters-statistics.spec.ts` when the Statistics tab lost
 * its filters.
 */

const NAMES = { you: "Rudy", opponent: "Sam" };

function filtersWith(overrides: Partial<MatchFilters>): MatchFilters {
  return { ...EMPTY_MATCH_FILTERS, ...overrides };
}

const TWO_VALUES = filtersWith({ server: "you", serveZone: ["Wide"] });

test.describe("applied-chips", () => {
  test("one chip per value, in panel order; Serve/Return player is one chip", () => {
    const chips = appliedChips(
      filtersWith({
        serveZone: ["T", "Wide"],
        server: "opponent",
        sets: [2, 1],
        resultOutcome: ["winner"],
        customRallyShot: [4],
        returnContact: ["middle"],
      }),
      NAMES,
    );
    expect(chips.map((c) => c.label)).toEqual([
      "Set 1",
      "Set 2",
      "Sam serving",
      "Wide serve",
      "T serve",
      "Middle contact",
      "Result: Winner",
      "Rally shot 4",
    ]);
    expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length);
  });

  test("no filters, no chips", () => {
    expect(appliedChips(EMPTY_MATCH_FILTERS, NAMES)).toEqual([]);
  });

  test("removing a chip removes that value and only that value", () => {
    const filters = filtersWith({
      server: "you",
      serveZone: ["Wide", "T"],
      scorePoints: ["Ad-40"],
    });
    const chips = appliedChips(filters, NAMES);
    const wide = chips.find((c) => c.label === "Wide serve")!;
    expect(removeChip(filters, wide)).toEqual({
      ...filters,
      serveZone: ["T"],
    });
    const serving = chips.find((c) => c.label === "Rudy serving")!;
    expect(removeChip(filters, serving).server).toBeNull();
    // The unavailable value is removable like any other.
    const ad = chips.find((c) => c.label === "Ad-40")!;
    expect(removeChip(filters, ad).scorePoints).toEqual([]);
  });

  test("removing every chip leaves nothing filtered", () => {
    let filters = TWO_VALUES;
    for (const chip of appliedChips(TWO_VALUES, NAMES)) {
      filters = removeChip(filters, chip);
    }
    expect(hasActiveMatchFilters(filters)).toBe(false);
  });

  test("a stale chip (value already gone) is a no-op, never a re-add", () => {
    const filters = filtersWith({ serveZone: ["T"] });
    expect(removeChip(filters, { key: "serveZone", value: "Wide" })).toBe(
      filters,
    );
    const noServer = filtersWith({});
    expect(removeChip(noServer, { key: "server", value: "you" })).toBe(
      noServer,
    );
  });
});

test.describe("rail-state", () => {
  test("the Filter button toggles: open, then re-click closes", () => {
    expect(filterRailReducer("closed", "toggle")).toBe("open");
    expect(filterRailReducer("open", "toggle")).toBe("closing");
    // A click mid-close reopens rather than waiting out the animation.
    expect(filterRailReducer("closing", "toggle")).toBe("open");
  });

  test("close (Esc, Cancel, Apply) only starts from open; the animation end finishes it", () => {
    expect(filterRailReducer("open", "close")).toBe("closing");
    expect(filterRailReducer("closed", "close")).toBe("closed");
    expect(filterRailReducer("closing", "close")).toBe("closing");
    expect(filterRailReducer("closing", "closed")).toBe("closed");
    expect(filterRailReducer("open", "closed")).toBe("open");
  });

  test("reset (the view unmounted) shuts it at once from any phase", () => {
    for (const phase of ["open", "closing", "closed"] as const) {
      expect(filterRailReducer(phase, "reset")).toBe("closed");
    }
  });

  test("Esc closes an open rail unless something above it took the key", () => {
    const esc = { key: "Escape", defaultPrevented: false };
    expect(escClosesRail("open", esc)).toBe(true);
    expect(escClosesRail("closed", esc)).toBe(false);
    expect(escClosesRail("closing", esc)).toBe(false);
    expect(escClosesRail("open", { ...esc, defaultPrevented: true })).toBe(
      false,
    );
    expect(
      escClosesRail("open", { key: "Enter", defaultPrevented: false }),
    ).toBe(false);
  });
});
