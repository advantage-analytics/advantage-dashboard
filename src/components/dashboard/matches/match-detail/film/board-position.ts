/**
 * Where the fullscreen scoreboard sits. Pure, so the clamping is testable.
 *
 * The board can be dragged anywhere on the film (it can cover the part of the
 * frame a coach is watching), so the position is remembered per viewer in
 * localStorage and clamped back inside the room whenever the room changes
 * size — a board saved on a wide monitor must not open off-screen on a laptop.
 */

export interface BoardPosition {
  left: number;
  top: number;
}

/** Lower than the handoff's 24/18, by request: clear of the top of the frame. */
export const DEFAULT_BOARD_POSITION: BoardPosition = { left: 24, top: 56 };

/** Never closer than this to an edge of the room. */
export const BOARD_EDGE_MARGIN = 8;

/** Arrow-key step, and the Shift+arrow step. */
export const BOARD_KEY_STEP = 8;
export const BOARD_KEY_STEP_LARGE = 40;

export const BOARD_POSITION_STORAGE_KEY = "film-room:board-position";

export function clampBoardPosition(
  position: BoardPosition,
  board: { width: number; height: number },
  room: { width: number; height: number },
): BoardPosition {
  const maxLeft = Math.max(
    BOARD_EDGE_MARGIN,
    room.width - board.width - BOARD_EDGE_MARGIN,
  );
  const maxTop = Math.max(
    BOARD_EDGE_MARGIN,
    room.height - board.height - BOARD_EDGE_MARGIN,
  );
  return {
    left: Math.round(
      Math.min(maxLeft, Math.max(BOARD_EDGE_MARGIN, position.left)),
    ),
    top: Math.round(
      Math.min(maxTop, Math.max(BOARD_EDGE_MARGIN, position.top)),
    ),
  };
}

/** A stored value, or null when it is missing or not a position. */
export function parseBoardPosition(raw: string | null): BoardPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value &&
      typeof value === "object" &&
      Number.isFinite((value as BoardPosition).left) &&
      Number.isFinite((value as BoardPosition).top)
    ) {
      return {
        left: (value as BoardPosition).left,
        top: (value as BoardPosition).top,
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}
