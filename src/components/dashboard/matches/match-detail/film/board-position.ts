/**
 * Where the fullscreen scoreboard rests. Pure, so the geometry is testable.
 *
 * The board is dragged freely, then snaps to the nearest of four resting
 * spots when it is let go: the corners. A resting spot is stored as a name,
 * not as pixels, so a board parked top-right stays top-right on any screen
 * size.
 *
 * Each spot keeps clear of the room's own chrome through `BoardInsets`: the
 * transport along the bottom everywhere, and the room's edge margin on the
 * sides. The top-right corner additionally clears the "Points" trigger,
 * which only that corner overlaps — see `POINTS_TRIGGER_CLEARANCE`.
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
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export type BoardAnchor = (typeof BOARD_ANCHORS)[number];

export type BoardArrowKey =
  "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export const DEFAULT_BOARD_ANCHOR: BoardAnchor = "top-left";

/** Distance from each edge of the room a resting board keeps. */
export interface BoardInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Bottom clears the transport block (title, track and control row). */
export const BASE_BOARD_INSETS: BoardInsets = {
  top: 24,
  right: 24,
  bottom: 144,
  left: 24,
};

/**
 * The top-right corner's extra clearance, on top of `BASE_BOARD_INSETS.top`.
 * The "Points" trigger sits inset 24/18, 28px tall (R1), so its bottom edge
 * lands at 46px; the board keeps a further 12px past that. No other corner
 * overlaps the trigger, so this applies only there (R6: "each inset 24px …
 * overrides the prose for that corner only").
 */
const POINTS_TRIGGER_CLEARANCE = 58;

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

/** The pixel position of a resting corner for this board in this room. */
export function anchorPosition(
  anchor: BoardAnchor,
  board: BoardSize,
  room: BoardSize,
  insets: BoardInsets,
): BoardPosition {
  const [row, column] = anchor.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  const left =
    column === "left" ? insets.left : room.width - insets.right - board.width;
  const top =
    row === "top"
      ? anchor === "top-right"
        ? POINTS_TRIGGER_CLEARANCE
        : insets.top
      : room.height - insets.bottom - board.height;
  return clampBoardPosition({ left, top }, board, room);
}

/** The resting corner whose position is closest to where the board was let go. */
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

/** Arrow keys walk the corners: left/right across, up/down along a side. */
export function neighbourAnchor(
  anchor: BoardAnchor,
  key: BoardArrowKey,
): BoardAnchor {
  const [row, column] = anchor.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  if (key === "ArrowUp") return `top-${column}` as BoardAnchor;
  if (key === "ArrowDown") return `bottom-${column}` as BoardAnchor;
  const nextColumn = key === "ArrowLeft" ? "left" : "right";
  return `${row}-${nextColumn}` as BoardAnchor;
}

/** A stored value, or null when it is missing or not a resting spot. */
export function parseBoardAnchor(raw: string | null): BoardAnchor | null {
  return raw && (BOARD_ANCHORS as readonly string[]).includes(raw)
    ? (raw as BoardAnchor)
    : null;
}

/** 8px per arrow press, 40px held with shift, kept inside the room. */
const NUDGE_STEP = 8;
const NUDGE_STEP_SHIFT = 40;

/** A free (not-yet-settled) move by keyboard, one arrow press at a time. */
export function nudgeBoard(
  position: BoardPosition,
  key: BoardArrowKey,
  shift: boolean,
  board: BoardSize,
  room: BoardSize,
): BoardPosition {
  const step = shift ? NUDGE_STEP_SHIFT : NUDGE_STEP;
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return clampBoardPosition(
    { left: position.left + dx, top: position.top + dy },
    board,
    room,
  );
}

/** The gap kept between the board and the court that shares its column. */
const COURT_BOARD_GAP = 28;

/**
 * Where the court sits, sharing the board's column.
 *
 * For a top corner the court sits beneath the board (R1: board `top:24`,
 * court `top:198` — a 28px gap for a 146px board). The handoff never draws
 * a bottom-corner board with a court; the rule for that case — same
 * column, same 28px gap, but above the board — is this document's
 * inference, not the designer's (spec: "R6's court rule").
 */
export function courtSlot(
  anchor: BoardAnchor,
  boardPosition: BoardPosition,
  boardSize: BoardSize,
  courtSize: BoardSize,
): BoardPosition {
  const [row, column] = anchor.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  const left =
    column === "left"
      ? boardPosition.left
      : boardPosition.left + boardSize.width - courtSize.width;
  const top =
    row === "top"
      ? boardPosition.top + boardSize.height + COURT_BOARD_GAP
      : boardPosition.top - COURT_BOARD_GAP - courtSize.height;
  return { left, top };
}
