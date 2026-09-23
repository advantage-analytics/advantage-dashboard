"use client";

import { useCallback, useEffect, useState } from "react";
import { DRAWER_ATTR } from "@/components/dashboard/matches/match-drawer";

/**
 * The DOM id of one event-page row, so the selection can return focus to it
 * and scroll it into view when ↑/↓ step past the fold. `EventRow` stamps it.
 */
export function eventRowId(id: string): string {
  return `event-row-${id}`;
}

export interface RowSelection {
  /** The row carrying the wash and `aria-current`. Null while nothing is selected. */
  selectedId: string | null;
  /**
   * What the drawer shows. Equal to `selectedId` except while the slide-out
   * plays, when the selection is already gone and the drawer still is not.
   */
  drawerId: string | null;
  /** The drawer is sliding out — hand this to `PeekDrawerFrame`'s `closing`. */
  closing: boolean;
  /** The last open came from a key, so the drawer should take focus. */
  openedByKeyboard: boolean;
  /** `drawerId`'s position among the visible `ids`, or -1. */
  index: number;
  /** How many rows are visible — the drawer counter's denominator. */
  total: number;
  canPrev: boolean;
  canNext: boolean;
  /** A row click: open the drawer on it, or close it if it is already there. */
  toggle: (id: string, viaKeyboard: boolean) => void;
  /** Open (or move) the drawer onto `id`. */
  select: (id: string, viaKeyboard: boolean) => void;
  /** Close, optionally returning focus to that row. */
  close: (returnFocusTo?: string | null) => void;
  /** ↑/↓ — step through the visible rows. */
  step: (delta: -1 | 1) => void;
  /** `PeekDrawerFrame`'s `onClosed`: the slide-out finished. */
  finishClose: () => void;
}

/**
 * The peek-drawer selection model, lifted from `static/static-schedule.tsx`
 * so the event pages' tables behave exactly as the Schedule, Roster and
 * Matches rails do.
 *
 * - A row click selects; clicking the selected row again closes.
 * - Esc closes; ↑/↓ step through `ids` — the rows ON SCREEN, in their
 *   displayed order, so the caller passes its filtered, sorted list.
 * - The selection is mirrored into `?<param>=` with `history.replaceState`,
 *   never `router.replace`, which the App Router treats as a navigation and
 *   re-renders from the server for a change to one query string.
 * - The keys stand down inside fields, modal and alert dialogs, any dialog
 *   that is not the peek drawer (told apart by `DRAWER_ATTR`) and Radix
 *   poppers — an open menu owns its own arrows.
 * - A cut that hides the selected row clears the selection, adjusted during
 *   render so nothing paints a drawer for a row that is no longer listed.
 *
 * `initialId` arrives as a prop, never from `useSearchParams()`: the page
 * reads `?<param>=` on the server, and it is ignored unless it names a row.
 */
export function useRowSelection({
  ids,
  initialId,
  param,
}: {
  ids: readonly string[];
  initialId: string | null;
  param: string;
}): RowSelection {
  const initial = initialId && ids.includes(initialId) ? initialId : null;
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);

  // A cut hid the row the drawer described. Adjusted during render rather
  // than in an effect, so no frame paints a drawer for a row that is gone.
  if (drawerId !== null && !ids.includes(drawerId)) {
    setSelectedId(null);
    setDrawerId(null);
    setClosing(false);
  }

  // The URL follows the selection — including the render-time clear above,
  // which cannot touch `history` itself.
  useEffect(() => {
    syncUrl(param, selectedId);
  }, [param, selectedId]);

  const finishClose = useCallback(() => {
    setDrawerId(null);
    setClosing(false);
  }, []);

  // `onAnimationEnd` normally finishes a close; this covers reduced motion,
  // where no animation runs, and is harmless when both fire.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(finishClose, 240);
    return () => clearTimeout(timer);
  }, [closing, finishClose]);

  const select = useCallback((id: string, viaKeyboard: boolean) => {
    setClosing(false);
    setSelectedId(id);
    setDrawerId(id);
    setOpenedByKeyboard(viaKeyboard);
  }, []);

  const close = useCallback((returnFocusTo: string | null = null) => {
    setSelectedId(null);
    setClosing(true);
    if (returnFocusTo)
      document.getElementById(eventRowId(returnFocusTo))?.focus();
  }, []);

  const toggle = useCallback(
    (id: string, viaKeyboard: boolean) => {
      if (selectedId === id) close(viaKeyboard ? id : null);
      else select(id, viaKeyboard);
    },
    [selectedId, select, close],
  );

  const step = useCallback(
    (delta: -1 | 1) => {
      if (!selectedId) return;
      const next = ids[ids.indexOf(selectedId) + delta];
      if (!next) return;
      select(next, true);
      document
        .getElementById(eventRowId(next))
        ?.scrollIntoView({ block: "nearest" });
    },
    [ids, selectedId, select],
  );

  useEffect(() => {
    if (!selectedId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      // `instanceof`, not a cast: a keydown dispatched on `window` or
      // `document` has no `closest`, and the guard must stand down rather
      // than throw.
      const target = event.target instanceof Element ? event.target : null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (target.closest('[role="alertdialog"], [aria-modal="true"]')) return;
        if (
          target.closest(
            `[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`,
          )
        )
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close(selectedId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, close, step]);

  const index = drawerId ? ids.indexOf(drawerId) : -1;

  return {
    selectedId,
    drawerId,
    closing,
    openedByKeyboard,
    index,
    total: ids.length,
    canPrev: index > 0,
    canNext: index >= 0 && index < ids.length - 1,
    toggle,
    select,
    close,
    step,
    finishClose,
  };
}

/** Mirror the selection into `?<param>=` without a navigation. */
function syncUrl(param: string, id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(param, id);
  else url.searchParams.delete(param);
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
}
