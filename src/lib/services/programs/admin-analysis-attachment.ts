import { requireAdmin } from "./admin-guard";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = /^[0-9a-f]{32}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strictStrings<K extends string>(
  input: unknown,
  keys: readonly K[],
): Record<K, string> | null {
  if (!record(input) || Object.keys(input).length !== keys.length) return null;
  for (const key of keys) {
    const value = input[key];
    if (
      !Object.hasOwn(input, key) ||
      typeof value !== "string" ||
      !(key === "fingerprint" ? token : uuid).test(value)
    )
      return null;
  }
  return input as Record<K, string>;
}

const refusals: Record<string, string> = {
  "admin-required": "Administrator access is required.",
  "program-not-found": "That program no longer exists.",
  "program-inactive": "Analysis requires an active program.",
  "match-not-found": "That match no longer exists.",
  "wrong-program": "That match belongs to another program.",
  "processing-in-flight": "This match already has analysis in progress.",
  "existing-analysis": "This match already has analysis or an attached file.",
  "match-ineligible": "This match is not eligible for analysis attachment.",
  "athlete-ineligible":
    "The recorded athlete is no longer eligible in this program.",
  "entry-ineligible": "The recorded event line is no longer eligible.",
  "stale-target": "The match changed. Reload it before preparing analysis.",
  "attachment-reserved":
    "Another analysis attachment is already reserved for this match.",
  "Operation identity conflict":
    "This operation belongs to another actor or target.",
  "Item identity conflict":
    "This item was already used for a different request.",
};

type Failure = { ok: false; reason: string; message: string };
interface Dependencies {
  requireAdmin: typeof requireAdmin;
  createClient: typeof createClient;
}
const defaults: Dependencies = { requireAdmin, createClient };
function failure(reason: string): Failure {
  return {
    ok: false,
    reason,
    message:
      refusals[reason] ?? "We couldn't prepare this attachment. Try again.",
  };
}

/** Server-only service, not a Server Action accepting injectable dependencies.
 * Uses the authenticated client: SQL derives the actor from the real session.
 * Never route this through the existing wizard's match UPDATE/fill payload.
 */
export async function prepareAdminAnalysisAttachment(
  input: unknown,
  deps: Dependencies = defaults,
) {
  if (!(await deps.requireAdmin())) return failure("admin-required");
  const parsed = strictStrings(input, [
    "programId",
    "matchId",
    "operationId",
    "itemId",
    "fingerprint",
  ] as const);
  if (!parsed) return failure("invalid-input");
  const { programId, matchId, operationId, itemId, fingerprint } = parsed;
  const client = await deps.createClient();
  const { error } = await client.rpc("admin_prepare_analysis_attachment", {
    p_operation_id: operationId,
    p_item_id: itemId,
    p_program_id: programId,
    p_match_id: matchId,
    p_fingerprint: fingerprint,
  });
  if (error)
    return failure(
      Object.hasOwn(refusals, error.message)
        ? error.message
        : "preparation-failed",
    );
  return {
    ok: true as const,
    preparation: {
      programId,
      matchId,
      operationId,
      itemId,
      fingerprint,
      status: "prepared" as const,
    },
  };
}

/** Preview supplies a concurrency token; SQL always rechecks on preparation. */
export async function getAdminAnalysisAttachment(
  input: unknown,
  deps: Dependencies = defaults,
) {
  if (!(await deps.requireAdmin())) return failure("admin-required");
  const parsed = strictStrings(input, ["programId", "matchId"] as const);
  if (!parsed) return failure("invalid-input");
  const client = await deps.createClient();
  const { data, error } = await client.rpc("admin_get_analysis_attachment", {
    p_program_id: parsed.programId,
    p_match_id: parsed.matchId,
  });
  if (error)
    return failure(
      Object.hasOwn(refusals, error.message) ? error.message : "read-failed",
    );
  // Keep the UI contract small; neither this preview nor its token authorizes a
  // client to edit the recorded result or to submit media directly.
  if (
    !record(data) ||
    typeof data.fingerprint !== "string" ||
    !token.test(data.fingerprint) ||
    !record(data.match)
  )
    return failure("read-failed");
  const match = data.match;
  if (
    typeof match.id !== "string" ||
    typeof match.player1_name !== "string" ||
    typeof match.player2_name !== "string" ||
    !(match.result === null || typeof match.result === "string")
  )
    return failure("read-failed");
  return {
    ok: true as const,
    target: {
      fingerprint: data.fingerprint,
      match: {
        id: match.id,
        player1_name: match.player1_name,
        player2_name: match.player2_name,
        score: match.score,
        result: match.result,
      },
    },
  };
}
