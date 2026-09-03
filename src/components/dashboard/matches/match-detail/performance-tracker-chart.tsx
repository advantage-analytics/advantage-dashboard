"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  scopePoints,
  useSetScope,
} from "@/components/dashboard/matches/match-detail/set-scope";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * The Statistics tab's performance tracker (artboard 47f).
 *
 * A mirrored momentum area: the running won-point differential drawn from the
 * VIEWER's side of the match, filled `viz-you` above the midline and `viz-opp`
 * below, with dashed set dividers. Breaks of serve are named in the hover
 * annotation rather than drawn as verticals — the 47f chart drops the marks so
 * the trend is the only line on screen.
 *
 * The series is `you − opp`, never `player1 − player2`: which side is "you"
 * comes from `useMatchSides()` and nothing else (guardrails §4). Drawing the
 * differential in player order would put a player-2 viewer's winning streak
 * below the line and colour it as the opponent's — a chart that reads as its
 * own mirror image, with nothing on screen indicating the flip.
 *
 * Scope-aware: the series is `scopePoints(points, activeSet)`, so a set chosen
 * in the tab-row chips narrows the chart the same way it narrows every other
 * point-derived card on this tab (head-to-head-card.tsx makes the identical
 * `useSetScope()` / `scopePoints()` read).
 */

const CHART_W = 1000;
const CHART_H = 96;
const MID = CHART_H / 2;
/** Keeps the extreme of the series off the viewBox edge. */
const Y_PAD = 6;

const EASE_CHART = [0.2, 0, 0.4, 1] as const;
const EASE_PRIMARY = [0.25, 0.46, 0.45, 0.94] as const;

interface Sample {
  /** Points won by you minus points won by the opponent, after this point. */
  diff: number;
  setNumber: number;
}

/**
 * Indices of the points that ended a game the server lost.
 *
 * The rule is the one `performance-tracker.tsx`'s `detectBreaks()` already
 * proved on this data — a game's server is the server of its last point, and
 * the game's winner is whoever won that last point, so `serverIsPlayer1 ===
 * wonByPlayer1` is a hold and anything else is a break. Two changes on top of
 * it, both narrowing rather than widening what gets marked:
 *
 *  - the FINAL game of the match is evaluated too (the streaming form only
 *    tested a game once the next one started, so a match that ended on a break
 *    never drew its most consequential marker);
 *  - a game whose points do not share one server is skipped. That is a
 *    tiebreak, where serve rotates every two points and "the server was broken"
 *    describes nothing that happened.
 */
function detectBreakIndices(points: MatchPoint[]): number[] {
  const breaks: number[] = [];
  let start = 0;

  for (let i = 1; i <= points.length; i += 1) {
    const isBoundary =
      i === points.length ||
      points[i].gameNumber !== points[i - 1].gameNumber ||
      points[i].setNumber !== points[i - 1].setNumber;
    if (!isBoundary) continue;

    const last = points[i - 1];
    let oneServer = true;
    for (let j = start; j < i; j += 1) {
      if (points[j].serverIsPlayer1 !== last.serverIsPlayer1) {
        oneServer = false;
        break;
      }
    }

    const serverHeld = last.serverIsPlayer1 === last.wonByPlayer1;
    if (oneServer && !serverHeld) breaks.push(i - 1);

    start = i;
  }

  return breaks;
}

export function PerformanceTrackerChart() {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const { activeSet } = useSetScope();
  const shouldReduceMotion = useReducedMotion();

  const rawId = useId();
  // `useId()` embeds colons; strip them before the value goes into a `url(#…)`
  // reference so the clip resolves in every engine.
  const uid = rawId.replace(/:/g, "");
  const clipAbove = `mom-above-${uid}`;
  const clipBelow = `mom-below-${uid}`;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const youIsPlayer1 = sides.you.isPlayer1;

  // Narrow to the chosen set through the shared helper — the same read every
  // point-derived card on this tab makes, so the chip selection moves them in
  // step. `null` is the whole match.
  const scopedPoints = useMemo(
    () => scopePoints(points, activeSet),
    [points, activeSet],
  );

  const samples: Sample[] = useMemo(() => {
    const out: Sample[] = [];
    let diff = 0;
    for (const p of scopedPoints) {
      diff += p.wonByPlayer1 === youIsPlayer1 ? 1 : -1;
      out.push({ diff, setNumber: p.setNumber });
    }
    return out;
  }, [scopedPoints, youIsPlayer1]);

  // Points that ended a game the server lost, as indices into the scoped
  // series. The 47f chart draws no break verticals, so this feeds only the
  // hover annotation's "Break of serve" line; a Set keeps that lookup O(1).
  const breakIndexSet = useMemo(
    () => new Set(detectBreakIndices(scopedPoints)),
    [scopedPoints],
  );

  // `match-points-server.ts` coerces a null `game_score`/`point_score` to
  // "0-0" — the Advantage Intelligence derivation writes neither, so an
  // analyzed match would otherwise show a fabricated "0-0" on every hover
  // (flags-doc #9). Same test `point-list.tsx`'s `columnHasValues()` uses: if
  // the column is "0-0" match-wide there is nothing real behind it. Read from
  // the whole match, not the scope — the column's reality does not change with
  // the set in view.
  const showScores = useMemo(
    () =>
      points.length > 0 &&
      points.some((p) => p.gameScore !== "0-0" || p.pointScore !== "0-0"),
    [points],
  );

  const geometry = useMemo(() => {
    if (samples.length < 2) return null;

    const maxAbs = Math.max(...samples.map((s) => Math.abs(s.diff)), 1);
    const x = (i: number) => (i / (samples.length - 1)) * CHART_W;
    const y = (diff: number) => MID - (diff / maxAbs) * (MID - Y_PAD);

    const coords = samples.map((s, i) => [x(i), y(s.diff)] as const);
    const polyline = coords.map(([cx, cy]) => `${cx},${cy}`).join(" ");
    // Same vertex list closed back along the midline, so the fill sits between
    // the series and the line the clip paths split on.
    const area = [
      `M0,${MID}`,
      ...coords.map(([cx, cy]) => `L${cx},${cy}`),
      `L${CHART_W},${MID}`,
      "Z",
    ].join(" ");

    const setBoundaries: number[] = [];
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].setNumber !== samples[i - 1].setNumber) {
        setBoundaries.push(x(i));
      }
    }

    // Set widths come from real point counts, so the label row underneath lines
    // up with the dividers above it rather than assuming even sets.
    const setCounts: { setNumber: number; count: number }[] = [];
    for (const s of samples) {
      const last = setCounts[setCounts.length - 1];
      if (last && last.setNumber === s.setNumber) last.count += 1;
      else setCounts.push({ setNumber: s.setNumber, count: 1 });
    }

    return { coords, polyline, area, setBoundaries, setCounts };
  }, [samples]);

  const selectFromClientX = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || samples.length < 2) return;
      const rect = svg.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const idx = Math.round(ratio * (samples.length - 1));
      setHoverIndex(Math.max(0, Math.min(samples.length - 1, idx)));
    },
    [samples],
  );

  // Fewer than two points is not a momentum series; the card would draw a flat
  // line that reads as "the match was level throughout".
  if (!geometry) return null;

  const hovered = hoverIndex === null ? null : scopedPoints[hoverIndex];
  const hoveredDiff = hoverIndex === null ? 0 : samples[hoverIndex].diff;
  const hoverCoord = hoverIndex === null ? null : geometry.coords[hoverIndex];

  // Event line, in the spec's precedence: a break of serve outranks the point
  // flags, then match/set/break point, then the bare point number.
  const eventLine = hovered
    ? hoverIndex !== null && breakIndexSet.has(hoverIndex)
      ? `Break of serve · Set ${hovered.setNumber}`
      : hovered.isMatchPoint
        ? "Match point"
        : hovered.isSetPoint
          ? "Set point"
          : hovered.isBreakPoint
            ? "Break point"
            : `Point ${hovered.pointNumber}`
    : "";

  // Margin line: the current lead, oriented by `sides` (never player order),
  // with the game score appended ONLY where the column is real (flags-doc #9) —
  // a derived match carries the coerced "0-0", which is not a score.
  const marginBase =
    hoveredDiff === 0
      ? "Level"
      : `${hoveredDiff > 0 ? sides.you.shortName : sides.opp.shortName} +${Math.abs(hoveredDiff)} on margin`;
  const marginLine =
    showScores && hovered ? `${marginBase} · ${hovered.gameScore}` : marginBase;

  // Mono line: time from `videoTime`, dropped when the point has none so the
  // point number stands alone — a SwingVision import has no video, a
  // derived match does.
  const monoLine = hovered
    ? hovered.videoTime !== null
      ? `${formatClock(hovered.videoTime)} · point ${hovered.pointNumber}`
      : `point ${hovered.pointNumber}`
    : "";

  const lineTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.9, ease: EASE_CHART };

  return (
    <section
      aria-labelledby="performance-tracker-heading"
      className="surface-card flex flex-col gap-2"
      style={{ padding: "16px 20px 12px" }}
    >
      <div className="flex items-center gap-2.5">
        <span id="performance-tracker-heading" className="eyebrow">
          Performance tracker
        </span>
        <div className="flex-1" />
        {/* Drawn as the blue affordance it will become, wired to nothing yet
            (flags-doc #11). `aria-disabled` rather than `disabled` so the
            tooltip that explains the inert control still opens — a `disabled`
            button swallows the pointer events the tooltip listens for. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled="true"
              aria-label="Expand — not available yet"
              onClick={(e) => e.preventDefault()}
              className="cursor-default rounded-[2px] text-[11px] font-medium text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              Expand
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Expanded view coming soon</TooltipContent>
        </Tooltip>
      </div>

      <div
        className="relative"
        role="figure"
        aria-label={`Momentum across ${scopedPoints.length} points. ${sides.you.name} above the midline, ${sides.opp.name} below.`}
      >
        {/* Which half is the viewer's: the label carries a card backing so it
            stays legible over the area fill it sits on. */}
        <span
          aria-hidden="true"
          className="surface-card pointer-events-none absolute left-2 top-2 z-[2] whitespace-nowrap px-1.5 py-0.5 text-[10px]"
          style={{ color: "var(--ink-400)" }}
        >
          {sides.you.shortName} above
        </span>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: 104 }}
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

          {geometry.setBoundaries.map((x) => (
            <line
              key={`set-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={CHART_H}
              stroke="var(--ink-200)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}

          <line
            x1={0}
            y1={MID}
            x2={CHART_W}
            y2={MID}
            stroke="var(--ink-200)"
            strokeWidth={1}
          />

          {/* Geometry is static; the entrance animates only `opacity` (areas)
              and `pathLength` (lines), the two numeric props that are safe to
              interpolate — animating `d`/`points` makes framer-motion tween the
              attribute string and emit SVG parse warnings on every mount
              (shared/kpi-tile.tsx documents the same trap). */}
          <motion.path
            d={geometry.area}
            fill="var(--viz-you)"
            fillOpacity={0.14}
            clipPath={`url(#${clipAbove})`}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.2, ease: EASE_CHART }
                : { duration: 0.5, ease: EASE_CHART }
            }
          />
          <motion.path
            d={geometry.area}
            fill="var(--viz-opp)"
            fillOpacity={0.14}
            clipPath={`url(#${clipBelow})`}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.2, ease: EASE_CHART }
                : { duration: 0.5, ease: EASE_CHART }
            }
          />

          <motion.polyline
            points={geometry.polyline}
            fill="none"
            stroke="var(--viz-you)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            clipPath={`url(#${clipAbove})`}
            initial={shouldReduceMotion ? { opacity: 0 } : { pathLength: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { pathLength: 1 }}
            transition={lineTransition}
          />
          <motion.polyline
            points={geometry.polyline}
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
            onMouseLeave={() => setHoverIndex(null)}
          />
        </svg>

        {/* The artboard's `.mom-annot` reveal, rebuilt as component state — the
            opacity-only fade means reduced motion needs no separate path. */}
        {hovered && hoverCoord && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[3] flex flex-col gap-0.5 whitespace-nowrap rounded-[12px] bg-[var(--ink-900)] px-3 py-2"
            style={{
              boxShadow: "var(--shadow-dropdown)",
              left: `${(hoverCoord[0] / CHART_W) * 100}%`,
              // Parked in the half the series is NOT in, so the readout never
              // covers the line it describes and never overflows the card.
              top: hoveredDiff >= 0 ? "auto" : 0,
              bottom: hoveredDiff >= 0 ? 0 : "auto",
              transform: `translateX(${
                hoverCoord[0] > CHART_W * 0.75
                  ? "-100%"
                  : hoverCoord[0] < CHART_W * 0.25
                    ? "0%"
                    : "-50%"
              })`,
              transition: `opacity 200ms cubic-bezier(${EASE_PRIMARY.join(",")})`,
            }}
          >
            <span className="text-[12px] font-medium text-white">
              {eventLine}
            </span>
            <span className="tabular text-[11px] text-white/[0.72]">
              {marginLine}
            </span>
            <span className="mono tabular text-[10px] text-white/[0.52]">
              {monoLine}
            </span>
          </div>
        )}
      </div>

      <div className="flex">
        {geometry.setCounts.map((s) => (
          <div
            key={s.setNumber}
            className="flex justify-center"
            style={{ width: `${(s.count / scopedPoints.length) * 100}%` }}
          >
            <span
              className="tabular whitespace-nowrap text-[10px]"
              style={{ color: "var(--ink-400)" }}
            >
              Set {s.setNumber}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
