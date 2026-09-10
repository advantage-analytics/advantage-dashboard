import type { SupabaseClient } from "@supabase/supabase-js";
import { pickServeShot, pickReturnShot } from "@/lib/data/serve-return-shots";
import {
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
} from "@/lib/data/serve-zones";
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

export interface HomeServeData {
  dots: ServeDot[];
  matchCount: number;
}
export async function loadHomeServes(
  supabase: SupabaseClient,
  userId: string,
  initialMatches?: { id: string }[],
): Promise<HomeServeData> {
  const { data: matches, error: matchError } = initialMatches
    ? { data: initialMatches, error: null }
    : await supabase
        .from("matches")
        .select("id, player1_name, player2_name")
        .eq("created_by", userId)
        // AND no program. `/dashboard` is the personal home — same predicate as
        // the matches list (`matches/page.tsx`), for the same reason:
        // `matches.program_id` is nullable precisely so "no program" is the
        // personal workspace.
        .is("program_id", null)
        .order("date", { ascending: false })
        .limit(4);

  if (matchError) throw new Error(matchError.message);
  if (!matches || matches.length === 0) return { dots: [], matchCount: 0 };
  const matchIds = matches.map((m) => m.id);

  // Fetch every shot for these points (not just serves) so each point's
  // return can be located by role; order by shot_number so "first" is
  // earliest. Serve preview dots still null-guard downstream.
  const { data: shotsData, error: shotsError } = await supabase
    .from("shots")
    .select(
      "shot_number, shot_type, landing_x, landing_y, contact_x, contact_y, spin_type, zone, result, point_id, points!inner(id, match_id, server_is_player1, set_number, result_type, point_score, game_score, won_by_player1, rally_length)",
    )
    .in("points.match_id", matchIds)
    .order("shot_number", { ascending: true });

  if (shotsError) throw new Error(shotsError.message);
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
    // First serves only. `pickServeShot` returns the serve that was
    // *played* — the second when there was one — so without this the
    // bars mixed both while the claim above them said "First serves".
    if (dot && dot.isFirstServe) nextDots.push(dot);
  }

  return { dots: nextDots, matchCount: matches.length };
}
