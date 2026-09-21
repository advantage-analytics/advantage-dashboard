import { expect, test } from "@playwright/test";
import {
  bandEditorBounds,
  bandEditorDirty,
  bandEditorDraftScheme,
  bandEditorPayload,
  bandEditorPreview,
  CONTACT_DATA_BOUNDS_FT,
  DEPTH_EDIT_BOUNDS_FT,
  initBandEditor,
  moveDivider,
  nudgeDivider,
  refitBandEditor,
  resetBandEditor,
  resetPairFor,
  setDivider,
  snapStepFt,
  type BandEditorContext,
} from "@/components/dashboard/matches/match-detail/shots/band-editor-state";
import {
  COURT_HALF_FT,
  DEFAULT_BANDS,
  validateBandInput,
  type BandSettings,
} from "@/lib/data/viz-bands";
import { FT_PER_M } from "@/lib/format/distance";

/**
 * The band editor's pure reducer (Phase 2B, Task 4). Everything the drag
 * editor decides — where a divider may go, how it snaps, when Save is live and
 * what Save writes — is decided here, so none of it depends on a browser.
 */

const FT: BandEditorContext = { unit: "ft", minGapFt: 2 };
const THIRD = COURT_HALF_FT / 3;

const CUSTOM: BandSettings = {
  depthScheme: "custom",
  depthDividersFt: [10, 20],
  contactDividersFt: [-2, 4],
};

test.describe("initBandEditor", () => {
  test("depth, custom: starts from the saved pair", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(s.draft).toEqual([10, 20]);
    expect(s.initial).toEqual([10, 20]);
    expect(s.kind).toBe("depth");
    expect(s.saved).toBe(CUSTOM);
  });

  test("depth, thirds: starts from the resolved thirds pair (unsnapped)", () => {
    const s = initBandEditor("depth", DEFAULT_BANDS);
    expect(s.draft[0]).toBe(THIRD);
    expect(s.draft[1]).toBe((2 * COURT_HALF_FT) / 3);
  });

  test("depth, deepMidShort: starts from its preset pair", () => {
    const s = initBandEditor("depth", {
      ...DEFAULT_BANDS,
      depthScheme: "deepMidShort",
    });
    expect(s.draft).toEqual([10, 24]);
  });

  test("depth, none and inside: start from thirds", () => {
    for (const depthScheme of ["none", "inside"] as const) {
      const s = initBandEditor("depth", { ...DEFAULT_BANDS, depthScheme });
      expect(s.draft).toEqual(resetPairFor("depth"));
    }
  });

  test("contact: starts from the saved contact pair", () => {
    expect(initBandEditor("contact", CUSTOM).draft).toEqual([-2, 4]);
    expect(initBandEditor("contact", DEFAULT_BANDS).draft).toEqual([0, 5]);
  });

  test("a fresh editor is never dirty, for every scheme", () => {
    for (const depthScheme of [
      "none",
      "thirds",
      "deepMidShort",
      "inside",
    ] as const) {
      const saved = { ...DEFAULT_BANDS, depthScheme };
      expect(bandEditorDirty(initBandEditor("depth", saved))).toBe(false);
      expect(bandEditorDirty(initBandEditor("contact", saved))).toBe(false);
    }
    expect(bandEditorDirty(initBandEditor("depth", CUSTOM))).toBe(false);
  });
});

test.describe("snap", () => {
  test("ft: a move lands on the nearest half-foot", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(setDivider(s, 0, 11.2, FT).draft[0]).toBe(11);
    expect(setDivider(s, 0, 11.3, FT).draft[0]).toBe(11.5);
    expect(moveDivider(s, 1, 1.74, FT).draft[1]).toBe(21.5);
  });

  test("m: a move lands on the nearest half-metre, expressed in feet", () => {
    const s = initBandEditor("depth", CUSTOM);
    const next = setDivider(s, 0, 11.2, { unit: "m", minGapFt: 2 });
    // 11.2 ft = 3.41 m → 3.5 m.
    expect(next.draft[0]).toBeCloseTo(3.5 * FT_PER_M, 9);
    expect(snapStepFt("m")).toBeCloseTo(0.5 * FT_PER_M, 9);
    expect(snapStepFt("ft")).toBe(0.5);
  });

  test("a snap that lands back on the starting position restores it exactly", () => {
    // Thirds start off the half-foot grid (12.998 ft). Dragging away and back
    // must return the EXACT value, or Save could never re-deaden.
    const s = initBandEditor("depth", DEFAULT_BANDS);
    const away = setDivider(s, 0, 16, FT);
    expect(away.draft[0]).toBe(16);
    const back = setDivider(away, 0, 13.1, FT);
    expect(back.draft[0]).toBe(THIRD);
  });

  test("an unchanged move returns the same state object", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(setDivider(s, 0, 10.1, FT)).toBe(s);
  });
});

test.describe("min gap", () => {
  test("moving the lower divider into the upper pushes the upper", () => {
    const s = initBandEditor("depth", CUSTOM); // [10, 20]
    const next = setDivider(s, 0, 19.5, { unit: "ft", minGapFt: 3 });
    expect(next.draft).toEqual([19.5, 22.5]);
  });

  test("moving the upper divider into the lower pushes the lower", () => {
    const s = initBandEditor("depth", CUSTOM);
    const next = setDivider(s, 1, 11, { unit: "ft", minGapFt: 3 });
    expect(next.draft).toEqual([8, 11]);
  });

  test("dragging past the other divider never swaps them", () => {
    const s = initBandEditor("depth", CUSTOM);
    const next = setDivider(s, 0, 30, FT);
    expect(next.draft[0]).toBeLessThan(next.draft[1]);
    expect(next.draft[1] - next.draft[0]).toBeGreaterThanOrEqual(2);
  });

  test("a push stops at the bound, and the moved divider gives ground", () => {
    const s = initBandEditor("depth", CUSTOM);
    const next = setDivider(s, 0, 38, { unit: "ft", minGapFt: 3 });
    expect(next.draft).toEqual([
      DEPTH_EDIT_BOUNDS_FT[1] - 3,
      DEPTH_EDIT_BOUNDS_FT[1],
    ]);
  });
});

test.describe("clamps", () => {
  test("depth: clamped between the baseline and the net", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(setDivider(s, 0, -8, FT).draft[0]).toBe(DEPTH_EDIT_BOUNDS_FT[0]);
    expect(setDivider(s, 1, 60, FT).draft[1]).toBe(DEPTH_EDIT_BOUNDS_FT[1]);
    expect(DEPTH_EDIT_BOUNDS_FT[0]).toBeGreaterThan(0);
    expect(DEPTH_EDIT_BOUNDS_FT[1]).toBeLessThan(39);
    expect(bandEditorBounds("depth")).toEqual(DEPTH_EDIT_BOUNDS_FT);
  });

  test("contact: clamped to the DRAWN range, inside the table's −39…30", () => {
    const s = initBandEditor("contact", CUSTOM);
    expect(setDivider(s, 0, -80, FT).draft[0]).toBe(-18);
    expect(setDivider(s, 1, 80, FT).draft[1]).toBe(7.5);
    expect(CONTACT_DATA_BOUNDS_FT).toEqual([-39, 30]);
    expect(bandEditorBounds("contact")).toEqual([-18, 7.5]);
    expect(bandEditorBounds("contact", "ft")).toEqual([-18, 7.5]);
  });

  test("contact bounds in metres are half-metre grid points, rounded inward", () => {
    const [lo, hi] = bandEditorBounds("contact", "m");
    expect(lo).toBeCloseTo(-5 * FT_PER_M, 9); // −18.01 ft = −5.49 m → −5 m
    expect(hi).toBeCloseTo(2 * FT_PER_M, 9); // 7.73 ft = 2.36 m → 2 m
  });

  test("whatever the drag, the payload always validates", () => {
    const moves = [-100, -3.3, 0, 0.7, 12.25, 38.9, 100];
    for (const kind of ["depth", "contact"] as const) {
      for (const saved of [DEFAULT_BANDS, CUSTOM]) {
        for (const index of [0, 1] as const) {
          for (const ft of moves) {
            const s = setDivider(initBandEditor(kind, saved), index, ft, FT);
            expect(validateBandInput(bandEditorPayload(s))).not.toBeNull();
          }
        }
      }
    }
  });
});

test.describe("keyboard nudge", () => {
  test("a nudge smaller than half a snap step still moves one whole step", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(nudgeDivider(s, 0, 0.2, FT).draft[0]).toBe(10.5);
    expect(nudgeDivider(s, 0, -0.2, FT).draft[0]).toBe(9.5);
  });

  test("from an off-grid start the first step lands on the grid", () => {
    const s = initBandEditor("depth", DEFAULT_BANDS); // 12.998
    expect(nudgeDivider(s, 0, 0.2, FT).draft[0]).toBe(13.5);
    expect(nudgeDivider(s, 0, -0.2, FT).draft[0]).toBe(12.5);
  });

  test("a large nudge moves by its own converted distance", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(nudgeDivider(s, 1, 1.9, FT).draft[1]).toBe(22);
  });

  test("a nudge at the bound stays put", () => {
    const s = setDivider(initBandEditor("contact", CUSTOM), 1, 30, FT);
    expect(nudgeDivider(s, 1, 0.2, FT)).toBe(s);
  });
});

test.describe("reset", () => {
  test("depth resets to the thirds pair; contact to [0, 5]", () => {
    const d = resetBandEditor(initBandEditor("depth", CUSTOM));
    expect(d.draft).toEqual([THIRD, (2 * COURT_HALF_FT) / 3]);
    const c = resetBandEditor(initBandEditor("contact", CUSTOM));
    expect(c.draft).toEqual([0, 5]);
  });

  test("reset on a saved thirds record after a drag is clean again", () => {
    const s = setDivider(initBandEditor("depth", DEFAULT_BANDS), 1, 30, FT);
    expect(bandEditorDirty(s)).toBe(true);
    expect(bandEditorDirty(resetBandEditor(s))).toBe(false);
  });

  test("reset on a custom record is dirty and saves as thirds", () => {
    const s = resetBandEditor(initBandEditor("depth", CUSTOM));
    expect(bandEditorDirty(s)).toBe(true);
    expect(bandEditorPayload(s)).toEqual({ ...CUSTOM, depthScheme: "thirds" });
  });
});

test.describe("dirty", () => {
  test("any real move is dirty", () => {
    const s = initBandEditor("depth", CUSTOM);
    expect(bandEditorDirty(setDivider(s, 0, 12, FT))).toBe(true);
    const c = initBandEditor("contact", CUSTOM);
    expect(bandEditorDirty(setDivider(c, 1, 6, FT))).toBe(true);
  });

  test("dragging back to the start re-deadens Save (custom)", () => {
    const s = initBandEditor("depth", CUSTOM);
    const away = setDivider(s, 0, 14, FT);
    expect(bandEditorDirty(away)).toBe(true);
    expect(bandEditorDirty(setDivider(away, 0, 10, FT))).toBe(false);
  });

  test("dragging back to the start re-deadens Save (thirds, off-grid)", () => {
    const s = initBandEditor("depth", DEFAULT_BANDS);
    const away = setDivider(s, 1, 20, FT);
    expect(bandEditorDirty(away)).toBe(true);
    expect(bandEditorDirty(setDivider(away, 1, 26, FT))).toBe(false);
  });

  test("dragging back to the start re-deadens Save (contact)", () => {
    const s = initBandEditor("contact", DEFAULT_BANDS);
    const away = setDivider(s, 0, -4, FT);
    expect(bandEditorDirty(away)).toBe(true);
    expect(bandEditorDirty(setDivider(away, 0, 0.1, FT))).toBe(false);
  });

  test("a drag that pushed the other divider and came back is clean when replayed from the drag's start", () => {
    // The editor replays a pointer drag from the state at pointer-down, so
    // the pushed divider springs back once the dragged one retreats.
    const start = initBandEditor("depth", CUSTOM);
    const pushed = setDivider(start, 0, 19.5, FT);
    expect(pushed.draft[1]).toBeGreaterThan(20);
    expect(bandEditorDirty(setDivider(start, 0, 10, FT))).toBe(false);
  });
});

test.describe("payload", () => {
  test("depth: custom scheme + the (2 dp) draft pair; contact untouched", () => {
    const s = setDivider(initBandEditor("depth", CUSTOM), 0, 12, FT);
    expect(bandEditorPayload(s)).toEqual({
      depthScheme: "custom",
      depthDividersFt: [12, 20],
      contactDividersFt: [-2, 4],
    });
  });

  test("depth from a preset: becomes custom", () => {
    const s = setDivider(initBandEditor("depth", DEFAULT_BANDS), 0, 11, FT);
    const p = bandEditorPayload(s);
    expect(p.depthScheme).toBe("custom");
    expect(p.depthDividersFt).toEqual([11, 26]);
    expect(p.contactDividersFt).toEqual([0, 5]);
  });

  test("contact: only the contact pair changes; depth scheme and dividers untouched", () => {
    const s = setDivider(initBandEditor("contact", CUSTOM), 1, 6, FT);
    expect(bandEditorPayload(s)).toEqual({
      depthScheme: "custom",
      depthDividersFt: [10, 20],
      contactDividersFt: [-2, 6],
    });
    const d = setDivider(initBandEditor("contact", DEFAULT_BANDS), 0, -1, FT);
    expect(bandEditorPayload(d)).toEqual({
      depthScheme: "thirds",
      depthDividersFt: null,
      contactDividersFt: [-1, 5],
    });
  });

  test("a pushed divider is rounded OUTWARD to the grid (the gap only grows)", () => {
    const s = setDivider(initBandEditor("depth", CUSTOM), 0, 19.5, {
      unit: "ft",
      minGapFt: 2.3456,
    });
    expect(s.draft).toEqual([19.5, 22]);
    const t = setDivider(initBandEditor("depth", CUSTOM), 1, 11, {
      unit: "ft",
      minGapFt: 2.3456,
    });
    expect(t.draft).toEqual([8.5, 11]);
  });

  test("a divider the clamp STOPPED is rounded outward too", () => {
    const s = setDivider(initBandEditor("depth", CUSTOM), 0, 38, {
      unit: "ft",
      minGapFt: 2.3456,
    });
    // b stops at 38.5; a gives ground to 36.1544 → floored to 36.
    expect(s.draft).toEqual([36, 38.5]);
  });

  test("an untouched editor's payload is the saved record itself", () => {
    const s = initBandEditor("depth", DEFAULT_BANDS);
    expect(bandEditorPayload(s)).toBe(DEFAULT_BANDS);
  });
});

test.describe("preview", () => {
  test("always draws the draft, even from a scheme with no bands", () => {
    const s = initBandEditor("depth", {
      ...DEFAULT_BANDS,
      depthScheme: "none",
    });
    const p = bandEditorPreview(s);
    expect(p.depthScheme).toBe("custom");
    expect(p.depthDividersFt).toEqual(s.draft);
  });

  test("contact preview carries the draft contact pair", () => {
    const s = setDivider(initBandEditor("contact", DEFAULT_BANDS), 1, 7, FT);
    expect(bandEditorPreview(s).contactDividersFt).toEqual([0, 7]);
  });
});

test.describe("bandEditorDraftScheme", () => {
  test("names what the draft on screen is", () => {
    expect(bandEditorDraftScheme(initBandEditor("depth", DEFAULT_BANDS))).toBe(
      "thirds",
    );
    for (const depthScheme of ["none", "inside"] as const) {
      expect(
        bandEditorDraftScheme(
          initBandEditor("depth", { ...DEFAULT_BANDS, depthScheme }),
        ),
      ).toBe("thirds");
    }
    const dms = initBandEditor("depth", {
      ...DEFAULT_BANDS,
      depthScheme: "deepMidShort",
    });
    expect(bandEditorDraftScheme(dms)).toBe("deepMidShort");
    expect(bandEditorDraftScheme(setDivider(dms, 0, 11, FT))).toBe("custom");
    expect(bandEditorDraftScheme(initBandEditor("depth", CUSTOM))).toBe(
      "custom",
    );
    expect(
      bandEditorDraftScheme(resetBandEditor(initBandEditor("depth", CUSTOM))),
    ).toBe("thirds");
  });
});

test.describe("fix round 1: the drawn contact range", () => {
  test("a drag past 7.7 ft stops at 7.5, and the 26 px gap still holds", () => {
    const ctx: BandEditorContext = { unit: "ft", minGapFt: 2.6 };
    const s = initBandEditor("contact", DEFAULT_BANDS, ctx); // [0, 5]
    const pastLower = setDivider(s, 0, 9, ctx);
    expect(pastLower.draft).toEqual([4.5, 7.5]);
    expect(pastLower.draft[1] - pastLower.draft[0]).toBeGreaterThanOrEqual(2.6);
    const pastUpper = setDivider(s, 1, 12, ctx);
    expect(pastUpper.draft).toEqual([0, 7.5]);
  });

  test("↓ held at the bound stays put (and never walks past it)", () => {
    const ctx: BandEditorContext = { unit: "ft", minGapFt: 2.6 };
    let s = initBandEditor("contact", DEFAULT_BANDS, ctx);
    for (let i = 0; i < 40; i++) s = nudgeDivider(s, 1, 0.2, ctx);
    expect(s.draft[1]).toBe(7.5);
    const held = nudgeDivider(s, 1, 0.2, ctx);
    expect(held).toBe(s);
    // The lower divider pushed down into it stops a gap short, on the grid.
    for (let i = 0; i < 80; i++) s = nudgeDivider(s, 0, 1, ctx);
    expect(s.draft).toEqual([4.5, 7.5]);
  });

  test("a saved [−25, 20] contact pair opens clamped, and is clean until moved", () => {
    const saved: BandSettings = {
      ...DEFAULT_BANDS,
      contactDividersFt: [-25, 20],
    };
    const ctx: BandEditorContext = { unit: "ft", minGapFt: 2.6 };
    const s = initBandEditor("contact", saved, ctx);
    expect(s.initial).toEqual([-18, 7.5]);
    expect(s.draft).toEqual([-18, 7.5]);
    // Opening on it is not a change: Save stays dead, nothing is written.
    expect(bandEditorDirty(s)).toBe(false);
    expect(bandEditorPayload(s)).toBe(saved);
    // A real move writes the drawn (clamped) pair — valid for the table.
    const moved = setDivider(s, 0, -10, ctx);
    expect(bandEditorDirty(moved)).toBe(true);
    expect(bandEditorPayload(moved).contactDividersFt).toEqual([-10, 7.5]);
    // Dragging back to the clamped start is clean again.
    expect(bandEditorDirty(setDivider(moved, 0, -18, ctx))).toBe(false);
  });

  test("a saved pair entirely past the drawn range opens as two distinct lines", () => {
    const saved: BandSettings = {
      ...DEFAULT_BANDS,
      contactDividersFt: [20, 25],
    };
    const s = initBandEditor("contact", saved, { unit: "ft", minGapFt: 2.6 });
    expect(s.draft[1]).toBe(7.5);
    expect(s.draft[1] - s.draft[0]).toBeGreaterThanOrEqual(2.6);
    expect(bandEditorDirty(s)).toBe(false);
  });

  test("opening fits the zoom's minimum gap without making the editor dirty", () => {
    const tight: BandSettings = { ...CUSTOM, depthDividersFt: [10, 11] };
    const s = initBandEditor("depth", tight, { unit: "ft", minGapFt: 3 });
    expect(s.draft).toEqual([8, 11]);
    expect(bandEditorDirty(s)).toBe(false);
  });
});

test.describe("fix round 1: refit on a zoom change", () => {
  test("a larger gap pushes the draft apart; an untouched editor stays clean", () => {
    const s = initBandEditor("depth", CUSTOM, { unit: "ft", minGapFt: 2 });
    const refit = refitBandEditor(s, { unit: "ft", minGapFt: 12 });
    expect(refit.draft[1] - refit.draft[0]).toBeGreaterThanOrEqual(12);
    expect(bandEditorDirty(refit)).toBe(false);
  });

  test("nothing to refit returns the same object", () => {
    const s = initBandEditor("depth", CUSTOM, { unit: "ft", minGapFt: 2 });
    expect(refitBandEditor(s, { unit: "ft", minGapFt: 3 })).toBe(s);
  });
});

test.describe("fix round 1: payload over the CURRENT bands", () => {
  test("a depth save preserves the other kind's CURRENT values", () => {
    const s = setDivider(initBandEditor("depth", CUSTOM), 0, 12, FT);
    // While the editor was open, contact changed somewhere else.
    const current: BandSettings = { ...CUSTOM, contactDividersFt: [-6, 1] };
    expect(bandEditorPayload(s, current)).toEqual({
      depthScheme: "custom",
      depthDividersFt: [12, 20],
      contactDividersFt: [-6, 1],
    });
  });

  test("a contact save preserves the CURRENT depth scheme and dividers", () => {
    const s = setDivider(initBandEditor("contact", CUSTOM), 1, 6, FT);
    const current: BandSettings = {
      depthScheme: "deepMidShort",
      depthDividersFt: null,
      contactDividersFt: [-2, 4],
    };
    expect(bandEditorPayload(s, current)).toEqual({
      depthScheme: "deepMidShort",
      depthDividersFt: null,
      contactDividersFt: [-2, 6],
    });
  });

  test("dirty is measured against the current bands", () => {
    const s = setDivider(initBandEditor("depth", CUSTOM), 0, 12, FT);
    // The optimistic save is in flight: current already IS the payload.
    const inFlight = bandEditorPayload(s, CUSTOM);
    expect(bandEditorDirty(s, inFlight)).toBe(false);
    // …and it failed and reverted: live again.
    expect(bandEditorDirty(s, CUSTOM)).toBe(true);
  });

  test("an untouched editor is clean against ANY current record", () => {
    const s = initBandEditor("contact", CUSTOM);
    const current: BandSettings = { ...CUSTOM, contactDividersFt: [-1, 3] };
    expect(bandEditorPayload(s, current)).toBe(current);
    expect(bandEditorDirty(s, current)).toBe(false);
  });
});

test.describe("final review: metric bounds are grid positions", () => {
  test("depth in metres: 0.5 m … 11.5 m, never 0.5 ft", () => {
    const [lo, hi] = bandEditorBounds("depth", "m");
    expect(lo).toBeCloseTo(0.5 * FT_PER_M, 9);
    expect(hi).toBeCloseTo(11.5 * FT_PER_M, 9);
    // A metric drag to the far baseline rests ON the grid.
    const s = setDivider(initBandEditor("depth", CUSTOM), 0, -5, {
      unit: "m",
      minGapFt: 2,
    });
    expect(s.draft[0] / FT_PER_M).toBeCloseTo(0.5, 9);
  });

  test("feet bounds are unchanged", () => {
    expect(bandEditorBounds("depth", "ft")).toEqual([0.5, 38.5]);
    expect(bandEditorBounds("contact", "ft")).toEqual([-18, 7.5]);
  });
});
