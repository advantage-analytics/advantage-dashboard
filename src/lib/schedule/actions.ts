"use server";

/**
 * Writing to the schedule.
 *
 * Every action re-resolves the workspace server-side and refuses a caller the
 * program's events policy does not allow. RLS is the real gate — these
 * policies exist on both new tables — but a policy failure arrives as a
 * zero-row write with no message, and a coach who has been demoted deserves a
 * sentence rather than a form that silently does nothing.
 */

import {
  createScheduleWriter,
  resolveOpponentProgramId,
  scheduleWriteError,
} from "./writes-server";
import type {
  ActionError,
  CreateDualInput,
  CreateTournamentInput,
  RecordResultInput,
  UpdateDualInput,
  UpdateTournamentInput,
} from "./write-types";
export type {
  ActionError,
  LineupLineInput,
  CreateDualInput,
  TournamentEntryInput,
  CreateTournamentInput,
  RecordResultInput,
  UpdateDualInput,
  UpdateTournamentInput,
} from "./write-types";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { headToHeadRows } from "@/lib/data/opponents-server";
import { getEventDetail } from "@/lib/data/schedule-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  canDeleteTeamScheduleEvent,
  canManageTeamSchedule,
  isProgramStaff,
  uploadPolicyLabel,
} from "@/lib/workspace/types";
import type { OutcomeKind, OutcomeSide } from "./types";

/**
 * The check every action opens with: the program's events policy, the same
 * ladder `can_manage_program_schedule` enforces in the database.
 */
async function requireScheduleManager(): Promise<
  { programId: string; userId: string } | ActionError
> {
  const context = await getWorkspaceContext();
  if (!context) return { error: "Not signed in." };
  if (!canManageTeamSchedule(context.active)) {
    return isProgramStaff(context.active)
      ? {
          error: `${context.active.name} limits schedule changes to ${uploadPolicyLabel(context.active.eventsPolicy).toLowerCase()}.`,
        }
      : { error: "Only a program's staff can change its schedule." };
  }
  return { programId: context.active.id, userId: context.viewer.id };
}

function isError(value: unknown): value is ActionError {
  return typeof value === "object" && value !== null && "error" in value;
}

/** Eligibility and audit are atomic in Postgres, including direct deletes. */
export async function deleteEvent(
  eventId: string,
): Promise<{ ok: true } | ActionError> {
  const context = await getWorkspaceContext();
  if (!context) return { error: "Not signed in." };
  if (!canDeleteTeamScheduleEvent(context.active)) {
    return {
      error:
        "Only an owner or coach allowed to manage the schedule can delete an event.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_schedule_event", {
    p_program_id: context.active.id,
    p_event_id: eventId,
  });
  if (error) return scheduleWriteError(error);
  revalidatePath("/dashboard/team/schedule");
  revalidatePath(`/dashboard/team/schedule/${eventId}`);
  return { ok: true };
}

export async function createDual(
  input: CreateDualInput,
): Promise<{ eventId: string } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;
  return createScheduleWriter(auth, {
    createClient,
    getEventDetail,
    revalidatePath,
  }).createDual(input);
}

export async function createTournament(
  input: CreateTournamentInput,
): Promise<{ eventId: string } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;
  return createScheduleWriter(auth, {
    createClient,
    getEventDetail,
    revalidatePath,
  }).createTournament(input);
}

export async function setOutcome(input: {
  entryId: string;
  round: string | null;
  outcome: { kind: OutcomeKind; side: OutcomeSide } | null;
}): Promise<{ ok: true } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;
  return createScheduleWriter(auth, {
    createClient,
    getEventDetail,
    revalidatePath,
  }).setOutcome(input);
}

export async function updateDual(
  input: UpdateDualInput,
): Promise<{ eventId: string } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;
  return createScheduleWriter(auth, {
    createClient,
    getEventDetail,
    revalidatePath,
  }).updateDual(input);
}

export async function updateTournament(
  input: UpdateTournamentInput,
): Promise<{ eventId: string } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;
  return createScheduleWriter(auth, {
    createClient,
    getEventDetail,
    revalidatePath,
  }).updateTournament(input);
}

export async function recordResult(
  input: RecordResultInput,
): Promise<{ matchId: string } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;
  return createScheduleWriter(auth, {
    createClient,
    getEventDetail,
    revalidatePath,
  }).recordResult(input);
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
  opponentProgramKey: string,
): Promise<{ candidates: OpponentRosterCandidate[] } | ActionError> {
  const auth = await requireScheduleManager();
  if (isError(auth)) return auth;

  const supabase = await createClient();

  const opponentProgramId = await resolveOpponentProgramId(
    supabase,
    opponentProgramKey,
    auth.programId,
  );
  // A key that resolves to nothing, or to ourselves, has no roster to offer.
  // Same non-answer as an opted-out pool: an empty list, never an error.
  if (!opponentProgramId) return { candidates: [] };

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
  const auth = await requireScheduleManager();
  if (isError(auth)) return { saved: false };

  // Both names or nothing — the RPC requires them, and a single-token name
  // ("Kim") is not an identity anyone else would converge on.
  const parts = input.name.trim().split(/\s+/);
  if (parts.length < 2) return { saved: false };

  const supabase = await createClient();

  const opponentProgramId = await resolveOpponentProgramId(
    supabase,
    input.opponentProgramKey,
    auth.programId,
  );
  if (!opponentProgramId) return { saved: false };

  try {
    const { data: contributed, error } = await supabase.rpc(
      "contribute_opponent_player",
      {
        p_program_id: auth.programId,
        p_opponent_program_id: opponentProgramId,
        p_first_name: parts.slice(0, -1).join(" "),
        p_last_name: parts[parts.length - 1],
      },
    );
    return { saved: !error && Boolean(contributed) };
  } catch {
    // See createDual's contribute loop: an identity is an enrichment, never a
    // precondition, and never worth an error the coach has to read.
    return { saved: false };
  }
}
