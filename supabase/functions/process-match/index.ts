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

    // Fetch source_provider from match record if not provided
    let provider = sourceProvider;
    if (!provider) {
      const { data: match, error: matchError } = await supabase
        .from("matches")
        .select("source_provider")
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

      provider = match?.source_provider || null;
    }

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
}: {
  supabase: ReturnType<typeof createClient>;
  matchId: string;
  userId: string;
  fileNames: string[];
  bucketId?: string;
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

  console.log(`📊 Combined sheets summary:`, {
    Points: pointsRows.length,
    Shots: shotsRows.length,
    Games: gamesRows.length,
    Sets: setsRows.length,
    Stats: statsRows.length,
    Settings: combined.Settings?.length || 0,
  });

  if (!pointsRows.length) {
    const availableSheets = Object.keys(combined).join(", ") || "none";
    throw new Error(
      `No Points sheet data found in uploaded files. ` +
      `Available sheets: ${availableSheets}. ` +
      `Files processed: ${fileNames.join(", ")}`
    );
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
        console.error("Error inserting shots:", shotsError);
        throw shotsError;
      }
    }
  }

  // 4. Insert a basic match_stats row for player1
  const matchStatsInsert = buildMatchStatsInsert(
    matchId,
    true, // isPlayer1
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
    console.error("Error inserting match_stats:", statsError);
    throw statsError;
  }
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
