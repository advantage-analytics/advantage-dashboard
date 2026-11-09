"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import {
  CHART_H,
  CHART_W,
  MID,
  PLOT_H,
  momentumY,
  runAreaPath,
  runLinePath,
  type PlotCoord,
} from "@/components/dashboard/matches/match-detail/momentum-plot";
import { SEASON_OPPONENTS_LABEL } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { isFingerPointer, useTouchReadout } from "@/hooks/use-touch-readout";
import { formatMatchDayMedium } from "@/lib/data/match-day";
import { surname } from "@/lib/data/match-utils";
import type { SeasonPerMatch } from "@/lib/data/player-season";
import { cn } from "@/lib/utils";

/**
 * The team player profile's season Performance tracker (design Q, the
 * `CohesiveQ` board): the match report's momentum plot, one sample a match.
 *
 * Where the report draws a match's running won-point differential point by
 * point, this draws the season's match by match — each analyzed match is one
 * sample, its points won minus its points lost (`matchDifferential`), in
 * date order, oldest first (`seasonPerMatch`'s order). The same frame
 * (`momentum-plot.ts`): filled `viz-you` above the midline where the player
 * won more points than they lost, `viz-opp` below where they lost more, the
 * line and the area clipped at the midline as the report's are. No break
 * lines and no set labels — a season has neither; a mark on each sample
 * instead, since a handful of matches is countable where a match's points
 * are not.
 *
 * The series is the PLAYER's, never a seat's: the fold tallied every match
 * with that match's own `isPlayer1` (guardrails §4) and this chart only
 * reads `youWon`/`total`. "Opponents" is whoever they played each day.
 *
 * Hovering a sample (or tapping it; a horizontal drag scrubs, a vertical one
 * still scrolls — the plot is `pan-y`) opens the DS dark readout above the
 * plot: the opponent, how many of the match's points the player won, the
 * day. Nothing clicks through — a season has no one film to open — and the
 * same words sit in an `sr-only` list, one line a match, so a screen reader
 * gets each match the chart draws. The readout stays open on touch until a
 * tap lands outside the chart (`useTouchReadout`); a second tap on the
 * selected mark closes it.
 *
 * Empty (no analyzed match): the anatomy — eyebrow, the "Points won, match
 * by match" micro, the midline alone, the legend — and one sentence saying
 * what fills it. Never a zero (`reference/empty-and-loading.md`).
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

const HEADING_ID = "season-performance-tracker-heading";

/** The right micro — the canvas's wording for what the series is. */
export const SEASON_TRACKER_CAPTION = "Points won, match by match";

/**
 * One match's won-point differential from the player's side: the points they
 * won minus the points they lost — positive above the midline.
 */
export function matchDifferential(
  m: Pick<SeasonPerMatch, "youWon" | "total">,
): number {
  return m.youWon - (m.total - m.youWon);
}

/**
 * What one sample's readout says, and its `sr-only` line: the opponent, the
 * player's share of the match's points, the day (empty when the match has
 * no readable date — the line is then left out rather than printed blank).
 */
export function sampleReadout(m: SeasonPerMatch): {
  opponent: string;
  points: string;
  date: string;
} {
  return {
    opponent: m.opponent,
    points: `Won ${m.youWon} of ${m.total} points`,
    date: formatMatchDayMedium(m.date),
  };
}

/** The one sentence under the empty plot. */
export function seasonTrackerEmptySentence(playerName: string): string {
  return `Each analyzed match adds a mark: the points ${surname(playerName)} won against the points lost.`;
}

export function SeasonPerformanceTracker({
  playerName,
  perMatch,
}: {
  /** The player's full name; the legend shows their surname. */
  playerName: string;
  /** `seasonPerMatch()` — one entry per analyzed match, oldest first. */
  perMatch: SeasonPerMatch[];
}) {
  const shouldReduceMotion = useReducedMotion();
  const youName = surname(playerName);

  const rawId = useId();
  // `useId()` embeds colons; strip them before the value goes into a `url(#…)`
  // reference so the clip resolves in every engine.
  const uid = rawId.replace(/:/g, "");
  const clipAbove = `season-mom-above-${uid}`;
  const clipBelow = `season-mom-below-${uid}`;

  const svgRef = useRef<SVGSVGElement>(null);
  // `savedIndex` outlives the hover so the readout keeps its text while it
  // fades out; `open` is what the hover actually controls.
  const [savedIndex, setIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const chartRef = useTouchReadout<HTMLDivElement>(open, () => setOpen(false));
  // A finger's press, kept until its click: the sample it landed on, and
  // whether that mark was already the selected one. Only that second tap
  // closes the readout; a mouse click does nothing here.
  const fingerTapRef = useRef<{ index: number; reselect: boolean } | null>(
    null,
  );

  const n = perMatch.length;

  const geometry = useMemo(() => {
    if (perMatch.length === 0) return null;
    const diffs = perMatch.map(matchDifferential);
    const maxAbs = Math.max(...diffs.map(Math.abs), 1);
    // One match sits mid-plot: a series of one has no span to spread over.
    const x = (i: number) =>
      perMatch.length === 1
        ? CHART_W / 2
        : (i / (perMatch.length - 1)) * CHART_W;
    const coords: PlotCoord[] = diffs.map(
      (d, i) => [x(i), momentumY(d, maxAbs)] as const,
    );
    return {
      diffs,
      coords,
      linePath: runLinePath(coords),
      area: runAreaPath(coords),
    };
  }, [perMatch]);

  const selectFromClientX = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg || n === 0) return null;
      const rect = svg.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const idx =
        n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
      setIndex(idx);
      setOpen(true);
      return idx;
    },
    [n],
  );

  const header = (
    <div className="flex items-baseline gap-2.5">
      <span id={HEADING_ID} className="eyebrow">
        Performance tracker
      </span>
      <div className="flex-1" />
      <span
        className="text-micro whitespace-nowrap"
        style={{ color: "var(--ink-400)" }}
      >
        {SEASON_TRACKER_CAPTION}
      </span>
    </div>
  );

  // Which half is whose, as every chart card on the report keys it.
  const legend = (
    <div className="flex items-center gap-3.5" aria-hidden="true">
      <LegendSwatch color="var(--viz-you)" label={`${youName} ahead`} />
      <LegendSwatch
        color="var(--viz-opp)"
        label={`${SEASON_OPPONENTS_LABEL} ahead`}
      />
    </div>
  );

  // Nothing analyzed yet: the plot's anatomy with the midline alone, and one
  // sentence saying what each analyzed match adds.
  if (!geometry) {
    return (
      <section
        aria-labelledby={HEADING_ID}
        className="surface-card flex flex-col gap-2.5"
        style={{ padding: "16px 20px 12px" }}
        data-testid="season-performance-tracker-empty"
      >
        {header}
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: PLOT_H }}
          aria-hidden="true"
        >
          <line
            x1={0}
            y1={MID}
            x2={CHART_W}
            y2={MID}
            stroke="var(--ink-200)"
            strokeWidth={1}
          />
        </svg>
        {legend}
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          {seasonTrackerEmptySentence(playerName)}
        </p>
      </section>
    );
  }

  // `savedIndex` outlives the hover, so a new season (a re-fetch) can leave
  // it pointing past the series. Treat an out-of-range index as none.
  const index = savedIndex !== null && savedIndex < n ? savedIndex : null;
  const hoverIndex = open && index !== null ? index : null;
  const hoverCoord = hoverIndex === null ? null : geometry.coords[hoverIndex];

  // The readout's sample. Read from `index`, not the open flag, so the text
  // holds while the box fades out.
  const readout = index === null ? null : sampleReadout(perMatch[index]);
  const readoutX = index === null ? 0 : geometry.coords[index][0];
  const readoutAlign =
    readoutX > CHART_W * 0.75
      ? "end"
      : readoutX < CHART_W * 0.25
        ? "start"
        : "center";

  const fadeTransition = shouldReduceMotion
    ? { duration: 0.2, ease: EASE_CHART }
    : { duration: 0.5, ease: EASE_CHART };
  const lineTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.9, ease: EASE_CHART };

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="surface-card flex flex-col gap-2.5"
      style={{ padding: "16px 20px 12px" }}
      data-testid="season-performance-tracker"
    >
      {header}

      <div
        ref={chartRef}
        className="relative"
        role="figure"
        aria-label={`Points won match by match across ${n} analyzed ${n === 1 ? "match" : "matches"}. ${youName} above the midline, opponents below.`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="block w-full"
          // A horizontal drag scrubs the plot; a vertical one scrolls.
          style={{ height: PLOT_H, touchAction: "pan-y" }}
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipAbove}>
              <rect x={0} y={0} width={CHART_W} height={MID} />
            </clipPath>
            <clipPath id={clipBelow}>
              <rect x={0} y={MID} width={CHART_W} height={MID} />
            </clipPath>
          </defs>

          <line
            x1={0}
            y1={MID}
            x2={CHART_W}
            y2={MID}
            stroke="var(--ink-200)"
            strokeWidth={1}
          />

          {/* Geometry is static; the entrance animates only `opacity` (areas)
              and `pathLength` (lines), as the report's tracker does — tweening
              `d` makes framer-motion emit SVG parse warnings on every mount. */}
          <motion.path
            d={geometry.area}
            fill="var(--viz-you)"
            fillOpacity={0.14}
            clipPath={`url(#${clipAbove})`}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fadeTransition}
          />
          <motion.path
            d={geometry.area}
            fill="var(--viz-opp)"
            fillOpacity={0.14}
            clipPath={`url(#${clipBelow})`}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fadeTransition}
          />

          <motion.path
            d={geometry.linePath}
            fill="none"
            stroke="var(--viz-you)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            clipPath={`url(#${clipAbove})`}
            initial={shouldReduceMotion ? { opacity: 0 } : { pathLength: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { pathLength: 1 }}
            transition={lineTransition}
          />
          <motion.path
            d={geometry.linePath}
            fill="none"
            stroke="var(--viz-opp)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            clipPath={`url(#${clipBelow})`}
            initial={shouldReduceMotion ? { opacity: 0 } : { pathLength: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { pathLength: 1 }}
            transition={lineTransition}
          />

          {hoverCoord && (
            <line
              x1={hoverCoord[0]}
              y1={0}
              x2={hoverCoord[0]}
              y2={CHART_H}
              stroke="var(--ink-300)"
              strokeWidth={1}
            />
          )}

          <rect
            x={0}
            y={0}
            width={CHART_W}
            height={CHART_H}
            fill="transparent"
            onMouseMove={(e) => selectFromClientX(e.clientX)}
            onMouseLeave={() => setOpen(false)}
            onPointerDown={(e) => {
              if (!isFingerPointer(e)) {
                fingerTapRef.current = null;
                return;
              }
              const before = open ? index : null;
              const idx = selectFromClientX(e.clientX);
              fingerTapRef.current =
                idx === null ? null : { index: idx, reselect: idx === before };
            }}
            // A drag scrubs. The touch is captured to the rect, so the
            // readout follows the finger even past the plot's edge.
            onPointerMove={(e) => {
              if (!isFingerPointer(e) || e.buttons === 0) return;
              const idx = selectFromClientX(e.clientX);
              const tap = fingerTapRef.current;
              if (tap && idx !== tap.index) tap.reselect = false;
            }}
            // The browser took the gesture as a scroll.
            onPointerCancel={(e) => {
              if (isFingerPointer(e)) setOpen(false);
            }}
            // A second tap on the selected mark closes its readout; a mouse
            // click has nothing to do.
            onClick={() => {
              const tap = fingerTapRef.current;
              fingerTapRef.current = null;
              if (tap?.reselect) setOpen(false);
            }}
          />
        </svg>

        {/* One mark per analyzed match, on the line. HTML rather than SVG
            circles so the stretched viewBox cannot flatten them to ovals;
            the hovered one grows to the report's 9px ringed dot. */}
        {geometry.coords.map(([cx, cy], i) => (
          <motion.span
            key={perMatch[i].matchId}
            data-sample={perMatch[i].matchId}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border-[var(--surface-card)]",
              hoverIndex === i
                ? "size-[9px] border-2"
                : "size-[7px] border-[1.5px]",
            )}
            style={{
              left: `${(cx / CHART_W) * 100}%`,
              top: (cy / CHART_H) * PLOT_H,
              background:
                geometry.diffs[i] >= 0 ? "var(--viz-you)" : "var(--viz-opp)",
              boxShadow:
                hoverIndex === i ? "0 0 0 1px var(--ink-300)" : undefined,
            }}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fadeTransition}
          />
        ))}

        {/* The DS dark readout, hung above the plot at the hovered x so it
            never covers the line it describes. A zero-width anchor carries
            the x; `align` keeps the box inside the card at either edge. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-[5] w-0"
          style={{ left: `${(readoutX / CHART_W) * 100}%` }}
        >
          <ChartTooltip
            open={open && readout !== null}
            align={readoutAlign}
            offset={8}
            className="gap-[3px] px-[11px] py-[9px]"
          >
            <span className="text-[12px] font-medium text-white">
              {readout?.opponent}
            </span>
            <span className="tabular text-[11px] text-white/[0.64]">
              {readout?.points}
            </span>
            {readout?.date && (
              <span className="mono tabular pt-px text-[10px] text-white/[0.64]">
                {readout.date}
              </span>
            )}
          </ChartTooltip>
        </span>

        {/* Each match the chart draws, in words, for a screen reader. */}
        <ul className="sr-only">
          {perMatch.map((m) => {
            const words = sampleReadout(m);
            return (
              <li key={m.matchId}>
                {[words.date, words.opponent, words.points]
                  .filter(Boolean)
                  .join(", ")}
                .
              </li>
            );
          })}
        </ul>
      </div>

      {legend}
    </section>
  );
}
