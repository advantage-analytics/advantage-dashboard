import { adminUploadCourt } from "@/lib/admin/uploads/court";
import { checkAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import { buildSplitStepJobRequest } from "@/lib/services/splitstep/job-request";
import { UUID_RE as uuid, FINGERPRINT_RE } from "@/lib/admin/validation";
const defaults = { checkAdmin, createAdminClient, getAdminUploadContext };

/**
 * A refusal the route answers with its own `status`: 401 with no session, 403
 * for a signed-in non-admin, 400 for everything the request itself got wrong.
 */
function refuse(message: string, status: 400 | 401 | 403 = 400) {
  return { ok: false as const, status, message };
}

/** Stable operation identity and vendor answers, never an actor or workspace role. */
export async function submitAdminMatchVideo(input: unknown, deps = defaults) {
  const actor = await deps.checkAdmin();
  if (!actor.ok)
    return refuse("Administrator access is required.", actor.status);
  if (!input || typeof input !== "object" || Array.isArray(input))
    return refuse("Invalid video submission.");
  const body = input as Record<string, unknown>;
  const allowed = [
    "operationId",
    "itemId",
    "programId",
    "matchId",
    "fingerprint",
    "playerId",
    "opponentName",
    "score",
    "date",
    "courtType",
    "bestOf",
    "startSeconds",
    "endSeconds",
    "initialTopPlayerIsPlayer1",
    "adScoring",
    "fixedCamera",
  ];
  const id = (key: string) =>
    typeof body[key] === "string" && uuid.test(body[key])
      ? body[key].toLowerCase()
      : null;
  const operationId = id("operationId"),
    itemId = id("itemId"),
    programId = id("programId");
  const matchId = id("matchId");
  if (
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    !operationId ||
    !itemId ||
    !programId ||
    (body.matchId != null && !matchId) ||
    (matchId &&
      (typeof body.fingerprint !== "string" ||
        !FINGERPRINT_RE.test(body.fingerprint))) ||
    ["initialTopPlayerIsPlayer1", "adScoring", "fixedCamera"].some(
      (key) => typeof body[key] !== "boolean",
    ) ||
    ["startSeconds", "endSeconds"].some(
      (key) => typeof body[key] !== "number" || !Number.isFinite(body[key]),
    )
  )
    return refuse(
      "Provide a valid operation, program, trim window and all three video answers.",
    );
  if (
    matchId &&
    ["playerId", "opponentName", "score", "date", "courtType", "bestOf"].some(
      (key) => body[key] != null,
    )
  )
    return refuse(
      "An attachment uses the recorded players, score and match details. Do not supply replacements.",
    );
  const resolved = await deps.getAdminUploadContext(programId);
  if (!resolved.ok || resolved.context.actorId !== actor.id)
    return refuse("This program is unavailable.");
  const context = resolved.context;
  if (
    !context.workspace.canSubmitVideo ||
    context.workspace.programStatus !== "active"
  )
    return refuse("This program must be active before submitting video.");
  const admin = deps.createAdminClient();
  const player = context.roster.find((p) => p.playerId === id("playerId"));
  let player1Name = player?.name ?? "",
    player2Name =
      typeof body.opponentName === "string" ? body.opponentName.trim() : "";
  let score = body.score as
    { player1: (number | null)[]; player2: (number | null)[] } | undefined;
  if (matchId) {
    // Read only; the RPC locks/revalidates T5 before mutating anything.
    const { data: match, error } = await admin
      .from("matches")
      .select("program_id,player1_name,player2_name,score,match_type")
      .eq("id", matchId)
      .maybeSingle();
    if (
      error ||
      !match ||
      match.program_id !== programId ||
      match.match_type !== "Singles"
    )
      return refuse("Choose a singles match in this program.");
    player1Name = match.player1_name;
    player2Name = match.player2_name;
    score = match.score;
  } else if (
    !player ||
    typeof body.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
    !Number.isFinite(Date.parse(body.date)) ||
    adminUploadCourt(body.courtType) === undefined ||
    ![1, 3, 5].includes(Number(body.bestOf))
  ) {
    return refuse("Choose a roster athlete, match date and format.");
  }
  if (
    !score ||
    !Array.isArray(score.player1) ||
    !Array.isArray(score.player2) ||
    [...score.player1, ...score.player2].some(
      (n) => n !== null && (!Number.isInteger(n) || Number(n) < 0),
    )
  )
    return refuse("Provide complete numeric set scores.");
  const tieScores = score as typeof score & {
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
  };
  if (
    [tieScores.player1_tiebreaks, tieScores.player2_tiebreaks].some(
      (values) =>
        values !== undefined &&
        (!Array.isArray(values) ||
          values.some(
            (n) => n !== null && (!Number.isInteger(n) || Number(n) < 0),
          )),
    )
  )
    return refuse("Tiebreak scores must be nonnegative numbers or null.");
  const built = buildSplitStepJobRequest({
    matchId: matchId ?? operationId,
    videoUrl: "",
    allowEmptyVideoUrl: true,
    webhookUrl: "https://example.invalid/webhook",
    player1Name,
    player2Name,
    player1Scores: score.player1,
    player2Scores: score.player2,
    matchType: "Singles",
    startTimeSeconds: body.startSeconds as number,
    endTimeSeconds: body.endSeconds as number,
    initialTopPlayerIsPlayer1: body.initialTopPlayerIsPlayer1 as boolean,
    adScoring: body.adScoring as boolean,
    fixedCamera: body.fixedCamera as boolean,
  });
  if (!built.ok) return refuse(built.errors.join(" "));
  const request = {
    playerId: matchId ? null : player!.playerId,
    opponentName: matchId ? null : player2Name,
    score: matchId
      ? null
      : {
          player1: score.player1,
          player2: score.player2,
          player1_tiebreaks: tieScores.player1_tiebreaks ?? [],
          player2_tiebreaks: tieScores.player2_tiebreaks ?? [],
        },
    date: matchId ? null : body.date,
    courtType: matchId ? null : adminUploadCourt(body.courtType),
    bestOf: matchId ? null : Number(body.bestOf),
    startSeconds: body.startSeconds,
    endSeconds: body.endSeconds,
    initialTopPlayerIsPlayer1: body.initialTopPlayerIsPlayer1,
    adScoring: body.adScoring,
    fixedCamera: body.fixedCamera,
  };
  const { data, error } = await admin.rpc("admin_submit_match_video", {
    p_actor_id: actor.id,
    p_operation_id: operationId,
    p_item_id: itemId,
    p_program_id: programId,
    p_match_id: matchId,
    p_fingerprint: matchId ? body.fingerprint : null,
    p_request: request,
  });
  if (error) {
    // The RPC's own text can carry a SQLSTATE detail; it goes to the log, and
    // the administrator gets the sentence.
    console.error("[admin-video-submission] reservation refused", {
      operationId,
      itemId,
      message: error.message,
    });
    return refuse("Could not reserve this video.");
  }
  return {
    ok: true as const,
    operationId,
    itemId,
    matchId: data.match_id as string,
    jobId: data.job_id as string,
  };
}
