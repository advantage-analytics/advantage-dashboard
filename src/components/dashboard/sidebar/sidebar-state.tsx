"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * The sidebar's two committed widths, and how it moves between them.
 *
 * There are exactly two: a 64px icon rail and a 232px panel. The rail is the
 * default. Reaching for navigation from the rail opens a PEEK — the panel
 * floats over the page rather than pushing it — which is the whole reason this
 * shape was chosen over a plain toggle: a match report, a KPI strip or a chart
 * never reflows while you reach past it. Pinning is the opt-in for wide
 * monitors, and pinned is layout rather than overlay.
 *
 * Peek state is deliberately NOT persisted. Only the pin is, per user per
 * device, and it gives way to the viewport below 1280px.
 */

const STORAGE_KEY = "sidebar:pinned";
const AUTO_COLLAPSE_BELOW = 1280;

/** Intent delay in, grace out. A diagonal mouse path across the rail on the way
 *  to the content must not open the peek, and leaving by a pixel must not shut
 *  it. Both numbers come from the spec. */
const PEEK_IN_MS = 120;
const PEEK_OUT_MS = 200;

export const RAIL_WIDTH = 64;
export const PANEL_WIDTH = 232;

interface SidebarState {
  /** Pinned open: the panel is layout, and content sits beside it. */
  pinned: boolean;
  /** Peeking: the panel floats over content. Never true while pinned. */
  peeking: boolean;
  /** Are labels visible right now, for either reason? */
  expanded: boolean;
  togglePinned: () => void;
  /** Pointer entered the rail, or a rail item took focus. */
  openPeek: () => void;
  closePeek: () => void;
  /** Cancels a pending open — used when the pointer leaves before the delay. */
  cancelPeek: () => void;
}

const Context = createContext<SidebarState | null>(null);

export function useSidebarState(): SidebarState {
  const state = useContext(Context);
  if (!state) {
    throw new Error("useSidebarState must be used within a SidebarStateProvider.");
  }
  return state;
}

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  // Starts collapsed on the server and on first paint, then reads the stored
  // preference. Rendering the rail first and widening is the cheap direction to
  // be wrong in — the reverse would push the page sideways after hydration.
  const [pinned, setPinned] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const timers = useRef<{ in?: ReturnType<typeof setTimeout>; out?: ReturnType<typeof setTimeout> }>({});
  // Read inside openPeek without making the callback depend on it.
  const pinnedRef = useRef(false);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Private mode or a full quota — the rail is a fine default.
    }
  }, []);

  // Auto-collapse below 1280px and STAY collapsed until pinned again. The
  // stored preference is not cleared: a coach who pins on a desktop and then
  // opens a laptop should find it pinned again when they return.
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BELOW - 1}px)`);
    const sync = () => setNarrow(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const effectivePinned = pinned && !narrow;

  // Synced in an effect, not written during render — a ref mutation in the
  // render body is what `react-hooks/refs` forbids, and under concurrent
  // rendering a discarded render would leave the ref describing a state that
  // never committed.
  useEffect(() => {
    pinnedRef.current = effectivePinned;
  }, [effectivePinned]);

  const togglePinned = useCallback(() => {
    setPinned((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preference is per-device convenience, never load-bearing.
      }
      return next;
    });
    setPeeking(false);
  }, []);

  const clearTimers = useCallback(() => {
    if (timers.current.in) clearTimeout(timers.current.in);
    if (timers.current.out) clearTimeout(timers.current.out);
    timers.current = {};
  }, []);

  const openPeek = useCallback(() => {
    // Pinned, the panel is already open and a peek is meaningless — without
    // this, every hover set a timer and flipped state that the render guards
    // then discarded.
    if (pinnedRef.current) return;
    if (timers.current.out) clearTimeout(timers.current.out);
    if (timers.current.in) return;
    timers.current.in = setTimeout(() => {
      timers.current.in = undefined;
      setPeeking(true);
    }, PEEK_IN_MS);
  }, []);

  const cancelPeek = useCallback(() => {
    if (timers.current.in) {
      clearTimeout(timers.current.in);
      timers.current.in = undefined;
    }
    if (timers.current.out) clearTimeout(timers.current.out);
    timers.current.out = setTimeout(() => {
      timers.current.out = undefined;
      setPeeking(false);
    }, PEEK_OUT_MS);
  }, []);

  const closePeek = useCallback(() => {
    clearTimers();
    setPeeking(false);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  // ⌘\ toggles the pin. Esc closes the peek.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        togglePinned();
        return;
      }
      // closePeek, not setPeeking(false): a pending 120ms open timer would
      // otherwise re-open the peek immediately after Escape dismissed it.
      if (event.key === "Escape") closePeek();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePinned, closePeek]);

  const value = useMemo<SidebarState>(
    () => ({
      pinned: effectivePinned,
      peeking: peeking && !effectivePinned,
      // `A || (B && !A)` is just `A || B`. The guard is real on `peeking`
      // above, which drives the float shadow; here it was noise.
      expanded: effectivePinned || peeking,
      togglePinned,
      openPeek,
      closePeek,
      cancelPeek,
    }),
    [effectivePinned, peeking, togglePinned, openPeek, closePeek, cancelPeek]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
