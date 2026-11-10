import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./fixtures/vm-modules";
import { expect, test } from "@playwright/test";
import {
  computeViz,
  EMPTY_VIZ_FILTERS,
  type Cut,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  SERVE_COURT,
  SERVE_COURT_THROUGH_NET,
  VIEWER_COURT,
  VIEWER_LANDING_FRAME,
  projectViewerDot,
  viewerArtPoint,
  viewerInitialTransform,
  viewerLandingHalf,
} from "@/components/dashboard/matches/match-detail/shots/court-geometry";
import {
  GLIDE_MIN_RELATIVE_ZOOM,
  centreOn,
  glideEase,
  glideFrame,
  stageCentreArtPoint,
} from "@/components/dashboard/matches/match-detail/shots/pan-zoom";
import { ASYMMETRIC_SERVES } from "./fixtures/viz-serve-points";
import { RALLY_POINTS } from "./fixtures/viz-rally-points";

/**
 * Pass 2 of the visualizations polish, offline: the wall's serve card runs on
 * through the net, the lightbox's 100% is the half a landing cut's shots land
 * in, and selecting a mark glides the court to it.
 */

test.describe("serve wall card: through the net", () => {
  const box = SERVE_COURT_THROUGH_NET.viewBox;
  const bottom = box.minY + box.h;

  test("the window holds the service boxes and the net, with near court below it", () => {
    // Outer (post-group-transform) heights.
    expect(SERVE_COURT_THROUGH_NET.serviceLineOuterY).toBeGreaterThan(
      box.minY + 20,
    );
    expect(SERVE_COURT_THROUGH_NET.netOuterY).toBeGreaterThan(
      SERVE_COURT_THROUGH_NET.serviceLineOuterY,
    );
    // The far baseline is in frame, with a little apron behind it.
    expect(SERVE_COURT_THROUGH_NET.baselineOuterY).toBeGreaterThan(
      box.minY + 5,
    );
    // The net sits inside the art with a strip of the near boxes below it.
    expect(bottom - SERVE_COURT_THROUGH_NET.netOuterY).toBeGreaterThan(20);
    // The court surface runs past the window, so the frame edge cuts it.
    expect(117 + 0.85 * (SERVE_COURT_THROUGH_NET.cropY - 125)).toBeGreaterThan(
      bottom,
    );
  });

  test("the same 334:216 box as every card, at the half court's own scale", () => {
    expect(box.w / box.h).toBeCloseTo(
      SERVE_COURT.viewBox.w / SERVE_COURT.viewBox.h,
      6,
    );
    // No wider than the half court: the court never draws smaller.
    expect(box.w).toBeLessThanOrEqual(SERVE_COURT.viewBox.w + 1e-9);
    // Centred on the court.
    expect(box.minX + box.w / 2).toBeCloseTo(SERVE_COURT.centerX, 6);
  });
});

test.describe("lightbox 100%: the landing half", () => {
  const landing: Cut[] = ["serve", "returnPlacement", "rallyPlacement"];

  test("every landing cut's marks land in the FAR half, for both subjects (fixtures)", () => {
    for (const cut of landing) {
      expect(viewerLandingHalf(cut)).toBe("far");
      const points = cut === "serve" ? ASYMMETRIC_SERVES : RALLY_POINTS;
      for (const subjectIsPlayer1 of [true, false]) {
        const { dots } = computeViz(
          points,
          cut,
          EMPTY_VIZ_FILTERS,
          subjectIsPlayer1,
        );
        const landed = dots.filter((d) => !d.atNet && d.depthM >= 0);
        if (landed.length === 0) continue;
        for (const dot of landed) {
          expect(projectViewerDot(cut, dot).y).toBeLessThanOrEqual(
            VIEWER_COURT.netY,
          );
        }
      }
    }
  });

  test("errors land in the far half too, and the contact cuts have no landing half", () => {
    expect(viewerLandingHalf("errors")).toBe("far");
    expect(viewerLandingHalf("returnContact")).toBeNull();
    expect(viewerLandingHalf("rallyPosition")).toBeNull();
  });

  test("the landing frame stops just past the net", () => {
    const frameBottom = VIEWER_LANDING_FRAME.minY + VIEWER_LANDING_FRAME.h;
    expect(frameBottom).toBeGreaterThan(VIEWER_COURT.netY);
    expect(frameBottom - VIEWER_COURT.netY).toBeLessThan(
      VIEWER_COURT.nearServiceY - VIEWER_COURT.netY,
    );
  });
});

test.describe("glide", () => {
  const art = VIEWER_COURT.artPx;
  const stage = { w: 900, h: 640 };

  test("the ease is cubic-bezier(0.16, 1, 0.3, 1): 0→0, 1→1, monotonic, front-loaded", () => {
    expect(glideEase(0)).toBe(0);
    expect(glideEase(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = glideEase(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(glideEase(0.25)).toBeGreaterThan(0.6);
  });

  test("centreOn puts the point at the stage centre; the glide ends exactly there", () => {
    const home = viewerInitialTransform("serve", stage);
    const p = projectViewerDot("serve", {
      lateralM: 2,
      depthM: 4,
      atNet: false,
    });
    const point = viewerArtPoint(p.x, p.y);
    const to = centreOn(point, home.z * GLIDE_MIN_RELATIVE_ZOOM, art, stage);
    expect(to.z).toBeCloseTo(home.z * 1.5, 6);
    expect(to.px + point.x * to.z).toBeCloseTo(stage.w / 2, 4);
    expect(to.py + point.y * to.z).toBeCloseTo(stage.h / 2, 4);
    expect(glideFrame(home, to, 1, art, stage)).toEqual(to);
    expect(glideFrame(home, to, 0, art, stage)).toEqual(home);
    // Midway, the centre's art point is between the two ends.
    const mid = glideFrame(home, to, 0.5, art, stage);
    const c0 = stageCentreArtPoint(home, stage);
    const c = stageCentreArtPoint(mid, stage);
    expect(Math.abs(c.x - point.x)).toBeLessThan(Math.abs(c0.x - point.x));
    expect(mid.z).toBeGreaterThan(home.z);
    expect(mid.z).toBeLessThan(to.z);
  });
});

test.describe("serve wall card: a deep serve", () => {
  test("is drawn in frame, unpinned, now the window reaches past the far baseline", () => {
    const loader = createLoader({ globals: { URLSearchParams } });
    const { CourtArt } = loader.load(
      "src/components/dashboard/matches/match-detail/shots/court-art.tsx",
    ) as {
      CourtArt: React.ComponentType<Record<string, unknown>>;
    };
    // One serve deep behind the far baseline (well past the window's top),
    // one in the box.
    const dots = [
      {
        id: "deep",
        outcome: "lost",
        shape: "circle",
        lateralM: 0,
        depthM: 23,
        atNet: false,
      },
      {
        id: "in",
        outcome: "won",
        shape: "circle",
        lateralM: 0,
        depthM: 4,
        atNet: false,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(CourtArt, {
        cut: "serve",
        dots,
        chart: "scatter",
        fill: true,
        serveFrame: "throughNet",
      }),
    );
    // The window starts behind the far baseline, past where the serve frame
    // clamps a deep mark, so nothing is pinned to its edge: every mark is
    // drawn at its own (clamped) spot, inside the window.
    expect(html).not.toContain("data-viz-pinned");
    const top = SERVE_COURT_THROUGH_NET.edgeGroup.top;
    const ys = [...html.matchAll(/<circle[^>]*cy="([-\d.e]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(ys.length).toBeGreaterThanOrEqual(2);
    for (const y of ys) expect(y).toBeGreaterThan(top);
    // The half-court frame never pins.
    const half = renderToStaticMarkup(
      React.createElement(CourtArt, {
        cut: "serve",
        dots,
        chart: "scatter",
        fill: true,
      }),
    );
    expect(half).not.toContain("data-viz-pinned");
  });
});
