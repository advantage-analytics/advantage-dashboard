"use client";

import { useId, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EMPTY_VIZ_FILTERS, filterKeysFor, type VizFilters } from "./viz-model";
import { activeFilterEntries, clearedFilters, OPTIONS } from "./viz-url";
import { useVizState } from "./use-viz-state";
import { VizMenuTrigger } from "./viz-labels";

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
 */
export function FiltersPopover({
  count,
  total,
  noun,
  sets,
  youName,
  opponentName,
}: {
  count: number;
  total: number;
  noun: string;
  sets: number[];
  youName: string;
  opponentName: string;
}) {
  const { state, setState } = useVizState();
  const [open, setOpen] = useState(false);
  const headingId = useId();

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

  function select<K extends keyof VizFilters>(key: K, value: VizFilters[K]) {
    setState((prev) => {
      const isActive = prev.filters[key] === value;
      return {
        ...prev,
        filters: {
          ...prev.filters,
          [key]: isActive ? EMPTY_VIZ_FILTERS[key] : value,
        },
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
        <VizMenuTrigger
          icon={SlidersHorizontal}
          label="Filters"
          open={open}
          haspopup="dialog"
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        role="dialog"
        aria-label="Filters"
        className="w-[400px] rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-0 shadow-[var(--shadow-dropdown)]"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              id={headingId}
              className="text-[13px] font-medium"
              style={{ color: "var(--ink-900)" }}
            >
              Filters
            </span>
            <span className="text-micro tabular-nums">
              {applied} applied · {count} of {total} {noun}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#0D0D0D]"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div
          className="grid px-4 pb-3"
          style={{ gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}
        >
          <FilterGroup label="Player">
            <FilterPill
              label={youName}
              active={state.filters.player === "you"}
              onClick={() => select("player", "you")}
            />
            <FilterPill
              label={opponentName}
              active={state.filters.player === "opponent"}
              onClick={() => select("player", "opponent")}
            />
          </FilterGroup>

          <FilterGroup label="Ball">
            {(Object.keys(OPTIONS.ball) as (keyof typeof OPTIONS.ball)[]).map(
              (key) => (
                <FilterPill
                  key={key}
                  label={OPTIONS.ball[key]}
                  active={state.filters.ball === key}
                  onClick={() => select("ball", key)}
                />
              ),
            )}
          </FilterGroup>

          <FilterGroup label="Court">
            {(Object.keys(OPTIONS.court) as (keyof typeof OPTIONS.court)[]).map(
              (key) => (
                <FilterPill
                  key={key}
                  label={OPTIONS.court[key]}
                  active={state.filters.court === key}
                  onClick={() => select("court", key)}
                />
              ),
            )}
          </FilterGroup>

          {showZone && (
            <FilterGroup label="Zone">
              {(Object.keys(OPTIONS.zone) as (keyof typeof OPTIONS.zone)[]).map(
                (key) => (
                  <FilterPill
                    key={key}
                    label={OPTIONS.zone[key]}
                    active={state.filters.zone === key}
                    onClick={() => select("zone", key)}
                  />
                ),
              )}
            </FilterGroup>
          )}

          <FilterGroup label="Result">
            {resultKeys.map((key) => (
              <FilterPill
                key={key}
                label={OPTIONS.result[key]}
                active={state.filters.result === key}
                onClick={() => select("result", key)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Pressure">
            {(
              Object.keys(OPTIONS.pressure) as (keyof typeof OPTIONS.pressure)[]
            ).map((key) => (
              <FilterPill
                key={key}
                label={OPTIONS.pressure[key]}
                active={state.filters.pressure === key}
                onClick={() => select("pressure", key)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Rally">
            {(Object.keys(OPTIONS.rally) as (keyof typeof OPTIONS.rally)[]).map(
              (key) => (
                <FilterPill
                  key={key}
                  label={OPTIONS.rally[key]}
                  active={state.filters.rally === key}
                  onClick={() => select("rally", key)}
                />
              ),
            )}
          </FilterGroup>

          {showSet && (
            <FilterGroup label="Set">
              {sets.map((setNumber) => (
                <FilterPill
                  key={setNumber}
                  label={`Set ${setNumber}`}
                  active={state.filters.set === setNumber}
                  onClick={() => select("set", setNumber)}
                />
              ))}
            </FilterGroup>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] px-4 py-2.5">
          <span className="text-micro">Changes apply as you pick.</span>
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-1.5"
    >
      <span id={labelId} className="text-micro">
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] shrink-0 cursor-pointer items-center rounded-[6px] px-2.5 text-[11px] transition-colors duration-200",
        active ? "font-medium" : "font-normal",
      )}
      style={{
        border: `1px solid ${active ? "var(--border-medium)" : "var(--border-hairline)"}`,
        backgroundColor: active ? "var(--surface-subtle)" : "transparent",
        color: active ? "var(--ink-900)" : "var(--ink-700)",
      }}
    >
      {label}
    </button>
  );
}
