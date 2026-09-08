"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { KpiFormat } from "@/lib/data/performance-server";
import {
  KPI_LABEL,
  KPI_NOTE_ROW,
  KPI_VALUE_RULE,
  KpiTileStrip,
  PlaceholderSparkline,
  SPARK_HEIGHT,
  SPARK_PADDING,
  SPARK_WIDTH,
} from "./kpi-tile-shell";

// `KpiTileStrip` is re-exported alone, for the two client callers that render
// a strip and its tiles from one import. The shell's constants are NOT: a
// server component importing a plain string through this `"use client"`
// module would receive a client reference, which is the bug the shell exists
// to prevent. Server code imports from `./kpi-tile-shell` directly.
export { KpiTileStrip } from "./kpi-tile-shell";

// Lazy-loaded so Recharts is only pulled in when a tile actually renders a
// detail popover (home KPI strip) — keeps the shared tile light elsewhere.
const KpiDetailChart = dynamic(() => import("./kpi-detail-chart"), {
  ssr: false,
});

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

function Sparkline({
  data,
  tone,
}: {
  data: number[];
  /** Which way the figure moved, in the outcome register. */
  tone: "up" | "down";
}) {
  const id = useId();
  const shouldReduceMotion = useReducedMotion();
  const width = SPARK_WIDTH;
  const height = SPARK_HEIGHT;
  const color = tone === "up" ? "var(--success)" : "var(--danger)";

  if (data.length < 2) return null;
  const points = data;

  const padding = SPARK_PADDING;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pts = points.map((v, i) => ({
    x: padding + (i / (points.length - 1)) * (width - padding * 2),
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const polylinePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${pts[0].x},${height} ${pts.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${pts[pts.length - 1].x},${height} Z`;

  const lineId = `${id}-line`;
  const areaId = `${id}-area`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={1} />
        </linearGradient>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/*
        Geometry is static. The entrance animates only `opacity` (area) and
        `pathLength` (line) — both safe numeric props. Animating the `d` /
        `points` attributes directly made framer-motion interpolate the
        attribute strings and emit "Expected moveto / Expected number,
        'undefined'" warnings on every mount.
      */}
      <motion.path
        d={areaPath}
        fill={`url(#${areaId})`}
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: EASE_OUT, delay: 0.2 }}
      />
      <motion.polyline
        points={polylinePoints}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={shouldReduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, ease: EASE_OUT }}
      />
    </svg>
  );
}

function ValueTransition({
  valueKey,
  children,
  className,
  delay = 0,
}: {
  valueKey: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={valueKey}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={
          shouldReduceMotion
            ? { opacity: 0, transition: { duration: 0.1 } }
            : { opacity: 0, y: -6, filter: "blur(2px)", transition: { duration: 0.2, ease: EASE_OUT } }
        }
        transition={{ duration: 0.5, ease: EASE_OUT, delay }}
        className={className}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

export interface KpiTileTrend {
  change: number;
  changeLabel: string;
  /** When true, a negative change is good (e.g., unforced errors). Flips coloring. */
  lowerIsBetter?: boolean;
}

export interface KpiTileProps {
  label: string;
  value: string;
  /** Optional sparkline data. Hidden if fewer than 2 points. */
  sparkline?: number[];
  /**
   * Draw the grey placeholder curve when there are fewer than 2 points, rather
   * than leaving the corner empty.
   *
   * Off by default. Team Home turns it on so its strip holds one shape from
   * day zero: a ghost line at nothing and at one match, the real line from
   * two. Without it a tile's right-hand corner is empty until the second
   * match, and a strip half-full of lines reads as half-broken.
   */
  ghostSparkline?: boolean;
  /**
   * Two tiles to a phone row instead of four, with the line dropped below
   * `sm`.
   *
   * Team Home's strip is four tiles and its own component used to set this;
   * at four across a 375px screen a tile is ~94px, which is 40px of padding,
   * a 28px number and an 80px line competing for the rest. The personal strip
   * does not pass it, because its five tiles are governed by `collapse`.
   */
  compactPhone?: boolean;
  /** Optional trend readout. When absent, either `hintText` or a spacer is rendered. */
  trend?: KpiTileTrend;
  /** Fallback line shown in trend slot when `trend` is absent (e.g., "1 more match for trends"). */
  hintText?: string;
  /** Description shown in a tooltip on the label. */
  description?: string;
  /** Index used for entrance stagger delay. */
  index?: number;
  /** Skip entrance animation (e.g., already animated once). */
  skipAnimation?: boolean;
  /** Secondary small line under the value (e.g., "6-4, 7-5" subtext). Mutually exclusive with trend. */
  subtext?: string;
  /** When provided, the tile becomes a link to this href with hover/focus affordances. */
  href?: string;
  /**
   * Per-match series for the hover-preview chart. When present alongside `href`,
   * hovering the tile reveals a detailed graph popover (click still navigates).
   */
  detail?: { value: number; date: string; opponent: string }[];
  /** Value formatting hint passed to the detail chart's tooltip/axis. */
  format?: KpiFormat;
}

const MotionLink = motion.create(Link);

export function KpiTile({
  label,
  value,
  sparkline,
  ghostSparkline = false,
  compactPhone = false,
  trend,
  hintText,
  description,
  index = 0,
  skipAnimation = false,
  subtext,
  href,
  detail,
  format,
}: KpiTileProps) {
  const hasDetail = !!detail && detail.length > 0;
  const [detailOpen, setDetailOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const handleDetailEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Short dwell so a quick pass over the tile/label doesn't pop the chart.
    openTimer.current = setTimeout(() => setDetailOpen(true), 150);
  };
  const handleDetailLeave = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setDetailOpen(false), 80);
  };

  const isNeutral = trend?.change === 0;
  const isGood = trend
    ? trend.lowerIsBetter
      ? trend.change <= 0
      : trend.change >= 0
    : true;
  const trendColor = isNeutral
    ? "text-[var(--ink-500)]"
    : isGood
      ? "text-[var(--success)]"
      : "text-[var(--danger)]";
  const arrow = !trend ? "" : isNeutral ? "→" : trend.change > 0 ? "↑" : "↓";

  const sharedMotion = {
    initial: skipAnimation ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: EASE_CURVE, delay: index * 0.05 },
    "aria-label": trend
      ? `${label}: ${value}, ${trend.change === 0 ? "unchanged" : trend.change > 0 ? "up" : "down"} ${Math.abs(trend.change).toFixed(1)} ${trend.changeLabel}`
      : `${label}: ${value}`,
  } as const;

  // `.adv-kpi`: flex:1, min-width 0, 12px gap, 20px padding, overflow hidden.
  const baseClass = `flex-1 flex flex-col gap-3 px-5 py-5 overflow-hidden ${
    compactPhone ? "min-w-[50%] sm:min-w-0" : "min-w-0"
  }`;
  const linkClass = href
    ? "cursor-pointer hover:bg-[#FAFAFA] transition-colors duration-200 focus-visible:outline-none"
    : hasDetail
      ? "hover:bg-[#FAFAFA] transition-colors duration-200"
      : "";

  const content = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* One line, always, so the tile's height never changes with its
              width — `KpiTileStrip` drops to four and then three tiles before
              any default label would run out of room. `truncate` is the
              backstop for a custom pick like "BREAK POINTS CONVERTED" in a
              narrow tile: an ellipsis rather than the clip that used to cut
              "SERVICE GAMES WON" to "SERVICE GAME", which read as a different
              statistic. */}
          <p
            className={`${KPI_LABEL} focus-visible:outline-none rounded-sm ${description ? "cursor-help" : ""}`}
            tabIndex={description ? 0 : undefined}
          >
            {label}
          </p>
        </TooltipTrigger>
        {description && (
          <TooltipContent side="bottom" sideOffset={4}>
            {description}
          </TooltipContent>
        )}
      </Tooltip>
      <div className="flex items-end overflow-hidden">
        <ValueTransition
          valueKey={value}
          className="text-[28px] font-light text-[var(--color-text-primary)] tracking-[-0.5px] leading-none tabular-nums inline-block"
        >
          {value}
        </ValueTransition>
        {sparkline && sparkline.length >= 2 ? (
          <>
            {/* Uncapped: the DS's `.adv-kpi-spark{margin-left:auto}` pushes the
                sparkline to the tile's right edge. A 48px cap used to hold it
                beside the value, which only coincided with the design at one
                tile width. */}
            <div aria-hidden className="flex-1" />
            <span className={compactPhone ? "hidden sm:block" : undefined}>
              <Sparkline data={sparkline} tone={isGood ? "up" : "down"} />
            </span>
          </>
        ) : ghostSparkline ? (
          <>
            <div aria-hidden className="flex-1" />
            <PlaceholderSparkline
              index={index}
              className={compactPhone ? "hidden sm:block" : ""}
            />
          </>
        ) : null}
      </div>
      <div className={KPI_NOTE_ROW}>
      {trend ? (
        <div className="flex items-center gap-1.5 overflow-hidden">
          {/* Arrow and magnitude share one 11px/500 run (`.adv-kpi-trend`);
              the glyph was a separate 10px/600 weight before. */}
          <ValueTransition
            valueKey={arrow}
            className={`text-[11px] font-medium inline-block ${trendColor}`}
            delay={0.1}
          >
            {arrow}
          </ValueTransition>
          <ValueTransition
            valueKey={`${trend.change}`}
            className={`text-[11px] font-medium inline-block ${trendColor}`}
            delay={0.1}
          >
            {Math.abs(trend.change)}
          </ValueTransition>
          <span className="text-[10px] font-normal text-[var(--ink-500)]">
            {trend.changeLabel}
          </span>
        </div>
      ) : subtext ? (
        <p className="text-[10px] font-normal text-[var(--ink-500)] truncate tabular-nums">
          {subtext}
        </p>
      ) : hintText ? (
        <p className="text-[10px] font-normal text-[var(--ink-400)]">{hintText}</p>
      ) : null}
      </div>
    </>
  );

  /**
   * The history opens on hover, on focus, and on tap.
   *
   * Hover alone made it mouse-only: a tile without an `href` is a plain div
   * with no tab stop, so a keyboard user could not reach the chart at all and
   * a tap did nothing. Team Home's tiles are exactly that case — they carry a
   * series and no link — and the per-point opponent names exist for this
   * popover, so "reachable only with a mouse" would have been most of the
   * feature missing. A tile that IS a link keeps click for navigation.
   */
  const hoverHandlers = hasDetail
    ? {
        onMouseEnter: handleDetailEnter,
        onMouseLeave: handleDetailLeave,
        onFocus: handleDetailEnter,
        onBlur: handleDetailLeave,
        ...(href
          ? {}
          : {
              tabIndex: 0,
              onClick: () => setDetailOpen((open) => !open),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === "Escape") setDetailOpen(false);
              },
            }),
      }
    : {};

  const tileEl = href ? (
    <MotionLink
      href={href}
      {...sharedMotion}
      className={`${baseClass} ${linkClass}`}
      {...hoverHandlers}
    >
      {content}
    </MotionLink>
  ) : (
    <motion.div
      {...sharedMotion}
      className={`${baseClass} ${linkClass}`}
      {...hoverHandlers}
    >
      {content}
    </motion.div>
  );

  if (!hasDetail) return tileEl;

  return (
    <Popover open={detailOpen} onOpenChange={setDetailOpen}>
      <PopoverAnchor asChild>{tileEl}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={handleDetailEnter}
        onMouseLeave={handleDetailLeave}
      >
        <KpiDetailChart label={label} points={detail} format={format} />
      </PopoverContent>
    </Popover>
  );
}
