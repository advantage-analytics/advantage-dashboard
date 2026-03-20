"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { shortName } from "@/lib/data/match-utils";

/* ── Constants ───────────────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#F38439";
const P1_LINE_COLOR = "#3570D4";
const P2_LINE_COLOR = "#D06A20";
const CHART_W = 600;
const CHART_H = 140;

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

/* ── Smooth curve helper (Catmull-Rom → cubic Bezier) ──── */

function toSmoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/* ── Break detection ─────────────────────────────────────── */

interface BreakInfo {
  index: number;
  brokenPlayer1: boolean;
}

function detectBreaks(points: MatchPoint[]): BreakInfo[] {
  const breaks: BreakInfo[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.gameNumber !== prev.gameNumber || curr.setNumber !== prev.setNumber) {
      const serverWon = prev.serverIsPlayer1 ? prev.wonByPlayer1 : !prev.wonByPlayer1;
      if (!serverWon) {
        breaks.push({ index: i - 1, brokenPlayer1: prev.serverIsPlayer1 });
      }
    }
  }
  return breaks;
}

/* ── Momentum chart ──────────────────────────────────────── */

function MomentumChart({
  data,
  rawPoints,
  p1Short,
  p2Short,
}: {
  data: MomentumPoint[];
  rawPoints: MatchPoint[];
  p1Short: string;
  p2Short: string;
}) {
  const uid = useId();
  const clipAbove = `momentum-above-${uid}`;
  const clipBelow = `momentum-below-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg || data.length < 2) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * CHART_W;
      const idx = Math.round((mouseX / CHART_W) * (data.length - 1));
      setHoveredIndex(Math.max(0, Math.min(data.length - 1, idx)));
    },
    [data],
  );

  const handleMouseLeave = useCallback(() => setHoveredIndex(null), []);

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

  // Break indices
  const breakIndices = detectBreaks(rawPoints);

  // Coordinate pairs for smooth path
  const coords: [number, number][] = data.map((d, i) => [xScale(i), yScale(d.diff)]);
  const smoothLine = toSmoothPath(coords);

  // Area path (smooth curve closing to baseline)
  const areaPath = smoothLine + ` L ${xScale(data.length - 1)},${yMid} L ${xScale(0)},${yMid} Z`;

  // Tooltip data
  const hoveredPt = hoveredIndex !== null ? rawPoints[hoveredIndex] : null;
  const hoveredCoord = hoveredIndex !== null ? coords[hoveredIndex] : null;

  return (
    <div>
      <p className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px] mb-3">
        Point Momentum
      </p>

      <div className="relative overflow-visible">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ height: 140 }}
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
              key={`set-${i}`}
              x1={xScale(idx)}
              y1={0}
              x2={xScale(idx)}
              y2={CHART_H}
              stroke="#E8E8E8"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ))}

          {/* Break of serve indicators */}
          {breakIndices.map((b, i) => (
            <line
              key={`break-${i}`}
              x1={xScale(b.index)}
              y1={0}
              x2={xScale(b.index)}
              y2={CHART_H}
              stroke="#E53E3E"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          ))}

          {/* Zero baseline */}
          <line x1={0} y1={yMid} x2={CHART_W} y2={yMid} stroke="#EBEBEB" strokeWidth={1} />

          {/* P1 leading fill (blue, above baseline) */}
          <path d={areaPath} fill={P1_COLOR} fillOpacity={0.12} clipPath={`url(#${clipAbove})`} />

          {/* P2 leading fill (orange, below baseline) */}
          <path d={areaPath} fill={P2_COLOR} fillOpacity={0.12} clipPath={`url(#${clipBelow})`} />

          {/* Momentum line — blue above baseline */}
          <path
            d={smoothLine}
            fill="none"
            stroke={P1_LINE_COLOR}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath={`url(#${clipAbove})`}
          />

          {/* Momentum line — orange below baseline */}
          <path
            d={smoothLine}
            fill="none"
            stroke={P2_LINE_COLOR}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath={`url(#${clipBelow})`}
          />

          {/* Hover guide line (vertical lines render correctly even with preserveAspectRatio=none) */}
          {hoveredIndex !== null && hoveredCoord && (
            <line
              x1={hoveredCoord[0]}
              y1={0}
              x2={hoveredCoord[0]}
              y2={CHART_H}
              stroke={data[hoveredIndex].diff >= 0 ? P1_LINE_COLOR : P2_LINE_COLOR}
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
          )}

          {/* Invisible overlay rect for mouse events */}
          <rect
            x={0}
            y={0}
            width={CHART_W}
            height={CHART_H}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        </svg>

        {/* Hover dot — rendered in HTML to avoid SVG aspect-ratio distortion */}
        {hoveredIndex !== null && hoveredCoord && (() => {
          const dotColor = data[hoveredIndex].diff >= 0 ? P1_LINE_COLOR : P2_LINE_COLOR;
          return (
            <div
              className="absolute pointer-events-none z-[5]"
              style={{
                left: `${(hoveredCoord[0] / CHART_W) * 100}%`,
                top: `${(hoveredCoord[1] / CHART_H) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {/* Glow ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  width: 18,
                  height: 18,
                  margin: "-9px 0 0 -9px",
                  left: "50%",
                  top: "50%",
                  background: dotColor,
                  opacity: 0.1,
                }}
              />
              {/* Solid dot */}
              <div
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: dotColor,
                  boxShadow: `0 0 0 2px #fff, 0 0 8px ${dotColor}40`,
                }}
              />
            </div>
          );
        })()}

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredIndex !== null && hoveredPt && hoveredCoord && (() => {
            const accentColor = hoveredPt.wonByPlayer1 ? P1_COLOR : P2_COLOR;
            const xPct = (hoveredCoord[0] / CHART_W) * 100;
            const yPct = (hoveredCoord[1] / CHART_H) * 100;
            // Position tooltip above the point; flip below if in upper 25% of chart
            const showBelow = hoveredCoord[1] < CHART_H * 0.25;
            // Horizontal alignment: shift tooltip to avoid clipping at edges
            const translateX = hoveredCoord[0] > CHART_W * 0.8 ? "-92%" : hoveredCoord[0] < CHART_W * 0.2 ? "-8%" : "-50%";
            // Caret offset mirrors tooltip alignment
            const caretLeft = hoveredCoord[0] > CHART_W * 0.8 ? "92%" : hoveredCoord[0] < CHART_W * 0.2 ? "8%" : "50%";
            const durationSec = hoveredPt.duration != null ? hoveredPt.duration : null;
            const pressureLabel = hoveredPt.isMatchPoint ? "Match Point" : hoveredPt.isSetPoint ? "Set Point" : hoveredPt.isBreakPoint ? "Break Point" : null;

            return (
              <motion.div
                key="momentum-tooltip"
                initial={{ opacity: 0, y: showBelow ? -3 : 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: showBelow ? -3 : 3 }}
                transition={{ duration: 0.12, ease: [0.2, 0, 0.4, 1] }}
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: `translateX(${translateX}) translateY(${showBelow ? "12px" : "calc(-100% - 12px)"})`,
                }}
              >
                <div
                  className="relative rounded-lg overflow-hidden"
                  style={{
                    background: "rgba(15, 17, 21, 0.92)",
                    backdropFilter: "blur(16px)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12)",
                    minWidth: 172,
                  }}
                >
                  {/* Top accent line */}
                  <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88 70%, transparent)` }} />

                  {/* Primary: score + context */}
                  <div className="px-3 pt-2 pb-1.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[15px] font-semibold tabular-nums text-white tracking-tight leading-none">
                        {hoveredPt.pointScore}
                      </span>
                      {pressureLabel && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider leading-none px-1.5 py-[3px] rounded"
                          style={{
                            color: accentColor,
                            background: `${accentColor}18`,
                            border: `1px solid ${accentColor}30`,
                          }}
                        >
                          {pressureLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-medium text-white/40 tracking-wider">
                        Set {hoveredPt.setNumber}{hoveredPt.gameScore ? ` ${hoveredPt.gameScore}` : ""}
                      </span>
                      {durationSec !== null && (
                        <>
                          <span className="text-white/20 text-[10px]">/</span>
                          <span className="text-[10px] tabular-nums text-white/40 font-medium">
                            {Math.floor(durationSec / 60)}:{String(Math.round(durationSec % 60)).padStart(2, "0")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px mx-2.5" style={{ background: "rgba(255,255,255,0.06)" }} />

                  {/* Secondary: winner, server, rally, game score */}
                  <div className="px-3 pt-1.5 pb-2 flex flex-col gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium" style={{ color: accentColor }}>
                        {hoveredPt.wonByPlayer1 ? p1Short : p2Short} won point
                      </span>
                      <span className="text-[10px] text-white/30 font-medium">
                        {hoveredPt.serverIsPlayer1 ? p1Short : p2Short} serving
                      </span>
                    </div>
                    {hoveredPt.rallyLength > 0 && (
                      <span className="text-[10px] tabular-nums text-white/45 font-medium">
                        {hoveredPt.rallyLength} shot{hoveredPt.rallyLength !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Caret — inline SVG to avoid CSS transform conflicts */}
                <div
                  className="absolute"
                  style={{
                    left: caretLeft,
                    transform: "translateX(-50%)",
                    ...(showBelow ? { top: -5 } : { bottom: -5 }),
                  }}
                >
                  <svg
                    width="10"
                    height="5"
                    viewBox="0 0 10 5"
                    fill="none"
                    style={showBelow ? { transform: "rotate(180deg)" } : undefined}
                  >
                    <path
                      d="M4.168 .445a1 1 0 0 1 1.664 0L8.618 5H1.382L4.168.445Z"
                      fill={showBelow ? accentColor : "rgba(15, 17, 21, 0.92)"}
                    />
                  </svg>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

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
      <div className="flex items-center justify-center gap-5 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P1_COLOR, opacity: 0.6 }} />
          <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">{p1Short} leading</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P2_COLOR, opacity: 0.6 }} />
          <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">{p2Short} leading</span>
        </div>
        {breakIndices.length > 0 && (
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" className="shrink-0">
              <line x1={0} y1={5} x2={10} y2={5} stroke="#E53E3E" strokeWidth={1.5} strokeDasharray="2 1.5" />
            </svg>
            <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">Break of Serve</span>
          </div>
        )}
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
    <div className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#999999] mb-4">
        Points Per Set
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 mb-3">
        <div className="w-12" />
        <span className="text-xs font-semibold text-[#4A8AF4] whitespace-nowrap truncate">
          {p1Short}
        </span>
        <span className="text-xs font-semibold text-[#F38439] whitespace-nowrap truncate">
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
                <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
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
                <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
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
    <div className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] border-b border-[#E8E8E8] pb-2 mb-1">
      <span />
      <span className="text-xs font-semibold text-[#4A8AF4] text-center whitespace-nowrap truncate">
        {p1Short}
      </span>
      <span className="text-xs font-semibold text-[#F38439] text-center whitespace-nowrap truncate">
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
    <div className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#999999] mb-4">
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
          <span className="text-sm text-[#333333]">{s.label}</span>
          <div className="text-center">
            {s.p1Total > 0 ? (
              <>
                <span className="text-sm tabular-nums font-semibold text-[#4A8AF4]">{s.p1Won}</span>
                <span className="text-xs text-[#BBBBBB]">/{s.p1Total}</span>
              </>
            ) : (
              <span className="text-sm text-[#CCCCCC]">—</span>
            )}
          </div>
          <div className="text-center">
            {s.p2Total > 0 ? (
              <>
                <span className="text-sm tabular-nums font-semibold text-[#F38439]">{s.p2Won}</span>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#999999] mb-4">
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
            <span className="text-sm text-[#333333]">{b.label}</span>

            <div className="text-center">
              <span
                className={`text-sm tabular-nums ${
                  p1Leads ? "font-semibold text-[#4A8AF4]" : "text-[#666666]"
                }`}
              >
                {b.p1WonPct}%
              </span>
              <div className="mt-1.5 mx-auto w-16 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
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
                className={`text-sm tabular-nums ${
                  p2Leads ? "font-semibold text-[#F38439]" : "text-[#666666]"
                }`}
              >
                {b.p2WonPct}%
              </span>
              <div className="mt-1.5 mx-auto w-16 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
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
  const p1Short = shortName(player1Name, 18);
  const p2Short = shortName(player2Name, 18);

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
      <div className="bg-white p-6 rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
        <h2 className="text-base font-medium text-[#0D0D0D] mb-6">Performance Tracker</h2>
        <p className="text-sm text-[#999999] text-center">
          Point data not available for this match.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="bg-white p-6 rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: EASE_CURVE }}
    >
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-base font-medium text-[#0D0D0D]">Performance Tracker</h2>
        <p className="text-xs text-[#999999] mt-1">
          Game-by-game momentum tracking throughout the match
        </p>
      </div>

      <MomentumChart data={momentumData} rawPoints={points} p1Short={p1Short} p2Short={p2Short} />
    </motion.div>
  );
}
