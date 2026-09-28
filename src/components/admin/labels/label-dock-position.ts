import {
  clampBoardPosition,
  type BoardAnchor,
  type BoardInsets,
  type BoardPosition,
  type BoardSize,
} from "@/components/dashboard/matches/match-detail/film/board-position";

/**
 * Where the labelling console's floating video rests. Pure, so the geometry
 * is testable; the moving itself is the film room's `useCornerDrag`.
 *
 * The room is the viewport (the dock's fixed layer), and each corner keeps
 * 24px from its edges — plus the admin header along the top. That header is
 * `--header-h` (44px) tall and scrolls away with the page, so a top corner
 * sits 24px under where it would be; the gap it leaves once the page has
 * scrolled is the price of never covering the header at the top of it.
 *
 * Unlike the film room's `anchorPosition`, no corner carries an extra
 * clearance: there is no "Points" trigger here. `useCornerDrag` still picks
 * the landing corner with `nearestAnchor`, which does apply the room's
 * top-right clearance (58px) — a 10px lean in which corner a drop at the very
 * top of the screen resolves to, never a difference in where it then rests.
 */

/** `--header-h`, the admin header's height. */
const ADMIN_HEADER_HEIGHT = 44;

/** The clearance every resting corner keeps from the viewport's edges. */
const DOCK_EDGE = 24;

export const DOCK_INSETS: BoardInsets = {
  top: ADMIN_HEADER_HEIGHT + DOCK_EDGE,
  right: DOCK_EDGE,
  bottom: DOCK_EDGE,
  left: DOCK_EDGE,
};

/** Out of the way of the table's first columns, where the labeller works. */
export const DEFAULT_DOCK_ANCHOR: BoardAnchor = "bottom-right";

/** Separate from the film room's, so moving one never moves the other. */
export const DOCK_ANCHOR_STORAGE_KEY = "labels-player-corner";
export const DOCK_MINIMISED_STORAGE_KEY = "labels-player-minimised";

function split(anchor: BoardAnchor) {
  return anchor.split("-") as ["top" | "bottom", "left" | "right"];
}

/** The pixel position of a resting corner for this dock in this viewport. */
export function dockRest(
  anchor: BoardAnchor | null,
  dock: BoardSize,
  room: BoardSize,
  insets: BoardInsets = DOCK_INSETS,
): BoardPosition {
  const [row, column] = split(anchor ?? DEFAULT_DOCK_ANCHOR);
  return clampBoardPosition(
    {
      left:
        column === "left"
          ? insets.left
          : room.width - insets.right - dock.width,
      top:
        row === "top" ? insets.top : room.height - insets.bottom - dock.height,
    },
    dock,
    room,
  );
}

/**
 * The corner the dock grows from and shrinks into, as a `transform-origin`:
 * minimising collapses the player toward the corner it is anchored to, where
 * the compact pill appears, so the two read as one object changing size.
 */
export function dockOrigin(anchor: BoardAnchor | null): string {
  const [row, column] = split(anchor ?? DEFAULT_DOCK_ANCHOR);
  return `${row} ${column}`;
}

/** A stored minimised flag. Anything but "1" is expanded. */
export function parseDockMinimised(raw: string | null): boolean {
  return raw === "1";
}
