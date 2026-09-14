import { createClient } from "@/lib/supabase/server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { providerKindOrNull } from "@/lib/services/upload";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";
import { singleMatchPreset } from "@/lib/schedule/line-choices";

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
 * Every other match that exists goes back to its own page, never to a blank
 * wizard: the links that land here say "add a video to this match", and a
 * blank wizard would quietly create a second, unrelated one.
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

  // RLS-scoped: a match the viewer cannot read resolves to nothing.
  const { data } = await supabase
    .from("matches")
    .select(
      "id, created_by, program_id, event_entry_id, player1_name, player2_name, tournament_name, round, date, score, court_type, source_provider",
    )
    .eq("id", matchId)
    .maybeSingle();
  // Nothing the viewer can read: there is no match to add a video to.
  if (!data) return { kind: "redirect", href: "/dashboard/matches/new" };

  const matchHref = `/dashboard/matches/${data.id}`;
  const backToMatch: AddVideoTarget = { kind: "redirect", href: matchHref };

  // A team match is filled by the team upload page, which keeps its program
  // and athlete: a single match by its id, an event line's match from its
  // line (`?entry=`, which also carries the round). That page applies its own
  // staff gate. Viewed from a personal workspace, it is not this page's to take.
  if (data.program_id) {
    if (activeKind !== "team") return backToMatch;
    return {
      kind: "redirect",
      href: data.event_entry_id
        ? `/dashboard/team/upload?entry=${data.event_entry_id}&match=${data.id}`
        : `/dashboard/team/upload?match=${data.id}`,
    };
  }
  if (activeKind !== "personal" || data.created_by !== viewerId) {
    return backToMatch;
  }

  if (
    data.source_provider &&
    providerKindOrNull(data.source_provider) === "import"
  ) {
    return backToMatch;
  }

  const analysis = (
    await loadMatchAnalysis(supabase, [data.id], { reap: true })
  ).get(data.id);
  if (analysis && analysis.status !== "failed") {
    return backToMatch;
  }

  return {
    kind: "wizard",
    preset: singleMatchPreset({
      id: data.id,
      eventName: data.tournament_name,
      round: data.round,
      playerName: data.player1_name,
      playerUserId: null,
      opponentName: data.player2_name,
      date: String(data.date),
      surface: data.court_type,
      // Carries `winner` when the match stopped: the games alone would name
      // the wrong side, and the fill path writes this score back.
      score: data.score as EventPreset["score"],
      eventHref: matchHref,
    }),
  };
}
