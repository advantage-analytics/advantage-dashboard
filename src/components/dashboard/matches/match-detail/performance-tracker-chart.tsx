"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { surnameLabels } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";

/**
 * The Statistics tab's performance tracker (artboard 47f).
 *
 * A mirrored momentum area: the running won-point differential drawn from the
 * VIEWER's side of the match, filled `viz-you` above the midline and `viz-opp`
 * below. Breaks of serve are drawn as dashed verticals at the point that
 * ended the game; set boundaries are fainter solid lines, named by the Set
 * labels underneath.
 *
 * The series is `you − opp`, never `player1 − player2`: which side is "you"
 * comes from `useMatchSides()` and nothing else (guardrails §4). Drawing the
 * differential in player order would put a player-2 viewer's winning streak
 * below the line and colour it as the opponent's — a chart that reads as its
 * own mirror image, with nothing on screen indicating the flip.
 *
 * Whole match, always: the series is every point in `useMatchData().points`,
 * the same read every other point-derived card on this view makes. The match
 * filters live on the Video tab only and never narrow a Statistics card.
 *
 * With a playable video, a click while a timed point is hovered opens that
 * point in the Video tab (`actions.watchPoint`) — hovering alone never moves
 * the video. Without one the markup is exactly the read-only chart.
 *
 * Each break line is a target of its own: a 24px-wide strip over it opens the
 * break's readout on hover and — with a video — clicks through to the point
 * that broke serve. The readout is the DS dark readout (`ChartTooltip`), hung
 * ABOVE the plot so it never covers the series.
 */

const CHART_W = 1000;
const CHART_H = 96;
/** Rendered plot height in px; the viewBox is stretched to it. */
const PLOT_H = 104;
/** Width of each break line's hover/click strip, in px. */
const BREAK_HIT_W = 24;
const MID = CHART_H / 2;
/** Keeps the extreme of the series off the viewBox edge. */
const Y_PAD = 6;

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

/**
 * What the readout describes: a point hovered on the series, or one hovered
 * through its break line. Both name a point index; `kind` only says which
 * mark to highlight.
 */
interface ReadoutTarget {
  kind: "point" | "break";
  index: number;
}

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
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const shouldReduceMotion = useReducedMotion();
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  const rawId = useId();
  // `useId()` embeds colons; strip them before the value goes into a `url(#…)`
  // reference so the clip resolves in every engine.
  const uid = rawId.replace(/:/g, "");
  const clipAbove = `mom-above-${uid}`;
  const clipBelow = `mom-below-${uid}`;

  const svgRef = useRef<SVGSVGElement>(null);
  // `target` outlives the hover so the readout keeps its text while it fades
  // out; `open` is what the hover actually controls.
  const [savedTarget, setTarget] = useState<ReadoutTarget | null>(null);
  const [open, setOpen] = useState(false);

  const youIsPlayer1 = sides.you.isPlayer1;

  const samples: Sample[] = useMemo(() => {
    const out: Sample[] = [];
    let diff = 0;
    for (const p of points) {
      diff += p.wonByPlayer1 === youIsPlayer1 ? 1 : -1;
      out.push({ diff, setNumber: p.setNumber });
    }
    return out;
  }, [points, youIsPlayer1]);

  // Points that ended a game the server lost, as indices into the series:
  // the dashed break lines, and the readout's "Break of serve" line (a Set
  // keeps that lookup O(1)).
  const breakIndices = useMemo(() => detectBreakIndices(points), [points]);
  const breakIndexSet = useMemo(() => new Set(breakIndices), [breakIndices]);

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
      setTarget({
        kind: "point",
        index: Math.max(0, Math.min(samples.length - 1, idx)),
      });
      setOpen(true);
    },
    [samples],
  );

  // Fewer than two points is not a momentum series; the card would draw a flat
  // line that reads as "the match was level throughout". The card stays —
  // eyebrow, the midline alone, one sentence — so the column keeps its shape
  // and the reader is told why there is no trend rather than shown none.
  if (!geometry) {
    return (
      <section
        aria-labelledby="performance-tracker-heading"
        className="surface-card flex flex-col gap-2.5"
        style={{ padding: "16px 20px 12px" }}
        data-testid="performance-tracker-empty"
      >
        <div className="flex items-center gap-2.5">
          <span id="performance-tracker-heading" className="eyebrow">
            Performance tracker
          </span>
          <div className="flex-1" />
        </div>
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
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          Momentum is drawn once at least two points are tagged.
        </p>
      </section>
    );
  }

  // `target` outlives the hover, so a points update (a re-derive, a refresh)
  // can leave it pointing past the new series. Treat an out-of-range target
  // as none rather than read an index that no longer exists.
  const target =
    savedTarget !== null && savedTarget.index < samples.length
      ? savedTarget
      : null;

  const hoverIndex = open && target ? target.index : null;
  const hoverCoord = hoverIndex === null ? null : geometry.coords[hoverIndex];
  const hoveredBreak = open && target?.kind === "break" ? target.index : null;

  // The readout's point. Read from `target`, not the open flag, so the text
  // holds while the box fades out.
  const readoutIndex = target?.index ?? null;
  const readoutPoint = readoutIndex === null ? null : points[readoutIndex];
  const readoutDiff = readoutIndex === null ? 0 : samples[readoutIndex].diff;
  const readoutX = readoutIndex === null ? 0 : geometry.coords[readoutIndex][0];

  // Event line, in the spec's precedence: a break of serve outranks the point
  // flags, then match/set/break point, then the bare point number.
  const eventLine = !readoutPoint
    ? ""
    : readoutIndex !== null && breakIndexSet.has(readoutIndex)
      ? `Break of serve · Set ${readoutPoint.setNumber}`
      : readoutPoint.isMatchPoint
        ? "Match point"
        : readoutPoint.isSetPoint
          ? "Set point"
          : readoutPoint.isBreakPoint
            ? "Break point"
            : `Point ${readoutPoint.pointNumber}`;

  // Margin line: the current lead, oriented by `sides` (never player order),
  // with the game score appended ONLY where the column is real (flags-doc #9) —
  // a derived match carries the coerced "0-0", which is not a score.
  const marginBase =
    readoutDiff === 0
      ? "Level"
      : `${readoutDiff > 0 ? youName : oppName} +${Math.abs(readoutDiff)} on margin`;
  const marginLine =
    showScores && readoutPoint
      ? `${marginBase} · ${readoutPoint.gameScore}`
      : marginBase;

  // Mono line: time from `videoTime`, dropped when the point has none so the
  // point number stands alone — a SwingVision import has no video, a
  // derived match does.
  const monoLine = readoutPoint
    ? readoutPoint.videoTime !== null
      ? `${formatClock(readoutPoint.videoTime)} · point ${readoutPoint.pointNumber}`
      : `point ${readoutPoint.pointNumber}`
    : "";

  // A point opens in the Video tab only when there is a video and the point
  // carries a time to seek to — the same test `viz-focused.tsx` makes before
  // offering its Watch point action.
  const watchableId = (p: MatchPoint | undefined) =>
    meta.hasPlayableVideo &&
    p &&
    p.videoTime !== null &&
    Number.isFinite(p.videoTime)
      ? p.id
      : null;

  const watchId = hoverIndex === null ? null : watchableId(points[hoverIndex]);

  const readoutWatchable =
    readoutPoint !== null && watchableId(readoutPoint) !== null;

  const readoutAlign =
    readoutX > CHART_W * 0.75
      ? "end"
      : readoutX < CHART_W * 0.25
        ? "start"
        : "center";

  const lineTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.9, ease: EASE_CHART };

  return (
    <section
      aria-labelledby="performance-tracker-heading"
      className="surface-card flex flex-col gap-2.5"
      style={{ padding: "16px 20px 12px" }}
    >
      {/* Eyebrow + spacer only — the "Expand" affordance (flags-doc #11) was
          never wired to anything and is not in the settled frame. */}
      <div className="flex items-center gap-2.5">
        <span id="performance-tracker-heading" className="eyebrow">
          Performance tracker
        </span>
        <div className="flex-1" />
      </div>

      <div
        className="relative"
        role="figure"
        aria-label={`Momentum across ${points.length} points. ${sides.you.name} above the midline, ${sides.opp.name} below.`}
      >
        {/* Which half is the viewer's: the label sits on a plain card-colour
            backing (not the `surface-card` class, which also adds a border
            and shadow) so it stays legible over the area fill it sits on. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-[2] bg-[var(--surface-card)] pr-1.5 text-[10px] whitespace-nowrap"
          style={{ color: "var(--ink-400)" }}
        >
          {youName} above
        </span>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: PLOT_H }}
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

          {/* `non-scaling-stroke`: the viewBox is stretched by
              `preserveAspectRatio="none"`, which otherwise squashes a vertical
              line's width to ~0.7px on a 416px card. Set boundaries stay
              faint and solid; the dashed breaks are the marks to read. */}
          {geometry.setBoundaries.map((x) => (
            <line
              key={`set-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={CHART_H}
              stroke="var(--ink-200)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {breakIndices.map((i) => (
            <line
              key={`break-${i}`}
              x1={geometry.coords[i][0]}
              y1={0}
              x2={geometry.coords[i][0]}
              y2={CHART_H}
              stroke={hoveredBreak === i ? "var(--ink-700)" : "var(--ink-300)"}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "stroke 150ms ease" }}
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
            className={watchId ? "cursor-pointer" : undefined}
            onClick={watchId ? () => actions.watchPoint(watchId) : undefined}
            onMouseMove={(e) => selectFromClientX(e.clientX)}
            onMouseLeave={() => setOpen(false)}
          />
        </svg>

        {/* The hovered point, marked on the line. HTML rather than an SVG
            circle so the stretched viewBox cannot flatten it to an oval. */}
        {hoverCoord && hoverIndex !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute z-[2] size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-card)]"
            style={{
              left: `${(hoverCoord[0] / CHART_W) * 100}%`,
              top: (hoverCoord[1] / CHART_H) * PLOT_H,
              background:
                samples[hoverIndex].diff >= 0
                  ? "var(--viz-you)"
                  : "var(--viz-opp)",
              boxShadow: "0 0 0 1px var(--ink-300)",
            }}
          />
        )}

        {/* Break lines as targets: a strip over each dashed line, above the
            hover rect so the rect cannot swallow it. A button only where it
            opens something; otherwise a hover-only strip. */}
        {breakIndices.map((i) => {
          const breakWatchId = watchableId(points[i]);
          const hitProps = {
            className: cn(
              "absolute inset-y-0 z-[4] -translate-x-1/2 rounded-[6px] border-0 bg-transparent p-0",
              breakWatchId &&
                "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--blue)]",
            ),
            style: {
              left: `${(geometry.coords[i][0] / CHART_W) * 100}%`,
              width: BREAK_HIT_W,
            },
            onMouseEnter: () => {
              setTarget({ kind: "break", index: i });
              setOpen(true);
            },
            onMouseLeave: () => setOpen(false),
          };
          return breakWatchId ? (
            <button
              key={`break-hit-${i}`}
              type="button"
              aria-label={`Watch the break of serve in set ${points[i].setNumber}, point ${points[i].pointNumber}, in Video`}
              onClick={() => actions.watchPoint(breakWatchId)}
              onFocus={hitProps.onMouseEnter}
              onBlur={hitProps.onMouseLeave}
              {...hitProps}
            />
          ) : (
            <span key={`break-hit-${i}`} aria-hidden="true" {...hitProps} />
          );
        })}

        {/* The DS dark readout, hung above the plot at the hovered x so it
            never covers the line it describes. A zero-width anchor carries
            the x; `align` keeps the box inside the card at either edge. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-[5] w-0"
          style={{ left: `${(readoutX / CHART_W) * 100}%` }}
        >
          <ChartTooltip
            open={open && readoutPoint !== null}
            align={readoutAlign}
            offset={8}
            className="gap-[3px] px-[11px] py-[9px]"
          >
            <span className="text-[12px] font-medium text-white">
              {eventLine}
            </span>
            <span className="tabular text-[11px] text-white/[0.64]">
              {marginLine}
            </span>
            <span className="mono tabular pt-px text-[10px] text-white/[0.64]">
              {monoLine}
            </span>
            {readoutWatchable && (
              <span className="text-[10px] text-white/[0.64]">
                Click to watch in Video
              </span>
            )}
          </ChartTooltip>
        </span>
      </div>

      <div className="flex">
        {geometry.setCounts.map((s) => (
          <div
            key={s.setNumber}
            className="flex justify-center"
            style={{ width: `${(s.count / points.length) * 100}%` }}
          >
            <span
              className="tabular text-[10px] whitespace-nowrap"
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
