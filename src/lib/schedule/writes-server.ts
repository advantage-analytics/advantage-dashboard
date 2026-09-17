/**
 * Internal schedule write service. Not a Server Action module.
 * Callers must authorize the actor/program before constructing this writer.
 * The member actions supply their session client, retaining RLS. A privileged
 * console caller needs its own durable, transactional write contract; this
 * extraction does not grant admins membership or permission to overwrite results.
 * Registered in client-bundle-boundary.spec.ts's SERVER_ONLY list.
 */
import type { createClient as sessionClient } from "@/lib/supabase/server";
import type { getEventDetail as eventDetail } from "@/lib/data/schedule-server";
import {
  lineupForfeitSide,
  planEntryChanges,
  type EntryPlan,
  type IncomingEntry,
} from "./entry-plan";
import { validateDualLineup, validateLineup } from "./lineup-validation";
import { DEFAULT_DOUBLES_GAMES_TO, type DoublesGamesTo } from "./format";
import { matchResultFor } from "./entry-state";
import type { OutcomeKind, OutcomeSide } from "./types";
import type {
  ActionError,
  LineupLineInput,
  CreateDualInput,
  TournamentEntryInput,
  CreateTournamentInput,
  RecordResultInput,
  UpdateDualInput,
  UpdateTournamentInput,
} from "./write-types";

export interface ScheduleWriteContext {
  programId: string;
  userId: string;
}
export interface ScheduleWriteDependencies {
  createClient: typeof sessionClient;
  getEventDetail: typeof eventDetail;
  revalidatePath: (path: string) => void;
}

/** Dependencies stay lazy: validation still precedes DB creation and writes. */
export function createScheduleWriter(
  auth: ScheduleWriteContext,
  deps: ScheduleWriteDependencies,
) {
  const { createClient, getEventDetail, revalidatePath } = deps;

  /** "HH:MM" as the `time` column takes it; anything else is no time. */
  function startTimeColumn(value: string | null): string | null {
    return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
  }

  /**
   * A dual's `program_events.format` jsonb. The singles keys stay top-level so
   * every reader that predates `doubles` keeps working unchanged.
   */
  function dualFormatColumn(input: {
    bestOf: number;
    adScoring: boolean | null;
    doublesGamesTo: DoublesGamesTo;
    doublesAdScoring: boolean;
  }) {
    return {
      best_of: input.bestOf,
      ad_scoring: input.adScoring,
      doubles: {
        games_to: input.doublesGamesTo,
        ad_scoring: input.doublesAdScoring,
      },
    };
  }

  async function createDual(
    input: CreateDualInput,
  ): Promise<{ eventId: string } | ActionError> {
    if (!input.opponent.trim()) return { error: "Name the opponent first." };

    // Identity errors first: they name the athlete problem, which is the more
    // specific thing to say about a line that is also incomplete.
    const lineupErrors = [
      ...validateLineup(input.lines),
      ...validateDualLineup(input.lines),
    ];
    if (lineupErrors.length > 0) return { error: lineupErrors[0].reason };

    const supabase = await createClient();

    // The directory row behind the typed name, where there is one. `programs` is
    // world-readable and `program_key` is unique across all 1,940 rows, so this is
    // a lookup rather than a search. A key that resolves to nothing leaves the
    // dual pointing at free text, which is the same state every dual was in
    // before this column existed — degraded, never blocked.
    const opponentProgramId = input.opponentProgramKey
      ? await resolveOpponentProgramId(
          supabase,
          input.opponentProgramKey,
          auth.programId,
        )
      : null;

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
        starts_at_time: startTimeColumn(input.startsAtTime),
        site: input.site,
        surface: input.surface || null,
        format: dualFormatColumn(input),
        created_by: auth.userId,
      })
      .select("id")
      .single();

    if (eventError || !event) {
      return { error: eventError?.message ?? "Couldn't create the dual." };
    }

    const { error: entryError } = await supabase
      .from("program_event_entries")
      .insert(
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
          // Legacy column, always empty on a new row. Outcomes live in
          // program_event_outcomes — a "No player" line's forfeit is written
          // just below, every other outcome by `setOutcome` from the score flow.
          forfeit: null,
        })),
      );

    if (entryError) {
      // Roll the event back rather than leaving a dual with no lines, which reads
      // on the schedule as an event somebody forgot to finish.
      await supabase.from("program_events").delete().eq("id", event.id);
      return { error: entryError.message };
    }

    const forfeitFailure = await recordLineupForfeits(
      supabase,
      { id: event.id, programId: auth.programId },
      input.lines.flatMap((line) => {
        const side = lineupSideOf(line);
        return side ? [{ slot: line.slot, side }] : [];
      }),
    );
    if (forfeitFailure) return forfeitFailure;

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
          },
        ),
      );
    }

    revalidatePath("/dashboard/team/schedule");
    return { eventId: event.id as string };
  }

  async function createTournament(
    input: CreateTournamentInput,
  ): Promise<{ eventId: string } | ActionError> {
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
      return {
        error: eventError?.message ?? "Couldn't create the tournament.",
      };
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
          })),
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
   * Columns for one entry row, given the submitted row. Kind-specific, because a
   * dual line has a slot and an opponent and a tournament entry has a draw and a
   * seed, and writing the union of both would put nulls into columns the other
   * kind means something by.
   */
  type EntryColumns = (row: IncomingEntry) => Record<string, unknown>;

  /**
   * Carry out a plan whose `refuse` list the caller has already found empty.
   *
   * Deletes first, then updates, then inserts: a lineup edit that swaps two slots
   * would otherwise collide with the unique-ish shape of the old rows while both
   * spellings exist. There is no transaction here — PostgREST gives one per
   * statement — so the ordering is what keeps a partial failure legible rather
   * than a rollback.
   */
  async function applyEntryPlan(
    supabase: Awaited<ReturnType<typeof createClient>>,
    plan: EntryPlan,
    event: { id: string; programId: string },
    columns: EntryColumns,
  ): Promise<ActionError | null> {
    if (plan.delete.length > 0) {
      const { error } = await supabase
        .from("program_event_entries")
        .delete()
        .in(
          "id",
          plan.delete.map((row) => row.id),
        )
        // Scoped again at the write, not just at the read that produced the plan.
        // The ids came from a read this action did itself, so this is belt and
        // braces — but it is the cheap kind, and it is what makes the statement
        // safe to read in isolation.
        .eq("program_id", event.programId);
      if (error) return { error: error.message };
    }

    for (const row of plan.update) {
      const { error } = await supabase
        .from("program_event_entries")
        .update({ ...columns(row.row), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("program_id", event.programId);
      if (error) return { error: error.message };
    }

    if (plan.insert.length > 0) {
      const { error } = await supabase.from("program_event_entries").insert(
        plan.insert.map((row) => ({
          event_id: event.id,
          program_id: event.programId,
          ...columns(row.row),
        })),
      );
      if (error) return { error: error.message };
    }

    return null;
  }

  function revalidateEvent(eventId: string): void {
    revalidatePath("/dashboard/team/schedule");
    revalidatePath(`/dashboard/team/schedule/${eventId}`);
  }

  /** Which side a submitted line's "No player" forfeits, if either. */
  function lineupSideOf(line: LineupLineInput): OutcomeSide | null {
    if (line.noPlayer) return "ours";
    if (line.opponentNoPlayer) return "theirs";
    return null;
  }

  /**
   * The forfeits "No player" lines record — `'ours'` gives the point to THEM,
   * `'theirs'` (the opponent has nobody) gives it to US.
   *
   * The one outcome the lineup writes. Everything else a line can end in is the
   * score flow's (`setOutcome`). Addressed by slot, because a line inserted in
   * this same save has no id the caller knows yet.
   */
  async function recordLineupForfeits(
    supabase: Awaited<ReturnType<typeof createClient>>,
    event: { id: string; programId: string },
    forfeits: { slot: string; side: OutcomeSide }[],
  ): Promise<ActionError | null> {
    if (forfeits.length === 0) return null;
    const slots = forfeits.map((forfeit) => forfeit.slot);
    const fail = (reason: string): ActionError => {
      revalidateEvent(event.id);
      return {
        error: `The lineup was saved, but a No player forfeit was not: ${reason} Open the dual and save the lineup again.`,
      };
    };
    const { data: entries, error } = await supabase
      .from("program_event_entries")
      .select("id, slot")
      .eq("event_id", event.id)
      .eq("program_id", event.programId)
      .in("slot", slots);
    if (error) return fail(error.message);
    for (const { slot, side } of forfeits) {
      const entry = (entries as { id: string; slot: string }[] | null)?.find(
        (row) => row.slot === slot,
      );
      if (!entry) return fail(`${slot} could not be found.`);
      const { error: outcomeError } = await supabase.rpc(
        "set_schedule_outcome",
        {
          p_program_id: event.programId,
          p_entry_id: entry.id,
          p_round: null,
          p_kind: "forfeit",
          p_side: side,
        },
      );
      if (outcomeError) return fail(scheduleWriteError(outcomeError).error);
    }
    return null;
  }

  /** A null outcome clears the saved result at this exact line/round. */
  async function setOutcome(input: {
    entryId: string;
    round: string | null;
    outcome: { kind: OutcomeKind; side: OutcomeSide } | null;
  }): Promise<{ ok: true } | ActionError> {
    const supabase = await createClient();
    const { data: eventId, error } = await supabase.rpc(
      "set_schedule_outcome",
      {
        p_program_id: auth.programId,
        p_entry_id: input.entryId,
        p_round: input.round,
        p_kind: input.outcome?.kind ?? null,
        p_side: input.outcome?.side ?? null,
      },
    );
    if (error) return scheduleWriteError(error);
    if (typeof eventId !== "string") {
      return {
        error: "The outcome was not saved. Refresh the event and try again.",
      };
    }
    revalidateEvent(eventId);
    return { ok: true };
  }

  async function updateDual(
    input: UpdateDualInput,
  ): Promise<{ eventId: string } | ActionError> {
    const lineupErrors = validateDualLineup(input.lines);
    if (lineupErrors.length > 0) return { error: lineupErrors[0].reason };

    // Scoped on BOTH ids, and never on the client's `eventId` alone:
    // `getEventDetail` reads `program_events` filtered by `program_id` as well,
    // so an event belonging to another program comes back null and is
    // indistinguishable from one that does not exist — which is the answer a
    // caller poking at ids deserves.
    const detail = await getEventDetail(auth.programId, input.eventId);
    if (!detail) return { error: "That event no longer exists." };
    if (detail.event.kind !== "dual")
      return { error: "That event isn't a dual." };

    // A "No player" line's forfeit — either side's — is the lineup's own, so
    // the lineup may take it back: planned as an unsettled line, with the
    // forfeit cleared below if the coach has since named someone (or moved the
    // No player to the other side). Every other outcome still locks.
    const savedSides = new Map(
      detail.entries.flatMap((entry) => {
        const side = lineupForfeitSide(entry);
        return side ? [[entry.id, side] as const] : [];
      }),
    );
    const plan = planEntryChanges(
      detail.entries.map((entry) =>
        savedSides.has(entry.id) ? { ...entry, outcomes: [] } : entry,
      ),
      input.lines,
    );
    if (plan.refuse.length > 0) return { error: plan.refuse[0].reason };

    const incomingById = new Map(
      input.lines.flatMap((line) =>
        line.id ? [[line.id, line] as const] : [],
      ),
    );
    // Saved lineup forfeits whose side changed — to nobody, the other side, or
    // a line that is going away.
    const clearIds = [...savedSides].flatMap(([id, side]) => {
      const incoming = incomingById.get(id);
      return incoming && lineupSideOf(incoming) === side ? [] : [id];
    });
    // Submitted No player lines that do not already carry that forfeit.
    const forfeits = input.lines.flatMap((line) => {
      const side = lineupSideOf(line);
      if (!side) return [];
      if (line.id && savedSides.get(line.id) === side) return [];
      return [{ slot: line.slot, side }];
    });

    const supabase = await createClient();

    // The opponent is not editable here, so a line added to an existing dual
    // inherits the school every other line already points at rather than
    // re-resolving a directory key this action does not take.
    const opponentProgramId = detail.entries[0]?.opponentProgramId ?? null;

    const { error: eventError } = await supabase
      .from("program_events")
      .update({
        // A dual is one day, so the span collapses — `createDual`'s rule, kept
        // here so an edited date cannot leave `ends_on` on the old day.
        starts_on: input.date,
        ends_on: input.date,
        starts_at_time: startTimeColumn(input.startsAtTime),
        site: input.site,
        surface: input.surface || null,
        format: dualFormatColumn(input),
        updated_at: new Date().toISOString(),
      })
      .eq("id", detail.event.id)
      .eq("program_id", auth.programId);

    if (eventError) return { error: eventError.message };

    // Cleared before the entry update: an outcome row is what makes a line
    // settled, and its RESTRICT foreign key blocks a delete.
    for (const entryId of clearIds) {
      const { error: clearError } = await supabase.rpc("set_schedule_outcome", {
        p_program_id: auth.programId,
        p_entry_id: entryId,
        p_round: null,
        p_kind: null,
        p_side: null,
      });
      if (clearError) return scheduleWriteError(clearError);
    }

    const failure = await applyEntryPlan(
      supabase,
      plan,
      { id: detail.event.id, programId: auth.programId },
      (row) => {
        const line = row as LineupLineInput;
        return {
          discipline: line.discipline,
          slot: line.slot,
          position: line.position,
          player_user_ids: line.playerUserIds,
          player_labels: line.playerLabels,
          opponent_labels: line.opponentLabels,
          opponent_program_id: opponentProgramId,
          forfeit: null,
        };
      },
    );
    if (failure) return failure;

    const forfeitFailure = await recordLineupForfeits(
      supabase,
      { id: detail.event.id, programId: auth.programId },
      forfeits,
    );
    if (forfeitFailure) return forfeitFailure;

    revalidateEvent(detail.event.id);
    return { eventId: detail.event.id };
  }

  async function updateTournament(
    input: UpdateTournamentInput,
  ): Promise<{ eventId: string } | ActionError> {
    if (!input.name.trim()) return { error: "Name the tournament first." };
    if (input.endsOn < input.startsOn) {
      return { error: "The tournament can't end before it starts." };
    }

    const detail = await getEventDetail(auth.programId, input.eventId);
    if (!detail) return { error: "That event no longer exists." };
    if (detail.event.kind !== "tournament") {
      return { error: "That event isn't a tournament." };
    }

    const plan = planEntryChanges(detail.entries, input.entries);
    if (plan.refuse.length > 0) return { error: plan.refuse[0].reason };

    const supabase = await createClient();

    const { error: eventError } = await supabase
      .from("program_events")
      .update({
        name: input.name.trim(),
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        site: input.site,
        surface: input.surface || null,
        host: input.host || null,
        format: { best_of: input.bestOf, ad_scoring: input.adScoring },
        updated_at: new Date().toISOString(),
      })
      .eq("id", detail.event.id)
      .eq("program_id", auth.programId);

    if (eventError) return { error: eventError.message };

    const failure = await applyEntryPlan(
      supabase,
      plan,
      { id: detail.event.id, programId: auth.programId },
      (row) => {
        const entry = row as TournamentEntryInput;
        return {
          discipline: entry.discipline,
          // No slot: a tournament entry has a draw, not a court.
          slot: null,
          position: entry.position,
          draw: entry.draw,
          seed: entry.seed,
          player_user_ids: entry.playerUserIds,
          player_labels: entry.playerLabels,
        };
      },
    );
    if (failure) return failure;

    revalidateEvent(detail.event.id);
    return { eventId: detail.event.id };
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
  async function recordResult(
    input: RecordResultInput,
  ): Promise<{ matchId: string } | ActionError> {
    if (input.ourGames.length === 0)
      return { error: "Enter at least one set." };

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from("program_event_entries")
      .select(
        "id, event_id, program_id, slot, player_labels, player_user_ids, discipline, forfeit",
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
      return {
        error:
          "This line is forfeited. Clear the forfeit before adding a score.",
      };
    }

    const { data: event } = await supabase
      .from("program_events")
      .select("name, starts_on, site, surface, format, kind")
      .eq("id", entry.event_id)
      .single();

    if (!event) return { error: "That event no longer exists." };

    const ourLabel =
      (entry.player_labels as string[] | null)?.join(" / ") ?? "";
    const theirLabel = input.opponentLabels.join(" / ");
    if (!ourLabel || !theirLabel) {
      return { error: "Both sides need a name before a result can be saved." };
    }

    const format = (event.format ?? {}) as {
      best_of?: number;
      ad_scoring?: boolean | null;
      doubles?: { games_to?: number; ad_scoring?: boolean | null } | null;
    };
    // A doubles line plays one set of the dual's doubles length — never the
    // singles best-of it used to inherit. An event saved before the field
    // existed plays the default.
    const doublesLine = entry.discipline === "doubles";
    const doublesGamesTo =
      format.doubles?.games_to === 8 ? 8 : DEFAULT_DOUBLES_GAMES_TO;

    // A forged round must not bypass the dual's single-result grain.
    const round =
      event.kind === "dual" ? (entry.slot as string | null) : input.round;
    if (event.kind === "tournament" && !round) {
      return { error: "Choose a tournament round before saving the score." };
    }
    let outcomeQuery = supabase
      .from("program_event_outcomes")
      .select("id")
      .eq("entry_id", entry.id);
    outcomeQuery =
      event.kind === "dual"
        ? outcomeQuery.is("round", null)
        : outcomeQuery.eq("round", round!);
    const { data: outcomes, error: outcomeError } = await outcomeQuery.limit(1);
    if (outcomeError)
      return {
        error: "Couldn't check this line's outcome. Refresh and try again.",
      };
    if (outcomes?.length) {
      return { error: "Clear the saved outcome before adding a score." };
    }

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

    const ending = input.ending ?? null;
    const scorePayload = {
      player1: input.ourGames,
      player2: input.theirGames,
      player1_tiebreaks: input.ourTiebreaks,
      player2_tiebreaks: input.theirTiebreaks,
      // The side that did NOT stop takes the match. player1 is always ours, so
      // our player retiring hands it to player2. Spelled `score.winner`, the key
      // SwingVision imports already write; a match played out carries none, and
      // an update drops a winner a correction no longer calls for.
      ...(ending
        ? { winner: ending.side === "ours" ? "player2" : "player1" }
        : {}),
    };
    const matchResult = matchResultFor(ending?.kind ?? null);

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

    /**
     * The opponent's name, back onto the entry the line is drawn from.
     *
     * The entry's copy is not what `line-row.tsx` prints when a match exists —
     * that prefers `match.opponentLabels` — but it IS what `dualSeed` seeds the
     * edit form from, and what a matchless row and `lineupChoices` fall back to.
     * So a correction that fixed a misspelling on the match left the editor
     * still offering the old spelling, ready to write it back on the next save.
     *
     * ── Only on a dual when correcting ──────────────────────────────────────
     * A tournament entry has ONE `opponent_labels` column and one `recordResult`
     * per round, so the column means "the last round filed" (stated at
     * `tournament-detail.tsx`'s `SchoolsFaced`). Syncing on a correction breaks
     * that: fix a typo in the R32 score after R16 is recorded, and the entry
     * reverts to naming R32's opponent — a round-old school on the rail, from an
     * edit that was only ever about a score. A dual line has exactly one round
     * (its court), so it has no later round to clobber.
     */
    const syncEntryOpponent = async () => {
      if (
        input.opponentSchool === undefined &&
        input.opponentLabels.length === 0
      ) {
        return;
      }
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
    };

    if (existing?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("matches")
        .update({
          player1_name: ourLabel,
          player2_name: theirLabel,
          player1_id: playerUserId,
          score: scorePayload,
          result: matchResult,
        })
        .eq("id", existing.id as string)
        // `.select("id")` because this file's own header says a policy failure
        // arrives as a zero-row write with no message, and then this write did
        // not check. The matches UPDATE policy is `auth.uid() = created_by`,
        // but `canEdit` on the event page is `canManageTeamSchedule`, so ANY such
        // member reaches the score form. A coach correcting a score another
        // coach recorded got `updateError === null`, a revalidate, and a
        // returned matchId -- while the old score stayed on screen with nothing
        // to explain it.
        .select("id");

      if (updateError) return scheduleWriteError(updateError);

      if (!updated || updated.length === 0) {
        return {
          error:
            "That result was recorded by someone else on the staff, and only " +
            "they can change it. Ask them to correct it.",
        };
      }

      // Duals only — see `syncEntryOpponent`. `input.round` is null exactly when
      // the line's round is its own court, which is what a dual line is.
      if (input.round === null) await syncEntryOpponent();

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
      format: doublesLine
        ? {
            best_of: 1,
            // The dual's doubles answer; an event that predates it keeps the
            // singles one it always used. Null stays null either way.
            ad_scoring: format.doubles
              ? (format.doubles.ad_scoring ?? null)
              : (format.ad_scoring ?? null),
            play_on_lets: false,
            games_to: doublesGamesTo,
          }
        : {
            best_of: format.best_of ?? 3,
            ad_scoring: format.ad_scoring ?? null,
            play_on_lets: false,
          },
      score: scorePayload,
      // The context string: "Final Score", or how a stopped match ended. Who won
      // is the games, or `score.winner` when it stopped.
      result: matchResult,
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

    if (matchError) return scheduleWriteError(matchError);

    await syncEntryOpponent();

    revalidatePath("/dashboard/team/schedule");
    revalidatePath(`/dashboard/team/schedule/${entry.event_id}`);
    return { matchId };
  }
  return {
    createDual,
    createTournament,
    setOutcome,
    updateDual,
    updateTournament,
    recordResult,
  };
}

export async function resolveOpponentProgramId(
  supabase: Awaited<ReturnType<typeof sessionClient>>,
  programKey: string,
  ourProgramId: string,
): Promise<string | null> {
  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("program_key", programKey)
    .maybeSingle();

  const id = (program as { id: string } | null)?.id ?? null;
  return id === ourProgramId ? null : id;
}

export function scheduleWriteError(error: {
  code?: string;
  message: string;
}): ActionError {
  return {
    error:
      error.code === "40001" || error.code === "40P01"
        ? "This line changed while you were saving. Refresh the event and try again."
        : error.message,
  };
}
