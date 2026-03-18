import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Types
type TargetSheetName = "Shots" | "Points" | "Games" | "Sets" | "Stats" | "Settings";

type CombinedRow = Record<string, unknown> & {
  __source_file__: string;
};

type CombinedSheets = Partial<Record<TargetSheetName, CombinedRow[]>>;

const TARGET_SHEETS: TargetSheetName[] = [
  "Shots",
  "Points",
  "Games",
  "Sets",
  "Stats",
  "Settings",
];

interface ProcessMatchRequest {
  matchId: string;
  userId: string;
  fileNames: string[];
  bucketId?: string;
  sourceProvider?: string; // Optional: if not provided, will be fetched from match record
}

Deno.serve(async (req: Request) => {
  console.log("🚀 Edge Function 'process-match' invoked");
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      });
    }

    const { matchId, userId, fileNames, bucketId = "match-data", sourceProvider }: ProcessMatchRequest =
      await req.json();
    
    console.log("📥 Request received:", { matchId, userId, fileCount: fileNames.length, sourceProvider });

    if (!matchId || !userId || !Array.isArray(fileNames) || fileNames.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "matchId, userId, and a non-empty fileNames array are required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Fetch match record for source_provider and format (JSONB with best_of)
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("source_provider, format")
      .eq("id", matchId)
      .single();

    if (matchError) {
      console.error("Error fetching match:", matchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch match: ${matchError.message}`,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const provider = sourceProvider || match?.source_provider || null;
    // Extract best_of from format JSONB field, default to best-of-3
    const matchFormat = (match?.format as { best_of?: number } | null)?.best_of ?? 3;

    // Only process if source_provider is "swing-vision"
    if (provider !== "swing-vision") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Processing not supported for source_provider: ${provider || "null"}. Only "swing-vision" is supported.`,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // Process the match data
    console.log("⚙️ Starting match data processing...");
    await processMatchToDb({
      supabase,
      matchId,
      userId,
      fileNames,
      bucketId,
      matchFormat,
    });

    console.log("✅ Match data processing completed successfully");
    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error: any) {
    console.error("Error in process-match Edge Function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message ?? "Failed to process match data",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Processing Logic
// ---------------------------------------------------------------------------

async function processMatchToDb({
  supabase,
  matchId,
  userId,
  fileNames,
  bucketId = "match-data",
  matchFormat = 3,
}: {
  supabase: ReturnType<typeof createClient>;
  matchId: string;
  userId: string;
  fileNames: string[];
  bucketId?: string;
  matchFormat?: number;
}): Promise<void> {
  // 1. Combine sheets across all files
  console.log(`📋 Processing ${fileNames.length} file(s):`, fileNames);
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
  const settingsRows = combined.Settings ?? [];

  console.log(`📊 Combined sheets summary:`, {
    Points: pointsRows.length,
    Shots: shotsRows.length,
    Games: gamesRows.length,
    Sets: setsRows.length,
    Stats: statsRows.length,
    Settings: settingsRows.length,
  });

  if (!pointsRows.length) {
    const availableSheets = Object.keys(combined).join(", ") || "none";
    throw new Error(
      `No Points sheet data found in uploaded files. ` +
      `Available sheets: ${availableSheets}. ` +
      `Files processed: ${fileNames.join(", ")}`
    );
  }

  // Extract host team name from Settings for player identification
  const hostTeam = settingsRows.length > 0
    ? String(settingsRows[0]["Host Team"] ?? "").toLowerCase().trim()
    : "";
  console.log(`👤 Host team identified: "${hostTeam}"`);

  // Build a map of set scores from Sets sheet: setNumber -> "hostWins-guestWins" (cumulative before that set)
  const setScoreMap = buildSetScoreMap(setsRows);
  console.log(`📊 Set score map built with ${setScoreMap.size} entries`);

  // Build a map of game scores from Games sheet: "set-game" -> { host, guest } (games won in set)
  const gameScoreMap = buildGameScoreMap(gamesRows);
  console.log(`🎯 Game score map built with ${gameScoreMap.size} entries`);

  // Build a map of rally lengths from Shots sheet: key = "set-game-point" -> shot count
  const rallyLengthMap = buildRallyLengthMap(shotsRows);
  console.log(`🎾 Rally length map built with ${rallyLengthMap.size} entries`);

  // 2. Insert points
  const pointInserts = buildPointInserts(pointsRows, matchId, setScoreMap, gameScoreMap, rallyLengthMap, matchFormat);

  const {
    data: insertedPoints,
    error: pointsError,
  } = await supabase
    .from("points")
    .insert(pointInserts)
    .select("id, set_number, game_number, point_number");

  if (pointsError) {
    console.error("Error inserting points:", pointsError);
    throw pointsError;
  }

  const pointIdMap = buildPointIdMap(insertedPoints ?? []);

  // 3. Insert shots (if we have shot data)
  if (shotsRows.length) {
    const shotInserts = buildShotInserts(shotsRows, pointIdMap, hostTeam);
    if (shotInserts.length) {
      const { error: shotsError } = await supabase
        .from("shots")
        .insert(shotInserts);
      if (shotsError) {
        console.error("Error inserting shots:", shotsError);
        throw shotsError;
      }
    }
  }

  // 4. Calculate match stats using Postgres function
  // This aggregates from the points/shots we just inserted and upserts into match_stats
  console.log("📊 Calculating match statistics...");
  const { error: statsError } = await supabase.rpc("calculate_match_stats", {
    p_match_id: matchId,
  });

  if (statsError) {
    console.error("Error calculating match_stats:", statsError);
    throw statsError;
  }
  console.log("✅ Match statistics calculated successfully");
}

// ---------------------------------------------------------------------------
// File Utilities
// ---------------------------------------------------------------------------

async function createCombinedSheets({
  supabase,
  userId,
  fileNames,
  bucketId = "match-data",
}: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  fileNames: string[];
  bucketId?: string;
}): Promise<CombinedSheets> {
  // Dynamic import ExcelJS for Deno compatibility
  const ExcelJSModule = await import("npm:exceljs@4.4.0");
  // Handle both default and named exports
  const ExcelJS = (ExcelJSModule.default || ExcelJSModule) as any;
  
  const combined: Record<TargetSheetName, CombinedRow[]> = {
    Shots: [],
    Points: [],
    Games: [],
    Sets: [],
    Stats: [],
    Settings: [],
  };

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".xlsx") || fileName === "combined.xlsx") {
      continue;
    }

    // If fileName is already a full storage path (contains '/'), use it directly.
    // Otherwise, construct it as {userId}/{fileName} for backward compatibility.
    const filePath = fileName.includes("/") ? fileName : `${userId}/${fileName}`;

    // Extract just the filename for __source_file__ field (last part after '/')
    const sourceFileName = fileName.includes("/")
      ? fileName.split("/").pop() || fileName
      : fileName;

    try {
      console.log(`📥 Downloading file from storage: ${filePath}`);

      const { data, error } = await supabase.storage
        .from(bucketId)
        .download(filePath);

      if (error || !data) {
        console.error(`❌ Error downloading ${filePath}:`, error);
        continue;
      }

      console.log(`✅ Successfully downloaded ${filePath}`);

      const arrayBuffer = await data.arrayBuffer();
      // ExcelJS in Deno: Workbook is available directly on the module
      const Workbook = ExcelJS.Workbook;
      if (!Workbook) {
        console.error(`❌ ExcelJS.Workbook not found. Module keys:`, Object.keys(ExcelJS));
        throw new Error("ExcelJS.Workbook is not available");
      }
      const workbook = new Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Log all available sheets in the workbook
      const availableSheetNames = workbook.worksheets.map(ws => ws.name);
      console.log(`  📑 Available sheets in ${sourceFileName}:`, availableSheetNames);

      for (const sheetName of TARGET_SHEETS) {
        const sheet = workbook.getWorksheet(sheetName);
        if (!sheet) {
          console.log(`  ⚠️ Sheet "${sheetName}" not found in ${sourceFileName}`);
          continue;
        }

        const rows = extractRowsFromSheet(sheet, sourceFileName);
        console.log(`  📊 Sheet "${sheetName}": ${rows.length} rows extracted`);
        if (rows.length > 0) {
          combined[sheetName].push(...rows);
        } else {
          console.log(`  ⚠️ Sheet "${sheetName}" exists but has no data rows`);
        }
      }
    } catch (err) {
      console.error(`⚠️ Error with ${filePath}:`, err);
      continue;
    }
  }

  // Only include sheets that had data
  const result: CombinedSheets = {};
  for (const sheetName of TARGET_SHEETS) {
    const rows = combined[sheetName];
    if (rows.length > 0) {
      result[sheetName] = rows;
      console.log(`📋 Combined "${sheetName}": ${rows.length} total rows`);
    } else {
      console.log(`⚠️ No data found in "${sheetName}" sheet`);
    }
  }

  console.log(`✅ Combined sheets result:`, {
    sheets: Object.keys(result),
    totalFilesProcessed: fileNames.filter(f => f.endsWith(".xlsx") && f !== "combined.xlsx").length,
  });

  return result;
}

function extractRowsFromSheet(
  sheet: ExcelJS.Worksheet,
  sourceFileName: string,
): CombinedRow[] {
  const rows: CombinedRow[] = [];

  const headerRow = sheet.getRow(1);
  const headerValues = headerRow.values as (string | number | null | undefined)[];

  // Build a list of header names keyed by column index (1-based in ExcelJS)
  const headers: Record<number, string> = {};
  headerValues.forEach((header, idx) => {
    if (!header || idx === 0) return;
    headers[idx] = String(header);
  });

  sheet.eachRow((row, rowNumber) => {
    // Skip header row
    if (rowNumber === 1) return;

    const values = row.values as unknown[];
    const obj: Record<string, unknown> = {};

    let hasValue = false;
    Object.entries(headers).forEach(([colIndexStr, headerName]) => {
      const colIndex = Number(colIndexStr);
      const cellValue = values[colIndex];
      if (cellValue !== null && cellValue !== undefined && cellValue !== "") {
        obj[headerName] = cellValue;
        hasValue = true;
      }
    });

    if (hasValue) {
      (obj as CombinedRow).__source_file__ = sourceFileName;
      rows.push(obj as CombinedRow);
    }
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Build a map of set scores from the Sets sheet.
 * Key: setNumber -> Value: "hostWins-guestWins" (cumulative wins BEFORE this set)
 * Always in respect to player1 (host).
 */
function buildSetScoreMap(setsRows: CombinedRow[]): Map<number, string> {
  // Sort by set number to ensure correct cumulative calculation
  const sortedSets = [...setsRows].sort(
    (a, b) => toInt(a["Set"]) - toInt(b["Set"])
  );

  const map = new Map<number, string>();
  let hostWins = 0;
  let guestWins = 0;

  for (const row of sortedSets) {
    const setNumber = toInt(row["Set"]);
    // Score BEFORE this set (cumulative from previous sets)
    map.set(setNumber, `${hostWins}-${guestWins}`);

    // Update cumulative wins for next set
    const winner = String(row["Set Winner"] ?? "").toLowerCase();
    if (winner === "host") hostWins++;
    else if (winner === "guest") guestWins++;
  }

  return map;
}

/**
 * Build a map of game scores from the Games sheet.
 * Key: "set-game" -> Value: { host: number, guest: number } (games won by each in that set)
 * Used to show score like "3-2" meaning host leads 3 games to 2 in the current set.
 */
function buildGameScoreMap(gamesRows: CombinedRow[]): Map<string, { host: number; guest: number }> {
  const map = new Map<string, { host: number; guest: number }>();
  for (const row of gamesRows) {
    const setNumber = toInt(row["Set"]);
    const gameNumber = toInt(row["Game"]);
    const hostSetScore = toInt(row["Host Set Score"]);
    const guestSetScore = toInt(row["Guest Set Score"]);
    const key = `${setNumber}-${gameNumber}`;
    map.set(key, { host: hostSetScore, guest: guestSetScore });
  }
  return map;
}

/**
 * Build a map of rally lengths from the Shots sheet.
 * Key: "set-game-point" -> Value: max shot_number in that point
 * Uses MAX(shot_number) so serve faults and feeds (shot_number=0) don't inflate the count.
 */
function buildRallyLengthMap(shotsRows: CombinedRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of shotsRows) {
    const setNumber = toInt(row["Set"]);
    const gameNumber = toInt(row["Game"]);
    const pointNumber = toInt(row["Point"]);
    const key = pointKey(setNumber, gameNumber, pointNumber);
    const shotNum = toInt(row["Shot"]);
    map.set(key, Math.max(map.get(key) ?? 0, shotNum));
  }
  return map;
}

function buildPointInserts(
  pointsRows: CombinedRow[],
  matchId: string,
  setScoreMap: Map<number, string>,
  gameScoreMap: Map<string, { host: number; guest: number }>,
  rallyLengthMap: Map<string, number>,
  matchFormat: number = 3,
) {
  // Calculate sets needed to win (2 for best-of-3, 3 for best-of-5)
  const setsToWin = Math.ceil(matchFormat / 2);

  return pointsRows.map((row) => {
    const pointNumber = toInt(row["Point"]);
    const setNumber = toInt(row["Set"]);
    const gameNumber = toInt(row["Game"]);

    const serverIsPlayer1 =
      String(row["Match Server"] ?? "").toLowerCase() === "host";
    const wonByPlayer1 =
      String(row["Point Winner"] ?? "").toLowerCase() === "host";

    // Set score from Sets sheet (always in player1/host perspective)
    const setScore = setScoreMap.get(setNumber) ?? "0-0";

    // Game score from Games sheet (in server's perspective - server's score first)
    const gameScoreKey = `${setNumber}-${gameNumber}`;
    const gameScoreData = gameScoreMap.get(gameScoreKey);
    let gameScore = "0-0";
    if (gameScoreData) {
      gameScore = serverIsPlayer1
        ? `${gameScoreData.host}-${gameScoreData.guest}`
        : `${gameScoreData.guest}-${gameScoreData.host}`;
    }

    // Point score from Points sheet (in server's perspective - server's score first)
    const hostGameScore = safeString(row["Host Game Score"]) ?? "0";
    const guestGameScore = safeString(row["Guest Game Score"]) ?? "0";
    const pointScore = serverIsPlayer1
      ? `${hostGameScore}-${guestGameScore}`
      : `${guestGameScore}-${hostGameScore}`;

    // Get rally length from shots count
    const rallyKey = pointKey(setNumber, gameNumber, pointNumber);
    const rallyLength = rallyLengthMap.get(rallyKey) ?? 0;

    // Result type is in the "Detail" column (e.g., "Backhand Unforced Error", "Forehand Winner")
    const resultType = safeString(row["Detail"]);

    // Calculate is_set_point and is_match_point based on scores
    // (SwingVision's "Set Point" column is unreliable for sets 2+)
    const { serverHasSetPoint, receiverHasSetPoint } = calculateSetPoint(
      gameScore,
      pointScore
    );

    const hostHasSetPoint = serverIsPlayer1 ? serverHasSetPoint : receiverHasSetPoint;
    const guestHasSetPoint = serverIsPlayer1 ? receiverHasSetPoint : serverHasSetPoint;
    const isSetPoint = hostHasSetPoint || guestHasSetPoint;

    // Match point: set point for a player who needs 1 more set to win
    const [hostSets, guestSets] = setScore.split("-").map(Number);
    const isMatchPoint =
      (hostHasSetPoint && hostSets === setsToWin - 1) ||
      (guestHasSetPoint && guestSets === setsToWin - 1);

    return {
      match_id: matchId,
      point_number: pointNumber,
      set_number: setNumber,
      game_number: gameNumber,
      set_score: setScore,
      game_score: gameScore,
      point_score: pointScore,
      server_is_player1: serverIsPlayer1,
      won_by_player1: wonByPlayer1,
      rally_length: rallyLength,
      result_type: resultType,
      // Additional fields from SwingVision that could be useful:
      is_break_point: String(row["Break Point"] ?? "").toLowerCase() === "true",
      is_set_point: isSetPoint,
      is_match_point: isMatchPoint,
      video_time: toVideoTimeOrNull(row["Video Time"]),
      duration: toFloatOrNull(row["Duration"]),
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
  hostTeam: string,
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
    video_time: number | null;
    zone: string | null;
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

    // SwingVision uses actual player names in the "Player" column (e.g., "Rudy Quan")
    // Compare to hostTeam name from Settings sheet to determine is_player1
    const playerName = String(row["Player"] ?? "").toLowerCase().trim();
    const isPlayer1 = hostTeam !== "" && playerName === hostTeam;

    // Determine shot_type from "Stroke" column
    // If stroke is "Serve", check "Type" column for first/second serve
    const stroke = safeString(row["Stroke"]);
    let shotType: string | null = stroke;
    if (stroke?.toLowerCase() === "serve") {
      const serveType = String(row["Type"] ?? "").toLowerCase();
      if (serveType === "first_serve") {
        shotType = "First Serve";
      } else if (serveType === "second_serve") {
        shotType = "Second Serve";
      }
    }

    inserts.push({
      point_id: pointId,
      shot_number: toInt(row["Shot"]),
      is_player1: isPlayer1,
      shot_type: shotType,
      spin_type: safeString(row["Spin"]),
      speed_mph: toFloatOrNull(row["Speed (MPH)"]),
      contact_x: toFloatOrNull(row["Hit (x)"]),
      contact_y: toFloatOrNull(row["Hit (y)"]),
      landing_x: toFloatOrNull(row["Bounce (x)"]),
      landing_y: toFloatOrNull(row["Bounce (y)"]),
      result: safeString(row["Result"]),
      video_time: toVideoTimeOrNull(row["Video Time"]),
      zone: null, // computed below
    });
  }

  // Compute zone for each shot
  // Serves: based on landing_x thresholds
  // Non-serves: compare landing_x to previous shot's contact_x
  const byPoint = new Map<string, typeof inserts>();
  for (const insert of inserts) {
    const group = byPoint.get(insert.point_id) ?? [];
    group.push(insert);
    byPoint.set(insert.point_id, group);
  }

  for (const shots of byPoint.values()) {
    shots.sort((a, b) => a.shot_number - b.shot_number);
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      if (shot.landing_x == null) continue;

      if (shot.shot_number === 1) {
        // Serve zone
        const absX = Math.abs(shot.landing_x);
        if (absX >= 2.74) shot.zone = "Wide";
        else if (absX >= 1.37) shot.zone = "Body";
        else shot.zone = "T";
      } else {
        // Non-serve zone
        if (Math.abs(shot.landing_x) <= 1.0) {
          shot.zone = "Middle";
        } else {
          const prev = shots[i - 1];
          if (prev?.contact_x != null) {
            if (Math.sign(shot.landing_x) !== Math.sign(prev.contact_x)) {
              shot.zone = "Crosscourt";
            } else {
              shot.zone = "Down the Line";
            }
          }
        }
      }
    }
  }

  return inserts;
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

/**
 * SwingVision exports "Video Time" inconsistently depending on export settings:
 * - numeric seconds (e.g. 83.2)
 * - time string (e.g. "1:23", "00:01:23", "01:23:45.6")
 *
 * Normalize to seconds (float) for storage in points.video_time / shots.video_time.
 */
function toVideoTimeOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  // Fast path: already numeric
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  // Handle ExcelJS objects and other non-primitives via safeString
  const raw = typeof value === "string" ? value : safeString(value);
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Plain numeric string
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Time string: mm:ss(.ms) or hh:mm:ss(.ms)
  const parts = s.split(":");
  if (parts.length === 2 || parts.length === 3) {
    const nums = parts.map((p) => p.trim());

    const last = nums[nums.length - 1];
    const sec = Number(last);
    if (!Number.isFinite(sec)) return null;

    const min = Number(nums[nums.length - 2]);
    if (!Number.isFinite(min)) return null;

    const hrs = nums.length === 3 ? Number(nums[0]) : 0;
    if (!Number.isFinite(hrs)) return null;

    return hrs * 3600 + min * 60 + sec;
  }

  return null;
}

function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  // Handle ExcelJS objects (empty cells with formatting, rich text, formulas)
  if (typeof value === 'object' && value !== null) {
    // Rich text cells have a richText array
    if ('richText' in value && Array.isArray((value as any).richText)) {
      const text = (value as any).richText.map((rt: any) => rt.text || '').join('');
      return text.length ? text : null;
    }
    // Some cells have a text property
    if ('text' in value && typeof (value as any).text === 'string') {
      const text = (value as any).text;
      return text.length ? text : null;
    }
    // Formula cells might have a result property
    if ('result' in value) {
      const result = (value as any).result;
      if (typeof result === 'string' && result.length) return result;
      if (typeof result === 'number') return String(result);
    }
    // Empty object or unrecognized - treat as null
    return null;
  }

  const s = String(value);
  return s.length ? s : null;
}

/**
 * Calculate whether server or receiver has a set point based on game and point scores.
 * Uses no-ad scoring rules (40-40 = deciding point where both have game point).
 *
 * @param gameScore - Format "X-Y" where X is server's games, Y is receiver's games
 * @param pointScore - Format "X-Y" where X is server's score, Y is receiver's score
 * @returns Object indicating if server and/or receiver has set point
 */
function calculateSetPoint(
  gameScore: string,
  pointScore: string
): { serverHasSetPoint: boolean; receiverHasSetPoint: boolean } {
  const [serverGames, receiverGames] = gameScore.split("-").map(Number);
  const [serverPts, receiverPts] = pointScore.split("-");

  // Check if in tiebreak (both at 6 games)
  const isTiebreak = serverGames === 6 && receiverGames === 6;

  if (isTiebreak) {
    // Tiebreak: parse numeric scores, set point at 6+ with 1-point lead
    const sPts = parseInt(serverPts) || 0;
    const rPts = parseInt(receiverPts) || 0;
    return {
      serverHasSetPoint: sPts >= 6 && sPts - rPts === 1,
      receiverHasSetPoint: rPts >= 6 && rPts - sPts === 1,
    };
  }

  // Regular game - check game point (no-ad scoring: 40-40 = both at game point)
  const serverAtGamePoint = serverPts === "40";
  const receiverAtGamePoint = receiverPts === "40";

  // Winning game wins set if: 5+ games and would have 6+ with 2-game lead OR 7-5
  const serverWinsSetIfWinsGame =
    (serverGames >= 5 && receiverGames <= 4) ||
    (serverGames === 6 && receiverGames === 5);

  const receiverWinsSetIfWinsGame =
    (receiverGames >= 5 && serverGames <= 4) ||
    (receiverGames === 6 && serverGames === 5);

  return {
    serverHasSetPoint: serverAtGamePoint && serverWinsSetIfWinsGame,
    receiverHasSetPoint: receiverAtGamePoint && receiverWinsSetIfWinsGame,
  };
}
