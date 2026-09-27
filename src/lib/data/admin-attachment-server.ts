import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { prepareAdminAnalysisAttachment } from "@/lib/services/programs/admin-analysis-attachment";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

// NOT sourced from `@/lib/admin/validation`: this file's spec
// (admin-attachment-entry.spec.ts) transpiles it in isolation against a fixed
// module allowlist, so a new runtime import throws there. Keep this local.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface AdminAttachmentOption {
  id: string;
  label: string;
  supportsVideo: boolean;
}
export function adminAttachmentPreset(match: Record<string, any>): EventPreset {
  if (![1, 3, 5].includes(match.format?.best_of))
    throw new Error("Recorded match format is unavailable.");
  return {
    entryId: match.event_entry_id ?? null,
    eventId: null,
    eventName: match.tournament_name ?? null,
    matchId: match.id,
    round: match.round ?? null,
    playerName: match.player1_name,
    playerUserId: match.player1_id ?? null,
    opponentName: match.player2_name,
    date: String(match.date).slice(0, 10),
    surface: match.court_type ?? null,
    bestOf: match.format.best_of,
    adScoring:
      typeof match.format?.ad_scoring === "boolean"
        ? match.format.ad_scoring
        : null,
    score: match.score,
    ending:
      match.result === "Retired"
        ? "retired"
        : match.result === "Defaulted"
          ? "defaulted"
          : null,
    discipline: match.match_type === "Doubles" ? "doubles" : "singles",
    supportsVideo: match.match_type === "Singles",
    eventHref: "/admin/uploads",
    site: null,
    eventKind: null,
    opponentProgramKey: null,
    opponentSchool: null,
  };
}
export async function listAdminAttachmentTargets(programId: string) {
  if (!(await requireAdmin()) || !uuid.test(programId))
    return { ok: false as const, message: "This program is unavailable." };
  const query = await createAdminClient()
    .from("matches")
    .select("id")
    .eq("program_id", programId)
    .is("source_provider", null)
    .eq("analysis_method", "manual")
    .order("date", { ascending: false })
    .limit(100);
  if (query.error)
    return {
      ok: false as const,
      message: "We couldn’t load recorded results. Try again.",
    };
  const client = await createClient();
  const expected = [
    "program-inactive",
    "match-not-found",
    "wrong-program",
    "processing-in-flight",
    "existing-analysis",
    "match-ineligible",
    "athlete-ineligible",
    "entry-ineligible",
  ];
  // Every row's preview is an independent read, so they run concurrently
  // instead of one round trip at a time for up to 100 matches.
  const previews = await Promise.all(
    (query.data ?? []).map((row) =>
      // The authenticated RPC applies every current roster/event/analysis guard.
      client.rpc("admin_get_analysis_attachment", {
        p_program_id: programId,
        p_match_id: row.id,
      }),
    ),
  );
  const options: AdminAttachmentOption[] = [];
  for (const preview of previews) {
    if (preview.error) {
      if (expected.includes(preview.error.message)) continue;
      return {
        ok: false as const,
        message: "We couldn’t check recorded results. Try again.",
      };
    }
    if (!preview.data?.match)
      return {
        ok: false as const,
        message: "We couldn’t check recorded results. Try again.",
      };
    const match = preview.data.match;
    if (![1, 3, 5].includes(match.format?.best_of)) continue;
    options.push({
      id: match.id,
      label: `${String(match.date).slice(0, 10)} · ${match.player1_name} vs ${match.player2_name}${match.round ? ` · ${match.round}` : ""}`,
      supportsVideo: match.match_type === "Singles",
    });
  }
  return { ok: true as const, options };
}
export async function prepareAdminAttachmentTarget(input: {
  programId: string;
  matchId: string;
  operationId: string;
  itemId: string;
}) {
  if (
    !(await requireAdmin()) ||
    !input ||
    typeof input !== "object" ||
    Object.keys(input).length !== 4 ||
    !["programId", "matchId", "operationId", "itemId"].every(
      (key) =>
        typeof input[key as keyof typeof input] === "string" &&
        uuid.test(input[key as keyof typeof input]),
    )
  )
    return { ok: false as const, message: "Choose a valid recorded result." };
  const client = await createClient();
  const preview = await client.rpc("admin_get_analysis_attachment", {
    p_program_id: input.programId,
    p_match_id: input.matchId,
  });
  if (
    preview.error ||
    !preview.data?.match ||
    typeof preview.data.fingerprint !== "string"
  )
    return {
      ok: false as const,
      message:
        "This result changed or is no longer eligible. Reload the recorded results.",
    };
  if (![1, 3, 5].includes(preview.data.match.format?.best_of))
    return {
      ok: false as const,
      message: "The recorded match format is unavailable.",
    };
  const prepared = await prepareAdminAnalysisAttachment({
    ...input,
    fingerprint: preview.data.fingerprint,
  });
  if (!prepared.ok) return prepared;
  return {
    ok: true as const,
    attachment: {
      ...prepared.preparation,
      preset: adminAttachmentPreset(preview.data.match),
    },
  };
}
