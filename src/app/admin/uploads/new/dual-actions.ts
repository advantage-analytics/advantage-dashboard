"use server";

import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminDualResultContext,
  submitAdminDualResults,
} from "@/lib/services/programs/admin-dual-submission";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import { hasNineDualCourts } from "@/lib/admin/results/dual-form";
import type { AdminDualContext } from "@/lib/admin/results/dual-form";
import type { AdminDualSubmissionInput } from "@/lib/admin/results/types";
import type {
  CreateDualInput,
  LineupLineInput,
} from "@/lib/schedule/write-types";
import { resultLabelFromOutcome } from "@/components/dashboard/schedule/result-choice";

export async function submitAdminDualAction(input: AdminDualSubmissionInput) {
  return submitAdminDualResults(input);
}
export async function loadAdminDualAction(
  programId: string,
  eventId: string,
): Promise<
  { ok: true; context: AdminDualContext } | { ok: false; message: string }
> {
  const actor = await requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  const target = await getAdminUploadContext(programId);
  if (!target.ok || target.context.actorId !== actor.id)
    return { ok: false, message: "This program is unavailable." };
  const snapshot = await getAdminDualResultContext(programId, eventId);
  if (!snapshot.ok) return snapshot;
  try {
    const data = snapshot.context as {
      fingerprint: string;
      event: {
        id: string;
        name: string;
        starts_on: string;
        starts_at_time: string | null;
        site: CreateDualInput["site"];
        surface: string;
        format: {
          best_of: number;
          ad_scoring: boolean | null;
          doubles?: { games_to: 6 | 8; ad_scoring: boolean | null };
        };
      };
      entries: {
        id: string;
        slot: string;
        discipline: LineupLineInput["discipline"];
        position: number;
        player_user_ids: string[];
        player_labels: string[];
        opponent_labels: string[];
        forfeit: "ours" | "theirs" | null;
      }[];
    };
    if (!hasNineDualCourts(data.entries))
      return {
        ok: false,
        message:
          "This dual needs a complete nine-court lineup. Correct its schedule lineup before entering results.",
      };
    const admin = createAdminClient();
    const [matches, outcomes] = await Promise.all([
      admin
        .from("matches")
        .select("event_entry_id,score,result")
        .eq("program_id", programId)
        .in(
          "event_entry_id",
          data.entries.map((e) => e.id),
        ),
      admin
        .from("program_event_outcomes")
        .select("entry_id,kind,side")
        .eq("program_id", programId)
        .eq("event_id", eventId),
    ]);
    if (matches.error || outcomes.error)
      throw new Error("Saved results could not be loaded.");
    const saved: Record<string, string> = {};
    for (const entry of data.entries) {
      const match = matches.data?.find((m) => m.event_entry_id === entry.id);
      const outcome = outcomes.data?.find((o) => o.entry_id === entry.id);
      if (match) {
        const score = match.score as {
          player1?: number[];
          player2?: number[];
        } | null;
        saved[entry.slot] =
          score?.player1
            ?.map((n, i) => `${n}–${score.player2?.[i] ?? "?"}`)
            .join(" ") || "Result recorded";
      } else if (outcome) saved[entry.slot] = resultLabelFromOutcome(outcome);
      else if (entry.forfeit)
        saved[entry.slot] = resultLabelFromOutcome({
          kind: "forfeit",
          side: entry.forfeit,
        });
    }
    const e = data.event;
    return {
      ok: true,
      context: {
        eventId,
        fingerprint: data.fingerprint,
        label: `${e.name} · ${e.starts_on}`,
        saved,
        format: {
          bestOf: e.format.best_of,
          adScoring: e.format.ad_scoring,
          doubles: e.format.doubles
            ? {
                gamesTo: e.format.doubles.games_to,
                adScoring: e.format.doubles.ad_scoring,
              }
            : null,
        },
        dual: {
          opponent: e.name,
          opponentProgramKey: null,
          date: e.starts_on,
          startsAtTime: e.starts_at_time,
          site: e.site,
          surface: e.surface,
          bestOf: e.format.best_of,
          adScoring: e.format.ad_scoring,
          doublesGamesTo: e.format.doubles?.games_to ?? 6,
          doublesAdScoring: e.format.doubles?.ad_scoring ?? false,
          lines: data.entries.map((l) => ({
            id: l.id,
            slot: l.slot,
            position: l.position,
            discipline: l.discipline,
            playerUserIds: l.player_user_ids,
            playerLabels: l.player_labels,
            opponentLabels: l.opponent_labels,
            noPlayer: l.forfeit === "ours",
            opponentNoPlayer: l.forfeit === "theirs",
          })),
        },
      },
    };
  } catch {
    return {
      ok: false,
      message: "We couldn’t load all saved results. Try again.",
    };
  }
}
