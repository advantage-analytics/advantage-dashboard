import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCombinedSheets,
  type CombinedSheets,
  type CombinedRow,
} from "./file-utils";

export interface ProcessMatchToDbOptions {
  supabase: SupabaseClient;
  matchId: string;
  userId: string;
  fileNames: string[];
  bucketId?: string;
}

/**
 * Process uploaded SwingVision match files and persist structured data into
 * the core analytics tables:
 *
 * - `points`
 * - `shots`
 * - `match_stats` (player1 only for now)
 *
 * This is an initial TypeScript port focused on getting data into the schema.
 * Metric fields in `match_stats` are left as null/0 placeholders for now and
 * can be filled in later using more advanced aggregation.
 */
export async function processMatchToDb({
  supabase,
  matchId,
  userId,
  fileNames,
  bucketId = "match-data",
}: ProcessMatchToDbOptions): Promise<void> {
  // 1. Combine sheets across all files
  const combined: CombinedSheets = await createCombinedSheets({
    supabase,
    userId,
    fileNames,
    bucketId,
  });

  const pointsRows = combined.Points ?? [];
  const shotsRows = combined.Shots ?? [];
  const gamesRows = combined.Games ?? [];
  const setsRows = combined.Sets ?? [];
  const statsRows = combined.Stats ?? [];

  if (!pointsRows.length) {
    throw new Error("No Points sheet data found in uploaded files.");
  }

  // 2. Insert points
  const pointInserts = buildPointInserts(pointsRows, matchId);

  const {
    data: insertedPoints,
    error: pointsError,
  } = await supabase
    .from("points")
    .insert(pointInserts)
    .select("id, set_number, game_number, point_number");

  if (pointsError) {
    // eslint-disable-next-line no-console
    console.error("Error inserting points:", pointsError);
    throw pointsError;
  }

  const pointIdMap = buildPointIdMap(insertedPoints ?? []);

  // 3. Insert shots (if we have shot data)
  if (shotsRows.length) {
    const shotInserts = buildShotInserts(shotsRows, pointIdMap);
    if (shotInserts.length) {
      const { error: shotsError } = await supabase
        .from("shots")
        .insert(shotInserts);
      if (shotsError) {
        // eslint-disable-next-line no-console
        console.error("Error inserting shots:", shotsError);
        throw shotsError;
      }
    }
  }

  // 4. Insert a basic match_stats row for player1
  const matchStatsInsert = buildMatchStatsInsert(
    matchId,
    /* isPlayer1 */ true,
    shotsRows,
    pointsRows,
    gamesRows,
    setsRows,
    statsRows,
  );

  const { error: statsError } = await supabase
    .from("match_stats")
    .insert(matchStatsInsert);

  if (statsError) {
    // eslint-disable-next-line no-console
    console.error("Error inserting match_stats:", statsError);
    throw statsError;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPointInserts(pointsRows: CombinedRow[], matchId: string) {
  return pointsRows.map((row) => {
    const pointNumber = toInt(row["Point"]);
    const setNumber = toInt(row["Set"]);
    const gameNumber = toInt(row["Game"]);

    const serverIsPlayer1 =
      String(row["Match Server"] ?? "").toLowerCase() === "host";
    const wonByPlayer1 =
      String(row["Point Winner"] ?? "").toLowerCase() === "host";

    return {
      match_id: matchId,
      point_number: pointNumber,
      set_number: setNumber,
      game_number: gameNumber,
      set_score: safeString(row["Set Score"]),
      game_score: safeString(row["Game Score"]),
      point_score: safeString(row["Point Score"]),
      server_is_player1: serverIsPlayer1,
      won_by_player1: wonByPlayer1,
      rally_length: toInt(row["Shot"]), // optional, if present
      result_type: safeString(row["Result"]),
    };
  });
}

function buildPointIdMap(
  insertedPoints: Array<{
    id: string;
    set_number: number;
    game_number: number;
    point_number: number;
  }>,
) {
  const map = new Map<string, string>();
  for (const p of insertedPoints) {
    const key = pointKey(p.set_number, p.game_number, p.point_number);
    map.set(key, p.id);
  }
  return map;
}

function buildShotInserts(
  shotsRows: CombinedRow[],
  pointIdMap: Map<string, string>,
) {
  const inserts: Array<{
    point_id: string;
    shot_number: number;
    is_player1: boolean;
    shot_type: string | null;
    spin_type: string | null;
    speed_mph: number | null;
    contact_x: number | null;
    contact_y: number | null;
    landing_x: number | null;
    landing_y: number | null;
    result: string | null;
  }> = [];

  for (const row of shotsRows) {
    const pointNumber = toInt(row["Point"]);
    const setNumber = toInt(row["Set"]);
    const gameNumber = toInt(row["Game"]);
    const key = pointKey(setNumber, gameNumber, pointNumber);
    const pointId = pointIdMap.get(key);
    if (!pointId) {
      continue;
    }

    const isPlayer1 =
      String(row["Player"] ?? "").toLowerCase() === "host" ||
      String(row["Player"] ?? "").toLowerCase() === "player1";

    inserts.push({
      point_id: pointId,
      shot_number: toInt(row["Shot"]),
      is_player1: isPlayer1,
      shot_type: safeString(row["Type"]),
      spin_type: safeString(row["Spin"]),
      speed_mph: toFloatOrNull(row["Speed (MPH)"]),
      contact_x: toFloatOrNull(row["Hit (x)"]),
      contact_y: toFloatOrNull(row["Hit (y)"]),
      landing_x: toFloatOrNull(row["Bounce (x)"]),
      landing_y: toFloatOrNull(row["Bounce (y)"]),
      result: safeString(row["Result"]),
    });
  }

  return inserts;
}

function buildMatchStatsInsert(
  matchId: string,
  isPlayer1: boolean,
  _shotsRows: CombinedRow[],
  _pointsRows: CombinedRow[],
  _gamesRows: CombinedRow[],
  _setsRows: CombinedRow[],
  _statsRows: CombinedRow[],
) {
  // For now we create a minimal stats row with placeholders.
  // These fields can be updated later by a dedicated aggregation job that
  // reads from `points` and `shots`.
  return {
    match_id: matchId,
    is_player1: isPlayer1,
    aces: null,
    double_faults: null,
    first_serve_pct: null,
    first_serve_won_pct: null,
    second_serve_won_pct: null,
    break_points_saved_pct: null,
    break_points_converted_pct: null,
    winners: null,
    unforced_errors: null,
    forced_errors: null,
    net_points_won_pct: null,
    avg_rally_length: null,
  };
}

function pointKey(setNumber: number, gameNumber: number, pointNumber: number) {
  return `${setNumber || 0}-${gameNumber || 0}-${pointNumber || 0}`;
}

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toFloatOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length ? s : null;
}

