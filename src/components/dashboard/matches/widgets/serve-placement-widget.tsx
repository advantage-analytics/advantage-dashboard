"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";

import {
  HalfCourtSVG,
  type CourtDot,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
  COURT_W,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import type { MatchPoint } from "@/lib/data/match-points-server";

/* Real court dimensions in meters */
const REAL_HALF_DOUBLES = 5.485;
const REAL_SERVICE_LINE_Y = 5.485;
const REAL_NET_Y = 11.885;

const FIRST_SERVE_COLOR = "rgba(59,130,246,0.5)";
const SECOND_SERVE_COLOR = "rgba(129,140,248,0.5)";

/* ── Helpers ─────────���─────────────────────────────────────── */

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

function seededRandom(id: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  hash = ((hash * 1664525 + 1013904223) | 0) >>> 0;
  return (hash % 10000) / 10000;
}

const ZONE_W = (SINGLES_RIGHT - SINGLES_LEFT) / 6;

function getZoneXRange(zone: string, side: "deuce" | "ad"): [number, number] {
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

function isFirstServe(point: MatchPoint): boolean {
  return !(point.firstShotType?.toLowerCase().includes("second") ?? false);
}

function isDoubleFault(point: MatchPoint): boolean {
  return point.resultType === "Double Fault";
}

function mapPointToDot(point: MatchPoint): CourtDot | null {
  const lx = point.firstShotLandingX;
  const ly = point.firstShotLandingY;
  const isFirst = isFirstServe(point);
  const color = isFirst ? FIRST_SERVE_COLOR : SECOND_SERVE_COLOR;
  const side = getPointSide(point);

  let cx: number;
  let cy: number;

  if (lx != null && ly != null) {
    const absX = Math.abs(lx);
    const signedX = side === "deuce" ? -absX : absX;
    cx = CENTER_X + (signedX / REAL_HALF_DOUBLES) * (COURT_W / 2);
    const yFrac = (ly - REAL_SERVICE_LINE_Y) / (REAL_NET_Y - REAL_SERVICE_LINE_Y);
    cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);

    if (isDoubleFault(point)) {
      cx = Math.max(4, Math.min(COURT_W - 4, cx));
      cy = Math.max(4, Math.min(BASELINE_Y + 15, cy));
    } else {
      cx = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx));
      cy = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy));
    }
  } else if (isDoubleFault(point)) {
    const jx = seededRandom(point.id, 1);
    const jy = seededRandom(point.id, 2);
    cx = SINGLES_LEFT + jx * (SINGLES_RIGHT - SINGLES_LEFT);
    cy = SERVICE_Y + 8 + jy * (BASELINE_Y - SERVICE_Y - 16);
  } else if (point.firstShotZone) {
    const zone = point.firstShotZone;
    const [xMin, xMax] = getZoneXRange(zone, side);
    const jx = seededRandom(point.id, 1);
    const jy = seededRandom(point.id, 2);
    const margin = 8;
    cx = xMin + margin + jx * (xMax - xMin - margin * 2);
    cy = SERVICE_Y + margin + jy * (BASELINE_Y - SERVICE_Y - margin * 2);
  } else {
    return null;
  }

  return { cx, cy, color, opacity: 0.85, id: point.id };
}

/* ── Widget ────────────────────────────────────────────────── */

interface ServePlacementWidgetProps {
  matchId: string;
}

export function ServePlacementWidget({ matchId }: ServePlacementWidgetProps) {
  const { points } = useMatchData();

  const dots = useMemo(() => {
    return points
      .filter((p) => p.serverIsPlayer1)
      .map(mapPointToDot)
      .filter((d): d is CourtDot => d !== null);
  }, [points]);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Serve Placement
        </p>
        <Link
          href={`/dashboard/matches/${matchId}`}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] hover:text-[#2563EB] transition-colors duration-200"
        >
          Explore
        </Link>
      </div>

      {/* Court — compact preview */}
      <div className="bg-[#EFF4FF] flex-1 min-h-[280px]">
        <div className="flex items-center justify-center p-5 h-full">
          {dots.length === 0 ? (
            <p className="text-[12px] text-[#888888]">No serve placement data available.</p>
          ) : (
            <div className="w-full max-w-[400px]">
              <HalfCourtSVG dots={dots} />
            </div>
          )}
        </div>
      </div>

      {/* Legend — compact */}
      <div className="flex items-center gap-4 px-5 h-10">
        <div className="flex gap-1.5 items-center">
          <div className="w-[6px] h-[6px] rounded-full bg-[rgba(59,130,246,0.5)]" aria-hidden="true" />
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">1st Serve</span>
        </div>
        <div className="flex gap-1.5 items-center">
          <div className="w-[6px] h-[6px] rounded-full bg-[rgba(129,140,248,0.5)]" aria-hidden="true" />
          <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">2nd Serve</span>
        </div>
      </div>
    </div>
  );
}
