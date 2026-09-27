import { expect, test } from "@playwright/test";
import {
  truncatePillLabels,
  legendItemsFor,
} from "@/components/dashboard/matches/match-detail/shots/viz-labels";

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

/**
 * G2b — the focused legend is built from the (cut, chart) pair, not
 * hardcoded per call site, so a later chart/cut (G3's "heat"/"rallyPosition")
 * only ever needs a new case here.
 */
test.describe("legendItemsFor", () => {
  test("serve scatter: won, lost, miss, ace(star)", () => {
    const items = legendItemsFor("serve", "scatter");
    expect(items.map((i) => i.label)).toEqual([
      "Point won",
      "Lost",
      "Miss",
      "Ace",
    ]);
    const ace = items.find((i) => i.label === "Ace")!;
    expect(ace.glyph).toBe("star");
  });

  test("serve zones: outcome trio only, no ace", () => {
    const items = legendItemsFor("serve", "zones");
    expect(items.map((i) => i.label)).toEqual(["Point won", "Lost", "Miss"]);
  });

  test("returnPlacement scatter: won, lost, miss, forehand(circle), backhand(triangle)", () => {
    const items = legendItemsFor("returnPlacement", "scatter");
    expect(items.map((i) => i.label)).toEqual([
      "Point won",
      "Lost",
      "Miss",
      "Forehand",
      "Backhand",
    ]);
    const forehand = items.find((i) => i.label === "Forehand")!;
    const backhand = items.find((i) => i.label === "Backhand")!;
    expect(forehand.glyph).toBe("circle");
    expect(backhand.glyph).toBe("triangle");
    // Neutral ink outline, not an outcome fill — these encode STROKE, not
    // won/lost/miss.
    expect(forehand.outline).toBe(true);
    expect(backhand.outline).toBe(true);
  });

  test("returnContact scatter: same shape legend as returnPlacement", () => {
    const items = legendItemsFor("returnContact", "scatter");
    expect(items.map((i) => i.label)).toEqual([
      "Point won",
      "Lost",
      "Miss",
      "Forehand",
      "Backhand",
    ]);
  });

  test("every item has a unique key", () => {
    for (const [cut, chart] of [
      ["serve", "scatter"],
      ["serve", "zones"],
      ["returnPlacement", "scatter"],
      ["returnContact", "scatter"],
    ] as const) {
      const items = legendItemsFor(cut, chart);
      expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    }
  });

  // G3b — heat always reads as the one ramp entry, regardless of cut: the
  // cells' own shade IS the chart, same as zones, so it takes priority over
  // any per-cut dot-shape legend (rallyPosition's Forehand/Backhand included).
  test("chart heat: exactly one ramp entry, on every cut", () => {
    for (const cut of [
      "serve",
      "returnPlacement",
      "returnContact",
      "rallyPosition",
    ] as const) {
      const items = legendItemsFor(cut, "heat");
      expect(items).toHaveLength(1);
      expect(items[0].glyph).toBe("ramp");
    }
  });

  test("rallyPosition scatter: won, lost, forehand(circle), backhand(triangle) — no miss", () => {
    const items = legendItemsFor("rallyPosition", "scatter");
    expect(items.map((i) => i.label)).toEqual([
      "Point won",
      "Lost",
      "Forehand",
      "Backhand",
    ]);
  });
});
