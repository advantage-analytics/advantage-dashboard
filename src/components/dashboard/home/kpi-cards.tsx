"use client";

import { useId, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { KpiCardData } from "@/lib/data/performance-server";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
// Strong ease-out for value transitions (Emil: "ease-out gives instant feedback")
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const KPI_DESCRIPTIONS: Record<string, string> = {
  "1st serve percentage": "Percentage of first serves that landed in the service box",
  "service games won": "Percentage of service games you held",
  "service returns won": "Percentage of return points won against opponent's serve",
  "breakpoints converted": "Percentage of break point opportunities you converted",
  "win rate": "Percentage of matches won overall",
};

function getKpiDescription(label: string): string | undefined {
  return KPI_DESCRIPTIONS[label.toLowerCase()];
}

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
  const color = positive ? "#5DB955" : "#E51837";

  // Single data point: draw a line from 0 to the value
  const points = data.length === 1 ? [0, data[0]] : data;

  if (points.length < 2) return null;

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
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={1} />
        </linearGradient>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
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

/**
 * Crossfade wrapper — swaps content with a quick opacity + translateY transition.
 * Emil principle: "Nothing in the real world appears from nothing" — start from
 * scale(0.95)/opacity:0, use ease-out, keep it under 200ms.
 */
function ValueTransition({
  valueKey,
  children,
  className,
  delay = 0,
}: {
  valueKey: string;
  children: React.ReactNode;
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

interface KpiCardsProps {
  cards: KpiCardData[];
  matchCount?: number;
}

export default function KpiCards({ cards, matchCount }: KpiCardsProps) {
  const showTrends = matchCount == null || matchCount >= 2;
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skipAnimation = shouldReduceMotion || hasAnimated.current;
  hasAnimated.current = true;

  if (cards.length === 0) return null;

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex flex-wrap sm:flex-nowrap">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={skipAnimation ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_CURVE, delay: index * 0.05 }}
            aria-label={`${card.label}: ${card.value}, ${card.change >= 0 ? "up" : "down"} ${Math.abs(card.change).toFixed(1)}% ${card.changeLabel}`}
            className="flex-1 flex flex-col gap-3 p-5 min-w-0"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] whitespace-nowrap cursor-help w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm" tabIndex={0}>
                  {card.label}
                </p>
              </TooltipTrigger>
              {getKpiDescription(card.label) && (
                <TooltipContent side="bottom" sideOffset={4}>
                  {getKpiDescription(card.label)}
                </TooltipContent>
              )}
            </Tooltip>
            <div className="flex items-end justify-between overflow-hidden">
              <ValueTransition
                valueKey={card.value}
                className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-none tabular-nums inline-block"
              >
                {card.value}
              </ValueTransition>
              <Sparkline data={card.sparkline} positive={card.change >= 0} />
            </div>
            {showTrends ? (
              <div className="flex items-center gap-1.5 overflow-hidden">
                <ValueTransition
                  valueKey={`${card.change >= 0 ? "up" : "down"}`}
                  className={`text-[10px] font-semibold inline-block ${card.change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
                  delay={0.1}
                >
                  {card.change >= 0 ? "↑" : "↓"}
                </ValueTransition>
                <ValueTransition
                  valueKey={`${card.change}`}
                  className={`text-[11px] font-medium inline-block ${card.change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
                  delay={0.1}
                >
                  {card.change >= 0 ? "+" : ""}
                  {card.change}%
                </ValueTransition>
                <span className="text-[10px] font-normal text-[#888888]">
                  {card.changeLabel}
                </span>
              </div>
            ) : (
              <p className="text-[10px] font-normal text-[#AAAAAA]">
                1 more match for trends
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
