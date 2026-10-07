"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FloatMenuTone } from "@/components/ui/float-menu";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { FiltersPanel } from "../match-filters/filters-panel";
import type { CountNoun } from "../match-filters/panel-draft";
import {
  activeFilterCount,
  EMPTY_MATCH_FILTERS,
  type MatchFilters,
} from "../match-filters/model";
import {
  useFiltersPanelData,
  useMatchFilters,
} from "../match-filters/provider";
import {
  computeViz,
  foldedMatchFilters,
  type FoldedKey,
  subjectFor,
  withFoldedFilters,
  type Chart,
  type Cut,
  type PlayerFilter,
  type VizFilters,
  type VizResult,
} from "./viz-model";
import {
  activeFilterEntries,
  canonicalOptionValues,
  carryFilters,
  clearedFilters,
  courtFor,
  cutAvailability,
  OPTIONS,
} from "./viz-url";
import { useVizPoints } from "./use-viz-points";
import { useVizState } from "./use-viz-state";
import { VizMenuTrigger, VIZ_PILL_RADIUS } from "./viz-labels";

/** The `VizFilters` keys still drawn as live pills here — everything else
 *  lives in the advanced panel. */
type OptionFilterKey = "error" | "zone" | "court" | "ball";

const COUNT_NOUN: Record<VizResult["noun"], CountNoun> = {
  serves: { one: "serve", many: "serves" },
  returns: { one: "return", many: "returns" },
  shots: { one: "shot", many: "shots" },
  errors: { one: "error", many: "errors" },
};

/**
 * The Filters popover: whose court it is (Player); the cut's own Serve
 * (1st/2nd); the serve's measured Zone and Court (Court on every cut); on the errors cut which errors
 * (Error type) — all applied live on click — and "Advanced filters", which swaps the
 * popover's body for the Video tab's own `FiltersPanel` (Score / Serve /
 * Return / Result / Custom, the same catalog, wording and draft-then-Show
 * behaviour as the Video tab's drawer). The panel edits `VizFilters.match`;
 * its count is this court's (`computeViz` under the draft), so "Show 12
 * serves" is exactly what the court will draw.
 *
 * The other pill groups this popover used to draw (Result, Pressure, Rally,
 * Set, Game) are advanced options now. A default tile
 * or an older saved view can still carry them: the panel opens on them
 * folded in (`foldedMatchFilters`), and its Show writes them back as
 * advanced filters (`withFoldedFilters`). A group the advanced filters
 * cannot say exactly stays a pill group, applied and removable in the
 * strip, rather than being changed by a Show nobody meant to change it.
 * Picking the other Player leaves the advanced filters as picked: they name
 * players outright, as on the Video tab (`courtFor`).
 *
 * Built on the same Radix `Popover` primitive `ui/float-menu.tsx` wraps
 * (click-outside, Esc, focus-return all come from Radix). `count`/`total`/
 * `noun` come from the caller's already-computed `computeViz` result.
 *
 * `tone="dark"` draws the fullscreen viewer's popover (f4b-report P2h —
 * `rgba(13,13,13,.9)` blur 10, `rgba(255,255,255,.18)`→`.55` pill borders)
 * and the panel's `.dark` token scope. `side` picks which edge it opens
 * from.
 */
export function FiltersPopover({
  count,
  total,
  noun,
  youName,
  opponentName,
  tone = "light",
  side = "bottom",
  trigger,
  onOpenChange,
}: {
  count: number;
  total: number;
  noun: VizResult["noun"];
  youName: string;
  opponentName: string;
  tone?: FloatMenuTone;
  side?: "top" | "bottom";
  /**
   * Phase 2A: the fullscreen viewer has no toolbar — its filter-summary pill
   * IS this popover's trigger (f4b-report P2h: "The top-right summary pill is
   * the trigger"). A render prop, not a plain node, because the trigger has
   * to show its own open state (`chevron-up`, the darker background) and only
   * this component knows it. Omitted everywhere else, where the shipped
   * `VizMenuTrigger` "Filters" button is still the trigger, unchanged.
   */
  trigger?: (open: boolean) => React.ReactNode;
  /**
   * Phase 2B: a caller that needs to know whether this panel is open. The
   * viewer's bands receipt takes the summary pill's slot, and it must not do
   * that while the popover anchored to that pill is up — hiding the trigger
   * of an open Radix popover takes its anchor away and drops focus to
   * `<body>` mid-interaction. Open state still LIVES here; this only
   * mirrors it outward.
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const { state, setState } = useVizState();
  const [open, setOpenState] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    // Every open starts on the quick view.
    if (!next) setAdvanced(false);
    onOpenChange?.(next);
  };
  const headingId = useId();
  const dark = tone === "dark";
  const bodyRef = useRef<HTMLDivElement>(null);
  const advancedRowRef = useRef<HTMLButtonElement>(null);

  const cut = state.cut;
  const filters = state.filters;

  // Swapping the body unmounts the control that had focus: move it into
  // the panel on the way in, and back to the Advanced row on the way out.
  const returnFocusRef = useRef(false);
  useEffect(() => {
    if (advanced) {
      bodyRef.current
        ?.querySelector<HTMLElement>("button:not([disabled])")
        ?.focus({ preventScroll: true });
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      advancedRowRef.current?.focus({ preventScroll: true });
    }
  }, [advanced]);
  function backToQuick() {
    returnFocusRef.current = true;
    setAdvanced(false);
  }

  if (cut === null) {
    // Guarded by the caller (`viz-focused.tsx` only mounts this while a cut
    // is active) — this only fires on a render race, never in steady state.
    return null;
  }

  const applied = activeFilterEntries(state).length;
  // The advanced filters actually applied. Pill groups the panel would
  // fold in already count as their own strip tokens — never twice.
  const advancedCount = activeFilterCount(filters.match ?? EMPTY_MATCH_FILTERS);

  // Player stays single-select: choosing one always replaces the other,
  // it never toggles off to "neither subject" — a court always has to
  // belong to somebody.
  function selectPlayer(value: PlayerFilter) {
    setState((prev) => ({
      ...prev,
      filters: courtFor(prev, value),
      viewId: null,
    }));
  }

  // Zone, Court and Error type toggle membership, kept in canonical (OPTIONS) order so the
  // same set of picks always serialises identically.
  function toggle<K extends OptionFilterKey>(
    key: K,
    value: VizFilters[K][number],
  ) {
    setState((prev) => {
      const current = prev.filters[key] as readonly (typeof value)[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return {
        ...prev,
        filters: {
          ...prev.filters,
          [key]: canonicalOptionValues(key, next as readonly string[]),
        },
        viewId: null,
      };
    });
  }

  function clearAll() {
    setState((prev) => clearedFilters(prev));
  }

  function applyAdvanced(next: MatchFilters, folded: readonly FoldedKey[]) {
    setState((prev) => {
      const applied = withFoldedFilters(prev.filters, next, folded);
      // Through the same carry rule a URL parse applies (`parseVizState`),
      // so the state Show writes is the state a reload reads back.
      return {
        ...prev,
        filters: prev.cut ? carryFilters(applied, prev.cut) : applied,
        viewId: null,
      };
    });
    backToQuick();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ? (
          trigger(open)
        ) : (
          <VizMenuTrigger
            icon={SlidersHorizontal}
            label="Filters"
            open={open}
            haspopup="dialog"
            tone={tone}
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        // In the advanced panel Escape steps back to the quick view, as the
        // panel's own X does — never closing the popover over a draft.
        onEscapeKeyDown={(event) => {
          if (!advanced) return;
          event.preventDefault();
          backToQuick();
        }}
        align="end"
        side={side}
        sideOffset={6}
        role="dialog"
        aria-labelledby={headingId}
        className={cn(
          "w-[340px] max-w-[calc(100vw-32px)] rounded-[12px] p-0",
          dark
            ? "border border-white/10 bg-[rgba(13,13,13,0.9)] shadow-[var(--shadow-dropdown)] backdrop-blur-[10px]"
            : "border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)]",
        )}
      >
        <div ref={bodyRef}>
          {advanced ? (
            <div className="flex h-[min(560px,calc(var(--radix-popover-content-available-height)-8px))] flex-col">
              <span id={headingId} className="sr-only">
                Advanced filters
              </span>
              <AdvancedPanel
                filters={filters}
                cut={cut}
                chart={state.chart}
                dark={dark}
                total={total}
                noun={noun}
                onApply={applyAdvanced}
                onClose={backToQuick}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    id={headingId}
                    className="text-[13px] font-medium"
                    style={
                      dark
                        ? { color: "rgba(255,255,255,1)" }
                        : { color: "var(--ink-900)" }
                    }
                  >
                    Filters
                  </span>
                  {/* `text-micro` is a DS type class and sets its own colour
                      unlayered — it beats a Tailwind colour utility, so the
                      dark override has to be an inline style, not a class. */}
                  <span
                    className="text-micro tabular-nums"
                    style={
                      dark ? { color: "rgba(255,255,255,0.55)" } : undefined
                    }
                  >
                    {applied} applied · {count} of {total} {noun}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close filters"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-200",
                    dark
                      ? "text-white/70 hover:bg-white/10 hover:text-white"
                      : "text-[#888888] hover:bg-[var(--surface-subtle)] hover:text-[#0D0D0D]",
                  )}
                >
                  <X
                    className="size-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div className="flex flex-col gap-[14px] px-4 pb-3">
                <FilterGroup label="Player" dark={dark}>
                  <FilterPill
                    label={youName}
                    active={filters.player === "you"}
                    onClick={() => selectPlayer("you")}
                    dark={dark}
                  />
                  <FilterPill
                    label={opponentName}
                    active={filters.player === "opponent"}
                    onClick={() => selectPlayer("opponent")}
                    dark={dark}
                  />
                </FilterGroup>

                {/* Ball's 1st/2nd is the cut's own serve rule (a first-serve
                    RETURN on a return cut) — never Serve › Type, which counts
                    other points — so it stays a quick pill on every cut. */}
                <OptionsGroup
                  filterKey="ball"
                  label="Serve"
                  dark={dark}
                  active={filters.ball}
                  onToggle={(value) => toggle("ball", value)}
                />

                {/* Zone and Court read the serve's MEASURED landing on the
                    serve cut (the score's court elsewhere) — what the
                    advanced Zone and Court, off the tracker's label and the
                    score, cannot say — so they stay quick pills. */}
                {cut === "serve" && (
                  <OptionsGroup
                    filterKey="zone"
                    label="Zone"
                    dark={dark}
                    active={filters.zone}
                    onToggle={(value) => toggle("zone", value)}
                  />
                )}

                <OptionsGroup
                  filterKey="court"
                  label="Court"
                  dark={dark}
                  active={filters.court}
                  onToggle={(value) => toggle("court", value)}
                />

                {cut === "errors" && (
                  <OptionsGroup
                    filterKey="error"
                    label="Error type"
                    dark={dark}
                    active={filters.error}
                    onToggle={(value) => toggle("error", value)}
                  />
                )}

                <button
                  ref={advancedRowRef}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setAdvanced(true)}
                  className={cn(
                    "flex h-9 w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-element)] border px-3 text-[12px] font-medium transition-colors duration-200",
                    dark
                      ? "border-white/[0.18] text-white hover:bg-white/10"
                      : "border-[var(--border-hairline)] text-[var(--ink-900)] hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <SlidersHorizontal
                      className="size-[13px] shrink-0"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Advanced filters
                  </span>
                  <span
                    className="flex items-center gap-1 text-[11px] font-normal tabular-nums"
                    style={{
                      color: dark ? "rgba(255,255,255,0.55)" : "var(--ink-500)",
                    }}
                  >
                    {advancedCount === 0 ? "Any" : `${advancedCount} applied`}
                    <ChevronRight
                      className="size-3"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>

              <div
                className={cn(
                  "flex items-center justify-between gap-3 border-t px-4 py-2.5",
                  dark
                    ? "border-white/[0.12]"
                    : "border-[var(--border-hairline)]",
                )}
              >
                <span
                  className="text-micro"
                  style={dark ? { color: "rgba(255,255,255,0.55)" } : undefined}
                >
                  These apply as you pick.
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
                >
                  Clear all
                </button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Video tab's `FiltersPanel`, counting this court. Its own component so
 * the whole-match work it needs — option availability over every point and
 * shot, and a `computeViz` per draft — runs only while the panel is open,
 * never for a closed popover sitting in the toolbar.
 */
function AdvancedPanel({
  filters,
  cut,
  chart,
  dark,
  total,
  noun,
  onApply,
  onClose,
}: {
  filters: VizFilters;
  cut: Cut;
  chart: Chart;
  dark: boolean;
  total: number;
  noun: VizResult["noun"];
  /** The panel's Show, with the pill groups its draft folded in. */
  onApply: (next: MatchFilters, folded: readonly FoldedKey[]) => void;
  onClose: () => void;
}) {
  const points = useVizPoints(useMatchData());
  const { you } = useMatchSides();
  const { context } = useMatchFilters();
  // Short names, as the strip tokens and the Video tab's panel word them.
  const { availability, youName, oppName } = useFiltersPanelData();
  // Only what this cut keeps for this court — never an option Show would
  // then silently drop (`cutAvailability`).
  const offered = useMemo(
    () => cutAvailability(availability, filters, cut),
    [availability, filters, cut],
  );
  const subjectIsPlayer1 = subjectFor(filters, you.isPlayer1);
  // Fold only into options this panel draws (`foldedMatchFilters`), so no
  // applied value is ever hidden in the draft.
  const fold = useMemo(
    () =>
      foldedMatchFilters(filters, (key, value) =>
        (offered[key] as ReadonlySet<unknown>).has(value),
      ),
    [filters, offered],
  );
  const { folded } = fold;
  const countFor = useCallback(
    (draft: MatchFilters) =>
      computeViz(
        points,
        cut,
        carryFilters(withFoldedFilters(filters, draft, folded), cut),
        subjectIsPlayer1,
        chart,
        context,
      ).count,
    [points, cut, filters, folded, subjectIsPlayer1, chart, context],
  );
  return (
    <FiltersPanel
      // Re-seeds the draft whenever the applied filters change; the
      // availability above stays mounted, so it is not recomputed per Show.
      key={JSON.stringify(filters)}
      className="min-h-0 flex-1"
      tone={dark ? "dark" : "light"}
      filters={fold.match}
      availability={offered}
      youName={youName}
      oppName={oppName}
      countFor={countFor}
      total={total}
      noun={COUNT_NOUN[noun]}
      onApply={(next) => onApply(next, folded)}
      onClose={onClose}
    />
  );
}

/**
 * One `OPTIONS`-backed group — Serve, Zone, Court, Error type (Player stays
 * hand-written above: it's single-select, not an `OPTIONS` group).
 */
function OptionsGroup<K extends OptionFilterKey>({
  filterKey,
  label,
  dark,
  active,
  onToggle,
}: {
  filterKey: K;
  label: string;
  dark: boolean;
  active: VizFilters[K];
  /** Already closed over `filterKey` at the call site (`toggle(filterKey,
   *  value)`) — kept to one argument here so TS doesn't have to unify a
   *  second `K`-typed parameter position against a caller-supplied generic
   *  function. */
  onToggle: (value: VizFilters[K][number]) => void;
}) {
  const options = OPTIONS[filterKey] as Record<string, string>;
  // `K` is generic here, so a plain `VizFilters[K][number]` collapses to
  // `never` under `.includes`/the callback — TS can't distribute an indexed
  // access over a generic key this way (a known limitation, not a real type
  // hole: `entries`' runtime values are always `keyof OPTIONS[filterKey]`,
  // which is the same set as `VizFilters[filterKey][number]` for every
  // `OptionFilterKey` — that correspondence is `OPTIONS`' whole reason to
  // exist, also leaned on by `canonicalOptionValues` above). One local
  // `unknown` cast per generic call site restates that rather than asserting
  // past a real mismatch.
  const entries = Object.keys(options) as readonly unknown[];
  return (
    <FilterGroup label={label} dark={dark}>
      {entries.map((key) => (
        <FilterPill
          key={String(key)}
          label={options[key as string]}
          active={(active as readonly unknown[]).includes(key)}
          onClick={() => onToggle(key as VizFilters[K][number])}
          dark={dark}
        />
      ))}
    </FilterGroup>
  );
}

function FilterGroup({
  label,
  dark,
  children,
}: {
  label: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-1.5"
    >
      <span
        id={labelId}
        className="text-micro"
        style={dark ? { color: "rgba(255,255,255,0.5)" } : undefined}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  dark,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        `inline-flex h-[26px] shrink-0 cursor-pointer items-center ${VIZ_PILL_RADIUS} px-2.5 text-[11px] transition-colors duration-200`,
        active ? "font-medium" : "font-normal",
      )}
      style={
        dark
          ? {
              border: `1px solid rgba(255,255,255,${active ? "0.55" : "0.18"})`,
              backgroundColor: active
                ? "rgba(255,255,255,0.14)"
                : "transparent",
              color: active ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.8)",
            }
          : {
              border: `1px solid ${active ? "var(--border-medium)" : "var(--border-hairline)"}`,
              backgroundColor: active ? "var(--surface-subtle)" : "transparent",
              color: active ? "var(--ink-900)" : "var(--ink-700)",
            }
      }
    >
      {label}
    </button>
  );
}
