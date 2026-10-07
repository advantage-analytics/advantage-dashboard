import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  RAIL_DEFAULT_PX,
  RAIL_KEY_STEP_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
} from "@/components/admin/labels/label-layout";
import { tag as tagOf } from "./fixtures/html-probe";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The points rail's handle (T32, board 08l's "The rail's edge"), in both the
 * docked view and the full screen: `label-rail-resize.tsx`, rendered offline
 * through `fixtures/vm-modules`, nothing stubbed — the separator it
 * announces, which way a drag goes, and the key mechanics
 * (`useSeparatorDrag`) in the same file.
 */

const HANDLE = "src/components/admin/labels/label-rail-resize.tsx";

type Props = {
  width: number;
  onResize: (px: number) => void;
  onReset: () => void;
};

function load() {
  return createLoader().load(HANDLE) as {
    LabelRailResize: React.FC<Props>;
    railWidthFromDrag: (
      startWidth: number,
      startX: number,
      clientX: number,
    ) => number;
  };
}

function render(width: number): string {
  const { LabelRailResize } = load();
  return renderToStaticMarkup(
    React.createElement(LabelRailResize, {
      width,
      onResize: () => {},
      onReset: () => {},
    }),
  );
}

test.describe("the rail's resize handle (T32)", () => {
  test("a vertical separator carrying the rail's width and its bounds", () => {
    expect([RAIL_MIN_PX, RAIL_MAX_PX, RAIL_DEFAULT_PX]).toEqual([
      520, 880, 640,
    ]);
    const html = render(640);
    expect(html.match(/role="separator"/g)).toHaveLength(1);
    const separator = tagOf(html, 'role="separator"');
    expect(separator).toContain('aria-orientation="vertical"');
    expect(separator).toContain('aria-label="Resize the points list"');
    expect(separator).toContain('aria-valuemin="520"');
    expect(separator).toContain('aria-valuemax="880"');
    expect(separator).toContain('aria-valuenow="640"');
    expect(separator).toContain('tabindex="0"');
    expect(separator).toContain('data-dragging="false"');
    // Its line and grip are the focus mark, so no global ring on top.
    expect(separator).toContain('data-focus-ring="none"');
    // Pointer drag only: never a native drag, never a tooltip.
    expect(separator).not.toContain("draggable");
    expect(separator).not.toMatch(/\stitle=/);

    expect(tagOf(render(712), 'role="separator"')).toContain(
      'aria-valuenow="712"',
    );
  });

  test("a drag to the LEFT widens the rail, and holds at the bounds", () => {
    const { railWidthFromDrag } = load();
    // 40px left of where it began adds 40px; 40px right takes them away.
    expect(railWidthFromDrag(640, 800, 760)).toBe(680);
    expect(railWidthFromDrag(640, 800, 840)).toBe(600);
    expect(railWidthFromDrag(640, 800, 800)).toBe(640);
    // Measured from where the drag began, not from the last move.
    expect(railWidthFromDrag(640, 800, 700)).toBe(740);
    expect(railWidthFromDrag(640, 800, 100)).toBe(RAIL_MAX_PX);
    expect(railWidthFromDrag(640, 800, 1400)).toBe(RAIL_MIN_PX);
  });

  test("the hook's separator: ← widens and → narrows by one step, Home and End the bounds, Enter the default", () => {
    const { useSeparatorDrag } = createLoader().load(HANDLE) as {
      useSeparatorDrag: (options: {
        value: number;
        min: number;
        max: number;
        growKey: string;
        shrinkKey: string;
        sizeFromDrag: (startSize: number, from: number, at: number) => number;
        onResize: (px: number) => void;
        onReset: () => void;
      }) => {
        dragging: boolean;
        separatorProps: {
          "aria-orientation": string;
          onKeyDown: (event: unknown) => void;
          onDoubleClick: () => void;
        };
      };
    };
    const asked: number[] = [];
    let resets = 0;
    let props: ReturnType<typeof useSeparatorDrag>["separatorProps"] | null =
      null;
    function Probe() {
      const drag = useSeparatorDrag({
        value: 640,
        min: RAIL_MIN_PX,
        max: RAIL_MAX_PX,
        growKey: "ArrowLeft",
        shrinkKey: "ArrowRight",
        sizeFromDrag: (size) => size,
        onResize: (px) => asked.push(px),
        onReset: () => {
          resets += 1;
        },
      });
      props = drag.separatorProps;
      expect(drag.dragging).toBe(false);
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));
    expect(props!["aria-orientation"]).toBe("vertical");

    const press = (key: string, modifiers: Record<string, boolean> = {}) => {
      let prevented = false;
      props!.onKeyDown({
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        ...modifiers,
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    };
    // Each handled key is prevented — what tells the console's own ← / → /
    // Enter shortcuts to stand down.
    expect(press("ArrowLeft")).toBe(true);
    expect(press("ArrowRight")).toBe(true);
    expect(press("Home")).toBe(true);
    expect(press("End")).toBe(true);
    expect(asked).toEqual([
      640 + RAIL_KEY_STEP_PX,
      640 - RAIL_KEY_STEP_PX,
      RAIL_MIN_PX,
      RAIL_MAX_PX,
    ]);
    expect(press("Enter")).toBe(true);
    expect(resets).toBe(1);
    props!.onDoubleClick();
    expect(resets).toBe(2);
    // Anything else, or a chord, is left alone.
    expect(press("a")).toBe(false);
    expect(press("ArrowUp")).toBe(false);
    expect(press("ArrowLeft", { metaKey: true })).toBe(false);
    expect(asked).toHaveLength(4);
  });
});
