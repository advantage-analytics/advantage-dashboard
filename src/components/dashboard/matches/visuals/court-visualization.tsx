"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type {
  FilterState,
  VisualizationType,
} from "@/components/dashboard/matches/visuals/types/filters.types";

/* ── Animation constants ─────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

/* ── Court geometry constants ───────────────────────────── */

// Proportions matched to Figma design (node 4998:14511)
// Court: 780×575, Alleys: 150 each side, Service line: 245 from baseline (top)
const COURT_W = 780;
const COURT_H = 700;
const ALLEY = 98;
const SINGLES_LEFT = ALLEY; // 150
const SINGLES_RIGHT = COURT_W - ALLEY; // 630
const SERVICE_Y = 323; // from court top (baseline) to service line — 18/39 of half-court (real proportion)
const CX = COURT_W / 2; // 390 — center line

const PAD_TOP = 16; // reduced — no SVG title needed (card header handles it)
const PAD_BOTTOM = 36; // room for DEUCE/AD labels below
const NET_EXTEND = 60; // net extends past court on each side
const FAR_COURT_H = 30; // far-side extension below the net

// ── Return mode: one continuous court + contact zones below baseline ──
const RET_HALF = COURT_H; // 700 — same as serve half-court
const RET_FULL = RET_HALF * 2; // 1400 total (far baseline → near baseline)
const RET_SVC_FRAC = 5.485 / 11.885; // baseline-to-service-line as fraction of half
const RET_DEPTH_ZONE = RET_HALF / 3; // DEEP / MIDDLE / SHORT zone height on far half
const RET_BANNER_H = 40; // "RETURN CONTACT POSITION" banner overlay at net
const RET_CONTACT_EXTEND = 200; // space below near baseline for INSIDE/NEUTRAL/FAR zones
const RET_CONTACT_ZONE = RET_CONTACT_EXTEND / 3;
const RET_LEFT_PAD = 100; // extra left margin for side labels
const RET_SVG_H = PAD_TOP + RET_FULL + RET_CONTACT_EXTEND + PAD_BOTTOM;

// Zone boundaries — each half of singles area split into 3 equal columns (72px each)
const ZONE_W = (SINGLES_RIGHT - SINGLES_LEFT) / 6; // 72

// Court aesthetics
const COURT_FILL = "#F4F7FA";
const COURT_LINE_COLOR = "#C8D4E0";
const COURT_LABEL_FILL = "#94A3B8";
const COURT_FONT = "var(--font-inter), Inter, sans-serif";

/* ── Dot colors ──────────────────────────────────────────── */

const DOT_COLORS = {
  ace: "#F59E0B",
  won: "#22C55E",
  lost: "#EF4444",
  doubleFault: "#94A3B8",
} as const;

/* ── Types ───────────────────────────────────────────────── */

interface CourtVisualizationProps {
  points: MatchPoint[];
  filters: FilterState;
  visualizationType: VisualizationType;
}

/* ── Helpers ─────────────────────────────────────────────── */

/** Generate SVG polygon points string for a 5-point star */
function starPoints(cx: number, cy: number, outerR: number, innerR: number, pts: number): string {
  const step = Math.PI / pts;
  const coords: string[] = [];
  for (let i = 0; i < 2 * pts; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    coords.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return coords.join(" ");
}

/** Deterministic pseudo-random from string id, returns 0..1 */
function seededRandom(id: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  hash = ((hash * 1664525 + 1013904223) | 0) >>> 0;
  return (hash % 10000) / 10000;
}

type DotResult = "ace" | "won" | "lost" | "doubleFault";

function classifyResult(point: MatchPoint): DotResult {
  if (point.resultType === "Double Fault") return "doubleFault";
  if (point.resultType === "Ace") return "ace";
  const serverWon =
    (point.wonByPlayer1 && point.serverIsPlayer1) ||
    (!point.wonByPlayer1 && !point.serverIsPlayer1);
  return serverWon ? "won" : "lost";
}

function getDotColor(result: DotResult): string {
  return DOT_COLORS[result];
}

function getResultLabel(result: DotResult): string {
  switch (result) {
    case "ace":       return "Ace";
    case "won":       return "Point Won";
    case "lost":      return "Point Lost";
    case "doubleFault": return "Double Fault";
  }
}

/**
 * Map a zone label + side to x-range within the court.
 *
 * Deuce = LEFT half (72→288): WIDE | BODY | T (left to right)
 * Ad    = RIGHT half (288→504): T | BODY | WIDE (left to right)
 */
function getZoneXRange(zone: string, side: "deuce" | "ad"): [number, number] {
  const z = zone.toLowerCase();
  if (side === "deuce") {
    if (z === "wide") return [SINGLES_LEFT, SINGLES_LEFT + ZONE_W];
    if (z === "body") return [SINGLES_LEFT + ZONE_W, SINGLES_LEFT + 2 * ZONE_W];
    return [SINGLES_LEFT + 2 * ZONE_W, CX]; // T
  }
  if (z === "t") return [CX, CX + ZONE_W];
  if (z === "body") return [CX + ZONE_W, CX + 2 * ZONE_W];
  return [CX + 2 * ZONE_W, SINGLES_RIGHT]; // wide
}

/** Derive zone from landing_x coordinate (meters from center line) */
function deriveZoneFromX(landingX: number): string {
  const absX = Math.abs(landingX);
  if (absX >= 2.74) return "wide";
  if (absX >= 1.37) return "body";
  return "t";
}

const TENNIS_SCORE_TO_COUNT: Record<string, number> = {
  "0": 0, "15": 1, "30": 2, "40": 3, "A": 3, "AD": 3,
};

function getPointSide(point: MatchPoint): "deuce" | "ad" {
  const score = (point.pointScore ?? "").toUpperCase().trim();
  if (score === "DEUCE" || score === "40-40") return "deuce";
  if (/^AD?-|-AD?$/.test(score)) return "ad";
  const parts = score.split("-");
  const p1 = TENNIS_SCORE_TO_COUNT[parts[0]?.trim() ?? ""] ?? 0;
  const p2 = TENNIS_SCORE_TO_COUNT[parts[1]?.trim() ?? ""] ?? 0;
  return (p1 + p2) % 2 === 0 ? "deuce" : "ad";
}

/* ── Component ───────────────────────────────────────────── */

export function CourtVisualization({
  points,
  filters,
  visualizationType,
}: CourtVisualizationProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const handleDotClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    setPinnedId((prev) => (prev === pointId ? null : pointId));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setPinnedId(null);
  }, []);

  // Build filter sets for O(1) lookups
  const playerSet = useMemo(() => new Set(filters.player ?? []), [filters.player]);
  const typeSet   = useMemo(() => new Set(filters.type ?? []), [filters.type]);
  const sideSet   = useMemo(() => new Set(filters.side ?? []), [filters.side]);
  const resultSet = useMemo(() => new Set(filters.result ?? []), [filters.result]);
  const setSet    = useMemo(() => new Set(filters.set ?? []), [filters.set]);
  const zoneSet   = useMemo(() => new Set(filters.zone ?? []), [filters.zone]);
  const otherSet  = useMemo(() => new Set(filters.other ?? []), [filters.other]);
  const spinSet   = useMemo(() => new Set(filters.spin ?? []), [filters.spin]);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (visualizationType === "serve") {
        if (playerSet.size > 0) {
          const serverKey = p.serverIsPlayer1 ? "player1" : "player2";
          if (!playerSet.has(serverKey)) return false;
        }
        // Allow points with real coordinates even if zone is null; always include double faults
        if (!p.firstShotZone && p.firstShotLandingX == null && p.resultType !== "Double Fault") return false;
      } else if (visualizationType === "return") {
        if (playerSet.size > 0) {
          const returnerKey = p.serverIsPlayer1 ? "player2" : "player1";
          if (!playerSet.has(returnerKey)) return false;
        }
        if (!p.secondShotZone && p.secondShotLandingX == null) return false;
      }

      if (typeSet.size > 0) {
        const isFirst = p.firstShotType?.toLowerCase().includes("first") ??
          (p.pointScore?.split("-").every((s) => s === "0") ?? false);
        if (typeSet.has("first") && !isFirst) return false;
        if (typeSet.has("second") && isFirst) return false;
      }

      // Side filter: handled via dot opacity dimming, not filtering

      if (resultSet.size > 0) {
        const result = classifyResult(p);
        const mapped =
          result === "ace" ? "ace" :
          result === "doubleFault" ? "doubleFault" :
          result === "won" ? "won" : "lost";
        if (!resultSet.has(mapped)) return false;
      }

      if (setSet.size > 0) {
        if (!setSet.has(String(p.setNumber))) return false;
      }

      // Zone filter: handled via dot opacity dimming, not filtering

      if (otherSet.size > 0) {
        const result = classifyResult(p);
        if (otherSet.has("doubleFault") && result !== "doubleFault") return false;
      }

      if (spinSet.size > 0) {
        const spin = (visualizationType === "return" ? p.secondShotSpin : p.firstShotSpin)?.toLowerCase();
        if (!spin || !spinSet.has(spin)) return false;
      }

      return true;
    });
  }, [points, filters, visualizationType, playerSet, typeSet, sideSet, resultSet, setSet, zoneSet, otherSet, spinSet]);

  // Real court dimensions (meters) for coordinate mapping
  const REAL_HALF_DOUBLES = 5.485;
  const REAL_SERVICE_LINE_Y = 5.485;
  const REAL_NET_Y = 11.885;

  // Court y offsets
  const courtTop = PAD_TOP;
  const serviceLineY = PAD_TOP + SERVICE_Y;
  const baselineY = PAD_TOP + COURT_H;

  // Compute dot positions — use real coordinates when available, fallback to zone-based
  const dots = useMemo(() => {
    const serviceLineYPos = PAD_TOP + SERVICE_Y;
    const baselineYPos = PAD_TOP + COURT_H;

    return filteredPoints.map((point) => {
      const zone = (visualizationType === "return" ? point.secondShotZone : point.firstShotZone) ?? "body";
      const side = getPointSide(point);
      const result = classifyResult(point);

      const landingX = visualizationType === "return" ? point.secondShotLandingX : point.firstShotLandingX;
      const landingY = visualizationType === "return" ? point.secondShotLandingY : point.firstShotLandingY;

      let x: number;
      let y: number;

      if (visualizationType === "return") {
        const retFarBaseline = PAD_TOP;
        if (landingX != null && landingY != null) {
          x = CX + (landingX / REAL_HALF_DOUBLES) * (COURT_W / 2);
          y = retFarBaseline + (landingY / REAL_NET_Y) * RET_HALF;
          x = Math.max(4, Math.min(COURT_W - 4, x));
          y = Math.max(retFarBaseline + 4, Math.min(retFarBaseline + RET_HALF - 4, y));
        } else {
          const [xMin, xMax] = getZoneXRange(zone, side);
          const jx = seededRandom(point.id, 1);
          const jy = seededRandom(point.id, 2);
          const margin = 12;
          x = xMin + margin + jx * (xMax - xMin - margin * 2);
          y = retFarBaseline + margin + jy * (RET_HALF - margin * 2);
        }
      } else if (landingX != null && landingY != null) {
        const absX = Math.abs(landingX);
        const signedX = side === "deuce" ? -absX : absX;
        x = CX + (signedX / REAL_HALF_DOUBLES) * (COURT_W / 2);
        const yFraction = (landingY - REAL_SERVICE_LINE_Y) / (REAL_NET_Y - REAL_SERVICE_LINE_Y);
        y = serviceLineYPos + yFraction * (baselineYPos - serviceLineYPos);

        if (result === "doubleFault") {
          x = Math.max(4, Math.min(COURT_W - 4, x));
          y = Math.max(PAD_TOP + 4, Math.min(baselineYPos + FAR_COURT_H - 4, y));
        } else {
          x = Math.max(SINGLES_LEFT + 4, Math.min(SINGLES_RIGHT - 4, x));
          y = Math.max(serviceLineYPos + 4, Math.min(baselineYPos - 4, y));
        }
      } else if (result === "doubleFault") {
        const jx = seededRandom(point.id, 1);
        const jy = seededRandom(point.id, 2);
        const outsideLeft = jx < 0.3;
        const outsideRight = jx > 0.7;
        if (outsideLeft) {
          x = 4 + jx * (SINGLES_LEFT - 8);
        } else if (outsideRight) {
          x = SINGLES_RIGHT + 4 + (jx - 0.7) / 0.3 * (COURT_W - SINGLES_RIGHT - 8);
        } else {
          x = SINGLES_LEFT + ((jx - 0.3) / 0.4) * (SINGLES_RIGHT - SINGLES_LEFT);
        }
        y = serviceLineYPos + 8 + jy * (baselineYPos - serviceLineYPos - 16);
      } else {
        const [xMin, xMax] = getZoneXRange(zone, side);
        const jx = seededRandom(point.id, 1);
        const jy = seededRandom(point.id, 2);
        const margin = 12;
        x = xMin + margin + jx * (xMax - xMin - margin * 2);
        const serviceBoxH = COURT_H - SERVICE_Y;
        y = PAD_TOP + SERVICE_Y + margin + jy * (serviceBoxH - margin * 2);
      }

      let effectiveZone = (visualizationType === "return" ? point.secondShotZone : point.firstShotZone)?.toLowerCase();
      if (!effectiveZone) {
        const lx = visualizationType === "return" ? point.secondShotLandingX : point.firstShotLandingX;
        if (lx != null) effectiveZone = deriveZoneFromX(lx);
      }

      return { point, x, y, result, color: getDotColor(result), side, zone: effectiveZone ?? "body" };
    });
  }, [filteredPoints, visualizationType]);

  // Determine active side and zone for dot dimming
  const activeSide: "deuce" | "ad" | "both" =
    sideSet.size === 1
      ? (sideSet.has("deuce") ? "deuce" : "ad")
      : "both";

  // ── Shared dot rendering ──
  const dotElements = dots.map((dot) => {
    const result = dot.result;
    const isAce = result === "ace";

    const sideDimmed =
      (activeSide === "deuce" && dot.side === "ad") ||
      (activeSide === "ad" && dot.side === "deuce");
    const zoneDimmed = zoneSet.size > 0 && !zoneSet.has(dot.zone);
    const dotOpacity = (sideDimmed || zoneDimmed) ? 0.15 : 0.85;

    return (
      <Tooltip
        key={dot.point.id}
        open={pinnedId === dot.point.id || hoveredId === dot.point.id}
      >
        <TooltipTrigger asChild>
          <g
            onMouseEnter={() => setHoveredId(dot.point.id)}
            onMouseLeave={() => setHoveredId((prev) => prev === dot.point.id ? null : prev)}
            onClick={(e) => handleDotClick(e, dot.point.id)}
            className="cursor-pointer"
          >
            {(() => {
              const isActive = hoveredId === dot.point.id || pinnedId === dot.point.id;
              return isAce ? (
                <polygon
                  points={starPoints(dot.x, dot.y, isActive ? 9 : 7, isActive ? 4.5 : 3.5, 5)}
                  fill={dot.color}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={1}
                  opacity={dotOpacity}
                  style={{ transition: "all 0.15s ease" }}
                />
              ) : (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={isActive ? 7 : 5}
                  fill={dot.color}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={1}
                  opacity={dotOpacity}
                  style={{ transition: "r 0.15s ease" }}
                />
              );
            })()}
          </g>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={10}
          className="!bg-[#1A1A1A] !text-white !rounded-xl !px-0 !py-0 !text-left !w-auto !border !border-white/10 !shadow-2xl"
        >
          <div className="flex flex-col w-[200px]">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
              style={{ backgroundColor: `${dot.color}18` }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: dot.color }}
              />
              <span
                className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ color: dot.color }}
              >
                {getResultLabel(result)}
              </span>
            </div>
            <div className="flex flex-col gap-2 px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-white/90 text-xs font-medium font-mono tracking-tight">
                  {dot.point.gameScore}
                </span>
                <span className="text-white/40 text-[10px]">
                  {dot.point.pointScore}
                </span>
              </div>
              <div className="h-px bg-white/[0.08]" />
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-[10px]">
                  Set {dot.point.setNumber}
                </span>
                <span className="text-white/50 text-[10px]">
                  {dot.point.rallyLength} {dot.point.rallyLength === 1 ? "shot" : "shots"}
                </span>
              </div>
              {dot.point.description && (
                <span className="text-white/40 text-[10px] leading-tight">
                  {dot.point.description}
                </span>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  });

  // ── Return mode Y positions ──
  const retFarBaseline = PAD_TOP;
  const retNet = PAD_TOP + RET_HALF;
  const retNearBaseline = PAD_TOP + RET_FULL;
  const retFarService = retFarBaseline + Math.round(RET_SVC_FRAC * RET_HALF);
  const retNearService = retNearBaseline - Math.round(RET_SVC_FRAC * RET_HALF);

  const isReturn = visualizationType === "return";
  const svgH = isReturn ? RET_SVG_H : (COURT_H + PAD_TOP + FAR_COURT_H + PAD_BOTTOM);
  const svgLeftPad = isReturn ? RET_LEFT_PAD : NET_EXTEND;
  const svgTotalW = COURT_W + svgLeftPad + NET_EXTEND;

  // ── Point count for subtitle ──
  const shownCount = dots.length;
  const totalCount = points.length;
  const subtitle =
    shownCount === totalCount
      ? `${totalCount} point${totalCount !== 1 ? "s" : ""}`
      : `${shownCount} of ${totalCount} point${totalCount !== 1 ? "s" : ""}`;

  if (points.length === 0) {
    return (
      <div className="bg-white p-6 rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
        <h2 className="text-base font-medium text-[#0D0D0D] mb-6">
          {isReturn ? "Return Placement" : "Serve Placement"}
        </h2>
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
      transition={{ duration: 0.5, delay: 0.2, ease: EASE_CURVE }}
    >
      {/* Card header */}
      <div className="mb-5">
        <h2 className="text-base font-medium text-[#0D0D0D]">
          {isReturn ? "Return Placement" : "Serve Placement"}
        </h2>
        <p className="text-xs text-[#999999] mt-1">{subtitle}</p>
      </div>

      {/* Court SVG */}
      <div className="w-full flex justify-center">
        <svg
          viewBox={`${-svgLeftPad} 0 ${svgTotalW} ${svgH}`}
          className="w-full max-w-[640px]"
          style={{ fontFamily: "inherit" }}
          onClick={handleBackgroundClick}
        >
          {isReturn ? (
            <g>
              {/* ═══ ONE CONTINUOUS COURT + CONTACT ZONES ═══ */}

              {/* Background */}
              <rect x={0} y={retFarBaseline} width={COURT_W} height={RET_FULL + RET_CONTACT_EXTEND} fill={COURT_FILL} />

              {/* Outer border — court area only */}
              <line x1={0} y1={retFarBaseline} x2={COURT_W} y2={retFarBaseline} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={0} y1={retFarBaseline} x2={0} y2={retNearBaseline} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={COURT_W} y1={retFarBaseline} x2={COURT_W} y2={retNearBaseline} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* ── Court lines (both halves) ── */}
              <line x1={SINGLES_LEFT} y1={retFarBaseline} x2={SINGLES_LEFT} y2={retNearBaseline} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={SINGLES_RIGHT} y1={retFarBaseline} x2={SINGLES_RIGHT} y2={retNearBaseline} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={SINGLES_LEFT} y1={retFarService} x2={SINGLES_RIGHT} y2={retFarService} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={SINGLES_LEFT} y1={retNearService} x2={SINGLES_RIGHT} y2={retNearService} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={CX} y1={retFarService} x2={CX} y2={retNet} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={CX} y1={retNet} x2={CX} y2={retNearService} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Net line */}
              <line x1={-NET_EXTEND} y1={retNet} x2={COURT_W + NET_EXTEND} y2={retNet} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Near baseline */}
              <line x1={0} y1={retNearBaseline} x2={COURT_W} y2={retNearBaseline} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* ── Dashed zone dividers on far half ── */}
              <line x1={SINGLES_LEFT + ZONE_W} y1={retFarBaseline} x2={SINGLES_LEFT + ZONE_W} y2={retNet} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={SINGLES_LEFT + 2 * ZONE_W} y1={retFarBaseline} x2={SINGLES_LEFT + 2 * ZONE_W} y2={retNet} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={CX + ZONE_W} y1={retFarBaseline} x2={CX + ZONE_W} y2={retNet} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={CX + 2 * ZONE_W} y1={retFarBaseline} x2={CX + 2 * ZONE_W} y2={retNet} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />

              {/* ── DEEP / MIDDLE / SHORT depth labels & dashed dividers ── */}
              <g fontFamily={COURT_FONT} fontWeight="600" fontSize="13" letterSpacing="0.12em" fill={COURT_LABEL_FILL}>
                <text x={-12} y={retFarBaseline + RET_DEPTH_ZONE * 0.5} textAnchor="end" dominantBaseline="middle">DEEP</text>
                <text x={-12} y={retFarBaseline + RET_DEPTH_ZONE * 1.5} textAnchor="end" dominantBaseline="middle">MIDDLE</text>
                <text x={-12} y={retFarBaseline + RET_DEPTH_ZONE * 2.5} textAnchor="end" dominantBaseline="middle">SHORT</text>
              </g>
              <line x1={0} y1={retFarBaseline + RET_DEPTH_ZONE} x2={COURT_W} y2={retFarBaseline + RET_DEPTH_ZONE} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={0} y1={retFarBaseline + 2 * RET_DEPTH_ZONE} x2={COURT_W} y2={retFarBaseline + 2 * RET_DEPTH_ZONE} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />

              {/* ── RETURN CONTACT POSITION banner ── */}
              <rect x={0} y={retNet + RET_BANNER_H} width={COURT_W} height={RET_BANNER_H} fill="white" />
              <line x1={0} y1={retNet + RET_BANNER_H} x2={COURT_W} y2={retNet + RET_BANNER_H} stroke={COURT_LINE_COLOR} strokeWidth="2" />
              <line x1={0} y1={retNet + 2 * RET_BANNER_H} x2={COURT_W} y2={retNet + 2 * RET_BANNER_H} stroke={COURT_LINE_COLOR} strokeWidth="2" />
              <text
                x={CX}
                y={retNet + RET_BANNER_H + RET_BANNER_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={COURT_LABEL_FILL}
                fontSize="14"
                letterSpacing="0.15em"
                fontWeight="600"
                fontFamily={COURT_FONT}
              >
                RETURN CONTACT POSITION
              </text>

              {/* ── INSIDE / NEUTRAL / FAR labels ── */}
              <g fontFamily={COURT_FONT} fontWeight="600" fontSize="13" letterSpacing="0.12em" fill={COURT_LABEL_FILL}>
                <text x={-12} y={retNearBaseline + RET_CONTACT_ZONE * 0.5} textAnchor="end" dominantBaseline="middle">INSIDE</text>
                <text x={-12} y={retNearBaseline + RET_CONTACT_ZONE * 1.5} textAnchor="end" dominantBaseline="middle">NEUTRAL</text>
                <text x={-12} y={retNearBaseline + RET_CONTACT_ZONE * 2.5} textAnchor="end" dominantBaseline="middle">FAR</text>
              </g>
              <line x1={0} y1={retNearBaseline + RET_CONTACT_ZONE} x2={COURT_W} y2={retNearBaseline + RET_CONTACT_ZONE} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={0} y1={retNearBaseline + 2 * RET_CONTACT_ZONE} x2={COURT_W} y2={retNearBaseline + 2 * RET_CONTACT_ZONE} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />

              {/* Dots */}
              {dotElements}
            </g>
          ) : (
            <g>
              {/* ═══ SERVE PLACEMENT — Half court ═══ */}

              {/* Court background */}
              <rect x={0} y={courtTop} width={COURT_W} height={COURT_H} fill={COURT_FILL} />

              {/* Court outer edges */}
              <line x1={0} y1={courtTop} x2={COURT_W} y2={courtTop} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={0} y1={courtTop} x2={0} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={COURT_W} y1={courtTop} x2={COURT_W} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Service line */}
              <line x1={SINGLES_LEFT} y1={serviceLineY} x2={SINGLES_RIGHT} y2={serviceLineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Singles sidelines */}
              <line x1={SINGLES_LEFT} y1={courtTop} x2={SINGLES_LEFT} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={SINGLES_RIGHT} y1={courtTop} x2={SINGLES_RIGHT} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Zone labels — Deuce side */}
              <g fontFamily={COURT_FONT} fontWeight="600" fontSize="14" letterSpacing="0.15em" fill={COURT_LABEL_FILL}>
                <text x={SINGLES_LEFT + ZONE_W / 2} y={serviceLineY - 12} textAnchor="middle">WIDE</text>
                <text x={SINGLES_LEFT + ZONE_W + ZONE_W / 2} y={serviceLineY - 12} textAnchor="middle">BODY</text>
                <text x={SINGLES_LEFT + 2 * ZONE_W + ZONE_W / 2} y={serviceLineY - 12} textAnchor="middle">T</text>
              </g>

              {/* Zone labels — Ad side */}
              <g fontFamily={COURT_FONT} fontWeight="600" fontSize="14" letterSpacing="0.15em" fill={COURT_LABEL_FILL}>
                <text x={CX + ZONE_W / 2} y={serviceLineY - 12} textAnchor="middle">T</text>
                <text x={CX + ZONE_W + ZONE_W / 2} y={serviceLineY - 12} textAnchor="middle">BODY</text>
                <text x={CX + 2 * ZONE_W + ZONE_W / 2} y={serviceLineY - 12} textAnchor="middle">WIDE</text>
              </g>

              {/* Dashed zone dividers — Deuce side */}
              <line x1={SINGLES_LEFT + ZONE_W} y1={serviceLineY} x2={SINGLES_LEFT + ZONE_W} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={SINGLES_LEFT + 2 * ZONE_W} y1={serviceLineY} x2={SINGLES_LEFT + 2 * ZONE_W} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />

              {/* Dashed zone dividers — Ad side */}
              <line x1={CX + ZONE_W} y1={serviceLineY} x2={CX + ZONE_W} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
              <line x1={CX + 2 * ZONE_W} y1={serviceLineY} x2={CX + 2 * ZONE_W} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="2" strokeDasharray="6 4" />

              {/* Center service line */}
              <line x1={CX} y1={serviceLineY} x2={CX} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Far-side court extension */}
              <rect x={0} y={baselineY} width={COURT_W} height={FAR_COURT_H} fill={COURT_FILL} />
              <line x1={0} y1={baselineY} x2={0} y2={baselineY + FAR_COURT_H} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={COURT_W} y1={baselineY} x2={COURT_W} y2={baselineY + FAR_COURT_H} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={SINGLES_LEFT} y1={baselineY} x2={SINGLES_LEFT} y2={baselineY + FAR_COURT_H} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={SINGLES_RIGHT} y1={baselineY} x2={SINGLES_RIGHT} y2={baselineY + FAR_COURT_H} stroke={COURT_LINE_COLOR} strokeWidth="6" />
              <line x1={CX} y1={baselineY} x2={CX} y2={baselineY + FAR_COURT_H} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Net line */}
              <line x1={-NET_EXTEND} y1={baselineY} x2={COURT_W + NET_EXTEND} y2={baselineY} stroke={COURT_LINE_COLOR} strokeWidth="6" />

              {/* Dots */}
              {dotElements}

              {/* DEUCE / AD labels */}
              <text
                x={(SINGLES_LEFT + CX) / 2}
                y={baselineY + FAR_COURT_H + 24}
                textAnchor="middle"
                fill={COURT_LABEL_FILL}
                fontSize="16"
                letterSpacing="0.15em"
                fontWeight="600"
                fontFamily={COURT_FONT}
              >
                DEUCE
              </text>
              <text
                x={(CX + SINGLES_RIGHT) / 2}
                y={baselineY + FAR_COURT_H + 24}
                textAnchor="middle"
                fill={COURT_LABEL_FILL}
                fontSize="16"
                letterSpacing="0.15em"
                fontWeight="600"
                fontFamily={COURT_FONT}
              >
                AD
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOT_COLORS.won }} />
          <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">Won</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOT_COLORS.lost }} />
          <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">Lost</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
            <polygon points={starPoints(5, 5, 5, 2.5, 5)} fill={DOT_COLORS.ace} />
          </svg>
          <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">Ace</span>
        </div>
        {!isReturn && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOT_COLORS.doubleFault }} />
            <span className="text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]">Double Fault</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
