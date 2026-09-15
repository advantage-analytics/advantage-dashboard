import { expect, test } from "@playwright/test";

import {
  BOARD_EDGE_MARGIN,
  clampBoardPosition,
  parseBoardPosition,
} from "@/components/dashboard/matches/match-detail/film/board-position";

const board = { width: 260, height: 90 };
const room = { width: 1280, height: 720 };

test("a position inside the room is kept", () => {
  expect(clampBoardPosition({ left: 400, top: 300 }, board, room)).toEqual({
    left: 400,
    top: 300,
  });
});

test("a board dragged or restored off-screen is pulled back inside", () => {
  expect(clampBoardPosition({ left: -50, top: -10 }, board, room)).toEqual({
    left: BOARD_EDGE_MARGIN,
    top: BOARD_EDGE_MARGIN,
  });
  // Saved on a wide monitor, opened on a small one.
  expect(clampBoardPosition({ left: 2400, top: 1300 }, board, room)).toEqual({
    left: 1280 - 260 - BOARD_EDGE_MARGIN,
    top: 720 - 90 - BOARD_EDGE_MARGIN,
  });
});

test("a room smaller than the board pins it to the top-left margin", () => {
  expect(
    clampBoardPosition({ left: 100, top: 100 }, board, {
      width: 200,
      height: 60,
    }),
  ).toEqual({ left: BOARD_EDGE_MARGIN, top: BOARD_EDGE_MARGIN });
});

test("stored values are validated", () => {
  expect(parseBoardPosition('{"left":10,"top":20}')).toEqual({
    left: 10,
    top: 20,
  });
  expect(parseBoardPosition(null)).toBeNull();
  expect(parseBoardPosition("nope")).toBeNull();
  expect(parseBoardPosition('{"left":"10","top":20}')).toBeNull();
});
