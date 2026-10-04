import { expect, test } from "@playwright/test";
import * as React from "react";

import { toCourt } from "@/components/admin/labels/court-geometry";
import {
  NO_PLACEMENT,
  nextPlacement,
  placementPrompt,
  startPlacement,
} from "@/components/admin/labels/court-placement";
import {
  formatCourtPoint,
  formatVideoTime,
  parseCourtPoint,
  parseVideoTime,
} from "@/components/admin/labels/label-format";
import {
  INITIAL_SAVE_STATUS,
  saveStatusReducer,
  saveStatusView,
  type SaveEvent,
} from "@/components/admin/labels/save-status";
import type { LabelShotPatch } from "@/lib/services/labels/edit";
import { labelScores } from "@/lib/services/labels/score";
import type { LabelShot } from "@/lib/services/labels/session";
import type { ShotGeometry } from "@/lib/services/labels/shot-derived";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * T6's client-side pure pieces: the court's click sequence and its prompt,
 * the header's save line, and the text the time and position cells accept.
 */

/** A stroke nobody has placed yet. */
const UNPLACED: ShotGeometry = {
  stroke: "forehand",
  contact_x: null,
  contact_y: null,
  landing_x: null,
  landing_y: null,
};

test.describe("court click placement", () => {
  test("first click writes contact_x/y, the second landing_x/y", () => {
    const selected = startPlacement("s-return");
    expect(placementPrompt(selected, 2)).toBe("Click where shot 2 was hit");

    const first = nextPlacement(selected, { x: 1.234, y: 24.567 }, UNPLACED);
    expect(first).not.toBeNull();
    // Only one end is known: no `result` key, so the stored value stands.
    expect(first!.patch).toEqual({ contact_x: 1.23, contact_y: 24.57 });
    expect(placementPrompt(first!.state, 2)).toBe("Click where shot 2 landed");

    // The landing click completes the pair: `result` rides in the same patch.
    const hit = { ...UNPLACED, ...first!.patch };
    const second = nextPlacement(first!.state, { x: -2.1, y: 3.49 }, hit);
    expect(second!.patch).toEqual({
      landing_x: -2.1,
      landing_y: 3.49,
      result: "in",
    });

    // A third click starts over at the hit, on the same stroke.
    expect(second!.state).toEqual({ shotId: "s-return", target: "contact" });
    expect(placementPrompt(second!.state, 2)).toBe(
      "Click where shot 2 was hit",
    );
    // Re-placing the hit on the landing's own side re-derives the result.
    const placed = { ...hit, ...second!.patch };
    expect(nextPlacement(second!.state, { x: 0, y: 1 }, placed)!.patch).toEqual(
      { contact_x: 0, contact_y: 1, result: "net" },
    );
  });

  test("the landing click's result follows the stroke being placed", () => {
    const landing = { shotId: "s", target: "landing" } as const;
    const from = (stroke: ShotGeometry["stroke"]): ShotGeometry => ({
      ...UNPLACED,
      stroke,
      contact_x: 1,
      contact_y: -0.5,
    });
    // Deep in the far court, past the service line: a rally ball is in, a
    // serve is long.
    const deep = { x: -2, y: 20 };
    expect(nextPlacement(landing, deep, from("backhand"))!.patch.result).toBe(
      "in",
    );
    expect(
      nextPlacement(landing, deep, from("first_serve"))!.patch.result,
    ).toBe("out");
    // A landing click on a stroke with no contact stored derives nothing.
    expect(nextPlacement(landing, deep, UNPLACED)!.patch).toEqual({
      landing_x: -2,
      landing_y: 20,
    });
  });

  test("selecting a stroke always starts at the hit", () => {
    const halfway = nextPlacement(
      startPlacement("a"),
      { x: 0, y: 0 },
      UNPLACED,
    )!.state;
    expect(halfway.target).toBe("landing");
    expect(startPlacement("b")).toEqual({ shotId: "b", target: "contact" });
  });

  test("with nothing selected a click places nothing and there is no prompt", () => {
    expect(nextPlacement(NO_PLACEMENT, { x: 0, y: 0 }, UNPLACED)).toBeNull();
    expect(placementPrompt(NO_PLACEMENT, null)).toBeNull();
    expect(placementPrompt(startPlacement("gone"), null)).toBeNull();
  });

  test("a click at the art box's percent position becomes metres via toCourt", () => {
    // The centre of the art box is the centre of the court: the net.
    const centre = toCourt({ sx: 50, sy: 50 });
    const step = nextPlacement(startPlacement("s"), centre, UNPLACED)!;
    expect(Object.keys(step.patch)).toEqual(["contact_x", "contact_y"]);
    expect(step.patch.contact_x).toBe(0);
    expect(Math.abs(step.patch.contact_y! - 11.885)).toBeLessThanOrEqual(
      0.0051,
    );
  });
});

test.describe("the header's save line", () => {
  const run = (...events: SaveEvent[]) =>
    events.reduce(saveStatusReducer, INITIAL_SAVE_STATUS);
  const NOW = 1_000_000;

  test("draws nothing before the first edit", () => {
    expect(saveStatusView(INITIAL_SAVE_STATUS, NOW)).toEqual({ tone: "idle" });
  });

  test("Saving… while a write is in flight, then Saved · just now", () => {
    expect(saveStatusView(run({ type: "start" }), NOW)).toEqual({
      tone: "saving",
      text: "Saving…",
    });
    expect(
      saveStatusView(run({ type: "start" }, { type: "success", at: NOW }), NOW),
    ).toEqual({ tone: "saved", text: "Saved · just now" });
  });

  test("an error after a failed write", () => {
    const view = saveStatusView(
      run({ type: "start" }, { type: "failure", message: "write refused" }),
      NOW,
    );
    expect(view).toEqual({ tone: "error", text: "Not saved · write refused" });
  });

  test("stays Saving… until every write settles; the last to settle wins", () => {
    const two = run({ type: "start" }, { type: "start" });
    const oneFailed = saveStatusReducer(two, {
      type: "failure",
      message: "x",
    });
    expect(saveStatusView(oneFailed, NOW).tone).toBe("saving");
    expect(
      saveStatusView(
        saveStatusReducer(oneFailed, { type: "success", at: NOW }),
        NOW,
      ).tone,
    ).toBe("saved");
  });

  test('"just now" ages into minutes and hours', () => {
    const saved = run({ type: "start" }, { type: "success", at: NOW });
    expect(saveStatusView(saved, NOW + 59_000)).toMatchObject({
      text: "Saved · just now",
    });
    expect(saveStatusView(saved, NOW + 5 * 60_000)).toMatchObject({
      text: "Saved · 5 min ago",
    });
    expect(saveStatusView(saved, NOW + 2 * 3_600_000)).toMatchObject({
      text: "Saved · 2 h ago",
    });
  });
});

test.describe("cell text", () => {
  test("time parses what formatVideoTime prints", () => {
    for (const seconds of [0, 12.3, 2472, 2473.1, 3723.4]) {
      expect(parseVideoTime(formatVideoTime(seconds))).toBeCloseTo(seconds, 6);
    }
    expect(parseVideoTime("41:13.1")).toBeCloseTo(2473.1, 6);
    expect(parseVideoTime("1:02:03.4")).toBeCloseTo(3723.4, 6);
    expect(parseVideoTime("2472.5")).toBeCloseTo(2472.5, 6);
    expect(parseVideoTime("  ")).toBeNull();
    for (const bad of ["41:61", "1:60:00", "abc", "-3", "1:2:3:4", "4 1"]) {
      expect(parseVideoTime(bad), bad).toBeUndefined();
    }
  });

  test("a position parses what formatCourtPoint prints", () => {
    expect(parseCourtPoint(formatCourtPoint(-0.8, 17.79)!)).toEqual({
      x: -0.8,
      y: 17.79,
    });
    expect(parseCourtPoint("1.2 3")).toEqual({ x: 1.2, y: 3 });
    expect(parseCourtPoint("")).toBeNull();
    for (const bad of ["1.2", "1, 2, 3", "x, 2", "1e3, 2"]) {
      expect(parseCourtPoint(bad), bad).toBeUndefined();
    }
  });
});

test.describe("a typed position (T13)", () => {
  type Props = Record<string, unknown>;
  type Element = React.ReactElement<Props & { children?: React.ReactNode }>;

  /**
   * Every element under `node`, components included. A component that needs
   * hooks (an `EditableCell`, a tooltip root) cannot run outside a render, so
   * its children are walked in its place — and its `editor`, which is where
   * a cell keeps the input it mounts.
   */
  function elements(node: React.ReactNode, out: Element[] = []): Element[] {
    if (Array.isArray(node)) {
      for (const child of node) elements(child, out);
      return out;
    }
    if (!React.isValidElement(node)) return out;
    const element = node as Element;
    out.push(element);
    if (typeof element.type === "function") {
      const error = console.error;
      console.error = () => {};
      try {
        const render = element.type as (p: Props) => React.ReactNode;
        return elements(render(element.props), out);
      } catch {
        elements(element.props.editor as React.ReactNode, out);
      } finally {
        console.error = error;
      }
    }
    return elements(element.props.children, out);
  }

  /** The open point's table, and every patch its rows send. */
  function table() {
    const { LabelPointsTableView } = createLoader().load(
      "src/components/admin/labels/label-points-table.tsx",
    ) as { LabelPointsTableView: (p: Props) => React.ReactNode };
    const session = labelSessionFixture();
    const patches: [string, LabelShotPatch][] = [];
    const tree = LabelPointsTableView({
      points: session.points,
      scores: labelScores(session.points, session.adScoring).points,
      names: { p1: "Lee", p2: "Vargas" },
      expandedPointId: FIXTURE_POINT_IDS.P1,
      editable: true,
      onPatchShot: (id: string, patch: LabelShotPatch) =>
        patches.push([id, patch]),
    });
    /** Type `value` into the position input named `label`, and commit. */
    const type = (label: string, value: { x: number; y: number } | null) => {
      const input = elements(tree).find(
        (el) => el.props.label === `${label}, metres x, y`,
      );
      expect(input, label).toBeDefined();
      (input!.props.onCommit as (v: unknown) => void)(value);
    };
    return { patches, type };
  }

  // The fixture's return: hit at (1.80, 24.49), landed at (-2.10, 3.49), In.

  test("Hit at sends the contact and the result it now derives, in one patch", () => {
    const { patches, type } = table();
    // Hit from the landing's own side of the net: it never crossed.
    type("Shot 2 hit at", { x: 1.8, y: 1 });
    expect(patches).toEqual([
      ["s-return", { contact_x: 1.8, contact_y: 1, result: "net" }],
    ]);
  });

  test("Landed at sends the landing and the result it now derives, in one patch", () => {
    const { patches, type } = table();
    // Past the singles sideline.
    type("Shot 2 landed at", { x: -5, y: 3.49 });
    expect(patches).toEqual([
      ["s-return", { landing_x: -5, landing_y: 3.49, result: "out" }],
    ]);
  });

  test("the result is deriveShotResult of the row after the edit", () => {
    const { positionPatch } = createLoader().load(
      "src/components/admin/labels/label-shot-row.tsx",
    ) as {
      positionPatch: (
        shot: LabelShot,
        end: "contact" | "landing",
        point: { x: number; y: number } | null,
      ) => LabelShotPatch;
    };
    const shots = labelSessionFixture().points.flatMap((p) => p.shots);
    const serve = shots.find((shot) => shot.id === "s-serve")!;
    // The stroke decides: 20.0 m deep is long for a serve…
    expect(positionPatch(serve, "landing", { x: 0.6, y: 20 })).toEqual({
      landing_x: 0.6,
      landing_y: 20,
      result: "out",
    });
    // …and in for the return, whose contact is on the far side.
    const back = shots.find((shot) => shot.id === "s-return")!;
    expect(positionPatch(back, "landing", { x: 0.6, y: 2 }).result).toBe("in");
    // A cleared end leaves nothing to derive from: no `result` key, so the
    // stored value stands — the court click's own rule.
    expect(positionPatch(back, "landing", null)).toEqual({
      landing_x: null,
      landing_y: null,
    });
  });
});
