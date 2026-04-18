"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  HalfCourtSVG,
  type CourtDot,
  DOUBLES_LEFT,
  DOUBLES_RIGHT,
  SINGLES_LEFT,
  SINGLES_RIGHT,
  SERVICE_Y,
  BASELINE_Y,
  CENTER_X,
} from "@/components/dashboard/matches/visuals/half-court-svg";
import { VideoSection } from "@/components/dashboard/matches/sections/video-section";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import type { MatchPoint } from "@/lib/data/match-points-server";

const CARD =
  "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col";
const LABEL =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px]";
const VIEW_MORE =
  "text-[9px] font-medium text-[#3B82F6] uppercase tracking-[1px] hover:text-[#2563EB] transition-colors duration-200";

/* ── Dot generation (matches serve-placement-widget logic) ── */

const FIRST_SERVE_COLOR = "rgba(59,130,246,0.5)";
const SECOND_SERVE_COLOR = "rgba(129,140,248,0.5)";
const REAL_HALF_DOUBLES = 5.485;
const REAL_SERVICE_Y = 5.485;
const REAL_NET_Y = 11.885;
const SCORE_MAP: Record<string, number> = { "0": 0, "15": 1, "30": 2, "40": 3, A: 3, AD: 3 };

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

function mapPointToDot(point: MatchPoint): CourtDot | null {
  const lx = point.firstShotLandingX;
  const ly = point.firstShotLandingY;
  const isFirst = !(point.firstShotType?.toLowerCase().includes("second") ?? false);
  const color = isFirst ? FIRST_SERVE_COLOR : SECOND_SERVE_COLOR;
  const side = getPointSide(point);

  let cx: number;
  let cy: number;

  if (lx != null && ly != null) {
    const absX = Math.abs(lx);
    const signedX = side === "deuce" ? -absX : absX;
    const DOUBLES_HALF_W = (DOUBLES_RIGHT - DOUBLES_LEFT) / 2;
    cx = CENTER_X + (signedX / REAL_HALF_DOUBLES) * DOUBLES_HALF_W;
    const yFrac = (ly - REAL_SERVICE_Y) / (REAL_NET_Y - REAL_SERVICE_Y);
    cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);
    cx = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx));
    cy = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy));
  } else if (point.firstShotZone) {
    const ZONE_W = (SINGLES_RIGHT - SINGLES_LEFT) / 6;
    const zone = point.firstShotZone.toLowerCase();
    let xMin: number, xMax: number;
    if (side === "deuce") {
      if (zone === "wide") { xMin = SINGLES_LEFT; xMax = SINGLES_LEFT + ZONE_W; }
      else if (zone === "body") { xMin = SINGLES_LEFT + ZONE_W; xMax = SINGLES_LEFT + 2 * ZONE_W; }
      else { xMin = SINGLES_LEFT + 2 * ZONE_W; xMax = CENTER_X; }
    } else {
      if (zone === "t") { xMin = CENTER_X; xMax = CENTER_X + ZONE_W; }
      else if (zone === "body") { xMin = CENTER_X + ZONE_W; xMax = CENTER_X + 2 * ZONE_W; }
      else { xMin = CENTER_X + 2 * ZONE_W; xMax = SINGLES_RIGHT; }
    }
    const jx = seededRandom(point.id, 1);
    const jy = seededRandom(point.id, 2);
    cx = xMin + 8 + jx * (xMax - xMin - 16);
    cy = SERVICE_Y + 8 + jy * (BASELINE_Y - SERVICE_Y - 16);
  } else {
    return null;
  }

  return { cx, cy, color, opacity: 0.85 };
}

/* ── Component ────────────────────────────────────────────── */

interface CourtVideoRowProps {
  matchId: string;
}

export function CourtVideoRow({ matchId }: CourtVideoRowProps) {
  const { points } = useMatchData();

  const dots = useMemo(
    () =>
      points
        .filter((p) => p.serverIsPlayer1)
        .map(mapPointToDot)
        .filter((d): d is CourtDot => d !== null),
    [points],
  );

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Court Visualization */}
      <div className={CARD}>
        <div className="flex items-center justify-between px-6 h-12">
          <p className={LABEL}>Court Visualization</p>
          <Link
            href={`/dashboard/matches/${matchId}/visuals`}
            className={VIEW_MORE}
          >
            View More
          </Link>
        </div>
        <div className="flex-1 bg-[#EFF4FF] flex items-center justify-center px-24 py-8">
          <HalfCourtSVG dots={dots} />
        </div>
      </div>

      {/* Match Video */}
      <VideoSection matchId={matchId} />
    </div>
  );
}
