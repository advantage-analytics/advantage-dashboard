"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { watchableSegmentProps } from "@/components/dashboard/matches/match-detail/film-cut-context";
import { HOVER_DIMMED } from "@/components/dashboard/matches/match-detail/point-endings-body";
import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import type { RallyLengthBand } from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { RallyBandCount } from "@/components/dashboard/matches/match-detail/rally-length-bands";
import { EmptyMark } from "@/components/ui/empty-mark";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import { cn } from "@/lib/utils";

/**
 * The Rally length marimekko (artboard 47f) as a presentational surface.
 *
 * Three bands — 1–4 / 5–8 / 9+ shots. A band's WIDTH is its share of the
 * banded points; its vertical split is who won them, the first side's share
 * always on top. 47f fixes that top/bottom tone pair (`viz-you-mid` /
 * `viz-opp-light`) regardless of which side led the band, and drops the
 * in-band percentage — width alone answers "how often", the tooltip answers
 * "who won".
 *
 * It draws exactly two things, from two callers:
 *
 * - the match report's `RallyLengthCard` (`rally-length-card.tsx`), which
 *   tallies the match's points and, with a playable video, hands it `watch`
 *   so every band opens its points in the Video tab;
 * - the team player profile's `SeasonRallyLengthCard`, which hands it a
 *   season's summed bands (`seasonRallyBands`, `lib/data/player-season.ts`)
 *   and no `watch` — a season band is many matches, with no one film to open.
 *
 * Which side is "you" is the caller's to decide (guardrails §4): the body
 * takes `youName`/`oppName` and bands already counted from that side, and
 * nothing here reads `player1`/`player2`.
 *
 * With `watch` each band opens its points on click or Enter — hovering only
 * reads. Without it the markup is exactly the read-only card: every
 * interactive attribute is `undefined` (`watchableSegmentProps`).
 *
 * On touch a tap selects a band and its readout stays until a tap lands
 * outside the card; with `watch`, a second tap on the selected band opens it.
 *
 * Empty (no banded point): the anatomy stays — the eyebrow, a dash for the
 * average, one empty band, the three labels each with a dash — and one
 * sentence (`emptySentence`) in the legend's place; never a skeleton and
 * never a zero (`reference/empty-and-loading.md`).
 *
 * The card is the report's right column's `flex:1` absorber — its own height
 * comes from the grid row, and the mosaic in turn claims whatever that leaves
 * after the header, labels and legend take their natural height.
 */

/**
 * The mosaic: at least 120px, growing with the card. The card shares the
 * chart column's spare height with Net game (`statistics-view.tsx`), so it
 * neither towers over the other charts nor shrinks to a strip.
 */
const RALLY_PLOT_H = "min-h-[120px] flex-1";

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

interface Band extends RallyBandCount {
  /** Tooltip heading, e.g. "Short rallies · 1–4 shots". */
  title: string;
  /** Band name under the bar, e.g. "Short". */
  label: string;
}

const BAND_META: { key: RallyLengthBand; title: string; label: string }[] = [
  { key: "short", title: "Short rallies · 1–4 shots", label: "Short" },
  { key: "medium", title: "Medium rallies · 5–8 shots", label: "Medium" },
  { key: "long", title: "Long rallies · 9+ shots", label: "Long" },
];

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/**
 * Opens one band's points — the report's `watchCut` behind the body.
 * `title` is the band's tooltip heading, for the Video tab's banner.
 */
export type RallyBandWatch = (key: RallyLengthBand, title: string) => void;

/** The report's own empty sentence; a caller over another scope passes its own. */
const REPORT_EMPTY_SENTENCE =
  "No rally lengths were recorded on this match's points.";

export interface RallyLengthBodyProps {
  /** The three bands, counted from the first side's seat (any order). */
  bands: readonly RallyBandCount[];
  /** Mean shots over the banded points; `null` with none. */
  avgShots: number | null;
  youName: string;
  oppName: string;
  /** Opens a band's points in Video; absent, nothing here takes a click. */
  watch?: RallyBandWatch;
  /** What a band's share is of, in its readout: "the match", "the season". */
  shareOf?: string;
  /** The heading's id, for the section's `aria-labelledby`. */
  headingId?: string;
  /** The one sentence under the empty band. */
  emptySentence?: string;
}

export function RallyLengthBody({
  bands: counted,
  avgShots,
  youName,
  oppName,
  watch: onWatch,
  shareOf = "the match",
  headingId = "rally-length-heading",
  emptySentence = REPORT_EMPTY_SENTENCE,
}: RallyLengthBodyProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<Band["key"] | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();

  const bands = BAND_META.map<Band>((meta) => {
    const c = counted.find((b) => b.key === meta.key);
    const count = c?.count ?? 0;
    const youWon = c?.youWon ?? 0;
    return { ...meta, count, youWon, oppWon: count - youWon };
  });
  const total = bands.reduce((sum, b) => sum + b.count, 0);

  const visible = bands.filter((b) => b.count > 0);
  // Nothing in this match carries a shot count — a bar of three empty bands
  // would claim every rally was unrecorded length rather than saying so. The
  // card's own anatomy stays (eyebrow, one empty band, the three labels with
  // a dash where a count goes), with a sentence in the legend's place.
  if (total === 0 || visible.length === 0 || avgShots === null) {
    return (
      <section
        aria-labelledby={headingId}
        className="surface-card flex min-h-0 flex-1 flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="rally-length-empty"
      >
        <div className="flex items-baseline gap-2">
          <span id={headingId} className="eyebrow">
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
            className={cn(RALLY_PLOT_H, "rounded-[var(--radius-cell)]")}
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
          {emptySentence}
        </p>
      </section>
    );
  }

  return (
    <section
      ref={cardRef}
      aria-labelledby={headingId}
      className="surface-card flex min-h-0 flex-1 flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id={headingId} className="eyebrow">
          Rally length
        </span>
        <div className="flex-1" />
        <span className="text-micro tabular whitespace-nowrap">
          {avgShots.toFixed(1)} shots average
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className={cn(RALLY_PLOT_H, "flex items-stretch")}>
          {visible.map((band, i) => {
            const width = pct(band.count, total);
            const youShare = pct(band.youWon, band.count);
            const isFirst = i === 0;
            const isLast = i === visible.length - 1;
            const label = `${band.title}. ${band.count} points, ${Math.round(width)} percent of ${shareOf}. ${youName} won ${band.youWon}, ${oppName} won ${band.oppWon}.`;
            // Only with a playable video does the band take a click; every
            // attribute below is `undefined` otherwise, so the read-only
            // markup is unchanged. Focus is `focus.css`'s ring.
            const watch = onWatch
              ? () => onWatch(band.key, band.title)
              : undefined;

            return (
              <div
                key={band.key}
                className={
                  watch
                    ? "relative box-border flex cursor-pointer flex-col transition-opacity duration-200 motion-reduce:transition-none"
                    : "relative box-border flex cursor-default flex-col transition-opacity duration-200 motion-reduce:transition-none"
                }
                style={{
                  width: `${width}%`,
                  borderRight: isLast
                    ? undefined
                    : "2px solid var(--surface-card)",
                  // While a band is hovered the others fade (`HOVER_DIMMED`).
                  opacity:
                    hovered !== null && hovered !== band.key ? HOVER_DIMMED : 1,
                }}
                tabIndex={0}
                {...watchableSegmentProps(watch, label)}
                onPointerDown={(e) => {
                  if (fingerTap.press(e, hovered === band.key)) {
                    setHovered(band.key);
                  }
                }}
                onClick={() => fingerTap.click(watch, () => setHovered(null))}
                onMouseEnter={() => setHovered(band.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(band.key)}
                onBlur={() => setHovered(null)}
              >
                <BandTooltip
                  band={band}
                  open={hovered === band.key}
                  sharePct={width}
                  youName={youName}
                  oppName={oppName}
                  align={isFirst ? "start" : isLast ? "end" : "center"}
                  watchable={Boolean(watch)}
                  shareOf={shareOf}
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
  youName,
  oppName,
  align,
  watchable,
  shareOf,
}: {
  band: Band;
  open: boolean;
  sharePct: number;
  youName: string;
  oppName: string;
  align: "start" | "center" | "end";
  /** The band opens its points in the Video tab. */
  watchable: boolean;
  shareOf: string;
}) {
  const coarse = useCoarsePointer();
  return (
    <ChartTooltip
      open={open}
      align={align}
      offset={8}
      className="gap-[3px] px-[11px] py-[9px]"
    >
      <span className="text-[12px] font-medium text-white">{band.title}</span>
      <span className="tabular text-[11px] text-white/[0.64]">
        {band.count} points · {sharePct.toFixed(1)}% of {shareOf}
      </span>
      <span className="tabular pt-0.5 text-[11px] text-white">
        {youName} {Math.round(pct(band.youWon, band.count))}%
      </span>
      <span className="tabular text-[11px] text-white/[0.78]">
        {oppName} {Math.round(pct(band.oppWon, band.count))}%
      </span>
      {watchable && (
        <span className="text-[10px] text-white/[0.64]">
          {coarse ? "Tap again to watch in Video" : "Click to watch in Video"}
        </span>
      )}
    </ChartTooltip>
  );
}
