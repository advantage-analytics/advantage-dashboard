import { expect, test } from "@playwright/test";

import {
  DEFAULT_DOCK_SIZE,
  DEFAULT_LAYOUT_MODE,
  DIVIDER_GAP_PX,
  DIVIDER_KEY_STEP_PX,
  LAYOUT_MODES,
  LAYOUT_MODE_LABEL,
  LAYOUT_MODE_STORAGE_KEY,
  LAYOUT_SIZE_STORAGE_KEY,
  MIN_DOCK_PX,
  MIN_SIDE_COURT_PX,
  MIN_TABLE_PX,
  RAIL_DEFAULT_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
  RAIL_WIDTH_STORAGE_KEY,
  clampDockSize,
  clampRailWidth,
  dockRoom,
  maxDockSize,
  parseDockSizes,
  parseLayoutMode,
  parseRailWidth,
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

test("four modes, the overlay by default, under keys of their own", () => {
  expect(LAYOUT_MODES).toEqual([
    "overlay",
    "docked-top",
    "docked-side",
    "black",
  ]);
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
  expect(LAYOUT_MODE_LABEL.black.label).toBe("Full screen");
});

test("a stored mode parses; anything unknown is the overlay", () => {
  expect(parseLayoutMode("overlay")).toBe("overlay");
  expect(parseLayoutMode("docked-top")).toBe("docked-top");
  expect(parseLayoutMode("docked-side")).toBe("docked-side");
  for (const raw of [null, undefined, "", "docked", "DOCKED-TOP", "1", "{}"]) {
    expect(parseLayoutMode(raw), String(raw)).toBe("overlay");
  }
});

test.describe("the black full-screen view", () => {
  test("the mode parses and has its words, and the menu lists it last", () => {
    expect(parseLayoutMode("black")).toBe("black");
    expect(parseLayoutMode("BLACK")).toBe("overlay");
    expect(LAYOUT_MODE_LABEL.black).toEqual({
      label: "Full screen",
      description:
        "Black to the edges: film and court on the left, the points rail on the right",
    });
    // Last in the Layout menu (T33): Overlay / Docked top / Docked side /
    // Full screen.
    expect(LAYOUT_MODES[LAYOUT_MODES.length - 1]).toBe("black");
    // No dock, so no dock size: the records stay the two docked modes'.
    expect(Object.keys(DEFAULT_DOCK_SIZE)).toEqual([
      "docked-top",
      "docked-side",
    ]);
    expect(Object.keys(MIN_DOCK_PX)).toEqual(["docked-top", "docked-side"]);
  });

  test("the rail's width holds between 520 and 880, 640 by default", () => {
    expect(RAIL_MIN_PX).toBe(520);
    expect(RAIL_MAX_PX).toBe(880);
    expect(RAIL_DEFAULT_PX).toBe(640);
    expect(RAIL_WIDTH_STORAGE_KEY).toBe("labels-rail-width");
    expect([LAYOUT_MODE_STORAGE_KEY, LAYOUT_SIZE_STORAGE_KEY]).not.toContain(
      RAIL_WIDTH_STORAGE_KEY,
    );

    // Both ends, and the ends themselves.
    expect(clampRailWidth(100)).toBe(520);
    expect(clampRailWidth(519.4)).toBe(520);
    expect(clampRailWidth(520)).toBe(520);
    expect(clampRailWidth(2000)).toBe(880);
    expect(clampRailWidth(880)).toBe(880);
    // Inside, whole pixels.
    expect(clampRailWidth(700.6)).toBe(701);
    // Not a number: the default.
    for (const px of [Number.NaN, Infinity, -Infinity]) {
      expect(clampRailWidth(px), String(px)).toBe(640);
    }
  });

  test("a stored rail width parses; anything else is the default", () => {
    expect(parseRailWidth("700")).toBe(700);
    expect(parseRailWidth("612.5")).toBe(613);
    expect(parseRailWidth("300")).toBe(520);
    expect(parseRailWidth("5000")).toBe(880);
    for (const raw of [null, undefined, "", "  ", "wide", "{}", "640px"]) {
      expect(parseRailWidth(raw), String(raw)).toBe(640);
    }
  });
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

  test("MIN_DOCK_PX: the video stays 240 tall in a band, 360 wide in a column", () => {
    for (const asked of [0, 1, 239, -1000]) {
      expect(clampDockSize("docked-top", asked, 900), String(asked)).toBe(240);
    }
    expect(clampDockSize("docked-top", 240, 900)).toBe(240);
    expect(clampDockSize("docked-top", 241, 900)).toBe(241);
    for (const asked of [0, 1, 359, -1000]) {
      expect(clampDockSize("docked-side", asked, 1400), String(asked)).toBe(
        360,
      );
    }
    expect(clampDockSize("docked-side", 360, 1400)).toBe(360);
    expect(clampDockSize("docked-side", 361, 1400)).toBe(361);
  });

  test("MIN_TABLE_PX: the table keeps 240 in either direction", () => {
    for (const mode of ["docked-top", "docked-side"] as const) {
      for (const asked of [661, 900, 1e6]) {
        const size = clampDockSize(mode, asked, 900);
        expect(size, `${mode} ${asked}`).toBe(660);
        expect(900 - size).toBe(MIN_TABLE_PX);
      }
      expect(clampDockSize(mode, 660, 900)).toBe(660);
      expect(clampDockSize(mode, 659, 900)).toBe(659);
      expect(maxDockSize(mode, 900)).toBe(660);
      // Too small a room: the most is the least, as the clamp has it.
      expect(maxDockSize(mode, 300)).toBe(MIN_DOCK_PX[mode]);
    }
  });
});

test.describe("the divider (T25)", () => {
  test("an arrow press is 16px, and a run of them stops at the bounds", () => {
    expect(DIVIDER_KEY_STEP_PX).toBe(16);
    let size = DEFAULT_DOCK_SIZE["docked-top"];
    size = clampDockSize("docked-top", size + DIVIDER_KEY_STEP_PX, 900);
    expect(size).toBe(334);
    size = clampDockSize("docked-top", size - 2 * DIVIDER_KEY_STEP_PX, 900);
    expect(size).toBe(302);
    for (let press = 0; press < 10; press += 1) {
      size = clampDockSize("docked-top", size - DIVIDER_KEY_STEP_PX, 900);
    }
    expect(size).toBe(MIN_DOCK_PX["docked-top"]);
    for (let press = 0; press < 60; press += 1) {
      size = clampDockSize("docked-top", size + DIVIDER_KEY_STEP_PX, 900);
    }
    expect(size).toBe(900 - MIN_TABLE_PX);
  });

  test("the room is the measured box less the divider's gap", () => {
    expect(DIVIDER_GAP_PX).toBe(16);
    expect(dockRoom("docked-top", { width: 1400, height: 800 })).toBe(784);
    // So at the most, band + gap + table fill the box and the table has 240.
    const band = clampDockSize("docked-top", 5000, 784);
    expect(800 - band - DIVIDER_GAP_PX).toBe(MIN_TABLE_PX);
    // A wide, tall box: the column's room is the width less the gap.
    expect(dockRoom("docked-side", { width: 1400, height: 2000 })).toBe(1384);
  });

  test("docked side, the box's height caps the column so the court keeps its room", () => {
    const box = { width: 1800, height: 700 };
    const room = dockRoom("docked-side", box);
    expect(room).toBeLessThan(box.width - DIVIDER_GAP_PX);
    const column = clampDockSize("docked-side", 5000, room);
    // The video at 16:9 from that width, the gap, and the court's minimum fit.
    expect((column * 9) / 16 + DIVIDER_GAP_PX + MIN_SIDE_COURT_PX).toBeLessThan(
      box.height + 1,
    );
    expect(column).toBeGreaterThan(DEFAULT_DOCK_SIZE["docked-side"]);
    // Whole pixels, though 16:9 of a height rarely is.
    expect(Number.isInteger(room)).toBe(true);
    expect(Number.isInteger(column)).toBe(true);
    // Too short for even the minimum column: the minimum, as ever.
    expect(
      clampDockSize(
        "docked-side",
        480,
        dockRoom("docked-side", { width: 1800, height: 300 }),
      ),
    ).toBe(MIN_DOCK_PX["docked-side"]);
  });

  test("a size from a bigger window is held to this one, and kept as asked", () => {
    const stored = parseDockSizes('{"docked-top":620,"docked-side":900}');
    expect(stored).toEqual({ "docked-top": 620, "docked-side": 900 });
    const small = dockRoom("docked-top", { width: 1200, height: 600 });
    expect(clampDockSize("docked-top", stored["docked-top"], small)).toBe(
      600 - DIVIDER_GAP_PX - MIN_TABLE_PX,
    );
    const big = dockRoom("docked-top", { width: 1200, height: 1100 });
    expect(clampDockSize("docked-top", stored["docked-top"], big)).toBe(620);
  });

  test("stored sizes parse per mode; anything else is that mode's default", () => {
    expect(parseDockSizes(null)).toEqual(DEFAULT_DOCK_SIZE);
    expect(parseDockSizes(undefined)).toEqual(DEFAULT_DOCK_SIZE);
    for (const raw of ["", "nope", "[]", "12", "null", '"docked-top"']) {
      expect(parseDockSizes(raw), raw).toEqual(DEFAULT_DOCK_SIZE);
    }
    expect(parseDockSizes('{"docked-top":400.6}')).toEqual({
      "docked-top": 401,
      "docked-side": 480,
    });
    expect(
      parseDockSizes('{"docked-top":"400","docked-side":-5,"other":1}'),
    ).toEqual(DEFAULT_DOCK_SIZE);
    // A fresh object each time: the defaults are never handed out to mutate.
    expect(parseDockSizes(null)).not.toBe(DEFAULT_DOCK_SIZE);
  });
});
