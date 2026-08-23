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
  /**
   * `programs.program_key` when the coach picked the opponent out of the
   * directory, null when they typed a name. Not the uuid: `search_programs`
   * returns the key and nothing else, and widening a shipped SECURITY DEFINER
   * function's return shape to carry an id is the change 20260822090500 warns
   * lands two things broken at once. Resolved server-side instead.
   */
  opponentProgramKey: string | null;
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

  // The directory row behind the typed name, where there is one. `programs` is
  // world-readable and `program_key` is unique across all 1,940 rows, so this is
  // a lookup rather than a search. A key that resolves to nothing leaves the
  // dual pointing at free text, which is the same state every dual was in
  // before this column existed — degraded, never blocked.
  let opponentProgramId: string | null = null;
  if (input.opponentProgramKey) {
    const { data: program } = await supabase
      .from("programs")
      .select("id")
      .eq("program_key", input.opponentProgramKey)
      .maybeSingle();
    const id = (program as { id: string } | null)?.id ?? null;
    // A program does not play itself. The directory contains the caller's own
    // row, so the picker can offer it.
    opponentProgramId = id === auth.programId ? null : id;
  }

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
      opponent_program_id: opponentProgramId,
    }))
  );

  if (entryError) {
    // Roll the event back rather than leaving a dual with no lines, which reads
    // on the schedule as an event somebody forgot to finish.
    await supabase.from("program_events").delete().eq("id", event.id);
    return { error: entryError.message };
  }

  // Give the opposing names an identity, so the next program to play them finds
  // the same people rather than typing a second copy.
  //
  // Best-effort ON PURPOSE, after the entries are safely written. Every arm of
  // `contribute_opponent_player` can legitimately refuse — most often because
  // that program now manages its own roster, which is exactly when an outsider
  // must not write to it — and a refused contribution is not a reason to lose a
  // dual the coach just spent five minutes entering. The lineup is the record;
  // the identities are an enrichment on top of it.
  if (opponentProgramId) {
    await Promise.all(
      [...new Set(input.lines.flatMap((line) => line.opponentLabels))].map(
        async (label) => {
          const parts = label.trim().split(/\s+/);
          if (parts.length < 2) return;
          try {
            await supabase.rpc("contribute_opponent_player", {
              p_program_id: auth.programId,
              p_opponent_program_id: opponentProgramId,
              p_first_name: parts.slice(0, -1).join(" "),
              p_last_name: parts[parts.length - 1],
            });
          } catch {
            // See above: a refusal here costs an identity, never the fixture.
          }
        }
      )
    );
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
    .select(
      "id, event_id, program_id, slot, player_labels, player_user_ids, discipline"
    )
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

  const format = (event.format ?? {}) as {
    best_of?: number;
    ad_scoring?: boolean | null;
  };

  const round = input.round ?? (entry.slot as string | null);

  // Never mint a second match for the same line.
  //
  // A dual line has at most one match ever; a tournament entry has one per
  // ROUND. Both collapse to "one match per (entry, round)", so a repeat call —
  // a coach scoring courtside while the upload wizard holds a snapshot taken
  // before that score existed — updates the row instead of duplicating it.
  //
  // Without this the wizard silently created a twin: same line, same players,
  // a different score, and a team total counting the line twice. That is
  // exactly the duplicate 22e's "fills 3 of 9" receipt promises cannot happen.
  //
  // `limit(1)` on an array, NOT maybeSingle(): where a duplicate already exists
  // maybeSingle() errors, the error gets swallowed, and this would mint a
  // THIRD row — a de-duplicator that makes things worse the one time it
  // actually matters.
  const { data: existingRows } = await supabase
    .from("matches")
    .select("id")
    .eq("event_entry_id", entry.id)
    .eq("round", round ?? "")
    .limit(1);

  const existing = existingRows?.[0];

  const scorePayload = {
    player1: input.ourGames,
    player2: input.theirGames,
    player1_tiebreaks: input.ourTiebreaks,
    player2_tiebreaks: input.theirTiebreaks,
  };

  /**
   * WHOSE match this is, not just what it is called.
   *
   * `player1_name` is a label off the entry; `player1_id` is the account, and
   * it is half of the `matches` SELECT policy:
   *
   *   auth.uid() in (created_by, player1_id, player2_id)
   *     or is_program_staff(program_id)
   *     or (user_program_role(program_id) = 'player' and <program>.roster_visible)
   *
   * Leaving it null used to mean a player could not read their own recorded
   * match. `created_by` is the coach, staff they are not, and `roster_visible`
   * DEFAULTS TO FALSE — so every clause failed and the line rendered with a
   * blank score on the player's own schedule. It also kept the pair out of
   * Compare, which counts only non-null ids.
   *
   * Singles slots map one entry to one account. A doubles line has two
   * accounts and one column, so there is no non-arbitrary choice and null is
   * the honest answer — the same rule the upload wizard's preset follows.
   */
  const playerUserId =
    entry.discipline === "doubles"
      ? null
      : (((entry.player_user_ids as string[] | null) ?? [])[0] ?? null);

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from("matches")
      .update({
        player1_name: ourLabel,
        player2_name: theirLabel,
        player1_id: playerUserId,
        score: scorePayload,
      })
      .eq("id", existing.id as string)
      // `.select("id")` because this file's own header says a policy failure
      // arrives as a zero-row write with no message, and then this write did
      // not check. The matches UPDATE policy is `auth.uid() = created_by`,
      // but `canEdit` on the event page is `isProgramStaff`, so ANY staff
      // member reaches the score form. A coach correcting a score another
      // coach recorded got `updateError === null`, a revalidate, and a
      // returned matchId -- while the old score stayed on screen with nothing
      // to explain it.
      .select("id");

    if (updateError) return { error: updateError.message };

    if (!updated || updated.length === 0) {
      return {
        error:
          "That result was recorded by someone else on the staff, and only " +
          "they can change it. Ask them to correct it.",
      };
    }

    revalidatePath("/dashboard/team/schedule");
    revalidatePath(`/dashboard/team/schedule/${entry.event_id}`);
    return { matchId: existing.id as string };
  }

  const matchId = crypto.randomUUID();

  const { error: matchError } = await supabase.from("matches").insert({
    id: matchId,
    // player1 is always our side. Everything downstream — the set ordering sent
    // to the vision pipeline, transformDbMatch's winner, matchWon here — reads
    // it that way, and flipping it silently attributes the match to the
    // opponent with nothing on screen looking wrong.
    player1_name: ourLabel,
    player2_name: theirLabel,
    player1_id: playerUserId,
    program_id: auth.programId,
    event_entry_id: entry.id,
    tournament_name: event.name,
    round,
    // Midday, not bare midnight. `matches.date` is timestamptz, so a plain
    // "2026-08-20" lands at 00:00Z and renders as the 19th for every reader
    // west of Greenwich — which is all of them. Noon puts the whole Americas
    // safely inside the right day.
    date: `${event.starts_on}T12:00:00`,
    format: {
      best_of: format.best_of ?? 3,
      ad_scoring: format.ad_scoring ?? null,
      play_on_lets: false,
    },
    score: scorePayload,
    // The context string, not an outcome — who won is derived from the games.
    result: "Final Score",
    match_type: entry.discipline === "doubles" ? "Doubles" : "Singles",
    court_type: event.surface ?? undefined,
    // NULL, not "manual". `analysisFor()` reads a non-null source_provider as
    // an IMPORT and resolves it to `imported`, which is in READY — so a line
    // scored by hand would report as analysed, and the match page would skip
    // its short-circuit and render a page of zeroes (guardrails 3.3). Null is
    // what "nobody produced this, somebody typed it" actually means, and it is
    // the branch manualAnalysis() is waiting for.
    source_provider: null,
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
