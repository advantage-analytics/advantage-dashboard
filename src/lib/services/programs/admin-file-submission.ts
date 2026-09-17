import { createHash } from "node:crypto";
import { requireAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getImportProviderStrategy } from "@/lib/services/upload/providers";
import { getParser } from "@/lib/services/upload/parsers";
import { validateSwingVisionFile } from "@/lib/services/upload/validators/swingvision-validator";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const refusals: Record<string, string> = {
  "player-mismatch":
    "The file's players do not match the recorded players or selected roster athlete. Choose the matching file; recorded players were not changed.",
  "score-mismatch":
    "The file's score, tiebreaks or result differ from the recorded result. Choose a matching export; the recorded result was not changed.",
  "stale-target":
    "The recorded match changed after preparation. Reload and prepare it again.",
  "attachment-not-prepared":
    "Prepare this recorded match for analysis before submitting the file.",
  "athlete-ineligible": "Select an eligible athlete in this program.",
  "program-inactive":
    "This program cannot accept this submission in its current state.",
  "file-identity-conflict":
    "This operation already uses a different file. Keep the original file when retrying.",
  "existing-analysis": "This match already has analysis or an attached file.",
  "processing-in-flight": "Analysis is already in progress for this match.",
  "wrong-program": "This match belongs to another program.",
};
function failure(error: string) {
  return { ok: false as const, message: refusals[error] ?? error };
}

const defaults = { requireAdmin, createAdminClient, createClient };
type Dependencies = typeof defaults;

/** This deliberately accepts no form-derived scores/names or caller actor. */
export async function submitAdminMatchFile(
  form: FormData,
  deps: Dependencies = defaults,
) {
  const actor = await deps.requireAdmin();
  if (!actor) return failure("Administrator access is required.");
  const keys = [
    "file",
    "operationId",
    "itemId",
    "programId",
    "matchId",
    "fingerprint",
    "playerId",
    "date",
    "matchType",
    "courtType",
  ];
  if (
    [...form.keys()].some(
      (key) => !keys.includes(key) || form.getAll(key).length !== 1,
    )
  )
    return failure("Invalid file submission.");
  const string = (key: string) =>
    typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const operationId = string("operationId").toLowerCase();
  const itemId = string("itemId").toLowerCase();
  const programId = string("programId").toLowerCase();
  const matchId = string("matchId").toLowerCase() || null;
  const fingerprint = string("fingerprint") || null;
  const playerId = string("playerId").toLowerCase() || null;
  const date = string("date");
  const matchType = string("matchType");
  const courtType = string("courtType");
  const file = form.get("file");
  if (
    ![operationId, itemId, programId].every((id) => uuid.test(id)) ||
    (matchId &&
      (!uuid.test(matchId) ||
        !fingerprint ||
        !/^[a-f0-9]{32}$/.test(fingerprint))) ||
    (!matchId &&
      (!playerId ||
        !uuid.test(playerId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        !["Singles", "Doubles"].includes(matchType) ||
        !["Hard", "Clay", "Grass", "Carpet"].includes(courtType))) ||
    !(file instanceof File)
  )
    return failure(
      "Provide a valid program, operation, athlete or prepared match, and file.",
    );
  const quick = getImportProviderStrategy("swing-vision").validateFile(file);
  if (!quick.success) return failure(quick.error ?? "Invalid file.");
  const validation = await validateSwingVisionFile(file);
  if (!validation.success)
    return failure(validation.error ?? "Invalid SwingVision workbook.");
  const parser = await getParser("swing-vision");
  const parsed = await parser?.parse(file);
  const data = parsed?.data;
  if (!parsed?.success || !data)
    return failure(parsed?.error ?? "Could not parse the workbook.");
  if (
    !data.playerName ||
    !data.opponentName ||
    ["Player", "Opponent"].includes(data.playerName) ||
    ["Player", "Opponent"].includes(data.opponentName) ||
    !data.playerScores?.length ||
    data.playerScores.length !== data.opponentScores?.length ||
    [...data.playerScores, ...data.opponentScores].some(
      (n) => n === null || !Number.isInteger(n) || n < 0,
    )
  )
    return failure(
      "The export needs named players and complete numeric set scores.",
    );
  const sha256 = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  const storagePath = `_admin-console/${operationId}/${itemId}/${sha256}.xlsx`;
  // This prefix cannot be written by a browser. Never overwrite a retry's bytes.
  const admin = deps.createAdminClient();
  const stored = await admin.storage
    .from("match-data")
    .upload(storagePath, file, { upsert: false });
  if (stored.error) {
    // A lost response may have stored the blob. Verify its bytes before reuse.
    const existing = await admin.storage
      .from("match-data")
      .download(storagePath);
    if (
      existing.error ||
      !existing.data ||
      createHash("sha256")
        .update(Buffer.from(await existing.data.arrayBuffer()))
        .digest("hex") !== sha256
    )
      return failure(
        "Could not store this file safely. Retry with the same file and operation.",
      );
  }
  const request = {
    sha256,
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    playerId: matchId ? null : playerId,
    date: matchId ? null : date,
    matchType: matchId ? null : matchType,
    courtType: matchId ? null : courtType,
    parsed: {
      player1_name: data.playerName,
      player2_name: data.opponentName,
      score: {
        player1: data.playerScores,
        player2: data.opponentScores,
        player1_tiebreaks: data.playerTiebreaks,
        player2_tiebreaks: data.opponentTiebreaks,
      },
      result: data.result ?? "",
      winner:
        data.result === `${data.playerName} Wins`
          ? "player1"
          : data.result === `${data.opponentName} Wins`
            ? "player2"
            : null,
      format: { best_of: Number(data.bestOf), ad_scoring: data.adScoring },
    },
  };
  const submitted = await admin.rpc("admin_submit_match_file", {
    p_actor_id: actor.id,
    p_operation_id: operationId,
    p_item_id: itemId,
    p_program_id: programId,
    p_match_id: matchId,
    p_fingerprint: fingerprint,
    p_request: request,
  });
  if (submitted.error)
    return failure(
      refusals[submitted.error.message]
        ? submitted.error.message
        : "Could not save this submission. Reload its operation before retrying.",
    );
  const attempt = submitted.data;
  if (attempt.state === "queued") {
    // Await dispatch. Edge claims before side effects; a repeated/lost response
    // cannot cause a second processor to insert points. Queued remains retryable.
    await admin.functions
      .invoke("process-match", {
        body: {
          matchId: attempt.match_id,
          userId: actor.id,
          fileNames: [storagePath],
          sourceProvider: "swing-vision",
        },
      })
      .catch(() => undefined);
  }
  return getAdminMatchFileStatus(operationId, itemId, deps);
}

/** Durable status is scoped by session AND operation actor, not a transient toast. */
export async function getAdminMatchFileStatus(
  operationId: string,
  itemId: string,
  deps: Dependencies = defaults,
) {
  const actor = await deps.requireAdmin();
  if (!actor) return failure("Administrator access is required.");
  if (!uuid.test(operationId) || !uuid.test(itemId))
    return failure("Invalid operation.");
  const client = await deps.createClient();
  const { data: operation, error } = await client
    .from("admin_upload_submissions")
    .select("actor_user_id")
    .eq("operation_id", operationId)
    .maybeSingle();
  if (error || operation?.actor_user_id !== actor.id)
    return failure("This operation is unavailable.");
  const { data: attempt, error: readError } = await client
    .from("admin_file_attempts")
    .select("match_id,file_id,state,error_code")
    .eq("operation_id", operationId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (readError || !attempt)
    return failure("No file has been submitted for this operation yet.");
  return {
    ok: true as const,
    operationId,
    itemId,
    matchId: attempt.match_id,
    fileId: attempt.file_id,
    state: attempt.state as "queued" | "processing" | "completed" | "failed",
    retryable: attempt.state === "queued",
    message:
      attempt.state === "failed"
        ? "Processing stopped and may have saved partial analysis. Administrator review is required; resubmitting will not duplicate it."
        : attempt.state === "processing"
          ? "Processing has started. If this state persists, administrator review is required before another attempt."
          : attempt.state === "queued"
            ? "File saved. Retry this operation with the same file to start processing."
            : "Analysis completed.",
  };
}
