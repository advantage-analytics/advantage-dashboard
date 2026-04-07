"use client";

import { useId, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { KpiCardData } from "@/lib/data/performance-server";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const KPI_DESCRIPTIONS: Record<string, string> = {
  "1ST SERVE PERCENTAGE": "Percentage of first serves that landed in the service box",
  "SERVICE GAMES WON": "Percentage of service games you held",
  "SERVICE RETURNS WON": "Percentage of return points won against opponent's serve",
  "BREAKPOINTS CONVERTED": "Percentage of break point opportunities you converted",
  "Win Rate": "Percentage of matches won overall",
};

function Sparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  const id = useId();
  if (data.length < 2) return null;

  const width = 80;
  const height = 28;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const polylinePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${pts[0].x},${height} ${pts.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${pts[pts.length - 1].x},${height} Z`;

  const color = positive ? "#5DB955" : "#E51837";
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
      <path d={areaPath} fill={`url(#${areaId})`} />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface KpiCardsProps {
  cards: KpiCardData[];
}

export default function KpiCards({ cards }: KpiCardsProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skipAnimation = shouldReduceMotion || hasAnimated.current;
  hasAnimated.current = true;

  if (cards.length === 0) return null;

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex">
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
                <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] whitespace-nowrap cursor-help w-fit">
                  {card.label}
                </p>
              </TooltipTrigger>
              {KPI_DESCRIPTIONS[card.label] && (
                <TooltipContent side="bottom" sideOffset={4}>
                  {KPI_DESCRIPTIONS[card.label]}
                </TooltipContent>
              )}
            </Tooltip>
            <div className="flex items-end justify-between overflow-hidden">
              <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-none tabular-nums">
                {card.value}
              </p>
              <Sparkline data={card.sparkline} positive={card.change >= 0} />
            </div>
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span
                className={`text-[10px] font-semibold ${card.change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
              >
                {card.change >= 0 ? "↑" : "↓"}
              </span>
              <span
                className={`text-[11px] font-medium ${card.change >= 0 ? "text-[#5DB955]" : "text-[#E51837]"}`}
              >
                {card.change >= 0 ? "+" : ""}
                {card.change}%
              </span>
              <span className="text-[10px] font-normal text-[#777777]">
                {card.changeLabel}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
