/**
 * Where the fullscreen scoreboard rests. Pure, so the geometry is testable.
 *
 * The board is dragged freely, then snaps to the nearest of six resting
 * spots when it is let go: the four corners and the middle of the top and
 * bottom edges. A resting spot is stored as a name, not as pixels, so a board
 * parked top-right stays top-right on any screen size, and moves out of the
 * way when the points drawer opens over that side.
 *
 * Each spot keeps clear of the room's own chrome through `BoardInsets`: the
 * Points trigger along the top, the transport along the bottom, and the
 * drawer (when open) on the right.
 */

export interface BoardPosition {
  left: number;
  top: number;
}

export interface BoardSize {
  width: number;
  height: number;
}

export const BOARD_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type BoardAnchor = (typeof BOARD_ANCHORS)[number];

export const DEFAULT_BOARD_ANCHOR: BoardAnchor = "top-left";

/** Distance from each edge of the room a resting board keeps. */
export interface BoardInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Top clears the Points trigger (18px + 28px tall); bottom clears the
 * transport block (title, track and control row). Lower than the handoff's
 * 24/18 at the top, by request: clear of the top of the frame.
 */
export const BASE_BOARD_INSETS: BoardInsets = {
  top: 56,
  right: 24,
  bottom: 144,
  left: 24,
};

/** Never closer than this to an edge, whatever the insets ask for. */
export const BOARD_EDGE_MARGIN = 8;

export const BOARD_POSITION_STORAGE_KEY = "film-room:board-anchor";

function clampAxis(value: number, max: number): number {
  return Math.round(
    Math.min(
      Math.max(BOARD_EDGE_MARGIN, max),
      Math.max(BOARD_EDGE_MARGIN, value),
    ),
  );
}

/** Keeps a free (mid-drag) position inside the room. */
export function clampBoardPosition(
  position: BoardPosition,
  board: BoardSize,
  room: BoardSize,
): BoardPosition {
  return {
    left: clampAxis(
      position.left,
      room.width - board.width - BOARD_EDGE_MARGIN,
    ),
    top: clampAxis(
      position.top,
      room.height - board.height - BOARD_EDGE_MARGIN,
    ),
  };
}

/** The pixel position of a resting spot for this board in this room. */
export function anchorPosition(
  anchor: BoardAnchor,
  board: BoardSize,
  room: BoardSize,
  insets: BoardInsets,
): BoardPosition {
  const [row, column] = anchor.split("-") as [
    "top" | "bottom",
    "left" | "center" | "right",
  ];
  const left =
    column === "left"
      ? insets.left
      : column === "right"
        ? room.width - insets.right - board.width
        : insets.left +
          (room.width - insets.left - insets.right - board.width) / 2;
  const top =
    row === "top" ? insets.top : room.height - insets.bottom - board.height;
  return clampBoardPosition({ left, top }, board, room);
}

/** The resting spot whose position is closest to where the board was let go. */
export function nearestAnchor(
  position: BoardPosition,
  board: BoardSize,
  room: BoardSize,
  insets: BoardInsets,
): BoardAnchor {
  let best: BoardAnchor = DEFAULT_BOARD_ANCHOR;
  let bestDistance = Infinity;
  for (const anchor of BOARD_ANCHORS) {
    const spot = anchorPosition(anchor, board, room, insets);
    const distance = Math.hypot(
      spot.left - position.left,
      spot.top - position.top,
    );
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

/** Arrow keys walk the spots: left/right along an edge, up/down across. */
export function neighbourAnchor(
  anchor: BoardAnchor,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): BoardAnchor {
  const [row, column] = anchor.split("-");
  const columns = ["left", "center", "right"];
  const index = columns.indexOf(column);
  if (key === "ArrowUp") return `top-${column}` as BoardAnchor;
  if (key === "ArrowDown") return `bottom-${column}` as BoardAnchor;
  const next =
    key === "ArrowLeft"
      ? Math.max(0, index - 1)
      : Math.min(columns.length - 1, index + 1);
  return `${row}-${columns[next]}` as BoardAnchor;
}

/** A stored value, or null when it is missing or not a resting spot. */
export function parseBoardAnchor(raw: string | null): BoardAnchor | null {
  return raw && (BOARD_ANCHORS as readonly string[]).includes(raw)
    ? (raw as BoardAnchor)
    : null;
}
