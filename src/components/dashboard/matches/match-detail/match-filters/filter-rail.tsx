"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import { FiltersPanel } from "./filters-panel";
import { optionAvailability, serializeMatchFilters } from "./model";
import { useMatchFilters } from "./provider";
import {
  escClosesRail,
  filterRailReducer,
  type FilterRailPhase,
} from "./rail-state";

/**
 * The match report's filters rail — `FiltersPanel` in a 340px rail at the
 * report's right edge.
 *
 * ── Not mounted, for now ────────────────────────────────────────────────
 * It was built for a Filter button on the Statistics view, which the product
 * owner then removed: filters live on the Video tab alone, and Statistics is
 * always the whole match. Nothing mounts `FilterRailProvider`/`FilterRail`
 * until the rail is re-hosted for the Video tab (as an overlay there, so the
 * notes below on the frame's third column describe the original placement).
 *
 * ── Placement ───────────────────────────────────────────────────────────
 * `MatchReportFrame` mounts the provider and the rail, so the rail is the
 * frame's third column — score rail │ pane │ filters — and the pane reflows to
 * the width left, the way the Roster, Schedule and Matches tables reflow
 * beside their drawers. Inside the pane it would sit in the pane's own
 * padding and scroll away with the cards; over the pane it would cover the
 * cards whose cut it edits. The widgets row answers to the pane's width
 * (`@container`), so with the rail open it stacks as it would in any
 * narrower window.
 *
 * ── The shell ───────────────────────────────────────────────────────────
 * The roster's (`team/player-drawer.tsx`, `matches/match-drawer.tsx`
 * `PeekDrawerFrame`): the WIDTH animates (`roster-drawer-in` / `-out`, 200ms
 * `--ease-primary`) so the pane reflows rather than being covered, and the
 * rail leaves the DOM on the out animation's end. A Framer inline width left
 * an earlier rail invisible; this is the CSS one on purpose.
 *
 * ── Selection model ─────────────────────────────────────────────────────
 * `rail-state.ts`: the Filter button toggles (re-click closes), Esc closes,
 * Cancel and Apply close. A switch to another view resets it shut —
 * `useFilterRailHost` in the view that owns the button.
 *
 * The panel is keyed on the serialized applied filters, because its draft is
 * seeded only on mount: an Apply, a chip removed, or Back/Forward re-seeds it.
 */

interface FilterRailValue {
  phase: FilterRailPhase;
  open: boolean;
  toggle: () => void;
  close: () => void;
  reset: () => void;
  /** The out animation ended — the rail leaves the DOM. */
  finish: () => void;
  /**
   * Callback ref for the Filter button — focus goes back to it when the rail
   * closes with focus inside. A callback, not a ref object, so no ref ever
   * travels through context into a render.
   */
  registerTrigger: (element: HTMLButtonElement | null) => void;
}

const FilterRailContext = createContext<FilterRailValue | null>(null);

/** The id the Filter button's `aria-controls` names. */
export const FILTER_RAIL_ID = "match-filters-rail";

export function FilterRailProvider({ children }: { children: ReactNode }) {
  const [phase, dispatch] = useReducer(filterRailReducer, "closed");
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const toggle = useCallback(() => dispatch("toggle"), []);
  const reset = useCallback(() => dispatch("reset"), []);
  const finish = useCallback(() => dispatch("closed"), []);
  const registerTrigger = useCallback((element: HTMLButtonElement | null) => {
    triggerRef.current = element;
  }, []);
  // Focus that was inside the rail goes back to the button that opened it,
  // rather than to <body> when the rail's subtree leaves the DOM.
  const close = useCallback(() => {
    const rail = document.getElementById(FILTER_RAIL_ID);
    if (rail?.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    dispatch("close");
  }, []);

  const value = useMemo<FilterRailValue>(
    () => ({
      phase,
      open: phase === "open",
      toggle,
      close,
      reset,
      finish,
      registerTrigger,
    }),
    [phase, toggle, close, reset, finish, registerTrigger],
  );

  // State only: the rail itself is `FilterRail`, which the frame places in
  // its flex row — a child rendered here would not reflow the pane.
  return <FilterRailContext value={value}>{children}</FilterRailContext>;
}

const noop = () => {};
const INERT: FilterRailValue = {
  phase: "closed",
  open: false,
  toggle: noop,
  close: noop,
  reset: noop,
  finish: noop,
  registerTrigger: noop,
};

/** The rail's state. Without a provider (a harness, an offline spec): shut, and nothing opens it. */
export function useFilterRail(): FilterRailValue {
  return use(FilterRailContext) ?? INERT;
}

/**
 * For the view that owns the Filter button: shuts the rail when that view
 * unmounts (`MatchReportWhen` unmounts an inactive view), so a switch to
 * Visualizations does not leave the Statistics filters open beside it.
 */
export function useFilterRailHost(): FilterRailValue {
  const rail = useFilterRail();
  const { reset } = rail;
  useEffect(() => reset, [reset]);
  return rail;
}

/**
 * The rail. Draws nothing while shut, so the frame is exactly its old two
 * columns until the Filter button is pressed — and so the skeleton frame
 * (`match-report-pending.tsx`), which has no match data, never reaches the
 * data hooks below.
 */
export function FilterRail() {
  const rail = use(FilterRailContext);
  if (!rail || rail.phase === "closed") return null;
  return <FilterRailShell rail={rail} />;
}

function FilterRailShell({ rail }: { rail: FilterRailValue }) {
  const { phase, close, finish } = rail;
  const closing = phase === "closing";
  const panelRef = useRef<HTMLDivElement>(null);

  const { points } = useMatchData();
  const sides = useMatchSides();
  const { filters, setFilters, context } = useMatchFilters();
  // Over the WHOLE match, never the filtered subset: options must not vanish
  // as you pick (`optionAvailability`'s contract).
  const availability = useMemo(
    () => optionAvailability(points, context),
    [points, context],
  );

  // Take focus on open so Esc and Tab start inside the rail.
  useEffect(() => {
    if (phase === "open") panelRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // `motion-reduce:animate-none` means no `animationend` ever fires, so a
  // closing rail would sit at width 0 forever — finish it at once instead.
  useEffect(() => {
    if (
      closing &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      finish();
  }, [closing, finish]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (escClosesRail(phase, event)) close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, close]);

  return (
    <aside
      id={FILTER_RAIL_ID}
      aria-label="Match filters"
      // Shrinking to nothing, it must not stay in the tab order.
      inert={closing}
      onAnimationEnd={(event) => {
        if (event.animationName === "roster-drawer-out") finish();
      }}
      className={cn(
        "min-h-0 shrink-0 self-stretch overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none",
        closing
          ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
          : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
      )}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-[340px] flex-col px-4 pt-4 pb-4 outline-none"
      >
        <FiltersPanel
          key={serializeMatchFilters(filters)}
          className="min-h-0 flex-1"
          filters={filters}
          availability={availability}
          youName={sides.you.shortName}
          oppName={sides.opp.shortName}
          onApply={(next) => {
            setFilters(next);
            close();
          }}
          onCancel={close}
        />
      </div>
    </aside>
  );
}
