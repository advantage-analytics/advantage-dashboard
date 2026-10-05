import type {
  BoardAnchor,
  BoardInsets,
  BoardPosition,
  BoardSize,
} from "@/components/dashboard/matches/match-detail/film/board-position";
import { dockRest } from "./label-dock-position";

/**
 * Where the film view's chrome sits over the picture (board 08n,
 * `label-film-view.tsx`). Pure, as `label-court-position.ts` is for the
 * overlay's court card, so the arithmetic is a spec; the moving itself is the
 * film room's `useCornerDrag`.
 *
 * The room is the film layer — the whole viewport. Three things sit over it:
 *
 * - the **rail**, flush against the right edge from top to bottom (board
 *   08n's screen B, "full bleed like the Video tab"), as wide as the labeller
 *   left it (`label-layout.ts`'s rail width);
 * - the **transport**, on the film's foot, running from the left edge to
 *   {@link filmTransportInset} short of the right — the rail's left edge, its
 *   own 24px padding keeping the breathing room — so the rail never covers
 *   it; the whole width once the rail is hidden;
 * - the **court**, a card the size of {@link FILM_COURT_SIZE}, top-left by
 *   default and dragged to any corner, resting ({@link filmCourtRest}) clear
 *   of the rail, the transport and — once the rail is hidden — the two pills
 *   that bring the chrome back.
 */

/**
 * The rail's inset from the frame's top, right and bottom: none — screen B
 * sits it flush, as the Video tab's full screen does. Kept as a number so
 * the transport's and the court's arithmetic read the same either way.
 */
export const FILM_RAIL_INSET_PX = 0;

/**
 * The air the court card keeps from the rail's left edge: 24px, so a card in
 * a right corner never reads as part of the rail.
 */
export const FILM_COURT_RAIL_GAP_PX = 24;

/**
 * The transport's right inset in px: the rail's left edge (its width plus
 * its inset, so 640 at the frame's rail — the transport's own padding keeps
 * the gap), or nothing once the rail is hidden and the transport spans the
 * film.
 */
export function filmTransportInset(
  railWidth: number,
  railHidden: boolean,
): number {
  return railHidden ? 0 : railWidth + FILM_RAIL_INSET_PX;
}

/**
 * Board 08n's court card: 214 wide, and tall enough for the panel's header,
 * the court at 150 × 297 and the Contact / Landing foot.
 */
export const FILM_COURT_SIZE: BoardSize = { width: 214, height: 392 };

/** The frame's `left:20px; top:20px`. */
export const DEFAULT_FILM_COURT_ANCHOR: BoardAnchor = "top-left";

/** The card's corner, separate from the overlay court's so neither moves the other. */
export const FILM_COURT_ANCHOR_STORAGE_KEY = "labels-film-court-position";
export const FILM_RAIL_HIDDEN_STORAGE_KEY = "labels-film-rail-hidden";
export const FILM_COURT_HIDDEN_STORAGE_KEY = "labels-film-court-hidden";

/** The card's clearance from the film's left and top edges. */
const FILM_COURT_EDGE = 20;

/**
 * What the transport block takes of the film's foot — the room's own
 * `BASE_BOARD_INSETS.bottom`: title row, track and control row.
 */
const FILM_TRANSPORT_HEIGHT = 144;

/**
 * The two pills (top-left "Court", top-right "Points"): 18px down, 28px tall,
 * and 12px of air under them — where the room's own board clears its
 * "Points" trigger.
 */
const FILM_PILL_CLEARANCE = 58;

/** What the rail must know of to keep clear of it. */
export interface FilmRailLayout {
  width: number;
  hidden: boolean;
}

/**
 * The court card's clearances in this room: 20px from the left and the top,
 * the transport's height from the bottom, and on the right the rail's left
 * edge plus {@link FILM_COURT_RAIL_GAP_PX} — or, with the rail hidden, that
 * gap from the edge of the film.
 */
export function filmCourtInsets(rail: FilmRailLayout): BoardInsets {
  return {
    top: FILM_COURT_EDGE,
    left: FILM_COURT_EDGE,
    bottom: FILM_TRANSPORT_HEIGHT,
    right:
      (rail.hidden ? 0 : filmTransportInset(rail.width, false)) +
      FILM_COURT_RAIL_GAP_PX,
  };
}

/**
 * The pixel position of a resting corner for the court card in this room,
 * clear of the rail. With the rail hidden the top-right corner holds the
 * "Points" pill, so the card rests under it there — the one corner with a
 * clearance of its own. Never off screen, whatever the room.
 */
export function filmCourtRest(
  anchor: BoardAnchor | null,
  court: BoardSize,
  room: BoardSize,
  rail: FilmRailLayout,
): BoardPosition {
  const corner = anchor ?? DEFAULT_FILM_COURT_ANCHOR;
  const insets = filmCourtInsets(rail);
  if (rail.hidden && corner === "top-right") {
    return dockRest(corner, court, room, {
      ...insets,
      top: FILM_PILL_CLEARANCE,
    });
  }
  return dockRest(corner, court, room, insets);
}
