"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SelectableMatch } from "@/lib/data/statistics-server";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const SVG_W = 420;
const BOX_H = 20;
const PAD_L = 56;
const PAD_R = 12;
const PLOT_W = SVG_W - PAD_L - PAD_R;

interface BoxData {
  label: string;
  color: string;
  fillColor: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  count: number;
}

function quartiles(sorted: number[]): { min: number; q1: number; median: number; q3: number; max: number } {
  const n = sorted.length;
  const q = (p: number) => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  return { min: sorted[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: sorted[n - 1] };
}

interface Props {
  matches: SelectableMatch[];
}

export function DurationProfile({ matches }: Props) {
  const shouldReduceMotion = useReducedMotion();

  const { boxes, globalMin, globalMax, recentDots } = useMemo(() => {
    const withDuration = matches.filter((m) => m.durationSeconds != null && m.durationSeconds > 0);
    const wins = withDuration.filter((m) => m.isWin).map((m) => m.durationSeconds! / 60).sort((a, b) => a - b);
    const losses = withDuration.filter((m) => !m.isWin).map((m) => m.durationSeconds! / 60).sort((a, b) => a - b);

    const result: BoxData[] = [];
    if (wins.length >= 3) {
      const q = quartiles(wins);
      result.push({ label: "Wins", color: "#5DB955", fillColor: "rgba(93,185,85,0.12)", ...q, count: wins.length });
    }
    if (losses.length >= 3) {
      const q = quartiles(losses);
      result.push({ label: "Losses", color: "#E51837", fillColor: "rgba(229,24,55,0.12)", ...q, count: losses.length });
    }

    const allVals = [...wins, ...losses];
    const gMin = allVals.length > 0 ? Math.min(...allVals) : 0;
    const gMax = allVals.length > 0 ? Math.max(...allVals) : 120;

    const sorted = [...withDuration].sort((a, b) => b.isoDate.localeCompare(a.isoDate));
    const recent = sorted.slice(0, 5).map((m) => ({
      minutes: m.durationSeconds! / 60,
      isWin: m.isWin,
    }));

    return { boxes: result, globalMin: gMin, globalMax: gMax, recentDots: recent };
  }, [matches]);

  if (boxes.length === 0) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Duration Profile
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">Not enough duration data yet</p>
      </div>
    );
  }

  const range = globalMax - globalMin || 1;
  const toX = (v: number) => PAD_L + ((v - globalMin) / range) * PLOT_W;

  const rowHeight = BOX_H + 24;
  const dotRowY = boxes.length * rowHeight + 8;
  const svgH = dotRowY + (recentDots.length > 0 ? 32 : 0) + 24;

  // Tick marks
  const tickStep = range > 60 ? 30 : range > 30 ? 15 : 10;
  const firstTick = Math.ceil(globalMin / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let t = firstTick; t <= globalMax; t += tickStep) ticks.push(t);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Duration Profile
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          Match length distribution (minutes)
        </p>
      </div>

      <svg width={SVG_W} height={svgH} aria-hidden="true" className="block w-full" viewBox={`0 0 ${SVG_W} ${svgH}`}>
        {/* Tick grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={toX(t)} y1={0} x2={toX(t)} y2={dotRowY} stroke="#F0F0F0" strokeWidth={1} />
            <text x={toX(t)} y={svgH - 4} textAnchor="middle" fontSize={10} fill="#AAAAAA">
              {Math.round(t)}m
            </text>
          </g>
        ))}

        {/* Box plots */}
        {boxes.map((box, i) => {
          const cy = i * rowHeight + rowHeight / 2;
          return (
            <g key={box.label}>
              {/* Label */}
              <text x={4} y={cy + 4} fontSize={11} fontWeight={500} fill={box.color}>
                {box.label}
              </text>

              {/* Whisker line */}
              <motion.line
                x1={toX(box.min)} y1={cy} x2={toX(box.max)} y2={cy}
                stroke="#D9D9D9" strokeWidth={1}
                initial={shouldReduceMotion ? false : { x2: toX(box.min) }}
                animate={{ x2: toX(box.max) }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, delay: i * 0.15, ease: EASE_CURVE }}
              />

              {/* Box (Q1-Q3) */}
              <motion.rect
                y={cy - BOX_H / 2}
                height={BOX_H}
                rx={3}
                fill={box.fillColor}
                stroke={box.color}
                strokeWidth={1}
                initial={shouldReduceMotion ? { x: toX(box.q1), width: toX(box.q3) - toX(box.q1) } : { x: toX(box.median), width: 0 }}
                animate={{ x: toX(box.q1), width: toX(box.q3) - toX(box.q1) }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, delay: i * 0.15 + 0.1, ease: EASE_CURVE }}
              />

              {/* Median line */}
              <line
                x1={toX(box.median)} y1={cy - BOX_H / 2}
                x2={toX(box.median)} y2={cy + BOX_H / 2}
                stroke={box.color} strokeWidth={2}
              />

              {/* Endpoints */}
              <circle cx={toX(box.min)} cy={cy} r={2} fill="#AAAAAA" />
              <circle cx={toX(box.max)} cy={cy} r={2} fill="#AAAAAA" />
            </g>
          );
        })}

        {/* Recent match dots */}
        {recentDots.length > 0 && (
          <g>
            <text x={4} y={dotRowY + 16} fontSize={9} fontWeight={500} fill="#AAAAAA" letterSpacing={1.5}>
              LAST {recentDots.length}
            </text>
            {recentDots.map((dot, i) => (
              <motion.circle
                key={i}
                cx={toX(dot.minutes)}
                cy={dotRowY + 14}
                r={4}
                fill={dot.isWin ? "#5DB955" : "#E51837"}
                opacity={0.7}
                initial={shouldReduceMotion ? false : { r: 0 }}
                animate={{ r: 4 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.6 + i * 0.06, ease: EASE_CURVE }}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
