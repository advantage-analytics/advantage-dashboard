"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  setNumber: number;
}

function detectBreaks(points: MatchPoint[]): BreakInfo[] {
  const breaks: BreakInfo[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.gameNumber !== prev.gameNumber || curr.setNumber !== prev.setNumber) {
      const serverWon = prev.serverIsPlayer1 ? prev.wonByPlayer1 : !prev.wonByPlayer1;
      if (!serverWon) {
        breaks.push({
          index: i - 1,
          brokenPlayer1: prev.serverIsPlayer1,
          setNumber: prev.setNumber,
        });
      }
    }
  }
  return breaks;
}

/* ── Set filter chips ────────────────────────────────────── */

function SetFilterChips({
  sets,
  activeSet,
  onSetChange,
}: {
  sets: number[];
  activeSet: number | null;
  onSetChange: (set: number | null) => void;
}) {
  if (sets.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 mb-5" role="group" aria-label="Filter by set">
      <button
        onClick={() => onSetChange(null)}
        className={`h-7 px-3 rounded-full text-[10px] font-medium uppercase tracking-[1.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
          activeSet === null
            ? "bg-[#0A0A0C] text-white"
            : "bg-[#F5F5F5] text-[#888888] hover:bg-[#EBEBEB] hover:text-[#666666]"
        }`}
      >
        All Sets
      </button>
      {sets.map((s) => (
        <button
          key={s}
          onClick={() => onSetChange(s)}
          className={`h-7 px-3 rounded-full text-[10px] font-medium uppercase tracking-[1.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
            activeSet === s
              ? "bg-[#0A0A0C] text-white"
              : "bg-[#F5F5F5] text-[#888888] hover:bg-[#EBEBEB] hover:text-[#666666]"
          }`}
        >
          Set {s}
        </button>
      ))}
    </div>
  );
}

/* ── Momentum chart ──────────────────────────────────────── */

export function MomentumChart({
  data,
  rawPoints,
  p1Short,
  p2Short,
  hideHeading = false,
  activeSet,
  onSetChange,
  allSets,
}: {
  data: MomentumPoint[];
  rawPoints: MatchPoint[];
  p1Short: string;
  p2Short: string;
  hideHeading?: boolean;
  activeSet?: number | null;
  onSetChange?: (set: number | null) => void;
  allSets?: number[];
}) {
  const uid = useId();
  const clipAbove = `momentum-above-${uid}`;
  const clipBelow = `momentum-below-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);

  const selectFromClientX = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || data.length < 2) return;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * CHART_W;
      const idx = Math.round((x / CHART_W) * (data.length - 1));
      setIsKeyboardNav(false);
      setSelectedIndex(Math.max(0, Math.min(data.length - 1, idx)));
    },
    [data],
  );

  const handleMouseLeave = useCallback(() => {
    if (!isKeyboardNav) setSelectedIndex(null);
  }, [isKeyboardNav]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (data.length < 2) return;
      const current = selectedIndex ?? -1;
      let next: number | null = null;

      if (e.key === "ArrowRight") {
        next = Math.min(current + 1, data.length - 1);
      } else if (e.key === "ArrowLeft") {
        next = Math.max(current - 1, 0);
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = data.length - 1;
      } else if (e.key === "Escape") {
        setIsKeyboardNav(false);
        setSelectedIndex(null);
        e.preventDefault();
        return;
      }

      if (next !== null) {
        e.preventDefault();
        setIsKeyboardNav(true);
        setSelectedIndex(next);
      }
    },
    [data, selectedIndex],
  );

  if (data.length < 2) {
    return hideHeading ? null : (
      <div className="h-[140px] bg-[#FAFAFA] rounded-lg animate-pulse" />
    );
  }

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

  // Break indices (rawPoints is already set-filtered by parent when activeSet is set)
  const breakIndices = detectBreaks(rawPoints);

  // Coordinate pairs for smooth path
  const coords: [number, number][] = data.map((d, i) => [xScale(i), yScale(d.diff)]);
  const smoothLine = toSmoothPath(coords);

  // Area path (smooth curve closing to baseline)
  const areaPath = smoothLine + ` L ${xScale(data.length - 1)},${yMid} L ${xScale(0)},${yMid} Z`;

  // Tooltip data
  const selectedPt = selectedIndex !== null ? rawPoints[selectedIndex] : null;
  const selectedCoord = selectedIndex !== null ? coords[selectedIndex] : null;

  // Y-axis tick values
  const yTicks: number[] = [];
  if (maxAbs >= 3) {
    const step = maxAbs >= 10 ? 5 : maxAbs >= 6 ? 3 : 2;
    for (let v = step; v <= maxAbs; v += step) {
      yTicks.push(v);
      yTicks.push(-v);
    }
  }

  // Aria description for selected point
  const ariaDescription = selectedPt
    ? `${selectedPt.wonByPlayer1 ? p1Short : p2Short} won point. Score: ${selectedPt.pointScore}. Set ${selectedPt.setNumber}${selectedPt.gameScore ? `, ${selectedPt.gameScore}` : ""}. ${selectedPt.rallyLength > 0 ? `${selectedPt.rallyLength} shots.` : ""} ${selectedPt.isMatchPoint ? "Match point." : selectedPt.isSetPoint ? "Set point." : selectedPt.isBreakPoint ? "Break point." : ""}`
    : "";

  return (
    <div>
      {!hideHeading && (
        <p className="text-[12px] font-medium text-[#525252] tracking-[0.3px] mb-4">
          Point Momentum
        </p>
      )}

      {/* Set filter chips */}
      {!hideHeading && allSets && onSetChange && (
        <SetFilterChips
          sets={allSets}
          activeSet={activeSet ?? null}
          onSetChange={onSetChange}
        />
      )}

      {/* Aria live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {ariaDescription}
      </div>

      <div
        className="relative overflow-visible"
        role="figure"
        aria-label={`Point momentum chart. ${p1Short} vs ${p2Short}. ${data.length} points.`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (isKeyboardNav) {
            setIsKeyboardNav(false);
            setSelectedIndex(null);
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ height: 140 }}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipAbove}>
              <rect x={0} y={0} width={CHART_W} height={yMid} />
            </clipPath>
            <clipPath id={clipBelow}>
              <rect x={0} y={yMid} width={CHART_W} height={CHART_H} />
            </clipPath>
          </defs>

          {/* Y-axis reference lines */}
          {yTicks.map((v) => (
            <line
              key={`ytick-${v}`}
              x1={0}
              y1={yScale(v)}
              x2={CHART_W}
              y2={yScale(v)}
              stroke="#F5F5F5"
              strokeWidth={0.5}
            />
          ))}

          {/* Set dividers */}
          {dividers.map((idx, i) => (
            <line
              key={`set-${i}`}
              x1={xScale(idx)}
              y1={0}
              x2={xScale(idx)}
              y2={CHART_H}
              stroke="#F0F0F0"
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
              stroke="#E51837"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          ))}

          {/* Zero baseline */}
          <line x1={0} y1={yMid} x2={CHART_W} y2={yMid} stroke="#F0F0F0" strokeWidth={1} />

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

          {/* Hover guide line */}
          {selectedIndex !== null && selectedCoord && (
            <line
              x1={selectedCoord[0]}
              y1={0}
              x2={selectedCoord[0]}
              y2={CHART_H}
              stroke={data[selectedIndex].diff >= 0 ? P1_LINE_COLOR : P2_LINE_COLOR}
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
          )}

          {/* Invisible overlay rect for mouse/touch events */}
          <rect
            x={0}
            y={0}
            width={CHART_W}
            height={CHART_H}
            fill="transparent"
            onMouseMove={(e) => selectFromClientX(e.clientX)}
            onMouseLeave={handleMouseLeave}
            onTouchMove={(e) => e.touches[0] && selectFromClientX(e.touches[0].clientX)}
            onTouchEnd={() => { if (!isKeyboardNav) setSelectedIndex(null); }}
          />
        </svg>

        {/* Y-axis labels — rendered in HTML to avoid SVG distortion */}
        {yTicks.map((v) => {
          const yPct = (yScale(v) / CHART_H) * 100;
          return (
            <span
              key={`ylabel-${v}`}
              className="absolute left-0 text-[9px] tabular-nums text-[#CCCCCC] font-normal pointer-events-none -translate-y-1/2"
              style={{ top: `${yPct}%` }}
            >
              {v > 0 ? `+${v}` : v}
            </span>
          );
        })}

        {/* Hover dot — rendered in HTML to avoid SVG aspect-ratio distortion */}
        {selectedIndex !== null && selectedCoord && (() => {
          const dotColor = data[selectedIndex].diff >= 0 ? P1_LINE_COLOR : P2_LINE_COLOR;
          return (
            <div
              className="absolute pointer-events-none z-[5] size-[7px] rounded-full"
              style={{
                left: `${(selectedCoord[0] / CHART_W) * 100}%`,
                top: `${(selectedCoord[1] / CHART_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                background: dotColor,
                boxShadow: `0 0 0 2px #fff, 0 0 8px ${dotColor}40, 0 0 0 5.5px ${dotColor}1a`,
              }}
            />
          );
        })()}

        {/* Tooltip */}
        <AnimatePresence>
          {selectedIndex !== null && selectedPt && selectedCoord && (() => {
            const accentColor = selectedPt.wonByPlayer1 ? P1_COLOR : P2_COLOR;
            const xPct = (selectedCoord[0] / CHART_W) * 100;
            const yPct = (selectedCoord[1] / CHART_H) * 100;
            const showBelow = selectedCoord[1] < CHART_H * 0.25;
            const translateX = selectedCoord[0] > CHART_W * 0.8 ? "-92%" : selectedCoord[0] < CHART_W * 0.2 ? "-8%" : "-50%";
            const durationSec = selectedPt.duration != null ? selectedPt.duration : null;
            const pressureLabel = selectedPt.isMatchPoint ? "Match Point" : selectedPt.isSetPoint ? "Set Point" : selectedPt.isBreakPoint ? "Break Point" : null;

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
                        {selectedPt.pointScore}
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
                        Set {selectedPt.setNumber}{selectedPt.gameScore ? ` ${selectedPt.gameScore}` : ""}
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

                  {/* Secondary: winner, server, rally */}
                  <div className="px-3 pt-1.5 pb-2 flex flex-col gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium" style={{ color: accentColor }}>
                        {selectedPt.wonByPlayer1 ? p1Short : p2Short} won point
                      </span>
                      <span className="text-[10px] text-white/30 font-medium">
                        {selectedPt.serverIsPlayer1 ? p1Short : p2Short} serving
                      </span>
                    </div>
                    {selectedPt.rallyLength > 0 && (
                      <span className="text-[10px] tabular-nums text-white/45 font-medium">
                        {selectedPt.rallyLength} shot{selectedPt.rallyLength !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
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
              className="absolute text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px] -translate-x-1/2"
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
          <div className="size-2.5 rounded-[6px]" style={{ backgroundColor: P1_COLOR, opacity: 0.6 }} />
          <span className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[2px]">{p1Short} leading</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-[6px]" style={{ backgroundColor: P2_COLOR, opacity: 0.6 }} />
          <span className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[2px]">{p2Short} leading</span>
        </div>
        {breakIndices.length > 0 && (
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" className="shrink-0" aria-hidden="true">
              <line x1={0} y1={5} x2={10} y2={5} stroke="#E51837" strokeWidth={1.5} strokeDasharray="2 1.5" />
            </svg>
            <span className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[2px]">Break of Serve</span>
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
    <div>
      <p className="text-[12px] font-medium text-[#525252] tracking-[0.3px] mb-5">
        Points Per Set
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 mb-3">
        <div className="w-12" />
        <span className="text-[11px] font-medium text-[#4A8AF4] whitespace-nowrap truncate">
          {p1Short}
        </span>
        <span className="text-[11px] font-medium text-[#F38439] whitespace-nowrap truncate">
          {p2Short}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
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
              <span className="text-[11px] font-medium text-[#888888] w-12">Set {s.set}</span>

              {/* P1: count then bar */}
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[14px] tabular-nums font-medium w-7 ${
                    p1Wins ? "text-[#4A8AF4]" : "text-[#888888]"
                  }`}
                >
                  {s.p1Points}
                </span>
                <div className="flex-1 h-[5px] bg-[#F0F0F0] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#4A8AF4]"
                    initial={{ width: "0%" }}
                    animate={{ width: `${p1Pct}%` }}
                    transition={{ duration: 0.6, delay: 0.2 + index * 0.07, ease: EASE_CURVE }}
                  />
                </div>
              </div>

              {/* P2: count then bar */}
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[14px] tabular-nums font-medium w-7 ${
                    p2Wins ? "text-[#F38439]" : "text-[#888888]"
                  }`}
                >
                  {s.p2Points}
                </span>
                <div className="flex-1 h-[5px] bg-[#F0F0F0] rounded-full overflow-hidden">
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
    <div className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] pb-2.5 mb-1">
      <span />
      <span className="text-[11px] font-medium text-[#4A8AF4] text-center whitespace-nowrap truncate">
        {p1Short}
      </span>
      <span className="text-[11px] font-medium text-[#F38439] text-center whitespace-nowrap truncate">
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
      <p className="text-[12px] font-medium text-[#525252] tracking-[0.3px] mb-5" title="Conversion rates on break points, set points, and match points">
        Pressure Situations
      </p>
      <TableHeader p1Short={p1Short} p2Short={p2Short} />
      {visible.map((s, index) => {
        const p1Pct = s.p1Total > 0 ? Math.round((s.p1Won / s.p1Total) * 100) : 0;
        const p2Pct = s.p2Total > 0 ? Math.round((s.p2Won / s.p2Total) * 100) : 0;
        const p1Leads = p1Pct > p2Pct;
        const p2Leads = p2Pct > p1Pct;

        return (
          <motion.div
            key={s.label}
            className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] items-center py-3 first:pt-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.07, ease: EASE_CURVE }}
          >
            <span className="text-[12px] text-[#888888]">{s.label}</span>
            <div className="text-center flex flex-col items-center gap-1">
              {s.p1Total > 0 ? (
                <>
                  <span className={`text-[14px] tabular-nums font-medium ${p1Leads ? "text-[#4A8AF4]" : "text-[#525252]"}`}>
                    {p1Pct}%
                  </span>
                  <span className="text-[10px] tabular-nums text-[#BBBBBB]">
                    {s.p1Won}/{s.p1Total}
                  </span>
                </>
              ) : (
                <span className="text-[13px] text-[#CCCCCC]">—</span>
              )}
            </div>
            <div className="text-center flex flex-col items-center gap-1">
              {s.p2Total > 0 ? (
                <>
                  <span className={`text-[14px] tabular-nums font-medium ${p2Leads ? "text-[#F38439]" : "text-[#525252]"}`}>
                    {p2Pct}%
                  </span>
                  <span className="text-[10px] tabular-nums text-[#BBBBBB]">
                    {s.p2Won}/{s.p2Total}
                  </span>
                </>
              ) : (
                <span className="text-[13px] text-[#CCCCCC]">—</span>
              )}
            </div>
          </motion.div>
        );
      })}
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
      <p className="text-[12px] font-medium text-[#525252] tracking-[0.3px] mb-5" title="Win percentage grouped by how many shots were in the rally">
        Rally Length Win %
      </p>
      <TableHeader p1Short={p1Short} p2Short={p2Short} />
      {visible.map((b, index) => {
        const p1Leads = b.p1WonPct > b.p2WonPct;
        const p2Leads = b.p2WonPct > b.p1WonPct;
        return (
          <motion.div
            key={b.label}
            className="grid grid-cols-[1fr_130px_130px] sm:grid-cols-[1fr_150px_150px] items-center py-3 first:pt-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.07, ease: EASE_CURVE }}
          >
            <span className="text-[12px] text-[#888888]">{b.label}</span>

            <div className="text-center flex flex-col items-center gap-1">
              <span
                className={`text-[14px] tabular-nums ${
                  p1Leads ? "font-medium text-[#4A8AF4]" : "text-[#525252]"
                }`}
              >
                {b.p1WonPct}%
              </span>
              <div className="w-16 h-[3px] rounded-full bg-[#F0F0F0] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[#4A8AF4]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${b.p1WonPct}%` }}
                  transition={{ duration: 0.6, delay: 0.3 + index * 0.07, ease: EASE_CURVE }}
                />
              </div>
            </div>

            <div className="text-center flex flex-col items-center gap-1">
              <span
                className={`text-[14px] tabular-nums ${
                  p2Leads ? "font-medium text-[#F38439]" : "text-[#525252]"
                }`}
              >
                {b.p2WonPct}%
              </span>
              <div className="w-16 h-[3px] rounded-full bg-[#F0F0F0] overflow-hidden">
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
  matchId?: string;
}

export function PerformanceTracker({
  points,
  player1Name,
  player2Name,
  matchId,
}: PerformanceTrackerProps) {
  const p1Short = shortName(player1Name, 18);
  const p2Short = shortName(player2Name, 18);
  const prefersReducedMotion = useReducedMotion();
  const [activeSet, setActiveSet] = useState<number | null>(null);

  const { allSets, filteredMomentumData, filteredPoints, setSummaries, pressureStats, rallyBuckets } = useMemo(() => {
    const allSets = [...new Set(points.map((pt) => pt.setNumber))].sort((a, b) => a - b);

    const filteredPoints = activeSet != null
      ? points.filter((pt) => pt.setNumber === activeSet)
      : points;

    // ── Filtered momentum ────────────────────
    let p1Cum = 0;
    let p2Cum = 0;
    const filteredMomentumData: MomentumPoint[] = filteredPoints.map((pt, i) => {
      if (pt.wonByPlayer1) p1Cum++; else p2Cum++;
      return { diff: p1Cum - p2Cum, setNumber: pt.setNumber };
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

    // ── Pressure situations (fixed per-player totals) ──
    const bpP1Won = filteredPoints.filter((pt) => pt.isBreakPoint && !pt.serverIsPlayer1 && pt.wonByPlayer1).length;
    const bpP1Total = filteredPoints.filter((pt) => pt.isBreakPoint && !pt.serverIsPlayer1).length;
    const bpP2Won = filteredPoints.filter((pt) => pt.isBreakPoint && pt.serverIsPlayer1 && !pt.wonByPlayer1).length;
    const bpP2Total = filteredPoints.filter((pt) => pt.isBreakPoint && pt.serverIsPlayer1).length;

    // Set points — each player's opportunities counted separately
    const spForP1 = filteredPoints.filter((pt) => pt.isSetPoint && !pt.serverIsPlayer1);
    const spForP2 = filteredPoints.filter((pt) => pt.isSetPoint && pt.serverIsPlayer1);
    const spP1Won = spForP1.filter((pt) => pt.wonByPlayer1).length;
    const spP2Won = spForP2.filter((pt) => !pt.wonByPlayer1).length;

    // Match points — each player's opportunities counted separately
    const mpForP1 = filteredPoints.filter((pt) => pt.isMatchPoint && !pt.serverIsPlayer1);
    const mpForP2 = filteredPoints.filter((pt) => pt.isMatchPoint && pt.serverIsPlayer1);
    const mpP1Won = mpForP1.filter((pt) => pt.wonByPlayer1).length;
    const mpP2Won = mpForP2.filter((pt) => !pt.wonByPlayer1).length;

    const pressureStats: PressureStat[] = [
      { label: "Break Points Won", p1Won: bpP1Won, p1Total: bpP1Total, p2Won: bpP2Won, p2Total: bpP2Total },
      { label: "Set Points Won", p1Won: spP1Won, p1Total: spForP1.length, p2Won: spP2Won, p2Total: spForP2.length },
      ...((mpForP1.length > 0 || mpForP2.length > 0)
        ? [{ label: "Match Points Won", p1Won: mpP1Won, p1Total: mpForP1.length, p2Won: mpP2Won, p2Total: mpForP2.length }]
        : []),
    ];

    // ── Rally length buckets ───────────────────
    function calcBucket(filter: (pt: MatchPoint) => boolean): Omit<RallyBucket, "label"> {
      const pts = filteredPoints.filter(filter);
      if (pts.length === 0) return { p1WonPct: 0, p2WonPct: 0, hasData: false };
      const p1Won = pts.filter((pt) => pt.wonByPlayer1).length;
      return {
        p1WonPct: Math.round((p1Won / pts.length) * 100),
        p2WonPct: Math.round(((pts.length - p1Won) / pts.length) * 100),
        hasData: true,
      };
    }

    const rallyBuckets: RallyBucket[] = [
      { label: "Short (1\u20134 shots)", ...calcBucket((pt) => pt.rallyLength >= 1 && pt.rallyLength <= 4) },
      { label: "Medium (5\u20139 shots)", ...calcBucket((pt) => pt.rallyLength >= 5 && pt.rallyLength <= 9) },
      { label: "Long (10+ shots)", ...calcBucket((pt) => pt.rallyLength >= 10) },
    ];

    return { allSets, filteredMomentumData, filteredPoints, setSummaries, pressureStats, rallyBuckets };
  }, [points, activeSet]);

  const sectionAnimate = { opacity: 1, y: 0 };
  const sectionInitial = prefersReducedMotion ? sectionAnimate : { opacity: 0, y: 12 };

  if (points.length === 0) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <p className="text-[13px] text-[#888888]">
          Point-level data isn&apos;t available for this match.
        </p>
        <p className="text-[12px] text-[#BBBBBB] max-w-[320px]">
          This match may have been uploaded before point tracking was supported, or the data is still processing.
        </p>
        {matchId && (
          <Link
            href={`/dashboard/matches/${matchId}`}
            className="mt-2 text-[11px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] hover:text-[#2563EB] transition-colors duration-200"
          >
            Back to match
          </Link>
        )}
      </div>
    );
  }

  const hasPressure = pressureStats.some((s) => s.p1Total > 0 || s.p2Total > 0);
  const hasRally = rallyBuckets.some((b) => b.hasData);

  return (
    <div className="flex flex-col">
      {/* Momentum chart — hero section, full width */}
      <motion.div
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_CURVE }}
      >
        <MomentumChart
          data={filteredMomentumData}
          rawPoints={filteredPoints}
          p1Short={p1Short}
          p2Short={p2Short}
          activeSet={activeSet}
          onSetChange={setActiveSet}
          allSets={allSets}
        />
      </motion.div>

      {/* Section divider */}
      <div className="mt-10 mb-6">
        <div className="h-px bg-[#F0F0F0]" />
        <p className="text-[10px] font-medium text-[#CCCCCC] uppercase tracking-[2.5px] mt-3">
          Breakdown{activeSet != null ? ` — Set ${activeSet}` : ""}
        </p>
      </div>

      {/* Secondary sections in a weighted grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1.5fr] gap-x-8">
        <motion.div
          className="lg:col-span-1"
          initial={sectionInitial}
          animate={sectionAnimate}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_CURVE, delay: 0.07 }}
        >
          <SetBreakdown sets={setSummaries} p1Short={p1Short} p2Short={p2Short} />
        </motion.div>

        {hasPressure && (
          <motion.div
            className="lg:col-span-1 mt-10 lg:mt-0"
            initial={sectionInitial}
            animate={sectionAnimate}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_CURVE, delay: 0.14 }}
          >
            <PressureSection stats={pressureStats} p1Short={p1Short} p2Short={p2Short} />
          </motion.div>
        )}

        {hasRally && (
          <motion.div
            className="lg:col-span-1 mt-10 lg:mt-0"
            initial={sectionInitial}
            animate={sectionAnimate}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_CURVE, delay: 0.21 }}
          >
            <RallySection buckets={rallyBuckets} p1Short={p1Short} p2Short={p2Short} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ── Compact momentum-only chart for widget use ──────────── */

interface MomentumChartCompactProps {
  points: MatchPoint[];
  player1Name: string;
  player2Name: string;
}

export function MomentumChartCompact({
  points,
  player1Name,
  player2Name,
}: MomentumChartCompactProps) {
  const p1Short = shortName(player1Name, 18);
  const p2Short = shortName(player2Name, 18);

  const momentumData: MomentumPoint[] = useMemo(() => {
    let p1Cum = 0;
    let p2Cum = 0;
    return points.map((pt, i) => {
      if (pt.wonByPlayer1) p1Cum++;
      else p2Cum++;
      return { diff: p1Cum - p2Cum, setNumber: pt.setNumber };
    });
  }, [points]);

  if (momentumData.length < 2) return null;

  return (
    <MomentumChart
      data={momentumData}
      rawPoints={points}
      p1Short={p1Short}
      p2Short={p2Short}
      hideHeading
    />
  );
}
