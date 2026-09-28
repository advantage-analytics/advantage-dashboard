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
import {
  optionAvailability,
  serializeMatchFilters,
  type MatchFilters,
} from "./model";
import { useMatchFilters } from "./provider";
import {
  escClosesRail,
  filterRailReducer,
  type FilterRailPhase,
} from "./rail-state";

/**
 * The Video tab's filters drawer — `FiltersPanel` in a 340px panel that
 * OVERLAYS the point-list column: anchored to the report pane's right edge
 * (the frame's right edge), from just under the top header to the bottom,
 * above the page content. The video keeps its size and nothing reflows — the
 * film keeps playing beside every filter operation. White surface, hairline
 * left edge, `--shadow-dropdown`: the peek drawer's paint.
 *
 * ── Placement ───────────────────────────────────────────────────────────
 * `FilmRoom` (film/film-tab.tsx) renders `FilterRail` as a direct child of
 * its root, which has no positioned ancestor below `MatchReportPane`. The
 * pane is an `@container`, and container queries apply layout containment —
 * which makes the pane the containing block for absolutely positioned
 * descendants. So `absolute inset-y-0 right-0` is the pane's box: under the
 * header, to its bottom, flush right. The Video view never scrolls the pane
 * (`MatchReportWhen scrollsInside`), so the drawer never scrolls away.
 *
 * ── The shell ───────────────────────────────────────────────────────────
 * The roster's (`team/player-drawer.tsx`, `matches/match-drawer.tsx`
 * `PeekDrawerFrame`): the WIDTH animates (`roster-drawer-in` / `-out`, 200ms
 * `--ease-primary`) from the right edge, and the drawer leaves the DOM on the
 * out animation's end. A Framer inline width left an earlier rail invisible;
 * this is the CSS one on purpose.
 *
 * ── Selection model ─────────────────────────────────────────────────────
 * `rail-state.ts`: "Advanced filters…" toggles (re-picking it closes), Esc,
 * the X and "Show N points" close. Focus moves in on open and back to the
 * dropdown trigger (`registerTrigger`) on close. `FilmRoom` is what
 * `MatchReportWhen` unmounts on a view switch, and the provider lives with
 * it, so a switch always leaves the drawer shut; `useFilterRailHost` also
 * resets it when the list that owns the trigger unmounts.
 *
 * The panel is keyed on the serialized applied filters, because its draft is
 * seeded only on mount: an Apply, a quick pick, a strip clear or
 * Back/Forward re-seeds it.
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
   * Callback ref for the quick-filters trigger — focus goes back to it when the drawer
   * closes with focus inside. A callback, not a ref object, so no ref ever
   * travels through context into a render.
   */
  registerTrigger: (element: HTMLButtonElement | null) => void;
}

const FilterRailContext = createContext<FilterRailValue | null>(null);

/** The drawer's id — an `aria-controls` target, and how `close` finds it. */
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

  // State only: the drawer itself is `FilterRail`, which `FilmRoom` places
  // where its absolute box resolves to the report pane.
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
 * For the list that owns the drawer's trigger: shuts the drawer when it
 * unmounts, so nothing is left open beside a view that no longer has the
 * control that closes it.
 */
export function useFilterRailHost(): FilterRailValue {
  const rail = useFilterRail();
  const { reset } = rail;
  useEffect(() => reset, [reset]);
  return rail;
}

export interface FilterRailProps {
  /**
   * How many points the host's list would show under a draft — the footer's
   * live count and "Show N points". The Video list's rule is
   * `filmDraftCount` (film-list-filters.ts): the draft AND the statistic's
   * cut AND the saved toggle.
   */
  countFor: (draft: MatchFilters) => number;
}

/**
 * The drawer. Draws nothing while shut, so the page is exactly as it was
 * until "Advanced filters…" is picked.
 */
export function FilterRail(props: FilterRailProps) {
  const rail = use(FilterRailContext);
  if (!rail || rail.phase === "closed") return null;
  return <FilterRailShell rail={rail} {...props} />;
}

function FilterRailShell({
  rail,
  countFor,
}: FilterRailProps & { rail: FilterRailValue }) {
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

  // Take focus on open so Esc and Tab start inside the drawer. A frame
  // late: the quick menu that opened it hands focus back to its trigger as
  // it closes, in the same commit, and would otherwise take it straight back.
  useEffect(() => {
    if (phase !== "open") return;
    const frame = requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
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
      aria-label="Filters"
      // Shrinking to nothing, it must not stay in the tab order.
      inert={closing}
      onAnimationEnd={(event) => {
        if (event.animationName === "roster-drawer-out") finish();
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-30 overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none",
        closing
          ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
          : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
      )}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-[340px] flex-col outline-none"
      >
        <FiltersPanel
          key={serializeMatchFilters(filters)}
          className="min-h-0 flex-1"
          filters={filters}
          availability={availability}
          youName={sides.you.shortName}
          oppName={sides.opp.shortName}
          countFor={countFor}
          total={points.length}
          onApply={(next) => {
            setFilters(next);
            close();
          }}
          onClose={close}
        />
      </div>
    </aside>
  );
}
