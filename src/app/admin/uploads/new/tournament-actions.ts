"use server";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import {
  getAdminTournamentResultContext,
  submitAdminTournamentResult,
} from "@/lib/services/programs/admin-tournament-submission";
import type { AdminTournamentSubmissionInput } from "@/lib/admin/results/types";
import type {
  AdminTournamentContext,
  TournamentDetails,
} from "@/lib/admin/results/tournament-form";
import { resultLabelFromOutcome } from "@/components/dashboard/schedule/result-choice";
export async function submitAdminTournamentAction(
  input: AdminTournamentSubmissionInput,
) {
  const result = await submitAdminTournamentResult(input);
  if (!result.ok) return result;
  let resultHref = `/admin/uploads/new?team=${input.programId}&kind=tournament&event=${result.eventId}&entry=${result.entryId}&round=${input.round}`;
  if (result.item.status === "succeeded" && result.item.matchId) {
    const session = await createClient();
    const accessible = await session
      .from("matches")
      .select("id")
      .eq("id", result.item.matchId)
      .maybeSingle();
    if (!accessible.error && accessible.data)
      resultHref = `/dashboard/matches/${result.item.matchId}`;
  }
  return { ...result, resultHref };
}
export async function loadAdminTournamentAction(
  programId: string,
  eventId: string,
): Promise<
  { ok: true; context: AdminTournamentContext } | { ok: false; message: string }
> {
  const actor = await requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  // Neither read depends on the other; only the results are cross-checked.
  const [target, snapshot] = await Promise.all([
    getAdminUploadContext(programId),
    getAdminTournamentResultContext(programId, eventId),
  ]);
  if (!target.ok || target.context.actorId !== actor.id)
    return { ok: false, message: "This program is unavailable." };
  if (!snapshot.ok) return snapshot;
  try {
    const data = snapshot.context as {
      fingerprint: string;
      event: {
        name: string;
        starts_on: string;
        ends_on: string;
        site: TournamentDetails["site"];
        surface: string;
        host: string | null;
        format: { best_of: number; ad_scoring: boolean | null };
      };
      entries: {
        id: string;
        discipline: string;
        player_user_ids: string[];
        player_labels: string[];
        draw: string | null;
        seed: number | null;
        fingerprint: string;
        forfeit: string | null;
      }[];
    };
    const admin = createAdminClient();
    const [matches, outcomes] = await Promise.all([
      admin
        .from("matches")
        .select("event_entry_id,round,score")
        .eq("program_id", programId)
        .in(
          "event_entry_id",
          data.entries.map((e) => e.id),
        ),
      admin
        .from("program_event_outcomes")
        .select("entry_id,round,kind,side")
        .eq("program_id", programId)
        .eq("event_id", eventId),
    ]);
    if (matches.error || outcomes.error)
      throw new Error("Saved results unavailable");
    const e = data.event;
    return {
      ok: true,
      context: {
        eventId,
        fingerprint: data.fingerprint,
        tournament: {
          name: e.name,
          startsOn: e.starts_on,
          endsOn: e.ends_on,
          site: e.site,
          surface: e.surface || "",
          host: e.host,
          bestOf: e.format.best_of,
          adScoring: e.format.ad_scoring,
        },
        entries: data.entries
          .filter(
            (entry) =>
              entry.discipline === "singles" &&
              entry.player_user_ids.length === 1 &&
              entry.player_labels.length === 1 &&
              !!entry.player_labels[0]?.trim(),
          )
          .map((entry) => {
            const saved: Record<string, string> = {};
            for (const m of matches.data ?? [])
              if (m.event_entry_id === entry.id && m.round) {
                const score = m.score as {
                  player1?: number[];
                  player2?: number[];
                } | null;
                saved[m.round] =
                  score?.player1
                    ?.map((n, i) => `${n}–${score.player2?.[i] ?? "?"}`)
                    .join(" ") || "Result recorded";
              }
            for (const o of outcomes.data ?? [])
              if (o.entry_id === entry.id && o.round)
                saved[o.round] = resultLabelFromOutcome(o);
            return {
              id: entry.id,
              playerId: entry.player_user_ids[0],
              label: entry.player_labels[0],
              draw: entry.draw,
              seed: entry.seed,
              fingerprint: entry.fingerprint,
              forfeit: entry.forfeit,
              saved,
            };
          }),
      },
    };
  } catch {
    return {
      ok: false,
      message:
        "We couldn’t load all saved results. Choose the tournament again to retry.",
    };
  }
}
