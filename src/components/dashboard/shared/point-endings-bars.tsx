"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { watchableSegmentProps } from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  OUTCOME_META,
  outcomeTotal,
  type OutcomeKey,
  type OutcomeMeta,
  type OutcomeTally,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * The "How points ended" stacked bars (artboard 46a, lines 550–556), as
 * drawn by the match report's card and again by the Statistics page over a
 * season.
 *
 * One 100% stacked bar per side over that side's OWN decisive shots:
 * winners, aces, unforced errors, double faults. The bars are not compared
 * against each other by length — each is its own composition — so the hover
 * carries the cross-reference count instead.
 *
 * Presentational: the two tallies arrive as `outcomeTally()` made them, the
 * viewer's first (guardrails §4 is the caller's), and a segment takes a
 * click only when `onWatch` is given. Without one the markup is exactly the
 * read-only card.
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

/** `OUTCOME_META`, under the name this file has always exported it by. */
export const OUTCOMES = OUTCOME_META;

export type PointEndingsSide = "you" | "opp";

export interface PointEndingsBarsProps {
  youTally: OutcomeTally;
  oppTally: OutcomeTally;
  youName: string;
  oppName: string;
  /**
   * The figure at the right of each side's name. The match report prints
   * the side's own total; the Statistics page a per-match mean.
   */
  figure?: (side: PointEndingsSide, total: number) => ReactNode;
  /**
   * The legend's labels: `short` is the report's ("Unforced"), `share`
   * the page's — each outcome's full name with the viewer's share of it.
   */
  legend?: "short" | "share";
  /** Opens the segment's points in the Video tab; absent, it only reads. */
  onWatch?: (key: OutcomeKey, side: PointEndingsSide, label: string) => void;
}

export function PointEndingsBars({
  youTally,
  oppTally,
  youName,
  oppName,
  figure = (_side, total) => total,
  legend = "short",
  onWatch,
}: PointEndingsBarsProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  const youTotal = outcomeTotal(youTally);
  const oppTotal = outcomeTotal(oppTally);

  const rows: {
    id: PointEndingsSide;
    name: string;
    otherName: string;
    own: OutcomeTally;
    other: OutcomeTally;
    total: number;
    fill: (o: OutcomeMeta) => string;
  }[] = [
    {
      id: "you",
      name: youName,
      otherName: oppName,
      own: youTally,
      other: oppTally,
      total: youTotal,
      fill: (o: OutcomeMeta) => o.you,
    },
    {
      id: "opp",
      name: oppName,
      otherName: youName,
      own: oppTally,
      other: youTally,
      total: oppTotal,
      fill: (o: OutcomeMeta) => o.opp,
    },
  ];

  return (
    <>
      {rows.map((row) => {
        const segments = OUTCOMES.filter((o) => row.own[o.key] > 0);

        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {figure(row.id, row.total)}
              </span>
            </div>

            <div className="flex h-2.5 w-full gap-0.5">
              {segments.map((o, i) => {
                const id = `${row.id}-${o.key}`;
                const share =
                  row.total > 0 ? (row.own[o.key] / row.total) * 100 : 0;
                const isFirst = i === 0;
                const isLast = i === segments.length - 1;
                const label = `${o.label}. ${row.name} ${row.own[o.key]}, ${row.otherName} ${row.other[o.key]}.`;
                // Only with a handler does the segment take a click; every
                // attribute below is `undefined` otherwise, so the read-only
                // markup is unchanged. Focus is `focus.css`'s ring.
                const watch = onWatch
                  ? () => onWatch(o.key, row.id, `${o.label} · ${row.name}`)
                  : undefined;

                return (
                  <motion.div
                    key={o.key}
                    className={
                      watch
                        ? "relative cursor-pointer"
                        : "relative cursor-default"
                    }
                    style={{
                      background: row.fill(o),
                      borderTopLeftRadius: isFirst
                        ? "var(--radius-cell)"
                        : undefined,
                      borderBottomLeftRadius: isFirst
                        ? "var(--radius-cell)"
                        : undefined,
                      borderTopRightRadius: isLast
                        ? "var(--radius-cell)"
                        : undefined,
                      borderBottomRightRadius: isLast
                        ? "var(--radius-cell)"
                        : undefined,
                    }}
                    initial={
                      shouldReduceMotion
                        ? { width: `${share}%`, opacity: 0 }
                        : { width: "0%" }
                    }
                    animate={
                      shouldReduceMotion
                        ? { width: `${share}%`, opacity: 1 }
                        : { width: `${share}%` }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0.2 : 0.5,
                      ease: EASE_CHART,
                    }}
                    tabIndex={0}
                    {...watchableSegmentProps(watch, label)}
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(id)}
                    onBlur={() => setHovered(null)}
                  >
                    <SegmentTooltip
                      open={hovered === id}
                      label={o.label}
                      detail={`${row.name} ${row.own[o.key]} · ${row.otherName} ${row.other[o.key]}`}
                      align={isFirst ? "start" : isLast ? "end" : "center"}
                      watchable={Boolean(watch)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 pt-0.5">
        {/* Local swatch, not the shared `LegendSwatch` — this legend runs at
            6px, smaller than that component's fixed 8px dot. */}
        {OUTCOMES.map((o) => (
          <span key={o.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ background: o.you }}
            />
            {legend === "share" ? (
              <span className="text-micro tabular whitespace-nowrap">
                {o.label}{" "}
                {youTotal > 0
                  ? Math.round((youTally[o.key] / youTotal) * 100)
                  : 0}
                %
              </span>
            ) : (
              <span
                className="text-micro whitespace-nowrap"
                style={{ color: "var(--ink-400)" }}
              >
                {o.legendLabel ?? o.label}
              </span>
            )}
          </span>
        ))}
      </div>
    </>
  );
}

function SegmentTooltip({
  open,
  label,
  detail,
  align,
  watchable,
}: {
  open: boolean;
  label: string;
  detail: string;
  align: "start" | "center" | "end";
  /** The segment opens its points in the Video tab. */
  watchable: boolean;
}) {
  return (
    <ChartTooltip
      open={open}
      align={align}
      offset={6}
      className="gap-0.5 px-2.5 py-2"
    >
      <span className="text-[12px] font-medium text-white">{label}</span>
      <span className="tabular text-[11px] text-white/[0.64]">{detail}</span>
      {watchable && (
        <span className="text-[10px] text-white/[0.64]">
          Click to watch in Video
        </span>
      )}
    </ChartTooltip>
  );
}
