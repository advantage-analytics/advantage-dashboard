import { expect, test } from "@playwright/test";

import {
  BASE_BOARD_INSETS,
  BOARD_EDGE_MARGIN,
  anchorPosition,
  clampBoardPosition,
  nearestAnchor,
  neighbourAnchor,
  parseBoardAnchor,
} from "@/components/dashboard/matches/match-detail/film/board-position";

const board = { width: 260, height: 90 };
const room = { width: 1280, height: 720 };
const insets = BASE_BOARD_INSETS;

test("a mid-drag position is kept inside the room", () => {
  expect(clampBoardPosition({ left: 400, top: 300 }, board, room)).toEqual({
    left: 400,
    top: 300,
  });
  expect(clampBoardPosition({ left: -50, top: 2000 }, board, room)).toEqual({
    left: BOARD_EDGE_MARGIN,
    top: 720 - 90 - BOARD_EDGE_MARGIN,
  });
});

test("the six resting spots keep clear of the room's chrome", () => {
  expect(anchorPosition("top-left", board, room, insets)).toEqual({
    left: 24,
    top: 56,
  });
  expect(anchorPosition("top-right", board, room, insets)).toEqual({
    left: 1280 - 24 - 260,
    top: 56,
  });
  expect(anchorPosition("top-center", board, room, insets)).toEqual({
    left: 510,
    top: 56,
  });
  expect(anchorPosition("bottom-left", board, room, insets)).toEqual({
    left: 24,
    top: 720 - 144 - 90,
  });
  expect(anchorPosition("bottom-right", board, room, insets).left).toBe(996);
});

test("the right-hand spots step aside for the open drawer", () => {
  const withDrawer = { ...insets, right: insets.right + 320 };
  expect(anchorPosition("top-right", board, room, withDrawer).left).toBe(
    1280 - 344 - 260,
  );
});

test("letting go snaps to the closest spot", () => {
  expect(nearestAnchor({ left: 900, top: 90 }, board, room, insets)).toBe(
    "top-right",
  );
  expect(nearestAnchor({ left: 60, top: 480 }, board, room, insets)).toBe(
    "bottom-left",
  );
  expect(nearestAnchor({ left: 560, top: 420 }, board, room, insets)).toBe(
    "bottom-center",
  );
  expect(nearestAnchor({ left: 480, top: 120 }, board, room, insets)).toBe(
    "top-center",
  );
});

test("arrow keys walk the spots and stop at the edges", () => {
  expect(neighbourAnchor("top-left", "ArrowRight")).toBe("top-center");
  expect(neighbourAnchor("top-center", "ArrowRight")).toBe("top-right");
  expect(neighbourAnchor("top-right", "ArrowRight")).toBe("top-right");
  expect(neighbourAnchor("top-center", "ArrowDown")).toBe("bottom-center");
  expect(neighbourAnchor("bottom-left", "ArrowUp")).toBe("top-left");
  expect(neighbourAnchor("bottom-left", "ArrowLeft")).toBe("bottom-left");
});

test("stored values are validated", () => {
  expect(parseBoardAnchor("bottom-right")).toBe("bottom-right");
  expect(parseBoardAnchor(null)).toBeNull();
  expect(parseBoardAnchor('{"left":10,"top":20}')).toBeNull();
});
