"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { TrendData, StatTrend } from "./trend-utils";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const CX = 100;
const CY = 90;
const R = 70;
const STROKE_W = 12;
const TOTAL_LEN = Math.PI * R;

interface Props {
  underPressureRating: number;
  serveRating: number;
  returnRating: number;
  trends: TrendData;
}

function arcPath(r: number): string {
  return `M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}`;
}

function zoneColor(value: number): string {
  if (value < 40) return "#E51837";
  if (value < 70) return "#3B82F6";
  return "#5DB955";
}

function TrendDelta({ trend }: { trend: StatTrend | null }) {
  if (!trend || trend.direction === "flat") return null;
  const isGood = (trend.direction === "up") === trend.isPositive;
  return (
    <span className={`text-[10px] font-medium tabular-nums ${isGood ? "text-[#5DB955]" : "text-[#E51837]"}`}>
      {trend.direction === "up" ? "+" : "−"}{trend.delta}
    </span>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] w-[52px] shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-[#3B82F6] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] font-light text-[#0D0D0D] tabular-nums w-[24px] text-right">
        {value > 0 ? value.toFixed(0) : "—"}
      </span>
    </div>
  );
}

export function PressureIndex({ underPressureRating, serveRating, returnRating, trends }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const value = Math.max(0, Math.min(100, underPressureRating));
  const fillLen = (value / 100) * TOTAL_LEN;
  const color = zoneColor(value);
  const hasData = underPressureRating > 0 || serveRating > 0 || returnRating > 0;

  // Needle angle: 0% = 180° (left), 100% = 0° (right)
  const needleAngle = Math.PI * (1 - value / 100);
  const nx = CX + (R - 4) * Math.cos(needleAngle);
  const ny = CY - (R - 4) * Math.sin(needleAngle);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Pressure Index
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          {hasData ? "Performance under pressure" : "No pressure data yet"}
        </p>
      </div>

      {hasData && (
        <>
          <div className="flex justify-center">
            <svg width={200} height={110} aria-hidden="true">
              {/* Zone backgrounds */}
              <path d={arcPath(R)} fill="none" stroke="rgba(229,24,55,0.1)" strokeWidth={STROKE_W}
                strokeDasharray={`${0.4 * TOTAL_LEN} ${0.6 * TOTAL_LEN}`} strokeLinecap="round" />
              <path d={arcPath(R)} fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth={STROKE_W}
                strokeDasharray={`0 ${0.4 * TOTAL_LEN} ${0.3 * TOTAL_LEN} ${0.3 * TOTAL_LEN}`} />
              <path d={arcPath(R)} fill="none" stroke="rgba(93,185,85,0.1)" strokeWidth={STROKE_W}
                strokeDasharray={`0 ${0.7 * TOTAL_LEN} ${0.3 * TOTAL_LEN} 0`} strokeLinecap="round" />

              {/* Active fill */}
              <motion.path
                d={arcPath(R)}
                fill="none"
                stroke={color}
                strokeWidth={STROKE_W}
                strokeLinecap="round"
                strokeDasharray={`${TOTAL_LEN}`}
                initial={shouldReduceMotion ? { strokeDashoffset: TOTAL_LEN - fillLen } : { strokeDashoffset: TOTAL_LEN }}
                animate={{ strokeDashoffset: TOTAL_LEN - fillLen }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: EASE_CURVE }}
              />

              {/* Needle */}
              <motion.line
                x1={CX}
                y1={CY}
                stroke="#0D0D0D"
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={shouldReduceMotion ? { x2: nx, y2: ny } : { x2: CX - R + 4, y2: CY }}
                animate={{ x2: nx, y2: ny }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, delay: 0.1, ease: EASE_CURVE }}
              />
              <circle cx={CX} cy={CY} r={3} fill="#0D0D0D" />

              {/* Center value */}
              <text x={CX} y={CY - 16} textAnchor="middle" className="text-[28px] font-light" fill="#0D0D0D">
                {value.toFixed(0)}
              </text>

              {/* Zone labels */}
              <text x={CX - R + 6} y={CY + 16} textAnchor="start" className="text-[8px] font-medium uppercase" fill="#AAAAAA" letterSpacing="1">0</text>
              <text x={CX + R - 6} y={CY + 16} textAnchor="end" className="text-[8px] font-medium uppercase" fill="#AAAAAA" letterSpacing="1">100</text>
            </svg>
          </div>

          {/* Trend */}
          <div className="flex justify-center mb-4">
            <TrendDelta trend={trends.underPressureRating} />
          </div>

          {/* Sub-ratings */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-[#F0F0F0]">
            <RatingBar label="Serve" value={serveRating} />
            <RatingBar label="Return" value={returnRating} />
          </div>
        </>
      )}
    </div>
  );
}
