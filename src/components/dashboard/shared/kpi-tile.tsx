"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

function Sparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  const id = useId();
  const shouldReduceMotion = useReducedMotion();
  const width = 80;
  const height = 28;
  const color = positive ? "var(--color-success)" : "var(--color-error-strong)";

  if (data.length < 2) return null;
  const points = data;

  const padding = 2;
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
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.1 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={`url(#${areaId})`}
        animate={{ d: areaPath }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.2, ease: EASE_OUT }}
      />
      <motion.polyline
        points={polylinePoints}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ points: polylinePoints }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.2, ease: EASE_OUT }}
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
}

const MotionLink = motion(Link);

export function KpiTile({
  label,
  value,
  sparkline,
  trend,
  hintText,
  description,
  index = 0,
  skipAnimation = false,
  subtext,
  href,
}: KpiTileProps) {
  const isNeutral = trend?.change === 0;
  const isGood = trend
    ? trend.lowerIsBetter
      ? trend.change <= 0
      : trend.change >= 0
    : true;
  const trendColor = isNeutral
    ? "text-[var(--color-text-muted)]"
    : isGood
      ? "text-[var(--color-success)]"
      : "text-[var(--color-error-strong)]";
  const arrow = !trend ? "" : isNeutral ? "→" : trend.change > 0 ? "↑" : "↓";
  const sign = !trend || isNeutral ? "" : trend.change > 0 ? "+" : "";

  const sharedMotion = {
    initial: skipAnimation ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: EASE_CURVE, delay: index * 0.05 },
    "aria-label": trend
      ? `${label}: ${value}, ${trend.change === 0 ? "unchanged" : trend.change > 0 ? "up" : "down"} ${Math.abs(trend.change).toFixed(1)} ${trend.changeLabel}`
      : `${label}: ${value}`,
  } as const;

  const baseClass = "flex-1 flex flex-col gap-3 px-5 py-5 min-w-0";
  const linkClass = href
    ? "cursor-pointer hover:bg-[#FAFAFA] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] focus-visible:ring-inset"
    : "";

  const content = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <p
            className={`text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2.5px] whitespace-nowrap w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm ${description ? "cursor-help" : ""}`}
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
        {sparkline && sparkline.length >= 2 && (
          <>
            <div aria-hidden className="flex-1 max-w-12" />
            <Sparkline data={sparkline} positive={isGood} />
          </>
        )}
      </div>
      {trend ? (
        <div className="flex items-center gap-1.5 overflow-hidden">
          <ValueTransition
            valueKey={arrow}
            className={`text-[10px] font-semibold inline-block ${trendColor}`}
            delay={0.1}
          >
            {arrow}
          </ValueTransition>
          <ValueTransition
            valueKey={`${trend.change}`}
            className={`text-[11px] font-medium inline-block ${trendColor}`}
            delay={0.1}
          >
            {sign}
            {trend.change}
          </ValueTransition>
          <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
            {trend.changeLabel}
          </span>
        </div>
      ) : subtext ? (
        <p className="text-[10px] font-normal text-[var(--color-text-muted)] truncate tabular-nums">
          {subtext}
        </p>
      ) : hintText ? (
        <p className="text-[10px] font-normal text-[var(--color-text-dim)]">{hintText}</p>
      ) : (
        <div aria-hidden className="h-[15px]" />
      )}
    </>
  );

  if (href) {
    return (
      <MotionLink href={href} {...sharedMotion} className={`${baseClass} ${linkClass}`}>
        {content}
      </MotionLink>
    );
  }

  return (
    <motion.div {...sharedMotion} className={baseClass}>
      {content}
    </motion.div>
  );
}

export function KpiTileStrip({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white border border-[var(--color-border-card)] rounded-[14px] shadow-card overflow-hidden">
      <div className="flex flex-wrap sm:flex-nowrap">{children}</div>
    </div>
  );
}
