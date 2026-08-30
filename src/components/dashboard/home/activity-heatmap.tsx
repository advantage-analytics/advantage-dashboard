"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ActivityDay } from "@/lib/data/personal-activity-server";

/**
 * The interactive body of the Activity widget — the 52×7 cell grid plus the one
 * dark hover tooltip that names a day's match count.
 *
 * Split out of `ActivityWidget` (a server component) so only the grid pays for
 * "use client": the eyebrow, month labels and session count stay server-rendered.
 *
 * One shared tooltip, not one per cell. 364 Radix tooltip roots would be the
 * heavier way to reach the same dark bubble; here a single absolutely-positioned
 * node follows the hovered cell, instant on hover (no chrome reveal delay — this
 * is data, not a control naming itself). It carries the DS float treatment
 * (`--ink-900` on white text, `--shadow-dropdown`) the rest of the system's dark
 * tooltips use.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2 matches on Aug 12, 2025" from a `YYYY-MM-DD` key, without re-parsing through a tz. */
function cellTitle(date: string, count: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const label = `${MONTHS_SHORT[(m ?? 1) - 1]} ${d}, ${y}`;
  if (count <= 0) return `No matches on ${label}`;
  return `${count} ${count === 1 ? "match" : "matches"} on ${label}`;
}

interface HoverState {
  /** Index into `days` of the cell under the cursor. */
  i: number;
  /** Cell centre x, relative to the grid — where the tooltip points. */
  cx: number;
  /** Cell top y, relative to the grid — the tooltip sits just above it. */
  top: number;
}

export function ActivityHeatmap({
  days,
  sessionCount,
}: {
  days: ActivityDay[];
  sessionCount: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);

  // Keep the bubble inside the grid's width. A cell near either edge would
  // otherwise centre a ~150px label out past the card; clamp its centre to
  // [half, width − half]. useLayoutEffect runs before paint, so the clamp lands
  // on the first painted frame — no jump from centred to clamped.
  useLayoutEffect(() => {
    if (!hover || !tipRef.current || !wrapRef.current) return;
    const half = tipRef.current.offsetWidth / 2;
    const width = wrapRef.current.clientWidth;
    setTipLeft(Math.min(Math.max(hover.cx, half), width - half));
  }, [hover]);

  const active = hover ? days[hover.i] : null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        role="img"
        aria-label={`Match activity over the last 12 months: ${sessionCount} active ${sessionCount === 1 ? "day" : "days"}`}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(52, 1fr)",
          gridTemplateRows: "repeat(7, 1fr)",
          gridAutoFlow: "column",
          gap: "2px",
        }}
      >
        {days.map((day, i) => (
          <div
            key={i}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              setHover({
                i,
                cx: el.offsetLeft + el.offsetWidth / 2,
                top: el.offsetTop,
              });
            }}
            // Guard on the index so a stale leave from the cell we just left
            // can't clear a hover the next cell has already set.
            onMouseLeave={() => setHover((h) => (h?.i === i ? null : h))}
            style={{
              aspectRatio: "1",
              borderRadius: "1px",
              background: `var(--viz-heatmap-${day.level})`,
            }}
          />
        ))}
      </div>

      {hover && active && (
        <div
          ref={tipRef}
          role="tooltip"
          style={{
            position: "absolute",
            left: tipLeft ?? hover.cx,
            top: hover.top,
            transform: "translate(-50%, calc(-100% - 6px))",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            background: "var(--ink-900)",
            color: "#FFFFFF",
            fontSize: "11px",
            fontWeight: 500,
            lineHeight: 1,
            padding: "6px 8px",
            borderRadius: "var(--radius-element)",
            boxShadow: "var(--shadow-dropdown)",
            zIndex: 20,
          }}
        >
          {cellTitle(active.date, active.count)}
        </div>
      )}
    </div>
  );
}
