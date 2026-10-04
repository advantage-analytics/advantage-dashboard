import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  flipPlacement,
  setPlacementTarget,
  startPlacement,
  type PlacementState,
} from "@/components/admin/labels/court-placement";
import {
  COURT_ANCHOR_STORAGE_KEY,
  COURT_DOCK_GAP,
  COURT_DOCK_SIZE,
  COURT_MINIMISED_STORAGE_KEY,
  DEFAULT_COURT_ANCHOR,
  DEFAULT_VIDEO_LAYOUT,
  courtOrigin,
  courtRest,
  overlaps,
  videoRect,
  type VideoDockLayout,
} from "@/components/admin/labels/label-court-position";
import {
  DEFAULT_DOCK_ANCHOR,
  DOCK_ANCHOR_STORAGE_KEY,
  DOCK_MINIMISED_STORAGE_KEY,
  dockRest,
} from "@/components/admin/labels/label-dock-position";
import { BOARD_ANCHORS } from "@/components/dashboard/matches/match-detail/film/board-position";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labelling console's floating court card (board 08i): where it rests
 * and how it keeps clear of the floating video (`label-court-position.ts`,
 * pure), then the card itself rendered offline through `fixtures/vm-modules`
 * in each of its states.
 */

const court = COURT_DOCK_SIZE;
const room = { width: 1440, height: 900 };
const video = (
  anchor: VideoDockLayout["anchor"],
  minimised = false,
): VideoDockLayout => ({ ...DEFAULT_VIDEO_LAYOUT, anchor, minimised });

test.describe("where the court card rests", () => {
  test("board 08i's box, bottom-left by default, under its own keys", () => {
    expect(court).toEqual({ width: 300, height: 318 });
    expect(DEFAULT_COURT_ANCHOR).toBe("bottom-left");
    expect(DEFAULT_DOCK_ANCHOR).toBe("bottom-right");
    expect(COURT_ANCHOR_STORAGE_KEY).toBe("labels-court-corner");
    expect(COURT_MINIMISED_STORAGE_KEY).toBe("labels-court-minimised");
    expect(COURT_ANCHOR_STORAGE_KEY).not.toBe(DOCK_ANCHOR_STORAGE_KEY);
    expect(COURT_MINIMISED_STORAGE_KEY).not.toBe(DOCK_MINIMISED_STORAGE_KEY);
    expect(courtOrigin(null)).toBe("bottom left");
    expect(courtOrigin("top-right")).toBe("top right");
  });

  test("a corner is the video's corner geometry: 24px in, under the admin header", () => {
    expect(courtRest(null, court, room)).toEqual({ left: 24, top: 558 });
    expect(courtRest("top-left", court, room)).toEqual({ left: 24, top: 68 });
    expect(courtRest("top-right", court, room)).toEqual({
      left: 1116,
      top: 68,
    });
    expect(courtRest("bottom-right", court, room)).toEqual({
      left: 1116,
      top: 558,
    });
  });

  test("the two defaults never meet, down to a narrow laptop", () => {
    for (const width of [1440, 1280, 1024, 900]) {
      const size = { width, height: 800 };
      const at = courtRest(null, court, size, DEFAULT_VIDEO_LAYOUT);
      expect(at, String(width)).toEqual(dockRest("bottom-left", court, size));
      expect(
        overlaps({ ...at, ...court }, videoRect(DEFAULT_VIDEO_LAYOUT, size)),
        String(width),
      ).toBe(false);
    }
  });

  test("dropped into the video's corner, it lands beside the video", () => {
    // Video bottom-right: 936…1416 × 574…876. The court sits to its left,
    // 12px clear, on the same bottom edge.
    expect(
      courtRest("bottom-right", court, room, video("bottom-right")),
    ).toEqual({ left: 936 - COURT_DOCK_GAP - 300, top: 558 });
    // Video top-left: the court sits to its right, on the same top edge.
    expect(courtRest("top-left", court, room, video("top-left"))).toEqual({
      left: 24 + 480 + COURT_DOCK_GAP,
      top: 68,
    });
  });

  test("the video moved onto the court's corner: the court steps aside the same way", () => {
    expect(courtRest(null, court, room, video("bottom-left"))).toEqual({
      left: 24 + 480 + COURT_DOCK_GAP,
      top: 558,
    });
  });

  test("no room beside it: stacked in the same column", () => {
    // 700 wide: 480 + 12 + 300 does not fit across, but the column is tall.
    const tall = { width: 700, height: 900 };
    expect(
      courtRest("bottom-right", court, tall, video("bottom-right")),
    ).toEqual({ left: 376, top: 574 - COURT_DOCK_GAP - 318 });
  });

  test("different corners that still collide: beside, on the court's own edge", () => {
    // 1440 × 640: top-right (68…386) runs into the video bottom-right
    // (314…616). The court keeps its top edge and moves left of the video.
    const short = { width: 1440, height: 640 };
    expect(courtRest("top-right", court, short, video("bottom-right"))).toEqual(
      { left: 936 - COURT_DOCK_GAP - 300, top: 68 },
    );
    // No spot is clear in 700 × 640: it keeps its own corner, on screen.
    const cramped = { width: 700, height: 640 };
    expect(
      courtRest("bottom-right", court, cramped, video("bottom-right")),
    ).toEqual(dockRest("bottom-right", court, cramped));
  });

  test("whatever the two corners, they never overlap in a room that fits both", () => {
    for (const courtAnchor of BOARD_ANCHORS) {
      for (const videoAnchor of BOARD_ANCHORS) {
        for (const minimised of [false, true]) {
          const layout = video(videoAnchor, minimised);
          const at = courtRest(courtAnchor, court, room, layout);
          const name = `${courtAnchor} / ${videoAnchor} / ${minimised}`;
          expect(
            overlaps({ ...at, ...court }, videoRect(layout, room)),
            name,
          ).toBe(false);
          // And it stays inside the viewport's insets.
          expect(at.left, name).toBeGreaterThanOrEqual(24);
          expect(at.top, name).toBeGreaterThanOrEqual(68);
          expect(at.left + 300, name).toBeLessThanOrEqual(1440 - 24);
          expect(at.top + 318, name).toBeLessThanOrEqual(900 - 24);
        }
      }
    }
  });

  test("a minimised video only holds its pill's corner", () => {
    const pill = videoRect(video("bottom-right", true), room);
    expect(pill).toEqual({ left: 1240, top: 840, width: 176, height: 36 });
    // The court takes the corner's edge beside the pill, not 492px away.
    expect(
      courtRest("bottom-right", court, room, video("bottom-right", true)),
    ).toEqual({ left: 1240 - COURT_DOCK_GAP - 300, top: 558 });
  });

  test("a viewport too small for both keeps the court on screen in its own corner", () => {
    const small = { width: 520, height: 400 };
    const at = courtRest(null, court, small, DEFAULT_VIDEO_LAYOUT);
    expect(at).toEqual(dockRest("bottom-left", court, small));
    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.top).toBeGreaterThanOrEqual(8);
  });
});

test.describe("the court card", () => {
  type DockProps = {
    point: LabelPoint | null;
    names: { p1: string; p2: string };
    placement: PlacementState;
    editable: boolean;
    playingShotId?: string | null;
    video: VideoDockLayout | null;
    onPlace: () => void;
    onTarget: () => void;
    onFlip: () => void;
    initialMinimised?: boolean;
  };

  const P1 = labelSessionFixture().points.find(
    (point) => point.id === FIXTURE_POINT_IDS.P1,
  )!;
  const NAMES = { p1: "Lee", p2: "Vargas" };

  function render(props: Partial<DockProps>): string {
    const { LabelCourtDock } = createLoader().load(
      "src/components/admin/labels/label-court-dock.tsx",
    ) as { LabelCourtDock: React.ComponentType<DockProps> };
    return renderToStaticMarkup(
      React.createElement(LabelCourtDock, {
        point: P1,
        names: NAMES,
        placement: startPlacement(null),
        editable: true,
        video: DEFAULT_VIDEO_LAYOUT,
        onPlace: () => {},
        onTarget: () => {},
        onFlip: () => {},
        ...props,
      }),
    );
  }

  const title = (html: string) =>
    /data-court-title="[^"]*"[^>]*>([^<]*)</.exec(html)?.[1];
  const subtitle = (html: string) =>
    /data-court-subtitle="[^"]*"[^>]*>([^<]*)</.exec(html)?.[1];

  test("not placing: the whole court, read-only, the playing stroke named", () => {
    const html = render({ playingShotId: "s-return" });
    expect(html).toContain('data-court-placing="false"');
    expect(html).toContain('data-court-view="whole"');
    expect(html).toContain('viewBox="-7.265 -4.5 14.53 32.77"');
    expect(html).not.toContain('<button type="button" data-court-target');
    expect(title(html)).toBe("Point 1");
    expect(subtitle(html)).toBe("Shot 2 of 3 · Vargas");
    // The drag handle, the minimise button and the pill's expand — and no
    // list of the point's shots.
    expect(html).toContain("data-court-handle");
    expect(html).toContain('aria-label="Minimise the court"');
    expect(html).toContain('aria-label="Expand the court"');
    expect(html).not.toContain("First serve");
    expect(html).not.toContain("Backhand");
  });

  test("placing a contact: the hitter's half, under a blue outline", () => {
    const html = render({ placement: startPlacement("s-return", "far") });
    expect(html).toContain('data-court-placing="true"');
    expect(html).toContain('data-court-view="far"');
    expect(html).toContain('viewBox="-10.085 -3.5 20.17 16.224"');
    expect(html).toContain("shadow-[0_0_0_1.5px_var(--blue)");
    expect(title(html)).toBe("Shot 2 · contact");
    expect(subtitle(html)).toBe("Vargas’s side");
    expect(html).toMatch(
      /data-court-prompt=""[^>]*>Click where shot 2 was hit</,
    );
  });

  test("placing a landing: the other half; flipped, back on the hitter's for a net ball", () => {
    const landing = setPlacementTarget(
      startPlacement("s-return", "far"),
      "landing",
    );
    const html = render({ placement: landing });
    expect(html).toContain('data-court-view="near"');
    expect(title(html)).toBe("Shot 2 · landing");
    expect(subtitle(html)).toBe("Lee’s side");
    expect(html).toMatch(
      /aria-pressed="true" data-court-step="landing"[^>]*>Landing</,
    );
    expect(html).toMatch(/aria-pressed="false" data-court-flip=""/);
    expect(html).toContain('data-selected-ring="landing"');

    const flipped = render({ placement: flipPlacement(landing) });
    expect(flipped).toContain('data-court-view="far"');
    expect(subtitle(flipped)).toBe("Flipped to Vargas’s side · Net");
    expect(flipped).toMatch(/aria-pressed="true" data-court-flip=""/);
  });

  test("read-only, or a selection that is not in the open point: no zoom", () => {
    for (const html of [
      render({ placement: startPlacement("s-return", "far"), editable: false }),
      render({ placement: startPlacement("somewhere-else", "far") }),
      render({ placement: startPlacement("s-return", "far"), point: null }),
    ]) {
      expect(html).toContain('data-court-view="whole"');
      expect(html).not.toContain("data-court-steps");
    }
    const empty = render({ point: null });
    expect(title(empty)).toBe("Court");
    expect(subtitle(empty)).toBe("No point open");
  });

  test("minimised, the card gives way to its pill; hidden until the video is known", () => {
    const html = render({ initialMinimised: true });
    expect(html).toMatch(/data-court-card=""[^>]*aria-hidden="true"/);
    expect(html).toMatch(
      /data-label-court-dock=""[^>]*data-dock-minimised="true"/,
    );
    expect(html).not.toMatch(/data-court-pill=""[^>]*aria-hidden="true"/);
    // No video layout yet: the dock stays invisible rather than guess.
    expect(render({ video: null })).toMatch(
      /data-label-court-dock=""[^>]*class="[^"]*\binvisible\b/,
    );
  });
});
