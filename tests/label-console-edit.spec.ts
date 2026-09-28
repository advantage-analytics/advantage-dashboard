import { expect, test } from "@playwright/test";

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

/**
 * T6's client-side pure pieces: the court's click sequence and its prompt,
 * the header's save line, and the text the time and position cells accept.
 */

test.describe("court click placement", () => {
  test("first click writes contact_x/y, the second landing_x/y", () => {
    const selected = startPlacement("s-return");
    expect(placementPrompt(selected, 2)).toBe("Click where shot 2 was hit");

    const first = nextPlacement(selected, { x: 1.234, y: 24.567 });
    expect(first).not.toBeNull();
    expect(first!.patch).toEqual({ contact_x: 1.23, contact_y: 24.57 });
    expect(placementPrompt(first!.state, 2)).toBe("Click where shot 2 landed");

    const second = nextPlacement(first!.state, { x: -2.1, y: 3.49 });
    expect(second!.patch).toEqual({ landing_x: -2.1, landing_y: 3.49 });

    // A third click starts over at the hit, on the same stroke.
    expect(second!.state).toEqual({ shotId: "s-return", target: "contact" });
    expect(placementPrompt(second!.state, 2)).toBe(
      "Click where shot 2 was hit",
    );
    expect(nextPlacement(second!.state, { x: 0, y: 1 })!.patch).toEqual({
      contact_x: 0,
      contact_y: 1,
    });
  });

  test("selecting a stroke always starts at the hit", () => {
    const halfway = nextPlacement(startPlacement("a"), { x: 0, y: 0 })!.state;
    expect(halfway.target).toBe("landing");
    expect(startPlacement("b")).toEqual({ shotId: "b", target: "contact" });
  });

  test("with nothing selected a click places nothing and there is no prompt", () => {
    expect(nextPlacement(NO_PLACEMENT, { x: 0, y: 0 })).toBeNull();
    expect(placementPrompt(NO_PLACEMENT, null)).toBeNull();
    expect(placementPrompt(startPlacement("gone"), null)).toBeNull();
  });

  test("a click at the art box's percent position becomes metres via toCourt", () => {
    // The centre of the art box is the centre of the court: the net.
    const centre = toCourt({ sx: 50, sy: 50 });
    const step = nextPlacement(startPlacement("s"), centre)!;
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
