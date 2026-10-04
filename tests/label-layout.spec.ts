import { expect, test } from "@playwright/test";

import {
  DEFAULT_DOCK_SIZE,
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODES,
  LAYOUT_MODE_LABEL,
  LAYOUT_MODE_STORAGE_KEY,
  LAYOUT_SIZE_STORAGE_KEY,
  MIN_DOCK_PX,
  MIN_TABLE_PX,
  clampDockSize,
  parseLayoutMode,
} from "@/components/admin/labels/label-layout";
import {
  COURT_ANCHOR_STORAGE_KEY,
  COURT_MINIMISED_STORAGE_KEY,
} from "@/components/admin/labels/label-court-position";
import {
  DOCK_ANCHOR_STORAGE_KEY,
  DOCK_MINIMISED_STORAGE_KEY,
} from "@/components/admin/labels/label-dock-position";

/**
 * The labelling console's layout modes (T24, `label-layout.ts`): the words,
 * the stored-mode fallback, and the arithmetic that keeps a docked band or
 * column where both the video and the table still work.
 */

test("three modes, the overlay by default, under keys of their own", () => {
  expect(LAYOUT_MODES).toEqual(["overlay", "docked-top", "docked-side"]);
  expect(DEFAULT_LAYOUT_MODE).toBe("overlay");
  expect(LAYOUT_MODE_STORAGE_KEY).toBe("labels-layout-mode");
  expect(LAYOUT_SIZE_STORAGE_KEY).toBe("labels-layout-size");
  // Neither collides with the floating cards' own keys.
  const others = [
    COURT_ANCHOR_STORAGE_KEY,
    COURT_MINIMISED_STORAGE_KEY,
    DOCK_ANCHOR_STORAGE_KEY,
    DOCK_MINIMISED_STORAGE_KEY,
  ];
  expect(others).not.toContain(LAYOUT_MODE_STORAGE_KEY);
  expect(others).not.toContain(LAYOUT_SIZE_STORAGE_KEY);
  // Every mode has the menu's words.
  for (const mode of LAYOUT_MODES) {
    expect(LAYOUT_MODE_LABEL[mode].label.length).toBeGreaterThan(0);
    expect(LAYOUT_MODE_LABEL[mode].description.length).toBeGreaterThan(0);
  }
  expect(LAYOUT_MODE_LABEL.overlay.label).toBe("Overlay");
  expect(LAYOUT_MODE_LABEL["docked-top"].label).toBe("Docked top");
  expect(LAYOUT_MODE_LABEL["docked-side"].label).toBe("Docked side");
});

test("a stored mode parses; anything unknown is the overlay", () => {
  expect(parseLayoutMode("overlay")).toBe("overlay");
  expect(parseLayoutMode("docked-top")).toBe("docked-top");
  expect(parseLayoutMode("docked-side")).toBe("docked-side");
  for (const raw of [null, undefined, "", "docked", "DOCKED-TOP", "1", "{}"]) {
    expect(parseLayoutMode(raw), String(raw)).toBe("overlay");
  }
});

test.describe("the dock's size", () => {
  test("the defaults are the floating cards' own: the court's height, the video's width", () => {
    expect(DEFAULT_DOCK_SIZE).toEqual({
      "docked-top": 318,
      "docked-side": 480,
    });
    expect(MIN_DOCK_PX).toEqual({ "docked-top": 240, "docked-side": 360 });
    expect(MIN_TABLE_PX).toBe(240);
    // The defaults sit inside their own bounds.
    expect(DEFAULT_DOCK_SIZE["docked-top"]).toBeGreaterThanOrEqual(
      MIN_DOCK_PX["docked-top"],
    );
    expect(DEFAULT_DOCK_SIZE["docked-side"]).toBeGreaterThanOrEqual(
      MIN_DOCK_PX["docked-side"],
    );
  });

  test("in range, the size is kept as asked, to the pixel", () => {
    expect(clampDockSize("docked-top", 318, 800)).toBe(318);
    expect(clampDockSize("docked-side", 480, 1400)).toBe(480);
    expect(clampDockSize("docked-top", 300.4, 800)).toBe(300);
  });

  test("the low end: the video never shrinks under its minimum", () => {
    expect(clampDockSize("docked-top", 100, 800)).toBe(240);
    expect(clampDockSize("docked-top", -50, 800)).toBe(240);
    expect(clampDockSize("docked-side", 10, 1400)).toBe(360);
  });

  test("the high end: the table keeps its minimum", () => {
    expect(clampDockSize("docked-top", 700, 800)).toBe(800 - MIN_TABLE_PX);
    expect(clampDockSize("docked-side", 5000, 1400)).toBe(1400 - MIN_TABLE_PX);
  });

  test("a room too small for both minimums gives the dock its minimum, never a negative table", () => {
    // 400px of height: 240 for the video leaves 160, under the table's 240.
    expect(clampDockSize("docked-top", 318, 400)).toBe(
      MIN_DOCK_PX["docked-top"],
    );
    expect(clampDockSize("docked-top", 318, 100)).toBe(
      MIN_DOCK_PX["docked-top"],
    );
    expect(clampDockSize("docked-side", 480, 500)).toBe(
      MIN_DOCK_PX["docked-side"],
    );
    expect(clampDockSize("docked-side", 480, 0)).toBeGreaterThan(0);
  });

  test("not a number: the mode's default, still clamped", () => {
    expect(clampDockSize("docked-top", Number.NaN, 800)).toBe(318);
    expect(clampDockSize("docked-side", Number.POSITIVE_INFINITY, 1400)).toBe(
      480,
    );
    // The default itself bends to a small room.
    expect(clampDockSize("docked-top", Number.NaN, 500)).toBe(
      500 - MIN_TABLE_PX,
    );
  });
});
