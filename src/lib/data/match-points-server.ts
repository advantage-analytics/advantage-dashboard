import { createClient } from "@/lib/supabase/server";
import { pickServeShot, pickReturnShot } from "@/lib/data/serve-return-shots";

/** One shot inside a point, in rally order — the film room's shot feed. */
export interface MatchShot {
  id: string;
  shotNumber: number;
  isPlayer1: boolean;
  shotType: string | null;
  spinType: string | null;
  speedMph: number | null;
  zone: string | null;
  result: string | null;
  /** Same clock as `MatchPoint.videoTime`; null when the source never timed it. */
  videoTime: number | null;
}

export interface MatchPoint {
  id: string;
  pointNumber: number;
  setNumber: number;
  gameNumber: number;
  /** Sets won before this point, SERVER-FIRST like the two below ("1-0"). */
  setScore: string;
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
  /** True when anyone in the workspace bookmarked it — `savedBy.length > 0`. */
  saved: boolean;
  /** Every workspace member who bookmarked this point; empty when none. */
  savedBy: { userId: string; name: string | null }[];
  /** Every shot in rally order. Optional so fixtures and imports without shots stay valid. */
  shots?: MatchShot[];
  // Shot metadata used for Video filters
  firstShotType?: string | null;
  firstShotSpin?: string | null;
  firstShotZone?: string | null;
  firstShotResult?: string | null;
  secondShotType?: string | null;
  secondShotSpin?: string | null;
  secondShotZone?: string | null;
  secondShotResult?: string | null;
  lastShotType?: string | null;
  lastShotSpin?: string | null;
  lastShotZone?: string | null;
  firstShotLandingX?: number | null;
  firstShotLandingY?: number | null;
  secondShotLandingX?: number | null;
  secondShotLandingY?: number | null;
  secondShotContactX?: number | null;
  secondShotContactY?: number | null;
}

interface DbPoint {
  id: string;
  point_number: number;
  set_number: number;
  game_number: number;
  set_score: string | null;
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
}

interface DbShot {
  id: string;
  point_id: string;
  shot_number: number;
  is_player1: boolean;
  shot_type: string | null;
  spin_type: string | null;
  speed_mph: number | null;
  video_time: number | null;
  zone: string | null;
  result: string | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
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

/**
 * Who bookmarked which point, workspace-wide. Saving a point is a
 * WORKSPACE-wide act: under the T4 policy, SELECT on point_bookmarks returns
 * every row on a match the viewer can see, not just auth.uid()'s own — so
 * there is no user_id filter here and no admin client, just the cookie-scoped
 * client. INSERT stays own-row, so each row still records who saved it. A
 * failed query degrades to "no bookmarks" rather than failing the whole
 * loader.
 */
async function fetchSavedByPointId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  pointIds: string[],
): Promise<Map<string, { userId: string; name: string | null }[]>> {
  const savedByPointId = new Map<
    string,
    { userId: string; name: string | null }[]
  >();
  if (pointIds.length === 0) return savedByPointId;

  const { data: bookmarksData, error: bookmarksError } = await supabase
    .from("point_bookmarks")
    .select("point_id, user_id")
    .in("point_id", pointIds);

  if (bookmarksError) {
    console.error("Failed to fetch point bookmarks:", bookmarksError.message);
    return savedByPointId;
  }
  if (!bookmarksData?.length) return savedByPointId;

  // Names cannot come from `public.users`: its only policy is
  // `auth.uid() = id`, so a teammate's row is invisible through RLS and a
  // join would silently yield null for everyone but the viewer. For a team
  // match the roster RPC (SECURITY DEFINER) is the readable source; for a
  // personal match, or a user the roster does not list, `name` stays null.
  // The badge that will render these names is out of scope here (T5 only
  // adds the data) — existing readers keep using `saved`.
  const nameByUserId = new Map<string, string | null>();
  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("program_id")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) {
    console.error("Failed to fetch match program:", matchError.message);
  } else if (matchRow?.program_id) {
    const { data: roster, error: rosterError } = await supabase.rpc(
      "program_roster_full",
      { p_program_id: matchRow.program_id },
    );
    if (rosterError) {
      console.error("Failed to fetch program roster:", rosterError.message);
    } else {
      for (const member of (roster ?? []) as {
        user_id: string | null;
        display_name: string | null;
      }[]) {
        if (member.user_id) {
          nameByUserId.set(member.user_id, member.display_name ?? null);
        }
      }
    }
  }

  for (const row of bookmarksData as { point_id: string; user_id: string }[]) {
    const entry = {
      userId: row.user_id,
      name: nameByUserId.get(row.user_id) ?? null,
    };
    const existing = savedByPointId.get(row.point_id);
    if (existing) existing.push(entry);
    else savedByPointId.set(row.point_id, [entry]);
  }

  return savedByPointId;
}

export async function getMatchPointsFromSupabase(
  matchId: string,
): Promise<MatchPoint[]> {
  const supabase = await createClient();

  // Fetch points first
  const { data: pointsData, error: pointsError } = await supabase
    .from("points")
    .select(
      "id, point_number, set_number, game_number, set_score, game_score, point_score, result_type, won_by_player1, server_is_player1, is_break_point, is_set_point, is_match_point, rally_length, duration, video_time",
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

  // Fetch shots for these points, in pages. PostgREST caps a response at 1000
  // rows by default, and a full three-set match passes that — a single request
  // silently dropped the tail of the match, which the film room's shot feed
  // shows row by row. The order is total (point, shot number, id) so pages
  // never overlap or skip.
  const SHOT_PAGE = 1000;
  const shots: DbShot[] = [];
  for (let from = 0; ; from += SHOT_PAGE) {
    const { data: page, error: shotsError } = await supabase
      .from("shots")
      .select(
        "id, point_id, shot_number, is_player1, shot_type, spin_type, speed_mph, video_time, zone, result, contact_x, contact_y, landing_x, landing_y",
      )
      .in("point_id", pointIds)
      .order("point_id", { ascending: true })
      .order("shot_number", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + SHOT_PAGE - 1);

    if (shotsError) {
      console.error("Failed to fetch shots:", shotsError.message);
      break;
    }
    shots.push(...((page ?? []) as DbShot[]));
    if (!page || page.length < SHOT_PAGE) break;
  }

  // Who bookmarked each point, workspace-wide (see fetchSavedByPointId).
  const savedByPointId = await fetchSavedByPointId(supabase, matchId, pointIds);

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

    // Pick shots by ROLE, not array position (see serve-return-shots.ts):
    // raw data has Feed rows at shot_number=0 and can carry two serve rows
    // sharing shot_number=1, so positional indexing mis-labels many points.
    const firstShot: DbShot | undefined = pickServeShot(pointShots);
    const secondShot: DbShot | undefined = pickReturnShot(pointShots);

    const lastShot =
      pointShots.length > 0 ? pointShots[pointShots.length - 1] : undefined;
    const resultType = point.result_type ?? "";
    const savedBy = savedByPointId.get(point.id) ?? [];

    // Expose raw world-frame coordinates. Downstream renderers normalize them
    // (so end-changes between games don't require an extra server-side flip
    // and the home widget + match-detail both run through the same logic).
    const firstLandX = firstShot?.landing_x ?? null;
    const firstLandY = firstShot?.landing_y ?? null;
    const secondLandX = secondShot?.landing_x ?? null;
    const secondLandY = secondShot?.landing_y ?? null;
    const secondContactX = secondShot?.contact_x ?? null;
    const secondContactY = secondShot?.contact_y ?? null;

    return {
      id: point.id,
      pointNumber: point.point_number,
      setNumber: point.set_number,
      gameNumber: point.game_number,
      setScore: point.set_score ?? "0-0",
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
      saved: savedBy.length > 0,
      savedBy,
      shots: pointShots.map((shot) => ({
        id: shot.id,
        shotNumber: shot.shot_number,
        isPlayer1: shot.is_player1,
        shotType: shot.shot_type,
        spinType: shot.spin_type,
        speedMph: shot.speed_mph,
        zone: shot.zone,
        result: shot.result,
        videoTime: shot.video_time,
      })),
      firstShotType: firstShot?.shot_type ?? null,
      firstShotSpin: firstShot?.spin_type ?? null,
      firstShotZone: firstShot?.zone ?? null,
      firstShotResult: firstShot?.result ?? null,
      secondShotType: secondShot?.shot_type ?? null,
      secondShotSpin: secondShot?.spin_type ?? null,
      secondShotZone: secondShot?.zone ?? null,
      secondShotResult: secondShot?.result ?? null,
      lastShotType: lastShot?.shot_type ?? null,
      lastShotSpin: lastShot?.spin_type ?? null,
      lastShotZone: lastShot?.zone ?? null,
      firstShotLandingX: firstLandX,
      firstShotLandingY: firstLandY,
      secondShotLandingX: secondLandX,
      secondShotLandingY: secondLandY,
      secondShotContactX: secondContactX,
      secondShotContactY: secondContactY,
    };
  });
}
