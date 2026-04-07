"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

interface ServeDot {
  x: number;
  y: number;
  isFirstServe: boolean;
}

// Court dimensions (matches Figma frame 98:4736)
const COURT_W = 447;
const COURT_H = 350;

// Court layout positions (pixel values from Figma)
const DOUBLES_LEFT = 37.4;
const DOUBLES_RIGHT = 410.9;
const DOUBLES_TOP = 0;
const DOUBLES_BOTTOM = 349.7;
const SINGLES_LEFT = 84.2;
const SINGLES_RIGHT = 362.4;
const SERVICE_Y = 155;
const BASELINE_Y = 331;
const CENTER_X = (SINGLES_LEFT + SINGLES_RIGHT) / 2;
const BOX_HALF = (SINGLES_RIGHT - SINGLES_LEFT) / 2;

// Zone divider x positions (each service box split into thirds: T / body / wide)
const ZONE_LINES_X = [
  SINGLES_LEFT + BOX_HALF / 3,
  SINGLES_LEFT + (BOX_HALF * 2) / 3,
  CENTER_X + BOX_HALF / 3,
  CENTER_X + (BOX_HALF * 2) / 3,
];

// Unified court line styling
const COURT_COLOR = "#D6E4F9";
const SOLID_WEIGHT = 1.5;
const DASHED_WEIGHT = 1;

function HalfCourtSVG({ dots }: { dots: ServeDot[] }) {
  return (
    <svg
      viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Serve placement court diagram showing where serves landed in the last 4 matches"
    >
      {/* Court background */}
      <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#EFF4FF" />

      {/* Doubles court outline */}
      <rect
        x={DOUBLES_LEFT}
        y={DOUBLES_TOP}
        width={DOUBLES_RIGHT - DOUBLES_LEFT}
        height={DOUBLES_BOTTOM - DOUBLES_TOP}
        fill="none"
        stroke={COURT_COLOR}
        strokeWidth={SOLID_WEIGHT}
      />

      {/* Left singles sideline */}
      <line
        x1={SINGLES_LEFT}
        y1={DOUBLES_TOP}
        x2={SINGLES_LEFT}
        y2={DOUBLES_BOTTOM}
        stroke={COURT_COLOR}
        strokeWidth={SOLID_WEIGHT}
      />

      {/* Right singles sideline */}
      <line
        x1={SINGLES_RIGHT}
        y1={DOUBLES_TOP}
        x2={SINGLES_RIGHT}
        y2={DOUBLES_BOTTOM}
        stroke={COURT_COLOR}
        strokeWidth={SOLID_WEIGHT}
      />

      {/* Service line */}
      <line
        x1={SINGLES_LEFT}
        y1={SERVICE_Y}
        x2={SINGLES_RIGHT}
        y2={SERVICE_Y}
        stroke={COURT_COLOR}
        strokeWidth={SOLID_WEIGHT}
      />

      {/* Baseline (full width) */}
      <line
        x1={0}
        y1={BASELINE_Y}
        x2={COURT_W}
        y2={BASELINE_Y}
        stroke={COURT_COLOR}
        strokeWidth={SOLID_WEIGHT}
      />

      {/* Center service line (solid, service line to bottom) */}
      <line
        x1={CENTER_X}
        y1={SERVICE_Y}
        x2={CENTER_X}
        y2={DOUBLES_BOTTOM}
        stroke={COURT_COLOR}
        strokeWidth={SOLID_WEIGHT}
      />

      {/* Zone divider lines (dashed, each box into thirds) */}
      {ZONE_LINES_X.map((x, i) => (
        <line
          key={i}
          x1={x}
          y1={SERVICE_Y}
          x2={x}
          y2={BASELINE_Y}
          stroke={COURT_COLOR}
          strokeWidth={DASHED_WEIGHT}
          strokeDasharray="5,5"
        />
      ))}

      {/* Serve placement dots */}
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={SINGLES_LEFT + dot.x * (SINGLES_RIGHT - SINGLES_LEFT)}
          cy={SERVICE_Y + dot.y * (BASELINE_Y - SERVICE_Y)}
          r={4}
          fill={dot.isFirstServe ? "rgba(59,130,246,0.5)" : "rgba(129,140,248,0.5)"}
        />
      ))}
    </svg>
  );
}

export default function ServePlacementHome() {
  const [dots, setDots] = useState<ServeDot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get last 4 matches
      const { data: matches } = await supabase
        .from("matches")
        .select("id, player1_id")
        .eq("created_by", user.id)
        .order("date", { ascending: false })
        .limit(4);

      if (!matches || matches.length === 0) return;

      const matchIds = matches.map((m) => m.id);

      // Fetch serve shots from the shots table
      const { data: shots } = await supabase
        .from("shots")
        .select("match_id, shot_type, x_coordinate, y_coordinate, serve_number")
        .in("match_id", matchIds)
        .eq("shot_type", "serve")
        .not("x_coordinate", "is", null)
        .not("y_coordinate", "is", null)
        .limit(100);

      if (shots && shots.length > 0) {
        // Normalize coordinates to 0-1 range within service box
        const xValues = shots.map((s) => s.x_coordinate as number);
        const yValues = shots.map((s) => s.y_coordinate as number);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;

        const serveDots: ServeDot[] = shots.map((s) => ({
          x: (((s.x_coordinate as number) - minX) / rangeX) * 0.8 + 0.1,
          y: (((s.y_coordinate as number) - minY) / rangeY) * 0.8 + 0.1,
          isFirstServe: s.serve_number === 1,
        }));
        setDots(serveDots);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("match-created", handler);
    return () => window.removeEventListener("match-created", handler);
  }, [load]);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-clip">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          SERVE PLACEMENT
        </p>
        <p className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">
          LAST 4 MATCHES
        </p>
      </div>

      {/* Court area */}
      <div className="bg-[#EFF4FF] h-[415px]">
        <div className="flex items-center justify-center p-6 h-full">
          {loading ? (
            <div className="w-full flex flex-col items-center justify-center gap-4">
              <Skeleton className="w-full max-w-[400px] h-[300px] rounded-[8px]" />
            </div>
          ) : (
            <div className="w-full max-w-[447px]">
              <HalfCourtSVG dots={dots} />
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex gap-4 items-start">
          <div className="flex gap-1.5 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-[rgba(59,130,246,0.5)]" aria-hidden="true" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">
              FIRST SERVE
            </span>
          </div>
          <div className="flex gap-1.5 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-[rgba(129,140,248,0.5)]" aria-hidden="true" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">
              SECOND SERVE
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/matches"
          className="text-[9px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] transition-[color,transform] duration-200 ease-out hover:text-[#2563EB] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 rounded-sm"
        >
          FULL COURT VIEW
        </Link>
      </div>
    </div>
  );
}
