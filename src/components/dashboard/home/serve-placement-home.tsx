"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Target } from "lucide-react";

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

/* ── Zone definitions ────────────────────────────────────── */

type ZoneKey = "deuce-wide" | "deuce-body" | "deuce-t" | "ad-t" | "ad-body" | "ad-wide";

const ZONES: { key: ZoneKey; label: string; x1: number; x2: number }[] = [
  { key: "deuce-wide", label: "Wide", x1: SINGLES_LEFT, x2: ZONE_LINES_X[0] },
  { key: "deuce-body", label: "Body", x1: ZONE_LINES_X[0], x2: ZONE_LINES_X[1] },
  { key: "deuce-t", label: "T", x1: ZONE_LINES_X[1], x2: CENTER_X },
  { key: "ad-t", label: "T", x1: CENTER_X, x2: ZONE_LINES_X[2] },
  { key: "ad-body", label: "Body", x1: ZONE_LINES_X[2], x2: ZONE_LINES_X[3] },
  { key: "ad-wide", label: "Wide", x1: ZONE_LINES_X[3], x2: SINGLES_RIGHT },
];

function classifyZone(dot: ServeDot): ZoneKey {
  const cx = SINGLES_LEFT + dot.x * (SINGLES_RIGHT - SINGLES_LEFT);
  for (const z of ZONES) {
    if (cx >= z.x1 && cx < z.x2) return z.key;
  }
  return cx < CENTER_X ? "deuce-t" : "ad-t";
}

interface ZoneStats {
  count: number;
  pct: number;
  first: number;
  second: number;
  firstPct: number;
  secondPct: number;
}

function computeZoneStats(dots: ServeDot[]): Record<ZoneKey, ZoneStats> {
  const totals: Record<ZoneKey, { count: number; first: number; second: number }> = {
    "deuce-wide": { count: 0, first: 0, second: 0 },
    "deuce-body": { count: 0, first: 0, second: 0 },
    "deuce-t": { count: 0, first: 0, second: 0 },
    "ad-t": { count: 0, first: 0, second: 0 },
    "ad-body": { count: 0, first: 0, second: 0 },
    "ad-wide": { count: 0, first: 0, second: 0 },
  };
  for (const d of dots) {
    const z = classifyZone(d);
    totals[z].count++;
    if (d.isFirstServe) totals[z].first++;
    else totals[z].second++;
  }
  const total = dots.length || 1;
  const result = {} as Record<ZoneKey, ZoneStats>;
  for (const key of Object.keys(totals) as ZoneKey[]) {
    const t = totals[key];
    result[key] = {
      count: t.count,
      pct: Math.round((t.count / total) * 100),
      first: t.first,
      second: t.second,
      firstPct: t.count > 0 ? Math.round((t.first / t.count) * 100) : 0,
      secondPct: t.count > 0 ? Math.round((t.second / t.count) * 100) : 0,
    };
  }
  return result;
}

/* ── Court SVG with zone-level interaction ───────────────── */

const L = { stroke: COURT_COLOR, strokeWidth: SOLID_WEIGHT, strokeLinecap: "round" as const };

function HalfCourtSVG({ dots }: { dots: ServeDot[] }) {
  const [activeZone, setActiveZone] = useState<ZoneKey | null>(null);
  const stats = dots.length > 0 ? computeZoneStats(dots) : null;

  const handleZoneEnter = (key: ZoneKey) => setActiveZone(key);
  const handleZoneLeave = () => setActiveZone(null);
  const handleZoneTap = (key: ZoneKey) => setActiveZone((prev) => (prev === key ? null : key));
  const [focusedZone, setFocusedZone] = useState<ZoneKey | null>(null);
  const handleZoneKeyDown = (e: React.KeyboardEvent, key: ZoneKey) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleZoneTap(key);
    } else if (e.key === "Escape") {
      setActiveZone(null);
    }
  };

  return (
    <div className="relative w-full">
      <svg
        viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Serve placement court diagram showing where serves landed"
        onPointerLeave={handleZoneLeave}
      >
        <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#EFF4FF" />

        {/* Court lines */}
        <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={DOUBLES_TOP} {...L} />
        <line x1={DOUBLES_LEFT} y1={DOUBLES_TOP} x2={DOUBLES_LEFT} y2={BASELINE_Y} {...L} />
        <line x1={DOUBLES_RIGHT} y1={DOUBLES_TOP} x2={DOUBLES_RIGHT} y2={BASELINE_Y} {...L} />
        <line x1={SINGLES_LEFT} y1={DOUBLES_TOP} x2={SINGLES_LEFT} y2={BASELINE_Y} {...L} />
        <line x1={SINGLES_RIGHT} y1={DOUBLES_TOP} x2={SINGLES_RIGHT} y2={BASELINE_Y} {...L} />
        <line x1={SINGLES_LEFT} y1={SERVICE_Y} x2={SINGLES_RIGHT} y2={SERVICE_Y} {...L} />
        <line x1={0} y1={BASELINE_Y} x2={COURT_W} y2={BASELINE_Y} {...L} />
        <line x1={CENTER_X} y1={SERVICE_Y} x2={CENTER_X} y2={BASELINE_Y} {...L} />

        {/* Zone dividers (dashed) */}
        {ZONE_LINES_X.map((x, i) => (
          <line key={i} x1={x} y1={SERVICE_Y} x2={x} y2={BASELINE_Y}
            stroke={COURT_COLOR} strokeWidth={DASHED_WEIGHT} strokeDasharray="5,5" />
        ))}

        {/* Dots — static, no individual hover */}
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={SINGLES_LEFT + dot.x * (SINGLES_RIGHT - SINGLES_LEFT)}
            cy={SERVICE_Y + dot.y * (BASELINE_Y - SERVICE_Y)}
            r={2.5}
            fill={dot.isFirstServe ? "rgba(59,130,246,0.65)" : "rgba(139,92,246,0.8)"}
            style={{ pointerEvents: "none" }}
          />
        ))}

        {/* Zone labels — persistent percentage + name for glanceability */}
        {stats && ZONES.map((z) => {
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
                y={BASELINE_Y - 16}
                textAnchor="middle"
                fill="#888888"
                fontSize={10}
                fontWeight={500}
                fontFamily="Inter, sans-serif"
              >
                {zs.pct}%
              </text>
            </g>
          );
        })}

        {/* Interactive zone overlays — render on top for pointer events */}
        {dots.length > 0 && ZONES.map((z) => {
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
                onPointerEnter={() => handleZoneEnter(z.key)}
                onClick={() => handleZoneTap(z.key)}
                onFocus={() => setFocusedZone(z.key)}
                onBlur={() => setFocusedZone(null)}
                onKeyDown={(e) => handleZoneKeyDown(e, z.key)}
                tabIndex={0}
                role="button"
                aria-label={`${z.key.startsWith("deuce") ? "Deuce" : "Ad"} ${z.label} zone, ${stats?.[z.key].pct ?? 0}% of serves`}
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
              {focusedZone === z.key && (
                <rect
                  x={z.x1 + 1.5}
                  y={SERVICE_Y + 1.5}
                  width={z.x2 - z.x1 - 3}
                  height={BASELINE_Y - SERVICE_Y - 3}
                  fill="none"
                  stroke="rgba(59,130,246,0.4)"
                  strokeWidth={2}
                  rx={2}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Zone tooltip */}
      {activeZone && stats && stats[activeZone].count > 0 && (() => {
        const zone = ZONES.find((z) => z.key === activeZone)!;
        const zs = stats[activeZone];
        const midX = (zone.x1 + zone.x2) / 2;
        const xPct = (midX / COURT_W) * 100;
        const yPct = (SERVICE_Y / COURT_H) * 100;
        const side = activeZone.startsWith("deuce") ? "Deuce" : "Ad";

        const dominant = zs.first >= zs.second ? "first" : "second";
        const accentColor = dominant === "first" ? "#3B82F6" : "#8B5CF6";

        // Edge-aware horizontal positioning to prevent clipping
        const translateX = xPct < 25 ? "0%" : xPct > 75 ? "-100%" : "-50%";

        return (
          <div
            className="absolute pointer-events-none z-10 bg-white rounded-xl shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] py-2.5 px-3 flex flex-col gap-2 w-[168px] overflow-hidden"
            style={{
              left: `${xPct}%`,
              top: `${yPct}%`,
              transform: `translate(${translateX}, calc(-100% - 8px))`,
              border: "1px solid #F3F3F3",
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
                {zs.pct}%
              </span>
            </div>
            <div className="h-px bg-[#F3F3F3]" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="size-[5px] rounded-full bg-[#3B82F6] shrink-0" />
                  <span className="text-[10px] text-[#525252]">1st Serve</span>
                </span>
                <span className="text-[10px] text-[#3B82F6] tabular-nums font-medium">{zs.first} <span className="text-[#AAAAAA] font-normal">of {zs.count}</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="size-[5px] rounded-full bg-[#8B5CF6] shrink-0" />
                  <span className="text-[10px] text-[#525252]">2nd Serve</span>
                </span>
                <span className="text-[10px] text-[#8B5CF6] tabular-nums font-medium">{zs.second} <span className="text-[#AAAAAA] font-normal">of {zs.count}</span></span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function ServePlacementHome({ userId }: { userId: string }) {
  const [dots, setDots] = useState<ServeDot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [latestMatchId, setLatestMatchId] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(false);
    try {
      // Get last 4 matches
      const { data: matches } = await supabase
        .from("matches")
        .select("id, player1_id")
        .eq("created_by", userId)
        .order("date", { ascending: false })
        .limit(4);

      if (!matches || matches.length === 0) {
        setLoading(false);
        return;
      }

      setLatestMatchId(matches[0].id);
      setMatchCount(matches.length);
      const matchIds = matches.map((m) => m.id);

      // Fetch player 1 serve shots only
      const { data: shots } = await supabase
        .from("shots")
        .select("shot_type, landing_x, landing_y, points!inner(match_id, server_is_player1)")
        .in("points.match_id", matchIds)
        .eq("points.server_is_player1", true)
        .in("shot_type", ["First Serve", "Second Serve"])
        .not("landing_x", "is", null)
        .not("landing_y", "is", null);

      if (shots && shots.length > 0) {
        // Map real-world meter coordinates to court SVG positions
        // Uses same coordinate system as match detail court visualization
        const REAL_HALF_DOUBLES = 5.485;
        const REAL_SERVICE_Y = 5.485;
        const REAL_NET_Y = 11.885;

        const serveDots: ServeDot[] = shots
          .map((s) => {
            const lx = s.landing_x as number;
            const ly = s.landing_y as number;

            // Map x: real meters to court SVG — center is 0, negative = deuce side
            // REAL_HALF_DOUBLES (5.485m) maps to the doubles sideline half-width in SVG
            const DOUBLES_HALF_W = (DOUBLES_RIGHT - DOUBLES_LEFT) / 2;
            const cx = CENTER_X + (lx / REAL_HALF_DOUBLES) * DOUBLES_HALF_W;
            // Map y: service line to baseline
            const yFrac = (ly - REAL_SERVICE_Y) / (REAL_NET_Y - REAL_SERVICE_Y);
            const cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);

            // Clamp within service box bounds
            const clampedX = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx));
            const clampedY = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy));

            return {
              x: (clampedX - SINGLES_LEFT) / (SINGLES_RIGHT - SINGLES_LEFT),
              y: (clampedY - SERVICE_Y) / (BASELINE_Y - SERVICE_Y),
              isFirstServe: s.shot_type === "First Serve",
            };
          });
        setDots(serveDots);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch only when match processing completes (stats/shots are ready)
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("match-processed", handler);
    return () => window.removeEventListener("match-processed", handler);
  }, [load]);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          SERVE PLACEMENT
        </p>
        <p className="text-[10px] font-normal text-[#AAAAAA] uppercase tracking-[1px]">
          {matchCount === 1 ? "1 MATCH" : `LAST ${matchCount} MATCHES`}
        </p>
      </div>

      {/* Court area */}
      <div className="bg-[#EFF4FF] h-[300px] sm:h-[350px] md:h-[415px]">
        <div className="flex items-center justify-center p-6 h-full">
          {loading ? (
            <div className="w-full max-w-[447px] relative" aria-busy="true">
              <HalfCourtSVG dots={[]} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2.5 bg-white rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-[#3B82F6] animate-pulse motion-reduce:animate-none" />
                    <span className="text-[10px] font-medium text-[#525252] uppercase tracking-[2px]">
                      Loading serves
                    </span>
                  </div>
                  <span className="text-[10px] text-[#AAAAAA]">
                    Fetching placement data
                  </span>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="w-full max-w-[447px] relative">
              <HalfCourtSVG dots={[]} />
              <div className="absolute inset-0 flex items-center justify-center" role="alert">
                <div className="flex flex-col items-center gap-2 bg-white rounded-lg px-5 py-4">
                  <AlertCircle className="text-[#E51837] size-5" aria-hidden />
                  <p className="text-[12px] font-medium text-[#0D0D0D]">
                    Couldn&apos;t load serve data
                  </p>
                  <p className="text-[11px] text-[#888888] max-w-[200px] text-center leading-[1.5]">
                    Check your connection and try again
                  </p>
                  <button
                    type="button"
                    onClick={load}
                    className="flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  >
                    <RefreshCw className="size-3" aria-hidden />
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : dots.length === 0 ? (
            <div className="w-full max-w-[447px] relative">
              <HalfCourtSVG dots={[]} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2.5 bg-white rounded-lg px-5 py-4 text-center">
                  <div className="bg-[#F5F5F5] p-4 rounded-full">
                    <Target className="h-8 w-8 text-[#888888]" aria-hidden />
                  </div>
                  <p className="text-[12px] font-medium text-[#0D0D0D]">
                    No serve data yet
                  </p>
                  <p className="text-[12px] text-[#888888] max-w-[220px] leading-[1.5]">
                    Upload a match to see where your serves land
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[447px]">
              <HalfCourtSVG dots={dots} />
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex gap-4 items-start">
          <div className="flex gap-1.5 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-[rgba(59,130,246,0.65)]" aria-hidden="true" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">
              FIRST SERVE
            </span>
          </div>
          <div className="flex gap-1.5 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-[rgba(139,92,246,0.8)]" aria-hidden="true" />
            <span className="text-[10px] font-normal text-[#AAAAAA] tracking-[1px]">
              SECOND SERVE
            </span>
          </div>
        </div>
        <Link
          href={latestMatchId ? `/dashboard/matches/${latestMatchId}` : "/dashboard/matches"}
          className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2.5px] transition-colors duration-200 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
        >
          {latestMatchId ? "FULL COURT VIEW" : "VIEW MATCHES"}
        </Link>
      </div>
    </div>
  );
}
