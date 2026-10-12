"use client";

import { useCallback, useEffect, useState } from "react";
import { DRAWER_ATTR } from "@/components/dashboard/matches/match-drawer";
import {
  initialRowSelection,
  rowSelectionPosition,
  rowSelectionReducer,
  type RowSelectionAction,
  type RowSelectionState,
} from "@/components/dashboard/schedule/row-selection-model";

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
 * so every table on it behaves exactly as the Schedule, Roster and Matches
 * rails do. The transitions themselves are `row-selection-model.ts`, a pure
 * reducer; this hook owns only the `useState`, the URL mirror, the close timer
 * and the DOM calls (focus return, scroll-into-view, the window key listener).
 *
 * - A row click selects; clicking the selected row again closes.
 * - Esc closes; ↑/↓ step through `ids` — the rows ON SCREEN, in their
 *   displayed order, so the caller passes its filtered, sorted list.
 * - The selection is mirrored into `?<param>=` with `history.replaceState`,
 *   never `router.replace`, which the App Router treats as a navigation and
 *   re-renders from the server for a change to one query string.
 * - The keys stand down inside fields, modal and alert dialogs, any dialog
 *   that is not the peek drawer (told apart by `DRAWER_ATTR`), Radix poppers
 *   — an open menu owns its own arrows — and anything under
 *   `[data-row-keys="ignore"]`, which a toolbar or filter panel stamps on its
 *   root so its own controls keep ↑/↓/Esc.
 * - A row that leaves `ids` loses the drawer, by one of two paths:
 *   1. **The caller's slide-out close.** A page that wants the drawer to
 *      slide shut when a chip, filter or sort hides the selected row calls
 *      `close(null)` in the same event, BEFORE applying the cut. `closing` is
 *      then true when the shorter `ids` arrives, and path 2 stands down so
 *      the slide-out finishes before `drawerId` is dropped.
 *   2. **The render-time clear.** A row that left the list with no close in
 *      flight — the data itself changed, or the caller did not close first —
 *      is cleared during render, so nothing paints a drawer for a row that
 *      is no longer listed.
 *
 * `rowId` maps an id to its row's DOM id (default `eventRowId`), used to
 * scroll a stepped-to row into view and to return focus on close.
 * `focusTarget` picks what inside that row takes the returned focus — the row
 * element itself when omitted. Pass both as stable references.
 *
 * `initialId` arrives as a prop, never from `useSearchParams()`: the page
 * reads `?<param>=` on the server, and it is ignored unless it names a row.
 */
export function useRowSelection({
  ids,
  initialId,
  param,
  rowId = eventRowId,
  focusTarget,
}: {
  ids: readonly string[];
  initialId: string | null;
  param: string;
  rowId?: (id: string) => string;
  focusTarget?: (row: HTMLElement) => HTMLElement | null;
}): RowSelection {
  const [state, setState] = useState<RowSelectionState>(() =>
    initialRowSelection(ids, initialId),
  );

  // Path 2 above: the drawer's row is not listed and no slide-out is playing.
  // Adjusted during render rather than in an effect, so no frame paints a
  // drawer for a row that is gone. While `closing` is true the reducer returns
  // the state untouched — that is path 1, the caller's `close(null)` ahead of
  // its cut — and `finishClose` drops `drawerId` when the slide-out ends.
  const reconciled = rowSelectionReducer(state, { type: "cutHid", ids });
  if (reconciled !== state) setState(reconciled);

  const { selectedId, drawerId, closing, openedByKeyboard } = reconciled;

  const dispatch = useCallback((action: RowSelectionAction) => {
    setState((current) => rowSelectionReducer(current, action));
  }, []);

  // The URL follows the selection — including the render-time clear above,
  // which cannot touch `history` itself.
  useEffect(() => {
    syncUrl(param, selectedId);
  }, [param, selectedId]);

  const finishClose = useCallback(
    () => dispatch({ type: "finishClose" }),
    [dispatch],
  );

  // `onAnimationEnd` normally finishes a close; this covers reduced motion,
  // where no animation runs, and is harmless when both fire.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(finishClose, 240);
    return () => clearTimeout(timer);
  }, [closing, finishClose]);

  const select = useCallback(
    (id: string, viaKeyboard: boolean) =>
      dispatch({ type: "select", id, viaKeyboard }),
    [dispatch],
  );

  const returnFocus = useCallback(
    (id: string) => {
      const row = document.getElementById(rowId(id));
      if (!row) return;
      (focusTarget ? focusTarget(row) : row)?.focus();
    },
    [rowId, focusTarget],
  );

  const close = useCallback(
    (returnFocusTo: string | null = null) => {
      dispatch({ type: "close" });
      if (returnFocusTo) returnFocus(returnFocusTo);
    },
    [dispatch, returnFocus],
  );

  const toggle = useCallback(
    (id: string, viaKeyboard: boolean) => {
      dispatch({ type: "toggle", id, viaKeyboard });
      // The toggle closed the drawer: a keyboard press gets its focus back.
      if (selectedId === id && viaKeyboard) returnFocus(id);
    },
    [selectedId, dispatch, returnFocus],
  );

  const step = useCallback(
    (delta: -1 | 1) => {
      const action: RowSelectionAction = { type: "step", delta, ids };
      // Run once here only to learn where the step lands, for the scroll.
      const next = rowSelectionReducer(
        { selectedId, drawerId, closing, openedByKeyboard },
        action,
      );
      if (!next.selectedId || next.selectedId === selectedId) return;
      dispatch(action);
      document
        .getElementById(rowId(next.selectedId))
        ?.scrollIntoView({ block: "nearest" });
    },
    [ids, selectedId, drawerId, closing, openedByKeyboard, dispatch, rowId],
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
        // A toolbar or filter panel that keeps its own ↑/↓/Esc.
        if (target.closest('[data-row-keys="ignore"]')) return;
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

  return {
    selectedId,
    drawerId,
    closing,
    openedByKeyboard,
    ...rowSelectionPosition(reconciled, ids),
    toggle,
    select,
    close,
    step,
    finishClose,
  };
}

/**
 * Select `id` from the context list — every row, whatever the toolbar's
 * pill/result cut hides — lifting the cut first when it hides `id`, so
 * choosing an off-screen row doesn't land the selection on nothing. Shared by
 * `dual-detail.tsx` and `tournament-detail.tsx`, which both list-pick this
 * way; `resetCut` is the caller's own `setPill("all"); setResultCut(null)`.
 */
export function selectIgnoringCut(
  selection: Pick<RowSelection, "select">,
  id: string,
  visibleIds: readonly string[],
  resetCut: () => void,
): void {
  if (!visibleIds.includes(id)) resetCut();
  selection.select(id, false);
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
