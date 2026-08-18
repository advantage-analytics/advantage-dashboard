"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The sidebar's two committed widths, and how it moves between them.
 *
 * There are exactly two: a 64px icon rail and a 232px panel. The toggle is the
 * only thing that moves between them — one persistent state, no hover
 * surprises. Content reflows with the panel, and that is the trade the button
 * makes versus a hover peek: it only happens on a deliberate click, so a chart
 * never resizes under the cursor while you are reading it.
 *
 * The state persists per user per device, and the viewport can override it
 * downward: below 1280px the panel auto-collapses and stays collapsed until
 * toggled. Toggling still works at any width — the viewport collapses the
 * panel, it does not disable the control.
 */

// Unchanged from when this state was called "pinned", so nobody's stored
// preference resets on deploy.
const STORAGE_KEY = "sidebar:pinned";
const AUTO_COLLAPSE_BELOW = 1280;

export const RAIL_WIDTH = 64;
export const PANEL_WIDTH = 232;

interface SidebarState {
  /** Are labels visible — is the panel at its 232px width? */
  expanded: boolean;
  toggle: () => void;
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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setExpanded(true);
    } catch {
      // Private mode or a full quota — the rail is a fine default.
    }
  }, []);

  // Below 1280px, collapse and stay collapsed. Declared after the effect above
  // so a narrow viewport wins on mount, and it deliberately does NOT write the
  // stored preference: a coach who expands on a desktop and then opens a laptop
  // should find it expanded again when they return to the desktop.
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BELOW - 1}px)`);
    const collapseIfNarrow = (narrow: boolean) => {
      if (narrow) setExpanded(false);
    };
    collapseIfNarrow(mql.matches);
    const onChange = (event: MediaQueryListEvent) => collapseIfNarrow(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preference is per-device convenience, never load-bearing.
      }
      return next;
    });
  }, []);

  // ⌘\ — the shortcut printed on the toggle row itself.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo<SidebarState>(() => ({ expanded, toggle }), [expanded, toggle]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
