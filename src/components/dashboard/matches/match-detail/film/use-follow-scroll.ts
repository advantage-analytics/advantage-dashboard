"use client";

import { useEffect, useRef, type RefObject } from "react";

import { reducedMotionNow } from "./film-motion";

/**
 * Follow the film, or hold the point being read: the scrolling half, shared by
 * every surface that lists points under a playing video (the Film tab's
 * `PointList` and the labelling console's points rail), each scrolling a list
 * element of its own. The focus state (`PointFocus`, film-timeline.ts) stays
 * with the caller.
 *
 * Keep whatever is lit in view while following (the playing shot while a well
 * is open, the playing row otherwise) and stop entirely while held. A re-follow
 * (any held → follow transition, observed through `prevHeldRef`) is a jump: the
 * playing point's row goes to the top of the box, `REFOLLOW_JUMP_INSET_PX` in,
 * even when it is already in view. It targets the point row, never the shot:
 * the well mounts under the row, so aligning the shot would push the row off
 * the top. The jump is a window (`REFOLLOW_JUMP_WINDOW_MS`), since a step
 * re-follows before its seek lands. Outside the window it is the minimal scroll
 * that brings the lit thing inside the box.
 *
 * Read the viewer's own scrolling as intent to hold: a `wheel`, a touch drag, a
 * `pointerdown` on the scroller's own gutter, or a scrolling key. Never the
 * `scroll` event, which a programmatic scroll fires too, so the hook's own
 * travel can never hold. Each holds the displayed point, on entering only:
 * scrolling while already held keeps the held point. With nothing displayed the
 * hold is `null`.
 *
 * Moves the scroller's own offset and nothing else: the DOM's
 * scroll-an-element-into-view method walks every ancestor, and dragged the
 * whole room sideways while its drawer was still off-canvas.
 */

/**
 * Keys that scroll a scroller (or the row focused inside it) without a `wheel`,
 * `touchmove` or `pointerdown`: the fourth hold source.
 */
export const SCROLL_KEYS = new Set([
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
  "ArrowUp",
  "ArrowDown",
]);

/**
 * How long the follow flag stays up when the scroller never reports
 * `scrollend` (Safari). Chromium's smooth scroll eases in about 300ms.
 */
export const FOLLOW_SCROLL_FALLBACK_MS = 400;

/**
 * Where a re-follow jump puts the playing row: its top this far below the
 * scroller's top edge, which clears the row's own `py-1.5`.
 */
export const REFOLLOW_JUMP_INSET_PX = 8;

/**
 * How long after a held → follow transition the keep-in-view runs as a jump.
 * A window, not a one-shot: a step re-follows and then seeks, and the seek
 * lands (`activePointId` moves) on a later tick — the crossing that follows
 * inside the window is part of the same jump.
 */
export const REFOLLOW_JUMP_WINDOW_MS = 800;

/**
 * Where a key edits rather than scrolls: inside a form control the scrolling
 * keys move a caret or change a value, and the page stays put. The Film tab's
 * lists carry none, so this changes nothing there; the labelling console's
 * rail is made of them.
 */
const EDITING_CONTROLS = "input, select, textarea, [contenteditable='true']";

/** The scroller's box as the keep-in-view reads it, in viewport px. */
export interface FollowBox {
  top: number;
  bottom: number;
  /** The scroller's current offset. */
  scrollTop: number;
  /** The furthest the scroller can go — the end a jump is clamped at. */
  maxScrollTop: number;
}

/** The lit row's edges, in the same viewport px. */
export interface FollowRow {
  top: number;
  bottom: number;
}

/**
 * What the follow effect scrolls to: on a jump the playing point's row
 * (never the shot — see the file comment); otherwise the playing shot while
 * a well is open, else the playing row. `null` when nothing is lit.
 */
export function followTargetSelector(
  jump: boolean,
  activePointId: string | null | undefined,
  activeShotId: string | null | undefined,
  wellOpen: boolean,
): string | null {
  const pointRow = activePointId ? `[data-point-id="${activePointId}"]` : null;
  if (jump) return pointRow;
  if (wellOpen && activeShotId) return `[data-shot-id="${activeShotId}"]`;
  return pointRow;
}

/**
 * The offset the scroller should move to, or `null` to leave it where it is.
 *
 * `jump`: the row's top `insetPx` under the box's top, clamped to the
 * scroller's range; `null` only when that is where it already is (within a
 * pixel). `keep`: the minimal travel that brings the row inside the box —
 * its top to the box's top, or its bottom to the box's bottom — and `null`
 * when it is already wholly inside. The same arithmetic for every scroller:
 * only the box differs.
 */
export function followScrollTarget(
  mode: "jump" | "keep",
  row: FollowRow,
  box: FollowBox,
  insetPx: number = REFOLLOW_JUMP_INSET_PX,
): number | null {
  let top = box.scrollTop;
  if (mode === "jump") {
    top += row.top - box.top - insetPx;
    top = Math.max(0, Math.min(top, box.maxScrollTop));
    return Math.abs(top - box.scrollTop) < 1 ? null : top;
  }
  if (row.top < box.top) return top + (row.top - box.top);
  if (row.bottom > box.bottom) return top + (row.bottom - box.bottom);
  return null;
}

/**
 * What the continuous keep-in-view holds under `keepPointRow`: the span from
 * the point row to the shot, while that span fits the box, so a seek back to an
 * earlier point brings the row down with its shot instead of parking the shot
 * at the box's top with its row cut off. In a rally longer than the box the
 * shot wins. With no shot row to be found, the point row is the whole of it.
 */
export function followKeepSpan(
  shot: FollowRow | null,
  pointRow: FollowRow | null,
  boxHeight: number,
): FollowRow | null {
  if (!shot || !pointRow) return shot ?? pointRow;
  const top = Math.min(pointRow.top, shot.top);
  const bottom = Math.max(pointRow.bottom, shot.bottom);
  return bottom - top <= boxHeight ? { top, bottom } : shot;
}

/**
 * Whether a key press is the viewer scrolling. Not when something already
 * handled it (`defaultPrevented`), not inside a form control, and not Space
 * on a button or a row acting as one — there it is the control's activation,
 * not a scroll. (A row's React handler prevents Enter/Space, but it runs
 * after this native listener, so Space is skipped here by its target.)
 */
export function scrollKeyHolds(event: {
  key: string;
  defaultPrevented: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.defaultPrevented || !SCROLL_KEYS.has(event.key)) return false;
  const target =
    event.target && "closest" in event.target
      ? (event.target as Element)
      : null;
  if (target?.closest(EDITING_CONTROLS)) return false;
  if (event.key === " " && target?.closest("button, [role=button]")) {
    return false;
  }
  return true;
}

/** The scroller's own gutter: the one part of it that is not a child. */
function onGutter(target: HTMLElement, event: Event): boolean {
  return event.target === target;
}

function readBox(el: HTMLElement): FollowBox {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    scrollTop: el.scrollTop,
    maxScrollTop: el.scrollHeight - el.clientHeight,
  };
}

const NOOP = () => {};

export interface FollowScrollOptions {
  /** The element whose `scrollTop` moves. */
  scroller: RefObject<HTMLElement | null>;
  /**
   * Whether the scroller is on screen. The intent listeners attach only
   * then; the keep-in-view simply finds no row otherwise. Default `true`.
   */
  mounted?: boolean;
  /** `pointFocus.mode === "held"`. */
  held: boolean;
  /** The playing point and shot, as the rows name them in `data-*-id`. */
  activePointId: string | null | undefined;
  activeShotId?: string | null;
  /** Whether the playing shot has a row to scroll to (its well is open). */
  wellOpen?: boolean;
  /** The point a hand scroll holds: the displayed one, `null` for none. */
  displayedPointId: string | null | undefined;
  /** Stable identity, please — the listeners re-attach on a new one. */
  onHoldPoint: (pointId: string | null) => void;
  /**
   * Keep the playing point's own row in the box along with its lit shot
   * (`followKeepSpan`). For a list whose point row is what says which point
   * the open well belongs to — the labelling console. Default `false`.
   */
  keepPointRow?: boolean;
}

export function useFollowScroll({
  scroller,
  mounted = true,
  held,
  activePointId,
  activeShotId = null,
  wellOpen = false,
  displayedPointId,
  onHoldPoint,
  keepPointRow = false,
}: FollowScrollOptions): {
  /** Up while the hook's own smooth scroll is in flight. */
  followScrolling: RefObject<boolean>;
} {
  // The intent listeners read the held flag and the displayed id through
  // refs, written after each commit, so their identity never moves with the
  // film and they re-attach only on a new `onHoldPoint`. Written in an effect
  // rather than during render — the handlers run on a later event, never
  // inside the render that changed the value.
  const displayedPointRef = useRef(displayedPointId ?? null);
  const heldRef = useRef(held);
  useEffect(() => {
    displayedPointRef.current = displayedPointId ?? null;
    heldRef.current = held;
  }, [displayedPointId, held]);

  // Around its own `scrollTo` the effect raises `followScrollRef`, so nothing
  // derived from the scroller's motion can mistake the effect's travel for
  // the viewer's; the intent listeners do not consult it — a wheel arriving
  // mid-follow-scroll is intent and holds.
  const followScrollRef = useRef(false);
  /** Cancels the pending settle of the last follow scroll, flag untouched. */
  const cancelSettleRef = useRef<() => void>(NOOP);
  /** `held` as of the effect's last run: the re-follow transition's memory. */
  const prevHeldRef = useRef(held);
  /** `performance.now()` until which a follow run is a jump. */
  const jumpUntilRef = useRef(0);
  useEffect(() => {
    const wasHeld = prevHeldRef.current;
    prevHeldRef.current = held;
    if (held) return;
    if (wasHeld)
      jumpUntilRef.current = performance.now() + REFOLLOW_JUMP_WINDOW_MS;
    const jump = performance.now() < jumpUntilRef.current;
    const target = scroller.current;
    const selector = followTargetSelector(
      jump,
      activePointId,
      activeShotId,
      wellOpen,
    );
    if (!target || !selector) return;
    const box = readBox(target);
    const lit =
      target.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;
    const pointRow =
      keepPointRow && !jump && activePointId
        ? (target
            .querySelector<HTMLElement>(`[data-point-id="${activePointId}"]`)
            ?.getBoundingClientRect() ?? null)
        : null;
    const row = followKeepSpan(lit, pointRow, box.bottom - box.top);
    if (!row) return;
    const top = followScrollTarget(
      jump ? "jump" : "keep",
      row,
      box,
      REFOLLOW_JUMP_INSET_PX,
    );
    if (top === null) return;

    cancelSettleRef.current();
    followScrollRef.current = true;
    const settle = () => {
      cancel();
      followScrollRef.current = false;
    };
    // `scrollend` is the honest end of the travel; the timer is for the
    // engines that never send it.
    const timer = window.setTimeout(settle, FOLLOW_SCROLL_FALLBACK_MS);
    const cancel = () => {
      window.clearTimeout(timer);
      target.removeEventListener("scrollend", settle);
      cancelSettleRef.current = NOOP;
    };
    cancelSettleRef.current = cancel;
    target.addEventListener("scrollend", settle);
    // Smooth on the scroller's own offset — Chromium eases it in about 300ms,
    // no scroll-jacking of our own — and instant under reduced motion.
    target.scrollTo({ top, behavior: reducedMotionNow() ? "auto" : "smooth" });
  }, [activePointId, activeShotId, wellOpen, held, scroller, keepPointRow]);

  useEffect(() => {
    if (!mounted) return;
    const target = scroller.current;
    if (!target) return;
    // Null when nothing is displayed (dead time, or before the first point),
    // and that still holds: no well opens, and the list stays where the viewer
    // put it.
    const hold = () => {
      if (heldRef.current) return;
      onHoldPoint(displayedPointRef.current);
    };
    const onPointerDown = (e: Event) => {
      if (onGutter(target, e)) hold();
    };
    const onKeyDown = (e: Event) => {
      if (scrollKeyHolds(e as KeyboardEvent)) hold();
    };
    target.addEventListener("wheel", hold, { passive: true });
    target.addEventListener("touchmove", hold, { passive: true });
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("keydown", onKeyDown);
    return () => {
      target.removeEventListener("wheel", hold);
      target.removeEventListener("touchmove", hold);
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("keydown", onKeyDown);
    };
  }, [mounted, onHoldPoint, scroller]);

  return { followScrolling: followScrollRef };
}
