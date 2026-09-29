import { readFileSync } from "node:fs";
import path from "node:path";

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
  MATCH_REPORT_FRAME_ID,
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
      "contact on the baseline",
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

  test("Serve/Return Result, Missed and Rally length read as their own phrases", () => {
    expect(
      appliedPhrases(
        filtersWith({
          serveResult: [
            "double-fault",
            "in-play",
            "return-error",
            "service-winner",
            "ace",
          ],
          returnResult: ["in-play", "error", "winner"],
          resultMissed: ["Net", "Out"],
          resultRallyLength: ["long", "medium", "short"],
        }),
        NAMES,
      ),
    ).toEqual([
      "ace",
      "service winner",
      "return error",
      "serve returned",
      "double fault",
      "return winner",
      "missed return",
      "return in play",
      "missed out",
      "missed in the net",
      "short rally (1–4)",
      "medium rally (5–8)",
      "long rally (9+)",
    ]);
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

test.describe("filters drawer placement", () => {
  const dir = path.join(
    process.cwd(),
    "src/components/dashboard/matches/match-detail",
  );
  const read = (file: string) => readFileSync(path.join(dir, file), "utf8");

  // `#match-report-pane` is the page's scroll container and overflows on a
  // short viewport; a drawer positioned inside it scrolled away with the
  // cards. It must portal into the frame, which is relative and never scrolls.
  test("the drawer portals into the report frame, which is its relative anchor", () => {
    const rail = read("match-filters/filter-rail.tsx");
    expect(rail).toContain("createPortal(shell, host)");
    expect(rail).toContain("document.getElementById(MATCH_REPORT_FRAME_ID)");

    const report = read("match-report.tsx");
    expect(report).toMatch(
      /id=\{MATCH_REPORT_FRAME_ID\}\s*className="relative /,
    );
    expect(MATCH_REPORT_FRAME_ID).toBe("match-report-frame");
  });

  // The drawer focuses its own container on open; the Video tab's
  // window-level shortcuts (Space plays, arrows step, S saves) must not fire
  // from inside it.
  test("the Video tab's shortcuts stand down while focus is in the drawer", () => {
    const film = read("film/film-tab.tsx");
    expect(film).toContain("#${FILTER_RAIL_ID}");
  });
});
