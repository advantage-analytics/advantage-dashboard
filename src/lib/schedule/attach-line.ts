"use server";

/**
 * The Edit Match dialog's "Add to an event" — the picker's read and the attach.
 *
 * Both run as the signed-in user. The read is additionally gated on
 * `canManageTeamSchedule` so a player is never offered a line; the attach goes
 * through `attach_match_to_event_line`, which re-checks everything and is the
 * only path the database accepts for moving a match onto a line
 * (`supabase/migrations/20260913120000_attach_match_to_event_line.sql`).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import { getProgramSchedule } from "@/lib/data/schedule-server";
import { normalizeRound } from "@/lib/matches/round-options";
import { canonicalRosterIds, type RosterIdRow } from "@/lib/data/roster-ids";
import {
  attachLineGroups,
  type AttachLineGroups,
} from "@/lib/schedule/attach-line-state";

export type FindLinesResult =
  | ({ ok: true; matchDate: string } & AttachLineGroups)
  | { ok: false; error: string };

async function ownTeamMatch(matchId: string) {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") return null;
  if (!canManageTeamSchedule(workspace.active)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("matches")
    .select(
      "id, program_id, event_entry_id, date, round, player1_id, player1_name, format",
    )
    .eq("id", matchId)
    .eq("created_by", user.id)
    .maybeSingle();
  const match = data as {
    id: string;
    program_id: string | null;
    event_entry_id: string | null;
    date: string;
    round: string | null;
    player1_id: string | null;
    player1_name: string;
    format: { best_of?: number; ad_scoring?: boolean | null } | null;
  } | null;
  if (!match || match.program_id !== workspace.active.id) return null;
  return { supabase, match };
}

export async function findAttachableLines(input: {
  matchId: string;
  query?: string;
  /**
   * What the dialog holds but hasn't saved. Save writes the player, and for a
   * tournament the round and date, before attaching — so lines are judged
   * against these. They only shape the list shown: the PATCH validates the
   * player against the roster, and the attach function re-checks the line.
   */
  unsaved?: {
    player?: { id: string; name: string } | null;
    round?: string | null;
    /** YYYY-MM-DD. */
    date?: string | null;
  };
}): Promise<FindLinesResult> {
  const own = await ownTeamMatch(input.matchId);
  if (!own) {
    return { ok: false, error: "This match can't be added to an event." };
  }
  const { supabase, match } = own;
  if (match.event_entry_id) {
    return { ok: false, error: "This match is already on an event." };
  }

  const [schedule, roster] = await Promise.all([
    getProgramSchedule(match.program_id!),
    supabase.rpc("program_roster_full", { p_program_id: match.program_id }),
  ]);
  const unsaved = input.unsaved ?? {};
  const matchDate =
    unsaved.date && /^\d{4}-\d{2}-\d{2}$/.test(unsaved.date)
      ? unsaved.date
      : match.date.slice(0, 10);
  const picked = unsaved.player ?? null;
  const groups = attachLineGroups({
    events: schedule.events,
    entriesByEvent: schedule.entriesByEvent,
    canonical: canonicalRosterIds((roster.data ?? []) as RosterIdRow[]),
    query: input.query,
    match: {
      date: matchDate,
      round: unsaved.round !== undefined ? unsaved.round : match.round,
      player1Id: picked ? picked.id : match.player1_id,
      player1Name: picked ? picked.name : match.player1_name,
      bestOf: match.format?.best_of ?? 3,
      adScoring: match.format?.ad_scoring ?? null,
    },
  });
  return { ok: true, matchDate, ...groups };
}

export type AttachResult =
  | {
      ok: true;
      eventId: string;
      eventName: string;
      eventKind: "dual" | "tournament";
      slot: string | null;
      round: string | null;
    }
  | { ok: false; error: string };

/** The database's refusals are sentences already; these two are not. */
function sentenceFor(message: string): string {
  if (message.includes("Clear the saved outcome")) {
    return "That line already has a result saved in Schedule.";
  }
  if (message.includes("set when it is created")) {
    return "This match can't be added to that line.";
  }
  return message;
}

export async function attachMatchToLine(input: {
  matchId: string;
  entryId: string;
}): Promise<AttachResult> {
  const supabase = await createClient();
  // The function compares and stores the match's round verbatim, and the
  // wizard saves long labels ("Quarterfinal"). Write the short code first so a
  // tournament's taken-round check and its outcome readers see one spelling.
  // Own match only; a round in no known list passes through unchanged.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again to add this match." };
  const { data: current } = await supabase
    .from("matches")
    .select("round")
    .eq("id", input.matchId)
    .eq("created_by", user.id)
    .is("event_entry_id", null)
    .maybeSingle();
  const stored = (current as { round: string | null } | null)?.round ?? null;
  const code = normalizeRound(stored);
  if (stored !== null && code !== null && code !== stored) {
    const { error: roundError } = await supabase
      .from("matches")
      .update({ round: code })
      .eq("id", input.matchId)
      .eq("created_by", user.id)
      .is("event_entry_id", null);
    if (roundError)
      return { ok: false, error: sentenceFor(roundError.message) };
  }
  const { data, error } = await supabase.rpc("attach_match_to_event_line", {
    p_match_id: input.matchId,
    p_entry_id: input.entryId,
  });
  if (error) return { ok: false, error: sentenceFor(error.message) };

  const row = data as {
    event_id: string;
    event_name: string;
    event_kind: "dual" | "tournament";
    slot: string | null;
    round: string | null;
  };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/matches");
  revalidatePath(`/dashboard/matches/${input.matchId}`);
  revalidatePath("/dashboard/team/schedule");
  revalidatePath(`/dashboard/team/schedule/${row.event_id}`);

  return {
    ok: true,
    eventId: row.event_id,
    eventName: row.event_name,
    eventKind: row.event_kind,
    slot: row.slot,
    round: row.round,
  };
}
