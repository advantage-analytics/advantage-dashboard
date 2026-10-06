import { expect, test } from "@playwright/test";
import * as React from "react";

import {
  toCourt,
  toCourtInHalf,
} from "@/components/admin/labels/court-geometry";
import {
  NO_PLACEMENT,
  flipPlacement,
  hitterHalf,
  nextPlacement,
  placementPrompt,
  setPlacementTarget,
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
    // The contact was on the far side, so that is the half it returns to.
    expect(second!.state).toEqual({
      shotId: "s-return",
      target: "contact",
      half: "far",
      flipped: false,
    });
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
    const landing = {
      shotId: "s",
      target: "landing",
      half: "far",
      flipped: false,
    } as const;
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
    expect(startPlacement("b")).toEqual({
      shotId: "b",
      target: "contact",
      half: "near",
      flipped: false,
    });
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

test.describe("which half the court zooms to", () => {
  const clue = (hitter: "p1" | "p2" | null, contactY: number | null) => ({
    hitter,
    contactY,
  });

  test("the hitter's half: the stored contact, else read off the stroke before, else near", () => {
    // Its own contact wins, whatever came before.
    expect(hitterHalf(clue("p1", 24.5), [clue("p2", 25)])).toBe("far");
    expect(hitterHalf(clue("p1", -0.3))).toBe("near");
    // Unplaced: across the net from the other player's last contact…
    expect(hitterHalf(clue("p2", null), [clue("p1", -0.3)])).toBe("far");
    expect(hitterHalf(clue("p1", null), [clue("p2", 24.5)])).toBe("near");
    // …on the same side as this player's own (a second serve after a fault).
    expect(hitterHalf(clue("p1", null), [clue("p1", 24.5)])).toBe("far");
    // The nearest earlier stroke WITH a contact; tombstones say nothing.
    expect(
      hitterHalf(clue("p1", null), [
        clue("p2", 24.5),
        clue("p1", null),
        { ...clue("p1", 20), status: "deleted" },
      ]),
    ).toBe("near");
    // Nothing to go on: near.
    expect(hitterHalf(clue("p1", null))).toBe("near");
    expect(hitterHalf(clue("p1", null), [clue("p2", null)])).toBe("near");
  });

  test("contact shows the hitter's half, landing the other", () => {
    const contact = startPlacement("s", "far");
    expect(contact).toEqual({
      shotId: "s",
      target: "contact",
      half: "far",
      flipped: false,
    });
    const landing = setPlacementTarget(contact, "landing");
    expect(landing).toMatchObject({ target: "landing", half: "near" });
    expect(setPlacementTarget(landing, "contact")).toEqual(contact);
    // The same target changes nothing; nothing selected has no target to set.
    expect(setPlacementTarget(contact, "contact")).toBe(contact);
    expect(setPlacementTarget(NO_PLACEMENT, "landing")).toBe(NO_PLACEMENT);
  });

  test("a click moves on to the other end, on the half that end belongs on", () => {
    // Contact placed in the near half: the landing is asked for on the far.
    const first = nextPlacement(
      startPlacement("s", "near"),
      { x: 1, y: -0.5 },
      UNPLACED,
    )!;
    expect(first.state).toEqual({
      shotId: "s",
      target: "landing",
      half: "far",
      flipped: false,
    });
    // A contact placed just across the net line still decides by its own y.
    const across = nextPlacement(
      startPlacement("s", "near"),
      { x: 0, y: 12.2 },
      UNPLACED,
    )!;
    expect(across.state.half).toBe("near");
  });

  test("Flip side shows the other half, and is dropped with the end it was for", () => {
    const landing = setPlacementTarget(startPlacement("s", "near"), "landing");
    const flipped = flipPlacement(landing);
    expect(flipped).toEqual({
      shotId: "s",
      target: "landing",
      half: "near",
      flipped: true,
    });
    expect(flipPlacement(flipped)).toEqual(landing);
    expect(flipPlacement(NO_PLACEMENT)).toBe(NO_PLACEMENT);

    // A net ball: the landing click on the hitter's own half derives "net",
    // and the cycle returns to the contact on that same half, unflipped.
    const hit = { ...UNPLACED, contact_x: 1, contact_y: -0.5 };
    const net = nextPlacement(flipped, { x: 0.4, y: 11.2 }, hit)!;
    expect(net.patch).toEqual({
      landing_x: 0.4,
      landing_y: 11.2,
      result: "net",
    });
    expect(net.state).toEqual({
      shotId: "s",
      target: "contact",
      half: "near",
      flipped: false,
    });

    // Switching ends drops the flip: back to the contact on the hitter's
    // half, and the landing is across the net again.
    expect(setPlacementTarget(flipped, "contact")).toEqual(
      startPlacement("s", "near"),
    );
    // A flipped CONTACT is the labeller saying the hitter stood on the other
    // side — so the landing goes across from where they put it…
    const wrongGuess = flipPlacement(startPlacement("s", "near"));
    expect(wrongGuess).toMatchObject({ half: "far", flipped: true });
    expect(setPlacementTarget(wrongGuess, "landing")).toMatchObject({
      half: "near",
      flipped: false,
    });
    // …unless a contact is already stored, which outranks the screen.
    expect(setPlacementTarget(wrongGuess, "landing", -0.5)).toMatchObject({
      half: "far",
    });
  });

  test("a click in the surround still writes a coordinate, and the pair's result", () => {
    // The far half's top-left corner region: long and wide of the lines.
    const out = toCourtInHalf("far", { sx: 4, sy: 3 });
    expect(out.x).toBeLessThan(-5.485);
    expect(out.y).toBeGreaterThan(23.77);
    const hit = { ...UNPLACED, contact_x: 1, contact_y: -0.5 };
    const landing = setPlacementTarget(startPlacement("s", "near"), "landing");
    const step = nextPlacement(landing, out, hit)!;
    expect(step.patch).toEqual({
      landing_x: -9.28,
      landing_y: 26.78,
      result: "out",
    });

    // Deep contact, in the run-off behind the near baseline.
    const deep = toCourtInHalf("near", { sx: 50, sy: 97 });
    const contact = nextPlacement(startPlacement("s", "near"), deep, UNPLACED)!;
    expect(contact.patch).toEqual({ contact_x: 0, contact_y: -3.01 });
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

test.describe("a typed position (T13) and a picked value (T27)", () => {
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

  /**
   * The open point's shots well (`BlackShotsWell`, the rail's rows under the
   * current point), with the stroke `selectedShotId` names carrying its
   * editors — and every patch its rows send.
   */
  function well(selectedShotId: string) {
    const { BlackShotsWell } = createLoader().load(
      "src/components/admin/labels/label-black-shot-row.tsx",
    ) as { BlackShotsWell: (p: Props) => React.ReactNode };
    const session = labelSessionFixture();
    const patches: [string, LabelShotPatch][] = [];
    const tree = BlackShotsWell({
      point: session.points.find((p) => p.id === FIXTURE_POINT_IDS.P1)!,
      edit: {
        editable: true,
        names: { p1: "Lee", p2: "Vargas" },
        selectedShotId,
        onPatchShot: (id: string, patch: LabelShotPatch) =>
          patches.push([id, patch]),
        points: session.points,
        scores: labelScores(session.points, session.adScoring).points,
      },
    });
    /** Type `value` into the position input named `label`, and commit. */
    const type = (label: string, value: { x: number; y: number } | null) => {
      const input = elements(tree).find(
        (el) => el.props.label === `${label}, metres x, y`,
      );
      expect(input, label).toBeDefined();
      (input!.props.onCommit as (v: unknown) => void)(value);
    };
    /**
     * The dropdown named `label`: the menu `SelectEditor` renders, with the
     * rows it offers and the row it shows as chosen.
     */
    const dropdown = (label: string) => {
      const all = elements(tree);
      const editor = all.find(
        (el) =>
          typeof el.type === "function" &&
          el.type.name === "SelectEditor" &&
          el.props.label === label,
      );
      expect(editor, label).toBeDefined();
      const drawn = elements(editor);
      // The design system's menu, never the browser's.
      expect(drawn.map((el) => el.type)).not.toContain("select");
      const menu = drawn.find(
        (el) => typeof el.type === "function" && el.type.name === "MenuSelect",
      );
      expect(menu, `${label}'s MenuSelect`).toBeDefined();
      const props = menu!.props as {
        label: string;
        value: string | undefined;
        options: { value: string; label: string }[];
        onChange: (value: string) => void;
      };
      expect(props.label).toBe(label);
      return {
        value: props.value,
        rows: props.options.map((option) => option.label),
        /** Pick the row reading `row`, as a click on it does. */
        pick(row: string) {
          const option = props.options.find((o) => o.label === row);
          expect(option, row).toBeDefined();
          props.onChange(option!.value);
        },
      };
    };
    return { patches, type, dropdown };
  }

  test("every dropdown is the DS menu, and a pick sends that one field", () => {
    const patches: [string, LabelShotPatch][] = [];
    const on = (shotId: string) => {
      const drawn = well(shotId);
      return {
        dropdown: drawn.dropdown,
        done: () => patches.push(...drawn.patches),
      };
    };

    const back = on("s-return");
    const player = back.dropdown("Shot 2 player");
    expect(player.value).toBe("p2");
    expect(player.rows).toEqual(["Lee", "Vargas"]);
    player.pick("Lee");

    const stroke = back.dropdown("Shot 2 stroke");
    expect(stroke.value).toBe("backhand");
    expect(stroke.rows).toContain("Backhand volley");
    stroke.pick("Forehand");

    // A rally shot's spin prints as recorded…
    const spin = back.dropdown("Shot 2 spin");
    expect(spin.value).toBe("topspin");
    expect(spin.rows).toEqual(["Topspin", "Flat", "Backspin", "Sidespin"]);
    spin.pick("Backspin");
    back.done();
    // …a serve's in Serve › Spin's words, for the same four values.
    const serve = on("s-serve");
    const serveSpin = serve.dropdown("Shot 1 spin");
    expect(serveSpin.value).toBe("flat");
    expect(serveSpin.rows).toEqual(["Kick", "Flat", "Backspin", "Slice"]);
    serveSpin.pick("Kick");
    serve.done();
    // Not set yet: no row is chosen, and any of them can be.
    const added = on("s-added");
    const unset = added.dropdown("Shot 3 spin");
    expect(unset.value).toBeUndefined();
    unset.pick("Flat");
    added.done();

    expect(patches).toEqual([
      ["s-return", { hitter: "p1" }],
      ["s-return", { stroke: "forehand" }],
      ["s-return", { spin: "backspin" }],
      ["s-serve", { spin: "topspin" }],
      ["s-added", { spin: "flat" }],
    ]);
  });

  test("spin reads as the match Video tab prints it", () => {
    const { spinLabel } = createLoader().load(
      "src/components/admin/labels/label-format.ts",
    ) as {
      spinLabel: (stroke: string | null, spin: string | null) => string | null;
    };
    const { shotSpinLabel } = createLoader().load(
      "src/components/dashboard/matches/match-detail/film/film-shots.ts",
    ) as {
      shotSpinLabel: (shot: {
        shotType: string | null;
        spinType: string | null;
      }) => string | null;
    };
    // The same vendor value, on the row the Video tab would draw it on.
    for (const spin of ["topspin", "flat", "backspin", "sidespin"]) {
      expect(spinLabel("second_serve", spin)).toBe(
        shotSpinLabel({ shotType: "Second Serve", spinType: spin }),
      );
      expect(spinLabel("backhand", spin)).toBe(
        shotSpinLabel({ shotType: "Backhand", spinType: spin }),
      );
    }
    expect(spinLabel("first_serve", "topspin")).toBe("Kick");
    expect(spinLabel("forehand", "topspin")).toBe("Topspin");
    expect(spinLabel("forehand", null)).toBeNull();
    expect(spinLabel(null, "sidespin")).toBe("Sidespin");
  });

  // The fixture's return: hit at (1.80, 24.49), landed at (-2.10, 3.49), In.

  test("Hit at sends the contact and the result it now derives, in one patch", () => {
    const { patches, type } = well("s-return");
    // Hit from the landing's own side of the net: it never crossed.
    type("Shot 2 hit at", { x: 1.8, y: 1 });
    expect(patches).toEqual([
      ["s-return", { contact_x: 1.8, contact_y: 1, result: "net" }],
    ]);
  });

  test("the result is deriveShotResult of the row after the edit", () => {
    const { positionPatch } = createLoader().load(
      "src/components/admin/labels/label-format.ts",
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
