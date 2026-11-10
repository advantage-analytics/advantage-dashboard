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

import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { FiltersPanel } from "./filters-panel";
import { serializeMatchFilters, type MatchFilters } from "./model";
import { useFiltersPanelData, useMatchFilters } from "./provider";
import {
  FILTER_SHEET_CLASS,
  FILTER_SHEET_SCRIM_CLASS,
  filterSheetWidthClass,
  inertPageBehind,
  wrapTabInSheet,
} from "./filter-sheet";
import {
  escClosesRail,
  filterRailReducer,
  type FilterRailPhase,
} from "./rail-state";

/**
 * The Video tab's filters drawer — `FiltersPanel` in the advanced-filters
 * sheet (`filter-sheet.ts`): 340px on the window's right edge, its whole
 * height, over the icon rail, the header and the report alike, all of which
 * dim under the wash and close it on click. The panel holds a draft, so it is
 * modal; nothing behind it is reachable while it is up. The video keeps its
 * size and nothing reflows — the film keeps playing under the dim.
 *
 * ── Placement ───────────────────────────────────────────────────────────
 * `FilmRoom` (film/film-tab.tsx) renders `FilterRail`, which portals the
 * sheet into <body>. It must not stay inside `#match-report-pane`: that pane
 * is the page's scroll container and its `@container` contains `fixed`
 * descendants, so a sheet there would be laid out in the scrolled content
 * (on a short viewport, 1366×600, the Video view does overflow it) and
 * would stop at the pane rather than covering the chrome.
 *
 * ── The shell ───────────────────────────────────────────────────────────
 * `filter-sheet.ts`, shared with the Visualizations lightbox: the WIDTH
 * animates (`roster-drawer-in` / `-out`) and the sheet leaves the DOM on the
 * out animation's end. A Framer inline width left an earlier rail
 * invisible; this is the CSS one on purpose. Tab wraps inside it.
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
  // rather than to <body> when the rail's subtree leaves the DOM. After the
  // commit, not here: while the sheet is open the page behind it — the
  // trigger included — is `inert` and cannot take focus; the shell lifts
  // that in its effect cleanup, which runs before this effect.
  const focusBackRef = useRef(false);
  const close = useCallback(() => {
    const rail = document.getElementById(FILTER_RAIL_ID);
    focusBackRef.current = rail?.contains(document.activeElement) ?? false;
    dispatch("close");
  }, []);
  useEffect(() => {
    if (phase === "open" || !focusBackRef.current) return;
    focusBackRef.current = false;
    triggerRef.current?.focus({ preventScroll: true });
  }, [phase]);

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

  // State only: the drawer itself is `FilterRail`, which `FilmRoom` renders
  // and which portals to <body>.
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
  const shell = <FilterRailShell rail={rail} {...props} />;
  // Portalled to <body> so `fixed` is the window: inside
  // `#match-report-pane` its `@container` would be the sheet's box. Only
  // ever open after a click, so this never runs on the server. Context
  // still flows through a portal.
  return typeof document === "undefined"
    ? shell
    : createPortal(shell, document.body);
}

function FilterRailShell({
  rail,
  countFor,
}: FilterRailProps & { rail: FilterRailValue }) {
  const { phase, close, finish } = rail;
  const closing = phase === "closing";
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Modal to assistive tech too: the page behind goes `inert` while the
  // sheet is open and comes back the moment it starts closing, before the
  // provider hands focus back to the trigger behind it.
  useEffect(() => {
    if (phase !== "open") return;
    const keep = [scrimRef.current, asideRef.current].filter(
      (el): el is HTMLElement => el !== null,
    );
    return inertPageBehind(keep);
  }, [phase]);

  const { filters, setFilters, filmRemainder } = useMatchFilters();
  const { availability, youName, oppName, total } = useFiltersPanelData();

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
    <>
      {/* The dim: the whole window — icon rail, header and report — under
          the sheet. The film keeps playing beneath it (a dim, not a pause)
          and a click on it closes the drawer like the X. It fades with the
          drawer's 200ms; closing, it lets clicks through at once, so the
          page is usable before the fade ends. */}
      <div
        ref={scrimRef}
        aria-hidden
        data-testid="filter-rail-scrim"
        // Keep focus in the drawer through the press, so `close` sees it
        // there and hands it back to the trigger rather than to <body>.
        onMouseDown={(event) => event.preventDefault()}
        onClick={close}
        className={cn(
          FILTER_SHEET_SCRIM_CLASS,
          closing && "pointer-events-none opacity-0",
        )}
      />
      <aside
        ref={asideRef}
        id={FILTER_RAIL_ID}
        aria-label="Filters"
        aria-modal="true"
        role="dialog"
        // Shrinking to nothing, it must not stay in the tab order.
        inert={closing}
        onKeyDown={(event) => wrapTabInSheet(event, panelRef.current)}
        onAnimationEnd={(event) => {
          if (event.animationName === "roster-drawer-out") finish();
        }}
        className={cn(FILTER_SHEET_CLASS, filterSheetWidthClass(closing))}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="flex h-full w-[340px] max-w-[100vw] flex-col outline-none"
        >
          <FiltersPanel
            key={serializeMatchFilters(filters)}
            className="min-h-0 flex-1"
            filters={filters}
            availability={availability}
            youName={youName}
            oppName={oppName}
            countFor={countFor}
            total={total}
            filmCut={filmRemainder?.label ?? null}
            onApply={(next) => {
              setFilters(next);
              close();
            }}
            onClose={close}
          />
        </div>
      </aside>
    </>
  );
}
