import { createClient } from "@/lib/supabase/server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { providerKindOrNull } from "@/lib/services/upload";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * Where "add a video to this match" should go, for `/dashboard/matches/new?match=`.
 *
 * The wizard can already FILL an existing row instead of inserting one — an
 * `EventPreset` whose `matchId` is set updates that match and hangs the new
 * processing job off it. Team pages have used that for a while
 * (`/dashboard/team/upload?match=`); this is the personal counterpart, and the
 * router that sends every other match to the page that can actually take it.
 *
 * ── Who gets the wizard ─────────────────────────────────────────────────────
 * A personal match (no program) the viewer created, that is not a spreadsheet
 * import, and whose latest job is absent or literally `failed`:
 *
 * - **Not an import.** A SwingVision match already has points and shots from
 *   the export. Video analysis writes its own, so attaching a video to one
 *   would put two sets of points on a single match.
 * - **No live job.** `processing_jobs_one_live_per_match` refuses a second job
 *   while one is pending, uploading, uploaded or queued, so the wizard would
 *   only fail at the end of the most expensive step. Stalled uploads are reaped
 *   first, so a closed tab's frozen job counts as failed, as it does everywhere
 *   else.
 * - **Not `derivation_failed`.** That job already has its video and results;
 *   what it needs is a derivation re-run, not a new recording.
 *
 * `playerUserId` is null on purpose: in a personal workspace a non-null one
 * resolves to a roster athlete, which `uploadEligibility` refuses there. Null
 * resolves to "Myself", which is who a personal match belongs to.
 */
export type AddVideoTarget =
  { kind: "wizard"; preset: EventPreset } | { kind: "redirect"; href: string };

export async function getAddVideoTarget(
  matchId: string,
  viewerId: string,
  activeKind: "personal" | "team",
): Promise<AddVideoTarget> {
  const supabase = await createClient();
  const fallback: AddVideoTarget = {
    kind: "redirect",
    href: "/dashboard/matches/new",
  };

  // RLS-scoped: a match the viewer cannot read resolves to nothing.
  const { data } = await supabase
    .from("matches")
    .select(
      "id, created_by, program_id, event_entry_id, player1_name, player2_name, tournament_name, round, date, score, court_type, source_provider",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!data) return fallback;

  const matchHref = `/dashboard/matches/${data.id}`;

  // A team match with no event already has a flow that keeps its program and
  // athlete; an event line's match is filled from its line, never from here.
  if (data.program_id) {
    return activeKind === "team" && !data.event_entry_id
      ? { kind: "redirect", href: `/dashboard/team/upload?match=${data.id}` }
      : fallback;
  }
  if (activeKind !== "personal" || data.created_by !== viewerId) {
    return fallback;
  }

  if (
    data.source_provider &&
    providerKindOrNull(data.source_provider) === "import"
  ) {
    return { kind: "redirect", href: matchHref };
  }

  const analysis = (
    await loadMatchAnalysis(supabase, [data.id], { reap: true })
  ).get(data.id);
  if (analysis && analysis.status !== "failed") {
    return { kind: "redirect", href: matchHref };
  }

  // Carries `winner` when the match stopped: the games alone would name the
  // wrong side, and the fill path writes this score back.
  const score = data.score as EventPreset["score"];

  return {
    kind: "wizard",
    preset: {
      entryId: null,
      eventId: null,
      eventName: data.tournament_name,
      matchId: data.id,
      round: data.round,
      playerName: data.player1_name,
      playerUserId: null,
      opponentName: data.player2_name,
      date: String(data.date).slice(0, 10),
      surface: data.court_type,
      bestOf: score?.player1.length === 1 ? 1 : 3,
      // Asked, never defaulted — the pipeline refuses a job without a real
      // answer, and a wrong one that looks real is worse than none.
      adScoring: null,
      score,
      supportsVideo: true,
      eventHref: matchHref,
      site: null,
      eventKind: null,
      opponentProgramKey: null,
      opponentSchool: null,
    },
  };
}
