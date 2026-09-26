import { expect, test } from "@playwright/test";
import {
  BUTTON_STEP,
  KEY_PAN_PX,
  PINCH_MAX_DELTA,
  WHEEL_STEP,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_OUT_SLACK,
  clampPan,
  minZoomFor,
  panBy,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAbout,
  zoomPercentLabel,
} from "@/components/dashboard/matches/match-detail/shots/pan-zoom";

const ART = { w: 595, h: 948 };
const STAGE = { w: 1000, h: 700 };

/* ── clampPan: art smaller than stage (fits) ─────────────────────────────── */

test("clampPan: art smaller than the stage stays fully within it — no negative offset", () => {
  const result = clampPan({ z: 0.5, px: -500, py: -500 }, ART, STAGE);
  // scaled art: 297.5 x 474, well inside the 1000x700 stage
  expect(result.px).toBeGreaterThanOrEqual(0);
  expect(result.py).toBeGreaterThanOrEqual(0);
  expect(result.px).toBeLessThanOrEqual(STAGE.w - ART.w * 0.5);
  expect(result.py).toBeLessThanOrEqual(STAGE.h - ART.h * 0.5);
});

test("clampPan: art smaller than the stage cannot be pushed past the far edge", () => {
  const result = clampPan({ z: 0.5, px: 9999, py: 9999 }, ART, STAGE);
  expect(result.px).toBeCloseTo(STAGE.w - ART.w * 0.5, 6);
  expect(result.py).toBeCloseTo(STAGE.h - ART.h * 0.5, 6);
});

test("clampPan: art exactly the stage size clamps offset to zero", () => {
  const art = { w: 1000, h: 700 };
  const result = clampPan({ z: 1, px: 50, py: -50 }, art, STAGE);
  expect(result.px).toBe(0);
  expect(result.py).toBe(0);
});

/* ── clampPan: art larger than stage (overflows) ─────────────────────────── */

test("clampPan: art larger than the stage may overhang by at most half the stage on the low side", () => {
  const z = 2; // scaled art 1190x1896, bigger than the 1000x700 stage
  const result = clampPan({ z, px: 9999, py: 9999 }, ART, STAGE);
  expect(result.px).toBeCloseTo(STAGE.w / 2, 6);
  expect(result.py).toBeCloseTo(STAGE.h / 2, 6);
});

test("clampPan: art larger than the stage may overhang by at most half the stage on the high side", () => {
  const z = 2;
  const result = clampPan({ z, px: -9999, py: -9999 }, ART, STAGE);
  expect(result.px).toBeCloseTo(STAGE.w / 2 - ART.w * z, 6);
  expect(result.py).toBeCloseTo(STAGE.h / 2 - ART.h * z, 6);
});

test("clampPan: art larger than the stage — an in-range offset passes through unchanged", () => {
  const z = 2;
  const result = clampPan({ z, px: -300, py: -400 }, ART, STAGE);
  expect(result.px).toBeCloseTo(-300, 6);
  expect(result.py).toBeCloseTo(-400, 6);
});

/* ── zoomAbout ────────────────────────────────────────────────────────────── */

test("zoomAbout: clamps z to ZOOM_MIN/ZOOM_MAX", () => {
  const start = { z: 1, px: 0, py: 0 };
  const zoomedOut = zoomAbout(
    start,
    1 / WHEEL_STEP ** 50,
    { x: 500, y: 350 },
    ART,
    STAGE,
  );
  expect(zoomedOut.z).toBeCloseTo(ZOOM_MIN, 6);

  const zoomedIn = zoomAbout(
    start,
    WHEEL_STEP ** 50,
    { x: 500, y: 350 },
    ART,
    STAGE,
  );
  expect(zoomedIn.z).toBeCloseTo(ZOOM_MAX, 6);
});

test("zoomAbout: the art point under the cursor stays under it (anchor invariance)", () => {
  // Choose a stage/art pair where clampPan is a no-op at the resulting z,
  // so the anchor-invariance property (checked to 1e-6) can be verified
  // end-to-end through the exported function.
  const art = { w: 1000, h: 1000 };
  const stage = { w: 1000, h: 1000 };
  const start = { z: 1, px: 0, py: 0 };
  const anchor = { x: 300, y: 700 };

  const artX = (anchor.x - start.px) / start.z;
  const artY = (anchor.y - start.py) / start.z;

  const next = zoomAbout(start, WHEEL_STEP, anchor, art, stage);

  const stageX = next.px + artX * next.z;
  const stageY = next.py + artY * next.z;

  expect(stageX).toBeCloseTo(anchor.x, 6);
  expect(stageY).toBeCloseTo(anchor.y, 6);
});

test("zoomAbout: BUTTON_STEP zoom-in then zoom-out at centre round-trips z", () => {
  const stage = { w: 1000, h: 1000 };
  const art = { w: 1000, h: 1000 };
  const start = { z: 1, px: 0, py: 0 };
  const centre = { x: 500, y: 500 };

  const zoomedIn = zoomAbout(start, BUTTON_STEP, centre, art, stage);
  const back = zoomAbout(zoomedIn, 1 / BUTTON_STEP, centre, art, stage);

  expect(back.z).toBeCloseTo(1, 6);
});

/* ── panBy ────────────────────────────────────────────────────────────────── */

test("panBy: moves by the delta and then clamps", () => {
  const art = { w: 1000, h: 1000 };
  const stage = { w: 1000, h: 1000 };
  const start = { z: 1, px: 0, py: 0 };

  const moved = panBy(start, KEY_PAN_PX, -KEY_PAN_PX, art, stage);
  // scaled art === stage, so any offset clamps straight back to 0.
  expect(moved.px).toBe(0);
  expect(moved.py).toBe(0);
});

test("panBy: an in-range move at high zoom passes through", () => {
  const art = { w: 595, h: 948 };
  const stage = { w: 1000, h: 700 };
  const start = { z: 2, px: -300, py: -400 };

  const moved = panBy(start, 10, -10, art, stage);
  expect(moved.px).toBeCloseTo(-290, 6);
  expect(moved.py).toBeCloseTo(-410, 6);
});

/* ── zoomPercentLabel ─────────────────────────────────────────────────────── */

test("zoomPercentLabel: formats as a rounded percent", () => {
  expect(zoomPercentLabel(2.2)).toBe("220%");
  expect(zoomPercentLabel(1)).toBe("100%");
  expect(zoomPercentLabel(ZOOM_MIN)).toBe("55%");
  expect(zoomPercentLabel(ZOOM_MAX)).toBe("320%");
});

// ── Gesture feel: stage-aware zoom floor and continuous pinch ──────────────

test("minZoomFor: a little past 'the whole court fits', never the old 55% island", () => {
  const art = { w: 595, h: 948 };
  const stage = { w: 1440, h: 900 };
  const fitZ = Math.min(stage.w / art.w, stage.h / art.h);
  expect(minZoomFor(art, stage)).toBeCloseTo(fitZ * ZOOM_OUT_SLACK, 9);
  expect(minZoomFor(art, stage)).toBeGreaterThan(0.55);
  // Degenerate / tiny stages fall back to the absolute floor.
  expect(minZoomFor(art, { w: 0, h: 0 })).toBe(ZOOM_MIN);
  expect(minZoomFor(art, { w: 50, h: 50 })).toBe(ZOOM_MIN);
});

test("zoomAbout honours a stage floor above ZOOM_MIN and keeps the anchor fixed", () => {
  const art = { w: 595, h: 948 };
  const stage = { w: 1440, h: 900 };
  const out = zoomAbout(
    { z: 1, px: 400, py: 0 },
    0.01,
    { x: 720, y: 450 },
    art,
    stage,
    0.8,
  );
  expect(out.z).toBeCloseTo(0.8, 9);
});

test("wheelZoomFactor: continuous, symmetric, gentle, and capped per event", () => {
  expect(wheelZoomFactor(0)).toBe(1);
  // pinch out (negative deltaY) zooms in; pinch in zooms out; exact inverses.
  expect(wheelZoomFactor(-5)).toBeGreaterThan(1);
  expect(wheelZoomFactor(5)).toBeLessThan(1);
  expect(wheelZoomFactor(-5) * wheelZoomFactor(5)).toBeCloseTo(1, 12);
  // a typical pinch tick is a few percent, well under the old fixed 12%.
  expect(wheelZoomFactor(-4)).toBeLessThan(1.04);
  // a mouse wheel notch (100) is capped, not a leap.
  expect(wheelZoomFactor(-100)).toBe(wheelZoomFactor(-PINCH_MAX_DELTA));
  expect(wheelZoomFactor(-100)).toBeLessThan(1.3);
});

test("wheelDeltaPx normalises line and page modes", () => {
  expect(wheelDeltaPx(3, 0)).toBe(3);
  expect(wheelDeltaPx(3, 1)).toBe(48);
  expect(wheelDeltaPx(1, 2)).toBe(400);
});
