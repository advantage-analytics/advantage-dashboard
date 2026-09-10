"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  CourtDotStyles,
  CourtGlowFilter,
  useDotExit,
  dotStagger,
  FULL_SVG_FAR_BASELINE,
  FULL_SVG_NET_Y,
  FULL_SVG_NEAR_BASELINE,
  FULL_SVG_PAD_TOP,
  FULL_SVG_PAD_BOTTOM,
  type CourtDot,
  type DotMeta,
} from "@/components/dashboard/matches/visuals/half-court-svg";

import {
  BASELINE_Y,
  CENTER_X,
  COURT_H,
  COURT_W,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  REAL_COURT_LENGTH,
  REAL_HALF_DOUBLES,
  REAL_NET_Y,
  SERVICE_Y,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  ZONES,
  ZONE_LINES_X,
  classifyPointResult,
  classifyZone,
  computeZoneStats,
  deriveZoneFromX,
  getPointSide,
  isFirstServePoint,
  mapRealCoordsToServeDot,
  normalizeLanding,
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
  type ServeResult,
  type ZoneKey,
  type ZoneStats,
} from "@/lib/data/serve-zones";

// The pure geometry and classification live in `lib/data/serve-zones.ts` so a
// server loader can read a serve map; re-exported here so every existing
// caller of this module keeps its import path.
export {
  computeZoneStats,
  mapRealCoordsToServeDot,
  normalizeLanding,
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
  type ServeResult,
  type ZoneKey,
  type ZoneStats,
};

export type ColorMode = "serveType" | "result";

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
  {
    key: "doubleFault",
    color: RESULT_COLORS.doubleFault,
    label: "Double Fault",
  },
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

const RETURN_SERVE_TYPE_LEGEND: LegendItem[] = [
  { key: "first", color: FIRST_SERVE_COLOR, label: "1st-Serve Return" },
  { key: "second", color: SECOND_SERVE_COLOR, label: "2nd-Serve Return" },
];

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
    outcome === "outnet"
      ? "Out / Net"
      : outcome === "won"
        ? "Point Won"
        : "Point Lost"
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

const DOUBLES_TOP = 0;
const ALLEY_LABEL_X = (DOUBLES_LEFT + SINGLES_LEFT) / 2; // 60.8 — left doubles alley midpoint

const COURT_COLOR = "#D6E4F9";
const SOLID_W = 1.5;
const DASHED_W = 1;

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ── Point classification helpers ─────────────────────────── */

// Return view: which serve did the returner actually return? A faulted first
// serve (Out/Net) is followed by a second-serve rally, so the return is on
// the 2nd serve even though shot[0]'s type is "First Serve".
function isReturnOnFirstServe(p: ServePointInput): boolean {
  return p.firstShotType === "First Serve" && p.firstShotResult === "In";
}

function classifyReturnDot(p: ServePointInput): {
  stroke: ReturnStroke;
  outcome: ReturnOutcome;
} {
  const typeLower = (p.secondShotType ?? "").toLowerCase();
  // SwingVision uses both full ("Backhand") and abbreviated ("BH Volley") labels,
  // so match the "bh" prefix too — otherwise a backhand volley return reads as a forehand.
  const stroke: ReturnStroke =
    typeLower.includes("backhand") || typeLower.startsWith("bh")
      ? "backhand"
      : "forehand";

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

/* ── Zone tooltip (preview + fullscreen) ──────────────────── */

const L = {
  stroke: COURT_COLOR,
  strokeWidth: SOLID_W,
  strokeLinecap: "round" as const,
};

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
    () =>
      hiddenKeys && hiddenKeys.size > 0
        ? dots.filter((d) => !hiddenKeys.has(dotLegendKey(d, colorMode)))
        : dots,
    [dots, hiddenKeys, colorMode],
  );
  const stats = useMemo(() => computeZoneStats(visibleDots), [visibleDots]);
  const hoveredDot =
    hoveredDotIdx != null ? (visibleDots[hoveredDotIdx] ?? null) : null;
  // Keep just-removed serves mounted briefly so they fade out instead of popping.
  const exitingDots = useDotExit(visibleDots).filter((d) => d.exiting);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Serve placement court diagram showing where serves landed"
        onPointerLeave={() => setActiveZone(null)}
      >
        <defs>
          <CourtGlowFilter />
        </defs>
        <CourtDotStyles />
        <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#EFF4FF" />

        <line
          x1={DOUBLES_LEFT}
          y1={DOUBLES_TOP}
          x2={DOUBLES_RIGHT}
          y2={DOUBLES_TOP}
          {...L}
        />
        <line
          x1={DOUBLES_LEFT}
          y1={DOUBLES_TOP}
          x2={DOUBLES_LEFT}
          y2={BASELINE_Y}
          {...L}
        />
        <line
          x1={DOUBLES_RIGHT}
          y1={DOUBLES_TOP}
          x2={DOUBLES_RIGHT}
          y2={BASELINE_Y}
          {...L}
        />
        <line
          x1={SINGLES_LEFT}
          y1={DOUBLES_TOP}
          x2={SINGLES_LEFT}
          y2={BASELINE_Y}
          {...L}
        />
        <line
          x1={SINGLES_RIGHT}
          y1={DOUBLES_TOP}
          x2={SINGLES_RIGHT}
          y2={BASELINE_Y}
          {...L}
        />
        <line
          x1={SINGLES_LEFT}
          y1={SERVICE_Y}
          x2={SINGLES_RIGHT}
          y2={SERVICE_Y}
          {...L}
        />
        <line x1={0} y1={BASELINE_Y} x2={COURT_W} y2={BASELINE_Y} {...L} />
        <line
          x1={CENTER_X}
          y1={SERVICE_Y}
          x2={CENTER_X}
          y2={BASELINE_Y}
          {...L}
        />

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
                  y={BASELINE_Y - 25}
                  textAnchor="middle"
                  fill="#888888"
                  fontSize={10}
                  fontWeight={500}
                  fontFamily="Inter, sans-serif"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {colorMode === "result" ? zs.winPct : zs.pct}%
                </text>
                <text
                  x={cx}
                  y={BASELINE_Y - 9}
                  textAnchor="middle"
                  fill="#AAAAAA"
                  fontSize={6}
                  fontWeight={400}
                  fontFamily="Inter, sans-serif"
                  letterSpacing={0.5}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  ({zs.count})
                </text>
              </g>
            );
          })}

        {stats && (
          <g style={{ pointerEvents: "none" }} aria-hidden>
            <text
              x={ALLEY_LABEL_X}
              y={SERVICE_Y - 10}
              textAnchor="middle"
              fill="#AAAAAA"
              fontSize={7}
              fontWeight={500}
              fontFamily="Inter, sans-serif"
              letterSpacing={1}
            >
              ZONE
            </text>
            <text
              x={ALLEY_LABEL_X}
              y={BASELINE_Y - 25}
              textAnchor="middle"
              fill="#AAAAAA"
              fontSize={7}
              fontWeight={500}
              fontFamily="Inter, sans-serif"
              letterSpacing={1}
            >
              {colorMode === "result" ? "WIN" : "IN"}
            </text>
            <text
              x={ALLEY_LABEL_X}
              y={BASELINE_Y - 9}
              textAnchor="middle"
              fill="#AAAAAA"
              fontSize={7}
              fontWeight={500}
              fontFamily="Inter, sans-serif"
              letterSpacing={1}
            >
              COUNT
            </text>
          </g>
        )}

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
                  style={{
                    cursor: "pointer",
                    transition: "fill 0.15s ease",
                    outline: "none",
                  }}
                  onPointerEnter={() => setActiveZone(z.key)}
                  onClick={() =>
                    setActiveZone((prev) => (prev === z.key ? null : z.key))
                  }
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
              key={dot.id ?? i}
              className="court-dot"
              cx={cx}
              cy={cy}
              r={isHovered ? 4.25 : 2.5}
              fill={dotColor(dot, colorMode)}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
              filter={isHovered ? "url(#dot-glow)" : undefined}
              style={{
                cursor: "pointer",
                transition: "all 0.15s ease",
                animationDelay: dotStagger(i),
              }}
              onPointerEnter={() => {
                setHoveredDotIdx(i);
                setActiveZone(null);
              }}
              onPointerLeave={() =>
                setHoveredDotIdx((prev) => (prev === i ? null : prev))
              }
            />
          );
        })}

        {exitingDots.map((dot) => (
          <circle
            key={`exit-${dot.id}`}
            className="court-dot--exit"
            cx={SINGLES_LEFT + dot.x * (SINGLES_RIGHT - SINGLES_LEFT)}
            cy={SERVICE_Y + dot.y * (BASELINE_Y - SERVICE_Y)}
            r={2.5}
            fill={dotColor(dot, colorMode)}
          />
        ))}
      </svg>

      {hoveredDot ? (
        <DotTooltip dot={hoveredDot} />
      ) : activeZone && stats && stats[activeZone].count > 0 ? (
        <ZoneTooltip
          activeZone={activeZone}
          stats={stats[activeZone]}
          colorMode={colorMode}
        />
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
  const translateX =
    xPct < 20 ? "8px" : xPct > 80 ? "calc(-100% - 8px)" : "-50%";
  const translateY = "calc(-100% - 10px)";
  return (
    <div
      className="pointer-events-none absolute z-20 flex w-[172px] flex-col gap-2 overflow-hidden rounded-xl border border-[#F3F3F3] bg-white px-3 py-2.5 shadow-tooltip"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="size-[6px] shrink-0 rounded-full"
            style={{ backgroundColor: serveTypeColor }}
          />
          <span className="truncate text-[11px] font-medium text-[#0D0D0D]">
            {serveTypeLabel}
          </span>
        </span>
        {setNumber != null && (
          <span className="shrink-0 text-[9px] font-medium tracking-[1px] text-[#AAAAAA] uppercase tabular-nums">
            Set {setNumber}
          </span>
        )}
      </div>
      {resultLabel && (
        <>
          <div className="h-px bg-[#F3F3F3]" />
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="size-[6px] shrink-0 rounded-full"
                style={{ backgroundColor: resultColor }}
              />
              <span
                className="truncate text-[10px] font-medium"
                style={{ color: resultColor }}
              >
                {resultLabel}
              </span>
            </span>
            {(gameScore || pointScore) && (
              <span className="shrink-0 text-[9px] font-normal text-[#AAAAAA] tabular-nums">
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
      className="pointer-events-none absolute z-10 flex w-[168px] flex-col gap-2 overflow-hidden rounded-xl border border-[#F3F3F3] bg-white px-3 py-2.5 shadow-tooltip"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(${translateX}, calc(-100% - 8px))`,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium tracking-[1.5px] text-[#AAAAAA] uppercase">
          {side} {zone.label}
        </span>
        <span
          className="text-[16px] font-light tracking-[-0.3px] tabular-nums"
          style={{ color: accentColor }}
        >
          {headerPct}%
        </span>
      </div>
      <div className="h-px bg-[#F3F3F3]" />
      <div className="flex flex-col gap-1.5">
        {isResult ? (
          <>
            <TooltipRow
              color={RESULT_COLORS.won}
              label="Won"
              count={stats.won}
              total={stats.count}
            />
            <TooltipRow
              color={RESULT_COLORS.lost}
              label="Lost"
              count={stats.lost}
              total={stats.count}
            />
            <TooltipRow
              color={RESULT_COLORS.ace}
              label="Aces"
              count={stats.ace}
              total={stats.count}
            />
            <TooltipRow
              color={RESULT_COLORS.doubleFault}
              label="Double Faults"
              count={stats.doubleFault}
              total={stats.count}
            />
          </>
        ) : (
          <>
            <TooltipRow
              color="#3B82F6"
              label="1st Serve"
              count={stats.first}
              total={stats.count}
            />
            <TooltipRow
              color="#8B5CF6"
              label="2nd Serve"
              count={stats.second}
              total={stats.count}
            />
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
        <span
          className="size-[5px] shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[10px] text-[#525252]">{label}</span>
      </span>
      <span className="text-[10px] font-medium tabular-nums" style={{ color }}>
        {count} <span className="font-normal text-[#AAAAAA]">of {total}</span>
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
      className="flex max-w-[280px] flex-col items-center gap-3 px-6 text-center"
    >
      <div className="rounded-full bg-[#F5F5F5] p-4">
        <Target
          className="h-8 w-8 text-[#888888]"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-[#0D0D0D]">
          {hasData
            ? `No ${noun} match your filters`
            : `No ${nounNoData} data yet`}
        </p>
        <p className="text-[12px] leading-[1.5] text-[#888888]">
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
          className="mt-1 inline-flex cursor-pointer items-center rounded-full bg-[#3B82F6] px-3 py-1.5 text-[10px] font-medium tracking-[1.5px] text-white uppercase shadow-none transition-colors duration-200 hover:bg-[#2563EB] focus-visible:outline-none"
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
      className="h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ backgroundColor: color, opacity: hidden ? 0.3 : 1 }}
      aria-hidden
    />
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-[7px] w-[7px] rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[10px] font-normal tracking-[1px] text-[#AAAAAA] uppercase">
        {label}
      </span>
    </div>
  );
}

/* ── Filter pipeline ──────────────────────────────────────── */

function resolveOptions(
  g: FilterGroupConfig,
  ctx: FilterContextData,
): FilterOption[] {
  return g.options.map((o) =>
    isDynamicOption(o) ? { value: o.value, label: ctx[o.labelKey] } : o,
  );
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
    if (p.secondShotLandingX == null || p.secondShotLandingY == null)
      return false;

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
  const resultSet = new Set([
    ...(filters.result ?? []),
    ...(filters.other ?? []),
  ]);
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
    if (!z && p.firstShotLandingX != null)
      z = deriveZoneFromX(p.firstShotLandingX);
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

function pointToReturnCourtDots(
  p: ServePointInput,
  colorMode: ColorMode = "result",
): CourtDot[] {
  if (p.secondShotLandingX == null || p.secondShotLandingY == null) return [];

  const isFirstServe = isFirstServePoint(p);
  const { stroke, outcome } = classifyReturnDot(p);
  const color =
    colorMode === "serveType"
      ? isReturnOnFirstServe(p)
        ? FIRST_SERVE_COLOR
        : SECOND_SERVE_COLOR
      : RETURN_OUTCOME_COLORS[outcome];
  const shape: "circle" | "triangle" =
    stroke === "backhand" ? "triangle" : "circle";

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
  // Mirror world-x onto screen-x (note the leading minus) so the court reads from
  // BEHIND the returner: a right-hander's forehand contact lands on the right,
  // matching the serve view's behind-the-server angle. Contact mirrors identically
  // below, keeping each landing/contact pair's trajectory consistent.
  const landingCx = CENTER_X - (landing.lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const landingCy = FULL_SVG_FAR_BASELINE + (landing.ly / REAL_NET_Y) * farH;
  const landingDot: CourtDot = {
    cx: Math.max(4, Math.min(COURT_W - 4, landingCx)),
    cy: Math.max(
      FULL_SVG_FAR_BASELINE + 4,
      Math.min(FULL_SVG_NET_Y - 4, landingCy),
    ),
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
    ? {
        lx: -p.secondShotContactX,
        ly: REAL_COURT_LENGTH - p.secondShotContactY,
      }
    : { lx: p.secondShotContactX, ly: p.secondShotContactY };
  const nearH = FULL_SVG_NEAR_BASELINE - FULL_SVG_NET_Y;
  const nearSpanY = REAL_COURT_LENGTH - REAL_NET_Y;
  const contactCx =
    CENTER_X - (contactNorm.lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const contactCy =
    FULL_SVG_NET_Y + ((contactNorm.ly - REAL_NET_Y) / nearSpanY) * nearH;
  // A return is struck behind the net — a contact computed on/in front of the net
  // (which would otherwise clamp onto the net line) is a tracking artifact, not a
  // real contact. Drop the contact marker but keep the landing dot.
  if (contactCy <= FULL_SVG_NET_Y + 4) {
    return [landingDot];
  }
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
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(
    new Set(),
  );
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
      ? colorMode === "serveType"
        ? RETURN_SERVE_TYPE_LEGEND
        : RETURN_LEGEND
      : colorMode === "serveType"
        ? SERVE_TYPE_LEGEND
        : RESULT_LEGEND;

  const buildInitialState = useCallback((): Record<string, string[]> => {
    const init: Record<string, string[]> = {};
    for (const row of config.rows) {
      for (const g of row) {
        if (!g) continue;
        // Player defaults to just player1; all other groups start fully selected.
        init[g.key] =
          g.key === "player" ? ["player1"] : g.options.map((o) => o.value);
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
    () =>
      vizType === "return"
        ? filterReturnPoints(points, filters)
        : filterPoints(points, filters),
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
      const key =
        colorMode === "serveType"
          ? isReturnOnFirstServe(p)
            ? "first"
            : "second"
          : returnLegendKey(stroke, outcome);
      if (hiddenKeys.has(key)) continue;
      for (const d of pointToReturnCourtDots(p, colorMode)) out.push(d);
    }
    return out;
  }, [filtered, vizType, hiddenKeys, colorMode]);
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
    return (
      returnDots.find(
        (d) => d.pairId === hoveredReturnId && d.variant === "landing",
      ) ?? null
    );
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
      } else if (e.key === "1") handleColorModeChange("serveType");
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
        const k =
          colorMode === "serveType"
            ? isReturnOnFirstServe(p)
              ? "first"
              : "second"
            : returnLegendKey(stroke, outcome);
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
    const flat = config.rows.flatMap(
      (row) => row.filter(Boolean) as FilterGroupConfig[],
    );
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
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        className="relative z-10 m-4 flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0px_8px_32px_rgba(0,0,0,0.25)] sm:m-6"
        initial={prefersReduced ? undefined : { scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={prefersReduced ? undefined : { scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#F3F3F3] px-5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
              Serve Placement
            </h2>
            <span className="text-[10px] font-normal tracking-[1px] text-[#AAAAAA] uppercase">
              {contextLabel}
            </span>
            <span className="text-[10px] font-medium tracking-[1px] text-[#525252] uppercase tabular-nums">
              <motion.span
                key={plottedCount}
                initial={prefersReduced ? undefined : { opacity: 0.4, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="inline-block"
              >
                {plottedCount}
              </motion.span>
              <span className="ml-1 font-normal text-[#AAAAAA]">
                {vizType === "return" ? "return" : "serve"}
                {plottedCount !== 1 ? "s" : ""}
              </span>
            </span>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShortcutsOpen((v) => !v)}
              aria-expanded={shortcutsOpen}
              aria-label="Show keyboard shortcuts"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors duration-200 hover:bg-[#F5F5F5] hover:text-[#0D0D0D] focus-visible:outline-none"
            >
              <HelpCircle className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#888888] transition-colors duration-200 hover:bg-[#F5F5F5] hover:text-[#0D0D0D] focus-visible:outline-none"
              aria-label="Close fullscreen view"
            >
              <X className="size-3.5" strokeWidth={1.5} />
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
                  className="absolute top-full right-0 z-20 mt-2 flex w-[200px] flex-col gap-1.5 rounded-xl border border-[#E5E5EA] bg-white px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <span className="mb-1 text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
                    Keyboard
                  </span>
                  <ShortcutRow keys={["1"]} action="Color by 1st / 2nd" />
                  <ShortcutRow keys={["2"]} action="Color by Win / Loss" />
                  <ShortcutRow keys={["R"]} action="Reset filters" />
                  <ShortcutRow keys={["esc"]} action="Close" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex shrink-0 items-center gap-4 border-b border-[#F3F3F3] px-5 py-4">
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
                  "h-7 cursor-pointer rounded-full px-3.5 text-[11px] font-medium transition-all duration-200",
                  "focus-visible:outline-none",
                  vizType === tab
                    ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#71717A] hover:text-[#525252]",
                )}
              >
                {tab === "serve" ? "Serve" : "Return"}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-[#E5E5EA]" />
          <span className="text-[11px] font-normal text-[#71717A]">
            Color by
          </span>
          <div className="flex items-center rounded-full bg-[#F5F5F5] p-0.5">
            {[
              { mode: "serveType" as ColorMode, label: "1st / 2nd" },
              { mode: "result" as ColorMode, label: "Win / Loss" },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleColorModeChange(mode)}
                aria-pressed={colorMode === mode}
                className={cn(
                  "h-7 cursor-pointer rounded-full px-3.5 text-[11px] font-medium transition-all duration-200",
                  "focus-visible:outline-none",
                  colorMode === mode
                    ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#71717A] hover:text-[#525252]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {vizType === "serve" && (
            <span className="ml-auto hidden text-[11px] font-normal text-[#AAAAAA] sm:inline">
              {colorMode === "serveType"
                ? "Zone labels show % of serves"
                : "Zone labels show win rate"}
            </span>
          )}
        </div>

        {/* Court + filter rail */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            className={cn(
              "flex min-h-0 flex-1 items-center justify-center bg-[#EFF4FF]",
              // The return court is tall and height-bound — give it minimal
              // vertical padding so it scales up to fill the frame.
              vizType === "return" ? "px-4 py-2" : "p-6",
            )}
          >
            {plottedCount === 0 ? (
              <FullscreenEmptyState
                hasData={points.some((p) =>
                  vizType === "return" ? p.secondShotLandingX != null : true,
                )}
                mode={vizType}
                onReset={resetFiltersToInitial}
              />
            ) : vizType === "return" ? (
              <div
                className="relative h-full max-h-full max-w-full"
                style={{
                  aspectRatio: `447 / ${700 + FULL_SVG_PAD_TOP + FULL_SVG_PAD_BOTTOM}`,
                }}
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
                  halfLabels={{ top: "PLACEMENT", bottom: "CONTACT" }}
                />
                {hoveredReturnLandingDot && (
                  <ReturnDotTooltip dot={hoveredReturnLandingDot} />
                )}
              </div>
            ) : (
              <div className="w-full max-w-[640px]">
                <HalfCourtWithZones
                  dots={dots}
                  colorMode={colorMode}
                  hiddenKeys={hiddenKeys}
                />
              </div>
            )}
          </div>

          <aside
            className="w-full shrink-0 overflow-y-auto border-t border-[#F3F3F3] lg:w-[280px] lg:border-t-0 lg:border-l"
            aria-label="Filters"
          >
            <div className="sticky top-0 z-10 flex h-11 items-center justify-between border-b border-[#F3F3F3] bg-white px-5">
              <button
                type="button"
                onClick={() => setMobileRailOpen((v) => !v)}
                aria-expanded={mobileRailOpen}
                aria-controls="serve-placement-filter-body"
                className="flex cursor-pointer items-center gap-1.5 rounded-sm focus-visible:outline-none lg:hidden"
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
              <span className="hidden items-center gap-1.5 lg:flex">
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
                  className="cursor-pointer text-[11px] font-medium text-[#3B82F6] transition-colors duration-200 hover:text-[#2563EB]"
                >
                  Deselect all
                </button>
              )}
            </div>
            <div
              id="serve-placement-filter-body"
              className={cn(
                "flex-col",
                mobileRailOpen ? "flex" : "hidden",
                "lg:flex",
              )}
            >
              {sectionedGroups.map((section, i) => (
                <div
                  key={section.label}
                  className={cn(
                    "flex flex-col gap-3 px-5 py-4",
                    i > 0 && "border-t border-[#F3F3F3]",
                  )}
                >
                  <span className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase">
                    {section.label}
                  </span>
                  <div className="flex flex-col gap-3">
                    {section.groups.map((g) => {
                      const selected = filters[g.key] ?? [];
                      const total = g.options.length;
                      const allSelected = selected.length === total;
                      const noneSelected = selected.length === 0;
                      const expanded =
                        !allSelected || manuallyExpanded.has(g.key);
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
                              "flex cursor-pointer items-center justify-between gap-2 rounded-sm",
                              "focus-visible:outline-none",
                            )}
                          >
                            <span className="text-[12px] font-medium text-[#525252]">
                              {g.label}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-[10px] font-medium tabular-nums",
                                  summaryTone,
                                )}
                              >
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
        <div className="flex min-h-[60px] shrink-0 items-center justify-between px-5 py-4">
          <div className="flex flex-wrap items-start gap-4">
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
                    "flex items-center gap-1.5 rounded-sm transition-opacity duration-200 focus-visible:outline-none",
                    empty ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                  )}
                >
                  <LegendSwatch color={color} shape={shape} hidden={hidden} />
                  <span
                    className={cn(
                      "text-[10px] font-normal tracking-[1px] whitespace-nowrap text-[#AAAAAA] uppercase",
                      hidden && "line-through opacity-50",
                    )}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="hidden items-center text-[11px] font-normal text-[#AAAAAA] md:flex"
            aria-hidden
          >
            <span>
              {vizType === "return"
                ? "Hover a point for details"
                : "Hover a zone for details"}
            </span>
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
        {keys.map((k) => {
          const isWordKey = /^[a-z]+$/.test(k);
          return (
            <kbd
              key={k}
              className={cn(
                "inline-block rounded bg-[#F0F0F0] px-1 py-0.5 text-[10px] leading-none font-medium text-[#AAAAAA]",
                isWordKey && "[font-variant-caps:small-caps]",
              )}
            >
              {k}
            </kbd>
          );
        })}
      </span>
    </div>
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
      className="overflow-hidden rounded-[14px] border border-[#F3F3F3] bg-white shadow-card-elevated"
    >
      <div className="flex h-14 items-center justify-between px-5">
        <h2
          id="serve-placement-heading"
          className="text-[10px] font-medium tracking-[2.5px] text-[#AAAAAA] uppercase"
        >
          Serve Placement
        </h2>
        <p className="text-[10px] font-normal tracking-[1px] text-[#AAAAAA] uppercase">
          {contextLabel}
        </p>
      </div>

      <div className="h-[300px] bg-[#EFF4FF] sm:h-[350px] md:h-[415px]">
        <div className="flex h-full items-center justify-center p-6">
          <div className="relative w-full max-w-[447px]">
            <HalfCourtWithZones dots={overlay ? [] : dots} />
            {overlay && (
              <div className="absolute inset-0 flex items-center justify-center">
                {overlay}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-start gap-4">
          <LegendDot color={FIRST_SERVE_COLOR} label="First Serve" />
          <LegendDot color={SECOND_SERVE_COLOR} label="Second Serve" />
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          disabled={!canExpand}
          className={cn(
            "flex items-center gap-1.5 rounded-sm text-[10px] font-medium tracking-[2.5px] uppercase transition-colors duration-200",
            "focus-visible:outline-none",
            canExpand
              ? "cursor-pointer text-[#3B82F6] hover:text-[#2563EB]"
              : "cursor-not-allowed text-[#CCCCCC]",
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
