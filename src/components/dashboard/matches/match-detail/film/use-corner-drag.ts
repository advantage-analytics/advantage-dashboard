"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  BASE_BOARD_INSETS,
  clampBoardPosition,
  nearestAnchor,
  nudgeBoard,
  parseBoardAnchor,
  type BoardAnchor,
  type BoardArrowKey,
  type BoardInsets,
  type BoardPosition,
  type BoardSize,
} from "./board-position";

/**
 * The room's one movement mechanic, owned in one place.
 *
 * The scoreboard was the first thing in the fullscreen room a viewer could
 * move: free under the pointer, or 8px at a time by arrow key (40 with
 * shift), with a ghost showing the corner it will land in, and the corner
 * remembered for this viewer (R6). The court card wants exactly that — "I
 * should be able to move the court visual like the scorecard" (author,
 * 2026-09-22) — so the mechanic lives here rather than being copied. A second
 * copy would be the file that drifts.
 *
 * Everything that differs between the two objects is an option:
 *
 * - `storageKey` — the board and the court remember separate corners.
 * - `defaultAnchor` — the board always has one (`top-left`); the court's is
 *   `null`, meaning "wherever the board's column puts you", until the viewer
 *   drops it somewhere of its own.
 * - `rest` — what a stored corner means in pixels. `anchorPosition` for the
 *   board; `courtRest` for the court, which stacks under the board until it
 *   has a corner of its own.
 * - the drag handle — the board IS its handle, so the caller spreads
 *   `handleProps` onto the same element as `containerProps`. The court's card
 *   is all buttons, so only its 20px header row takes them.
 *
 * Geometry is read off the container element, never off `e.currentTarget`,
 * precisely because those are two different elements once the handle is a
 * child. The pointer capture stays on `e.currentTarget` — the element the
 * browser is actually routing the pointer to.
 *
 * The key handlers ignore anything that did not start on the container
 * itself. The board has no focusable children, so this changes nothing there;
 * it is what lets a click or a Space on one of the court's marks seek instead
 * of picking the card up.
 */

/** The glide into a resting corner, and the ghost's hop between corners. */
export const SETTLE_CLASS =
  "transition-[left,top] duration-[360ms] ease-[var(--ease-out-expo)] motion-reduce:transition-none";

/** How each landing is spoken. */
export const ANCHOR_LABEL: Record<BoardAnchor, string> = {
  "top-left": "top left",
  "top-right": "top right",
  "bottom-left": "bottom left",
  "bottom-right": "bottom right",
};

function arrowKey(key: string): BoardArrowKey | null {
  return key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
    ? key
    : null;
}

export interface CornerDragOptions {
  /** Where this object's corner is remembered for this viewer. */
  storageKey: string;
  /** The corner a viewer who has never moved it gets. */
  defaultAnchor: BoardAnchor | null;
  /**
   * The resting pixels of a stored corner — `null` being "the corner this
   * object rests in when the viewer has never moved it".
   */
  rest: (
    anchor: BoardAnchor | null,
    size: BoardSize,
    room: BoardSize,
  ) => BoardPosition;
  /** Where it sits before the first measurement lands. */
  fallback: BoardPosition;
  /** The polite sentence for a landing, e.g. "Scoreboard in the top left corner." */
  announce: (anchor: BoardAnchor) => string;
  /** Defaults to the board's own clearances. */
  insets?: BoardInsets;
}

export interface CornerDrag {
  /** The stored corner, or null while the object has never been dropped. */
  anchor: BoardAnchor | null;
  /** The corner as an attribute value: "follow" when there is none. */
  anchorAttr: string;
  /** Where to draw it this frame — free under the pointer, or at rest. */
  position: BoardPosition;
  /** The object's own measured box and the room's, once both are known. */
  sizes: { self: BoardSize; room: BoardSize } | null;
  /** Where a ghost should sit, or null when nothing is being moved. */
  ghost: BoardPosition | null;
  /** It is off its corner: under the pointer or mid-nudge. */
  free: boolean;
  /** A keyboard hold — Space lifted it, or an arrow nudged it. */
  held: boolean;
  /** The first measurement has landed, so a move may now be glided. */
  placed: boolean;
  /** The last landing, counted so the same corner twice is announced twice. */
  announcement: { text: string; seq: number } | null;
  containerProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    tabIndex: number;
    "data-film-own-keys": string;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
    onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  };
  handleProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
  };
}

export function useCornerDrag({
  storageKey,
  defaultAnchor,
  rest,
  fallback,
  announce,
  insets = BASE_BOARD_INSETS,
}: CornerDragOptions): CornerDrag {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<BoardAnchor | null>(() => {
    try {
      return (
        parseBoardAnchor(localStorage.getItem(storageKey)) ?? defaultAnchor
      );
    } catch {
      return defaultAnchor;
    }
  });
  // Own and room sizes, measured before paint and kept current, so a spot on
  // the right or bottom edge follows an object that grows (a longer point
  // name) or a room that resizes.
  const [sizes, setSizes] = useState<{
    self: BoardSize;
    room: BoardSize;
  } | null>(null);
  // Glides only once it has been placed: the first measurement puts a
  // remembered spot straight where it belongs instead of flying it in from
  // the fallback every time the room opens.
  const [placed, setPlaced] = useState(false);
  // Where it is while it is being moved — under the pointer, or nudged by the
  // arrows. Null whenever it is resting in its corner.
  const [free, setFree] = useState<BoardPosition | null>(null);
  // A keyboard hold: Space lifted it, or an arrow nudged it. It ends on a
  // drop (Space), on Escape, or when focus leaves.
  const [held, setHeld] = useState(false);
  // The corner the last landing put it in, spoken politely once it arrives.
  // `seq` counts the landings so that coming back to the same corner replaces
  // the live region's text node and is announced again.
  const [landed, setLanded] = useState<{
    anchor: BoardAnchor;
    seq: number;
  } | null>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    start: BoardPosition;
    /** A click is not a drag: nothing lifts until the pointer travels 3px. */
    moved: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const room = el?.offsetParent as HTMLElement | null;
    if (!el || !room) return;
    const measure = () =>
      setSizes({
        self: { width: el.offsetWidth, height: el.offsetHeight },
        room: { width: room.clientWidth, height: room.clientHeight },
      });
    measure();
    const frame = requestAnimationFrame(() => setPlaced(true));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(room);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const resting = sizes ? rest(anchor, sizes.self, sizes.room) : fallback;
  const position = free ?? resting;
  // The corner a free object would land in, and the ghost sitting in it. Both
  // a pointer drag and a keyboard hold move it free, so both draw it.
  const target =
    free && sizes ? nearestAnchor(free, sizes.self, sizes.room, insets) : null;
  const ghost = target && sizes ? rest(target, sizes.self, sizes.room) : null;

  /** Lands it in a corner and remembers it for this viewer. */
  const settle = useCallback(
    (next: BoardAnchor) => {
      setFree(null);
      setHeld(false);
      setAnchor(next);
      setLanded((last) => ({ anchor: next, seq: (last?.seq ?? 0) + 1 }));
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* private window or storage blocked — the corner just isn't kept */
      }
    },
    [storageKey],
  );

  /** Drops a free object into the corner it is closest to. */
  const drop = (at: BoardPosition) => {
    if (!sizes) return;
    settle(nearestAnchor(at, sizes.self, sizes.room, insets));
  };

  /**
   * Puts a held object back where the move began. The hold never touched
   * `anchor`, so letting the free position go returns it exactly there, and
   * nothing is written to storage.
   */
  const cancelHold = () => {
    setFree(null);
    setHeld(false);
  };

  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    if (commit && free) drop(free);
    else cancelHold();
  };

  return {
    anchor,
    anchorAttr: anchor ?? "follow",
    position,
    sizes,
    ghost,
    free: free !== null,
    held,
    placed,
    announcement: landed
      ? { text: announce(landed.anchor), seq: landed.seq }
      : null,
    containerProps: {
      ref,
      tabIndex: 0,
      "data-film-own-keys": "",
      onKeyDown: (e) => {
        // Only the container's own keys move it. The board has no focusable
        // children so nothing changes there; on the court this is what leaves
        // Space and Enter to the mark under the cursor.
        if (e.target !== e.currentTarget) return;
        if (!sizes) return;
        const arrow = arrowKey(e.key);
        if (arrow) {
          // Nudging picks it up if it was resting, so the ghost shows where it
          // would land and Space or Escape can finish the move.
          e.preventDefault();
          setHeld(true);
          setFree(
            nudgeBoard(position, arrow, e.shiftKey, sizes.self, sizes.room),
          );
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          if (free) drop(free);
          else {
            setHeld(true);
            setFree(position);
          }
          return;
        }
        if (e.key === "Escape" && held) {
          // The room's Escape closes the drawer or the room; a held object
          // takes it first, and only while it is held.
          e.preventDefault();
          e.stopPropagation();
          cancelHold();
        }
      },
      onBlur: (e) => {
        // A held object that loses focus has no keys left to finish the move,
        // so it lands where it stands.
        if (!held || e.currentTarget.contains(e.relatedTarget)) return;
        if (free) drop(free);
        else setHeld(false);
      },
    },
    handleProps: {
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        const el = ref.current;
        if (!el) return;
        // Capture keeps the drag alive when the pointer outruns the handle.
        // Best-effort: it throws for a pointer the browser no longer tracks,
        // and a drag without capture still works while over the handle.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* not capturable */
        }
        // Start from where it is on screen, not from its resting spot:
        // grabbed mid-glide, it must not jump to the end of the glide.
        const box = el.getBoundingClientRect();
        const roomBox = (
          el.offsetParent as HTMLElement | null
        )?.getBoundingClientRect();
        drag.current = {
          pointerX: e.clientX,
          pointerY: e.clientY,
          start: roomBox
            ? { left: box.left - roomBox.left, top: box.top - roomBox.top }
            : position,
          // Grabbing something that is already held by the keyboard continues
          // that move rather than snapping it back to its corner first.
          moved: held,
        };
        setHeld(false);
      },
      onPointerMove: (e) => {
        const d = drag.current;
        if (!d || !sizes) return;
        const dx = e.clientX - d.pointerX;
        const dy = e.clientY - d.pointerY;
        if (!d.moved && Math.hypot(dx, dy) < 3) return;
        d.moved = true;
        setFree(
          clampBoardPosition(
            { left: d.start.left + dx, top: d.start.top + dy },
            sizes.self,
            sizes.room,
          ),
        );
      },
      onPointerUp: (e) => {
        if (!drag.current) return;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* was never captured */
        }
        endDrag(true);
      },
      onPointerCancel: () => endDrag(false),
      onLostPointerCapture: () => {
        if (drag.current) endDrag(true);
      },
    },
  };
}
