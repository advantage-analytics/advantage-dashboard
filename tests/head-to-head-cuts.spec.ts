import { expect, test } from "@playwright/test";

import type { MatchPoint } from "@/lib/data/match-points-server";

import {
  H2H_GROUPS,
  buildStatRows,
  fractionWords,
  sideCut,
  tallySide,
  watchLine,
  withPointRows,
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
  "First serve in": { ball: "first" },
  "First serve points won": { ball: "first" },
  "Second serve points won": { ball: "second" },
  "Break points saved": { pressure: "break" },
  "First serve returns won": { ball: "first" },
  "Second serve returns won": { ball: "second" },
  "Break points converted": { pressure: "break" },
  "Return winners": { returns: ["winner"] },
  Winners: { result: ["winner"] },
  "Unforced errors": { result: ["unforced"] },
  "Total points won": {},
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
    expect(uncut).toEqual(["Service games won", "Net points won"]);
  });

  test("every cut row names its points for the screen-reader label", () => {
    for (const row of ALL_ROWS.filter((r) => r.cut)) {
      expect(row.noun, row.label).toBeTruthy();
    }
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
        for (const key of Object.keys(sideCut(row.cut, side, row.sideBy))) {
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

  test("return rows take the side as the player NOT serving", () => {
    // Your first-serve returns are the opponent's first serves.
    for (const label of [
      "First serve returns won",
      "Second serve returns won",
      "Break points converted",
    ]) {
      const row = byConfig(label);
      expect(row.sideBy, label).toBe("returner");
      expect(sideCut(row.cut!, "you", row.sideBy)).toEqual({
        ...row.cut,
        server: "opp",
      });
      expect(sideCut(row.cut!, "opp", row.sideBy)).toEqual({
        ...row.cut,
        server: "you",
      });
    }
  });

  test("total points won takes the side as the point's winner", () => {
    const row = byConfig("Total points won");
    expect(sideCut(row.cut!, "you", row.sideBy)).toEqual({ outcome: "you" });
    expect(sideCut(row.cut!, "opp", row.sideBy)).toEqual({ outcome: "opp" });
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

function byConfig(label: string): H2HRowConfig {
  const row = ALL_ROWS.find((r) => r.label === label);
  if (!row) throw new Error(`no row labelled "${label}"`);
  return row;
}

test.describe("the readout's words", () => {
  test("a fraction reads as made of attempts", () => {
    expect(fractionWords({ value: 75, display: "75%", detail: "9/12" })).toBe(
      "9 of 12",
    );
  });

  test("a count published against a total keeps its figure", () => {
    expect(fractionWords({ value: 68, display: "68", detail: "of 148" })).toBe(
      "68 of 148",
    );
  });

  test("no fraction, or no figure, reads as nothing", () => {
    expect(fractionWords({ value: 6, display: "6" })).toBeNull();
    expect(
      fractionWords({ value: null, display: "", detail: "0/0" }),
    ).toBeNull();
  });

  test("the action line names the count and the tab", () => {
    expect(watchLine(12)).toBe("Watch all 12 in Video");
    // One point is "it", never "all 1".
    expect(watchLine(1)).toBe("Watch it in Video");
  });
});

/* ── Return winners, counted from the points ─────────────────────────────── */

function returnPoint(overrides: Partial<MatchPoint>): MatchPoint {
  return {
    id: "r",
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Backhand Winner",
    eventType: "",
    description: "",
    player: "player1",
    // Player 2 serves, player 1 returns and wins on the return.
    serverIsPlayer1: false,
    wonByPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 2,
    duration: null,
    videoTime: null,
    saved: false,
    savedBy: [],
    secondShotResult: "In",
    ...overrides,
  };
}

const RETURN_WINNERS = ALL_ROWS.filter((r) => r.fromPoints);

function returnWinnersRow(points: MatchPoint[]) {
  const published = buildStatRows(
    RETURN_WINNERS,
    { fractions: {} },
    { fractions: {} },
  );
  return withPointRows(
    RETURN_WINNERS,
    published,
    tallySide(points, true),
    tallySide(points, false),
  )[0];
}

test.describe("return winners", () => {
  test("counts a winning return for the player who returned it", () => {
    const row = returnWinnersRow([
      returnPoint({ id: "a" }),
      returnPoint({ id: "b", pointNumber: 2 }),
    ]);
    expect(row.you.display).toBe("2");
    // The opponent returned nothing, so there is nothing to measure.
    expect(row.opp.display).toBe("");
    expect(row.leader).toBeNull();
  });

  test("zero is a measurement when returns were recorded", () => {
    // Player 1 returned, the return went in, and the rally went on.
    const row = returnWinnersRow([
      returnPoint({ rallyLength: 6, resultType: "Forehand Winner" }),
    ]);
    expect(row.you.display).toBe("0");
    expect(row.you.value).toBe(0);
  });

  test("no recorded returns is an em dash, never a zero", () => {
    const row = returnWinnersRow([
      returnPoint({ secondShotResult: null, rallyLength: 6 }),
    ]);
    expect(row.you.display).toBe("");
  });

  test("a two-shot winner the server won is not a return winner", () => {
    // The mislabelled shot the video pipeline sometimes emits.
    const row = returnWinnersRow([returnPoint({ wonByPlayer1: false })]);
    expect(row.you.display).toBe("0");
    expect(row.opp.display).toBe("");
  });

  test("a service winner never counts", () => {
    const row = returnWinnersRow([
      returnPoint({ resultType: "Service Winner" }),
    ]);
    expect(row.you.display).toBe("0");
  });
});
