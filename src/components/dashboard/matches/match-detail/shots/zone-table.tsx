"use client";

import type {
  ZoneKey,
  ZoneStats,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";

/**
 * The zone table under the court (artboard 46b lines 734–744): Zone · Serves ·
 * Won bar · Rate, one row per service-box zone, in the court's own left-to-
 * right order so a row and its cell read as the same thing.
 *
 * Numbers come from the same `computeZoneStats` result the court cells render,
 * for the same filter cut — the table can never disagree with the court.
 * Numeric columns and their headers are right-aligned, text flush left,
 * nothing centered (design-system Data Table rule 1).
 */

const ZONE_ROWS: { key: ZoneKey; label: string }[] = [
  { key: "deuce-wide", label: "Deuce wide" },
  { key: "deuce-body", label: "Deuce body" },
  { key: "deuce-t", label: "Deuce T" },
  { key: "ad-t", label: "Ad T" },
  { key: "ad-body", label: "Ad body" },
  { key: "ad-wide", label: "Ad wide" },
];

const GRID = "grid grid-cols-[minmax(0,1fr)_90px_130px_60px] gap-3.5";

export function ZoneTable({
  zoneStats,
}: {
  zoneStats: Record<ZoneKey, ZoneStats> | null;
}) {
  if (!zoneStats) return null;

  return (
    <div className="surface-card flex flex-col gap-0.5 px-5 pb-2.5 pt-4">
      <div
        className={`${GRID} items-end border-b border-[var(--border-hairline)] pb-[7px]`}
      >
        <span className="eyebrow">Zone</span>
        <span className="eyebrow text-right">Serves</span>
        <span className="eyebrow">Won</span>
        <span className="eyebrow text-right">Rate</span>
      </div>
      {ZONE_ROWS.map(({ key, label }) => {
        const zs = zoneStats[key];
        return (
          <div
            key={key}
            className={`${GRID} -mx-2 h-9 items-center rounded-[var(--radius-element)] px-2 hover:bg-[var(--surface-muted)]`}
          >
            <span className="text-[12px] text-[var(--ink-700)]">{label}</span>
            <span className="tabular text-right text-[12px] text-[var(--ink-600)]">
              {zs.count}
            </span>
            <span
              className="flex h-1.5 overflow-hidden rounded-[var(--radius-cell)] bg-[var(--surface-subtle)]"
              role="img"
              aria-label={`${zs.winPct}% of points won behind serves ${label.toLowerCase()}`}
            >
              <span
                className="h-1.5 bg-[var(--viz-good)]"
                style={{ width: `${zs.winPct}%` }}
              />
            </span>
            {zs.count === 0 ? (
              <span className="text-right text-[12px] italic text-[var(--ink-400)]">
                —
              </span>
            ) : (
              <span className="tabular text-right text-[12px] text-[var(--ink-900)]">
                {zs.winPct}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
