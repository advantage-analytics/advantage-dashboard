import { createClient } from "@/lib/supabase/server";

export interface MatchPoint {
  id: string;
  pointNumber: number;
  setNumber: number;
  gameNumber: number;
  gameScore: string;
  pointScore: string;
  resultType: string;
  eventType: string;
  description: string;
  player: "player1" | "player2";
  wonByPlayer1: boolean;
  serverIsPlayer1: boolean;
  isBreakPoint: boolean;
  isSetPoint: boolean;
  isMatchPoint: boolean;
  rallyLength: number;
  duration: number | null;
  videoTime: number | null;
  saved: boolean;
}

interface DbPoint {
  id: string;
  point_number: number;
  set_number: number;
  game_number: number;
  game_score: string | null;
  point_score: string | null;
  result_type: string | null;
  won_by_player1: boolean;
  server_is_player1: boolean;
  is_break_point: boolean;
  is_set_point: boolean;
  is_match_point: boolean;
  rally_length: number | null;
  duration: number | null;
  video_time: number | null;
  saved: boolean;
}

interface DbShot {
  id: string;
  point_id: string;
  shot_number: number;
  is_player1: boolean;
  shot_type: string | null;
  spin_type: string | null;
  zone: string | null;
  result: string | null;
}

const SERVE_RESULT_TYPES = new Set(["Ace", "Service Winner", "Double Fault"]);

function buildEventType(resultType: string): string {
  return resultType || "Unknown";
}

function buildDescription(
  resultType: string,
  firstShot: DbShot | undefined,
  lastShot: DbShot | undefined,
  point: DbPoint,
): string {
  const parts: string[] = [];

  if (SERVE_RESULT_TYPES.has(resultType)) {
    // Serve-related: describe the serve itself
    if (firstShot) {
      const segments: string[] = [];
      if (firstShot.spin_type) segments.push(firstShot.spin_type);
      if (firstShot.shot_type) segments.push(firstShot.shot_type);
      if (firstShot.zone) segments.push(firstShot.zone);
      if (segments.length > 0) parts.push(segments.join(" "));
    }
  } else {
    // Rally results: describe the decisive last shot
    if (lastShot) {
      const segments: string[] = [];
      if (lastShot.spin_type) segments.push(lastShot.spin_type);
      if (lastShot.zone) segments.push(lastShot.zone);
      if (segments.length > 0) parts.push(segments.join(" "));
    }
  }

  // Append pressure labels
  if (point.is_break_point) parts.push("Breakpoint");
  if (point.is_set_point) parts.push("Set point");
  if (point.is_match_point) parts.push("Match point");

  return parts.join(" · ") || "Rally";
}

function determinePlayer(
  lastShot: DbShot | undefined,
  point: DbPoint,
): "player1" | "player2" {
  // The last shot's is_player1 tells us who hit the decisive shot
  if (lastShot) {
    return lastShot.is_player1 ? "player1" : "player2";
  }
  // Fallback: if no shots, use who won the point
  return point.won_by_player1 ? "player1" : "player2";
}

export async function getMatchPointsFromSupabase(
  matchId: string,
): Promise<MatchPoint[]> {
  const supabase = await createClient();

  // Fetch points first
  const { data: pointsData, error: pointsError } = await supabase
    .from("points")
    .select(
      "id, point_number, set_number, game_number, game_score, point_score, result_type, won_by_player1, server_is_player1, is_break_point, is_set_point, is_match_point, rally_length, duration, video_time, saved",
    )
    .eq("match_id", matchId)
    .order("point_number", { ascending: true });

  if (pointsError) {
    console.error("Failed to fetch points:", pointsError.message);
    return [];
  }
  if (!pointsData?.length) {
    return [];
  }

  const points = pointsData as DbPoint[];
  const pointIds = points.map((p) => p.id);

  // Fetch shots for these points
  const { data: shotsData, error: shotsError } = await supabase
    .from("shots")
    .select(
      "id, point_id, shot_number, is_player1, shot_type, spin_type, zone, result",
    )
    .in("point_id", pointIds)
    .order("shot_number", { ascending: true });

  if (shotsError) {
    console.error("Failed to fetch shots:", shotsError.message);
  }

  const shots = (shotsData ?? []) as DbShot[];

  // Group shots by point_id
  const shotsByPointId = new Map<string, DbShot[]>();
  for (const shot of shots) {
    const existing = shotsByPointId.get(shot.point_id);
    if (existing) {
      existing.push(shot);
    } else {
      shotsByPointId.set(shot.point_id, [shot]);
    }
  }

  return points.map((point): MatchPoint => {
    const pointShots = shotsByPointId.get(point.id) ?? [];
    const firstShot = pointShots[0];
    const lastShot = pointShots.length > 0 ? pointShots[pointShots.length - 1] : undefined;
    const resultType = point.result_type ?? "";

    return {
      id: point.id,
      pointNumber: point.point_number,
      setNumber: point.set_number,
      gameNumber: point.game_number,
      gameScore: point.game_score ?? "0-0",
      pointScore: point.point_score ?? "0-0",
      resultType,
      eventType: buildEventType(resultType),
      description: buildDescription(resultType, firstShot, lastShot, point),
      player: determinePlayer(lastShot, point),
      wonByPlayer1: point.won_by_player1,
      serverIsPlayer1: point.server_is_player1,
      isBreakPoint: point.is_break_point,
      isSetPoint: point.is_set_point,
      isMatchPoint: point.is_match_point,
      rallyLength: point.rally_length ?? 0,
      duration: point.duration,
      videoTime: point.video_time,
      saved: point.saved,
    };
  });
}
