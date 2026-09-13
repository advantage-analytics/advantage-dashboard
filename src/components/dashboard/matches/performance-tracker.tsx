"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { shortName } from "@/lib/data/match-utils";
import {
  PLAYER_1,
  PLAYER_2,
  EVENT_ACCENT,
} from "@/lib/design/player-colors";

const CHART_W = 600;
const CHART_H = 200;

interface MomentumPoint {
  diff: number;
  setNumber: number;
}

function toLinearPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]},${points[i][1]}`;
  }
  return d;
}

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

interface MomentumChartCompactProps {
  points: MatchPoint[];
  player1Name: string;
  player2Name: string;
  matchDurationSec?: number | null;
}

export function MomentumChartCompact({
  points,
  player1Name,
  player2Name,
  matchDurationSec,
}: MomentumChartCompactProps) {
  const p1Short = shortName(player1Name, 18);
  const p2Short = shortName(player2Name, 18);

  const data: MomentumPoint[] = useMemo(() => {
    let p1Cum = 0;
    let p2Cum = 0;
    return points.map((pt) => {
      if (pt.wonByPlayer1) p1Cum++;
      else p2Cum++;
      return { diff: p1Cum - p2Cum, setNumber: pt.setNumber };
    });
  }, [points]);

  const matchClock: (number | null)[] = useMemo(() => {
    const hasVideoTime = points.some((p) => p.videoTime != null);
    if (hasVideoTime) return points.map((p) => p.videoTime);
    if (matchDurationSec && matchDurationSec > 0 && points.length > 0) {
      const cumStart: number[] = [];
      let acc = 0;
      for (const p of points) {
        cumStart.push(acc);
        acc += p.duration ?? 0;
      }
      if (acc > 0) {
        const scale = matchDurationSec / acc;
        return cumStart.map((s) => s * scale);
      }
      return points.map((_, i) => (i / Math.max(1, points.length - 1)) * matchDurationSec);
    }
    return points.map(() => null);
  }, [points, matchDurationSec]);

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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pointId?: string }>).detail;
      if (!detail?.pointId) return;
      const idx = points.findIndex((p) => p.id === detail.pointId);
      if (idx >= 0) {
        // Keep the highlight sticky (as with keyboard nav) so the redirected
        // point stays selected until the user takes over or presses Escape.
        setIsKeyboardNav(true);
        setSelectedIndex(idx);
      }
    };
    window.addEventListener("match:momentum-select", handler as EventListener);
    return () =>
      window.removeEventListener("match:momentum-select", handler as EventListener);
  }, [points]);

  if (data.length < 2) return null;

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.diff)), 1);
  const yMid = CHART_H / 2;
  const xScale = (i: number) => (i / (data.length - 1)) * CHART_W;
  const yScale = (diff: number) => yMid - (diff / maxAbs) * (yMid - 6);

  const dividers: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].setNumber !== data[i - 1].setNumber) dividers.push(i);
  }

  const sets = [...new Set(data.map((d) => d.setNumber))].sort((a, b) => a - b);
  const breakIndices = detectBreaks(points);

  const coords: [number, number][] = data.map((d, i) => [xScale(i), yScale(d.diff)]);
  const smoothLine = toLinearPath(coords);
  const areaPath = smoothLine + ` L ${xScale(data.length - 1)},${yMid} L ${xScale(0)},${yMid} Z`;

  const selectedPt = selectedIndex !== null ? points[selectedIndex] : null;
  const selectedCoord = selectedIndex !== null ? coords[selectedIndex] : null;

  const yTicks: number[] = [];
  if (maxAbs >= 3) {
    const step = maxAbs >= 10 ? 5 : maxAbs >= 6 ? 3 : 2;
    for (let v = step; v <= maxAbs; v += step) {
      yTicks.push(v);
      yTicks.push(-v);
    }
  }

  const ariaDescription = selectedPt
    ? `${selectedPt.wonByPlayer1 ? p1Short : p2Short} won point. Score: ${selectedPt.pointScore}. Set ${selectedPt.setNumber}${selectedPt.gameScore ? `, ${selectedPt.gameScore}` : ""}. ${selectedPt.rallyLength > 0 ? `${selectedPt.rallyLength} shots.` : ""} ${selectedPt.isMatchPoint ? "Match point." : selectedPt.isSetPoint ? "Set point." : selectedPt.isBreakPoint ? "Break point." : ""}`
    : "";

  return (
    <div>
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
          style={{ height: 160 }}
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

          {breakIndices.map((b, i) => (
            <line
              key={`break-${i}`}
              x1={xScale(b.index)}
              y1={0}
              x2={xScale(b.index)}
              y2={CHART_H}
              stroke={EVENT_ACCENT}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          ))}

          <line x1={0} y1={yMid} x2={CHART_W} y2={yMid} stroke="#F0F0F0" strokeWidth={1} />

          <path d={areaPath} fill={PLAYER_1} fillOpacity={0.12} clipPath={`url(#${clipAbove})`} />
          <path d={areaPath} fill={PLAYER_2} fillOpacity={0.12} clipPath={`url(#${clipBelow})`} />

          <path
            d={smoothLine}
            fill="none"
            stroke={PLAYER_1}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath={`url(#${clipAbove})`}
          />
          <path
            d={smoothLine}
            fill="none"
            stroke={PLAYER_2}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath={`url(#${clipBelow})`}
          />

          {selectedIndex !== null && selectedCoord && (
            <line
              x1={selectedCoord[0]}
              y1={0}
              x2={selectedCoord[0]}
              y2={CHART_H}
              stroke={data[selectedIndex].diff >= 0 ? PLAYER_1 : PLAYER_2}
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
          )}

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

        {yTicks.map((v) => {
          const yPct = (yScale(v) / CHART_H) * 100;
          return (
            <span
              key={`ylabel-${v}`}
              className="absolute left-0 text-[9px] tabular-nums text-[#AAAAAA] font-normal pointer-events-none -translate-y-1/2"
              style={{ top: `${yPct}%` }}
            >
              {v > 0 ? `+${v}` : v}
            </span>
          );
        })}

        {selectedIndex !== null && selectedCoord && (() => {
          const dotColor = data[selectedIndex].diff >= 0 ? PLAYER_1 : PLAYER_2;
          return (
            <div
              className="absolute pointer-events-none z-[5] size-[7px] rounded-full"
              style={{
                left: `${(selectedCoord[0] / CHART_W) * 100}%`,
                top: `${(selectedCoord[1] / CHART_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                background: dotColor,
                boxShadow: "0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,0.1)",
              }}
            />
          );
        })()}

        <AnimatePresence>
          {selectedIndex !== null && selectedPt && selectedCoord && (() => {
            const accentColor = selectedPt.wonByPlayer1 ? PLAYER_1 : PLAYER_2;
            const xPct = (selectedCoord[0] / CHART_W) * 100;
            const yPct = (selectedCoord[1] / CHART_H) * 100;
            const showBelow = selectedCoord[1] < CHART_H * 0.25;
            const translateX = selectedCoord[0] > CHART_W * 0.8 ? "-92%" : selectedCoord[0] < CHART_W * 0.2 ? "-8%" : "-50%";
            const matchTimeSec = matchClock[selectedIndex];
            const formatMatchTime = (s: number) => {
              const total = Math.max(0, Math.floor(s));
              const h = Math.floor(total / 3600);
              const m = Math.floor((total % 3600) / 60);
              const sec = total % 60;
              return h > 0
                ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
                : `${m}:${String(sec).padStart(2, "0")}`;
            };
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
                  className="relative rounded-xl overflow-hidden bg-white border border-[#F3F3F3] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]"
                  style={{ minWidth: 172 }}
                >
                  <div className="px-3 pt-2.5 pb-1.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[14px] font-semibold tabular-nums text-[#0D0D0D] tracking-tight leading-none">
                        {selectedPt.pointScore}
                      </span>
                      {pressureLabel && (
                        <span
                          className="text-[9px] font-semibold uppercase tracking-wider leading-none px-1.5 py-[3px] rounded"
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
                      <span className="text-[10px] font-medium text-[#71717A] tracking-wider">
                        Set {selectedPt.setNumber}{selectedPt.gameScore ? ` ${selectedPt.gameScore}` : ""}
                      </span>
                      {matchTimeSec !== null && (
                        <>
                          <span className="text-[#CCCCCC] text-[10px]">/</span>
                          <span className="text-[10px] tabular-nums text-[#71717A] font-medium">
                            {formatMatchTime(matchTimeSec)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="h-px mx-2.5 bg-[#F3F3F3]" />

                  <div className="px-3 pt-1.5 pb-2 flex flex-col gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium" style={{ color: accentColor }}>
                        {selectedPt.wonByPlayer1 ? p1Short : p2Short} won point
                      </span>
                      <span className="text-[10px] text-[#71717A] font-medium">
                        {selectedPt.serverIsPlayer1 ? p1Short : p2Short} serving
                      </span>
                    </div>
                    {selectedPt.rallyLength > 0 && (
                      <span className="text-[10px] tabular-nums text-[#71717A] font-medium">
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

      <div className="relative h-3 mt-5">
        {sets.map((s) => {
          const indices = data
            .map((d, i) => (d.setNumber === s ? i : -1))
            .filter((i) => i >= 0);
          const midIdx = indices[Math.floor(indices.length / 2)];
          const xPct = (xScale(midIdx) / CHART_W) * 100;
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
    </div>
  );
}
