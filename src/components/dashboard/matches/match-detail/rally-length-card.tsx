"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  scopePoints,
  useSetScope,
} from "@/components/dashboard/matches/match-detail/set-scope";
import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { cn } from "@/lib/utils";

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
 * Scope-aware: `scopePoints(points, activeSet)` narrows the bands the same
 * way every other point-derived card on this tab does
 * (performance-tracker-chart.tsx makes the identical read).
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

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function RallyLengthCard() {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const { activeSet } = useSetScope();
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<Band["key"] | null>(null);

  const youIsPlayer1 = sides.you.isPlayer1;

  // Narrow to the chosen set through the shared helper — the same read every
  // point-derived card on this tab makes, so the chip selection moves them
  // in step. `null` is the whole match.
  const scopedPoints = useMemo(
    () => scopePoints(points, activeSet),
    [points, activeSet],
  );

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
  // would claim every rally was unrecorded length rather than saying so.
  if (total === 0 || visible.length === 0) return null;

  return (
    <section
      aria-labelledby="rally-length-heading"
      className="surface-card flex flex-1 min-h-0 flex-col gap-3.5"
      style={{ padding: "18px 20px 16px" }}
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

      <div className="flex flex-1 min-h-0 flex-col gap-2">
        <div className="flex flex-1 min-h-24 items-stretch">
          {visible.map((band, i) => {
            const width = pct(band.count, total);
            const youShare = pct(band.youWon, band.count);
            const isFirst = i === 0;
            const isLast = i === visible.length - 1;

            return (
              <div
                key={band.key}
                className="relative box-border flex cursor-default flex-col"
                style={{
                  width: `${width}%`,
                  borderRight: isLast
                    ? undefined
                    : "2px solid var(--surface-card)",
                }}
                tabIndex={0}
                aria-label={`${band.title}. ${band.count} points, ${Math.round(width)} percent of the match. ${sides.you.shortName} won ${band.youWon}, ${sides.opp.shortName} won ${band.oppWon}.`}
                onMouseEnter={() => setHovered(band.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(band.key)}
                onBlur={() => setHovered(null)}
              >
                <BandTooltip
                  band={band}
                  open={hovered === band.key}
                  sharePct={width}
                  youName={sides.you.shortName}
                  oppName={sides.opp.shortName}
                  align={isFirst ? "start" : isLast ? "end" : "center"}
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
              className={cn(
                "box-border",
                i < visible.length - 1 && "pr-3",
              )}
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
        <LegendSwatch
          color="var(--viz-you-mid)"
          label={`${sides.you.shortName} won`}
        />
        <LegendSwatch
          color="var(--viz-opp-light)"
          label={`${sides.opp.shortName} won`}
        />
        <div className="flex-1" />
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
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
}: {
  band: Band;
  open: boolean;
  sharePct: number;
  youName: string;
  oppName: string;
  align: "start" | "center" | "end";
}) {
  return (
    <ChartTooltip
      open={open}
      align={align}
      bottomOffset={8}
      className="gap-1 px-3 py-2.5"
    >
      <span className="text-[12px] font-medium text-white">{band.title}</span>
      <span className="tabular text-[11px] text-white/[0.64]">
        {band.count} points · {sharePct.toFixed(1)}% of the match
      </span>
      <span className="tabular pt-0.5 text-[11px] text-white">
        {youName} {band.youWon} · {Math.round(pct(band.youWon, band.count))}%
      </span>
      <span className="tabular text-[11px] text-white/[0.78]">
        {oppName} {band.oppWon} · {Math.round(pct(band.oppWon, band.count))}%
      </span>
    </ChartTooltip>
  );
}
