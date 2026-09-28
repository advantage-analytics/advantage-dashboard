import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  MATCH_FILTER_KEYS,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  appliedPhrases,
  SENTENCE_KEYS,
} from "@/components/dashboard/matches/match-detail/match-filters/applied-words";
import {
  escClosesRail,
  filterRailReducer,
} from "@/components/dashboard/matches/match-detail/match-filters/rail-state";

/**
 * The match filters' pure UI halves, which the Video tab keeps: the applied
 * filters in words (`applied-words.ts` — the filter strip's sentence; the
 * design system bans accumulating chips) and the filters drawer's open/close
 * model (`rail-state.ts`, driven by `filter-rail.tsx`).
 */

const NAMES = { you: "Rudy", opponent: "Sam" };

function filtersWith(overrides: Partial<MatchFilters>): MatchFilters {
  return { ...EMPTY_MATCH_FILTERS, ...overrides };
}

test.describe("applied-words", () => {
  test("one phrase per value, rally order; Serve/Return player is one phrase", () => {
    expect(
      appliedPhrases(
        filtersWith({
          serveZone: ["T", "Wide"],
          server: "opponent",
          sets: [2, 1],
          scoreType: ["breakpoint"],
          serveType: ["second"],
          resultOutcome: ["winner"],
          customRallyShot: [4],
          returnContact: ["middle"],
        }),
        NAMES,
      ),
    ).toEqual([
      "Sam serving",
      "second serve",
      "wide serve",
      "T serve",
      "middle contact",
      "set 1",
      "set 2",
      "break point",
      "winners",
      "rally shot 4",
    ]);
  });

  test("the mock's sentence: serving · second serve · break point", () => {
    expect(
      appliedPhrases(
        filtersWith({
          scoreType: ["breakpoint"],
          server: "you",
          serveType: ["second"],
        }),
        { you: "G. Revelli", opponent: "T. Stepanov" },
      ).join(" · "),
    ).toBe("G. Revelli serving · second serve · break point");
  });

  test("names and scores keep their capitals; an unavailable value is still named", () => {
    expect(
      appliedPhrases(
        filtersWith({ scorePoints: ["Ad-40"], resultPlayer: "you" }),
        NAMES,
      ),
    ).toEqual(["Ad-40", "Rudy’s result"]);
  });

  test("no filters, no words", () => {
    expect(appliedPhrases(EMPTY_MATCH_FILTERS, NAMES)).toEqual([]);
  });

  test("the sentence order names every filter group exactly once", () => {
    expect([...SENTENCE_KEYS].sort()).toEqual([...MATCH_FILTER_KEYS].sort());
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
