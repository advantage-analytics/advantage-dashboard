import { expect, test } from "@playwright/test";

import { readFileSync } from "node:fs";

import {
  errorKindKeyPatch,
  errorKindShotId,
  frameTimePatch,
  hasEarlierServe,
  isErrorKindKey,
  isStrokeKey,
  nextErrorKind,
  strokeKeyChange,
  withServeHitter,
} from "@/components/admin/labels/stroke-keys";
import { spinOptions } from "@/components/admin/labels/label-format";
import type { LabelPoint } from "@/lib/services/labels/session";
import { labelPoint, labelShot } from "./fixtures/label-session";
import {
  MAX_ZOOM,
  NO_ZOOM,
  artPoint,
  carryZoom,
  markEndAt,
  markHitRadius,
  moveWindow,
  panBy,
  wheelZoomDelta,
  runoffGuides,
  windowRunoffs,
  zoomAbout,
} from "@/components/admin/labels/label-court";
import {
  MAX_RUNOFF,
  courtSlide,
  estimatePatch,
  isEstimate,
  nearestEnd,
  nextPlacement,
  placementNotice,
  placementRunoff,
  runoffFor,
  setPlacementTarget,
  startPlacement,
} from "@/components/admin/labels/court-placement";
import {
  COURT_LENGTH,
  HALF_HEIGHT,
  NET_Y,
  fromCourtInWindow,
  halfTopY,
  runoffWindowTop,
  toCourtInWindow,
} from "@/components/admin/labels/court-geometry";
import type { ShotPosition } from "@/lib/services/labels/shot-derived";

test.describe("stroke keys", () => {
  const shot = (stroke: string | null, spin: string | null = null) =>
    ({ stroke, spin }) as Parameters<typeof strokeKeyChange>[1];

  test("letters set the stroke, case-insensitive", () => {
    expect(strokeKeyChange("f", shot(null))).toEqual({ stroke: "forehand" });
    expect(strokeKeyChange("B", shot("forehand"))).toEqual({
      stroke: "backhand",
    });
    expect(strokeKeyChange("o", shot("backhand"))).toEqual({
      stroke: "overhead",
    });
  });

  test("V volleys on the stroke's side and back", () => {
    expect(strokeKeyChange("v", shot("backhand"))).toEqual({
      stroke: "backhand_volley",
    });
    expect(strokeKeyChange("v", shot("forehand_volley"))).toEqual({
      stroke: "forehand",
    });
    expect(strokeKeyChange("v", shot(null))).toEqual({
      stroke: "forehand_volley",
    });
  });

  test("S serves, then switches first and second", () => {
    expect(strokeKeyChange("s", shot("forehand"))).toEqual({
      stroke: "first_serve",
    });
    expect(strokeKeyChange("s", shot("first_serve"))).toEqual({
      stroke: "second_serve",
    });
    expect(strokeKeyChange("s", shot("second_serve"))).toEqual({
      stroke: "first_serve",
    });
  });

  test("S after a serve in the point is a second serve, and still switches", () => {
    expect(strokeKeyChange("s", shot("forehand"), true)).toEqual({
      stroke: "second_serve",
    });
    expect(strokeKeyChange("s", shot(null), true)).toEqual({
      stroke: "second_serve",
    });
    // Already the serve S would make: it switches to the other.
    expect(strokeKeyChange("s", shot("second_serve"), true)).toEqual({
      stroke: "first_serve",
    });
    expect(strokeKeyChange("s", shot("first_serve"), true)).toEqual({
      stroke: "second_serve",
    });
  });

  test("an earlier serve counts; a let, a deleted serve or a later one does not", () => {
    const row = (
      id: string,
      videoTime: number,
      fields: Parameters<typeof labelShot>[2] = {},
    ) => labelShot(id, "pt", { videoTime, ...fields });
    const fault = row("a", 1, { stroke: "first_serve", result: "out" });
    const target = row("b", 2);
    expect(hasEarlierServe({ shots: [fault, target] }, "b", false)).toBe(true);
    // A let is replayed: the serve after it is still the first.
    const let_ = row("a", 1, { stroke: "first_serve", result: "let" });
    expect(hasEarlierServe({ shots: [let_, target] }, "b", false)).toBe(false);
    const gone = row("a", 1, { stroke: "first_serve", status: "deleted" });
    expect(hasEarlierServe({ shots: [gone, target] }, "b", false)).toBe(false);
    const later = row("c", 3, { stroke: "first_serve" });
    expect(hasEarlierServe({ shots: [target, later] }, "b", false)).toBe(false);
  });

  test("a stroke made a serve after the point's first serve takes its hitter", () => {
    const row = (
      id: string,
      videoTime: number,
      fields: Parameters<typeof labelShot>[2] = {},
    ) => labelShot(id, "pt", { videoTime, ...fields });
    const fault = row("a", 1, {
      stroke: "first_serve",
      result: "out",
      hitter: "p1",
    });
    // Added after the fault: seeded as the opponent's.
    const added = row("b", 2, { stroke: null, hitter: "p2" });
    const point = { shots: [fault, added] };
    expect(
      withServeHitter(point, "b", { stroke: "second_serve" }, false),
    ).toEqual({ stroke: "second_serve", hitter: "p1" });
    // Already the server's, a rally stroke, a hitter of its own: untouched.
    expect(
      withServeHitter(
        { shots: [fault, { ...added, hitter: "p1" }] },
        "b",
        { stroke: "second_serve" },
        false,
      ),
    ).toEqual({ stroke: "second_serve" });
    expect(withServeHitter(point, "b", { stroke: "forehand" }, false)).toEqual({
      stroke: "forehand",
    });
    expect(
      withServeHitter(
        point,
        "b",
        { stroke: "second_serve", hitter: "p2" },
        false,
      ),
    ).toEqual({ stroke: "second_serve", hitter: "p2" });
    // The point's first serve has no earlier serve to follow, and a let
    // before it is no serve to follow either.
    expect(
      withServeHitter(point, "a", { stroke: "first_serve" }, false),
    ).toEqual({ stroke: "first_serve" });
    const let_ = { ...fault, result: "let" as const };
    expect(
      withServeHitter(
        { shots: [let_, added] },
        "b",
        { stroke: "first_serve" },
        false,
      ),
    ).toEqual({ stroke: "first_serve" });
  });

  test("1–4 are the spin menu's rows; the same value asks for nothing", () => {
    expect(strokeKeyChange("1", shot("forehand"))).toEqual({ spin: "topspin" });
    expect(strokeKeyChange("3", shot("forehand"))).toEqual({
      spin: "backspin",
    });
    expect(strokeKeyChange("2", shot("forehand", "flat"))).toBeNull();
    expect(strokeKeyChange("f", shot("forehand"))).toBeNull();
  });

  test("a serve's Spin menu is Flat, Slice, Kick, and 1–3 pick them", () => {
    expect(spinOptions("first_serve")).toEqual([
      { value: "flat", label: "Flat" },
      { value: "sidespin", label: "Slice" },
      { value: "topspin", label: "Kick" },
    ]);
    expect(spinOptions("second_serve").map((o) => o.label)).toEqual([
      "Flat",
      "Slice",
      "Kick",
    ]);
    // A rally stroke keeps every vendor value.
    expect(spinOptions("forehand").map((o) => o.value)).toEqual([
      "topspin",
      "flat",
      "backspin",
      "sidespin",
    ]);
    expect(strokeKeyChange("1", shot("first_serve"))).toEqual({ spin: "flat" });
    expect(strokeKeyChange("2", shot("first_serve"))).toEqual({
      spin: "sidespin",
    });
    expect(strokeKeyChange("3", shot("second_serve"))).toEqual({
      spin: "topspin",
    });
    // No fourth serve spin.
    expect(strokeKeyChange("4", shot("first_serve"))).toBeNull();
  });

  test("other keys are not stroke keys", () => {
    for (const key of ["x", "5", "Enter", " ", "ff"]) {
      expect(isStrokeKey(key)).toBe(false);
    }
    for (const key of ["f", "B", "v", "o", "S", "1", "4"]) {
      expect(isStrokeKey(key)).toBe(true);
    }
  });
});

test.describe("A adds a shot, C switches contact and landing", () => {
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );

  test("A, C and T are console keys, never stroke keys", () => {
    // Neither is a stroke key: they never change the selected stroke.
    expect(isStrokeKey("a")).toBe(false);
    expect(isStrokeKey("c")).toBe(false);
    expect(isStrokeKey("t")).toBe(false);
  });

  test("T: the frame's file time plus the offset, to the millisecond, or nothing", () => {
    // The trimmed copy starts 940 s into the upload: the player's 0:10.2 is
    // 950.2 on the analysis clock `video_time` stores (file + offset, as
    // `parseFileTime` reads the typed cell).
    const untimed = { videoTime: null };
    expect(frameTimePatch(untimed, 10.2, 940)).toEqual({ video_time: 950.2 });
    expect(frameTimePatch(untimed, 10.2)).toEqual({ video_time: 10.2 });
    // Rounded to milliseconds, like the typed cell.
    expect(frameTimePatch(untimed, 0.12345, 940)).toEqual({
      video_time: 940.123,
    });
    // A move of more than the 0.05 s tolerance is an edit…
    expect(frameTimePatch({ videoTime: 950.1 }, 10.2, 940)).toEqual({
      video_time: 950.2,
    });
    // …anything under it is the same time: no write.
    expect(frameTimePatch({ videoTime: 950.23 }, 10.2, 940)).toBeNull();
    expect(frameTimePatch({ videoTime: 950.2 }, 10.2, 940)).toBeNull();
    // No element, no frame.
    expect(frameTimePatch(untimed, null, 940)).toBeNull();
    expect(frameTimePatch(untimed, Number.NaN, 940)).toBeNull();
  });

  test("R / ⇧R only ask the existing reset confirms, guarded like the other stroke keys", () => {
    expect(source).toContain('lower === "r"');
    expect(source).toContain("? () => resetPointKey.current()");
    expect(source).toContain(": () => resetShotKey.current()");
    const shotBody = source.slice(
      source.indexOf("    resetShotKey.current = () => {"),
    );
    const shotFn = shotBody.slice(0, shotBody.indexOf("\n    };\n"));
    expect(shotFn).toContain(
      "if (!operable || confirm || placement.shotId === null) return false;",
    );
    expect(shotFn).toContain("if (!canResetShot(shot)) return false;");
    expect(shotFn).toContain("rowOperations.onAskResetShot(");
    expect(shotFn).not.toContain("setConfirm");
    const pointBody = source.slice(
      source.indexOf("    resetPointKey.current = () => {"),
    );
    const pointFn = pointBody.slice(0, pointBody.indexOf("\n    };\n"));
    expect(pointFn).toContain("if (!operable || confirm || !expanded)");
    // Whatever changed — fields or only strokes — as the ⋯ menu offers it,
    // never the point's own fields alone (which left ⇧R dead on a point
    // whose strokes alone were edited).
    expect(pointFn).not.toContain("canResetPoint(");
    expect(pointFn).toContain(
      "pointResetScope(expanded, sharesVendorRally(expanded, points))",
    );
    expect(pointFn).toContain("rowOperations.onAskResetPoint(expanded.id)");
    expect(pointFn).not.toContain("setConfirm");
  });

  test("T writes the selected stroke's time from the player, on the console's key reach", () => {
    expect(source).toContain(': lower === "t" && !event.shiftKey\n');
    expect(source).toContain("? () => timeKey.current()");
    const body = source.slice(source.indexOf("    timeKey.current = () => {"));
    const fn = body.slice(0, body.indexOf("\n    };\n"));
    // Read-only, a confirm open or nothing selected: no write, key not taken.
    expect(fn).toContain(
      "if (!editable || confirm || placement.shotId === null) return false;",
    );
    // Never a stroke left selected in another point than the open one, and
    // never a deleted one.
    expect(fn).toContain(
      'if (!owner || !shot || shot.status === "deleted") return false;',
    );
    expect(fn).toContain(
      "if (expanded && owner.id !== expanded.id) return false;",
    );
    // Never `keyShot`: T does not pick a stroke for itself.
    expect(fn).not.toContain("keyShot()");
    // The player's file time, back on the analysis clock, through the shot
    // edit every cell writes with.
    expect(fn).toContain("player.current?.currentTime() ?? null,");
    expect(fn).toContain("fileOffset,");
    expect(fn).toContain("if (patch) requestPatchShot(shot.id, patch);");
    // The handle reads the element on the file's clock; no offset there.
    const video = readFileSync(
      "src/components/admin/labels/label-video.tsx",
      "utf8",
    );
    expect(video).toContain("return videoRef.current?.currentTime ?? null;");
  });

  test("A adds after the selected live stroke, else after the point's last; C flips the court's end", () => {
    expect(source).toContain("addShot(expanded.id, selected);");
    expect(source).toMatch(
      /shot\.id === placement\.shotId && shot\.status !== "deleted",\n\s+\)\n\s+\? placement\.shotId\n\s+: null;/,
    );
    expect(source).toContain(
      'setTarget(placement.target === "contact" ? "landing" : "contact");',
    );
    // Same reach as the stroke keys: never from a field, a menu or a dialog,
    // never with a modifier, never on a held key.
    // The stroke keys' guard, shared: one dispatcher, one reach check.
    expect(source).toContain(": () => addShotKey.current()");
    // ⇧A adds before the selected stroke, else first in the rally.
    expect(source).toContain("? () => addShotBeforeKey.current()");
    expect(source).toContain(
      "addShot(expanded.id, at > 0 ? live[at - 1].id : ADD_SHOT_AT_START);",
    );
    // Delete / Backspace go through the tray's own confirm.
    expect(source).toContain('key === "Delete" || key === "Backspace"');
    expect(source).toContain("? () => endKey.current()");
    // A shot key acts on the open point's stroke: a selection left in
    // another point gives way to the open point's first.
    expect(source).toContain("const keyShot = (): LabelShot | null =>");
    expect(source).toContain(
      "if (live && expanded.shots.some((shot) => shot.id === live.id))",
    );
    expect(source).toContain(
      "if (expanded && owner.id !== expanded.id) return false;",
    );
    // A stroke just added is used at once; what the server reads it from
    // waits for its row: an add behind every add in flight, a split and a
    // remove behind its own, and no serve-hitter follow while it is in flight.
    expect(source).toContain(
      "Promise.all([...addsInFlight.current.values()]).then(() =>",
    );
    expect(source).toContain(
      "afterAdd(shotId, () => operations.splitPoint(pointId, shotId))",
    );
    expect(source).toContain(
      "afterAdd(shotId, () => operations.removeShotsAfter(shotId))",
    );
    expect(source).toContain("!addsInFlight.current.has(shotId) &&");
    // X is the court's Flip side.
    expect(source).toContain("? () => flipKey.current()");
    expect(source).toContain("setPlacement(flipPlacement);");
    expect(isStrokeKey("x")).toBe(false);
    expect(source).toMatch(/consoleKey &&\n\s+!event\.metaKey/);
  });
});

test.describe("E: forced or unforced, on the stroke that ended the point in an error", () => {
  const source = readFileSync(
    "src/components/admin/labels/label-console.tsx",
    "utf8",
  );
  /** Serve in, a return, then `last` by p1 — out unless said otherwise. */
  const rallyPoint = (
    last: Partial<Parameters<typeof labelShot>[2]> = {},
    fields: Partial<LabelPoint> = {},
  ) =>
    labelPoint("e-point", 0, {
      ending: "error",
      endedBy: "p1",
      winner: "p2",
      shots: [
        labelShot("e-serve", "e-point", {
          hitter: "p1",
          stroke: "first_serve",
          result: "in",
          videoTime: 1,
        }),
        labelShot("e-return", "e-point", {
          hitter: "p2",
          stroke: "backhand",
          result: "in",
          videoTime: 2,
        }),
        labelShot("e-last", "e-point", {
          hitter: "p1",
          stroke: "forehand",
          result: "out",
          videoTime: 3,
          ...last,
        }),
      ],
      ...fields,
    });

  test("the pair's stroke: the last live one, on an error point alone", () => {
    expect(errorKindShotId(rallyPoint(), false)).toBe("e-last");
    // A winner, a missed return (service winner), a deleted point: none.
    expect(errorKindShotId(rallyPoint({ result: "in" }), false)).toBeNull();
    const missedReturn = rallyPoint();
    missedReturn.shots = missedReturn.shots.filter((s) => s.id !== "e-return");
    expect(errorKindShotId(missedReturn, false)).toBeNull();
    expect(
      errorKindShotId(rallyPoint({}, { status: "deleted" }), false),
    ).toBeNull();
    // A stored kind on a point that no longer ends in an error offers nothing.
    expect(
      errorKindShotId(
        rallyPoint({ result: "in" }, { errorKind: "forced" }),
        false,
      ),
    ).toBeNull();
    // A tombstone after the miss is not the last stroke: the miss still is.
    const tomb = rallyPoint();
    tomb.shots.push(
      labelShot("e-gone", "e-point", {
        stroke: "forehand",
        status: "deleted",
        statusBeforeDelete: "kept",
        videoTime: 4,
      }),
    );
    expect(errorKindShotId(tomb, false)).toBe("e-last");
  });

  test("E cycles: forced when unmarked, unforced when forced, forced when unforced", () => {
    expect(nextErrorKind(null)).toBe("forced");
    expect(nextErrorKind("forced")).toBe("unforced");
    expect(nextErrorKind("unforced")).toBe("forced");
    expect(errorKindKeyPatch(rallyPoint(), "e-last", false)).toEqual({
      error_kind: "forced",
    });
    expect(
      errorKindKeyPatch(
        rallyPoint({}, { errorKind: "forced" }),
        "e-last",
        false,
      ),
    ).toEqual({ error_kind: "unforced" });
    expect(
      errorKindKeyPatch(
        rallyPoint({}, { errorKind: "unforced" }),
        "e-last",
        false,
      ),
    ).toEqual({ error_kind: "forced" });
  });

  test("E on any other stroke, or on a point not ended in an error, writes nothing", () => {
    for (const other of ["e-serve", "e-return", "e-gone", "nowhere"]) {
      expect(errorKindKeyPatch(rallyPoint(), other, false), other).toBeNull();
    }
    expect(
      errorKindKeyPatch(rallyPoint({ result: "in" }), "e-last", false),
    ).toBeNull();
    expect(isErrorKindKey("e")).toBe(true);
    expect(isErrorKindKey("E")).toBe(true);
    for (const key of ["r", "f", "Enter", "é", "ee"]) {
      expect(isErrorKindKey(key), key).toBe(false);
    }
  });

  test("E rides the shared dispatcher: never from a field, a menu or a dialog, never with a modifier", () => {
    // One branch of the stroke keys' dispatcher, so the one reach check
    // (`keysAreSpoken`: a text field, a menu or dialog open) guards it.
    expect(source).toContain(
      ": isErrorKindKey(key) && !event.shiftKey\n                  ? () => errorKindKey.current()",
    );
    expect(source).toContain("if (!keysAreSpoken(target) && consoleKey()) {");
    expect(source).toContain(
      "target?.closest?.(`${FIELD_SELECTOR}, ${OPEN_LAYER_SELECTOR}`) ||",
    );
    expect(source).toContain("!!document.querySelector(OPEN_LAYER_SELECTOR)");
    const body = source.slice(
      source.indexOf("    errorKindKey.current = () => {"),
    );
    const fn = body.slice(0, body.indexOf("\n    };\n"));
    // Read-only, a confirm open, nothing selected: the key is not taken.
    expect(fn).toContain(
      "if (!operable || confirm || placement.shotId === null) return false;",
    );
    // Only the open point's stroke, and never one it picks for itself.
    expect(fn).toContain(
      "if (expanded && owner.id !== expanded.id) return false;",
    );
    expect(fn).not.toContain("keyShot()");
    // The pair's own rule and its own write: the point patch.
    expect(fn).toContain("errorKindKeyPatch(");
    expect(fn).toContain("if (!patch) return false;");
    expect(fn).toContain("void patchPoint(owner.id, patch);");
  });
});

test.describe("court zoom", () => {
  test("zooming about a point keeps that point still", () => {
    const z = zoomAbout(NO_ZOOM, 2, 25, 75);
    expect(z.scale).toBe(2);
    // The art point under (25, 75) before is still under it after.
    expect(artPoint(z, 25, 75)).toEqual({ sx: 25, sy: 75 });
  });

  test("the art always covers the box, and zoom is bounded", () => {
    expect(zoomAbout(NO_ZOOM, 0.5, 50, 50)).toEqual(NO_ZOOM);
    expect(zoomAbout(NO_ZOOM, 99, 50, 50).scale).toBe(MAX_ZOOM);
    const z = zoomAbout(NO_ZOOM, 2, 0, 0);
    expect(panBy(z, 500, 500)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(panBy(z, -500, -500)).toEqual({ scale: 2, x: -100, y: -100 });
  });

  test("a half's box moves up and down the court, as far as the deepest run-off", () => {
    const near = halfTopY("near");
    expect(moveWindow(near, 3)).toBeCloseTo(near + 3);
    // Past the net: the near box moved up shows the far side's service box.
    const across = moveWindow(near, 8);
    expect(toCourtInWindow(across, { sx: 50, sy: 0 }).y).toBeGreaterThan(
      NET_Y + 6,
    );
    // Bounded at the deepest run-off behind either baseline.
    expect(moveWindow(near, -100)).toBeCloseTo(
      runoffWindowTop("near", MAX_RUNOFF),
    );
    expect(moveWindow(halfTopY("far"), 100)).toBeCloseTo(
      runoffWindowTop("far", MAX_RUNOFF),
    );
    expect(runoffWindowTop("far", MAX_RUNOFF) - HALF_HEIGHT).toBeLessThan(
      COURT_LENGTH,
    );
  });

  test("a mouse notch with ⌃ zooms a step, not to the limit; a pinch is untouched", () => {
    const notch = Math.exp(
      -wheelZoomDelta({ deltaY: -100, deltaMode: 0 }) * 0.01,
    );
    expect(notch).toBeLessThan(1.3);
    expect(notch).toBeGreaterThan(1.1);
    expect(wheelZoomDelta({ deltaY: -3, deltaMode: 1 })).toBe(-20);
    expect(wheelZoomDelta({ deltaY: 4.5, deltaMode: 0 })).toBe(4.5);
  });

  test("a click on a moved box lands where the court under it is", () => {
    const top = moveWindow(halfTopY("near"), -4);
    // The box's bottom edge is HALF_HEIGHT below its top.
    expect(toCourtInWindow(top, { sx: 50, sy: 100 }).y).toBeCloseTo(
      top - HALF_HEIGHT,
    );
  });

  test("a pinch zooms, a scroll or a drag pans, and a drag never places", () => {
    const source = readFileSync(
      "src/components/admin/labels/label-court.tsx",
      "utf8",
    );
    expect(source).toContain("if (event.ctrlKey) {");
    expect(source).toMatch(/top: moveWindow\(\s*state\.top,/);
    expect(source).toMatch(/top: moveWindow\(start\.top, /);
    // A press on an unzoomed half can start a drag now; the whole court's cannot.
    expect(source).toContain("if (zoom.scale === 1 && !zoomed) return;");
    // A two-finger press-and-drag is a right click: it pans, and opens no menu.
    expect(source).toContain(
      "if (event.button !== 0 && event.button !== 2) return;",
    );
    expect(source).toMatch(
      /onContextMenu: \(event[^)]*\) => \{\s+event\.preventDefault\(\);/,
    );
    // The click a drag ends with is still dropped, and a click reads the moved box.
    expect(source).toContain("if (dropClick.current) {");
    expect(source).toMatch(/toCourtInWindow\(\s*top,\s*artPoint\(/);
  });

  test("+ / − and the ⌃ wheel zoom through `zoomAbout`; the anchor's court point holds", () => {
    const source = readFileSync(
      "src/components/admin/labels/label-court.tsx",
      "utf8",
    );
    // + / − about the box centre; the ⌃ wheel about the cursor.
    expect(source).toContain("zoomAbout(z, z.scale * factor, 50, 50)");
    expect(source).toContain(
      "zoomAbout(state.zoom, state.zoom.scale * factor, px, py)",
    );
    const anchors = [
      [50, 50],
      [15, 85],
      [0, 0],
      [100, 100],
      [72, 31],
    ];
    const tops = [halfTopY("near"), halfTopY("far"), moveWindow(30, 0)];
    for (const scale of [1.5, 2.25, 4]) {
      for (const [px, py] of anchors) {
        for (const top of tops) {
          // From the unzoomed court and from an already zoomed, panned one.
          for (const from of [
            NO_ZOOM,
            panBy(zoomAbout(NO_ZOOM, 1.5, 30, 60), -7, 4),
          ]) {
            const before = toCourtInWindow(top, artPoint(from, px, py));
            const z = zoomAbout(from, scale, px, py);
            const after = toCourtInWindow(top, artPoint(z, px, py));
            // Only the clamp may move it, and only at a corner it cannot.
            if (z.x > 100 * (1 - z.scale) && z.x < 0) {
              expect(after.x).toBeCloseTo(before.x, 9);
            }
            if (z.y > 100 * (1 - z.scale) && z.y < 0) {
              expect(after.y).toBeCloseTo(before.y, 9);
            }
          }
          // From the unzoomed court the clamp never bites: exactly still.
          const z = zoomAbout(NO_ZOOM, scale, px, py);
          const p = artPoint(z, px, py);
          expect(p.sx).toBeCloseTo(px, 9);
          expect(p.sy).toBeCloseTo(py, 9);
        }
      }
    }
  });

  test("in then out by the same factor, from any pan, is exactly the unzoomed court", () => {
    for (const scale of [1.5, 2.25, 4, Math.exp(0.2) ** 3]) {
      for (const [px, py] of [
        [50, 50],
        [15, 85],
        [3, 97],
      ]) {
        for (const [dx, dy] of [
          [0, 0],
          [-40, 12],
          [500, -500],
        ]) {
          const z = panBy(zoomAbout(NO_ZOOM, scale, px, py), dx, dy);
          const back = zoomAbout(z, z.scale / scale, 100 - px, py / 2);
          expect(back).toEqual(NO_ZOOM);
          expect(back.scale).toBe(1);
        }
      }
    }
    // A pinch in five wheel events and out five: products, not one factor.
    let z = NO_ZOOM;
    const f = Math.exp(0.2);
    for (let i = 0; i < 5; i++) z = zoomAbout(z, z.scale * f, 15, 85);
    for (let i = 0; i < 5; i++) z = zoomAbout(z, z.scale / f, 15, 85);
    expect(z).toEqual(NO_ZOOM);
  });

  // Reproduced in a browser (dev preview of the real LabelCourt on a near
  // half): pinched to 3.3× on the near baseline's left corner (court
  // y ≈ 0.3 m under the box centre) and dragged, then a placing click flipped
  // the box near → far. The art kept its percent offsets, so the zoomed view
  // jumped 14.5 m to the far service box (y ≈ 14.9 m under the centre) — a
  // spot nobody zoomed to. A slide (27.27 → 30) likewise shifted the centre
  // 2.7 m. The placed point itself was right; the view after it was not.
  test("a placing click's near ↔ far flip, or a slide, keeps the zoomed-to court spot under the centre", () => {
    const near = halfTopY("near");
    const far = halfTopY("far");
    const centre = (z: typeof NO_ZOOM, top: number) =>
      toCourtInWindow(top, artPoint(z, 50, 50));
    // Zoomed to the far half's middle, the box slides back 2.73 m.
    const z = zoomAbout(NO_ZOOM, 2.25, 50, 50);
    const slid = carryZoom(z, far, 30);
    expect(centre(slid, 30).y).toBeCloseTo(centre(z, far).y, 9);
    expect(centre(slid, 30).x).toBeCloseTo(centre(z, far).x, 9);
    // The same offsets, as before this fix, show another spot.
    expect(Math.abs(centre(z, 30).y - centre(z, far).y)).toBeGreaterThan(2);
    // Back again: the same zoom.
    const back = carryZoom(slid, 30, far);
    expect(back.x).toBeCloseTo(z.x, 9);
    expect(back.y).toBeCloseTo(z.y, 9);
    // Near → far from a zoom near the net: the net-side spot stays centred.
    const atNet = panBy(zoomAbout(NO_ZOOM, 4, 50, 5), 0, 0);
    const flipped = carryZoom(atNet, near, far);
    // That spot is off the far box (near side, below its bottom edge), so the
    // art is as far toward it as it can go: the bottom edge, and no further.
    expect(flipped.y).toBeCloseTo(100 * (1 - 4), 9);
    expect(flipped.scale).toBe(4);
    expect(flipped.x).toBe(atNet.x);
  });

  test("carried zoom always covers the box; unzoomed it stays unzoomed", () => {
    const tops = [halfTopY("near"), halfTopY("far"), 30, 9, 20];
    for (const scale of [1.5, 2.25, 4]) {
      for (const from of tops) {
        for (const to of tops) {
          for (const [px, py] of [
            [0, 0],
            [50, 50],
            [100, 100],
            [20, 90],
          ]) {
            const z = carryZoom(zoomAbout(NO_ZOOM, scale, px, py), from, to);
            expect(z.scale).toBe(scale);
            for (const v of [z.x, z.y]) {
              expect(v).toBeLessThanOrEqual(0);
              expect(v).toBeGreaterThanOrEqual(100 * (1 - scale) - 1e-9);
            }
          }
        }
      }
    }
    expect(carryZoom(NO_ZOOM, halfTopY("near"), halfTopY("far"))).toEqual(
      NO_ZOOM,
    );
  });

  test("the court carries the zoom where its box moves, and resets on whole ↔ half or another stroke", () => {
    const source = readFileSync(
      "src/components/admin/labels/label-court.tsx",
      "utf8",
    );
    expect(source).toMatch(
      /zoomState\.zoomed !== zoomed \|\|\s+zoomState\.shotId !== targetShotId/,
    );
    expect(source).toMatch(
      /shotId: targetShotId,\s+zoom: NO_ZOOM,\s+openedTop,\s+top: openedTop,/,
    );
    expect(source).toMatch(
      /} else if \(zoomState\.openedTop !== openedTop\) \{\s+setZoomState\(\{\s+\.\.\.zoomState,\s+zoom: carryZoom\(zoomState\.zoom, zoomState\.top, openedTop\),/,
    );
  });

  test("a court point round-trips through the window and the zoom to within 1 cm", () => {
    const points = [
      { x: 0, y: 0 },
      { x: -4.115, y: NET_Y },
      { x: 5.48, y: COURT_LENGTH },
      { x: -9.9, y: -3.4 },
      { x: 2.3, y: 27.1 },
      { x: 7.1, y: 6.4 },
    ];
    const tops = [
      halfTopY("near"),
      halfTopY("far"),
      runoffWindowTop("near", MAX_RUNOFF),
      runoffWindowTop("far", MAX_RUNOFF),
      20,
    ];
    for (const scale of [1, 1.5, 2.25, 4]) {
      for (const [px, py, dx, dy] of [
        [50, 50, 0, 0],
        [10, 90, 13, -8],
        [95, 5, -60, 40],
        [33, 66, 500, 500],
      ]) {
        const zoom = panBy(zoomAbout(NO_ZOOM, scale, px, py), dx, dy);
        for (const top of tops) {
          for (const point of points) {
            // Drawn at box percent: the window, then the zoom transform.
            const art = fromCourtInWindow(top, point);
            const sx = zoom.x + art.sx * zoom.scale;
            const sy = zoom.y + art.sy * zoom.scale;
            // Read back as a click there is.
            const back = toCourtInWindow(top, artPoint(zoom, sx, sy));
            expect(Math.abs(back.x - point.x)).toBeLessThan(0.01);
            expect(Math.abs(back.y - point.y)).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  test("a click maps back through the zoom", () => {
    const z = { scale: 2, x: -50, y: -20 };
    // Box centre at 2× offset (-50, -20) shows art (50, 35).
    expect(artPoint(z, 50, 50)).toEqual({ sx: 50, sy: 35 });
    expect(artPoint(NO_ZOOM, 12, 34)).toEqual({ sx: 12, sy: 34 });
  });
});

test.describe("a deep contact: one click, written as clicked", () => {
  const UNPLACED: ShotPosition = {
    stroke: "forehand",
    contact_x: null,
    contact_y: null,
    landing_x: null,
    landing_y: null,
    result: null,
  };

  test("a click inside the usual run-off places it and moves on to the landing", () => {
    const step = nextPlacement(
      startPlacement("s", "near"),
      { x: 1, y: -2.5 },
      UNPLACED,
      [],
    )!;
    expect(step.patch).toEqual({ contact_x: 1, contact_y: -2.5 });
    expect(step.state.target).toBe("landing");
  });

  test("a click at the run-off's back edge is stored as clicked and moves on to the landing", () => {
    const start = startPlacement("s", "near");
    const edge = nextPlacement(start, { x: -2.4, y: -3.3 }, UNPLACED, [])!;
    // Never clamped inside the run-off, and no second click to grow it.
    expect(edge.patch).toEqual({ contact_x: -2.4, contact_y: -3.3 });
    expect(edge.state).toEqual({
      shotId: "s",
      target: "landing",
      half: "far",
      flipped: false,
    });
    // Past the usual edge (the box moved deeper): the same.
    const deep = nextPlacement(start, { x: 0, y: -9.4 }, UNPLACED, [])!;
    expect(deep.patch).toEqual({ contact_x: 0, contact_y: -9.4 });
    expect(deep.state.target).toBe("landing");
    // The far half too.
    const far = nextPlacement(
      startPlacement("s", "far"),
      { x: 0, y: 23.77 + 3.4 },
      UNPLACED,
      [],
    )!;
    expect(far.state).toMatchObject({ target: "landing", half: "near" });
  });

  test("the run-off covers a stored deep contact, capped", () => {
    expect(runoffFor(1)).toBe(3.5);
    expect(runoffFor(3.2)).toBe(5.5);
    expect(runoffFor(7.1)).toBe(9.5);
    expect(runoffFor(40)).toBe(MAX_RUNOFF);
    const contact = startPlacement("s", "near");
    expect(placementRunoff(contact, -4.2)).toBe(5.5);
    expect(placementRunoff(contact, null)).toBe(3.5);
    // A landing draws the usual run-off.
    expect(placementRunoff(setPlacementTarget(contact, "landing"), -4.2)).toBe(
      3.5,
    );
  });

  test("the slide and its guides: +2 m steps out to the run-off", () => {
    const shot = {
      contactX: 1,
      contactY: -4.2,
      landingX: null,
      landingY: null,
    };
    const slide = courtSlide(startPlacement("s", "near"), shot);
    expect(slide).toEqual({
      kind: "deep",
      top: expect.any(Number),
      half: "near",
      runoff: 5.5,
    });
    expect(runoffGuides("near", 5.5)).toEqual([
      { metres: 2, y: -2 },
      { metres: 4, y: -4 },
    ]);
    expect(runoffGuides("far", 8).map((g) => g.metres)).toEqual([2, 4, 6, 8]);
    // Inside the usual run-off, no slide.
    expect(
      courtSlide(startPlacement("s", "near"), { ...shot, contactY: -1 }),
    ).toBeNull();
  });
});

test.describe("after a landing: the next stroke's contact", () => {
  const PLACED: ShotPosition = {
    stroke: "forehand",
    contact_x: 1,
    contact_y: -0.5,
    landing_x: null,
    landing_y: null,
    result: null,
  };
  const RALLY = [
    { id: "s1", hitter: "p1" as const, contactY: -0.5 },
    { id: "s2", hitter: "p2" as const, contactY: null },
    { id: "s3", hitter: "p1" as const, contactY: null },
  ];
  const landingOf = (shotId: string) =>
    setPlacementTarget(startPlacement(shotId, "near"), "landing", -0.5);

  test("the landing arms the next stroke's contact, on its hitter's half", () => {
    const step = nextPlacement(
      landingOf("s1"),
      { x: 0, y: 20 },
      PLACED,
      RALLY,
    )!;
    expect(step.patch).toMatchObject({ landing_x: 0, landing_y: 20 });
    expect(step.state).toEqual({
      shotId: "s2",
      target: "contact",
      half: "far",
      flipped: false,
    });
    // A stored contact on the next stroke says its half.
    const stored = RALLY.map((s) =>
      s.id === "s2" ? { ...s, contactY: -1 } : s,
    );
    expect(
      nextPlacement(landingOf("s1"), { x: 0, y: 20 }, PLACED, stored)!.state
        .half,
    ).toBe("near");
    // The same hitter again (a second serve): the same half.
    const fault = RALLY.map((s) =>
      s.id === "s2" ? { ...s, hitter: "p1" as const } : s,
    );
    expect(
      nextPlacement(landingOf("s1"), { x: 0, y: 20 }, PLACED, fault)!.state
        .half,
    ).toBe("near");
  });

  test("on the point's last stroke nothing is selected after, never the same stroke's contact", () => {
    const last = nextPlacement(
      landingOf("s3"),
      { x: 0, y: 20 },
      PLACED,
      RALLY,
    )!;
    expect(last.state.shotId).toBeNull();
    // A stroke the list does not hold lets go too.
    expect(
      nextPlacement(landingOf("gone"), { x: 0, y: 20 }, PLACED, RALLY)!.state
        .shotId,
    ).toBeNull();
  });

  test("the notice: after such a landing only", () => {
    const landing = landingOf("s1");
    const step = nextPlacement(landing, { x: 0, y: 20 }, PLACED, RALLY)!;
    expect(placementNotice(landing, step.state, 2)).toBe(
      "Landing placed · next: shot 2 contact",
    );
    // After a contact: none.
    const contact = startPlacement("s2", "far");
    const hit = nextPlacement(contact, { x: 0, y: 24 }, PLACED, RALLY)!;
    expect(placementNotice(contact, hit.state, 2)).toBeNull();
    // After the last stroke's landing: none.
    const end = nextPlacement(landingOf("s3"), { x: 0, y: 20 }, PLACED, RALLY)!;
    expect(placementNotice(landingOf("s3"), end.state, null)).toBeNull();
  });
});

test.describe("the run-off guides on screen", () => {
  test("a half's own box shows its usual run-off; a moved box as deep as it reaches", () => {
    expect(windowRunoffs(halfTopY("near"))).toEqual([
      { half: "near", runoff: 3.5 },
    ]);
    expect(windowRunoffs(halfTopY("far"))).toEqual([
      { half: "far", runoff: 3.5 },
    ]);
    // Dragged 3 m deeper behind the near baseline: guides out to 6.5 m.
    const moved = moveWindow(halfTopY("near"), -3);
    expect(windowRunoffs(moved)).toEqual([{ half: "near", runoff: 6.5 }]);
    expect(runoffGuides("near", 6.5).map((g) => g.metres)).toEqual([2, 4, 6]);
    // As far as the box goes: the deepest run-off.
    expect(windowRunoffs(moveWindow(halfTopY("near"), -40))).toEqual([
      { half: "near", runoff: MAX_RUNOFF },
    ]);
    // Mid-court (a short ball's box): no run-off on screen.
    expect(windowRunoffs(18.224)).toEqual([]);
  });
});

test.describe("a short ball: a landing on the hitter's own side is allowed", () => {
  test("the click is written as clicked, and reads as a net ball", () => {
    // The landing armed on the far half (the receiver's); the ball bounced
    // just short of the net on the near side, the hitter's own.
    const landing = setPlacementTarget(
      startPlacement("s", "near"),
      "landing",
      -0.5,
    );
    const step = nextPlacement(
      landing,
      { x: 0.4, y: 11.2 },
      {
        stroke: "backhand",
        contact_x: 0.5,
        contact_y: -0.5,
        landing_x: null,
        landing_y: null,
        result: null,
      },
      [],
    )!;
    expect(step.patch).toEqual({
      landing_x: 0.4,
      landing_y: 11.2,
      result: "net",
    });
  });

  test("the landing view slides across the net while the stored bounce is on the hitter's side", () => {
    const landing = setPlacementTarget(
      startPlacement("s", "near"),
      "landing",
      -0.5,
    );
    const shank = { contactX: 0.5, contactY: -0.5, landingX: 1, landingY: 8.9 };
    expect(courtSlide(landing, shank)).toEqual({
      kind: "shank",
      top: expect.any(Number),
      half: "near",
    });
    // Across the net as usual, or flipped by hand: no slide.
    expect(courtSlide(landing, { ...shank, landingY: 17 })).toBeNull();
    expect(
      courtSlide({ ...landing, flipped: true, half: "near" }, shank),
    ).toBeNull();
    // The contact end never slides across.
    expect(courtSlide(startPlacement("s", "near"), shank)).toBeNull();
  });
});

test.describe("“Off screen, so this is an estimate”", () => {
  test("writes the end's two names into `unclear`, and takes them out again", () => {
    expect(estimatePatch([], "contact", true)).toEqual({
      unclear: ["contact_x", "contact_y"],
    });
    expect(estimatePatch(["spin"], "landing", true)).toEqual({
      unclear: ["spin", "landing_x", "landing_y"],
    });
    expect(
      estimatePatch(["contact_x", "contact_y", "spin"], "contact", false),
    ).toEqual({ unclear: ["spin"] });
    // Never a name twice.
    expect(estimatePatch(["contact_x"], "contact", true)).toEqual({
      unclear: ["contact_x", "contact_y"],
    });
    expect(isEstimate(["landing_y"], "landing")).toBe(true);
    expect(isEstimate(["landing_y"], "contact")).toBe(false);
  });
});

test.describe("a click on a placed end selects it", () => {
  test("`nearestEnd`: the nearer stored end; one placed, that one; none, null", () => {
    const both = { contactX: 1, contactY: 2, landingX: -2, landingY: 8 };
    expect(nearestEnd(both, { x: 1.2, y: 2.1 })).toBe("contact");
    expect(nearestEnd(both, { x: -1.5, y: 7 })).toBe("landing");
    // A tie goes to the contact.
    expect(
      nearestEnd(
        { contactX: 0, contactY: 0, landingX: 2, landingY: 0 },
        {
          x: 1,
          y: 0,
        },
      ),
    ).toBe("contact");
    expect(
      nearestEnd(
        { contactX: 1, contactY: 2, landingX: null, landingY: null },
        {
          x: -2,
          y: 8,
        },
      ),
    ).toBe("contact");
    expect(
      nearestEnd(
        { contactX: null, contactY: null, landingX: -2, landingY: 8 },
        {
          x: 1,
          y: 2,
        },
      ),
    ).toBe("landing");
    expect(
      nearestEnd(
        { contactX: null, contactY: null, landingX: null, landingY: null },
        { x: 0, y: 0 },
      ),
    ).toBeNull();
    expect(nearestEnd({}, { x: 0, y: 0 })).toBeNull();
  });

  // The near half's own box, at its usual 276 × 222 px: 13.68 px a metre.
  const TOP = halfTopY("near");
  const BOX = { width: 276, height: 222 };
  const PX_PER_M = BOX.width / 20.17;
  const stroke = {
    shot: labelShot("s1", "p1", {
      contactX: 1,
      contactY: 2,
      landingX: -2,
      landingY: 8,
    }),
  };
  const at = (x: number, y: number) => fromCourtInWindow(TOP, { x, y });
  const none = { shotId: null, target: null };

  test("the hit radius is the mark's own drawn size, in screen pixels", () => {
    expect(markHitRadius("contact", false)).toBe(5.5);
    expect(markHitRadius("landing", false)).toBe(4);
    expect(markHitRadius("landing", true)).toBeCloseTo(5.75);
  });

  test("on a mark: that stroke on that end; just beside it, nothing (the click places)", () => {
    expect(markEndAt([stroke], TOP, NO_ZOOM, at(1, 2), BOX, none)).toEqual({
      shotId: "s1",
      end: "contact",
    });
    expect(markEndAt([stroke], TOP, NO_ZOOM, at(-2, 8), BOX, none)).toEqual({
      shotId: "s1",
      end: "landing",
    });
    // 0.3 m is 4.1 px: inside the ring's 5.5 px.
    expect(markEndAt([stroke], TOP, NO_ZOOM, at(1.3, 2), BOX, none)).toEqual({
      shotId: "s1",
      end: "contact",
    });
    // 0.5 m is 6.8 px: outside it.
    expect(0.5 * PX_PER_M).toBeGreaterThan(markHitRadius("contact", false));
    expect(markEndAt([stroke], TOP, NO_ZOOM, at(1.5, 2), BOX, none)).toBeNull();
  });

  test("the end being placed is never picked: placing beside an existing mark still places", () => {
    // Re-placing the armed contact right on its old mark places it.
    expect(
      markEndAt([stroke], TOP, NO_ZOOM, at(1, 2), BOX, {
        shotId: "s1",
        target: "contact",
      }),
    ).toBeNull();
    // Armed on the landing, a click 0.5 m from the stroke's own contact (as a
    // short ball's landing would be) places the landing.
    expect(
      markEndAt([stroke], TOP, NO_ZOOM, at(1.5, 2), BOX, {
        shotId: "s1",
        target: "landing",
      }),
    ).toBeNull();
    // A click on the landing's old mark re-places it, not the contact.
    expect(
      markEndAt([stroke], TOP, NO_ZOOM, at(-2, 8), BOX, {
        shotId: "s1",
        target: "landing",
      }),
    ).toBeNull();
    // Right on the other end's mark it is that end.
    expect(
      markEndAt([stroke], TOP, NO_ZOOM, at(1, 2), BOX, {
        shotId: "s1",
        target: "landing",
      }),
    ).toEqual({ shotId: "s1", end: "contact" });
  });

  test("under the labeller's zoom the radius stays in screen pixels", () => {
    const zoom = { scale: 2, x: -50, y: -50 };
    const screen = (x: number, y: number) => {
      const p = at(x, y);
      return { sx: zoom.x + p.sx * zoom.scale, sy: zoom.y + p.sy * zoom.scale };
    };
    expect(markEndAt([stroke], TOP, zoom, screen(1, 2), BOX, none)).toEqual({
      shotId: "s1",
      end: "contact",
    });
    // 0.3 m is 8.2 px at ×2: outside the ring.
    expect(
      markEndAt([stroke], TOP, zoom, screen(1.3, 2), BOX, none),
    ).toBeNull();
  });

  test("an end not drawn (or not placed) is never picked", () => {
    const hidden = { ...stroke, opacity: { hit: 0, landed: 1 } };
    expect(markEndAt([hidden], TOP, NO_ZOOM, at(1, 2), BOX, none)).toBeNull();
    const bare = { shot: labelShot("s2", "p1", { contactX: 1, contactY: 2 }) };
    expect(markEndAt([bare], TOP, NO_ZOOM, at(1, 2), BOX, none)).toEqual({
      shotId: "s2",
      end: "contact",
    });
    expect(markEndAt([bare], TOP, NO_ZOOM, at(-2, 8), BOX, none)).toBeNull();
  });

  test("the court asks before it places; the console selects through `selectShot`", () => {
    const court = readFileSync(
      "src/components/admin/labels/label-court.tsx",
      "utf8",
    );
    const pick = court.indexOf("markEndAt(strokes, top, zoom, at, rect, {");
    const place = court.indexOf(
      "onPlace(toCourtInWindow(top, artPoint(zoom, at.sx, at.sy)));",
    );
    expect(pick).toBeGreaterThan(-1);
    expect(place).toBeGreaterThan(pick);
    expect(court).toContain("shotId: targetShotId,");
    expect(court).toContain("onSelectShot?.(pick.shotId, pick.end);");
    const panel = readFileSync(
      "src/components/admin/labels/label-court-panel.tsx",
      "utf8",
    );
    expect(panel).toContain(
      "onSelectShot={placing ? onSelectShot : undefined}",
    );
    const console = readFileSync(
      "src/components/admin/labels/label-console.tsx",
      "utf8",
    );
    expect(console).toContain(
      "onSelectShot={(shotId, end) => selectShot(shotId, end)}",
    );
  });
});
