"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { pickServeShot, pickReturnShot } from "@/lib/data/serve-return-shots";
import {
  computeZoneStats,
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";
import { ServePlacementQuietStrip } from "./serve-placement-quiet-strip";

type ShotRow = {
  shot_number: number | null;
  shot_type: string | null;
  landing_x: number | null;
  landing_y: number | null;
  contact_x: number | null;
  contact_y: number | null;
  spin_type: string | null;
  zone: string | null;
  result: string | null;
  point_id: string;
  points: {
    id: string;
    match_id: string;
    server_is_player1: boolean;
    set_number: number | null;
    result_type: string | null;
    point_score: string | null;
    game_score: string | null;
    won_by_player1: boolean | null;
    rally_length: number | null;
  } | null;
};

export default function ServePlacementHome({ userId }: { userId: string }) {
  const [dots, setDots] = useState<ServeDot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [matchCount, setMatchCount] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(false);
    try {
      const { data: matches } = await supabase
        .from("matches")
        .select("id, player1_name, player2_name")
        .eq("created_by", userId)
        .order("date", { ascending: false })
        .limit(4);

      if (!matches || matches.length === 0) {
        setLoading(false);
        return;
      }

      setMatchCount(matches.length);
      const matchIds = matches.map((m) => m.id);

      // Fetch every shot for these points (not just serves) so each point's
      // return can be located by role; order by shot_number so "first" is
      // earliest. Serve preview dots still null-guard downstream.
      const { data: shotsData } = await supabase
        .from("shots")
        .select(
          "shot_number, shot_type, landing_x, landing_y, contact_x, contact_y, spin_type, zone, result, point_id, points!inner(id, match_id, server_is_player1, set_number, result_type, point_score, game_score, won_by_player1, rally_length)",
        )
        .in("points.match_id", matchIds)
        .order("shot_number", { ascending: true });

      const shots = (shotsData ?? []) as unknown as ShotRow[];

      // Group every shot by point (query is ordered by shot_number) so the
      // played serve and the return can be picked by role — see
      // serve-return-shots.ts.
      const shotsByPoint = new Map<string, ShotRow[]>();
      for (const s of shots) {
        if (!s.points) continue;
        const list = shotsByPoint.get(s.point_id);
        if (list) list.push(s);
        else shotsByPoint.set(s.point_id, [s]);
      }

      const nextDots: ServeDot[] = [];
      for (const pointShots of shotsByPoint.values()) {
        const pt = pointShots[0].points;
        if (!pt) continue;
        const serve = pickServeShot(pointShots);
        const ret = pickReturnShot(pointShots);
        // firstShot* = played serve, secondShot* = return. Mirrors the
        // match-detail mapping in serve-placement-card.tsx.
        const point: ServePointInput = {
          id: pt.id,
          serverIsPlayer1: pt.server_is_player1,
          firstShotLandingX: serve?.landing_x ?? null,
          firstShotLandingY: serve?.landing_y ?? null,
          firstShotZone: serve?.zone ?? null,
          firstShotSpin: serve?.spin_type ?? null,
          firstShotType: serve?.shot_type ?? null,
          firstShotResult: serve?.result ?? null,
          resultType: pt.result_type,
          wonByPlayer1: pt.won_by_player1 ?? false,
          setNumber: pt.set_number ?? undefined,
          pointScore: pt.point_score,
          gameScore: pt.game_score,
          secondShotLandingX: ret?.landing_x ?? null,
          secondShotLandingY: ret?.landing_y ?? null,
          secondShotContactX: ret?.contact_x ?? null,
          secondShotContactY: ret?.contact_y ?? null,
          secondShotType: ret?.shot_type ?? null,
          secondShotSpin: ret?.spin_type ?? null,
          secondShotResult: ret?.result ?? null,
          rallyLength: pt.rally_length ?? undefined,
        };
        // Only player-1 (the viewer's) serves feed the aggregate — an
        // opponent's placement would answer a different question.
        if (!point.serverIsPlayer1) continue;
        const dot = pointToServeDot(point);
        if (dot) nextDots.push(dot);
      }
      setDots(nextDots);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("match-processed", handler);
    return () => window.removeEventListener("match-processed", handler);
  }, [load]);

  const contextLabel = matchCount === 1 ? "1 match" : `last ${matchCount} matches`;
  const zoneStats = useMemo(() => computeZoneStats(dots), [dots]);

  if (loading) {
    return (
      <div className="surface-card flex flex-col gap-3" style={{ padding: "18px 20px" }}>
        <span className="eyebrow">Serve placement</span>
        <div className="flex flex-col gap-2" aria-hidden>
          <div className="h-3.5 w-full animate-pulse rounded-full bg-[#F3F3F3]" />
          <div className="h-3.5 w-full animate-pulse rounded-full bg-[#F3F3F3]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card flex flex-col gap-2" style={{ padding: "18px 20px" }} role="alert">
        <span className="eyebrow">Serve placement</span>
        <p className="text-body-sm">Couldn&apos;t load serve data.</p>
        <button
          type="button"
          onClick={load}
          className="self-start text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Retry
        </button>
      </div>
    );
  }

  return <ServePlacementQuietStrip zoneStats={zoneStats} contextLabel={contextLabel} />;
}
