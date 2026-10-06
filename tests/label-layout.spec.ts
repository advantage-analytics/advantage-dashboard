import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as layout from "@/components/admin/labels/label-layout";
import {
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODES,
  LAYOUT_MODE_LABEL,
  LAYOUT_MODE_STORAGE_KEY,
  RAIL_DEFAULT_PX,
  RAIL_KEY_STEP_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
  RAIL_WIDTH_STORAGE_KEY,
  clampRailWidth,
  parseLayoutMode,
  parseRailWidth,
  type LabelLayoutMode,
} from "@/components/admin/labels/label-layout";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labelling console's two layouts (`label-layout.ts`): the words, the
 * stored-mode fallback, and the arithmetic of the one size both share — the
 * points rail's width. Then the header's Layout menu
 * (`label-layout-control.tsx`), rendered offline.
 */

test("two modes, docked side by default, under a key of its own", () => {
  expect(LAYOUT_MODES).toEqual(["docked-side", "black"]);
  expect(DEFAULT_LAYOUT_MODE).toBe("docked-side");
  expect(LAYOUT_MODE_STORAGE_KEY).toBe("labels-layout-mode");
  // Every mode has the menu's words, and only the two modes do.
  expect(Object.keys(LAYOUT_MODE_LABEL)).toEqual(["docked-side", "black"]);
  expect(LAYOUT_MODE_LABEL["docked-side"]).toEqual({
    label: "Docked side",
    description: "Video over the court, the points list on the right",
  });
  expect(LAYOUT_MODE_LABEL.black).toEqual({
    label: "Full screen",
    description: "The same layout on black, filling the whole screen",
  });
});

test("a stored mode parses; anything unknown is docked side", () => {
  expect(parseLayoutMode("docked-side")).toBe("docked-side");
  expect(parseLayoutMode("black")).toBe("black");
  for (const raw of [
    null,
    undefined,
    "",
    "docked",
    "DOCKED-SIDE",
    "BLACK",
    "black ",
    "1",
    "{}",
  ]) {
    expect(parseLayoutMode(raw), String(raw)).toBe("docked-side");
  }
});

test("a mode this console no longer has parses to docked side", () => {
  // What a browser that last used the overlay, the docked band or the film
  // full screen still has under the key.
  for (const legacy of ["overlay", "docked-top", "film"]) {
    expect(parseLayoutMode(legacy), legacy).toBe("docked-side");
  }
});

test("nothing is left of the dock, the divider or the film view", () => {
  for (const gone of [
    "DEFAULT_DOCK_SIZE",
    "MIN_DOCK_PX",
    "MIN_TABLE_PX",
    "MIN_SIDE_COURT_PX",
    "DIVIDER_GAP_PX",
    "DIVIDER_KEY_STEP_PX",
    "LAYOUT_SIZE_STORAGE_KEY",
    "clampDockSize",
    "maxDockSize",
    "dockRoom",
    "parseDockSizes",
    "isFullScreenMode",
  ]) {
    expect(Object.keys(layout), gone).not.toContain(gone);
  }
});

test.describe("the rail's width", () => {
  test("holds between 520 and 880, 640 by default, under its own key", () => {
    expect(RAIL_MIN_PX).toBe(520);
    expect(RAIL_MAX_PX).toBe(880);
    expect(RAIL_DEFAULT_PX).toBe(640);
    expect(RAIL_WIDTH_STORAGE_KEY).toBe("labels-rail-width");
    expect(RAIL_WIDTH_STORAGE_KEY).not.toBe(LAYOUT_MODE_STORAGE_KEY);

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

  test("an arrow press is 16px, and a run of them stops at the bounds", () => {
    expect(RAIL_KEY_STEP_PX).toBe(16);
    let width = RAIL_DEFAULT_PX;
    width = clampRailWidth(width + RAIL_KEY_STEP_PX);
    expect(width).toBe(656);
    width = clampRailWidth(width - 2 * RAIL_KEY_STEP_PX);
    expect(width).toBe(624);
    for (let press = 0; press < 10; press += 1) {
      width = clampRailWidth(width - RAIL_KEY_STEP_PX);
    }
    expect(width).toBe(RAIL_MIN_PX);
    for (let press = 0; press < 60; press += 1) {
      width = clampRailWidth(width + RAIL_KEY_STEP_PX);
    }
    expect(width).toBe(RAIL_MAX_PX);
  });
});

test.describe("the header's Layout menu", () => {
  type ControlProps = {
    mode: LabelLayoutMode;
    onChange: (mode: LabelLayoutMode) => void;
  };
  type ItemProps = {
    label: string;
    description?: string;
    chosen?: boolean;
    onSelect: () => void;
  };

  /**
   * The control with `FloatMenu` opened flat: the trigger, then every row as
   * a plain element carrying what it was given — and the rows' `onSelect`s,
   * in order, for the spec to press.
   */
  function draw(mode: LabelLayoutMode) {
    const rows: ItemProps[] = [];
    const chosen: LabelLayoutMode[] = [];
    const { LabelLayoutControl } = createLoader({
      stubs: {
        "@/components/ui/float-menu": {
          FloatMenu: ({
            trigger,
            label,
            children,
          }: {
            trigger: React.ReactNode;
            label: string;
            children: React.ReactNode;
          }) =>
            React.createElement(
              "div",
              { "data-stub-menu": label },
              trigger,
              children,
            ),
          FloatMenuItem: (props: ItemProps) => {
            rows.push(props);
            return React.createElement(
              "div",
              {
                "data-stub-row": props.label,
                "data-chosen": props.chosen ? "true" : "false",
              },
              props.description,
            );
          },
        },
      },
    }).load("src/components/admin/labels/label-layout-control.tsx") as {
      LabelLayoutControl: React.ComponentType<ControlProps>;
    };
    const html = renderToStaticMarkup(
      React.createElement(LabelLayoutControl, {
        mode,
        onChange: (next) => chosen.push(next),
      }),
    );
    return { html, rows, chosen };
  }

  test("exactly two rows — Docked side, Full screen — each saying what it does", () => {
    const { html, rows } = draw("docked-side");
    expect(html).toContain('data-stub-menu="Layout"');
    expect(rows.map((row) => row.label)).toEqual([
      "Docked side",
      "Full screen",
    ]);
    expect(rows.map((row) => row.description)).toEqual([
      "Video over the court, the points list on the right",
      "The same layout on black, filling the whole screen",
    ]);
    expect(html.match(/data-stub-row=/g)).toHaveLength(2);
    for (const gone of ["Overlay", "Docked top", "Film full screen"]) {
      expect(html, gone).not.toContain(gone);
    }
  });

  test("the current mode is the checked row, and the trigger names it", () => {
    const docked = draw("docked-side");
    expect(docked.rows.map((row) => row.chosen)).toEqual([true, false]);
    expect(docked.html).toMatch(
      /<button[^>]*data-label-layout=""[^>]*data-layout-mode="docked-side"[^>]*aria-label="Layout: Docked side"/,
    );
    const black = draw("black");
    expect(black.rows.map((row) => row.chosen)).toEqual([false, true]);
    expect(black.html).toMatch(
      /<button[^>]*data-label-layout=""[^>]*data-layout-mode="black"[^>]*aria-label="Layout: Full screen"/,
    );
    // It names the control, not the value.
    expect(docked.html).toMatch(/<span>Layout<\/span>/);
  });

  test("choosing the other row reports it; choosing the current one reports nothing", () => {
    const { rows, chosen } = draw("docked-side");
    rows[0].onSelect();
    expect(chosen).toEqual([]);
    rows[1].onSelect();
    expect(chosen).toEqual(["black"]);
  });
});
