import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Types
type TargetSheetName =
  "Shots" | "Points" | "Games" | "Sets" | "Stats" | "Settings";

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
  fileNames: string[];
  sourceProvider?: string; // Optional: if not provided, will be fetched from match record
}

/**
 * What `admin_claim_match_file` answers. `null` for a match the admin console
 * never submitted; `claimed: false` for a console attempt that is not
 * `queued` (already processing, completed or failed); otherwise the
 * `admin_file_attempts` row this run now owns — `to_jsonb(row)`, so its
 * columns keep their snake_case — plus `claimed` and the submitting admin as
 * `actorId` (`admin_upload_submissions.actor_user_id`). `request` is the
 * console's validated submission: `storagePath` is
 * `_admin-console/<operation>/<item>/<sha256>.xlsx` and `sha256` the digest of
 * the bytes it validated. Definition: `codex/admin-uploads`
 * `supabase/migrations/20260917010000_submit_admin_match_files.sql`, live as
 * `schema_migrations` version 20260919044716.
 */
type FileClaim =
  | { claimed: false; state: string; operationId: string; itemId: string }
  | {
      claimed: true;
      claim_token: string;
      actorId: string | null;
      request: { storagePath: string; sha256: string };
    };

/**
 * Where the workbook comes from — one or the other, never both. A `folder`
 * request lists files that must each resolve under the caller's own storage
 * folder; a `claim` names the single object an admin-console attempt
 * validated, whose bytes must still hash to `sha256` before they are parsed.
 */
type FileSource =
  | { kind: "folder"; userId: string; fileNames: string[] }
  | { kind: "claim"; storagePath: string; sha256: string };

/**
 * The only bucket this function reads. It used to come from the request body,
 * which let any caller aim a service-role download at any bucket.
 */
const STORAGE_BUCKET = "match-data";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function refuse(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: JSON_HEADERS,
  });
}

type Caller = { kind: "service" } | { kind: "user"; userId: string };

/**
 * Who is calling. `verify_jwt` only proves the bearer is *a* JWT signed for
 * this project — the public anon key passes it — so the function checks for
 * itself. Two callers are legitimate: the project's own service role (the
 * bearer equals SUPABASE_SERVICE_ROLE_KEY) and a signed-in user, whose access
 * token is what `supabase.functions.invoke` sends from `/api/upload`. A user
 * token is verified with `auth.getUser` on an anon client; anything else is
 * answered 401. Whether that user may touch the match is decided afterwards,
 * against `matches.created_by`.
 *
 * Meant to be the same helper in every edge function here — copy it verbatim
 * rather than adapting it.
 */
async function authorizeCaller(
  req: Request,
): Promise<{ caller: Caller } | { status: 401; error: string }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^bearer\s+/i, "").trim();
  if (!token) {
    return { status: 401, error: "Missing bearer token" };
  }
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) {
    return { caller: { kind: "service" } };
  }
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) {
    return { status: 401, error: "Invalid or expired token" };
  }
  return { caller: { kind: "user", userId: data.user.id } };
}

/**
 * Where a requested file may live. Uploads land at
 * `${userId}/${providerId}/${matchId}/${fileName}` (upload.service.ts), so a
 * full path must sit under the user's own folder; a bare file name is the
 * pre-provider layout and resolves to `${userId}/${fileName}`. Anything with
 * an empty, `.` or `..` segment, or another user's prefix, resolves to null
 * and the request is refused before a single download.
 *
 * So does anything naming the admin console's `_admin-console/` namespace,
 * which is reachable only through a claim (`admin_claim_match_file`), never
 * through this list — and anything storage's URL normalisation could turn
 * into it or into a `..`: a percent-escape (`%5fadmin-console`, `%2e%2e`) or
 * a backslash separator. The checks run on the decoded form, so a literal `%`
 * in an athlete's own file name ("Match 100%.xlsx", stored as typed) still
 * resolves. The storage policy that keeps user tokens out of that namespace
 * does not bind the service role this function downloads with.
 */
function resolveStoragePath(userId: string, fileName: unknown): string | null {
  if (typeof fileName !== "string" || fileName.length === 0) {
    return null;
  }
  // Judge the path as storage would read it, percent-escapes decoded. A name
  // whose `%` is not a valid escape has nothing to decode and is judged as is.
  let normalized = fileName;
  try {
    normalized = decodeURIComponent(fileName);
  } catch {
    normalized = fileName;
  }
  if (normalized.includes("\\") || /_admin-console/i.test(normalized)) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return null;
  }
  if (segments.length === 1) {
    return `${userId}/${fileName}`;
  }
  return segments[0] === userId ? fileName : null;
}

Deno.serve(async (req: Request) => {
  console.log("🚀 Edge Function 'process-match' invoked");
  // The admin-console attempt this run has claimed, if any. From the claim on,
  // every exit settles it through admin_finish_match_file: the 200 path marks
  // it completed; everything else marks it failed for review, exactly once.
  let attempt: {
    supabase: ReturnType<typeof createClient>;
    matchId: string;
    claimToken: string;
  } | null = null;
  const failAttempt = async () => {
    if (!attempt) return;
    const { supabase, matchId, claimToken } = attempt;
    attempt = null;
    const { error } = await supabase.rpc("admin_finish_match_file", {
      p_match_id: matchId,
      p_claim_token: claimToken,
      p_error: "processing-failed-review-required",
    });
    // The attempt row is what the console polls (its error_code is shown as
    // is). Failing to mark it is logged, never allowed to replace the answer
    // the caller is owed for the failure that got us here.
    if (error) {
      console.error("Error marking the console attempt failed:", error);
    }
  };
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        },
      });
    }

    const auth = await authorizeCaller(req);
    if ("status" in auth) {
      return refuse(auth.status, auth.error);
    }
    const { caller } = auth;

    const { matchId, fileNames, sourceProvider }: ProcessMatchRequest =
      await req.json();

    console.log("📥 Request received:", {
      matchId,
      caller: caller.kind,
      fileCount: Array.isArray(fileNames) ? fileNames.length : 0,
      sourceProvider,
    });

    if (!matchId || !Array.isArray(fileNames) || fileNames.length === 0) {
      return refuse(
        400,
        "matchId and a non-empty fileNames array are required",
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

    // Every call asks whether this match is an admin-console attempt, so
    // leaving the console's fields out of the body cannot bypass its claim.
    // The RPC answers null for any other match. For a console match it either
    // hands this run the attempt (queued → processing under the row's lock, so
    // a repeated invoke cannot process twice) or reports the state it is
    // already in. A user token that is not the submitting admin makes it
    // raise admin-required (42501).
    const { data: claimData, error: claimError } = await supabase.rpc(
      "admin_claim_match_file",
      {
        p_match_id: matchId,
        p_actor_id: caller.kind === "user" ? caller.userId : null,
        p_service: caller.kind === "service",
      },
    );
    if (claimError) {
      console.error("Error claiming the console attempt:", claimError);
      return claimError.code === "42501"
        ? refuse(403, "You do not have access to this match")
        : refuse(500, "Failed to claim the match file");
    }
    const claim = (claimData ?? null) as FileClaim | null;
    if (claim && !claim.claimed) {
      // Not this run's to process: a console attempt already processing,
      // completed or failed. The console reads the outcome from
      // admin_file_attempts, so the state is the whole answer — completed is
      // a success, failed a 409, processing a 200 that persisted nothing.
      return new Response(
        JSON.stringify({
          success: claim.state === "completed",
          state: claim.state,
          operationId: claim.operationId,
          itemId: claim.itemId,
        }),
        {
          status: claim.state === "failed" ? 409 : 200,
          headers: JSON_HEADERS,
        },
      );
    }
    if (claim) {
      // From here the claim is the sole source of the file, the actor and the
      // digest; the body's fileNames, userId, bucketId and sourceProvider
      // decide nothing for a claimed attempt.
      attempt = { supabase, matchId, claimToken: claim.claim_token };
      console.log("🔐 Admin-console attempt claimed:", {
        actor: claim.actorId,
        storagePath: claim.request.storagePath,
      });
    }

    // Fetch match record for source_provider, format (JSONB with best_of)
    // and the uploader, who is the only user allowed to process it
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("source_provider, format, created_by")
      .eq("id", matchId)
      .single();

    if (matchError) {
      await failAttempt();
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

    // The verified identity is the only userId this function works with — the
    // request body's is never read. A user must be the match's uploader; the
    // service role acts as the uploader. A claimed console attempt is the one
    // exception: its actor is the admin who submitted it, and created_by is
    // not consulted — an attachment to an existing match may carry none.
    const createdBy = (match?.created_by as string | null | undefined) ?? null;
    if (!claim && caller.kind === "user" && caller.userId !== createdBy) {
      return refuse(403, "You do not have access to this match");
    }
    // A claimed attempt reads its one file from the claim, so it needs no
    // uploader folder: `actorId` may be null once the submitting admin's
    // account is gone, and that is no reason to fail the attempt.
    const userId = claim
      ? claim.actorId
      : caller.kind === "user"
        ? caller.userId
        : createdBy;
    if (!claim && !userId) {
      return refuse(403, "This match has no uploader to read files for");
    }

    // A claimed attempt is always a SwingVision file (admin_submit_match_file
    // pins the provider); the body's sourceProvider is not consulted for it.
    const provider = claim
      ? "swing-vision"
      : sourceProvider || match?.source_provider || null;
    // Extract best_of from format JSONB field, default to best-of-3
    const matchFormat =
      (match?.format as { best_of?: number } | null)?.best_of ?? 3;

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

    // Every file must live under the uploader's own storage folder. A claimed
    // attempt's file is the claim's, never this list.
    if (
      !claim &&
      userId &&
      fileNames.some((name) => resolveStoragePath(userId, name) === null)
    ) {
      return refuse(
        400,
        `Every fileNames entry must be a path under ${userId}/ with no ".." segment`,
      );
    }

    // Refuse a second run: a match that already carries points would get every
    // row duplicated and key moments + insights fired again
    const { data: existingPoints, error: existingError } = await supabase
      .from("points")
      .select("id")
      .eq("match_id", matchId)
      .limit(1);

    if (existingError) {
      await failAttempt();
      console.error("Error checking existing points:", existingError);
      return refuse(
        500,
        `Failed to check existing points: ${existingError.message}`,
      );
    }
    if (existingPoints && existingPoints.length > 0) {
      await failAttempt();
      return refuse(409, "This match has already been processed");
    }

    // Process the match data
    console.log("⚙️ Starting match data processing...");
    await processMatchToDb({
      supabase,
      matchId,
      source: claim
        ? {
            kind: "claim",
            storagePath: claim.request.storagePath,
            sha256: claim.request.sha256,
          }
        : { kind: "folder", userId: userId as string, fileNames },
      matchFormat,
    });

    if (attempt) {
      // The rows are committed; the attempt row is what the console polls.
      // Its own error is thrown — the caller sees a 500 and the catch marks
      // the attempt failed for review, rather than leaving it `processing`
      // with a fully processed match behind it.
      const { error: finishError } = await supabase.rpc(
        "admin_finish_match_file",
        {
          p_match_id: matchId,
          p_claim_token: attempt.claimToken,
          p_error: null,
        },
      );
      if (finishError) {
        throw finishError;
      }
      attempt = null;
    }

    console.log("✅ Match data processing completed successfully");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    await failAttempt();
    console.error("Error in process-match Edge Function:", error);
    // import_match_rows refuses a match that already has points with
    // unique_violation — a concurrent run landed first. Same answer as the
    // pre-check; nothing was persisted and nothing was invoked.
    if (error?.code === "23505") {
      return refuse(409, "This match has already been processed");
    }
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
  source,
  matchFormat = 3,
}: {
  supabase: ReturnType<typeof createClient>;
  matchId: string;
  source: FileSource;
  matchFormat?: number;
}): Promise<void> {
  // 1. Combine sheets across all files
  const fileNames =
    source.kind === "claim" ? [source.storagePath] : source.fileNames;
  console.log(`📋 Processing ${fileNames.length} file(s):`, fileNames);
  const combined: CombinedSheets = await createCombinedSheets({
    supabase,
    source,
  });

  const pointsRows = combined.Points ?? [];
  // Before anything reads a shot: a point's Shots rows can hold every ball
  // struck since the previous point, and only its deciding rally is the point.
  const shotsRows = keepDecidingRallies(combined.Shots ?? []);
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
        `Files processed: ${fileNames.join(", ")}`,
    );
  }

  // Extract host team name from Settings for player identification
  const hostTeam =
    settingsRows.length > 0
      ? String(settingsRows[0]["Host Team"] ?? "")
          .toLowerCase()
          .trim()
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

  // 2. Build points. Each gets its id here, not from a returning insert, so
  //    the shots can reference their points before anything is written.
  const pointInserts = buildPointInserts(
    pointsRows,
    matchId,
    setScoreMap,
    gameScoreMap,
    rallyLengthMap,
    matchFormat,
  ).map((point) => ({ id: crypto.randomUUID(), ...point }));

  const pointIdMap = buildPointIdMap(pointInserts);

  // 3. Build shots (if we have shot data)
  const shotInserts = shotsRows.length
    ? buildShotInserts(shotsRows, pointIdMap, hostTeam)
    : [];

  // 4. Points, shots and match_stats land in one transaction, or not at all.
  //    import_match_rows takes the match's advisory lock, refuses a match that
  //    already has points (23505 — the handler answers the pre-check's 409),
  //    inserts both sets of rows as given, then runs calculate_match_stats and
  //    backfill_returns_in_and_net_points. A failure anywhere rolls back the
  //    lot, so the pre-check above does not refuse the re-run.
  console.log("📊 Importing rows and calculating match statistics...");
  const { error: importError } = await supabase.rpc("import_match_rows", {
    p_match_id: matchId,
    p_points: pointInserts,
    p_shots: shotInserts,
  });

  if (importError) {
    console.error("Error importing match rows:", importError);
    throw importError;
  }
  console.log("✅ Match statistics calculated successfully");

  console.log("🎬 Generating key moments...");
  const { data: keyMomentsData, error: keyMomentsError } =
    await supabase.functions.invoke("generate-key-moments", {
      body: { match_id: matchId },
    });

  if (keyMomentsError) {
    console.error("Error generating key moments:", keyMomentsError);
    throw keyMomentsError;
  }

  console.log("✅ Key moments generated successfully:", keyMomentsData);

  console.log("Generating insights:");
  const { error: insightsError } = await supabase.functions.invoke(
    "generate-insights",
    {
      body: { matchId: matchId },
    },
  );

  if (insightsError) {
    console.error(
      "Failed to generate and store match insights:",
      insightsError,
    );
  }

  console.log("Insights generated successfully.");
}

// ---------------------------------------------------------------------------
// File Utilities
// ---------------------------------------------------------------------------

async function createCombinedSheets({
  supabase,
  source,
}: {
  supabase: ReturnType<typeof createClient>;
  source: FileSource;
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

  // A claimed attempt names exactly one object, read as given — the console
  // validated the path when it submitted it. A folder request lists files,
  // each of which must resolve under the caller's own folder.
  const fileNames =
    source.kind === "claim" ? [source.storagePath] : source.fileNames;

  for (const fileName of fileNames) {
    if (
      source.kind === "folder" &&
      (!fileName.endsWith(".xlsx") || fileName === "combined.xlsx")
    ) {
      continue;
    }

    // The handler has already refused any entry outside the user's folder;
    // resolving again here keeps the guard next to the download it protects.
    const filePath =
      source.kind === "folder"
        ? resolveStoragePath(source.userId, fileName)
        : fileName;
    if (filePath === null) {
      throw new Error(
        `Refusing to read a file outside the caller's folder: ${fileName}`,
      );
    }

    // Extract just the filename for __source_file__ field (last part after '/')
    const sourceFileName = fileName.includes("/")
      ? fileName.split("/").pop() || fileName
      : fileName;

    try {
      console.log(`📥 Downloading file from storage: ${filePath}`);

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(filePath);

      if (error || !data) {
        console.error(`❌ Error downloading ${filePath}:`, error);
        if (source.kind === "claim") {
          throw new Error(
            `Failed to download ${filePath}: ${error?.message ?? "empty object"}`,
          );
        }
        continue;
      }

      console.log(`✅ Successfully downloaded ${filePath}`);

      const arrayBuffer = await data.arrayBuffer();
      // The console validated these exact bytes and recorded their digest;
      // anything else in the object now is refused before a cell is parsed.
      if (source.kind === "claim") {
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer)),
        )
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== source.sha256) {
          throw new Error("Validated file bytes changed; review required.");
        }
      }
      // ExcelJS in Deno: Workbook is available directly on the module
      const Workbook = ExcelJS.Workbook;
      if (!Workbook) {
        console.error(
          `❌ ExcelJS.Workbook not found. Module keys:`,
          Object.keys(ExcelJS),
        );
        throw new Error("ExcelJS.Workbook is not available");
      }
      const workbook = new Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Log all available sheets in the workbook
      const availableSheetNames = workbook.worksheets.map((ws) => ws.name);
      console.log(
        `  📑 Available sheets in ${sourceFileName}:`,
        availableSheetNames,
      );

      for (const sheetName of TARGET_SHEETS) {
        const sheet = workbook.getWorksheet(sheetName);
        if (!sheet) {
          console.log(
            `  ⚠️ Sheet "${sheetName}" not found in ${sourceFileName}`,
          );
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
      // A claimed attempt has one file and no fallback: its failure is the
      // attempt's, and the handler marks it so.
      if (source.kind === "claim") throw err;
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
    totalFilesProcessed: fileNames.filter(
      (f) => f.endsWith(".xlsx") && f !== "combined.xlsx",
    ).length,
  });

  return result;
}

function extractRowsFromSheet(
  sheet: ExcelJS.Worksheet,
  sourceFileName: string,
): CombinedRow[] {
  const rows: CombinedRow[] = [];

  const headerRow = sheet.getRow(1);
  const headerValues = headerRow.values as (
    string | number | null | undefined
  )[];

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
    (a, b) => toInt(a["Set"]) - toInt(b["Set"]),
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
function buildGameScoreMap(
  gamesRows: CombinedRow[],
): Map<string, { host: number; guest: number }> {
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
 * The Shots rows that belong to their point. SwingVision files every ball
 * struck since the previous point under the NEXT point's Set/Game/Point —
 * feeds and knock-ups, a let, a first serve the players called out and played
 * on anyway — so one point's rows can hold several rallies, each numbered from
 * shot 1. Merged, they counted dead serves as first serves, dead shot 2s as
 * returns and dead volleys as net points, and stretched rally_length. The
 * export itself says which rally counts: the Points row has no entry for the
 * others, its Serve State names the deciding serve, and its Type column reads
 * `none` on every dead ball.
 *
 * Kept, per point: every shot from the last serve up to the first feed after
 * it (a feed is the next point's ball on its way to the server, filed under
 * this one) and, before a second serve, the latest earlier first serve — the
 * fault. Its Result is forced to "Out" when the tracker called it in, since
 * the point was replayed on a second serve. Everything else is dropped. A
 * point with no serve is kept whole: there is nothing to tell its rallies
 * apart by.
 */
function keepDecidingRallies(shotsRows: CombinedRow[]): CombinedRow[] {
  const byPoint = new Map<string, CombinedRow[]>();
  for (const row of shotsRows) {
    const key = pointKey(
      toInt(row["Set"]),
      toInt(row["Game"]),
      toInt(row["Point"]),
    );
    const group = byPoint.get(key) ?? [];
    group.push(row);
    byPoint.set(key, group);
  }

  const isServe = (row: CombinedRow) =>
    safeString(row["Stroke"])?.toLowerCase() === "serve";
  const isFeed = (row: CombinedRow) =>
    safeString(row["Stroke"])?.toLowerCase() === "feed";
  const serveType = (row: CombinedRow) =>
    String(row["Type"] ?? "").toLowerCase();

  const kept: CombinedRow[] = [];
  for (const group of byPoint.values()) {
    const ordered = inStrikeOrder(group);
    const last = ordered.findLastIndex(isServe);
    if (last === -1) {
      kept.push(...ordered);
      continue;
    }

    let end = last + 1;
    while (end < ordered.length && !isFeed(ordered[end])) end++;
    const deciding = ordered.slice(last, end);
    if (serveType(ordered[last]) === "second_serve") {
      for (let i = last - 1; i >= 0; i--) {
        const fault = ordered[i];
        if (isServe(fault) && serveType(fault) === "first_serve") {
          deciding.unshift(
            safeString(fault["Result"])?.toLowerCase() === "in"
              ? { ...fault, Result: "Out" }
              : fault,
          );
          break;
        }
      }
    }
    kept.push(...deciding);
  }

  console.log(
    `🧹 Kept ${kept.length} of ${shotsRows.length} shots (${shotsRows.length - kept.length} struck outside a deciding rally)`,
  );
  return kept;
}

/**
 * A point's rows in the order they were struck: by Video Time when every row
 * has one, else by the wall-clock Start Time (some exports carry no Video
 * Time), else as the sheet lists them. Start Time is a bare HH:MM:SS, so a
 * point that spans midnight has its early-morning rows moved a day on.
 */
function inStrikeOrder(rows: CombinedRow[]): CombinedRow[] {
  const readAll = (column: string) => {
    const times = rows.map((row) => toVideoTimeOrNull(row[column]));
    return times.every((t) => t !== null) ? (times as number[]) : null;
  };
  let times = readAll("Video Time");
  if (!times) {
    const clock = readAll("Start Time");
    if (clock && Math.max(...clock) - Math.min(...clock) > 12 * 3600) {
      times = clock.map((t) => (t < 12 * 3600 ? t + 24 * 3600 : t));
    } else {
      times = clock;
    }
  }
  if (!times) return rows;
  const order = times as number[];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => order[a.index] - order[b.index] || a.index - b.index)
    .map(({ row }) => row);
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
      pointScore,
    );

    const hostHasSetPoint = serverIsPlayer1
      ? serverHasSetPoint
      : receiverHasSetPoint;
    const guestHasSetPoint = serverIsPlayer1
      ? receiverHasSetPoint
      : serverHasSetPoint;
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
    const playerName = String(row["Player"] ?? "")
      .toLowerCase()
      .trim();
    const isPlayer1 = hostTeam !== "" && playerName === hostTeam;

    // Determine shot_type from "Stroke" column
    // If stroke is "Serve", check "Type" column for first/second serve
    const stroke = safeString(row["Stroke"]);
    const isServe = stroke?.toLowerCase() === "serve";
    let shotType: string | null = stroke;
    if (isServe) {
      const serveType = String(row["Type"] ?? "").toLowerCase();
      if (serveType === "first_serve") {
        shotType = "First Serve";
      } else if (serveType === "second_serve") {
        shotType = "Second Serve";
      }
    }

    // Placement is one rule for every provider: calculate_match_stats counts
    // `zone` rather than re-deriving it, so this is where it is decided. Key
    // on the stroke, not the shot number: every SwingVision serve sits at shot
    // 1, but so do some feeds and groundstrokes, and those need a direction.
    const contactX = toFloatOrNull(row["Hit (x)"]);
    const landingX = toFloatOrNull(row["Bounce (x)"]);

    inserts.push({
      point_id: pointId,
      shot_number: toInt(row["Shot"]),
      is_player1: isPlayer1,
      shot_type: shotType,
      spin_type: safeString(row["Spin"]),
      speed_mph: toFloatOrNull(row["Speed (MPH)"]),
      contact_x: contactX,
      contact_y: toFloatOrNull(row["Hit (y)"]),
      landing_x: landingX,
      landing_y: toFloatOrNull(row["Bounce (y)"]),
      result: safeString(row["Result"]),
      video_time: toVideoTimeOrNull(row["Video Time"]),
      zone: isServe ? serveZone(landingX) : directionZone(landingX, contactX),
    });
  }

  return inserts;
}

/**
 * Service-box third a serve landed in, from its distance off the centre line
 * (the singles half-width is 4.115 m). Twin of `serveZone()` in
 * src/lib/services/splitstep/derivation/court.ts — change both together.
 */
function serveZone(landingX: number | null): "T" | "Body" | "Wide" | null {
  if (landingX === null) return null;
  const from = Math.abs(landingX);
  if (from < 1.37) return "T";
  if (from < 2.74) return "Body";
  return "Wide";
}

/**
 * Direction of a non-serve from where ITS OWN hitter struck it to where it
 * landed: crosscourt when the ball crosses the centre line, down the line
 * when it stays on the hitter's side, Middle within 1.0 m of the line. The
 * export's x is one fixed court frame for both ends, so no flip is needed.
 *
 * This used to read the PREVIOUS shot's contact — the opponent's position,
 * not this hitter's — and so inverted most SwingVision directions. Twin of
 * `directionZone()` in src/lib/services/splitstep/derivation/court.ts —
 * change both together.
 */
function directionZone(
  landingX: number | null,
  contactX: number | null,
): "Crosscourt" | "Middle" | "Down the Line" | null {
  if (landingX === null) return null;
  if (Math.abs(landingX) <= 1.0) return "Middle";
  if (contactX === null || contactX === 0) return null;
  return Math.sign(contactX) !== Math.sign(landingX)
    ? "Crosscourt"
    : "Down the Line";
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
  if (typeof value === "object" && value !== null) {
    // Rich text cells have a richText array
    if ("richText" in value && Array.isArray((value as any).richText)) {
      const text = (value as any).richText
        .map((rt: any) => rt.text || "")
        .join("");
      return text.length ? text : null;
    }
    // Some cells have a text property
    if ("text" in value && typeof (value as any).text === "string") {
      const text = (value as any).text;
      return text.length ? text : null;
    }
    // Formula cells might have a result property
    if ("result" in value) {
      const result = (value as any).result;
      if (typeof result === "string" && result.length) return result;
      if (typeof result === "number") return String(result);
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
  pointScore: string,
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
