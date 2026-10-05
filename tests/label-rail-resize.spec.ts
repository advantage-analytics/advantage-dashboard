import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DIVIDER_KEY_STEP_PX,
  RAIL_DEFAULT_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
  clampRailWidth,
} from "@/components/admin/labels/label-layout";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The black view's rail handle (T32, board 08l's "The rail's edge"):
 * `label-rail-resize.tsx`, rendered offline through `fixtures/vm-modules`,
 * nothing stubbed. Its drag and keys are `LabelDivider`'s (`useSeparatorDrag`),
 * so what is held here is the handle's own half — the separator it announces,
 * the three looks it carries, and which way a drag goes.
 */

const HANDLE = "src/components/admin/labels/label-rail-resize.tsx";
const DIVIDER = "src/components/admin/labels/label-divider.tsx";

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

/** The opening tag that carries `needle`. */
function tagOf(html: string, needle: string): string {
  const at = html.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The class tokens of the tag that carries `needle`. */
function classesOf(html: string, needle: string): string[] {
  const match = /class="([^"]*)"/.exec(tagOf(html, needle));
  expect(match, needle).not.toBeNull();
  return match![1].split(/\s+/);
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

  test("it lies across the rail's left edge, an 8px strip", () => {
    const classes = classesOf(render(640), 'role="separator"');
    for (const token of [
      "group",
      "absolute",
      "-left-1",
      "inset-y-0",
      "w-2",
      "cursor-col-resize",
      "touch-none",
      "select-none",
      "focus-visible:outline-none",
    ]) {
      expect(classes, token).toContain(token);
    }
  });

  test("at rest nothing shows; hover fades a 1px line and a 4×32 grip in", () => {
    const html = render(640);
    const line = classesOf(html, "data-rail-resize-line");
    const grip = classesOf(html, "data-rail-resize-grip");
    for (const part of [line, grip]) {
      expect(part).toContain("opacity-0");
      expect(part).toContain("group-hover:opacity-100");
      expect(part).toContain("transition-opacity");
      expect(part).toContain("duration-200");
    }
    expect(line).toContain("w-px");
    expect(line).toContain("bg-[rgba(255,255,255,0.45)]");
    expect(grip).toContain("w-1");
    expect(grip).toContain("h-8");
    expect(grip).toContain("rounded-[2px]");
    expect(grip).toContain("bg-[rgba(255,255,255,0.85)]");
    expect(tagOf(html, "data-rail-resize-line")).toContain(
      'aria-hidden="true"',
    );
    expect(tagOf(html, "data-rail-resize-grip")).toContain(
      'aria-hidden="true"',
    );
  });

  test("dragging or keyboard focus: a 2px blue line, a 4×40 white grip with a halo", () => {
    const html = render(640);
    const line = classesOf(html, "data-rail-resize-line");
    const grip = classesOf(html, "data-rail-resize-grip");
    for (const state of ["group-focus-visible", "group-data-[dragging=true]"]) {
      expect(line, state).toContain(`${state}:opacity-100`);
      expect(line, state).toContain(`${state}:w-0.5`);
      expect(line, state).toContain(`${state}:bg-[var(--blue)]`);
      expect(grip, state).toContain(`${state}:opacity-100`);
      expect(grip, state).toContain(`${state}:h-10`);
      expect(grip, state).toContain(`${state}:bg-white`);
      expect(grip, state).toContain(
        `${state}:shadow-[0_0_0_3px_rgba(59,130,246,0.35)]`,
      );
    }
  });

  test("the width clamps at both ends", () => {
    expect(clampRailWidth(RAIL_MIN_PX - 1)).toBe(RAIL_MIN_PX);
    expect(clampRailWidth(0)).toBe(RAIL_MIN_PX);
    expect(clampRailWidth(RAIL_MAX_PX + 1)).toBe(RAIL_MAX_PX);
    expect(clampRailWidth(4000)).toBe(RAIL_MAX_PX);
    expect(clampRailWidth(RAIL_MIN_PX)).toBe(RAIL_MIN_PX);
    expect(clampRailWidth(RAIL_MAX_PX)).toBe(RAIL_MAX_PX);
    expect(clampRailWidth(700.4)).toBe(700);
    expect(clampRailWidth(Number.NaN)).toBe(RAIL_DEFAULT_PX);
    // A key step from either end stays inside.
    expect(clampRailWidth(RAIL_MAX_PX + DIVIDER_KEY_STEP_PX)).toBe(RAIL_MAX_PX);
    expect(clampRailWidth(RAIL_MIN_PX - DIVIDER_KEY_STEP_PX)).toBe(RAIL_MIN_PX);
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

  test("the drag is LabelDivider's, not a second one", () => {
    const handle = readFileSync(HANDLE, "utf8");
    expect(handle).toContain("useSeparatorDrag");
    for (const own of [
      "setPointerCapture",
      "onPointerDown=",
      "onDragStart",
      "draggable",
    ]) {
      expect(handle, own).not.toContain(own);
    }
    const divider = readFileSync(DIVIDER, "utf8");
    expect(divider.match(/setPointerCapture\(/g)).toHaveLength(1);
    expect(divider).toContain("export function useSeparatorDrag");
  });
});
