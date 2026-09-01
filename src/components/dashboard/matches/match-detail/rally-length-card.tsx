"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { cn } from "@/lib/utils";

/**
 * The Statistics tab's rally-length marimekko (artboard 46a, lines 541–548).
 *
 * Three bands — 1–4 / 5–8 / 9+ shots. A band's WIDTH is its share of the
 * points, its vertical split is who won them: the viewer's share on top, the
 * opponent's underneath. Two dimensions, one figure: how often the match was
 * played at that length, and who it favoured.
 *
 * Every "won" test is `wonByPlayer1 === sides.you.isPlayer1` (guardrails §4).
 *
 * `rallyLength` is 0 when the source recorded no shot count — not a one-shot
 * rally — so those points fall outside all three bands, exactly as
 * `head-to-head-card.tsx` treats them. The header counts the banded points
 * rather than `points.length` so that the three hover tooltips still sum to
 * the number printed above them.
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

interface Band {
  key: "short" | "medium" | "long";
  /** Tooltip heading, e.g. "Short rallies · 1–4 shots". */
  title: string;
  /** Axis label under the bar, e.g. "Short · 1–4 shots". */
  label: string;
  count: number;
  youWon: number;
  oppWon: number;
}

const BAND_META: { key: Band["key"]; title: string; label: string }[] = [
  { key: "short", title: "Short rallies · 1–4 shots", label: "Short · 1–4 shots" },
  { key: "medium", title: "Medium rallies · 5–8 shots", label: "Medium · 5–8" },
  { key: "long", title: "Long rallies · 9+ shots", label: "Long · 9+" },
];

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function RallyLengthCard() {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<Band["key"] | null>(null);

  const youIsPlayer1 = sides.you.isPlayer1;

  const { bands, total, avgShots } = useMemo(() => {
    const counters: Record<Band["key"], { count: number; youWon: number }> = {
      short: { count: 0, youWon: 0 },
      medium: { count: 0, youWon: 0 },
      long: { count: 0, youWon: 0 },
    };

    let shotSum = 0;
    for (const p of points) {
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
  }, [points, youIsPlayer1]);

  const visible = bands.filter((b) => b.count > 0);
  // Nothing in this match carries a shot count — a bar of three empty bands
  // would claim every rally was unrecorded length rather than saying so.
  if (total === 0 || visible.length === 0) return null;

  return (
    <section
      aria-labelledby="rally-length-heading"
      className="surface-card flex flex-col gap-3.5"
      style={{ padding: "18px 20px 16px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id="rally-length-heading" className="eyebrow">
          Rally length
        </span>
        <div className="flex-1" />
        <span className="text-micro tabular whitespace-nowrap">
          {total} points · {avgShots.toFixed(1)} avg shots
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-[156px] items-stretch">
          {visible.map((band, i) => {
            const width = pct(band.count, total);
            const youShare = pct(band.youWon, band.count);
            // The artboard gives the band's leader the deeper tone and the
            // trailing side the light one, which is why its long-rally band is
            // drawn viz-you-mid over viz-opp while the other two are viz-you
            // over viz-opp-light. Same rule, read off the data.
            const youLeads = youShare >= 50;
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

                <motion.div
                  className="box-border flex shrink-0 items-center overflow-hidden px-3"
                  style={{
                    background: youLeads
                      ? "var(--viz-you)"
                      : "var(--viz-you-mid)",
                    borderBottom: "2px solid var(--surface-card)",
                    borderTopLeftRadius: isFirst
                      ? "var(--radius-element)"
                      : undefined,
                    borderTopRightRadius: isLast
                      ? "var(--radius-element)"
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
                >
                  {youShare >= 18 && (
                    <span className="tabular text-[15px] font-light text-white">
                      {Math.round(youShare)}%
                    </span>
                  )}
                </motion.div>

                <div
                  className="flex-1"
                  style={{
                    background: youLeads
                      ? "var(--viz-opp-light)"
                      : "var(--viz-opp)",
                    borderBottomLeftRadius: isFirst
                      ? "var(--radius-element)"
                      : undefined,
                    borderBottomRightRadius: isLast
                      ? "var(--radius-element)"
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
              <span className="block truncate text-[11px] text-[var(--ink-700)]">
                {band.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3.5">
        <LegendSwatch
          color="var(--viz-you)"
          label={`${sides.you.shortName} won`}
        />
        <LegendSwatch
          color="var(--viz-opp)"
          label={`${sides.opp.shortName} won`}
        />
        <div className="flex-1" />
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
          Width is how often · hover a band for counts
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
        {band.count} points · {Math.round(sharePct)}% of the match
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
