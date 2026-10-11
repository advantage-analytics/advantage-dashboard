"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { watchableSegmentProps } from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  RALLY_BAND_META,
  type RallyBand,
  type RallyBandMeta,
  type RallyLengthBand,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import { cn } from "@/lib/utils";

/**
 * The rally-length marimekko (artboard 47f), as drawn by the match report's
 * Rally length card and again by the Statistics page over a season.
 *
 * Three bands — 1–4 / 5–8 / 9+ shots. A band's WIDTH is its share of the
 * points; its vertical split is who won them, the viewer's share always on
 * top. 47f fixes that top/bottom tone pair (`viz-you-mid` / `viz-opp-light`)
 * regardless of which side led the band, and drops the in-band percentage —
 * width alone answers "how often", the tooltip answers "who won".
 *
 * Presentational: the tallies arrive as `rallyBands()` made them (every
 * "won" already resolved to the viewer's side — guardrails §4 is the
 * caller's), the names are the caller's, and a band takes a click only when
 * `onWatch` is given. Without one the markup is exactly the read-only card.
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

const META: Record<RallyLengthBand, RallyBandMeta> = Object.fromEntries(
  RALLY_BAND_META.map((meta) => [meta.key, meta]),
) as Record<RallyLengthBand, RallyBandMeta>;

export function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export interface RallyLengthMosaicProps {
  /** `rallyBands().bands` — a band with no points is not drawn. */
  bands: RallyBand[];
  /** `rallyBands().total`: what each band's width is a share of. */
  total: number;
  youName: string;
  oppName: string;
  /**
   * The figure after each band's name under the bar. The match report
   * prints the band's point count; the Statistics page its share.
   */
  caption?: (band: RallyBand, sharePct: number) => ReactNode;
  /** What a band's share is a share of, in the readouts: "the match". */
  scope?: string;
  /** Opens the band's points in the Video tab; absent, the bands only read. */
  onWatch?: (key: RallyLengthBand, title: string) => void;
  /** The band row's height: fills the card by default, fixed on the page. */
  heightClassName?: string;
}

export function RallyLengthMosaic({
  bands,
  total,
  youName,
  oppName,
  caption = (band) => band.count,
  scope = "the match",
  onWatch,
  heightClassName = "min-h-24 flex-1",
}: RallyLengthMosaicProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<RallyLengthBand | null>(null);
  const visible = bands.filter((b) => b.count > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className={`flex ${heightClassName} items-stretch`}>
        {visible.map((band, i) => {
          const meta = META[band.key];
          const width = pct(band.count, total);
          const youShare = pct(band.youWon, band.count);
          const isFirst = i === 0;
          const isLast = i === visible.length - 1;
          const label = `${meta.title}. ${band.count} points, ${Math.round(width)} percent of ${scope}. ${youName} won ${band.youWon}, ${oppName} won ${band.oppWon}.`;
          // Only with a handler does the band take a click; every attribute
          // below is `undefined` otherwise, so the read-only markup is
          // unchanged. Focus is `focus.css`'s ring.
          const watch = onWatch
            ? () => onWatch(band.key, meta.title)
            : undefined;

          return (
            <div
              key={band.key}
              className={
                watch
                  ? "relative box-border flex cursor-pointer flex-col"
                  : "relative box-border flex cursor-default flex-col"
              }
              style={{
                width: `${width}%`,
                borderRight: isLast
                  ? undefined
                  : "2px solid var(--surface-card)",
              }}
              tabIndex={0}
              {...watchableSegmentProps(watch, label)}
              onMouseEnter={() => setHovered(band.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(band.key)}
              onBlur={() => setHovered(null)}
            >
              <BandTooltip
                band={band}
                title={meta.title}
                open={hovered === band.key}
                sharePct={width}
                scope={scope}
                youName={youName}
                oppName={oppName}
                align={isFirst ? "start" : isLast ? "end" : "center"}
                watchable={Boolean(watch)}
              />

              {/* Fixed tones, never swapped by who led the band (47f drops
                  round-46's leader-based tone) — width alone carries "how
                  often", so the mosaic can't also be read as a scoreboard. */}
              <motion.div
                className="box-border shrink-0"
                style={{
                  background: "var(--viz-you-mid)",
                  borderBottom: "2px solid var(--surface-card)",
                  borderTopLeftRadius: isFirst
                    ? "var(--radius-cell)"
                    : undefined,
                  borderTopRightRadius: isLast
                    ? "var(--radius-cell)"
                    : undefined,
                }}
                initial={
                  shouldReduceMotion
                    ? { height: `${youShare}%`, opacity: 0 }
                    : { height: "0%" }
                }
                animate={
                  shouldReduceMotion
                    ? { height: `${youShare}%`, opacity: 1 }
                    : { height: `${youShare}%` }
                }
                transition={{
                  duration: shouldReduceMotion ? 0.2 : 0.55,
                  ease: EASE_CHART,
                }}
              />

              <div
                className="flex-1"
                style={{
                  background: "var(--viz-opp-light)",
                  borderBottomLeftRadius: isFirst
                    ? "var(--radius-cell)"
                    : undefined,
                  borderBottomRightRadius: isLast
                    ? "var(--radius-cell)"
                    : undefined,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex">
        {visible.map((band, i) => (
          <div
            key={band.key}
            className={cn("box-border", i < visible.length - 1 && "pr-3")}
            style={{ width: `${pct(band.count, total)}%` }}
          >
            <div className="flex items-baseline gap-1 overflow-hidden whitespace-nowrap">
              <span className="text-[11px] text-[var(--ink-700)]">
                {META[band.key].label}
              </span>
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {caption(band, pct(band.count, total))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BandTooltip({
  band,
  title,
  open,
  sharePct,
  scope,
  youName,
  oppName,
  align,
  watchable,
}: {
  band: RallyBand;
  title: string;
  open: boolean;
  sharePct: number;
  scope: string;
  youName: string;
  oppName: string;
  align: "start" | "center" | "end";
  /** The band opens its points in the Video tab. */
  watchable: boolean;
}) {
  return (
    <ChartTooltip
      open={open}
      align={align}
      offset={8}
      className="gap-[3px] px-[11px] py-[9px]"
    >
      <span className="text-[12px] font-medium text-white">{title}</span>
      <span className="tabular text-[11px] text-white/[0.64]">
        {band.count} points · {sharePct.toFixed(1)}% of {scope}
      </span>
      <span className="tabular pt-0.5 text-[11px] text-white">
        {youName} {Math.round(pct(band.youWon, band.count))}%
      </span>
      <span className="tabular text-[11px] text-white/[0.78]">
        {oppName} {Math.round(pct(band.oppWon, band.count))}%
      </span>
      {watchable && (
        <span className="text-[10px] text-white/[0.64]">
          Click to watch in Video
        </span>
      )}
    </ChartTooltip>
  );
}
