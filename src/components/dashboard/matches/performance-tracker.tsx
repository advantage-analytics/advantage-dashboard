"use client";

import { useId, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { shortName } from "@/lib/data/match-utils";

/* ── Constants ───────────────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#F38439";
const CHART_W = 600;
const CHART_H = 120;

/* ── Types ───────────────────────────────────────────────── */

interface MomentumPoint {
  index: number;
  diff: number;
  setNumber: number;
}

interface SetStat {
  set: number;
  p1Points: number;
  p2Points: number;
}

interface PressureStat {
  label: string;
  p1Won: number;
  p1Total: number;
  p2Won: number;
  p2Total: number;
}

interface RallyBucket {
  label: string;
  p1WonPct: number;
  p2WonPct: number;
  hasData: boolean;
}

/* ── Momentum chart ──────────────────────────────────────── */

function MomentumChart({
  data,
  p1Short,
  p2Short,
}: {
  data: MomentumPoint[];
  p1Short: string;
  p2Short: string;
}) {
  const uid = useId();
  const clipAbove = `momentum-above-${uid}`;
  const clipBelow = `momentum-below-${uid}`;

  if (data.length < 2) return null;

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.diff)), 1);
  const yMid = CHART_H / 2;
  const xScale = (i: number) => (i / (data.length - 1)) * CHART_W;
  const yScale = (diff: number) => yMid - (diff / maxAbs) * (yMid - 6);

  // Set boundary indices
  const dividers: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].setNumber !== data[i - 1].setNumber) dividers.push(i);
  }

  // Unique set numbers
  const sets = [...new Set(data.map((d) => d.setNumber))].sort((a, b) => a - b);

  // SVG path strings
  const linePts = data.map((d, i) => `${xScale(i)},${yScale(d.diff)}`).join(" ");
  const areaCoords = data.map((d, i) => `${xScale(i)},${yScale(d.diff)}`).join(" L ");
  const areaPath = `M ${xScale(0)},${yMid} L ${areaCoords} L ${xScale(data.length - 1)},${yMid} Z`;

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-3">
        Point Momentum
      </p>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ height: 120 }}
        preserveAspectRatio="none"
        aria-label="Point momentum chart"
      >
        <defs>
          <clipPath id={clipAbove}>
            <rect x={0} y={0} width={CHART_W} height={yMid} />
          </clipPath>
          <clipPath id={clipBelow}>
            <rect x={0} y={yMid} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {/* Set dividers */}
        {dividers.map((idx, i) => (
          <line
            key={i}
            x1={xScale(idx)}
            y1={0}
            x2={xScale(idx)}
            y2={CHART_H}
            stroke="#F0F0F0"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        ))}

        {/* Zero baseline */}
        <line x1={0} y1={yMid} x2={CHART_W} y2={yMid} stroke="#EBEBEB" strokeWidth={1} />

        {/* P1 leading fill (blue, above baseline) */}
        <path d={areaPath} fill={P1_COLOR} fillOpacity={0.12} clipPath={`url(#${clipAbove})`} />

        {/* P2 leading fill (orange, below baseline) */}
        <path d={areaPath} fill={P2_COLOR} fillOpacity={0.12} clipPath={`url(#${clipBelow})`} />

        {/* Momentum line */}
        <polyline
          points={linePts}
          fill="none"
          stroke="#333333"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Set labels */}
      <div className="relative h-5 mt-1">
        {sets.map((s) => {
          const indices = data
            .map((d, i) => (d.setNumber === s ? i : -1))
            .filter((i) => i >= 0);
          const midIdx = indices[Math.floor(indices.length / 2)];
          const xPct = (midIdx / (data.length - 1)) * 100;
          return (
            <span
              key={s}
              className="absolute text-[9px] font-medium text-[#CCCCCC] uppercase tracking-wider -translate-x-1/2"
              style={{ left: `${xPct}%` }}
            >
              Set {s}
            </span>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P1_COLOR, opacity: 0.6 }} />
          <span className="text-xs text-[#999999]">{p1Short} leading</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P2_COLOR, opacity: 0.6 }} />
          <span className="text-xs text-[#999999]">{p2Short} leading</span>
        </div>
      </div>
    </div>
  );
}

/* ── Set breakdown ───────────────────────────────────────── */

function SetBreakdown({
  sets,
  p1Short,
  p2Short,
}: {
  sets: SetStat[];
  p1Short: string;
  p2Short: string;
}) {
  const maxPts = Math.max(...sets.flatMap((s) => [s.p1Points, s.p2Points]), 1);

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-4">
        Points Per Set
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 mb-3">
        <div className="w-12" />
        <span className="text-[12px] font-medium text-[#0D0D0D] whitespace-nowrap truncate">
          {p1Short}
        </span>
        <span className="text-[12px] font-medium text-[#0D0D0D] whitespace-nowrap truncate">
          {p2Short}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {sets.map((s, index) => {
          const p1Pct = (s.p1Points / maxPts) * 100;
          const p2Pct = (s.p2Points / maxPts) * 100;
          const p1Wins = s.p1Points > s.p2Points;
          const p2Wins = s.p2Points > s.p1Points;

          return (
            <motion.div
              key={s.set}
              className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + index * 0.07, ease: EASE_CURVE }}
            >
              <span className="text-xs font-medium text-[#999999] w-12">Set {s.set}</span>

              {/* P1: count then bar */}
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm tabular-nums font-semibold w-6 ${
                    p1Wins ? "text-[#4A8AF4]" : "text-[#999999]"
                  }`}
                >
                  {s.p1Points}
                </span>
                <div className="flex-1 h-1.5 bg-[#F3F3F3] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#4A8AF4]"
                    initial={{ width: "0%" }}
                    animate={{ width: `${p1Pct}%` }}
                    transition={{ duration: 0.6, delay: 0.2 + index * 0.07, ease: EASE_CURVE }}
                  />
                </div>
              </div>

              {/* P2: count then bar */}
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm tabular-nums font-semibold w-6 ${
                    p2Wins ? "text-[#F38439]" : "text-[#999999]"
                  }`}
                >
                  {s.p2Points}
                </span>
                <div className="flex-1 h-1.5 bg-[#F3F3F3] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#F38439]"
                    initial={{ width: "0%" }}
                    animate={{ width: `${p2Pct}%` }}
                    transition={{ duration: 0.6, delay: 0.2 + index * 0.07, ease: EASE_CURVE }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Shared table header ─────────────────────────────────── */

function TableHeader({ p1Short, p2Short }: { p1Short: string; p2Short: string }) {
  return (
    <div className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] border-b border-[#F0F0F0] pb-2 mb-1">
      <span />
      <span className="text-[12px] font-medium text-[#0D0D0D] text-center whitespace-nowrap truncate">
        {p1Short}
      </span>
      <span className="text-[12px] font-medium text-[#0D0D0D] text-center whitespace-nowrap truncate">
        {p2Short}
      </span>
    </div>
  );
}

/* ── Pressure situations ─────────────────────────────────── */

function PressureSection({
  stats,
  p1Short,
  p2Short,
}: {
  stats: PressureStat[];
  p1Short: string;
  p2Short: string;
}) {
  const visible = stats.filter((s) => s.p1Total > 0 || s.p2Total > 0);
  if (visible.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-4">
        Pressure Situations
      </p>
      <TableHeader p1Short={p1Short} p2Short={p2Short} />
      {visible.map((s, index) => (
        <motion.div
          key={s.label}
          className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] items-center border-b border-[#F0F0F0] py-3"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 + index * 0.07, ease: EASE_CURVE }}
        >
          <span className="text-[12px] text-[#525252]">{s.label}</span>
          <div className="text-center">
            {s.p1Total > 0 ? (
              <>
                <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">{s.p1Won}</span>
                <span className="text-xs text-[#BBBBBB]">/{s.p1Total}</span>
              </>
            ) : (
              <span className="text-sm text-[#CCCCCC]">—</span>
            )}
          </div>
          <div className="text-center">
            {s.p2Total > 0 ? (
              <>
                <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">{s.p2Won}</span>
                <span className="text-xs text-[#BBBBBB]">/{s.p2Total}</span>
              </>
            ) : (
              <span className="text-sm text-[#CCCCCC]">—</span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Rally length ────────────────────────────────────────── */

function RallySection({
  buckets,
  p1Short,
  p2Short,
}: {
  buckets: RallyBucket[];
  p1Short: string;
  p2Short: string;
}) {
  const visible = buckets.filter((b) => b.hasData);
  if (visible.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-4">
        Rally Length Win %
      </p>
      <TableHeader p1Short={p1Short} p2Short={p2Short} />
      {visible.map((b, index) => {
        const p1Leads = b.p1WonPct > b.p2WonPct;
        const p2Leads = b.p2WonPct > b.p1WonPct;
        return (
          <motion.div
            key={b.label}
            className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] items-center border-b border-[#F0F0F0] py-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.07, ease: EASE_CURVE }}
          >
            <span className="text-[12px] text-[#525252]">{b.label}</span>

            <div className="text-center">
              <span
                className={`text-[13px] tabular-nums ${
                  p1Leads ? "font-medium text-[#4A8AF4]" : "text-[#525252]"
                }`}
              >
                {b.p1WonPct}%
              </span>
              <div className="mt-1.5 mx-auto w-16 h-1 rounded-full bg-[#F3F3F3] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#4A8AF4]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${b.p1WonPct}%` }}
                  transition={{ duration: 0.6, delay: 0.3 + index * 0.07, ease: EASE_CURVE }}
                />
              </div>
            </div>

            <div className="text-center">
              <span
                className={`text-[13px] tabular-nums ${
                  p2Leads ? "font-medium text-[#F38439]" : "text-[#525252]"
                }`}
              >
                {b.p2WonPct}%
              </span>
              <div className="mt-1.5 mx-auto w-16 h-1 rounded-full bg-[#F3F3F3] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#F38439]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${b.p2WonPct}%` }}
                  transition={{ duration: 0.6, delay: 0.3 + index * 0.07, ease: EASE_CURVE }}
                />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────── */

interface PerformanceTrackerProps {
  points: MatchPoint[];
  player1Name: string;
  player2Name: string;
}

export function PerformanceTracker({
  points,
  player1Name,
  player2Name,
}: PerformanceTrackerProps) {
  const p1Short = shortName(player1Name, 12);
  const p2Short = shortName(player2Name, 12);
  const prefersReducedMotion = useReducedMotion();

  const { momentumData, setSummaries, pressureStats, rallyBuckets } = useMemo(() => {
    // ── Momentum ──────────────────────────────
    let p1Cum = 0;
    let p2Cum = 0;
    const momentumData: MomentumPoint[] = points.map((pt, i) => {
      if (pt.wonByPlayer1) p1Cum++; else p2Cum++;
      return { index: i, diff: p1Cum - p2Cum, setNumber: pt.setNumber };
    });

    // ── Set breakdown ──────────────────────────
    const setMap = new Map<number, { p1: number; p2: number }>();
    for (const pt of points) {
      const entry = setMap.get(pt.setNumber) ?? { p1: 0, p2: 0 };
      if (pt.wonByPlayer1) entry.p1++; else entry.p2++;
      setMap.set(pt.setNumber, entry);
    }
    const setSummaries: SetStat[] = [...setMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([set, { p1, p2 }]) => ({ set, p1Points: p1, p2Points: p2 }));

    // ── Pressure situations ────────────────────
    // Break points: player wins a break point by winning the rally on opponent's serve
    const bpP1Won = points.filter((pt) => pt.isBreakPoint && !pt.serverIsPlayer1 && pt.wonByPlayer1).length;
    const bpP1Total = points.filter((pt) => pt.isBreakPoint && !pt.serverIsPlayer1).length;
    const bpP2Won = points.filter((pt) => pt.isBreakPoint && pt.serverIsPlayer1 && !pt.wonByPlayer1).length;
    const bpP2Total = points.filter((pt) => pt.isBreakPoint && pt.serverIsPlayer1).length;

    const spPts = points.filter((pt) => pt.isSetPoint);
    const spP1Won = spPts.filter((pt) => pt.wonByPlayer1).length;
    const spP2Won = spPts.filter((pt) => !pt.wonByPlayer1).length;

    const mpPts = points.filter((pt) => pt.isMatchPoint);
    const mpP1Won = mpPts.filter((pt) => pt.wonByPlayer1).length;
    const mpP2Won = mpPts.filter((pt) => !pt.wonByPlayer1).length;

    const pressureStats: PressureStat[] = [
      { label: "Break Points Won", p1Won: bpP1Won, p1Total: bpP1Total, p2Won: bpP2Won, p2Total: bpP2Total },
      { label: "Set Points Won", p1Won: spP1Won, p1Total: spPts.length, p2Won: spP2Won, p2Total: spPts.length },
      ...(mpPts.length > 0
        ? [{ label: "Match Points Won", p1Won: mpP1Won, p1Total: mpPts.length, p2Won: mpP2Won, p2Total: mpPts.length }]
        : []),
    ];

    // ── Rally length buckets ───────────────────
    function calcBucket(filter: (pt: MatchPoint) => boolean): Omit<RallyBucket, "label"> {
      const pts = points.filter(filter);
      if (pts.length === 0) return { p1WonPct: 0, p2WonPct: 0, hasData: false };
      const p1Won = pts.filter((pt) => pt.wonByPlayer1).length;
      return {
        p1WonPct: Math.round((p1Won / pts.length) * 100),
        p2WonPct: Math.round(((pts.length - p1Won) / pts.length) * 100),
        hasData: true,
      };
    }

    const rallyBuckets: RallyBucket[] = [
      { label: "Short (1–4 shots)", ...calcBucket((pt) => pt.rallyLength >= 1 && pt.rallyLength <= 4) },
      { label: "Medium (5–9 shots)", ...calcBucket((pt) => pt.rallyLength >= 5 && pt.rallyLength <= 9) },
      { label: "Long (10+ shots)", ...calcBucket((pt) => pt.rallyLength >= 10) },
    ];

    return { momentumData, setSummaries, pressureStats, rallyBuckets };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5">
        <h2 className="text-lg font-semibold text-[#0D0D0D] mb-6">Performance Tracker</h2>
        <p className="text-sm text-[#999999] text-center">
          Point data not available for this match.
        </p>
      </div>
    );
  }

  const sectionVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, delay: i * 0.07, ease: EASE_CURVE },
    }),
  };

  return (
    <motion.div
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: EASE_CURVE }}
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#0D0D0D]">Performance Tracker</h2>
        <p className="text-sm text-[#999999] mt-1">
          {player1Name} vs {player2Name}
        </p>
      </div>

      <motion.div
        custom={0}
        initial="hidden"
        animate="visible"
        variants={sectionVariants}
      >
        <MomentumChart data={momentumData} p1Short={p1Short} p2Short={p2Short} />
      </motion.div>

      <div className="h-px bg-[#F0F0F0] my-5" />

      <motion.div
        custom={1}
        initial="hidden"
        animate="visible"
        variants={sectionVariants}
      >
        <SetBreakdown sets={setSummaries} p1Short={p1Short} p2Short={p2Short} />
      </motion.div>

      <div className="h-px bg-[#F0F0F0] my-5" />

      <motion.div
        custom={2}
        initial="hidden"
        animate="visible"
        variants={sectionVariants}
      >
        <PressureSection stats={pressureStats} p1Short={p1Short} p2Short={p2Short} />
      </motion.div>

      <div className="h-px bg-[#F0F0F0] my-5" />

      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={sectionVariants}
      >
        <RallySection buckets={rallyBuckets} p1Short={p1Short} p2Short={p2Short} />
      </motion.div>
    </motion.div>
  );
}
