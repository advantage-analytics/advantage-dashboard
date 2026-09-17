import { requireAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import { validateAdminLineResult } from "./admin-dual-submission";
import { ROUND_ORDER } from "@/lib/schedule/format";
import type {
  AdminTournamentSubmissionInput,
  AdminTournamentSubmissionResult,
} from "@/lib/admin/results/types";
const defaults = { requireAdmin, createAdminClient, getAdminUploadContext };
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const text = (v: unknown) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const fingerprint = (v: unknown) =>
  typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function validateAdminTournamentSubmission(v: unknown): string | null {
  if (
    !object(v) ||
    !keys(v, [
      "operationId",
      "itemId",
      "programId",
      "event",
      "entry",
      "round",
      "result",
    ]) ||
    !uuid(v.operationId) ||
    !uuid(v.itemId) ||
    !uuid(v.programId) ||
    typeof v.round !== "string" ||
    !ROUND_ORDER.includes(v.round) ||
    !validateAdminLineResult(v.result, "S1")
  )
    return "Provide a valid operation, tournament round and score or outcome.";
  if (!object(v.event) || !object(v.entry))
    return "Choose a tournament and athlete entry.";
  const e = v.event,
    l = v.entry;
  if (e.kind === "existing") {
    if (
      !keys(e, ["kind", "eventId", "fingerprint"]) ||
      !uuid(e.eventId) ||
      !fingerprint(e.fingerprint)
    )
      return "Reload the tournament before submitting.";
  } else if (
    e.kind === "new" &&
    keys(e, ["kind", "tournament"]) &&
    object(e.tournament)
  ) {
    const t = e.tournament;
    if (
      !keys(t, [
        "name",
        "startsOn",
        "endsOn",
        "site",
        "surface",
        "host",
        "bestOf",
        "adScoring",
      ]) ||
      !text(t.name) ||
      !date(t.startsOn) ||
      !date(t.endsOn) ||
      String(t.endsOn) < String(t.startsOn) ||
      typeof t.site !== "string" ||
      !["home", "away", "neutral"].includes(t.site) ||
      typeof t.surface !== "string" ||
      t.surface.length > 50 ||
      !(t.host === null || text(t.host)) ||
      typeof t.bestOf !== "number" ||
      ![1, 3, 5].includes(t.bestOf) ||
      typeof t.adScoring !== "boolean"
    )
      return "Complete the tournament dates and format.";
  } else return "Choose a new or existing tournament.";
  if (l.kind === "existing") {
    if (
      e.kind !== "existing" ||
      !keys(l, ["kind", "entryId", "playerId", "fingerprint"]) ||
      !uuid(l.entryId) ||
      !uuid(l.playerId) ||
      !fingerprint(l.fingerprint)
    )
      return "Reload this athlete's tournament entry.";
  } else if (l.kind === "new") {
    if (
      !keys(l, ["kind", "playerId", "playerLabel", "draw", "seed"]) ||
      !uuid(l.playerId) ||
      !text(l.playerLabel) ||
      !(l.draw === null || text(l.draw)) ||
      !(
        l.seed === null ||
        (typeof l.seed === "number" &&
          Number.isInteger(l.seed) &&
          l.seed > 0 &&
          l.seed <= 2147483647)
      )
    )
      return "Select an eligible athlete and valid entry details.";
  } else return "Choose a new or existing athlete entry.";
  return null;
}
/** Session guard precedes target context and service-role access. */
export async function submitAdminTournamentResult(
  input: unknown,
  deps = defaults,
): Promise<AdminTournamentSubmissionResult> {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  const invalid = validateAdminTournamentSubmission(input);
  if (invalid) return { ok: false, message: invalid };
  const body = JSON.parse(
    JSON.stringify(input),
  ) as AdminTournamentSubmissionInput;
  const context = await deps.getAdminUploadContext(body.programId);
  if (!context.ok || context.context.actorId !== actor.id)
    return { ok: false, message: "This program is unavailable." };
  const admin = deps.createAdminClient();
  const prepared = await admin.rpc("admin_prepare_tournament_result", {
    p_actor_id: actor.id,
    p_operation_id: body.operationId,
    p_program_id: body.programId,
    p_request: body,
  });
  if (prepared.error) return { ok: false, message: prepared.error.message };
  if (prepared.data.item.status !== "succeeded")
    await admin.rpc("admin_apply_tournament_result", {
      p_actor_id: actor.id,
      p_operation_id: body.operationId,
      p_item_id: body.itemId,
    });
  // A failed/lost apply response is resolved from durable state, never guessed.
  const status = await admin.rpc("admin_tournament_result_status", {
    p_actor_id: actor.id,
    p_operation_id: body.operationId,
  });
  if (status.error)
    return {
      ok: false,
      message:
        "The response was interrupted. Retry the same operation to recover its saved result.",
    };
  return {
    ok: true,
    operationId: body.operationId,
    eventId: status.data.eventId,
    entryId: status.data.entryId,
    item: status.data.item,
  };
}
export async function getAdminTournamentResultContext(
  programId: string,
  eventId: string,
  deps = defaults,
) {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false as const, message: "Administrator access is required." };
  if (!uuid(programId) || !uuid(eventId))
    return {
      ok: false as const,
      message: "Choose a valid program and tournament.",
    };
  const { data, error } = await deps
    .createAdminClient()
    .rpc("admin_get_tournament_result_context", {
      p_actor_id: actor.id,
      p_program_id: programId,
      p_event_id: eventId,
    });
  return error
    ? { ok: false as const, message: error.message }
    : { ok: true as const, context: data };
}
