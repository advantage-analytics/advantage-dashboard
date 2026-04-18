"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { PlayerStatistics } from "@/lib/data/types";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface MatchKpiStripProps {
  overallRating: number | null;
  ratingLabel: string | null;
  p1: PlayerStatistics | undefined;
  p1TotalPoints: number;
  p2TotalPoints: number;
}

interface Kpi {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}

export function MatchKpiStrip({
  overallRating,
  ratingLabel,
  p1,
  p1TotalPoints,
  p2TotalPoints,
}: MatchKpiStripProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skipAnimation = shouldReduceMotion || hasAnimated.current;
  hasAnimated.current = true;

  if (!p1) return null;

  const totalPts = p1TotalPoints + p2TotalPoints;
  const p1PointsPct =
    totalPts > 0 ? Math.round((p1TotalPoints / totalPts) * 100) : 0;
  const winnersUeDelta = p1.winners - p1.unforcedErrors;
  const bpFrac = p1.fractions["breakpointsWonPct"];

  const kpis: Kpi[] = [
    {
      label: "Overall Rating",
      value: ratingLabel ?? "—",
      sub:
        overallRating !== null ? `${overallRating} / 100` : "No rating yet",
    },
    {
      label: "Points Won",
      value: totalPts > 0 ? `${p1PointsPct}%` : "—",
      sub: totalPts > 0 ? `${p1TotalPoints} of ${totalPts}` : "No points yet",
    },
    {
      label: "Winners / Errors",
      value: `${p1.winners} / ${p1.unforcedErrors}`,
      sub:
        winnersUeDelta >= 0
          ? `+${winnersUeDelta} net winners`
          : `${winnersUeDelta} net`,
      accent: winnersUeDelta >= 0 ? "#5DB955" : "#E51837",
    },
    {
      label: "Break Points",
      value: bpFrac ? `${bpFrac.made}/${bpFrac.attempts}` : "—",
      sub:
        bpFrac && bpFrac.attempts > 0
          ? `${Math.round(p1.breakpointsWonPct)}% converted`
          : "No opportunities",
    },
    {
      label: "Aces",
      value: String(p1.aces),
      sub:
        p1.doubleFaults === 0
          ? "Zero double faults"
          : `${p1.doubleFaults} double fault${p1.doubleFaults === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex flex-wrap sm:flex-nowrap">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={skipAnimation ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: i * 0.05 }}
            className="flex-1 flex flex-col gap-3 p-5 min-w-[160px]"
          >
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] whitespace-nowrap">
              {kpi.label}
            </p>
            <p
              className="text-[28px] font-light tracking-[-0.5px] leading-none tabular-nums truncate"
              style={{ color: kpi.accent ?? "#0D0D0D" }}
            >
              {kpi.value}
            </p>
            <p className="text-[10px] font-normal text-[#888888]">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
