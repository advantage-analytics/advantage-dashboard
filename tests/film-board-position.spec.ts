import { expect, test } from "@playwright/test";

import {
  BASE_BOARD_INSETS,
  BOARD_EDGE_MARGIN,
  anchorPosition,
  clampBoardPosition,
  courtSlot,
  nearestAnchor,
  neighbourAnchor,
  nudgeBoard,
  parseBoardAnchor,
} from "@/components/dashboard/matches/match-detail/film/board-position";

const board = { width: 236, height: 146 };
const room = { width: 1280, height: 720 };
const insets = BASE_BOARD_INSETS;

test("a mid-drag position is kept inside the room", () => {
  expect(clampBoardPosition({ left: 400, top: 300 }, board, room)).toEqual({
    left: 400,
    top: 300,
  });
  expect(clampBoardPosition({ left: -50, top: 2000 }, board, room)).toEqual({
    left: BOARD_EDGE_MARGIN,
    top: 720 - 146 - BOARD_EDGE_MARGIN,
  });
});

test("the four corners keep clear of the room's chrome", () => {
  expect(anchorPosition("top-left", board, room, insets)).toEqual({
    left: 24,
    top: 24,
  });
  expect(anchorPosition("top-right", board, room, insets)).toEqual({
    left: 1280 - 24 - 236,
    top: 58,
  });
  expect(anchorPosition("bottom-left", board, room, insets)).toEqual({
    left: 24,
    top: 720 - 144 - 146,
  });
  expect(anchorPosition("bottom-right", board, room, insets)).toEqual({
    left: 1280 - 24 - 236,
    top: 720 - 144 - 146,
  });
});

test("letting go snaps to the closest corner", () => {
  expect(nearestAnchor({ left: 900, top: 90 }, board, room, insets)).toBe(
    "top-right",
  );
  expect(nearestAnchor({ left: 60, top: 480 }, board, room, insets)).toBe(
    "bottom-left",
  );
});

test("arrow keys walk the four corners", () => {
  expect(neighbourAnchor("top-left", "ArrowRight")).toBe("top-right");
  expect(neighbourAnchor("top-right", "ArrowRight")).toBe("top-right");
  expect(neighbourAnchor("top-left", "ArrowDown")).toBe("bottom-left");
  expect(neighbourAnchor("bottom-right", "ArrowUp")).toBe("top-right");
  expect(neighbourAnchor("bottom-left", "ArrowLeft")).toBe("bottom-left");
});

test("stored values are validated, including a stale six-spot value", () => {
  expect(parseBoardAnchor("bottom-right")).toBe("bottom-right");
  expect(parseBoardAnchor(null)).toBeNull();
  expect(parseBoardAnchor("top-center")).toBeNull();
  expect(parseBoardAnchor('{"left":10,"top":20}')).toBeNull();
});

test("nudgeBoard moves 8px per arrow, 40px with shift, and clamps at an edge", () => {
  expect(
    nudgeBoard({ left: 100, top: 100 }, "ArrowRight", false, board, room),
  ).toEqual({ left: 108, top: 100 });
  expect(
    nudgeBoard({ left: 100, top: 100 }, "ArrowDown", true, board, room),
  ).toEqual({ left: 100, top: 140 });
  expect(
    nudgeBoard(
      { left: BOARD_EDGE_MARGIN, top: 100 },
      "ArrowLeft",
      false,
      board,
      room,
    ),
  ).toEqual({ left: BOARD_EDGE_MARGIN, top: 100 });
});

test("courtSlot sits beneath a top corner's board, sharing its column", () => {
  expect(
    courtSlot(
      "top-left",
      { left: 24, top: 24 },
      { width: 236, height: 146 },
      { width: 152, height: 227 },
    ),
  ).toEqual({ left: 24, top: 198 });
});

test("courtSlot sits above a bottom corner's board and shares its right edge", () => {
  const boardPosition = { left: 1000, top: 400 };
  const boardSize = { width: 236, height: 146 };
  const courtSize = { width: 152, height: 227 };
  expect(
    courtSlot("bottom-right", boardPosition, boardSize, courtSize),
  ).toEqual({
    left: 1000 + 236 - 152,
    top: 400 - 28 - 227,
  });
});
