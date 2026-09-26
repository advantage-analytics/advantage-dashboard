"use client";

import { useId, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FloatMenuTone } from "@/components/ui/float-menu";
import { filterKeysFor, type PlayerFilter, type VizFilters } from "./viz-model";
import {
  activeFilterEntries,
  canonicalOptionValues,
  canonicalSetValues,
  clearedFilters,
  OPTIONS,
} from "./viz-url";
import { useVizState } from "./use-viz-state";
import { VizMenuTrigger, VIZ_PILL_RADIUS } from "./viz-labels";

type MultiFilterKey = Exclude<keyof VizFilters, "player">;
/** The `MultiFilterKey`s that are also `OPTIONS` groups — everything except
 *  `set`, whose pills come from the match's own set numbers, not a fixed
 *  label map. */
type OptionFilterKey = Exclude<MultiFilterKey, "set">;

/**
 * The Filters popover (P1f): every non-default `VizFilters` key as a wrap of
 * pills, applied live on click. Built on the same Radix `Popover` primitive
 * `ui/float-menu.tsx` wraps (click-outside, Esc, focus-return all come from
 * Radix, not hand-rolled here) — but not `FloatMenu` itself, since this panel
 * is a 400px 2-column form, not a `role="menu"` list of rows.
 *
 * `count`/`total`/`noun` come from the caller's already-computed
 * `computeViz` result and `sets` from `availableSets(points)` — this
 * component has no data fetch of its own, just `useVizState` for the current
 * filters and `cut`.
 *
 * Phase 2A: `tone="dark"` draws the fullscreen viewer's popover (f4b-report
 * P2h — `rgba(13,13,13,.9)` blur 10, `rgba(255,255,255,.18)`→`.55` pill
 * borders). Defaults `"light"`; light output is unchanged. `side` picks
 * which edge it opens from — the viewer's summary pill is top-right, so its
 * popover opens `"bottom"` (the default) but callers that anchor from the
 * floor of the screen pass `"top"`.
 */
export function FiltersPopover({
  count,
  total,
  noun,
  sets,
  youName,
  opponentName,
  tone = "light",
  side = "bottom",
  trigger,
  onOpenChange,
}: {
  count: number;
  total: number;
  noun: string;
  sets: number[];
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
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const headingId = useId();
  const dark = tone === "dark";

  const cut = state.cut;
  if (cut === null) {
    // Guarded by the caller (`viz-focused.tsx` only mounts this while a cut
    // is active) — this only fires on a render race, never in steady state.
    return null;
  }

  const allowedKeys = new Set(filterKeysFor(cut));
  const showZone = allowedKeys.has("zone");
  const showSet = sets.length > 1;
  const applied = activeFilterEntries(state).length;

  // Player stays single-select: choosing one always replaces the other,
  // it never toggles off to "neither subject" — a court always has to
  // belong to somebody.
  function selectPlayer(value: PlayerFilter) {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, player: value },
      viewId: null,
    }));
  }

  // Every other group toggles membership: picking an already-selected pill
  // removes it, picking a new one adds it — the group stays in canonical
  // (OPTIONS) order so the same set of picks always serialises identically.
  function toggle<K extends MultiFilterKey>(
    key: K,
    value: VizFilters[K][number],
  ) {
    setState((prev) => {
      const current = prev.filters[key] as readonly (typeof value)[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const canonical =
        key === "set"
          ? canonicalSetValues(next as readonly number[])
          : canonicalOptionValues(
              key as Exclude<MultiFilterKey, "set">,
              next as readonly string[],
            );
      return {
        ...prev,
        filters: { ...prev.filters, [key]: canonical },
        viewId: null,
      };
    });
  }

  function clearAll() {
    setState((prev) => clearedFilters(prev));
  }

  const resultKeys = (
    Object.keys(OPTIONS.result) as (keyof typeof OPTIONS.result)[]
  ).filter((key) => key !== "ace" || cut === "serve");

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
        align="end"
        side={side}
        sideOffset={6}
        role="dialog"
        aria-labelledby={headingId}
        className={cn(
          "w-[400px] rounded-[12px] p-0",
          dark
            ? "border border-white/10 bg-[rgba(13,13,13,0.9)] shadow-[var(--shadow-dropdown)] backdrop-blur-[10px]"
            : "border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)]",
        )}
      >
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
                unlayered — it beats a Tailwind colour utility, so the dark
                override has to be an inline style, not a class. */}
            <span
              className="text-micro tabular-nums"
              style={dark ? { color: "rgba(255,255,255,0.55)" } : undefined}
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
            <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div
          className="grid px-4 pb-3"
          style={{ gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}
        >
          <FilterGroup label="Player" dark={dark}>
            <FilterPill
              label={youName}
              active={state.filters.player === "you"}
              onClick={() => selectPlayer("you")}
              dark={dark}
            />
            <FilterPill
              label={opponentName}
              active={state.filters.player === "opponent"}
              onClick={() => selectPlayer("opponent")}
              dark={dark}
            />
          </FilterGroup>

          <OptionsGroup
            filterKey="ball"
            label="Ball"
            dark={dark}
            active={state.filters.ball}
            onToggle={(value) => toggle("ball", value)}
          />

          <OptionsGroup
            filterKey="court"
            label="Court"
            dark={dark}
            active={state.filters.court}
            onToggle={(value) => toggle("court", value)}
          />

          {showZone && (
            <OptionsGroup
              filterKey="zone"
              label="Zone"
              dark={dark}
              active={state.filters.zone}
              onToggle={(value) => toggle("zone", value)}
            />
          )}

          <OptionsGroup
            filterKey="result"
            label="Result"
            dark={dark}
            active={state.filters.result}
            keys={resultKeys}
            onToggle={(value) => toggle("result", value)}
          />

          <OptionsGroup
            filterKey="pressure"
            label="Pressure"
            dark={dark}
            active={state.filters.pressure}
            onToggle={(value) => toggle("pressure", value)}
          />

          <OptionsGroup
            filterKey="rally"
            label="Rally"
            dark={dark}
            active={state.filters.rally}
            onToggle={(value) => toggle("rally", value)}
          />

          {showSet && (
            <FilterGroup label="Set" dark={dark}>
              {sets.map((setNumber) => (
                <FilterPill
                  key={setNumber}
                  label={`Set ${setNumber}`}
                  active={state.filters.set.includes(setNumber)}
                  onClick={() => toggle("set", setNumber)}
                  dark={dark}
                />
              ))}
            </FilterGroup>
          )}

          <OptionsGroup
            filterKey="game"
            label="Game"
            dark={dark}
            active={state.filters.game}
            onToggle={(value) => toggle("game", value)}
          />
        </div>

        <div
          className={cn(
            "flex items-center justify-between gap-3 border-t px-4 py-2.5",
            dark ? "border-white/[0.12]" : "border-[var(--border-hairline)]",
          )}
        >
          <span
            className="text-micro"
            style={dark ? { color: "rgba(255,255,255,0.55)" } : undefined}
          >
            Changes apply as you pick.
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            Clear all
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One `OPTIONS`-backed group — Ball, Court, Zone, Result, Pressure, Rally,
 * Game were seven copies of the same `Object.keys(OPTIONS.x).map(...)` block
 * (Player stays hand-written above: it's single-select, not an `OPTIONS`
 * group; Set stays hand-written too: its pills come from the match's own set
 * numbers via `sets`, not a fixed label map). `keys` overrides the default
 * "every key in this OPTIONS group" order — `resultKeys` uses it to drop
 * "ace" off serve.
 */
function OptionsGroup<K extends OptionFilterKey>({
  filterKey,
  label,
  dark,
  active,
  keys,
  onToggle,
}: {
  filterKey: K;
  label: string;
  dark: boolean;
  active: VizFilters[K];
  keys?: readonly (keyof (typeof OPTIONS)[K])[];
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
  const entries = (keys ?? Object.keys(options)) as readonly unknown[];
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
