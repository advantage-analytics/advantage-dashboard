import { requireAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import {
  validateDualLineup,
  validateLineup,
  DUAL_SLOTS,
} from "@/lib/schedule/lineup-validation";
import type {
  AdminDualSubmissionInput,
  AdminDualSubmissionResult,
  AdminLineResult,
} from "@/lib/admin/results/types";

const defaults = { requireAdmin, createAdminClient, getAdminUploadContext };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
const text = (v: unknown) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(text);
const games = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 5 &&
  v.every((n) => Number.isInteger(n) && n >= 0 && n <= 99);
const ties = (v: unknown): v is (number | null)[] =>
  Array.isArray(v) &&
  v.length <= 5 &&
  v.every((n) => n === null || (Number.isInteger(n) && n >= 0 && n <= 999));
export function validateAdminLineResult(
  value: unknown,
  slot: string,
): value is AdminLineResult {
  if (!object(value)) return false;
  if (value.kind === "outcome")
    return (
      keys(value, ["kind", "outcome", "side"]) &&
      ["forfeit", "default", "withdrawal"].includes(String(value.outcome)) &&
      ["ours", "theirs"].includes(String(value.side))
    );
  return (
    value.kind === "score" &&
    keys(value, [
      "kind",
      "ourGames",
      "theirGames",
      "ourTiebreaks",
      "theirTiebreaks",
      "opponentLabels",
      "ending",
    ]) &&
    games(value.ourGames) &&
    games(value.theirGames) &&
    value.ourGames.length === value.theirGames.length &&
    ties(value.ourTiebreaks) &&
    ties(value.theirTiebreaks) &&
    [0, value.ourGames.length].includes(value.ourTiebreaks.length) &&
    [0, value.ourGames.length].includes(value.theirTiebreaks.length) &&
    strings(value.opponentLabels) &&
    value.opponentLabels.length === (slot.startsWith("D") ? 2 : 1) &&
    (value.ending === null ||
      (object(value.ending) &&
        keys(value.ending, ["kind", "side"]) &&
        ["retired", "defaulted"].includes(String(value.ending.kind)) &&
        ["ours", "theirs"].includes(String(value.ending.side))))
  );
}

/** Pure whole-envelope validation, before any setup RPC or write client exists. */
export function validateAdminDualSubmission(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(value, ["operationId", "programId", "event", "items"]) ||
    !uuid.test(String(value.operationId)) ||
    !uuid.test(String(value.programId)) ||
    !object(value.event) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 9
  )
    return "Provide a valid operation, program, dual and one to nine results.";
  const ids = new Set<string>(),
    slots = new Set<string>();
  for (const item of value.items) {
    if (
      !object(item) ||
      !keys(item, ["itemId", "slot", "result"]) ||
      !uuid.test(String(item.itemId)) ||
      !(DUAL_SLOTS as readonly string[]).includes(String(item.slot)) ||
      ids.has(String(item.itemId).toLowerCase()) ||
      slots.has(String(item.slot)) ||
      !validateAdminLineResult(item.result, String(item.slot))
    )
      return "Every result needs a unique item ID and court, valid scores or a complete outcome.";
    ids.add(String(item.itemId).toLowerCase());
    slots.add(String(item.slot));
  }
  const event = value.event;
  if (event.kind === "existing")
    return keys(event, ["kind", "eventId", "fingerprint"]) &&
      uuid.test(String(event.eventId)) &&
      /^[a-f0-9]{32}$/.test(String(event.fingerprint))
      ? null
      : "Reload the existing dual before submitting its results.";
  if (
    event.kind !== "new" ||
    !keys(event, ["kind", "dual"]) ||
    !object(event.dual)
  )
    return "Choose an existing or new dual.";
  const d = event.dual;
  if (
    !keys(d, [
      "opponent",
      "opponentProgramKey",
      "date",
      "startsAtTime",
      "site",
      "surface",
      "bestOf",
      "adScoring",
      "doublesGamesTo",
      "doublesAdScoring",
      "lines",
    ]) ||
    !text(d.opponent) ||
    !(d.opponentProgramKey === null || text(d.opponentProgramKey)) ||
    typeof d.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
    !Number.isFinite(Date.parse(d.date)) ||
    new Date(d.date).toISOString().slice(0, 10) !== d.date ||
    !(
      d.startsAtTime === null ||
      (typeof d.startsAtTime === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(d.startsAtTime))
    ) ||
    !["home", "away", "neutral"].includes(String(d.site)) ||
    typeof d.surface !== "string" ||
    d.surface.length > 50 ||
    typeof d.bestOf !== "number" ||
    ![1, 3, 5].includes(d.bestOf) ||
    !(d.adScoring === null || typeof d.adScoring === "boolean") ||
    typeof d.doublesGamesTo !== "number" ||
    ![6, 8].includes(d.doublesGamesTo) ||
    typeof d.doublesAdScoring !== "boolean" ||
    !Array.isArray(d.lines) ||
    d.lines.length !== 9
  )
    return "Complete the dual's name, date, format and nine-court lineup.";
  for (const line of d.lines) {
    if (
      !object(line) ||
      !keys(line, [
        "discipline",
        "slot",
        "position",
        "playerUserIds",
        "playerLabels",
        "opponentLabels",
        "noPlayer",
        "opponentNoPlayer",
      ]) ||
      !["singles", "doubles"].includes(String(line.discipline)) ||
      !Number.isInteger(line.position) ||
      Number(line.position) < 0 ||
      !Array.isArray(line.playerUserIds) ||
      !line.playerUserIds.every(
        (id) => typeof id === "string" && uuid.test(id),
      ) ||
      !strings(line.playerLabels) ||
      !strings(line.opponentLabels) ||
      ![0, line.discipline === "doubles" ? 2 : 1].includes(
        line.opponentLabels.length,
      ) ||
      (line.noPlayer !== undefined && typeof line.noPlayer !== "boolean") ||
      (line.opponentNoPlayer !== undefined &&
        typeof line.opponentNoPlayer !== "boolean")
    )
      return "Every lineup entry needs valid roster IDs and names.";
    if (line.playerUserIds.length !== line.playerLabels.length)
      return "Select each lineup athlete from this program's roster.";
    const item = value.items.find((i) => i.slot === line.slot);
    const side = line.noPlayer
      ? "ours"
      : line.opponentNoPlayer
        ? "theirs"
        : null;
    if (
      side &&
      (!item ||
        item.result.kind !== "outcome" ||
        item.result.outcome !== "forfeit" ||
        item.result.side !== side)
    )
      return "Each No player line must include its matching forfeit result.";
  }
  const lineup =
    d.lines as unknown as import("@/lib/schedule/write-types").LineupLineInput[];
  return (
    [...validateLineup(lineup), ...validateDualLineup(lineup)][0]?.reason ??
    null
  );
}

/** Boundary actor is always the authenticated admin, including member admins. */
export async function submitAdminDualResults(
  input: unknown,
  deps = defaults,
): Promise<AdminDualSubmissionResult> {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  const invalid = validateAdminDualSubmission(input);
  if (invalid) return { ok: false, message: invalid };
  // JSON round-trip gives the immutable request exactly the same representation
  // as PostgREST; no actor, role, provider or overwrite flag is accepted.
  const body = JSON.parse(JSON.stringify(input)) as AdminDualSubmissionInput;
  const context = await deps.getAdminUploadContext(body.programId);
  if (!context.ok || context.context.actorId !== actor.id)
    return { ok: false, message: "This program is unavailable." };
  const admin = deps.createAdminClient();
  const prepared = await admin.rpc("admin_prepare_dual_results", {
    p_actor_id: actor.id,
    p_operation_id: body.operationId,
    p_program_id: body.programId,
    p_request: body,
  });
  if (prepared.error) return { ok: false, message: prepared.error.message };
  // Independent transactions: one failed line cannot undo an earlier success.
  // An interrupted response is recovered with this same operation and request.
  for (const item of prepared.data.items) {
    if (item.status === "succeeded") continue;
    const applied = await admin.rpc("admin_apply_dual_result", {
      p_actor_id: actor.id,
      p_operation_id: body.operationId,
      p_item_id: item.itemId,
    });
    if (applied.error) break; // Lost/unknown RPC result: read durable state, never guess.
  }
  const status = await admin.rpc("admin_dual_result_status", {
    p_actor_id: actor.id,
    p_operation_id: body.operationId,
  });
  if (status.error)
    return {
      ok: false,
      message:
        "The response was interrupted. Retry the same operation to recover its saved results.",
    };
  return {
    ok: true,
    operationId: body.operationId,
    eventId: status.data.eventId,
    items: status.data.items,
  };
}

/** T13 can load the exact immutable context/fingerprint before editing results. */
export async function getAdminDualResultContext(
  programId: string,
  eventId: string,
  deps = defaults,
) {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false as const, message: "Administrator access is required." };
  if (!uuid.test(programId) || !uuid.test(eventId))
    return { ok: false as const, message: "Choose a valid program and dual." };
  const { data, error } = await deps
    .createAdminClient()
    .rpc("admin_get_dual_result_context", {
      p_actor_id: actor.id,
      p_program_id: programId,
      p_event_id: eventId,
    });
  return error
    ? { ok: false as const, message: error.message }
    : { ok: true as const, context: data };
}
