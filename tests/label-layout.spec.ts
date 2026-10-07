import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODES,
  RAIL_DEFAULT_PX,
  RAIL_KEY_STEP_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
  clampRailWidth,
  layoutAfterFullscreenRequest,
  parseRailWidth,
  type LabelLayoutMode,
} from "@/components/admin/labels/label-layout";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labelling console's two layouts (`label-layout.ts`): the words, the
 * full screen's two rules, and the arithmetic of the one size both share — the
 * points rail's width. Then the header's Layout menu
 * (`label-layout-control.tsx`), rendered offline.
 */

test("two modes, docked side by default", () => {
  expect(LAYOUT_MODES).toEqual(["docked-side", "black"]);
  expect(DEFAULT_LAYOUT_MODE).toBe("docked-side");
});

test("a request for the browser's full screen settles the layout", () => {
  // It went along: black, in the browser's full screen.
  expect(layoutAfterFullscreenRequest("entered")).toBe("black");
  // Refused: never black under the browser's bars.
  expect(layoutAfterFullscreenRequest("refused")).toBe("docked-side");
  // No Fullscreen API at all: the black layer is the only full screen.
  expect(layoutAfterFullscreenRequest("unsupported")).toBe("black");
});

test.describe("the rail's width", () => {
  test("holds between 520 and 880, 640 by default", () => {
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
