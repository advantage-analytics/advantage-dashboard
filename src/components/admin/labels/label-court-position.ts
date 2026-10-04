import {
  BOARD_ANCHORS,
  type BoardAnchor,
  type BoardInsets,
  type BoardPosition,
  type BoardSize,
} from "@/components/dashboard/matches/match-detail/film/board-position";
import {
  DEFAULT_DOCK_ANCHOR,
  DOCK_INSETS,
  dockRest,
} from "./label-dock-position";

/**
 * Where the labelling console's floating court card rests. Pure, like
 * `label-dock-position.ts` — the video's file, whose corners and insets this
 * one shares — so the geometry is a spec; the moving itself is the film
 * room's `useCornerDrag`.
 *
 * The court and the video are two cards over one table, each with a corner of
 * its own choosing, so one rule keeps them apart: **the court yields**. A
 * corner means the same thing for both cards (`dockRest`) until the court's
 * spot would cover the video; then the court takes, in order, the first spot
 * that is clear and on screen:
 *
 * 1. beside the video, on the same edge of the viewport;
 * 2. stacked above or below it, in the same column;
 * 3. another corner — the one across the screen first, then the rest.
 *
 * With none clear (a viewport too small for both) it keeps its own corner:
 * overlapping but on screen beats off screen.
 */

/** Board 08i's card: the video's height, with room to click round a half. */
export const COURT_DOCK_SIZE: BoardSize = { width: 300, height: 318 };

/** Across the screen from the video, which defaults to the bottom right. */
export const DEFAULT_COURT_ANCHOR: BoardAnchor = "bottom-left";

/** Separate from the video's, so moving one never moves the other. */
export const COURT_ANCHOR_STORAGE_KEY = "labels-court-corner";
export const COURT_MINIMISED_STORAGE_KEY = "labels-court-minimised";

/** The air the two cards keep between them. */
export const COURT_DOCK_GAP = 12;

/** The video dock before it has been measured: 480 wide, 16:9 under a bar. */
export const VIDEO_DOCK_NOMINAL_SIZE: BoardSize = { width: 480, height: 302 };

/**
 * The video's minimised pill, generously: it is 36px tall and as wide as
 * "Point 128" between two buttons. The dock's box keeps the player's size
 * while minimised, but only this corner of it is on screen.
 */
export const VIDEO_PILL_SIZE: BoardSize = { width: 176, height: 36 };

/** What the court needs to know of the video dock to keep clear of it. */
export interface VideoDockLayout {
  anchor: BoardAnchor | null;
  /** The dock's measured box (the player's, minimised or not). */
  size: BoardSize;
  minimised: boolean;
}

/** The video as it rests when nobody has moved it. */
export const DEFAULT_VIDEO_LAYOUT: VideoDockLayout = {
  anchor: DEFAULT_DOCK_ANCHOR,
  size: VIDEO_DOCK_NOMINAL_SIZE,
  minimised: false,
};

interface Rect extends BoardPosition, BoardSize {}

/** The part of the video dock that is on screen: the player, or its pill. */
export function videoRect(
  video: VideoDockLayout,
  room: BoardSize,
  insets: BoardInsets = DOCK_INSETS,
): Rect {
  const box = dockRest(video.anchor, video.size, room, insets);
  if (!video.minimised) return { ...box, ...video.size };
  // The pill is pinned to the anchored corner of the player's box.
  const [row, column] = (video.anchor ?? DEFAULT_DOCK_ANCHOR).split("-");
  const width = Math.min(VIDEO_PILL_SIZE.width, video.size.width);
  const height = Math.min(VIDEO_PILL_SIZE.height, video.size.height);
  return {
    left: column === "left" ? box.left : box.left + video.size.width - width,
    top: row === "top" ? box.top : box.top + video.size.height - height,
    width,
    height,
  };
}

/** Whether two boxes come closer than `gap` to each other. */
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.left < b.left + b.width + gap &&
    b.left < a.left + a.width + gap &&
    a.top < b.top + b.height + gap &&
    b.top < a.top + a.height + gap
  );
}

function inside(
  at: BoardPosition,
  size: BoardSize,
  room: BoardSize,
  insets: BoardInsets,
): boolean {
  return (
    at.left >= insets.left &&
    at.top >= insets.top &&
    at.left + size.width <= room.width - insets.right &&
    at.top + size.height <= room.height - insets.bottom
  );
}

/** The other corners, nearest change first: across, then up/down, then both. */
function otherCorners(anchor: BoardAnchor): BoardAnchor[] {
  const [row, column] = anchor.split("-");
  const otherRow = row === "top" ? "bottom" : "top";
  const otherColumn = column === "left" ? "right" : "left";
  return [
    `${row}-${otherColumn}`,
    `${otherRow}-${column}`,
    `${otherRow}-${otherColumn}`,
  ].filter((corner): corner is BoardAnchor =>
    (BOARD_ANCHORS as readonly string[]).includes(corner),
  );
}

/**
 * The pixel position of a resting corner for the court card in this
 * viewport, clear of the video dock. `video` null: there is no video to
 * clear, and a corner is just a corner.
 */
export function courtRest(
  anchor: BoardAnchor | null,
  court: BoardSize,
  room: BoardSize,
  video: VideoDockLayout | null = null,
  insets: BoardInsets = DOCK_INSETS,
): BoardPosition {
  const corner = anchor ?? DEFAULT_COURT_ANCHOR;
  const own = dockRest(corner, court, room, insets);
  if (!video) return own;

  const taken = videoRect(video, room, insets);
  const clear = (at: BoardPosition) =>
    inside(at, court, room, insets) &&
    !overlaps({ ...at, ...court }, taken, COURT_DOCK_GAP);
  if (!overlaps({ ...own, ...court }, taken, COURT_DOCK_GAP)) return own;

  const [row, column] = corner.split("-");
  const beside: BoardPosition = {
    left:
      column === "left"
        ? taken.left + taken.width + COURT_DOCK_GAP
        : taken.left - COURT_DOCK_GAP - court.width,
    top: own.top,
  };
  const stacked: BoardPosition = {
    left: own.left,
    top:
      row === "top"
        ? taken.top + taken.height + COURT_DOCK_GAP
        : taken.top - COURT_DOCK_GAP - court.height,
  };
  const candidates = [
    beside,
    stacked,
    ...otherCorners(corner).map((other) =>
      dockRest(other, court, room, insets),
    ),
  ];
  return candidates.find(clear) ?? own;
}

/** The corner the card grows from and shrinks into, as a `transform-origin`. */
export function courtOrigin(anchor: BoardAnchor | null): string {
  const [row, column] = (anchor ?? DEFAULT_COURT_ANCHOR).split("-");
  return `${row} ${column}`;
}
