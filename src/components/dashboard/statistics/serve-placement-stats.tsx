"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
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

/* Real court dimensions (meters) */
const REAL_HALF_DOUBLES = 5.485;
const REAL_SERVICE_LINE_Y = 5.485;
const REAL_NET_Y = 11.885;
const COURT_LENGTH = 23.77;

const FIRST_SERVE_COLOR = "rgba(59,130,246,0.5)";
const SECOND_SERVE_COLOR = "rgba(129,140,248,0.5)";

/* ── Helpers (adapted from serve-placement-home.tsx) ───────── */

const TENNIS_SCORE_TO_COUNT: Record<string, number> = {
  "0": 0, "15": 1, "30": 2, "40": 3, "A": 3, "AD": 3,
};

function getPointSide(pointScore: string): "deuce" | "ad" {
  const score = (pointScore ?? "").toUpperCase().trim();
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

interface DbPointRow {
  id: string;
  point_score: string | null;
  result_type: string | null;
}

interface DbShotRow {
  point_id: string;
  shot_type: string | null;
  zone: string | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
}

interface ServeData {
  id: string;
  pointScore: string;
  resultType: string;
  isFirstServe: boolean;
  zone: string | null;
  landingX: number | null;
  landingY: number | null;
}

function mapServeToDot(serve: ServeData): CourtDot | null {
  const { landingX: lx, landingY: ly, id, resultType } = serve;
  const isFirst = serve.isFirstServe;
  const color = isFirst ? FIRST_SERVE_COLOR : SECOND_SERVE_COLOR;
  const side = getPointSide(serve.pointScore);
  const isDF = resultType === "Double Fault";

  let cx: number;
  let cy: number;

  if (lx != null && ly != null) {
    const absX = Math.abs(lx);
    const signedX = side === "deuce" ? -absX : absX;
    cx = CENTER_X + (signedX / REAL_HALF_DOUBLES) * (COURT_W / 2);
    const yFrac = (ly - REAL_SERVICE_LINE_Y) / (REAL_NET_Y - REAL_SERVICE_LINE_Y);
    cy = SERVICE_Y + yFrac * (BASELINE_Y - SERVICE_Y);
    if (isDF) {
      cx = Math.max(4, Math.min(COURT_W - 4, cx));
      cy = Math.max(4, Math.min(BASELINE_Y + 15, cy));
    } else {
      cx = Math.max(SINGLES_LEFT + 2, Math.min(SINGLES_RIGHT - 2, cx));
      cy = Math.max(SERVICE_Y + 2, Math.min(BASELINE_Y - 2, cy));
    }
  } else if (isDF) {
    const jx = seededRandom(id, 1);
    const jy = seededRandom(id, 2);
    cx = SINGLES_LEFT + jx * (SINGLES_RIGHT - SINGLES_LEFT);
    cy = SERVICE_Y + 8 + jy * (BASELINE_Y - SERVICE_Y - 16);
  } else if (serve.zone) {
    const [xMin, xMax] = getZoneXRange(serve.zone, side);
    const jx = seededRandom(id, 1);
    const jy = seededRandom(id, 2);
    const margin = 8;
    cx = xMin + margin + jx * (xMax - xMin - margin * 2);
    cy = SERVICE_Y + margin + jy * (BASELINE_Y - SERVICE_Y - margin * 2);
  } else {
    return null;
  }

  return { cx, cy, color, opacity: 0.85, id, isSecondServe: !isFirst };
}

/* ── Component ─────────────────────────────────────────────── */

interface Props {
  matchIds: string[];
}

interface ZoneCounts {
  wide: number;
  body: number;
  t: number;
  total: number;
}

export function ServePlacementStats({ matchIds }: Props) {
  const [dots, setDots] = useState<CourtDot[]>([]);
  const [zones, setZones] = useState<ZoneCounts>({ wide: 0, body: 0, t: 0, total: 0 });
  const [counts, setCounts] = useState({ first: 0, second: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (matchIds.length === 0) {
      setDots([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    setLoading(true);
    setError(false);

    try {
      const { data: pointsData } = await supabase
        .from("points")
        .select("id, point_score, result_type, server_is_player1")
        .in("match_id", matchIds)
        .eq("server_is_player1", true);

      if (!pointsData || pointsData.length === 0) {
        setDots([]);
        setLoading(false);
        return;
      }

      const pointIds = pointsData.map((p) => p.id);

      const { data: shotsData } = await supabase
        .from("shots")
        .select("point_id, shot_type, zone, contact_y, landing_x, landing_y")
        .in("point_id", pointIds)
        .eq("shot_number", 1);

      const shotByPointId = new Map<string, DbShotRow>();
      if (shotsData) {
        for (const shot of shotsData as DbShotRow[]) {
          shotByPointId.set(shot.point_id, shot);
        }
      }

      const serveDots: CourtDot[] = [];
      let firstCount = 0;
      let secondCount = 0;
      const zc: ZoneCounts = { wide: 0, body: 0, t: 0, total: 0 };

      for (const point of pointsData as DbPointRow[]) {
        const shot = shotByPointId.get(point.id);
        const isFirstServe = !(shot?.shot_type?.toLowerCase().includes("second") ?? false);

        let landingX = shot?.landing_x ?? null;
        let landingY = shot?.landing_y ?? null;
        const serverAtNearEnd = shot?.contact_y != null && shot.contact_y < 12;
        if (serverAtNearEnd && landingX != null && landingY != null) {
          landingX = -landingX;
          landingY = COURT_LENGTH - landingY;
        }

        const dot = mapServeToDot({
          id: point.id,
          pointScore: point.point_score ?? "0-0",
          resultType: point.result_type ?? "",
          isFirstServe,
          zone: shot?.zone ?? null,
          landingX,
          landingY,
        });

        if (dot) {
          serveDots.push(dot);
          if (isFirstServe) firstCount++;
          else secondCount++;
        }

        const z = (shot?.zone ?? "").toLowerCase();
        if (z === "wide" || z === "w") zc.wide++;
        else if (z === "body" || z === "b") zc.body++;
        else if (z === "t") zc.t++;
        zc.total++;
      }

      setDots(serveDots);
      setCounts({ first: firstCount, second: secondCount });
      setZones(zc);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [matchIds]);

  useEffect(() => {
    load();
  }, [load]);

  const idsKey = matchIds.join(",");
  useEffect(() => {
    // Re-fetch when matchIds change (already handled by `load` dep)
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          Serve Placement
        </h2>
        <p className="text-[12px] font-normal text-[#71717A] mt-1">
          {dots.length > 0
            ? `${dots.length} serves across ${matchIds.length} matches`
            : loading
              ? "Loading serves…"
              : "No serve data yet"}
        </p>
      </div>

      {/* Court visualization */}
      <div className="bg-[#EFF4FF] mx-3 rounded-lg overflow-hidden">
        {loading ? (
          <Skeleton className="w-full h-[300px]" />
        ) : error ? (
          <div className="flex items-center justify-center h-[300px] text-[12px] text-[#AAAAAA]">
            Failed to load serve data
          </div>
        ) : dots.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-[12px] text-[#AAAAAA]">
            No serve placement data available
          </div>
        ) : (
          <div className="h-[300px] sm:h-[340px]">
            <HalfCourtSVG dots={dots} />
          </div>
        )}
      </div>

      {/* Legend + Zone breakdown */}
      {dots.length > 0 && (
        <div className="px-5 py-4 flex items-center justify-between">
          {/* Serve type legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              <span className="text-[10px] font-normal text-[#525252]">
                1st serve ({counts.first})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[#8B5CF6]" />
              <span className="text-[10px] font-normal text-[#525252]">
                2nd serve ({counts.second})
              </span>
            </div>
          </div>

          {/* Zone distribution */}
          {zones.total > 0 && (
            <div className="flex items-center gap-3">
              {[
                { label: "Wide", count: zones.wide },
                { label: "Body", count: zones.body },
                { label: "T", count: zones.t },
              ].map(({ label, count }) => {
                const pct = Math.round((count / zones.total) * 100);
                return (
                  <div key={label} className="flex items-center gap-1">
                    <span className="text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[1.5px]">
                      {label}
                    </span>
                    <span className="text-[12px] font-light text-[#0D0D0D] tabular-nums">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
