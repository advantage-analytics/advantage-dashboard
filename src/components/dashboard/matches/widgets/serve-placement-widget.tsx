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

function mapPointToDot(point: MatchPoint): CourtDot | null {
  const lx = point.firstShotLandingX;
  const ly = point.firstShotLandingY;
  if (lx == null || ly == null) return null;

  const isFirst = !(point.firstShotType?.toLowerCase().includes("second") ?? false);

  // Map real meter coords to SVG court pixels (use full court width like original)
  const cx = CENTER_X + (lx / REAL_HALF_DOUBLES) * (COURT_W / 2);
  const yFrac = (ly - REAL_SERVICE_LINE_Y) / (REAL_NET_Y - REAL_SERVICE_LINE_Y);
  const cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);

  // Clamp within service box
  const clampedCx = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx));
  const clampedCy = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy));

  return {
    cx: clampedCx,
    cy: clampedCy,
    color: isFirst ? FIRST_SERVE_COLOR : SECOND_SERVE_COLOR,
    id: point.id,
  };
}

interface ServePlacementWidgetProps {
  matchId: string;
}

export function ServePlacementWidget({ matchId }: ServePlacementWidgetProps) {
  const { points } = useMatchData();

  const dots = useMemo(() => {
    // Only include serve points (points where the server hit)
    return points
      .filter((p) => p.firstShotLandingX != null && p.firstShotLandingY != null)
      .map(mapPointToDot)
      .filter((d): d is CourtDot => d !== null);
  }, [points]);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-[47px]">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Serve Placement
        </p>
        <Link
          href={`/dashboard/matches/${matchId}/visuals`}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] hover:text-[#2563EB] transition-colors duration-200"
        >
          VIEW MORE
        </Link>
      </div>

      {/* Court — same styling as home page */}
      <div className="bg-[#EFF4FF] h-[300px] sm:h-[350px] md:h-[415px]">
        <div className="flex items-center justify-center p-6 h-full">
          {dots.length === 0 ? (
            <p className="text-[13px] text-[#888888]">No serve placement data available.</p>
          ) : (
            <div className="w-full max-w-[447px]">
              <HalfCourtSVG dots={dots} />
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex gap-4 items-center">
          <div className="flex gap-1.5 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-[rgba(59,130,246,0.5)]" aria-hidden="true" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">FIRST SERVE</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-[rgba(129,140,248,0.5)]" aria-hidden="true" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">SECOND SERVE</span>
          </div>
        </div>
        <span className="text-[10px] font-normal text-[#AAAAAA] tabular-nums">
          {dots.length} serve{dots.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
