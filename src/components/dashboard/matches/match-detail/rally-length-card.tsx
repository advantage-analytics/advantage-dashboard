"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  watchableSegmentProps,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { EmptyMark } from "@/components/ui/empty-mark";
import { cn } from "@/lib/utils";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's rally-length marimekko (artboard 47f).
 *
 * Three bands — 1–4 / 5–8 / 9+ shots. A band's WIDTH is its share of the
 * points; its vertical split is who won them, the viewer's share always on
 * top. 47f fixes that top/bottom tone pair (`viz-you-mid` / `viz-opp-light`)
 * regardless of which side led the band, and drops the in-band percentage —
 * width alone answers "how often", the tooltip answers "who won".
 *
 * Every "won" test is `wonByPlayer1 === sides.you.isPlayer1` (guardrails §4).
 *
 * `rallyLength` is 0 when the source recorded no shot count — not a one-shot
 * rally — so those points fall outside all three bands, exactly as
 * `head-to-head-card.tsx` treats them.
 *
 * Filter-aware: the bands are counted over `useMatchFilters().filteredPoints`,
 * the same read every other point-derived card on this tab makes
 * (performance-tracker-chart.tsx makes the identical read).
 *
 * With a playable video each band opens its points in the Video tab
 * (`RALLY_BAND_CUTS`) on click or Enter — hovering only reads. Without one
 * the markup is exactly the read-only card.
 *
 * The card is the right column's `flex:1` absorber — its own height comes
 * from the grid row, and the mosaic in turn claims whatever that leaves
 * after the header, labels and legend take their natural height.
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

interface Band {
  key: "short" | "medium" | "long";
  /** Tooltip heading, e.g. "Short rallies · 1–4 shots". */
  title: string;
  /** Band name under the bar, e.g. "Short". */
  label: string;
  count: number;
  youWon: number;
  oppWon: number;
}

const BAND_META: { key: Band["key"]; title: string; label: string }[] = [
  { key: "short", title: "Short rallies · 1–4 shots", label: "Short" },
  { key: "medium", title: "Medium rallies · 5–8 shots", label: "Medium" },
  { key: "long", title: "Long rallies · 9+ shots", label: "Long" },
];

/**
 * The film cut that shows each band's points in the Video tab — a Film-only
 * rally-length cut (`FilmCutExtras`), as the shared match filters have no
 * rally-length group. Long is sent with an explicit `rallyMax: null` so an
 * upper bound can never carry over. The cut drops shot-count-less points
 * from any bounded range, exactly as the bucketing below does.
 */
export const RALLY_BAND_CUTS: Record<Band["key"], FilmCut> = {
  short: { rallyMin: 1, rallyMax: 4 },
  medium: { rallyMin: 5, rallyMax: 8 },
  long: { rallyMin: 9, rallyMax: null },
};

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function RallyLengthCard() {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { filteredPoints: scopedPoints, filtersActive } = useMatchFilters();
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<Band["key"] | null>(null);
  const watchable = meta.hasPlayableVideo;

  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);
  // What a band's share is a share OF: the whole match, or the points the
  // match filters left in.
  const ofScope = filtersActive ? "of the filtered points" : "of the match";

  const { bands, total, avgShots } = useMemo(() => {
    const counters: Record<Band["key"], { count: number; youWon: number }> = {
      short: { count: 0, youWon: 0 },
      medium: { count: 0, youWon: 0 },
      long: { count: 0, youWon: 0 },
    };

    let shotSum = 0;
    for (const p of scopedPoints) {
      if (p.rallyLength < 1) continue;
      const key: Band["key"] =
        p.rallyLength >= 9 ? "long" : p.rallyLength >= 5 ? "medium" : "short";
      counters[key].count += 1;
      if (p.wonByPlayer1 === youIsPlayer1) counters[key].youWon += 1;
      shotSum += p.rallyLength;
    }

    const banded =
      counters.short.count + counters.medium.count + counters.long.count;

    return {
      total: banded,
      avgShots: banded > 0 ? shotSum / banded : 0,
      bands: BAND_META.map<Band>((meta) => ({
        ...meta,
        count: counters[meta.key].count,
        youWon: counters[meta.key].youWon,
        oppWon: counters[meta.key].count - counters[meta.key].youWon,
      })),
    };
  }, [scopedPoints, youIsPlayer1]);

  const visible = bands.filter((b) => b.count > 0);
  // Nothing in this match carries a shot count — a bar of three empty bands
  // would claim every rally was unrecorded length rather than saying so. The
  // card's own anatomy stays (eyebrow, one empty band, the three labels with
  // a dash where a count goes), with a sentence in the legend's place.
  if (total === 0 || visible.length === 0) {
    return (
      <section
        aria-labelledby="rally-length-heading"
        className="surface-card flex min-h-0 flex-1 flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="rally-length-empty"
      >
        <div className="flex items-baseline gap-2">
          <span id="rally-length-heading" className="eyebrow">
            Rally length
          </span>
          <div className="flex-1" />
          <span className="text-micro tabular whitespace-nowrap">
            <EmptyMark label="No average" className="text-[10px]" /> shots
            average
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div
            aria-hidden="true"
            className="min-h-24 flex-1 rounded-[var(--radius-cell)]"
            style={{ background: "var(--surface-subtle)" }}
          />
          <div className="flex">
            {BAND_META.map((band) => (
              <div key={band.key} className="box-border flex-1 pr-3">
                <div className="flex items-baseline gap-1 overflow-hidden whitespace-nowrap">
                  <span className="text-[11px] text-[var(--ink-700)]">
                    {band.label}
                  </span>
                  <span className="mono tabular text-[10px]">
                    <EmptyMark
                      label={`No ${band.label.toLowerCase()} rallies recorded`}
                      className="text-[10px]"
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          {filtersActive
            ? "No rally lengths were recorded on the filtered points."
            : "No rally lengths were recorded on this match's points."}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="rally-length-heading"
      className="surface-card flex min-h-0 flex-1 flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id="rally-length-heading" className="eyebrow">
          Rally length
        </span>
        <div className="flex-1" />
        <span className="text-micro tabular whitespace-nowrap">
          {avgShots.toFixed(1)} shots average
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex min-h-24 flex-1 items-stretch">
          {visible.map((band, i) => {
            const width = pct(band.count, total);
            const youShare = pct(band.youWon, band.count);
            const isFirst = i === 0;
            const isLast = i === visible.length - 1;
            const label = `${band.title}. ${band.count} points, ${Math.round(width)} percent ${ofScope}. ${youName} won ${band.youWon}, ${oppName} won ${band.oppWon}.`;
            // Only with a playable video does the band take a click; every
            // attribute below is `undefined` otherwise, so the read-only
            // markup is unchanged. Focus is `focus.css`'s ring.
            const watch = watchable
              ? () => actions.watchCut(RALLY_BAND_CUTS[band.key], band.title)
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
                  open={hovered === band.key}
                  sharePct={width}
                  ofScope={ofScope}
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
                  {band.label}
                </span>
                <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                  {band.count}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3.5">
        <LegendSwatch color="var(--viz-you-mid)" label={`${youName} won`} />
        <LegendSwatch color="var(--viz-opp-light)" label={`${oppName} won`} />
        <div className="flex-1" />
        <span className="text-micro" style={{ color: "var(--ink-400)" }}>
          Width is how often
        </span>
      </div>
    </section>
  );
}

function BandTooltip({
  band,
  open,
  sharePct,
  ofScope,
  youName,
  oppName,
  align,
  watchable,
}: {
  band: Band;
  open: boolean;
  sharePct: number;
  /** "of the match", or "of the filtered points" under the match filters. */
  ofScope: string;
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
      <span className="text-[12px] font-medium text-white">{band.title}</span>
      <span className="tabular text-[11px] text-white/[0.64]">
        {band.count} points · {sharePct.toFixed(1)}% {ofScope}
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
