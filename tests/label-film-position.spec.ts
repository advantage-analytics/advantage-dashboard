import { expect, test } from "@playwright/test";

import {
  COURT_ANCHOR_STORAGE_KEY,
  COURT_MINIMISED_STORAGE_KEY,
} from "@/components/admin/labels/label-court-position";
import {
  DOCK_ANCHOR_STORAGE_KEY,
  DOCK_MINIMISED_STORAGE_KEY,
} from "@/components/admin/labels/label-dock-position";
import {
  DEFAULT_FILM_COURT_ANCHOR,
  FILM_COURT_ANCHOR_STORAGE_KEY,
  FILM_COURT_HIDDEN_STORAGE_KEY,
  FILM_COURT_SIZE,
  FILM_RAIL_HIDDEN_STORAGE_KEY,
  FILM_COURT_RAIL_GAP_PX,
  FILM_RAIL_INSET_PX,
  filmCourtInsets,
  filmCourtRest,
  filmTransportInset,
} from "@/components/admin/labels/label-film-position";
import {
  LAYOUT_MODE_STORAGE_KEY,
  LAYOUT_SIZE_STORAGE_KEY,
  RAIL_DEFAULT_PX,
  RAIL_MAX_PX,
  RAIL_WIDTH_STORAGE_KEY,
} from "@/components/admin/labels/label-layout";
import {
  BOARD_ANCHORS,
  BOARD_EDGE_MARGIN,
} from "@/components/dashboard/matches/match-detail/film/board-position";

/**
 * The film full-screen view's geometry (board 08n, `label-film-position.ts`):
 * where the transport stops, and where the court card rests clear of the
 * rail, the transport and the pills.
 */

const court = FILM_COURT_SIZE;
const shown = { width: RAIL_DEFAULT_PX, hidden: false };
const hidden = { width: RAIL_DEFAULT_PX, hidden: true };

test("board 08n's sizes, under keys of their own", () => {
  // Screen B: the rail sits flush, as the Video tab's full screen does.
  expect(FILM_RAIL_INSET_PX).toBe(0);
  expect(FILM_COURT_RAIL_GAP_PX).toBe(24);
  expect(FILM_COURT_SIZE).toEqual({ width: 214, height: 392 });
  expect(DEFAULT_FILM_COURT_ANCHOR).toBe("top-left");
  expect(FILM_COURT_ANCHOR_STORAGE_KEY).toBe("labels-film-court-position");
  expect(FILM_RAIL_HIDDEN_STORAGE_KEY).toBe("labels-film-rail-hidden");
  expect(FILM_COURT_HIDDEN_STORAGE_KEY).toBe("labels-film-court-hidden");
  // None collides with another labelling key, or with each other.
  const keys = [
    FILM_COURT_ANCHOR_STORAGE_KEY,
    FILM_RAIL_HIDDEN_STORAGE_KEY,
    FILM_COURT_HIDDEN_STORAGE_KEY,
    COURT_ANCHOR_STORAGE_KEY,
    COURT_MINIMISED_STORAGE_KEY,
    DOCK_ANCHOR_STORAGE_KEY,
    DOCK_MINIMISED_STORAGE_KEY,
    LAYOUT_MODE_STORAGE_KEY,
    LAYOUT_SIZE_STORAGE_KEY,
    RAIL_WIDTH_STORAGE_KEY,
  ];
  expect(new Set(keys).size).toBe(keys.length);
});

test("the transport stops at the rail's left edge, or not at all", () => {
  // The frame's screen B: `.ov-flush .tr{inset-inline:0 640px}` at a 640
  // rail — the transport's own 24px padding keeps the breathing room.
  expect(filmTransportInset(640, false)).toBe(640);
  expect(filmTransportInset(RAIL_MAX_PX, false)).toBe(880);
  expect(filmTransportInset(520, false)).toBe(520);
  expect(filmTransportInset(640, true)).toBe(0);
  expect(filmTransportInset(RAIL_MAX_PX, true)).toBe(0);
});

test("the card's clearances: 20 from the left and top, the transport below, the rail plus 24 on the right", () => {
  expect(filmCourtInsets(shown)).toEqual({
    top: 20,
    left: 20,
    bottom: 144,
    right: 664,
  });
  expect(filmCourtInsets({ width: 880, hidden: false }).right).toBe(904);
  // Hidden, the same 24 from the film's own edge.
  expect(filmCourtInsets(hidden)).toEqual({
    top: 20,
    left: 20,
    bottom: 144,
    right: 24,
  });
});

test.describe("where the court card rests", () => {
  const room = { width: 1440, height: 900 };

  test("top-left by default: the frame's 20 / 20", () => {
    expect(filmCourtRest(null, court, room, shown)).toEqual({
      left: 20,
      top: 20,
    });
    expect(filmCourtRest("top-left", court, room, shown)).toEqual({
      left: 20,
      top: 20,
    });
    // The rail's width makes no difference on the left.
    expect(filmCourtRest("top-left", court, room, hidden)).toEqual({
      left: 20,
      top: 20,
    });
  });

  test("a right corner sits beside the rail, never under it, and follows its width", () => {
    expect(filmCourtRest("top-right", court, room, shown)).toEqual({
      left: 1440 - 664 - 214,
      top: 20,
    });
    expect(
      filmCourtRest("top-right", court, room, { width: 880, hidden: false }),
    ).toEqual({ left: 1440 - 904 - 214, top: 20 });
    expect(filmCourtRest("bottom-right", court, room, shown)).toEqual({
      left: 1440 - 664 - 214,
      top: 900 - 144 - 392,
    });
  });

  test("a bottom corner clears the transport", () => {
    expect(filmCourtRest("bottom-left", court, room, shown)).toEqual({
      left: 20,
      top: 364,
    });
    expect(filmCourtRest("bottom-left", court, room, hidden)).toEqual({
      left: 20,
      top: 364,
    });
  });

  test("the rail hidden, the right corners reach the edge; top-right ducks under the Points pill", () => {
    expect(filmCourtRest("bottom-right", court, room, hidden)).toEqual({
      left: 1440 - 24 - 214,
      top: 364,
    });
    expect(filmCourtRest("top-right", court, room, hidden)).toEqual({
      left: 1440 - 24 - 214,
      top: 58,
    });
    // Shown, the rail covers that corner's pill spot, so no clearance.
    expect(filmCourtRest("top-right", court, room, shown).top).toBe(20);
  });

  test("at 1920 × 1080 the same rules, further apart", () => {
    const wide = { width: 1920, height: 1080 };
    expect(filmCourtRest("top-right", court, wide, shown)).toEqual({
      left: 1920 - 664 - 214,
      top: 20,
    });
    expect(filmCourtRest("bottom-left", court, wide, shown)).toEqual({
      left: 20,
      top: 1080 - 144 - 392,
    });
  });

  test("a room too small for the clearances still keeps the card on screen", () => {
    // 480 tall: a bottom corner's 144 clearance would put the card's top at
    // -56, so it is held to the room's own 8px margin instead.
    const small = { width: 600, height: 480 };
    for (const anchor of BOARD_ANCHORS) {
      const at = filmCourtRest(anchor, court, small, shown);
      expect(at.left, anchor).toBeGreaterThanOrEqual(BOARD_EDGE_MARGIN);
      expect(at.top, anchor).toBeGreaterThanOrEqual(BOARD_EDGE_MARGIN);
      expect(at.left + court.width, anchor).toBeLessThanOrEqual(
        small.width - BOARD_EDGE_MARGIN,
      );
      expect(at.top + court.height, anchor).toBeLessThanOrEqual(
        small.height - BOARD_EDGE_MARGIN,
      );
    }
  });
});
