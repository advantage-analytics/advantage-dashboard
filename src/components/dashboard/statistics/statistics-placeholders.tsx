"use client";

import { EmptyMark } from "@/components/ui/empty-mark";
import { RegionCard } from "./statistics-layout";
import { useStatistics } from "./statistics-provider";

/**
 * The Statistics page's regions before their own components exist.
 *
 * Each is the region's real card — its eyebrow, its row and column labels,
 * its tracks — holding `—` where a value goes (empty-and-loading.md → Honest
 * zero state: the labels are the payload). None of them computes a figure,
 * so none can show a wrong one; the season strip above them is the only part
 * of the page reading numbers until each region's task replaces its
 * placeholder in `statistics-body.tsx`.
 *
 * They draw the same anatomy whether the set is full, filtered to nothing or
 * day zero. What differs between those states is said ONCE, by the controls
 * row or the day-zero offer — a sentence per card would be six cards
 * repeating one fact.
 */

/** A 4px bar track with nothing on it. */
function Track({ className = "h-1" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-[2px] bg-[var(--ink-100)] ${className}`}
    />
  );
}

/* ── Rally length · How points ended ──────────────────────────────────────── */

/** `points` is null when the read failed — said, never drawn as a tally. */
function PointsUnavailable() {
  return (
    <p role="status" className="text-micro">
      Point-by-point data could not be loaded. Reload to try again.
    </p>
  );
}

const RALLY_BANDS = ["Short 1–4", "Medium 5–8", "Long 9+"];

export function StatisticsRallyLengthPlaceholder() {
  const { points } = useStatistics();
  return (
    <RegionCard
      title="Rally length"
      aside={
        <span className="text-micro whitespace-nowrap">
          <EmptyMark label="No average rally length yet" className="mr-1" />
          shots
        </span>
      }
    >
      {points === null && <PointsUnavailable />}
      <Track className="h-28 rounded-[4px]" />
      <div className="grid grid-cols-3 gap-3">
        {RALLY_BANDS.map((band) => (
          <span
            key={band}
            className="flex items-baseline gap-1.5 text-[11px] text-[var(--ink-600)]"
          >
            {band}
            <EmptyMark label={`No share for ${band.toLowerCase()} yet`} />
          </span>
        ))}
      </div>
    </RegionCard>
  );
}

const POINT_ENDINGS = ["Winners", "Aces", "Unforced errors", "Double faults"];

export function StatisticsPointEndingsPlaceholder() {
  const { points } = useStatistics();
  return (
    <RegionCard
      title="How points ended"
      aside={<span className="text-micro whitespace-nowrap">Per match</span>}
    >
      {points === null && <PointsUnavailable />}
      {["You", "Opponents"].map((side) => (
        <div key={side} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-[var(--ink-600)]">{side}</span>
            <div className="flex-1" />
            <span className="mono text-[10px] text-[var(--ink-400)]">
              <EmptyMark
                label={`No points counted for ${side.toLowerCase()} yet`}
                className="mr-1"
              />
              pts
            </span>
          </div>
          <Track className="h-2.5 rounded-[4px]" />
        </div>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {POINT_ENDINGS.map((ending) => (
          <span
            key={ending}
            className="flex items-baseline gap-1.5 text-[11px] text-[var(--ink-600)]"
          >
            {ending}
            <EmptyMark label={`No share for ${ending.toLowerCase()} yet`} />
          </span>
        ))}
      </div>
    </RegionCard>
  );
}
