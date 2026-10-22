"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";

/**
 * A finger (or a pencil), not a mouse. Chart marks answer the two differently:
 * a mouse keeps its hover readouts exactly as they were, a finger selects a
 * mark on tap and the readout stays until it is dismissed.
 */
export function isFingerPointer(e: { pointerType: string }): boolean {
  return e.pointerType === "touch" || e.pointerType === "pen";
}

/**
 * The touch half of a hover readout, the way iOS Stocks and Health do it: a
 * tap (or a drag) on the chart selects a mark and its readout stays open; a
 * tap anywhere outside the chart closes it.
 *
 * Attach the returned ref to the chart's outermost box — every mark and the
 * readout itself must sit inside it, or tapping one would count as outside.
 * Only a finger's press dismisses: a mouse already closes the readout by
 * leaving the chart, and its hover semantics stay exactly as they were.
 */
export function useTouchReadout<E extends Element = HTMLDivElement>(
  open: boolean,
  dismiss: () => void,
): RefObject<E | null> {
  const ref = useRef<E>(null);
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!isFingerPointer(e)) return;
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      dismissRef.current();
    };
    // Capture, so a control that stops propagation still closes the readout.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return ref;
}

/**
 * A mark's tap, for a mark whose click already does something (opens its
 * points in Video). A mouse hovers before it clicks, so its click acts at
 * once; a finger cannot, so its first tap only selects the mark and opens the
 * readout, and a second tap on the mark already selected acts — or, with
 * nothing to act on, closes the readout again.
 *
 * Call `press` from `onPointerDown` (it says whether the pointer was a finger,
 * so the caller selects), `moved` when a drag leaves the mark it began on,
 * and `click` (or, on a link, `shouldFollow`) from `onClick`. A keyboard's or a mouse's click has no finger
 * press behind it and acts as it always did.
 */
export function useFingerTap() {
  const ref = useRef<{ reselect: boolean } | null>(null);
  return useMemo(
    () => ({
      press(e: { pointerType: string }, alreadySelected: boolean): boolean {
        if (!isFingerPointer(e)) {
          ref.current = null;
          return false;
        }
        ref.current = { reselect: alreadySelected };
        return true;
      },
      moved() {
        if (ref.current) ref.current.reselect = false;
      },
      click(action: (() => void) | undefined, dismiss: () => void) {
        const tap = ref.current;
        ref.current = null;
        if (tap && !tap.reselect) return;
        if (action) action();
        else if (tap) dismiss();
      },
      /**
       * For a mark that is a link: false on a finger's first tap, whose
       * navigation the caller cancels (`e.preventDefault()`).
       */
      shouldFollow(): boolean {
        const tap = ref.current;
        ref.current = null;
        return !tap || tap.reselect;
      },
    }),
    [],
  );
}
