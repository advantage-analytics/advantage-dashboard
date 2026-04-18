"use client";

import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SelectableMatch } from "@/lib/data/statistics-server";
import { rollingAverage } from "./trend-utils";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const CHIP_W = 28;
const CHIP_GAP = 4;
const MIN_H = 24;
const MAX_H = 56;
const PAD = 8;

interface Props {
  matches: SelectableMatch[];
  totalMatches: number;
  winRate: number;
  currentStreak: string;
}

export function RollingFormStrip({ matches, totalMatches, winRate, currentStreak }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  const chronological = useMemo(
    () => [...matches].sort((a, b) => a.isoDate.localeCompare(b.isoDate)),
    [matches]
  );

  const displayCount = Math.min(chronological.length, 20);
  const display = chronological.slice(-displayCount);

  const ratings = useMemo(
    () => display.map((m) => ((m.serveRating ?? 50) + (m.returnRating ?? 50)) / 2),
    [display]
  );

  const rolling = useMemo(() => rollingAverage(ratings, 5), [ratings]);

  const svgW = displayCount * (CHIP_W + CHIP_GAP) - CHIP_GAP + PAD * 2;
  const svgH = MAX_H + PAD * 2;
  const baseline = svgH - PAD;

  function toHeight(r: number) {
    return MIN_H + (Math.max(0, Math.min(100, r)) / 100) * (MAX_H - MIN_H);
  }

  const rollingPoints = rolling
    .map((val, i) => {
      if (val === null) return null;
      const x = PAD + i * (CHIP_W + CHIP_GAP) + CHIP_W / 2;
      const y = baseline - toHeight(val);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  const wins = display.filter((m) => m.isWin).length;
  const losses = display.length - wins;

  if (display.length === 0) return null;

  return (
    <div>
      <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-3">
        Match Form
      </h2>

      <div className="relative overflow-x-auto">
        <svg width={svgW} height={svgH} aria-hidden="true" className="block">
          {display.map((match, i) => {
            const h = toHeight(ratings[i]);
            const x = PAD + i * (CHIP_W + CHIP_GAP);
            const y = baseline - h;
            return (
              <motion.rect
                key={match.id}
                x={x}
                width={CHIP_W}
                rx={4}
                fill={match.isWin ? "#5DB955" : "#E51837"}
                opacity={hovered === i ? 1 : 0.75}
                initial={shouldReduceMotion ? { y, height: h } : { y: baseline, height: 0 }}
                animate={{ y, height: h }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.35, delay: i * 0.025, ease: EASE_CURVE }
                }
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-default"
              />
            );
          })}

          {rollingPoints && (
            <motion.polyline
              points={rollingPoints}
              fill="none"
              stroke="#3B82F6"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.4, delay: displayCount * 0.025 + 0.1, ease: EASE_CURVE }
              }
            />
          )}
        </svg>

        {hovered !== null && (
          <div
            className="absolute bg-white border border-[#F3F3F3] rounded-xl px-3 py-2 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] pointer-events-none z-10 -translate-x-1/2 whitespace-nowrap"
            style={{
              left: PAD + hovered * (CHIP_W + CHIP_GAP) + CHIP_W / 2,
              top: 0,
            }}
          >
            <p className="text-[12px] font-medium text-[#0D0D0D]">
              vs {display[hovered].player2Name}
            </p>
            <p className="text-[11px] text-[#71717A]">{display[hovered].displayDate}</p>
            <p
              className={`text-[11px] font-medium ${display[hovered].isWin ? "text-[#5DB955]" : "text-[#E51837]"}`}
            >
              {display[hovered].isWin ? "Win" : "Loss"} — {Math.round(ratings[hovered])} rating
            </p>
          </div>
        )}
      </div>

      {/* Summary: hero win rate + supporting stats */}
      <div className="flex items-end gap-6 sm:gap-8 mt-5">
        <div className="shrink-0">
          <p className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] tabular-nums leading-none">
            {winRate}%
          </p>
          <p className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] mt-1.5">
            Win Rate
          </p>
        </div>

        <div className="flex items-center gap-4 sm:gap-5 pb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">{totalMatches}</span>
            <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px]">matches</span>
          </div>
          <span className="text-[13px] font-light text-[#0D0D0D] tabular-nums">{wins}W – {losses}L</span>
          <span
            className={`text-[13px] font-light tabular-nums ${
              currentStreak.includes("W")
                ? "text-[#5DB955]"
                : currentStreak.includes("L")
                  ? "text-[#E51837]"
                  : "text-[#0D0D0D]"
            }`}
          >
            {currentStreak}
          </span>
        </div>
      </div>
    </div>
  );
}
