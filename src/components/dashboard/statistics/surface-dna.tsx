"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SurfaceBreakdownItem } from "@/lib/data/statistics-server";
import { VIZ_SURFACE, VIZ_SURFACE_DEFAULT } from "@/lib/design/data-viz";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const CX = 80;
const CY = 80;
const R = 56;
const STROKE_W = 14;
const CIRC = 2 * Math.PI * R;

const SURFACE_COLORS = VIZ_SURFACE;
const DEFAULT_COLOR = VIZ_SURFACE_DEFAULT;

interface Props {
  surfaceBreakdown: SurfaceBreakdownItem[];
  totalMatches: number;
  winRate: number;
}

interface Segment {
  surface: string;
  wins: number;
  losses: number;
  total: number;
  color: string;
  offset: number;
  winLen: number;
  lossLen: number;
}

export function SurfaceDna({ surfaceBreakdown, totalMatches, winRate }: Props) {
  const shouldReduceMotion = useReducedMotion();

  const segments = useMemo(() => {
    const filtered = surfaceBreakdown.filter((s) => s.wins + s.losses > 0);
    if (filtered.length === 0 || totalMatches === 0) return [];

    let offset = 0;
    return filtered.map((s): Segment => {
      const total = s.wins + s.losses;
      const arcLen = (total / totalMatches) * CIRC;
      const winLen = (s.wins / total) * arcLen;
      const lossLen = arcLen - winLen;
      const seg: Segment = {
        surface: s.surface,
        wins: s.wins,
        losses: s.losses,
        total,
        color: SURFACE_COLORS[s.surface] ?? DEFAULT_COLOR,
        offset,
        winLen,
        lossLen,
      };
      offset += arcLen;
      return seg;
    });
  }, [surfaceBreakdown, totalMatches]);

  if (segments.length === 0) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Surface DNA
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">No surface data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] p-5 overflow-hidden">
      <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-4">
        Surface DNA
      </h2>

      <div className="flex justify-center">
        <div className="relative" style={{ width: CX * 2, height: CY * 2 }}>
          <svg width={CX * 2} height={CY * 2} aria-hidden="true">
            {/* Background ring */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F0F0F0" strokeWidth={STROKE_W} />

            {/* Surface segments */}
            {segments.map((seg, i) => (
              <g key={seg.surface}>
                {/* Win portion — full opacity */}
                <motion.circle
                  cx={CX}
                  cy={CY}
                  r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE_W}
                  strokeDasharray={`${seg.winLen} ${CIRC - seg.winLen}`}
                  strokeDashoffset={-seg.offset}
                  transform={`rotate(-90 ${CX} ${CY})`}
                  opacity={0.85}
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 0.85 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.4, delay: i * 0.1, ease: EASE_CURVE }
                  }
                />
                {/* Loss portion — faded */}
                {seg.lossLen > 0 && (
                  <motion.circle
                    cx={CX}
                    cy={CY}
                    r={R}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={STROKE_W}
                    strokeDasharray={`${seg.lossLen} ${CIRC - seg.lossLen}`}
                    strokeDashoffset={-(seg.offset + seg.winLen)}
                    transform={`rotate(-90 ${CX} ${CY})`}
                    opacity={0.25}
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 0.25 }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.4, delay: i * 0.1 + 0.05, ease: EASE_CURVE }
                    }
                  />
                )}
              </g>
            ))}
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] tabular-nums leading-none">
              {winRate}%
            </span>
            <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2px] mt-1">
              Win Rate
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4">
        {segments.map((seg) => {
          const wr = Math.round((seg.wins / seg.total) * 100);
          return (
            <div key={seg.surface} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[10px] font-normal text-[#525252]">
                {seg.surface}
              </span>
              <span className="text-[10px] font-normal text-[#AAAAAA] tabular-nums">
                {wr}% · {seg.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
