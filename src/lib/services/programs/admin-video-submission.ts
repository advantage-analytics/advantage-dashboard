import { requireAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import { buildSplitStepJobRequest } from "@/lib/services/splitstep/job-request";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const defaults = { requireAdmin, createAdminClient, getAdminUploadContext };

/** Stable operation identity and vendor answers, never an actor or workspace role. */
export async function submitAdminMatchVideo(input: unknown, deps = defaults) {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false as const, message: "Administrator access is required." };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false as const, message: "Invalid video submission." };
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
        !/^[a-f0-9]{32}$/.test(body.fingerprint))) ||
    ["initialTopPlayerIsPlayer1", "adScoring", "fixedCamera"].some(
      (key) => typeof body[key] !== "boolean",
    ) ||
    ["startSeconds", "endSeconds"].some(
      (key) => typeof body[key] !== "number" || !Number.isFinite(body[key]),
    )
  )
    return {
      ok: false as const,
      message:
        "Provide a valid operation, program, trim window and all three video answers.",
    };
  if (
    matchId &&
    ["playerId", "opponentName", "score", "date", "courtType", "bestOf"].some(
      (key) => body[key] != null,
    )
  )
    return {
      ok: false as const,
      message:
        "An attachment uses the recorded players, score and match details. Do not supply replacements.",
    };
  const resolved = await deps.getAdminUploadContext(programId);
  if (!resolved.ok || resolved.context.actorId !== actor.id)
    return { ok: false as const, message: "This program is unavailable." };
  const context = resolved.context;
  if (
    !context.workspace.canSubmitVideo ||
    context.workspace.programStatus !== "active"
  )
    return {
      ok: false as const,
      message: "This program must be active before submitting video.",
    };
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
      return {
        ok: false as const,
        message: "Choose a singles match in this program.",
      };
    player1Name = match.player1_name;
    player2Name = match.player2_name;
    score = match.score;
  } else if (
    !player ||
    typeof body.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
    !Number.isFinite(Date.parse(body.date)) ||
    !["Hard", "Clay", "Grass", "Carpet"].includes(String(body.courtType)) ||
    ![1, 3, 5].includes(Number(body.bestOf))
  ) {
    return {
      ok: false as const,
      message: "Choose a roster athlete, match date, surface and format.",
    };
  }
  if (
    !score ||
    !Array.isArray(score.player1) ||
    !Array.isArray(score.player2) ||
    [...score.player1, ...score.player2].some(
      (n) => n !== null && (!Number.isInteger(n) || Number(n) < 0),
    )
  )
    return {
      ok: false as const,
      message: "Provide complete numeric set scores.",
    };
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
    return {
      ok: false as const,
      message: "Tiebreak scores must be nonnegative numbers or null.",
    };
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
  if (!built.ok) return { ok: false as const, message: built.errors.join(" ") };
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
    courtType: matchId ? null : body.courtType,
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
  if (error)
    return {
      ok: false as const,
      message: "Could not reserve this video: " + error.message,
    };
  return {
    ok: true as const,
    operationId,
    itemId,
    matchId: data.match_id as string,
    jobId: data.job_id as string,
  };
}
