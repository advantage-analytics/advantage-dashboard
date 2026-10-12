"use client";

import { useId, useState } from "react";
import { formatDelta } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";

/**
 * The peek drawer's stat chart: the six-match sparkline and the 26px pills
 * that switch it. Lifted out of `team/player-drawer.tsx` unchanged, so the
 * roster's player drawer and the personal Opponents drawer draw one chart
 * rather than two that drift.
 */

export function drawerPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/* ── Sparkline ────────────────────────────────────────────────────────────── */

const SPARK_W = 296;
const SPARK_H = 56;
/** Room for the 1.25px stroke's round caps and the r=2 end dot. */
const SPARK_PX = 3;
const SPARK_PY = 6;

/**
 * One plotted match. `match` is the slice of a recent-match row the chart
 * reads — its key, and the "who · when" its hover tip and label print.
 */
export interface SparkPoint {
  value: number;
  match: { id: string; opponent: string; date: string };
}

/**
 * Six matches, oldest to newest, for one measure.
 *
 * `Tb4`: 296×56, `--viz-you` stroke 1.25, 18%→0 area fill, end dot r2. Hover
 * any match for a hairline, a hollow dot on the line, and a dark tip with the
 * value over "opponent · date". The tip hangs below the chart and shifts at
 * the two ends so it never leaves the 296px box.
 */
export function Sparkline({
  label,
  points,
}: {
  label: string;
  points: SparkPoint[];
}) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="flex h-14 w-[296px] items-center text-[11px] text-[var(--ink-400)]">
        {points.length === 1
          ? "One match with this figure — the line starts at two."
          : "No matches with this figure yet."}
      </div>
    );
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  // A flat run would otherwise divide by zero and sit on the floor; centre it.
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const n = points.length;
  const coords = points.map((p, i) => ({
    x: SPARK_PX + (i / (n - 1)) * (SPARK_W - SPARK_PX * 2),
    y:
      SPARK_H -
      SPARK_PY -
      ((p.value - min) / (max - min)) * (SPARK_H - SPARK_PY * 2),
  }));
  const xy = (c: { x: number; y: number }) =>
    `${c.x.toFixed(2)},${c.y.toFixed(2)}`;
  const line = coords.map(xy).join(" ");
  const area = `M ${coords[0].x.toFixed(2)},${SPARK_H} ${coords
    .map((c) => `L ${xy(c)}`)
    .join(" ")} L ${coords[n - 1].x.toFixed(2)},${SPARK_H} Z`;
  const last = coords[n - 1];

  return (
    <div
      className="relative h-14 w-[296px]"
      role="img"
      aria-label={`${label} over the last ${n} matches: ${points
        .map((p) => `${Math.round(p.value)}% against ${p.match.opponent}`)
        .join(", ")}`}
    >
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        width={SPARK_W}
        height={SPARK_H}
        className="block overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--viz-you)" stopOpacity={0.18} />
            <stop offset="1" stopColor="var(--viz-you)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={area}
          fill={`url(#${gradientId})`}
          style={{ transition: "d 300ms var(--ease-primary)" }}
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--viz-you)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last.x} cy={last.y} r={2} fill="var(--viz-you)" />
      </svg>

      {/* One hit region per match, split at the midpoints between neighbours,
          8px taller than the chart at both edges so the dot and the hairline
          have room to draw. */}
      {points.map((point, i) => {
        const left = i === 0 ? 0 : (coords[i - 1].x + coords[i].x) / 2;
        const right =
          i === n - 1 ? SPARK_W : (coords[i].x + coords[i + 1].x) / 2;
        const lineX = coords[i].x - left;
        const shift = i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%";
        const active = hovered === i;
        return (
          <div
            key={point.match.id}
            className="absolute -top-2 -bottom-2"
            style={{ left, width: right - left }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {active && (
              <>
                <div
                  aria-hidden
                  className="absolute top-2 bottom-2 w-px bg-[var(--ink-300)]"
                  style={{ left: lineX }}
                />
                <div
                  aria-hidden
                  className="absolute size-[7px] rounded-full border-[1.5px] border-[var(--viz-you)] bg-[var(--surface-card)]"
                  style={{ left: lineX - 3.5, top: coords[i].y + 8 - 3.5 }}
                />
                <div
                  role="tooltip"
                  className="absolute z-[3] flex flex-col gap-0.5 rounded-[var(--radius-element)] bg-[var(--ink-900)] px-[9px] py-1.5 whitespace-nowrap text-white shadow-[var(--shadow-dropdown)]"
                  style={{
                    top: "calc(100% - 4px)",
                    left: lineX,
                    transform: `translateX(${shift})`,
                  }}
                >
                  <span className="tabular text-[12px] leading-[1.2] font-medium">
                    {Math.round(point.value)}%
                  </span>
                  <span className="text-[10px] leading-[1.2] text-[var(--ink-300)]">
                    {point.match.opponent} · {point.match.date}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Stat pills ───────────────────────────────────────────────────────────── */

/**
 * One of the four. `20c`: 19f pill anatomy — the selected one carries
 * `--border-medium` + `--surface-subtle`, the rest a hairline on nothing.
 * The frame draws them 26px tall, so 26 it is.
 */
export function StatPill({
  measure,
  selected,
  onSelect,
}: {
  /** The pill's short label, its figure, and the trend it prints beside it. */
  measure: { pill: string; value: number | null; trend: number | null };
  selected: boolean;
  onSelect: () => void;
}) {
  const delta = measure.trend === null ? null : formatDelta(measure.trend);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[11px] text-[var(--ink-600)]",
        "transition-colors duration-[var(--duration-hover)] ease-[var(--ease-primary)] hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        selected
          ? "border-[var(--border-medium)] bg-[var(--surface-subtle)]"
          : "border-[var(--border-hairline)] bg-transparent",
      )}
    >
      {measure.pill}
      <span className="tabular text-[var(--ink-900)]">
        {drawerPercent(measure.value)}
      </span>
      {delta && (
        <span className="tabular font-medium" style={{ color: delta.color }}>
          {delta.label}
        </span>
      )}
    </button>
  );
}
