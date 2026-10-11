import { expect, test } from "@playwright/test";

import { H2H_GROUPS } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import {
  DEFAULT_WINDOW,
  STATISTIC_GROUPS,
  WINDOW_OPTIONS,
  averageOf,
  parseWindow,
  rollingMean,
  windowChange,
} from "@/lib/data/statistics";

/**
 * The Statistics page's catalogue and rolling-window arithmetic.
 *
 * Pure and offline. What goes wrong here never looks wrong on screen: a missing
 * statistic averaged in as a zero draws a perfectly smooth, perfectly false
 * dip, and a change computed against a half-filled window is just a number.
 */

const ALL = STATISTIC_GROUPS.flatMap((group) => group.statistics);

test.describe("the catalogue", () => {
  test("is the head-to-head card's fifteen rows, in its order", () => {
    expect(STATISTIC_GROUPS.map((group) => group.title)).toEqual([
      "Serve",
      "Return",
      "Points",
    ]);
    expect(ALL).toHaveLength(15);
    expect(ALL.map((statistic) => statistic.label)).toEqual(
      H2H_GROUPS.flatMap((g) => g.configs.map((c) => c.label)),
    );
  });

  test("agrees with the card on format and on which rows read lower-is-better", () => {
    const configs = H2H_GROUPS.flatMap((g) => g.configs);
    ALL.forEach((statistic, i) => {
      // The one deliberate departure: this page shows total points won as a
      // percentage of the points played, the card as a count.
      if (statistic.key !== "totalPointsWon") {
        expect(statistic.format, statistic.label).toBe(
          configs[i].isPercentage ? "percent" : "count",
        );
      }
      expect(statistic.lowerIsBetter, statistic.label).toBe(
        configs[i].lowerIsBetter === true,
      );
    });
    expect(new Set(ALL.map((statistic) => statistic.key)).size).toBe(15);
    expect(ALL.map((statistic) => statistic.key)).toContain("returnWinners");
    expect(
      ALL.find((statistic) => statistic.key === "totalPointsWon")?.format,
    ).toBe("percent");
  });
});

test.describe("averageOf", () => {
  test("is the mean of the present finite values", () => {
    expect(averageOf([10, 20, 30])).toBe(20);
    expect(averageOf([10, null, undefined, 20, Number.NaN])).toBe(15);
  });

  test("keeps a legitimate zero", () => {
    expect(averageOf([0, 10])).toBe(5);
    expect(averageOf([0, 0])).toBe(0);
  });

  test("is null over nothing", () => {
    expect(averageOf([])).toBeNull();
    expect(averageOf([null, undefined])).toBeNull();
  });
});

test.describe("rollingMean", () => {
  test("gives one entry per full trailing window", () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
    expect(rollingMean([1, 2, 3], 3)).toEqual([2]);
  });

  test("skips nulls instead of zeroing them", () => {
    expect(rollingMean([10, null, 20], 3)).toEqual([15]);
  });

  test("keeps legitimate zeros", () => {
    expect(rollingMean([0, 0, 30], 3)).toEqual([10]);
    expect(rollingMean([0, 0, 0], 3)).toEqual([0]);
  });

  test("is null for a window that measured nothing", () => {
    expect(rollingMean([null, null, null, 6], 3)).toEqual([null, 6]);
  });

  test("counts matches, not measured values", () => {
    // Five matches, three measured: a window of 5 is full; a window of 10 is not.
    expect(rollingMean([10, null, 20, null, 30], 5)).toEqual([20]);
    expect(rollingMean([10, null, 20, null, 30], 10)).toEqual([]);
  });

  test("is empty when Off or when the series is shorter than the window", () => {
    expect(rollingMean([1, 2, 3, 4, 5], null)).toEqual([]);
    expect(rollingMean([1, 2], 3)).toEqual([]);
    expect(rollingMean([], 3)).toEqual([]);
  });
});

test.describe("windowChange", () => {
  test("is the last window against the one before it", () => {
    // Last three average 50, the three before them 20.
    expect(windowChange([10, 20, 30, 40, 50, 60], 3)).toBe(30);
    expect(windowChange([60, 50, 40, 30, 20, 10], 3)).toBe(-30);
    // Only the trailing 2 × window matches take part.
    expect(windowChange([999, 10, 20, 30, 40, 50, 60], 3)).toBe(30);
  });

  test("does not leak binary noise into the difference", () => {
    expect(windowChange([12.1, 12.1, 12.1, 15.3, 15.3, 15.3], 3)).toBe(3.2);
  });

  test("is null below 2 × window matches", () => {
    expect(windowChange([10, 20, 30, 40, 50], 3)).toBeNull();
    expect(windowChange([10, 20, 30], 3)).toBeNull();
    expect(windowChange([], 3)).toBeNull();
  });

  test("is null when either window measured nothing", () => {
    expect(windowChange([null, null, null, 40, 50, 60], 3)).toBeNull();
    expect(windowChange([10, 20, 30, null, null, null], 3)).toBeNull();
  });

  test("skips nulls inside a window", () => {
    expect(windowChange([10, null, 20, 30, null, 40], 3)).toBe(20);
  });

  test("is null when Off", () => {
    expect(windowChange([10, 20, 30, 40, 50, 60], null)).toBeNull();
  });
});

test.describe("the window options", () => {
  test("are Off, 3, 5 and 10, defaulting to 5", () => {
    expect(WINDOW_OPTIONS).toEqual([null, 3, 5, 10]);
    expect(DEFAULT_WINDOW).toBe(5);
  });

  test("parseWindow reads the four values and defaults the rest", () => {
    expect(parseWindow("off")).toBeNull();
    expect(parseWindow("3")).toBe(3);
    expect(parseWindow("5")).toBe(5);
    expect(parseWindow("10")).toBe(10);
    for (const raw of ["", "4", "OFF", "03", "ten", null, undefined]) {
      expect(parseWindow(raw)).toBe(DEFAULT_WINDOW);
    }
  });
});
