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
import { headToHeadRows } from "@/lib/data/opponents-server";
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
  forfeit?: "ours" | "theirs" | null;
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
      forfeit: line.forfeit ?? null,
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
      "id, event_id, program_id, slot, player_labels, player_user_ids, discipline, forfeit"
    )
    .eq("id", input.entryId)
    .single();

  if (entryError || !entry) return { error: "That line no longer exists." };
  if (entry.program_id !== auth.programId) {
    return { error: "That line belongs to another program." };
  }
  // A forfeited line must never mint a match. The forfeit is the outcome —
  // recording a score under it would be a second answer about a line that is
  // already decided, and the two would disagree everywhere one of them is
  // counted. Clear the forfeit first if the line was actually played.
  if (entry.forfeit) {
    return { error: "This line is forfeited. Clear the forfeit before adding a score." };
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
   *     or (program_id is not null and user_program_role(program_id) is not null)
   *
   * Leaving it null used to mean a player could not read their own recorded
   * match: under the older policy the program clause required staff, or a
   * player on a program with `roster_visible` set — a column that defaulted to
   * false — so every clause failed and the line rendered with a blank score on
   * the player's own schedule. `20260830120000_matches_visible_to_members`
   * widened the program clause to any member, which covers that case now. The
   * id still matters: it is what keeps the pair in Compare, which counts only
   * non-null ids, and it is the only clause that survives a player leaving the
   * program.
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

/**
 * One row the add-opponent popover can offer against a typed name.
 *
 * `name` is the pooled roster's exact spelling, and it is what a pick WRITES
 * into the line — the popover may match loosely to *suggest*, but resolving a
 * line means adopting this string verbatim, so the submit-time
 * `contribute_opponent_player` call converges on the same row instead of
 * minting a near-duplicate (`roster-match.ts` states the exact-write rule).
 */
export interface OpponentRosterCandidate {
  playerId: string;
  name: string;
  lineupSpot: number | null;
  /** This program's matches against them — `headToHeadRows`' count, so a
   *  match attributed to somebody else can never inflate it. Usually 0 or 1. */
  priorMeetings: number;
}

/**
 * The pooled roster behind the dual's current opponent, for the lineup
 * popover's saved-name dedupe.
 *
 * A read in a file headed "writing to the schedule", on purpose: it exists
 * solely so the popover can stop a coach from writing a second copy of a name
 * the pool already holds, it is gated by the same staff check as every write
 * here, and its one caller is the dual builder those writes serve. The heavy
 * lifting is `opponents-server.ts`'s — `pooled_roster` for the rows,
 * `headToHeadRows` for the meeting counts.
 *
 * `opponent_player_id` is selected for counting meetings and nothing else —
 * never a policy, never a join that widens access (20260823090000's rule).
 */
export async function opponentRosterForDual(
  opponentProgramKey: string
): Promise<{ candidates: OpponentRosterCandidate[] } | ActionError> {
  const auth = await requireStaff();
  if (isError(auth)) return auth;

  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("program_key", opponentProgramKey)
    .maybeSingle();

  const opponentProgramId = (program as { id: string } | null)?.id ?? null;
  // A key that resolves to nothing, or to ourselves, has no roster to offer.
  // Same non-answer as an opted-out pool: an empty list, never an error.
  if (!opponentProgramId || opponentProgramId === auth.programId) {
    return { candidates: [] };
  }

  const [{ data: rosterRows }, { data: matchRows }] = await Promise.all([
    supabase.rpc("pooled_roster", { p_program_id: opponentProgramId }),
    supabase
      .from("matches")
      .select("id, player2_name, opponent_player_id")
      .eq("program_id", auth.programId),
  ]);

  const matches = (matchRows ?? []) as {
    id: string;
    player2_name: string | null;
    opponent_player_id: string | null;
  }[];

  const candidates = (
    (rosterRows ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
      lineup_spot: number | null;
    }[]
  )
    .map((row) => {
      const name = `${row.first_name} ${row.last_name}`.trim();
      return {
        playerId: row.id,
        name,
        lineupSpot: row.lineup_spot,
        // A one-player roster, so identity-or-exact-name attribution — and its
        // refusal to let two blanks match — stays `headToHeadRows`' one rule.
        priorMeetings: headToHeadRows(matches, [{ id: row.id, name }]).length,
      };
    })
    // Lineup order, unranked last — the same sort the Opponents page uses, so
    // "#2" here is the same #2 a coach sees there.
    .sort((a, b) => {
      if (a.lineupSpot === b.lineupSpot) return a.name.localeCompare(b.name);
      if (a.lineupSpot === null) return 1;
      if (b.lineupSpot === null) return -1;
      return a.lineupSpot - b.lineupSpot;
    });

  return { candidates };
}

/**
 * The popover's "save as a different player" — `contribute_opponent_player`,
 * best-effort, with `createDual`'s refusal handling: every arm of the RPC can
 * legitimately refuse (most often "that program manages its own roster"), and
 * a refusal costs the pool an identity, never the coach their typed name.
 *
 * Returns whether a row actually exists on that roster afterwards, because the
 * caller shows "Saved to {school} roster" and must not claim a save that did
 * not happen. `{ saved: false }` is a total answer, not an error — the line
 * keeps its plain label either way.
 */
export async function saveOpponentPlayer(input: {
  opponentProgramKey: string;
  name: string;
}): Promise<{ saved: boolean }> {
  const auth = await requireStaff();
  if (isError(auth)) return { saved: false };

  // Both names or nothing — the RPC requires them, and a single-token name
  // ("Kim") is not an identity anyone else would converge on.
  const parts = input.name.trim().split(/\s+/);
  if (parts.length < 2) return { saved: false };

  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("program_key", input.opponentProgramKey)
    .maybeSingle();

  const opponentProgramId = (program as { id: string } | null)?.id ?? null;
  if (!opponentProgramId || opponentProgramId === auth.programId) {
    return { saved: false };
  }

  try {
    const { data: contributed, error } = await supabase.rpc(
      "contribute_opponent_player",
      {
        p_program_id: auth.programId,
        p_opponent_program_id: opponentProgramId,
        p_first_name: parts.slice(0, -1).join(" "),
        p_last_name: parts[parts.length - 1],
      }
    );
    return { saved: !error && Boolean(contributed) };
  } catch {
    // See createDual's contribute loop: an identity is an enrichment, never a
    // precondition, and never worth an error the coach has to read.
    return { saved: false };
  }
}

/**
 * Mark a line as forfeited, or clear a forfeit.
 *
 * `side` is `'ours'` or `'theirs'` — which side forfeited, determining who
 * gets the point. Getting the side wrong silently awards the point to the wrong
 * team. `null` clears the forfeit and returns the line to normal.
 *
 * A line that already has a match cannot be forfeited: a forfeit is the
 * alternative to a played match, not a second outcome on top of one. The
 * coach must delete the match first if they want to forfeit a played line.
 */
export async function setForfeit(
  entryId: string,
  side: "ours" | "theirs" | null
): Promise<{ ok: true } | ActionError> {
  const auth = await requireStaff();
  if (isError(auth)) return auth;

  const supabase = await createClient();

  const { data: entry, error: entryError } = await supabase
    .from("program_event_entries")
    .select("id, event_id, program_id")
    .eq("id", entryId)
    .single();

  if (entryError || !entry) return { error: "That line no longer exists." };
  if (entry.program_id !== auth.programId) {
    return { error: "That line belongs to another program." };
  }

  // Setting a forfeit on a line that already has a match is a contradiction:
  // the match says the line was played, the forfeit says it was not. Only
  // allow clearing (side === null) on a line with matches.
  if (side !== null) {
    const { data: existingMatches } = await supabase
      .from("matches")
      .select("id")
      .eq("event_entry_id", entryId)
      .limit(1);

    if (existingMatches && existingMatches.length > 0) {
      return {
        error: "This line already has a match recorded. Remove it before forfeiting.",
      };
    }
  }

  const { error: updateError } = await supabase
    .from("program_event_entries")
    .update({ forfeit: side, updated_at: new Date().toISOString() })
    .eq("id", entryId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/dashboard/team/schedule");
  revalidatePath(`/dashboard/team/schedule/${entry.event_id}`);
  return { ok: true };
}
