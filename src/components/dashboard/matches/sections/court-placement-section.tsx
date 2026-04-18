"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, Target, Maximize2, X, Plus, Minus, RotateCcw } from "lucide-react";
import {
  HalfCourtSVG,
  FullCourtSVG,
  type CourtDot,
  type DotMeta,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
  COURT_W,
  FULL_SVG_FAR_BASELINE,
  FULL_SVG_NET_Y,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import { FilterPills } from "@/components/dashboard/matches/visuals/filter-pills";
import type {
  VisualizationType,
  FilterGroupConfig,
  FilterOption,
  FilterContextData,
} from "@/components/dashboard/matches/visuals/types/filters.types";
import { isDynamicOption } from "@/components/dashboard/matches/visuals/types/filters.types";
import { useVisualFilters } from "@/hooks/use-visual-filters";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { cn } from "@/lib/utils";
import type { MatchPoint } from "@/lib/data/match-points-server";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ── Color ────────────────────────────────────────────────── */

type ColorMode = "serveType" | "result";

const SERVE_TYPE_COLORS = { first: "rgba(59,130,246,0.5)", second: "rgba(129,140,248,0.5)" };
const RESULT_COLORS = { ace: "#EAB308", won: "#5DB955", lost: "#E51837", doubleFault: "#AAAAAA" } as const;
type DotResult = keyof typeof RESULT_COLORS;

const SERVE_LEGEND = [
  { key: "first", color: SERVE_TYPE_COLORS.first, label: "1st Serve" },
  { key: "second", color: SERVE_TYPE_COLORS.second, label: "2nd Serve" },
];
const RESULT_LEGEND = [
  { key: "won", color: RESULT_COLORS.won, label: "Won" },
  { key: "lost", color: RESULT_COLORS.lost, label: "Lost" },
  { key: "ace", color: RESULT_COLORS.ace, label: "Ace" },
  { key: "doubleFault", color: RESULT_COLORS.doubleFault, label: "Double Fault" },
];
const RESULT_LABELS: Record<DotResult, string> = { ace: "Ace", won: "Point Won", lost: "Point Lost", doubleFault: "Double Fault" };

/* ── Helpers ──────────────────────────────────────────────── */

const SCORE_MAP: Record<string, number> = { "0": 0, "15": 1, "30": 2, "40": 3, A: 3, AD: 3 };
const REAL_HALF_DOUBLES = 5.485;
const REAL_SERVICE_Y = 5.485;
const REAL_NET_Y = 11.885;
const ZONE_W = (SINGLES_RIGHT - SINGLES_LEFT) / 6;

function getPointSide(p: MatchPoint): "deuce" | "ad" {
  const s = (p.pointScore ?? "").toUpperCase().trim();
  if (s === "DEUCE" || s === "40-40") return "deuce";
  if (/^AD?-|-AD?$/.test(s)) return "ad";
  const parts = s.split("-");
  return ((SCORE_MAP[parts[0]?.trim() ?? ""] ?? 0) + (SCORE_MAP[parts[1]?.trim() ?? ""] ?? 0)) % 2 === 0 ? "deuce" : "ad";
}

function seededRandom(id: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (((h * 1664525 + 1013904223) | 0) >>> 0) % 10000 / 10000;
}

function classifyResult(p: MatchPoint): DotResult {
  if (p.resultType === "Double Fault") return "doubleFault";
  if (p.resultType === "Ace") return "ace";
  return (p.wonByPlayer1 && p.serverIsPlayer1) || (!p.wonByPlayer1 && !p.serverIsPlayer1) ? "won" : "lost";
}

function isFirstServe(p: MatchPoint): boolean {
  return !(p.firstShotType?.toLowerCase().includes("second") ?? false);
}

function zoneXRange(zone: string, side: "deuce" | "ad"): [number, number] {
  const z = zone.toLowerCase();
  if (side === "deuce") {
    if (z === "wide") return [SINGLES_LEFT, SINGLES_LEFT + ZONE_W];
    if (z === "body") return [SINGLES_LEFT + ZONE_W, SINGLES_LEFT + 2 * ZONE_W];
    return [SINGLES_LEFT + 2 * ZONE_W, CENTER_X];
  }
  if (z === "t") return [CENTER_X, CENTER_X + ZONE_W];
  if (z === "body") return [CENTER_X + ZONE_W, CENTER_X + 2 * ZONE_W];
  return [CENTER_X + 2 * ZONE_W, SINGLES_RIGHT];
}

function deriveZone(lx: number): string {
  const a = Math.abs(lx);
  return a >= 2.74 ? "wide" : a >= 1.37 ? "body" : "t";
}

function buildMeta(p: MatchPoint, r: DotResult): DotMeta {
  return { resultLabel: RESULT_LABELS[r], gameScore: p.gameScore || "", pointScore: p.pointScore || "", setNumber: p.setNumber, rallyLength: p.rallyLength, serveType: isFirstServe(p) ? "First Serve" : "Second Serve" };
}

function dotColor(p: MatchPoint, mode: ColorMode, result: DotResult): string {
  return mode === "serveType"
    ? isFirstServe(p) ? SERVE_TYPE_COLORS.first : SERVE_TYPE_COLORS.second
    : RESULT_COLORS[result];
}

/* ── Dot mapping ──────────────────────────────────────────── */

function mapServeDot(p: MatchPoint, mode: ColorMode): CourtDot | null {
  const lx = p.firstShotLandingX, ly = p.firstShotLandingY;
  const result = classifyResult(p);
  const side = getPointSide(p);
  let cx: number, cy: number;

  if (lx != null && ly != null) {
    const signedX = side === "deuce" ? -Math.abs(lx) : Math.abs(lx);
    cx = CENTER_X + (signedX / REAL_HALF_DOUBLES) * (COURT_W / 2);
    cy = SERVICE_Y + ((ly - REAL_SERVICE_Y) / (REAL_NET_Y - REAL_SERVICE_Y)) * (BASELINE_Y - SERVICE_Y);
    if (result === "doubleFault") { cx = Math.max(4, Math.min(COURT_W - 4, cx)); cy = Math.max(4, Math.min(BASELINE_Y + 15, cy)); }
    else { cx = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx)); cy = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy)); }
  } else if (result === "doubleFault") {
    cx = SINGLES_LEFT + seededRandom(p.id, 1) * (SINGLES_RIGHT - SINGLES_LEFT);
    cy = SERVICE_Y + 8 + seededRandom(p.id, 2) * (BASELINE_Y - SERVICE_Y - 16);
  } else {
    const zone = p.firstShotZone ?? "body";
    const [xMin, xMax] = zoneXRange(zone, side);
    const jx = seededRandom(p.id, 1), jy = seededRandom(p.id, 2), m = 8;
    cx = xMin + m + jx * (xMax - xMin - m * 2);
    cy = SERVICE_Y + m + jy * (BASELINE_Y - SERVICE_Y - m * 2);
  }

  return { cx, cy, color: dotColor(p, mode, result), opacity: 0.85, id: p.id, isAce: result === "ace", meta: buildMeta(p, result) };
}

function mapReturnDot(p: MatchPoint, mode: ColorMode): CourtDot | null {
  const lx = p.secondShotLandingX, ly = p.secondShotLandingY;
  const result = classifyResult(p);
  const farH = FULL_SVG_NET_Y - FULL_SVG_FAR_BASELINE;
  let cx: number, cy: number;

  if (lx != null && ly != null) {
    cx = CENTER_X + (lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
    cy = FULL_SVG_FAR_BASELINE + (ly / REAL_NET_Y) * farH;
    cx = Math.max(4, Math.min(COURT_W - 4, cx));
    cy = Math.max(FULL_SVG_FAR_BASELINE + 4, Math.min(FULL_SVG_NET_Y - 4, cy));
  } else {
    const side = getPointSide(p);
    const [xMin, xMax] = zoneXRange(p.secondShotZone ?? "body", side);
    const jx = seededRandom(p.id, 1), jy = seededRandom(p.id, 2), m = 12;
    cx = xMin + m + jx * (xMax - xMin - m * 2);
    cy = FULL_SVG_FAR_BASELINE + m + jy * (farH - m * 2);
  }

  return { cx, cy, color: dotColor(p, mode, result), opacity: 0.85, id: p.id, isAce: result === "ace", meta: buildMeta(p, result) };
}

/* ── Filter resolver ──────────────────────────────────────── */

function resolveOptions(g: FilterGroupConfig, ctx: FilterContextData): FilterOption[] {
  return g.options.map((o) => isDynamicOption(o) ? { value: o.value, label: ctx[o.labelKey] } : o);
}

/* ── Zoom constants ───────────────────────────────────────── */

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const WHEEL_SENSITIVITY = 0.002;

/* ── Fullscreen Modal ────────────────────────────────────── */

interface FullscreenCourtProps {
  dots: CourtDot[];
  isReturn: boolean;
  vizType: VisualizationType;
  colorMode: ColorMode;
  legend: { key: string; color: string; label: string }[];
  hiddenKeys: Set<string>;
  onHiddenKeysChange: (fn: (prev: Set<string>) => Set<string>) => void;
  onVizTypeChange: (t: VisualizationType) => void;
  onColorModeChange: (m: ColorMode) => void;
  activeFilterCount: number;
  clearAllFilters: () => void;
  config: ReturnType<typeof useVisualFilters>["config"];
  filters: Record<string, string[]>;
  updateFilter: (k: string, v: string[]) => void;
  ctxData: FilterContextData;
  onClose: () => void;
}

function FullscreenCourt({
  dots,
  isReturn,
  vizType,
  colorMode,
  legend,
  hiddenKeys,
  onHiddenKeysChange,
  onVizTypeChange,
  onColorModeChange,
  activeFilterCount,
  clearAllFilters,
  config,
  filters,
  updateFilter,
  ctxData,
  onClose,
}: FullscreenCourtProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const courtRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const clampPan = useCallback((px: number, py: number, z: number) => {
    if (z <= 1) return { x: 0, y: 0 };
    const el = courtRef.current;
    if (!el) return { x: px, y: py };
    const rect = el.getBoundingClientRect();
    const maxPanX = (rect.width * (z - 1)) / 2;
    const maxPanY = (rect.height * (z - 1)) / 2;
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, px)),
      y: Math.max(-maxPanY, Math.min(maxPanY, py)),
    };
  }, []);

  const zoomTo = useCallback((newZoom: number, originX?: number, originY?: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    const el = courtRef.current;
    if (el && originX !== undefined && originY !== undefined) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = originX - cx;
      const dy = originY - cy;
      const factor = clamped / zoom;
      const newPanX = pan.x * factor + dx * (1 - factor);
      const newPanY = pan.y * factor + dy * (1 - factor);
      setPan(clampPan(newPanX, newPanY, clamped));
    } else if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
    setZoom(clamped);
  }, [zoom, pan, clampPan]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * WHEEL_SENSITIVITY;
    zoomTo(zoom * (1 + delta), e.clientX, e.clientY);
  }, [zoom, zoomTo]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [zoom, pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan(clampPan(dragStart.current.panX + dx, dragStart.current.panY + dy, zoom));
  }, [isDragging, zoom, clampPan]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (zoom >= MAX_ZOOM) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      zoomTo(Math.min(zoom * 2, MAX_ZOOM), e.clientX, e.clientY);
    }
  }, [zoom, zoomTo]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomPct = Math.round(zoom * 100);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <motion.div
        className="relative z-10 flex flex-col m-4 sm:m-6 bg-white rounded-2xl shadow-[0px_8px_32px_rgba(0,0,0,0.25)] overflow-hidden flex-1"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-[#F3F3F3]">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
              Court Placement
            </p>
            <span className="text-[10px] font-normal text-[#AAAAAA] tabular-nums">
              {dots.length} pt{dots.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer p-1.5 -m-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            aria-label="Close fullscreen view"
          >
            <X className="h-4 w-4 text-[#767676]" strokeWidth={1.5} />
          </button>
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-4 px-5 py-3 shrink-0">
          <div className="flex items-center rounded-full bg-[#F5F5F5] p-0.5">
            {(["serve", "return"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { onVizTypeChange(tab); setPinnedId(null); setHoveredId(null); }}
                className={cn(
                  "rounded-full px-3.5 h-7 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                  vizType === tab
                    ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#767676] hover:text-[#525252]",
                )}
              >
                {tab === "serve" ? "Serve" : "Return"}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-[#E7E7E7]" />
          <span className="text-[9px] font-medium text-[#767676] uppercase tracking-[1.5px]">Color by</span>
          <div className="flex items-center gap-1.5">
            {([{ mode: "serveType" as ColorMode, label: "1st / 2nd" }, { mode: "result" as ColorMode, label: "Win / Loss" }]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => onColorModeChange(mode)}
                className={cn(
                  "rounded-full h-7 px-3 text-[11px] font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                  colorMode === mode
                    ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                    : "ring-1 ring-inset ring-[#EAECF0] text-[#767676] bg-white hover:bg-[#F9FAFB] hover:text-[#525252]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Court area — zoomable */}
        <div
          ref={courtRef}
          className={cn(
            "flex-1 bg-[#F7FAFC] overflow-hidden relative select-none",
            zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          style={{ touchAction: "none" }}
        >
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <div className={cn("w-full px-8", isReturn ? "max-w-[500px]" : "max-w-[560px]")}>
              {dots.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-center py-12">
                  <div className="bg-[#F5F5F5] p-2.5 rounded-full">
                    <Target className="h-5 w-5 text-[#888888]" strokeWidth={1.5} />
                  </div>
                  <p className="text-[12px] font-medium text-[#525252]">
                    {activeFilterCount > 0 ? "No matching points" : "No placement data"}
                  </p>
                  {activeFilterCount > 0 && (
                    <button onClick={clearAllFilters} className="cursor-pointer text-[11px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200">
                      Clear filters
                    </button>
                  )}
                </div>
              ) : isReturn ? (
                <FullCourtSVG
                  dots={dots}
                  hoveredId={hoveredId}
                  pinnedId={pinnedId}
                  onDotHover={(id) => setHoveredId(id)}
                  onDotClick={(id) => setPinnedId((prev) => prev === id ? null : id)}
                  onBackgroundClick={() => setPinnedId(null)}
                />
              ) : (
                <HalfCourtSVG
                  dots={dots}
                  hoveredId={hoveredId}
                  pinnedId={pinnedId}
                  onDotHover={(id) => setHoveredId(id)}
                  onDotClick={(id) => setPinnedId((prev) => prev === id ? null : id)}
                  onBackgroundClick={() => setPinnedId(null)}
                />
              )}
            </div>
          </div>

          {/* Zoom controls — floating bottom-right */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-[0px_2px_8px_rgba(0,0,0,0.1)] p-1">
            <button
              onClick={() => zoomTo(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="cursor-pointer p-1.5 rounded-md hover:bg-[#F5F5F5] transition-colors duration-150 disabled:opacity-30 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5 text-[#525252]" strokeWidth={1.5} />
            </button>
            <span className="text-[10px] font-medium text-[#767676] tabular-nums w-9 text-center select-none">
              {zoomPct}%
            </span>
            <button
              onClick={() => zoomTo(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="cursor-pointer p-1.5 rounded-md hover:bg-[#F5F5F5] transition-colors duration-150 disabled:opacity-30 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5 text-[#525252]" strokeWidth={1.5} />
            </button>
            {zoom > 1 && (
              <button
                onClick={resetZoom}
                className="cursor-pointer p-1.5 rounded-md hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                aria-label="Reset zoom"
              >
                <RotateCcw className="h-3.5 w-3.5 text-[#525252]" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Footer: legend + filters */}
        <div className="flex items-center justify-between px-5 h-11 shrink-0 border-t border-[#F3F3F3]">
          <div className="flex gap-4 items-center">
            {legend.map(({ key, color, label }) => {
              const hidden = hiddenKeys.has(key);
              return (
                <button
                  key={key}
                  onClick={() => onHiddenKeysChange((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  className="flex gap-1.5 items-center transition-opacity duration-200 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  aria-pressed={!hidden}
                >
                  <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ backgroundColor: color, opacity: hidden ? 0.3 : 1 }} aria-hidden="true" />
                  <span className={cn("text-[9px] font-normal text-[#AAAAAA] tracking-[1px] uppercase whitespace-nowrap", hidden && "line-through opacity-50")}>{label}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setFiltersOpen((p) => !p)}
            className="cursor-pointer flex items-center gap-1 text-[10px] font-medium text-[#525252] uppercase tracking-[1.5px] hover:text-[#0D0D0D] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
          >
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", filtersOpen && "rotate-180")} />
          </button>
        </div>

        {/* Filters panel */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="overflow-hidden shrink-0"
            >
              <div className="border-t border-[#F3F3F3] px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-medium text-[#767676] uppercase tracking-[2.5px]">Filters</p>
                  {activeFilterCount > 0 && (
                    <button onClick={clearAllFilters} className="cursor-pointer text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] hover:text-[#2563EB] transition-colors duration-200">
                      Clear All
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {config.rows.map((row, ri) => (
                    <div key={ri} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                      {(row.filter(Boolean) as FilterGroupConfig[]).map((g) => (
                        <FilterPills key={g.key} label={g.label} options={resolveOptions(g, ctxData)} selected={filters[g.key] ?? []} onChange={(v) => updateFilter(g.key, v)} multiSelect={g.multiSelect !== false} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/* ── Section ──────────────────────────────────────────────── */

export function CourtPlacementSection() {
  const { match, points } = useMatchData();
  const prefersReduced = useReducedMotion();

  const [vizType, setVizType] = useState<VisualizationType>("serve");
  const [colorMode, setColorMode] = useState<ColorMode>("serveType");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const { config, filters, setFilters } = useVisualFilters({ initialType: vizType });
  const isReturn = vizType === "return";

  const handleTabClick = useCallback((t: VisualizationType) => {
    setVizType(t);
    setPinnedId(null);
    setHoveredId(null);
  }, []);

  const activeFilterCount = useMemo(() => Object.values(filters).reduce((n, a) => n + a.length, 0), [filters]);
  const clearAllFilters = useCallback(() => setFilters(Object.fromEntries(Object.keys(filters).map((k) => [k, []]))), [filters, setFilters]);
  const updateFilter = useCallback((k: string, v: string[]) => setFilters({ ...filters, [k]: v }), [filters, setFilters]);

  // Filter sets
  const playerSet = useMemo(() => new Set(filters.player ?? []), [filters.player]);
  const typeSet = useMemo(() => new Set(filters.type ?? []), [filters.type]);
  const resultSet = useMemo(() => new Set(filters.result ?? []), [filters.result]);
  const setSet = useMemo(() => new Set(filters.set ?? []), [filters.set]);
  const otherSet = useMemo(() => new Set(filters.other ?? []), [filters.other]);
  const spinSet = useMemo(() => new Set(filters.spin ?? []), [filters.spin]);
  const sideSet = useMemo(() => new Set(filters.side ?? []), [filters.side]);
  const zoneSet = useMemo(() => new Set(filters.zone ?? []), [filters.zone]);

  const filteredPoints = useMemo(() => points.filter((p) => {
    if (isReturn) {
      if (!p.secondShotZone && p.secondShotLandingX == null) return false;
      if (playerSet.size > 0 && !playerSet.has(p.serverIsPlayer1 ? "player2" : "player1")) return false;
    } else {
      if (!p.firstShotZone && p.firstShotLandingX == null && p.resultType !== "Double Fault") return false;
      if (playerSet.size > 0 && !playerSet.has(p.serverIsPlayer1 ? "player1" : "player2")) return false;
    }
    if (typeSet.size > 0) { const f = isFirstServe(p); if ((typeSet.has("first") && !f) || (typeSet.has("second") && f)) return false; }
    if (resultSet.size > 0 && !resultSet.has(classifyResult(p))) return false;
    if (setSet.size > 0 && !setSet.has(String(p.setNumber))) return false;
    if (otherSet.size > 0 && otherSet.has("doubleFault") && classifyResult(p) !== "doubleFault") return false;
    if (spinSet.size > 0) { const s = (isReturn ? p.secondShotSpin : p.firstShotSpin)?.toLowerCase(); if (!s || !spinSet.has(s)) return false; }
    return true;
  }), [points, isReturn, playerSet, typeSet, resultSet, setSet, otherSet, spinSet]);

  const dots = useMemo(() => {
    const out: CourtDot[] = [];
    for (const p of filteredPoints) {
      if (hiddenKeys.size > 0) {
        if (colorMode === "serveType" && hiddenKeys.has(isFirstServe(p) ? "first" : "second")) continue;
        if (colorMode === "result" && hiddenKeys.has(classifyResult(p))) continue;
      }
      const side = getPointSide(p);
      const activeSide = sideSet.size === 1 ? (sideSet.has("deuce") ? "deuce" : "ad") : "both";
      const sideDim = (activeSide === "deuce" && side === "ad") || (activeSide === "ad" && side === "deuce");
      const shotZone = isReturn ? p.secondShotZone : p.firstShotZone;
      let ez = shotZone?.toLowerCase();
      if (!ez) { const lx = isReturn ? p.secondShotLandingX : p.firstShotLandingX; if (lx != null) ez = deriveZone(lx); }
      const zoneDim = zoneSet.size > 0 && ez && !zoneSet.has(ez);
      const dim = sideDim || zoneDim ? 0.15 : 1;
      const dot = isReturn ? mapReturnDot(p, colorMode) : mapServeDot(p, colorMode);
      if (dot) out.push({ ...dot, opacity: (dot.opacity ?? 0.85) * dim });
    }
    return out;
  }, [filteredPoints, colorMode, isReturn, sideSet, zoneSet, hiddenKeys]);

  useEffect(() => { if (pinnedId && !dots.some((d) => d.id === pinnedId)) setPinnedId(null); }, [dots, pinnedId]);

  const legend = colorMode === "serveType" ? SERVE_LEGEND : RESULT_LEGEND;
  const ctxData = useMemo(() => ({ player1Name: match.player1.name, player2Name: match.player2.name }), [match]);

  return (
    <motion.section
      initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden"
      aria-label="Court placement"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Court Placement
          </p>
          <span className="text-[10px] font-normal text-[#AAAAAA] tabular-nums">
            {dots.length} pt{dots.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setFullscreen(true)}
          className="cursor-pointer flex items-center gap-1 text-[10px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] hover:text-[#2563EB] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded"
          aria-label="Open fullscreen court view"
        >
          Fullscreen <Maximize2 className="h-3 w-3" />
        </button>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-4 px-5 pb-3">
        {/* Serve / Return toggle */}
        <div className="flex items-center rounded-full bg-[#F5F5F5] p-0.5">
          {(["serve", "return"] as const).map((tab) => {
            const active = vizType === tab;
            return (
              <button
                key={tab}
                onClick={() => handleTabClick(tab)}
                className={cn(
                  "rounded-full px-3.5 h-7 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                  active
                    ? "bg-white text-[#0D0D0D] shadow-[0px_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#767676] hover:text-[#525252]",
                )}
              >
                {tab === "serve" ? "Serve" : "Return"}
              </button>
            );
          })}
        </div>

        {/* Color mode toggle */}
        <div className="w-px h-4 bg-[#E7E7E7]" />
        <span className="text-[9px] font-medium text-[#767676] uppercase tracking-[1.5px]">Color by</span>
        <div className="flex items-center gap-1.5">
          {([{ mode: "serveType" as ColorMode, label: "1st / 2nd" }, { mode: "result" as ColorMode, label: "Win / Loss" }]).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => { setColorMode(mode); setHiddenKeys(new Set()); }}
              className={cn(
                "rounded-full h-7 px-3 text-[11px] font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40",
                colorMode === mode
                  ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                  : "ring-1 ring-inset ring-[#EAECF0] text-[#767676] bg-white hover:bg-[#F9FAFB] hover:text-[#525252]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Court area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={vizType}
          initial={prefersReduced ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReduced ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className={cn(
            "bg-[#F7FAFC] flex items-center justify-center px-6",
            isReturn ? "min-h-[520px] py-6" : "h-[450px]",
          )}
        >
          {dots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="bg-[#F5F5F5] p-2.5 rounded-full">
                <Target className="h-5 w-5 text-[#888888]" strokeWidth={1.5} />
              </div>
              <p className="text-[12px] font-medium text-[#525252]">
                {activeFilterCount > 0 ? "No matching points" : "No placement data"}
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} className="cursor-pointer text-[11px] font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={cn("w-full", isReturn ? "max-w-[400px]" : "max-w-[447px]")}>
              {isReturn ? (
                <FullCourtSVG
                  dots={dots}
                  hoveredId={hoveredId}
                  pinnedId={pinnedId}
                  onDotHover={(id) => setHoveredId(id)}
                  onDotClick={(id) => setPinnedId((prev) => prev === id ? null : id)}
                  onBackgroundClick={() => setPinnedId(null)}
                />
              ) : (
                <HalfCourtSVG
                  dots={dots}
                  hoveredId={hoveredId}
                  pinnedId={pinnedId}
                  onDotHover={(id) => setHoveredId(id)}
                  onDotClick={(id) => setPinnedId((prev) => prev === id ? null : id)}
                  onBackgroundClick={() => setPinnedId(null)}
                />
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer: legend + filters */}
      <div className="flex items-center justify-between px-5 h-11">
        <div className="flex gap-4 items-center">
          {legend.map(({ key, color, label }) => {
            const hidden = hiddenKeys.has(key);
            return (
              <button
                key={key}
                onClick={() => setHiddenKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                className="flex gap-1.5 items-center transition-opacity duration-200 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                aria-pressed={!hidden}
              >
                <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ backgroundColor: color, opacity: hidden ? 0.3 : 1 }} aria-hidden="true" />
                <span className={cn("text-[9px] font-normal text-[#AAAAAA] tracking-[1px] uppercase whitespace-nowrap", hidden && "line-through opacity-50")}>{label}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setFiltersOpen((p) => !p)}
          className="cursor-pointer flex items-center gap-1 text-[10px] font-medium text-[#525252] uppercase tracking-[1.5px] hover:text-[#0D0D0D] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
        >
          Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", filtersOpen && "rotate-180")} />
        </button>
      </div>

      {/* Filters panel */}
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#F3F3F3] px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-medium text-[#767676] uppercase tracking-[2.5px]">Filters</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="cursor-pointer text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] hover:text-[#2563EB] transition-colors duration-200">
                    Clear All
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {config.rows.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                    {(row.filter(Boolean) as FilterGroupConfig[]).map((g) => (
                      <FilterPills key={g.key} label={g.label} options={resolveOptions(g, ctxData)} selected={filters[g.key] ?? []} onChange={(v) => updateFilter(g.key, v)} multiSelect={g.multiSelect !== false} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {fullscreen && (
          <FullscreenCourt
            dots={dots}
            isReturn={isReturn}
            vizType={vizType}
            colorMode={colorMode}
            legend={legend}
            hiddenKeys={hiddenKeys}
            onHiddenKeysChange={setHiddenKeys}
            onVizTypeChange={(t) => { setVizType(t); setPinnedId(null); setHoveredId(null); }}
            onColorModeChange={(m) => { setColorMode(m); setHiddenKeys(new Set()); }}
            activeFilterCount={activeFilterCount}
            clearAllFilters={clearAllFilters}
            config={config}
            filters={filters}
            updateFilter={updateFilter}
            ctxData={ctxData}
            onClose={() => setFullscreen(false)}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}
