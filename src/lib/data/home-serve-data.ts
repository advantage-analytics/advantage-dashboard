import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/data/paged-query";
import { pickServeShot } from "@/lib/data/serve-return-shots";
import {
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
} from "@/lib/data/serve-zones";
type ShotRow = {
  id: string;
  shot_number: number | null;
  shot_type: string | null;
  landing_x: number | null;
  landing_y: number | null;
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

  // Serve rows only: `pointToServeDot` reads just the played serve
  // (`firstShot*`) and a `ServeDot` carries no return, so the rally rows were
  // dead weight. Paged through the fail-closed helper — four full matches of
  // serves sit near PostgREST's 1000-row cap, and a truncated read would plot
  // a partial set that looks complete. The order is total (`id` last) so pages
  // never overlap or skip; `shot_number` keeps each point's rows earliest
  // first. `pickServeShot` still guards a point with no serve row downstream.
  let shotsError: string | null = null;
  const shots = await fetchAllPages<ShotRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("shots")
      .select(
        "id, shot_number, shot_type, landing_x, landing_y, contact_y, spin_type, zone, result, point_id, points!inner(id, match_id, server_is_player1, set_number, result_type, point_score, game_score, won_by_player1)",
      )
      .in("points.match_id", matchIds)
      .in("shot_type", ["First Serve", "Second Serve"])
      .order("point_id", { ascending: true })
      .order("shot_number", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    // The helper stops at the first error, so this is set exactly once.
    if (error) shotsError = error.message;
    return { data: data as unknown as ShotRow[] | null, error };
  });
  // Fail closed: a page error is an error, never the rows before it.
  if (!shots) throw new Error(shotsError ?? "Failed to fetch serves");

  // Group serve rows by point so the played serve (second if there was one)
  // can be picked by role — see serve-return-shots.ts.
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
    // firstShot* = played serve — the only shot `pointToServeDot` reads.
    // Mirrors the match-detail mapping in serve-placement-card.tsx.
    const point: ServePointInput = {
      id: pt.id,
      serverIsPlayer1: pt.server_is_player1,
      firstShotLandingX: serve?.landing_x ?? null,
      firstShotLandingY: serve?.landing_y ?? null,
      firstShotContactY: serve?.contact_y ?? null,
      firstShotZone: serve?.zone ?? null,
      firstShotSpin: serve?.spin_type ?? null,
      firstShotType: serve?.shot_type ?? null,
      firstShotResult: serve?.result ?? null,
      resultType: pt.result_type,
      wonByPlayer1: pt.won_by_player1 ?? false,
      setNumber: pt.set_number ?? undefined,
      pointScore: pt.point_score,
      gameScore: pt.game_score,
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
