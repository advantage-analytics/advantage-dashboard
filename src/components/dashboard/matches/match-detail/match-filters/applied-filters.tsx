"use client";

import { SlidersHorizontal, X } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import { appliedChips, removeChip } from "./applied-chips";
import { FILTER_RAIL_ID, useFilterRailHost } from "./filter-rail";
import { activeFilterCount } from "./model";
import { useMatchFilters } from "./provider";

/**
 * The Statistics view's filter bar, directly above the cards it scopes: the
 * applied cut on the left — "N of M points", one chip per applied value, a
 * quiet Clear all — and ONE Filter button on the right, whose badge counts
 * the applied values (`activeFilterCount`) and is absent at zero. The button
 * toggles the filters rail (`filter-rail.tsx`); nothing here edits a draft.
 *
 * `canFilter={false}` (the public `/m/[token]` page) draws no button, and its
 * chips are plain labels with no remove: the cut an incoming `?f=` carries is
 * shown, not edited. Clear all stays — it only drops the cut from the address
 * bar and this tab, never writes to the match, and without it a visitor sent
 * a link whose cut is empty would have no way back to the whole match.
 *
 * With nothing applied and no button to draw, the bar draws nothing at all.
 *
 * No `next/navigation` here — the offline spec loads this file through
 * `createLoader()`.
 */
export function MatchFiltersBar({ canFilter }: { canFilter: boolean }) {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const { filters, setFilters, clearFilters, filteredPoints, filtersActive } =
    useMatchFilters();
  const {
    open: railOpen,
    toggle: toggleRail,
    registerTrigger,
  } = useFilterRailHost();

  if (!canFilter && !filtersActive) return null;

  const count = activeFilterCount(filters);
  const engaged = railOpen || count > 0;
  const chips = filtersActive
    ? appliedChips(filters, {
        you: sides.you.shortName,
        opponent: sides.opp.shortName,
      })
    : [];

  return (
    <div className="flex shrink-0 items-start gap-3">
      {filtersActive ? (
        <div
          role="group"
          aria-label="Applied filters"
          className="flex min-h-7 min-w-0 flex-1 flex-wrap items-center gap-1.5"
        >
          <span
            aria-live="polite"
            className="text-micro mr-1 whitespace-nowrap tabular-nums"
            // `text-micro` sets its own colour unlayered; inline wins.
            style={{ color: "var(--ink-600)" }}
          >
            {filteredPoints.length} of {points.length} points
          </span>
          {chips.map((chip) =>
            canFilter ? (
              <button
                key={chip.id}
                type="button"
                aria-label={`Remove filter: ${chip.label}`}
                onClick={() => setFilters(removeChip(filters, chip))}
                className={cn(
                  CHIP,
                  "cursor-pointer pr-1.5 hover:bg-[var(--surface-subtle)]",
                )}
              >
                {chip.label}
                <X
                  className="size-3 shrink-0 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span key={chip.id} className={cn(CHIP, "pr-2.5")}>
                {chip.label}
              </span>
            ),
          )}
          {/* The zero-match empty state below carries the one Clear all
              while it shows; two of them one glance apart is one too many. */}
          {filteredPoints.length > 0 && (
            <ClearAllAction onClick={clearFilters} className="ml-1" />
          )}
        </div>
      ) : null}

      {canFilter && (
        <button
          ref={registerTrigger}
          type="button"
          aria-expanded={railOpen}
          aria-controls={railOpen ? FILTER_RAIL_ID : undefined}
          aria-label={count > 0 ? `Filters, ${count} applied` : "Filters"}
          onClick={toggleRail}
          className={cn(
            "ml-auto flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-[12px] transition-colors duration-[var(--duration-hover)]",
            !engaged && "hover:bg-[var(--surface-subtle)]",
          )}
          // The toolbar trigger's engaged grammar (`list-toolbar-trigger.tsx`):
          // a surface-subtle wash and ink-900, no border.
          style={{
            background: engaged ? "var(--surface-subtle)" : undefined,
            color: engaged ? "var(--ink-900)" : "var(--ink-600)",
            fontWeight: engaged ? 500 : 400,
          }}
        >
          <SlidersHorizontal
            className="size-3.5"
            strokeWidth={1.5}
            style={{ color: engaged ? "var(--ink-700)" : "var(--ink-500)" }}
            aria-hidden="true"
          />
          Filters
          {count > 0 && (
            <span
              data-filter-count=""
              aria-hidden="true"
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium tabular-nums"
              style={{
                background: "var(--ink-900)",
                color: "var(--surface-card)",
              }}
            >
              {count}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

const CHIP =
  "inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full border border-[var(--border-field)] pl-2.5 text-[12px] whitespace-nowrap text-[var(--ink-700)] transition-colors duration-[var(--duration-hover)]";

/** The settled "Clear all": a blue text action, no glyph. */
function ClearAllAction({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]",
        className,
      )}
    >
      Clear all
    </button>
  );
}

/**
 * The cards' place when the applied filters keep no point at all. Every card
 * in the widgets row is point-derived, so four cards each drawing nothing
 * would say the same absence four times (and a performance tracker with no
 * points reads as a flat match); the view says it once, in the report's
 * text-only empty shape (`report-pane-empty.tsx`), with the one way out.
 * The filter bar above stays, so a single chip can be removed instead.
 */
export function FilteredPointsEmpty({ canFilter }: { canFilter: boolean }) {
  const { clearFilters } = useMatchFilters();
  return (
    <div
      role="status"
      data-testid="filtered-points-empty"
      className="flex shrink-0 flex-col items-start gap-3 py-8"
    >
      <div className="flex max-w-[56ch] flex-col gap-2">
        <h2 className="text-title" style={{ fontSize: "16px" }}>
          No points match these filters
        </h2>
        <p
          className="text-body-sm [text-wrap:pretty]"
          style={{ color: "var(--ink-600)" }}
        >
          {canFilter
            ? "No point in this match passes every filter at once. Remove one above, or clear them all to see the whole match."
            : "No point in this match passes every filter at once. Clear them to see the whole match."}
        </p>
      </div>
      <ClearAllAction onClick={clearFilters} />
    </div>
  );
}
