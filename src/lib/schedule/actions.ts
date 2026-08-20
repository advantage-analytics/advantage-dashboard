"use server";

/**
 * Writing to the schedule.
 *
 * Every action re-resolves the workspace server-side and refuses a caller who
 * is not staff here. RLS is the real gate — these policies exist on both new
 * tables — but a policy failure arrives as a zero-row write with no message,
 * and a coach who has been demoted deserves a sentence rather than a form that
 * silently does nothing.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import type { Discipline, EventSite } from "./types";

export type ActionError = { error: string };

export interface LineupLineInput {
  discipline: Discipline;
  slot: string;
  position: number;
  playerUserIds: string[];
  playerLabels: string[];
  opponentLabels: string[];
}

export interface CreateDualInput {
  opponent: string;
  date: string;
  site: EventSite;
  surface: string;
  bestOf: number;
  adScoring: boolean | null;
  lines: LineupLineInput[];
}

export interface TournamentEntryInput {
  discipline: Discipline;
  position: number;
  draw: string | null;
  seed: number | null;
  playerUserIds: string[];
  playerLabels: string[];
}

export interface CreateTournamentInput {
  name: string;
  startsOn: string;
  endsOn: string;
  site: EventSite;
  surface: string;
  host: string | null;
  bestOf: number;
  /**
   * Ad or no-ad. Not optional even though a tournament has no single format in
   * theory: the vision pipeline refuses a job without it, and leaving it null
   * meant every tournament video failed submission after the coach had gone.
   */
  adScoring: boolean;
  entries: TournamentEntryInput[];
}

export interface RecordResultInput {
  entryId: string;
  /** 'R16' for a tournament. Null on a dual line, whose slot is its round. */
  round: string | null;
  opponentLabels: string[];
  opponentSchool?: string | null;
  /** Game counts, ours first. A 7-6 set is 7 here — never the tiebreak points. */
  ourGames: number[];
  theirGames: number[];
  ourTiebreaks: (number | null)[];
  theirTiebreaks: (number | null)[];
}

/** The staff check every action opens with. */
async function requireStaff(): Promise<
  { programId: string; userId: string } | ActionError
> {
  const context = await getWorkspaceContext();
  if (!context) return { error: "Not signed in." };
  if (!isProgramStaff(context.active)) {
    return { error: "Only a program's staff can change its schedule." };
  }
  return { programId: context.active.id, userId: context.viewer.id };
}

function isError(value: unknown): value is ActionError {
  return typeof value === "object" && value !== null && "error" in value;
}

export async function createDual(
  input: CreateDualInput
): Promise<{ eventId: string } | ActionError> {
  const auth = await requireStaff();
  if (isError(auth)) return auth;

  if (!input.opponent.trim()) return { error: "Name the opponent first." };
  if (input.lines.length === 0) return { error: "A dual needs at least one line." };

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("program_events")
    .insert({
      program_id: auth.programId,
      kind: "dual",
      name: input.opponent.trim(),
      // A dual is one day, so the span collapses. The check constraint would
      // reject ends_on < starts_on, and this is the only shape that satisfies
      // it without inventing a second date nobody entered.
      starts_on: input.date,
      ends_on: input.date,
      site: input.site,
      surface: input.surface || null,
      format: { best_of: input.bestOf, ad_scoring: input.adScoring },
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    return { error: eventError?.message ?? "Couldn't create the dual." };
  }

  const { error: entryError } = await supabase.from("program_event_entries").insert(
    input.lines.map((line) => ({
      event_id: event.id,
      program_id: auth.programId,
      discipline: line.discipline,
      slot: line.slot,
      position: line.position,
      player_user_ids: line.playerUserIds,
      player_labels: line.playerLabels,
      opponent_labels: line.opponentLabels,
    }))
  );

  if (entryError) {
    // Roll the event back rather than leaving a dual with no lines, which reads
    // on the schedule as an event somebody forgot to finish.
    await supabase.from("program_events").delete().eq("id", event.id);
    return { error: entryError.message };
  }

  revalidatePath("/dashboard/team/schedule");
  return { eventId: event.id as string };
}

export async function createTournament(
  input: CreateTournamentInput
): Promise<{ eventId: string } | ActionError> {
  const auth = await requireStaff();
  if (isError(auth)) return auth;

  if (!input.name.trim()) return { error: "Name the tournament first." };
  if (input.endsOn < input.startsOn) {
    return { error: "The tournament can't end before it starts." };
  }

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("program_events")
    .insert({
      program_id: auth.programId,
      kind: "tournament",
      name: input.name.trim(),
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      site: input.site,
      surface: input.surface || null,
      host: input.host || null,
      format: { best_of: input.bestOf, ad_scoring: input.adScoring },
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    return { error: eventError?.message ?? "Couldn't create the tournament." };
  }

  if (input.entries.length > 0) {
    const { error: entryError } = await supabase
      .from("program_event_entries")
      .insert(
        input.entries.map((entry) => ({
          event_id: event.id,
          program_id: auth.programId,
          discipline: entry.discipline,
          // No slot: a tournament entry has a draw, not a court.
          slot: null,
          position: entry.position,
          draw: entry.draw,
          seed: entry.seed,
          player_user_ids: entry.playerUserIds,
          player_labels: entry.playerLabels,
        }))
      );

    if (entryError) {
      await supabase.from("program_events").delete().eq("id", event.id);
      return { error: entryError.message };
    }
  }

  revalidatePath("/dashboard/team/schedule");
  return { eventId: event.id as string };
}

/**
 * Record how a line went — and, in doing so, mint its match.
 *
 * This is the only place a match is created from an event, and it is what makes
 * "an entry becomes a match the first moment anyone records how it went" true
 * rather than aspirational. For a tournament entry it is called once per round,
 * which is why the round arrives as a parameter instead of being read off the
 * entry: one entry, several matches, one per row of the run.
 */
export async function recordResult(
  input: RecordResultInput
): Promise<{ matchId: string } | ActionError> {
  const auth = await requireStaff();
  if (isError(auth)) return auth;

  if (input.ourGames.length === 0) return { error: "Enter at least one set." };

  const supabase = await createClient();

  const { data: entry, error: entryError } = await supabase
    .from("program_event_entries")
    .select("id, event_id, program_id, slot, player_labels, discipline")
    .eq("id", input.entryId)
    .single();

  if (entryError || !entry) return { error: "That line no longer exists." };
  if (entry.program_id !== auth.programId) {
    return { error: "That line belongs to another program." };
  }

  const { data: event } = await supabase
    .from("program_events")
    .select("name, starts_on, site, surface, format, kind")
    .eq("id", entry.event_id)
    .single();

  if (!event) return { error: "That event no longer exists." };

  const ourLabel = (entry.player_labels as string[] | null)?.join(" / ") ?? "";
  const theirLabel = input.opponentLabels.join(" / ");
  if (!ourLabel || !theirLabel) {
    return { error: "Both sides need a name before a result can be saved." };
  }

  const matchId = crypto.randomUUID();
  const format = (event.format ?? {}) as {
    best_of?: number;
    ad_scoring?: boolean | null;
  };

  const { error: matchError } = await supabase.from("matches").insert({
    id: matchId,
    // player1 is always our side. Everything downstream — the set ordering sent
    // to the vision pipeline, transformDbMatch's winner, matchWon here — reads
    // it that way, and flipping it silently attributes the match to the
    // opponent with nothing on screen looking wrong.
    player1_name: ourLabel,
    player2_name: theirLabel,
    program_id: auth.programId,
    event_entry_id: entry.id,
    tournament_name: event.name,
    round: input.round ?? (entry.slot as string | null),
    date: event.starts_on,
    format: {
      best_of: format.best_of ?? 3,
      ad_scoring: format.ad_scoring ?? null,
      play_on_lets: false,
    },
    score: {
      player1: input.ourGames,
      player2: input.theirGames,
      player1_tiebreaks: input.ourTiebreaks,
      player2_tiebreaks: input.theirTiebreaks,
    },
    // The context string, not an outcome — who won is derived from the games.
    result: "Final Score",
    match_type: entry.discipline === "doubles" ? "Doubles" : "Singles",
    court_type: event.surface ?? undefined,
    source_provider: "manual",
    analysis_method: "manual",
    created_by: auth.userId,
    private: false,
  });

  if (matchError) return { error: matchError.message };

  if (input.opponentSchool !== undefined || input.opponentLabels.length > 0) {
    await supabase
      .from("program_event_entries")
      .update({
        opponent_labels: input.opponentLabels,
        ...(input.opponentSchool !== undefined
          ? { opponent_school: input.opponentSchool }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
  }

  revalidatePath("/dashboard/team/schedule");
  revalidatePath(`/dashboard/team/schedule/${entry.event_id}`);
  return { matchId };
}
