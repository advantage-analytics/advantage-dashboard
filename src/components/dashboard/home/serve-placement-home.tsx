"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Target } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { pickServeShot, pickReturnShot } from "@/lib/data/serve-return-shots";
import {
  ServePlacementWidget,
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";

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
  const [points, setPoints] = useState<ServePointInput[]>([]);
  const [ctxData, setCtxData] = useState<{ player1Name: string; player2Name: string }>({
    player1Name: "You",
    player2Name: "Opponent",
  });
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
      // Home aggregates serves across the last N matches (many opponents), so a
      // single match's names would mislabel the filter. Use generic aggregate
      // labels: the player2 bucket holds every opponent, not one person.
      setCtxData({
        player1Name: "You",
        player2Name: "Opponents",
      });
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
      const nextPoints: ServePointInput[] = [];
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
        nextPoints.push(point);
        // Preview dots match the fullscreen's initial state (Player 1 only) so
        // the collapsed widget and the expanded view agree on first load.
        if (!point.serverIsPlayer1) continue;
        const dot = pointToServeDot(point);
        if (dot) nextDots.push(dot);
      }
      setDots(nextDots);
      setPoints(nextPoints);
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

  const contextLabel = matchCount === 1 ? "1 MATCH" : `LAST ${matchCount} MATCHES`;

  const overlay = loading ? (
    <LoadingOverlay />
  ) : error ? (
    <ErrorOverlay onRetry={load} />
  ) : dots.length === 0 ? (
    <EmptyOverlay />
  ) : null;

  return (
    <ServePlacementWidget
      dots={dots}
      points={points}
      contextLabel={contextLabel}
      ctxData={ctxData}
      overlay={overlay}
    />
  );
}

function LoadingOverlay() {
  return (
    <div aria-busy="true" className="flex flex-col items-center gap-2.5 bg-white rounded-lg px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="size-1.5 rounded-full bg-[#3B82F6] animate-pulse motion-reduce:animate-none" />
        <span className="text-[10px] font-medium text-[#525252] uppercase tracking-[2px]">
          Loading serves
        </span>
      </div>
      <span className="text-[10px] text-[#AAAAAA]">Fetching placement data</span>
    </div>
  );
}

function ErrorOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 bg-white rounded-lg px-5 py-4">
      <AlertCircle className="text-[#E51837] size-5" aria-hidden />
      <p className="text-[12px] font-medium text-[#0D0D0D]">Couldn&apos;t load serve data</p>
      <p className="text-[11px] text-[#888888] max-w-[200px] text-center leading-[1.5]">
        Check your connection and try again
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
      >
        <RefreshCw className="size-3" aria-hidden />
        Retry
      </button>
    </div>
  );
}

function EmptyOverlay() {
  return (
    <div className="flex flex-col items-center gap-2.5 bg-white rounded-lg px-5 py-4 text-center">
      <div className="bg-[#F5F5F5] p-4 rounded-full">
        <Target className="h-8 w-8 text-[#888888]" aria-hidden />
      </div>
      <p className="text-[12px] font-medium text-[#0D0D0D]">No serve data yet</p>
      <p className="text-[12px] text-[#888888] max-w-[220px] leading-[1.5]">
        Upload a match to see where your serves land
      </p>
    </div>
  );
}
