"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, HelpCircle, Maximize2, Target, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVisualFilters } from "@/hooks/use-visual-filters";
import { FilterPills } from "@/components/dashboard/matches/visuals/filter-pills";
import {
  isDynamicOption,
  type FilterContextData,
  type FilterGroupConfig,
  type FilterOption,
  type VisualizationType,
} from "@/components/dashboard/matches/visuals/types/filters.types";
import {
  FullCourtSVG,
  FULL_SVG_FAR_BASELINE,
  FULL_SVG_NET_Y,
  FULL_SVG_NEAR_BASELINE,
  FULL_SVG_PAD_TOP,
  FULL_SVG_PAD_BOTTOM,
  type CourtDot,
  type DotMeta,
} from "@/components/dashboard/matches/visuals/half-court-svg";

export type ServeResult = "won" | "lost" | "ace" | "doubleFault";

export interface ServeDot {
  x: number;
  y: number;
  isFirstServe: boolean;
  result?: ServeResult;
  setNumber?: number;
  pointScore?: string | null;
  gameScore?: string | null;
}

export type ColorMode = "serveType" | "result";

export interface ServePointInput {
  id: string;
  serverIsPlayer1: boolean;
  firstShotLandingX: number | null;
  firstShotLandingY: number | null;
  firstShotZone?: string | null;
  firstShotSpin?: string | null;
  firstShotType?: string | null;
  firstShotResult?: string | null; // SwingVision In/Out/Net for the serve shot
  resultType?: string | null;
  wonByPlayer1?: boolean;
  setNumber?: number;
  pointScore?: string | null;
  gameScore?: string | null;
  // Return (second shot of the point when the first serve was in). Optional —
  // only the match-detail card supplies these; the home widget skips Return.
  secondShotLandingX?: number | null;
  secondShotLandingY?: number | null;
  secondShotContactX?: number | null;
  secondShotContactY?: number | null;
  secondShotType?: string | null;
  secondShotSpin?: string | null;
  secondShotResult?: string | null; // SwingVision In/Out/Net for the return shot
  rallyLength?: number;
}

export const FIRST_SERVE_COLOR = "rgba(59,130,246,0.65)";
export const SECOND_SERVE_COLOR = "rgba(139,92,246,0.8)";

const RESULT_COLORS: Record<ServeResult, string> = {
  won: "rgba(52,211,153,0.8)",
  lost: "rgba(244,63,94,0.8)",
  ace: "rgba(251,191,36,0.9)",
  doubleFault: "rgba(148,163,184,0.7)",
};

interface LegendItem {
  key: string;
  color: string;
  label: string;
  shape?: "circle" | "triangle";
}

const SERVE_TYPE_LEGEND: LegendItem[] = [
  { key: "first", color: FIRST_SERVE_COLOR, label: "First Serve" },
  { key: "second", color: SECOND_SERVE_COLOR, label: "Second Serve" },
];

const RESULT_LEGEND: LegendItem[] = [
  { key: "won", color: RESULT_COLORS.won, label: "Won" },
  { key: "lost", color: RESULT_COLORS.lost, label: "Lost" },
  { key: "ace", color: RESULT_COLORS.ace, label: "Ace" },
  { key: "doubleFault", color: RESULT_COLORS.doubleFault, label: "Double Fault" },
];

type ReturnStroke = "forehand" | "backhand";
type ReturnOutcome = "won" | "lost" | "outnet";

const RETURN_OUTCOME_COLORS: Record<ReturnOutcome, string> = {
  won: "rgba(52,211,153,0.9)",
  lost: "rgba(244,63,94,0.9)",
  outnet: "rgba(148,163,184,0.9)",
};

const RETURN_OUTCOME_LABEL: Record<ReturnOutcome, string> = {
  won: "Point Won",
  lost: "Point Lost",
  outnet: "Out / Net",
};

type ReturnLegendShape = "circle" | "triangle";

interface ReturnLegendItem {
  key: string;
  stroke: ReturnStroke;
  outcome: ReturnOutcome;
  color: string;
  label: string;
  shape: ReturnLegendShape;
}

const RETURN_LEGEND: ReturnLegendItem[] = (
  [
    ["forehand", "won"],
    ["forehand", "lost"],
    ["forehand", "outnet"],
    ["backhand", "won"],
    ["backhand", "lost"],
    ["backhand", "outnet"],
  ] as [ReturnStroke, ReturnOutcome][]
).map(([stroke, outcome]) => ({
  key: `${stroke === "forehand" ? "fh" : "bh"}-${outcome}`,
  stroke,
  outcome,
  color: RETURN_OUTCOME_COLORS[outcome],
  shape: stroke === "backhand" ? "triangle" : "circle",
  label: `${stroke === "forehand" ? "Forehand" : "Backhand"} ${
    outcome === "outnet" ? "Out / Net" : outcome === "won" ? "Point Won" : "Point Lost"
  }`,
}));

function returnLegendKey(stroke: ReturnStroke, outcome: ReturnOutcome): string {
  return `${stroke === "forehand" ? "fh" : "bh"}-${outcome}`;
}

function dotColor(dot: ServeDot, mode: ColorMode): string {
  if (mode === "result" && dot.result) return RESULT_COLORS[dot.result];
  return dot.isFirstServe ? FIRST_SERVE_COLOR : SECOND_SERVE_COLOR;
}

function dotLegendKey(dot: ServeDot, mode: ColorMode): string {
  if (mode === "result" && dot.result) return dot.result;
  return dot.isFirstServe ? "first" : "second";
}

const COURT_W = 447;
const COURT_H = 350;

const DOUBLES_LEFT = 37.4;
const DOUBLES_RIGHT = 410.9;
const DOUBLES_TOP = 0;
const SINGLES_LEFT = 84.2;
const SINGLES_RIGHT = 362.4;
const SERVICE_Y = 155;
const BASELINE_Y = 331;
const CENTER_X = (SINGLES_LEFT + SINGLES_RIGHT) / 2;
const BOX_HALF = (SINGLES_RIGHT - SINGLES_LEFT) / 2;

const ZONE_LINES_X = [
  SINGLES_LEFT + BOX_HALF / 3,
  SINGLES_LEFT + (BOX_HALF * 2) / 3,
  CENTER_X + BOX_HALF / 3,
  CENTER_X + (BOX_HALF * 2) / 3,
];

const COURT_COLOR = "#D6E4F9";
const SOLID_W = 1.5;
const DASHED_W = 1;

const REAL_HALF_DOUBLES = 5.485;
const REAL_SERVICE_Y = 5.485;
const REAL_NET_Y = 11.885;
const REAL_COURT_LENGTH = 23.77;

/**
 * SwingVision records landing coordinates in a fixed world frame. When the
 * server is at the far end (after end-changes on odd games), ly exceeds
 * REAL_NET_Y and lx is mirrored. Flip both so every serve plots in the same
 * canonical half-court [SERVICE_Y .. NET].
 */
function normalizeLanding(lx: number, ly: number): { lx: number; ly: number } {
  if (ly > REAL_NET_Y) {
    return { lx: -lx, ly: REAL_COURT_LENGTH - ly };
  }
  return { lx, ly };
}

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export function mapRealCoordsToServeDot(
  lx: number,
  ly: number,
  isFirstServe: boolean,
  servedIn = false,
): ServeDot {
  const n = normalizeLanding(lx, ly);
  const DOUBLES_HALF_W = (DOUBLES_RIGHT - DOUBLES_LEFT) / 2;
  const cx = CENTER_X + (n.lx / REAL_HALF_DOUBLES) * DOUBLES_HALF_W;
  const yFrac = (n.ly - REAL_SERVICE_Y) / (REAL_NET_Y - REAL_SERVICE_Y);
  const cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);
  // When SwingVision flags the serve as In, trust that ruling and keep the dot
  // inside the service box (boundary-landing serves can otherwise read as out
  // due to coord imputation or float precision). Otherwise clamp to the full
  // canvas so faults — long, wide, or into the net — render at their real spot.
  const [minX, maxX, minY, maxY] = servedIn
    ? [SINGLES_LEFT + 2, SINGLES_RIGHT - 2, SERVICE_Y + 2, BASELINE_Y - 2]
    : [4, COURT_W - 4, 4, COURT_H - 4];
  const clampedX = Math.max(minX, Math.min(maxX, cx));
  const clampedY = Math.max(minY, Math.min(maxY, cy));
  return {
    x: (clampedX - SINGLES_LEFT) / (SINGLES_RIGHT - SINGLES_LEFT),
    y: (clampedY - SERVICE_Y) / (BASELINE_Y - SERVICE_Y),
    isFirstServe,
  };
}

/* ── Point classification helpers ─────────────────────────── */

const SCORE_MAP: Record<string, number> = { "0": 0, "15": 1, "30": 2, "40": 3, A: 3, AD: 3 };

function getPointSide(p: ServePointInput): "deuce" | "ad" {
  const s = (p.pointScore ?? "").toUpperCase().trim();
  if (s === "DEUCE" || s === "40-40") return "deuce";
  if (/^AD?-|-AD?$/.test(s)) return "ad";
  const parts = s.split("-");
  return ((SCORE_MAP[parts[0]?.trim() ?? ""] ?? 0) + (SCORE_MAP[parts[1]?.trim() ?? ""] ?? 0)) % 2 === 0
    ? "deuce"
    : "ad";
}

function isFirstServePoint(p: ServePointInput): boolean {
  return !(p.firstShotType?.toLowerCase().includes("second") ?? false);
}

// Return view: which serve did the returner actually return? A faulted first
// serve (Out/Net) is followed by a second-serve rally, so the return is on
// the 2nd serve even though shot[0]'s type is "First Serve".
function isReturnOnFirstServe(p: ServePointInput): boolean {
  return p.firstShotType === "First Serve" && p.firstShotResult === "In";
}

type PointResult = "ace" | "doubleFault" | "won" | "lost";

function classifyPointResult(p: ServePointInput): PointResult {
  if (p.resultType === "Double Fault") return "doubleFault";
  if (p.resultType === "Ace") return "ace";
  const won = (p.wonByPlayer1 && p.serverIsPlayer1) || (!p.wonByPlayer1 && !p.serverIsPlayer1);
  return won ? "won" : "lost";
}

function classifyReturnDot(p: ServePointInput): { stroke: ReturnStroke; outcome: ReturnOutcome } {
  const typeLower = (p.secondShotType ?? "").toLowerCase();
  const stroke: ReturnStroke = typeLower.includes("backhand") ? "backhand" : "forehand";

  const shotResult = p.secondShotResult;
  let outcome: ReturnOutcome;
  if (shotResult === "Out" || shotResult === "Net") {
    outcome = "outnet";
  } else {
    const returnerWon =
      (p.wonByPlayer1 && !p.serverIsPlayer1) ||
      (!p.wonByPlayer1 && p.serverIsPlayer1);
    outcome = returnerWon ? "won" : "lost";
  }
  return { stroke, outcome };
}

function deriveZoneFromX(lx: number): string {
  const a = Math.abs(lx);
  return a >= 2.74 ? "wide" : a >= 1.37 ? "body" : "t";
}

/* ── Zone tooltip (preview + fullscreen) ──────────────────── */

type ZoneKey = "deuce-wide" | "deuce-body" | "deuce-t" | "ad-t" | "ad-body" | "ad-wide";

const ZONES: { key: ZoneKey; label: string; x1: number; x2: number }[] = [
  { key: "deuce-wide", label: "Wide", x1: SINGLES_LEFT, x2: ZONE_LINES_X[0] },
  { key: "deuce-body", label: "Body", x1: ZONE_LINES_X[0], x2: ZONE_LINES_X[1] },
  { key: "deuce-t", label: "T", x1: ZONE_LINES_X[1], x2: CENTER_X },
  { key: "ad-t", label: "T", x1: CENTER_X, x2: ZONE_LINES_X[2] },
  { key: "ad-body", label: "Body", x1: ZONE_LINES_X[2], x2: ZONE_LINES_X[3] },
  { key: "ad-wide", label: "Wide", x1: ZONE_LINES_X[3], x2: SINGLES_RIGHT },
];

function classifyZone(x: number): ZoneKey {
  const cx = SINGLES_LEFT + x * (SINGLES_RIGHT - SINGLES_LEFT);
  for (const z of ZONES) if (cx >= z.x1 && cx < z.x2) return z.key;
  return cx < CENTER_X ? "deuce-t" : "ad-t";
}

interface ZoneStats {
  count: number;
  pct: number;
  first: number;
  second: number;
  won: number;
  lost: number;
  ace: number;
  doubleFault: number;
  winPct: number;
}

function emptyZoneStats(): ZoneStats {
  return { count: 0, pct: 0, first: 0, second: 0, won: 0, lost: 0, ace: 0, doubleFault: 0, winPct: 0 };
}

function computeZoneStats(dots: ServeDot[]): Record<ZoneKey, ZoneStats> | null {
  if (dots.length === 0) return null;
  const result: Record<ZoneKey, ZoneStats> = {
    "deuce-wide": emptyZoneStats(),
    "deuce-body": emptyZoneStats(),
    "deuce-t": emptyZoneStats(),
    "ad-t": emptyZoneStats(),
    "ad-body": emptyZoneStats(),
    "ad-wide": emptyZoneStats(),
  };
  for (const d of dots) {
    const z = classifyZone(d.x);
    const zs = result[z];
    zs.count++;
    if (d.isFirstServe) zs.first++;
    else zs.second++;
    if (d.result) zs[d.result]++;
  }
  const total = dots.length;
  for (const key of Object.keys(result) as ZoneKey[]) {
    const zs = result[key];
    zs.pct = Math.round((zs.count / total) * 100);
    const resolved = zs.won + zs.lost + zs.ace + zs.doubleFault;
    zs.winPct = resolved > 0 ? Math.round(((zs.won + zs.ace) / resolved) * 100) : 0;
  }
  return result;
}

const L = { stroke: COURT_COLOR, strokeWidth: SOLID_W, strokeLinecap: "round" as const };

interface HalfCourtWithZonesProps {
  dots: ServeDot[];
  colorMode?: ColorMode;
  hiddenKeys?: Set<string>;
}

function HalfCourtWithZones({
  dots,
  colorMode = "serveType",
  hiddenKeys,
}: HalfCourtWithZonesProps) {
  const [activeZone, setActiveZone] = useState<ZoneKey | null>(null);
  const [hoveredDotIdx, setHoveredDotIdx] = useState<number | null>(null);
  const visibleDots = useMemo(
    () => (hiddenKeys && hiddenKeys.size > 0 ? dots.filter((d) => !hiddenKeys.has(dotLegendKey(d, colorMode))) : dots),
    [dots, hiddenKeys, colorMode],
  );
  const stats = useMemo(() => computeZoneStats(visibleDots), [visibleDots]);
  const hoveredDot = hoveredDotIdx != null ? visibleDots[hoveredDotIdx] ?? null : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Serve placement court diagram showing where serves landed"
        onPointerLeave={() => setActiveZone(null)}
      >
        <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#EFF4FF" />

        <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={DOUBLES_TOP} {...L} />
        <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_LEFT} y2={BASELINE_Y} {...L} />
        <line x1={DOUBLES_RIGHT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={BASELINE_Y} {...L} />
        <line x1={SINGLES_LEFT} y1={DOUBLES_TOP} x2={SINGLES_LEFT} y2={BASELINE_Y} {...L} />
        <line x1={SINGLES_RIGHT} y1={DOUBLES_TOP} x2={SINGLES_RIGHT} y2={BASELINE_Y} {...L} />
        <line x1={SINGLES_LEFT} y1={SERVICE_Y} x2={SINGLES_RIGHT} y2={SERVICE_Y} {...L} />
        <line x1={0} y1={BASELINE_Y} x2={COURT_W} y2={BASELINE_Y} {...L} />
        <line x1={CENTER_X} y1={SERVICE_Y} x2={CENTER_X} y2={BASELINE_Y} {...L} />

        {ZONE_LINES_X.map((x, i) => (
          <line
            key={i}
            x1={x}
            y1={SERVICE_Y}
            x2={x}
            y2={BASELINE_Y}
            stroke={COURT_COLOR}
            strokeWidth={DASHED_W}
            strokeDasharray="5,5"
          />
        ))}

        {stats &&
          ZONES.map((z) => {
            const zs = stats[z.key];
            if (zs.count === 0) return null;
            const cx = (z.x1 + z.x2) / 2;
            return (
              <g key={`label-${z.key}`} style={{ pointerEvents: "none" }}>
                <text
                  x={cx}
                  y={SERVICE_Y - 10}
                  textAnchor="middle"
                  fill="#AAAAAA"
                  fontSize={8}
                  fontWeight={500}
                  fontFamily="Inter, sans-serif"
                  letterSpacing={1.5}
                >
                  {z.label.toUpperCase()}
                </text>
                <text
                  x={cx}
                  y={BASELINE_Y - 20}
                  textAnchor="middle"
                  fill="#888888"
                  fontSize={10}
                  fontWeight={500}
                  fontFamily="Inter, sans-serif"
                >
                  {colorMode === "result" ? zs.winPct : zs.pct}%
                  {colorMode === "result" ? <tspan fill="#AAAAAA" fontSize={7}> WIN</tspan> : null}
                </text>
                <text
                  x={cx}
                  y={BASELINE_Y - 10}
                  textAnchor="middle"
                  fill="#AAAAAA"
                  fontSize={7}
                  fontWeight={400}
                  fontFamily="Inter, sans-serif"
                  letterSpacing={0.5}
                >
                  n={zs.count}
                </text>
              </g>
            );
          })}

        {stats &&
          ZONES.map((z) => {
            const isActive = activeZone === z.key;
            return (
              <g key={z.key}>
                <rect
                  x={z.x1}
                  y={SERVICE_Y}
                  width={z.x2 - z.x1}
                  height={BASELINE_Y - SERVICE_Y}
                  fill={isActive ? "rgba(59,130,246,0.06)" : "transparent"}
                  style={{ cursor: "pointer", transition: "fill 0.15s ease", outline: "none" }}
                  onPointerEnter={() => setActiveZone(z.key)}
                  onClick={() => setActiveZone((prev) => (prev === z.key ? null : z.key))}
                  onFocus={() => setActiveZone(z.key)}
                  onBlur={() => setActiveZone(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveZone((prev) => (prev === z.key ? null : z.key));
                    } else if (e.key === "Escape") {
                      setActiveZone(null);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${z.key.startsWith("deuce") ? "Deuce" : "Ad"} ${z.label} zone, ${stats[z.key].pct}% of serves`}
                />
                {isActive && (
                  <rect
                    x={z.x1}
                    y={SERVICE_Y - 1}
                    width={z.x2 - z.x1}
                    height={2}
                    fill="#3B82F6"
                    opacity={0.6}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            );
          })}

        {visibleDots.map((dot, i) => {
          const cx = SINGLES_LEFT + dot.x * (SINGLES_RIGHT - SINGLES_LEFT);
          const cy = SERVICE_Y + dot.y * (BASELINE_Y - SERVICE_Y);
          const isHovered = hoveredDotIdx === i;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={isHovered ? 4.5 : 2.5}
              fill={dotColor(dot, colorMode)}
              stroke={isHovered ? "#0D0D0D" : "none"}
              strokeWidth={isHovered ? 0.75 : 0}
              style={{ cursor: "pointer", transition: "r 0.1s ease" }}
              onPointerEnter={() => {
                setHoveredDotIdx(i);
                setActiveZone(null);
              }}
              onPointerLeave={() => setHoveredDotIdx((prev) => (prev === i ? null : prev))}
            />
          );
        })}
      </svg>

      {hoveredDot ? (
        <DotTooltip dot={hoveredDot} />
      ) : activeZone && stats && stats[activeZone].count > 0 ? (
        <ZoneTooltip activeZone={activeZone} stats={stats[activeZone]} colorMode={colorMode} />
      ) : null}
    </div>
  );
}

const RESULT_LABELS: Record<ServeResult, string> = {
  won: "Point Won",
  lost: "Point Lost",
  ace: "Ace",
  doubleFault: "Double Fault",
};

interface DotTooltipBodyProps {
  xPct: number;
  yPct: number;
  serveTypeLabel: string;
  serveTypeColor: string;
  resultLabel?: string | null;
  resultColor?: string;
  setNumber?: number | null;
  pointScore?: string | null;
  gameScore?: string | null;
}

function DotTooltipBody({
  xPct,
  yPct,
  serveTypeLabel,
  serveTypeColor,
  resultLabel,
  resultColor = "#AAAAAA",
  setNumber,
  pointScore,
  gameScore,
}: DotTooltipBodyProps) {
  const translateX = xPct < 20 ? "8px" : xPct > 80 ? "calc(-100% - 8px)" : "-50%";
  const translateY = "calc(-100% - 10px)";
  return (
    <div
      className="absolute pointer-events-none z-20 bg-white rounded-xl shadow-tooltip py-2.5 px-3 flex flex-col gap-2 w-[172px] overflow-hidden border border-[#F3F3F3]"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className="size-[6px] rounded-full shrink-0"
            style={{ backgroundColor: serveTypeColor }}
          />
          <span className="text-[11px] font-medium text-[#0D0D0D] truncate">{serveTypeLabel}</span>
        </span>
        {setNumber != null && (
          <span className="text-[9px] font-medium text-[#AAAAAA] uppercase tracking-[1px] tabular-nums shrink-0">
            Set {setNumber}
          </span>
        )}
      </div>
      {resultLabel && (
        <>
          <div className="h-px bg-[#F3F3F3]" />
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="size-[6px] rounded-full shrink-0"
                style={{ backgroundColor: resultColor }}
              />
              <span className="text-[10px] font-medium truncate" style={{ color: resultColor }}>
                {resultLabel}
              </span>
            </span>
            {(gameScore || pointScore) && (
              <span className="text-[9px] font-normal text-[#AAAAAA] tabular-nums shrink-0">
                {[gameScore, pointScore].filter(Boolean).join(" • ")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DotTooltip({ dot }: { dot: ServeDot }) {
  const cx = SINGLES_LEFT + dot.x * (SINGLES_RIGHT - SINGLES_LEFT);
  const cy = SERVICE_Y + dot.y * (BASELINE_Y - SERVICE_Y);
  return (
    <DotTooltipBody
      xPct={(cx / COURT_W) * 100}
      yPct={(cy / COURT_H) * 100}
      serveTypeLabel={dot.isFirstServe ? "1st Serve" : "2nd Serve"}
      serveTypeColor={dot.isFirstServe ? "#3B82F6" : "#8B5CF6"}
      resultLabel={dot.result ? RESULT_LABELS[dot.result] : null}
      resultColor={dot.result ? RESULT_COLORS[dot.result] : undefined}
      setNumber={dot.setNumber}
      pointScore={dot.pointScore}
      gameScore={dot.gameScore}
    />
  );
}

function ReturnDotTooltip({ dot }: { dot: CourtDot }) {
  const meta = dot.meta;
  if (!meta) return null;
  // CourtDot cx/cy live in the court's (0,0)-(447,700) frame, but the SVG
  // canvas is extended vertically by FULL_SVG_PAD_TOP / FULL_SVG_PAD_BOTTOM.
  // Convert to percentages of the full extended canvas.
  const canvasH = 700 + FULL_SVG_PAD_TOP + FULL_SVG_PAD_BOTTOM;
  const xPct = (dot.cx / COURT_W) * 100;
  const yPct = ((dot.cy + FULL_SVG_PAD_TOP) / canvasH) * 100;
  // serveType carries the stroke label ("Forehand" / "Backhand") in return mode.
  const strokeLabel = meta.serveType || "Forehand";
  return (
    <DotTooltipBody
      xPct={xPct}
      yPct={yPct}
      serveTypeLabel={strokeLabel}
      serveTypeColor={dot.color}
      resultLabel={meta.resultLabel}
      resultColor={dot.color}
      setNumber={meta.setNumber || undefined}
      pointScore={meta.pointScore}
      gameScore={meta.gameScore}
    />
  );
}

function ZoneTooltip({
  activeZone,
  stats,
  colorMode,
}: {
  activeZone: ZoneKey;
  stats: ZoneStats;
  colorMode: ColorMode;
}) {
  const zone = ZONES.find((z) => z.key === activeZone)!;
  const midX = (zone.x1 + zone.x2) / 2;
  const xPct = (midX / COURT_W) * 100;
  const yPct = (SERVICE_Y / COURT_H) * 100;
  const side = activeZone.startsWith("deuce") ? "Deuce" : "Ad";
  const translateX = xPct < 25 ? "0%" : xPct > 75 ? "-100%" : "-50%";

  const isResult = colorMode === "result";
  const headerPct = isResult ? stats.winPct : stats.pct;
  const accentColor = isResult
    ? stats.winPct >= 50
      ? RESULT_COLORS.won
      : RESULT_COLORS.lost
    : stats.first >= stats.second
      ? "#3B82F6"
      : "#8B5CF6";

  return (
    <div
      className="absolute pointer-events-none z-10 bg-white rounded-xl shadow-tooltip py-2.5 px-3 flex flex-col gap-2 w-[168px] overflow-hidden border border-[#F3F3F3]"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(${translateX}, calc(-100% - 8px))`,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px]">
          {side} {zone.label}
        </span>
        <span
          className="text-[16px] font-light tabular-nums tracking-[-0.3px]"
          style={{ color: accentColor }}
        >
          {headerPct}%
        </span>
      </div>
      <div className="h-px bg-[#F3F3F3]" />
      <div className="flex flex-col gap-1.5">
        {isResult ? (
          <>
            <TooltipRow color={RESULT_COLORS.won} label="Won" count={stats.won} total={stats.count} />
            <TooltipRow color={RESULT_COLORS.lost} label="Lost" count={stats.lost} total={stats.count} />
            <TooltipRow color={RESULT_COLORS.ace} label="Aces" count={stats.ace} total={stats.count} />
            <TooltipRow
              color={RESULT_COLORS.doubleFault}
              label="Double Faults"
              count={stats.doubleFault}
              total={stats.count}
            />
          </>
        ) : (
          <>
            <TooltipRow color="#3B82F6" label="1st Serve" count={stats.first} total={stats.count} />
            <TooltipRow color="#8B5CF6" label="2nd Serve" count={stats.second} total={stats.count} />
          </>
        )}
      </div>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  count,
  total,
}: {
  color: string;
  label: string;
  count: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <span className="size-[5px] rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[10px] text-[#525252]">{label}</span>
      </span>
      <span className="text-[10px] tabular-nums font-medium" style={{ color }}>
        {count} <span className="text-[#AAAAAA] font-normal">of {total}</span>
      </span>
    </div>
  );
}

function FullscreenEmptyState({
  hasData,
  mode = "serve",
  onReset,
}: {
  hasData: boolean;
  mode?: VisualizationType;
  onReset: () => void;
}) {
  const noun = mode === "return" ? "returns" : "serves";
  const nounNoData = mode === "return" ? "return" : "serve";
  return (
    <div
      role={hasData ? "status" : "region"}
      aria-live={hasData ? "polite" : undefined}
      className="flex flex-col items-center gap-3 text-center max-w-[280px] px-6"
    >
      <div className="bg-[#EBF2FD] p-3 rounded-full border border-[#E6EEFB]">
        <Target className="h-6 w-6 text-[#3B82F6]/70" strokeWidth={1.5} aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-[#0D0D0D]">
          {hasData ? `No ${noun} match your filters` : `No ${nounNoData} data yet`}
        </p>
        <p className="text-[11px] text-[#767676] leading-[1.5]">
          {hasData
            ? `Every ${nounNoData} was excluded by the active filters. Reset to the default view.`
            : mode === "return"
              ? "Return-shot landing coordinates weren't captured for this view."
              : "Serve landing coordinates weren't captured for this view."}
        </p>
      </div>
      {hasData && (
        <button
          type="button"
          onClick={onReset}
          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-medium uppercase tracking-[1.5px] rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 cursor-pointer"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

function LegendSwatch({
  color,
  shape = "circle",
  hidden,
}: {
  color: string;
  shape?: "circle" | "triangle";
  hidden?: boolean;
}) {
  if (shape === "triangle") {
    return (
      <svg
        width="9"
        height="9"
        viewBox="0 0 10 10"
        className="shrink-0"
        style={{ opacity: hidden ? 0.3 : 1 }}
        aria-hidden
      >
        <polygon points="5,0.5 0.5,8.5 9.5,8.5" fill={color} />
      </svg>
    );
  }
  return (
    <span
      className="w-[7px] h-[7px] rounded-full shrink-0"
      style={{ backgroundColor: color, opacity: hidden ? 0.3 : 1 }}
      aria-hidden
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex gap-1.5 items-center">
      <div className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px] uppercase">
        {label}
      </span>
    </div>
  );
}

/* ── Filter pipeline ──────────────────────────────────────── */

function resolveOptions(g: FilterGroupConfig, ctx: FilterContextData): FilterOption[] {
  return g.options.map((o) => (isDynamicOption(o) ? { value: o.value, label: ctx[o.labelKey] } : o));
}

function filterReturnPoints(
  points: ServePointInput[],
  filters: Record<string, string[]>,
): ServePointInput[] {
  const playerSet = new Set(filters.player ?? []);
  const typeSet = new Set(filters.type ?? []);
  const resultSet = new Set(filters.result ?? []);
  const sideSet = new Set(filters.side ?? []);
  const shotTypeSet = new Set(filters.shotType ?? []);
  const spinSet = new Set(filters.spin ?? []);

  return points.filter((p) => {
    if (p.secondShotLandingX == null || p.secondShotLandingY == null) return false;

    // Player filter on the RETURNER (opposite of server).
    const returner = p.serverIsPlayer1 ? "player2" : "player1";
    if (!playerSet.has(returner)) return false;

    const serveKey = isReturnOnFirstServe(p) ? "first" : "second";
    if (!typeSet.has(serveKey)) return false;

    const { stroke, outcome } = classifyReturnDot(p);
    if (!shotTypeSet.has(stroke)) return false;
    if (!resultSet.has(outcome)) return false;

    // Spin is optional in SwingVision data — let null-spin through when the
    // user has at least one spin selected; exclude everything when cleared.
    if (spinSet.size === 0) return false;
    const spin = p.secondShotSpin?.toLowerCase();
    if (spin && !spinSet.has(spin)) return false;

    const landingSide = getLandingSide(p);
    const side = landingSide ?? getPointSide(p);
    if (!sideSet.has(side)) return false;

    return true;
  });
}

function filterPoints(
  points: ServePointInput[],
  filters: Record<string, string[]>,
): ServePointInput[] {
  const playerSet = new Set(filters.player ?? []);
  const typeSet = new Set(filters.type ?? []);
  // `result` + `other` are a single inclusion set (the only way to express DF is via `other`).
  const resultSet = new Set([...(filters.result ?? []), ...(filters.other ?? [])]);
  const spinSet = new Set(filters.spin ?? []);
  const sideSet = new Set(filters.side ?? []);
  const zoneSet = new Set(filters.zone ?? []);

  return points.filter((p) => {
    // Empty group = filter fully off = exclude everything for that category.
    const who = p.serverIsPlayer1 ? "player1" : "player2";
    if (!playerSet.has(who)) return false;

    const serveKey = isFirstServePoint(p) ? "first" : "second";
    if (!typeSet.has(serveKey)) return false;

    if (!resultSet.has(classifyPointResult(p))) return false;

    const landingSide = getLandingSide(p);
    const side = landingSide ?? getPointSide(p);
    if (!sideSet.has(side)) return false;

    let z = p.firstShotZone?.toLowerCase();
    if (!z && p.firstShotLandingX != null) z = deriveZoneFromX(p.firstShotLandingX);
    if (!z || !zoneSet.has(z)) return false;

    // Spin is optional in SwingVision data. When the user has at least one spin
    // selected, let null-spin points through (don't punish missing data). When
    // the user has cleared the spin group entirely, exclude everything.
    if (spinSet.size === 0) return false;
    const spin = p.firstShotSpin?.toLowerCase();
    if (spin && !spinSet.has(spin)) return false;

    return true;
  });
}

export function pointToServeDot(p: ServePointInput): ServeDot | null {
  if (p.firstShotLandingX == null || p.firstShotLandingY == null) return null;
  const servedIn = p.firstShotResult === "In";
  const base = mapRealCoordsToServeDot(
    p.firstShotLandingX,
    p.firstShotLandingY,
    isFirstServePoint(p),
    servedIn,
  );
  return {
    ...base,
    result: classifyPointResult(p),
    setNumber: p.setNumber,
    pointScore: p.pointScore ?? null,
    gameScore: p.gameScore ?? null,
  };
}

function pointToReturnCourtDots(p: ServePointInput): CourtDot[] {
  if (p.secondShotLandingX == null || p.secondShotLandingY == null) return [];

  const isFirstServe = isFirstServePoint(p);
  const { stroke, outcome } = classifyReturnDot(p);
  const color = RETURN_OUTCOME_COLORS[outcome];
  const shape: "circle" | "triangle" = stroke === "backhand" ? "triangle" : "circle";

  const meta: DotMeta = {
    resultLabel: RETURN_OUTCOME_LABEL[outcome],
    gameScore: p.gameScore ?? "",
    pointScore: p.pointScore ?? "",
    setNumber: p.setNumber ?? 0,
    rallyLength: p.rallyLength ?? 0,
    serveType: stroke === "forehand" ? "Forehand" : "Backhand",
  };

  // Normalize landing so every return plots with landing on the far half.
  // Mirror contact by the same condition so the returner ends up on the near half.
  const landingRaw = { lx: p.secondShotLandingX, ly: p.secondShotLandingY };
  const didFlip = landingRaw.ly > REAL_NET_Y;
  const landing = didFlip
    ? { lx: -landingRaw.lx, ly: REAL_COURT_LENGTH - landingRaw.ly }
    : landingRaw;

  const farH = FULL_SVG_NET_Y - FULL_SVG_FAR_BASELINE;
  const landingCx = CENTER_X + (landing.lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const landingCy = FULL_SVG_FAR_BASELINE + (landing.ly / REAL_NET_Y) * farH;
  const landingDot: CourtDot = {
    cx: Math.max(4, Math.min(COURT_W - 4, landingCx)),
    cy: Math.max(FULL_SVG_FAR_BASELINE + 4, Math.min(FULL_SVG_NET_Y - 4, landingCy)),
    color,
    opacity: 0.85,
    id: p.id,
    pairId: p.id,
    variant: "landing",
    shape,
    meta,
  };

  // Contact (near half — returner's side). Not every shot has contact coords.
  if (p.secondShotContactX == null || p.secondShotContactY == null) {
    return [landingDot];
  }
  const contactNorm = didFlip
    ? { lx: -p.secondShotContactX, ly: REAL_COURT_LENGTH - p.secondShotContactY }
    : { lx: p.secondShotContactX, ly: p.secondShotContactY };
  const nearH = FULL_SVG_NEAR_BASELINE - FULL_SVG_NET_Y;
  const nearSpanY = REAL_COURT_LENGTH - REAL_NET_Y;
  const contactCx = CENTER_X + (contactNorm.lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const contactCy =
    FULL_SVG_NET_Y + ((contactNorm.ly - REAL_NET_Y) / nearSpanY) * nearH;
  // Clamp contact to the full canvas including the extended bottom padding,
  // so positions wide of the singles lines or well behind the baseline still
  // render in-frame. Keep a margin from the net so a contact never visually
  // straddles it.
  const contactDot: CourtDot = {
    cx: Math.max(4, Math.min(COURT_W - 4, contactCx)),
    cy: Math.max(
      FULL_SVG_NET_Y + 4,
      Math.min(FULL_SVG_NEAR_BASELINE + FULL_SVG_PAD_BOTTOM - 4, contactCy),
    ),
    color,
    opacity: 0.85,
    id: `${p.id}:contact`,
    pairId: p.id,
    variant: "contact",
    shape,
    meta,
  };

  return [landingDot, contactDot];
}

function getLandingSide(p: ServePointInput): "deuce" | "ad" | null {
  if (p.firstShotLandingX == null || p.firstShotLandingY == null) return null;
  const { lx } = normalizeLanding(p.firstShotLandingX, p.firstShotLandingY);
  return lx < 0 ? "deuce" : "ad";
}

/* ── Fullscreen modal ─────────────────────────────────────── */

interface ServePlacementFullscreenProps {
  points: ServePointInput[];
  ctxData: FilterContextData;
  contextLabel: string;
  onClose: () => void;
}

function ServePlacementFullscreen({
  points,
  ctxData,
  contextLabel,
  onClose,
}: ServePlacementFullscreenProps) {
  const prefersReduced = useReducedMotion();
  const { config, filters, setFilters, updateFilter, setVisualizationType } =
    useVisualFilters({ initialType: "serve" });
  const vizType = config.type;
  const [colorMode, setColorMode] = useState<ColorMode>("serveType");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const handleColorModeChange = useCallback((mode: ColorMode) => {
    setColorMode(mode);
    setHiddenKeys(new Set());
  }, []);

  const toggleLegendKey = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const legend =
    vizType === "return"
      ? RETURN_LEGEND
      : colorMode === "serveType"
        ? SERVE_TYPE_LEGEND
        : RESULT_LEGEND;

  const buildInitialState = useCallback((): Record<string, string[]> => {
    const init: Record<string, string[]> = {};
    for (const row of config.rows) {
      for (const g of row) {
        if (!g) continue;
        // Player defaults to just player1; all other groups start fully selected.
        init[g.key] = g.key === "player" ? ["player1"] : g.options.map((o) => o.value);
      }
    }
    return init;
  }, [config]);

  const buildEmptyState = useCallback((): Record<string, string[]> => {
    const empty: Record<string, string[]> = {};
    for (const row of config.rows) {
      for (const g of row) {
        if (!g) continue;
        empty[g.key] = [];
      }
    }
    return empty;
  }, [config]);

  const initializedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (initializedFor.current === config.type) return;
    initializedFor.current = config.type;
    setFilters(buildInitialState());
    setManuallyExpanded(new Set());
  }, [config.type, buildInitialState, setFilters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const row of config.rows) {
      for (const g of row) {
        if (!g) continue;
        const total = g.options.length;
        const selected = filters[g.key]?.length ?? 0;
        // A group is "actively narrowing" only when selection is partial.
        if (selected > 0 && selected < total) n++;
      }
    }
    return n;
  }, [config, filters]);

  const clearAllFilters = useCallback(
    () => setFilters(buildEmptyState()),
    [buildEmptyState, setFilters],
  );

  const resetFiltersToInitial = useCallback(
    () => setFilters(buildInitialState()),
    [buildInitialState, setFilters],
  );

  const filtered = useMemo(
    () => (vizType === "return" ? filterReturnPoints(points, filters) : filterPoints(points, filters)),
    [points, filters, vizType],
  );
  const dots = useMemo(() => {
    if (vizType === "return") return [];
    const out: ServeDot[] = [];
    for (const p of filtered) {
      const d = pointToServeDot(p);
      if (d) out.push(d);
    }
    return out;
  }, [filtered, vizType]);
  const returnDots = useMemo(() => {
    if (vizType !== "return") return [];
    const out: CourtDot[] = [];
    for (const p of filtered) {
      const { stroke, outcome } = classifyReturnDot(p);
      if (hiddenKeys.has(returnLegendKey(stroke, outcome))) continue;
      for (const d of pointToReturnCourtDots(p)) out.push(d);
    }
    return out;
  }, [filtered, vizType, hiddenKeys]);
  // Dots we pass to FullCourtSVG — meta stripped so the built-in shadcn tooltip
  // stays silent. We render our own DotTooltipBody overlaid instead.
  const returnDotsForSVG = useMemo(
    () => returnDots.map((d) => ({ ...d, meta: undefined })),
    [returnDots],
  );
  const [hoveredReturnId, setHoveredReturnId] = useState<string | null>(null);
  const [pinnedReturnId, setPinnedReturnId] = useState<string | null>(null);
  const hoveredReturnLandingDot = useMemo(() => {
    if (!hoveredReturnId) return null;
    return returnDots.find((d) => d.pairId === hoveredReturnId && d.variant === "landing") ?? null;
  }, [hoveredReturnId, returnDots]);
  // Count distinct points (one point = one landing + optional contact dot).
  const plottedCount = vizType === "return" ? filtered.length : dots.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't intercept when the user is typing in an input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
        else onClose();
      }
      else if (e.key === "1") handleColorModeChange("serveType");
      else if (e.key === "2") handleColorModeChange("result");
      else if (e.key === "r" || e.key === "R") resetFiltersToInitial();
      else if (e.key === "?") setShortcutsOpen((v) => !v);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, handleColorModeChange, resetFiltersToInitial, shortcutsOpen]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const legendCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (vizType === "return") {
      for (const p of filtered) {
        const { stroke, outcome } = classifyReturnDot(p);
        const k = returnLegendKey(stroke, outcome);
        counts[k] = (counts[k] ?? 0) + 1;
      }
    } else {
      for (const d of dots) {
        const k = dotLegendKey(d, colorMode);
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    return counts;
  }, [dots, filtered, colorMode, vizType]);

  const sectionedGroups = useMemo(() => {
    const flat = config.rows.flatMap((row) => row.filter(Boolean) as FilterGroupConfig[]);
    const byKey = new Map(flat.map((g) => [g.key, g]));
    const pick = (keys: string[]) =>
      keys.map((k) => byKey.get(k)).filter(Boolean) as FilterGroupConfig[];
    const sections: { label: string; groups: FilterGroupConfig[] }[] =
      config.type === "return"
        ? [
            { label: "Context", groups: pick(["player", "set"]) },
            { label: "Serve", groups: pick(["type", "side"]) },
            { label: "Return", groups: pick(["shotType", "spin"]) },
            { label: "Outcome", groups: pick(["result"]) },
          ]
        : [
            { label: "Context", groups: pick(["player", "set"]) },
            { label: "Serve", groups: pick(["type", "side", "zone", "spin"]) },
            { label: "Outcome", groups: pick(["result", "other"]) },
          ];
    return sections.filter((s) => s.groups.length > 0);
  }, [config]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      initial={prefersReduced ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={prefersReduced ? undefined : { opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <motion.div
        className="relative z-10 flex flex-col m-4 sm:m-6 bg-white rounded-2xl shadow-[0px_8px_32px_rgba(0,0,0,0.25)] overflow-hidden flex-1"
        initial={prefersReduced ? undefined : { scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={prefersReduced ? undefined : { scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-[#F3F3F3]">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[14px] font-medium text-[#0D0D0D] tracking-[-0.1px]">
              Serve Placement
            </h2>
            <span className="text-[12px] font-normal text-[#767676]">
              {contextLabel}
            </span>
            <span className="text-[13px] font-medium text-[#0D0D0D] tabular-nums">
              <motion.span
                key={plottedCount}
                initial={prefersReduced ? undefined : { opacity: 0.4, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="inline-block"
              >
                {plottedCount}
              </motion.span>
              <span className="text-[#AAAAAA] font-normal ml-1">
                {vizType === "return" ? "return" : "serve"}{plottedCount !== 1 ? "s" : ""}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1 relative">
            <button
              type="button"
              onClick={() => setShortcutsOpen((v) => !v)}
              aria-expanded={shortcutsOpen}
              aria-label="Show keyboard shortcuts"
              className="cursor-pointer p-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            >
              <HelpCircle className="h-4 w-4 text-[#767676]" strokeWidth={1.5} />
            </button>
            <button
              onClick={onClose}
              className="cursor-pointer p-1.5 -mr-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
              aria-label="Close fullscreen view"
            >
              <X className="h-4 w-4 text-[#767676]" strokeWidth={1.5} />
            </button>
            {shortcutsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShortcutsOpen(false)}
                  aria-hidden
                />
                <div
                  role="dialog"
                  aria-label="Keyboard shortcuts"
                  className="absolute right-0 top-full mt-2 z-20 bg-white rounded-xl shadow-tooltip border border-[#F3F3F3] py-2.5 px-3 w-[200px] flex flex-col gap-1.5"
                >
                  <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px] mb-1">
                    Keyboard
                  </span>
                  <ShortcutRow keys={["1"]} action="Color by 1st / 2nd" />
                  <ShortcutRow keys={["2"]} action="Color by Win / Loss" />
                  <ShortcutRow keys={["R"]} action="Reset filters" />
                  <ShortcutRow keys={["Esc"]} action="Close" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-4 px-5 py-3 shrink-0 border-b border-[#F3F3F3]">
          <div className="flex items-center rounded-full bg-[#F5F5F5] p-0.5">
            {(["serve", "return"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setVisualizationType(tab);
                  setHoveredReturnId(null);
                  setPinnedReturnId(null);
                }}
                aria-pressed={vizType === tab}
                className={cn(
                  "rounded-full px-3.5 h-7 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                  vizType === tab
                    ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#767676] hover:text-[#525252]",
                )}
              >
                {tab === "serve" ? "Serve" : "Return"}
              </button>
            ))}
          </div>
          {vizType === "serve" && (
            <>
              <div className="w-px h-4 bg-[#E7E7E7]" />
              <span className="text-[11px] font-normal text-[#767676]">
                Color by
              </span>
              <div className="flex items-center rounded-full bg-[#F5F5F5] p-0.5">
                {([
                  { mode: "serveType" as ColorMode, label: "1st / 2nd" },
                  { mode: "result" as ColorMode, label: "Win / Loss" },
                ]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleColorModeChange(mode)}
                    aria-pressed={colorMode === mode}
                    className={cn(
                      "rounded-full px-3.5 h-7 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                      colorMode === mode
                        ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                        : "text-[#767676] hover:text-[#525252]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] font-normal text-[#AAAAAA] ml-auto hidden sm:inline">
                {colorMode === "serveType"
                  ? "Zone labels show % of serves"
                  : "Zone labels show win rate"}
              </span>
            </>
          )}
        </div>

        {/* Court + filter rail */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 bg-[#EFF4FF] flex items-center justify-center p-6 min-h-0">
            {plottedCount === 0 ? (
              <FullscreenEmptyState
                hasData={points.some((p) =>
                  vizType === "return"
                    ? p.secondShotLandingX != null
                    : true,
                )}
                mode={vizType}
                onReset={resetFiltersToInitial}
              />
            ) : vizType === "return" ? (
              <div
                className="relative h-full max-h-full max-w-full"
                style={{ aspectRatio: `447 / ${700 + FULL_SVG_PAD_TOP + FULL_SVG_PAD_BOTTOM}` }}
              >
                <FullCourtSVG
                  dots={returnDotsForSVG}
                  hoveredId={hoveredReturnId}
                  pinnedId={pinnedReturnId}
                  onDotHover={(id) =>
                    setHoveredReturnId(id ? id.replace(/:contact$/, "") : null)
                  }
                  onDotClick={(id) => {
                    const norm = id.replace(/:contact$/, "");
                    setPinnedReturnId((prev) => (prev === norm ? null : norm));
                  }}
                  onBackgroundClick={() => setPinnedReturnId(null)}
                />
                {hoveredReturnLandingDot && <ReturnDotTooltip dot={hoveredReturnLandingDot} />}
              </div>
            ) : (
              <div className="w-full max-w-[640px]">
                <HalfCourtWithZones dots={dots} colorMode={colorMode} hiddenKeys={hiddenKeys} />
              </div>
            )}
          </div>

          <aside
            className="w-full lg:w-[280px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#F3F3F3] overflow-y-auto"
            aria-label="Filters"
          >
            <div className="flex items-center justify-between px-5 h-11 border-b border-[#F3F3F3] sticky top-0 bg-white z-10">
              <button
                type="button"
                onClick={() => setMobileRailOpen((v) => !v)}
                aria-expanded={mobileRailOpen}
                aria-controls="serve-placement-filter-body"
                className="flex lg:hidden items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
              >
                <span className="text-[12px] font-medium text-[#0D0D0D]">
                  Filters
                </span>
                {activeFilterCount > 0 && (
                  <span className="text-[10px] font-medium text-[#3B82F6] tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-[#AAAAAA] transition-transform duration-200",
                    mobileRailOpen && "rotate-180",
                  )}
                  strokeWidth={1.75}
                />
              </button>
              <span className="hidden lg:flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-[#0D0D0D]">
                  Filters
                </span>
                {activeFilterCount > 0 && (
                  <span className="text-[10px] font-medium text-[#3B82F6] tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="cursor-pointer text-[11px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200"
                >
                  Deselect all
                </button>
              )}
            </div>
            <div
              id="serve-placement-filter-body"
              className={cn("flex-col", mobileRailOpen ? "flex" : "hidden", "lg:flex")}
            >
              {sectionedGroups.map((section, i) => (
                <div
                  key={section.label}
                  className={cn("px-5 py-4 flex flex-col gap-3", i > 0 && "border-t border-[#F3F3F3]")}
                >
                  <span className="text-[11px] font-medium text-[#888888]">
                    {section.label}
                  </span>
                  <div className="flex flex-col gap-3">
                    {section.groups.map((g) => {
                      const selected = filters[g.key] ?? [];
                      const total = g.options.length;
                      const allSelected = selected.length === total;
                      const noneSelected = selected.length === 0;
                      const expanded = !allSelected || manuallyExpanded.has(g.key);
                      const summary = noneSelected
                        ? "None"
                        : allSelected
                          ? "All"
                          : `${selected.length} of ${total}`;
                      const summaryTone = noneSelected
                        ? "text-[#AAAAAA]"
                        : allSelected
                          ? "text-[#888888]"
                          : "text-[#3B82F6]";
                      return (
                        <div key={g.key} className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setManuallyExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(g.key)) next.delete(g.key);
                                else next.add(g.key);
                                return next;
                              })
                            }
                            aria-expanded={expanded}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-sm cursor-pointer",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                            )}
                          >
                            <span className="text-[12px] font-medium text-[#525252]">{g.label}</span>
                            <span className="flex items-center gap-1.5">
                              <span className={cn("text-[10px] font-medium tabular-nums", summaryTone)}>
                                {summary}
                              </span>
                              <ChevronDown
                                className={cn(
                                  "h-3 w-3 text-[#AAAAAA] transition-transform duration-200",
                                  expanded && "rotate-180",
                                )}
                                strokeWidth={1.75}
                              />
                            </span>
                          </button>
                          {expanded && (
                            <FilterPills
                              label=""
                              options={resolveOptions(g, ctxData)}
                              selected={selected}
                              onChange={(v) => updateFilter(g.key, v)}
                              multiSelect={g.multiSelect !== false}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Footer: legend */}
        <div className="flex items-center justify-between px-5 h-11 shrink-0 border-t border-[#F3F3F3]">
          <div className="flex gap-4 items-center flex-wrap">
            {legend.map(({ key, color, label, shape }) => {
              const hidden = hiddenKeys.has(key);
              const count = legendCounts[key] ?? 0;
              const empty = count === 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !empty && toggleLegendKey(key)}
                  disabled={empty}
                  aria-pressed={!hidden}
                  className={cn(
                    "flex gap-1.5 items-center transition-opacity duration-200 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                    empty ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                  )}
                >
                  <LegendSwatch color={color} shape={shape} hidden={hidden} />
                  <span
                    className={cn(
                      "text-[10px] font-normal text-[#AAAAAA] tracking-[1px] uppercase whitespace-nowrap",
                      hidden && "line-through opacity-50",
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-[10px] font-normal text-[#AAAAAA] tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="hidden md:flex items-center gap-3 text-[11px] font-normal text-[#AAAAAA]"
            aria-hidden
          >
            <span>Hover zone for details</span>
            <span className="text-[#E6EEFB]">·</span>
            <KeyHint label="1 / 2" action="Mode" />
            <KeyHint label="R" action="Reset" />
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function ShortcutRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-[#525252]">{action}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-sm bg-[#F5F5F5] text-[10px] font-medium text-[#525252] tabular-nums tracking-normal normal-case"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function KeyHint({ label, action }: { label: string; action: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-sm bg-[#F5F5F5] text-[10px] font-medium text-[#525252] tabular-nums tracking-normal normal-case">
        {label}
      </kbd>
      <span>{action}</span>
    </span>
  );
}

/* ── Widget ───────────────────────────────────────────────── */

export interface ServePlacementWidgetProps {
  dots: ServeDot[];
  points: ServePointInput[];
  contextLabel: string;
  ctxData: FilterContextData;
  overlay?: React.ReactNode;
}

export function ServePlacementWidget({
  dots,
  points,
  contextLabel,
  ctxData,
  overlay,
}: ServePlacementWidgetProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const canExpand = !overlay && points.length > 0;

  return (
    <section
      aria-labelledby="serve-placement-heading"
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card-elevated overflow-hidden"
    >
      <div className="flex items-center justify-between h-14 px-5">
        <h2
          id="serve-placement-heading"
          className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]"
        >
          Serve Placement
        </h2>
        <p className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">
          {contextLabel}
        </p>
      </div>

      <div className="bg-[#EFF4FF] h-[300px] sm:h-[350px] md:h-[415px]">
        <div className="flex items-center justify-center p-6 h-full">
          <div className="w-full max-w-[447px] relative">
            <HalfCourtWithZones dots={overlay ? [] : dots} />
            {overlay && <div className="absolute inset-0 flex items-center justify-center">{overlay}</div>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex gap-4 items-start">
          <LegendDot color={FIRST_SERVE_COLOR} label="First Serve" />
          <LegendDot color={SECOND_SERVE_COLOR} label="Second Serve" />
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          disabled={!canExpand}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 -mr-2 text-[10px] font-medium uppercase tracking-[2.5px] transition-colors duration-200 rounded-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
            canExpand
              ? "text-[#3B82F6] hover:text-[#2563EB] hover:bg-[#EBF2FD] cursor-pointer"
              : "text-[#CCCCCC] cursor-not-allowed",
          )}
          aria-label="Expand serve placement to fullscreen"
        >
          <Maximize2 className="h-3 w-3" strokeWidth={1.75} />
          Expand
        </button>
      </div>

      <AnimatePresence>
        {fullscreen && (
          <ServePlacementFullscreen
            points={points}
            ctxData={ctxData}
            contextLabel={contextLabel}
            onClose={() => setFullscreen(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
