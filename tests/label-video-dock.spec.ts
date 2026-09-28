import { expect, test } from "@playwright/test";

import { playingStopAt } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import {
  DEFAULT_DOCK_ANCHOR,
  DOCK_ANCHOR_STORAGE_KEY,
  DOCK_INSETS,
  DOCK_MINIMISED_STORAGE_KEY,
  dockOrigin,
  dockRest,
  parseDockMinimised,
} from "@/components/admin/labels/label-dock-position";
import { labelFilmStops } from "@/components/admin/labels/label-film-stops";
import {
  POINT_TAIL_SECONDS,
  playingRowAt,
} from "@/lib/services/labels/playback";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";

/**
 * The labelling console's floating video: the label points as the film
 * player's stops (`label-film-stops.ts`), and where the dock rests
 * (`label-dock-position.ts`). Both pure.
 *
 * The fixture's point 1 has live strokes at 2472.0, 2473.1 and 2474.4 and a
 * tombstone at 2473.6; point 2 has one stroke at 2490.2; point 3 is deleted
 * and point 4 has no strokes.
 */

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;

function points(): LabelPoint[] {
  return labelSessionFixture().points;
}

function stroke(
  id: string,
  pointId: string,
  videoTime: number | null,
  status: LabelShot["status"] = "kept",
): LabelShot {
  return {
    ...labelSessionFixture().points[0].shots[0],
    id,
    labelPointId: pointId,
    status,
    videoTime,
  };
}

function withShots(
  list: LabelPoint[],
  pointId: string,
  shots: LabelShot[],
): LabelPoint[] {
  return list.map((p) => (p.id === pointId ? { ...p, shots } : p));
}

test.describe("the player's stops", () => {
  test("one stop per point with a live, timed stroke, on the console's windows", () => {
    const stops = labelFilmStops(points(), 0);
    expect(stops.map((s) => s.point.id)).toEqual([P1, P2]);

    const [p1, p2] = stops;
    // Opens on the first stroke — no lead-in — and closes at the tail.
    expect(p1.start).toBe(2472.0);
    expect(p1.serve).toBe(2472.0);
    expect(p1.end).toBeCloseTo(2474.4 + POINT_TAIL_SECONDS, 6);
    // The last point closes at its own tail.
    expect(p2.start).toBe(2490.2);
    expect(p2.end).toBeCloseTo(2490.2 + POINT_TAIL_SECONDS, 6);
    expect(p1.point).toEqual({ id: P1, setNumber: 1, pointIndex: 0 });
  });

  test("deleted points, tombstoned strokes and untimed strokes have no place", () => {
    let list = withShots(points(), P3, [stroke("s-p3", P3, 2480)]);
    list = withShots(list, P4, [stroke("s-p4", P4, null)]);
    const stops = labelFilmStops(list, 0);
    // P3 is a tombstone however it is timed; P4's only stroke is untimed.
    expect(stops.map((s) => s.point.id)).toEqual([P1, P2]);
    // The tombstone at 2473.6 never extends or opens P1's window.
    expect(stops[0].end).toBeCloseTo(2474.4 + POINT_TAIL_SECONDS, 6);

    const onlyDead = withShots(points(), P2, [
      stroke("s-dead", P2, 2490.2, "deleted"),
    ]);
    expect(labelFilmStops(onlyDead, 0).map((s) => s.point.id)).toEqual([P1]);
  });

  test("stops are in video order, whatever order the rows are in", () => {
    const list = withShots(points(), P4, [
      stroke("s-p4-b", P4, 2460.5),
      stroke("s-p4-a", P4, 2460.0),
    ]);
    const stops = labelFilmStops([...list].reverse(), 0);
    expect(stops.map((s) => s.point.id)).toEqual([P4, P1, P2]);
    // A point's window opens on its EARLIEST stroke, not its first-listed.
    expect(stops[0].start).toBe(2460.0);
  });

  test("a window closes at the next point's first stroke when that is sooner", () => {
    const list = withShots(points(), P2, [stroke("s-close", P2, 2475.0)]);
    const [p1, p2] = labelFilmStops(list, 0);
    expect(p1.end).toBe(2475.0);
    expect(p2.start).toBe(2475.0);
  });

  test("times move onto the file's clock once, clamped at frame zero", () => {
    const stops = labelFilmStops(points(), 2400);
    expect(stops[0].start).toBeCloseTo(72.0, 6);
    expect(stops[0].end).toBeCloseTo(74.4 + POINT_TAIL_SECONDS, 6);
    expect(stops[1].serve).toBeCloseTo(90.2, 6);

    // A stroke before the file starts has nowhere earlier to go.
    const early = labelFilmStops(points(), 2480);
    expect(early[0].start).toBe(0);
    expect(early[0].end).toBe(0);
    expect(early[1].start).toBeCloseTo(10.2, 6);
  });

  test("the player's window and the table's playing row agree", () => {
    const offset = 2400;
    const list = points();
    const stops = labelFilmStops(list, offset);
    // Away from the 0.1s seek tolerance the player allows before a start.
    for (const time of [
      2400, 2471.5, 2472.0, 2473.0, 2474.4, 2477.0, 2477.5, 2485, 2490.2, 2492,
      2493.3, 2600,
    ]) {
      const row = playingRowAt(list, time);
      const stop = playingStopAt(stops, time - offset);
      expect(stop?.point.id ?? null, String(time)).toBe(row?.pointId ?? null);
    }
  });
});

test.describe("where the dock rests", () => {
  const dock = { width: 480, height: 302 };
  const room = { width: 1440, height: 900 };

  test("each corner keeps 24px from the viewport, and clears the admin header", () => {
    expect(DOCK_INSETS).toEqual({ top: 68, right: 24, bottom: 24, left: 24 });
    expect(dockRest("top-left", dock, room)).toEqual({ left: 24, top: 68 });
    expect(dockRest("top-right", dock, room)).toEqual({ left: 936, top: 68 });
    expect(dockRest("bottom-left", dock, room)).toEqual({
      left: 24,
      top: 574,
    });
    expect(dockRest("bottom-right", dock, room)).toEqual({
      left: 936,
      top: 574,
    });
  });

  test("a viewer who never moved it gets the bottom right", () => {
    expect(DEFAULT_DOCK_ANCHOR).toBe("bottom-right");
    expect(dockRest(null, dock, room)).toEqual(
      dockRest("bottom-right", dock, room),
    );
  });

  test("a viewport too small for the insets keeps it on screen", () => {
    const small = { width: 500, height: 330 };
    const at = dockRest("bottom-right", dock, small);
    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.top).toBeGreaterThanOrEqual(8);
  });

  test("minimising collapses toward the anchored corner", () => {
    expect(dockOrigin("top-left")).toBe("top left");
    expect(dockOrigin("bottom-right")).toBe("bottom right");
    expect(dockOrigin(null)).toBe("bottom right");
  });

  test("its own storage keys, and a stored minimised flag", () => {
    expect(DOCK_ANCHOR_STORAGE_KEY).toBe("labels-player-corner");
    expect(DOCK_MINIMISED_STORAGE_KEY).toBe("labels-player-minimised");
    expect(parseDockMinimised("1")).toBe(true);
    expect(parseDockMinimised("0")).toBe(false);
    expect(parseDockMinimised(null)).toBe(false);
    expect(parseDockMinimised("true")).toBe(false);
  });
});
