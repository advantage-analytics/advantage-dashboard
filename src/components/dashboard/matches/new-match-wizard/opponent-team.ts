/**
 * The opponent's team — the wizard's optional "their team" answer — as pure
 * rules: what the three form keys save as, and what a remembered opponent
 * puts into them. No JSX and no client, so a spec can import it.
 *
 * The keys are the FIELD's (`opponentTeamProgram`, `opponentTeamSchool`,
 * `opponentTeamSource`). The dual line's `opponentProgramKey` /
 * `opponentSchool` are a different pair and are never read or written here —
 * `types.ts` says which is which.
 */

import { toGenderedSquad } from "@/lib/data/squad";
import type { FormData, OpponentTeamProgram } from "./types";

/** The three form keys the field owns. */
export type OpponentTeamFields = Pick<
  FormData,
  "opponentTeamProgram" | "opponentTeamSchool" | "opponentTeamSource"
>;

/** The field with nothing in it. */
export const EMPTY_OPPONENT_TEAM = {
  opponentTeamProgram: undefined,
  opponentTeamSchool: undefined,
  opponentTeamSource: undefined,
} as const satisfies OpponentTeamFields;

/** True when the field holds neither a program nor a typed school. */
export function opponentTeamIsEmpty(form: OpponentTeamFields): boolean {
  return !form.opponentTeamProgram?.id && !form.opponentTeamSchool?.trim();
}

/** The two `matches` columns the field saves as. */
export interface OpponentTeamColumns {
  opponent_program_id: string | null;
  opponent_school: string | null;
}

/**
 * What a match row records about the opponent's team.
 *
 * A program wins over a typed school and nulls it: the columns are either/or
 * (`matches_opponent_program_or_school_check`), and a school typed before a
 * directory row was picked is the same answer said less precisely. With the
 * field empty, a match filed under a dual line takes that line's program
 * (`lineProgramId`, resolved by the caller); with no line either, both are
 * null — never an empty string.
 */
export function opponentTeamColumns(
  form: OpponentTeamFields,
  lineProgramId?: string | null,
): OpponentTeamColumns {
  const programId = form.opponentTeamProgram?.id || null;
  if (programId)
    return { opponent_program_id: programId, opponent_school: null };
  const school = form.opponentTeamSchool?.trim() || null;
  if (school) return { opponent_program_id: null, opponent_school: school };
  return { opponent_program_id: lineProgramId || null, opponent_school: null };
}

/**
 * The same answer as a patch for a match that ALREADY exists (the wizard's
 * reuse-`update` branch).
 *
 * - A team to write — the field's, or the dual line's program — is BOTH keys
 *   together, one value and the other null, so the either/or CHECK can never
 *   meet a leftover on the row.
 * - Nothing to write is NEITHER key: an empty object, not null/null. This
 *   pass did not set a team, so it must not clear one another path set (the
 *   edit dialog, the opponent drawer) — the same rule the update follows for
 *   `opponent_player_id`.
 *
 * An insert is different and uses `opponentTeamColumns` directly: on a new
 * row explicit nulls clear nothing.
 */
export function opponentTeamUpdate(
  form: OpponentTeamFields,
  lineProgramId?: string | null,
): OpponentTeamColumns | Record<string, never> {
  const columns = opponentTeamColumns(form, lineProgramId);
  return columns.opponent_program_id === null &&
    columns.opponent_school === null
    ? {}
    : columns;
}

/** What the most recent match against an opponent recorded about their team. */
export interface RememberedOpponentTeam {
  opponentProgram: OpponentTeamProgram | null;
  opponentSchool: string | null;
}

/**
 * The field after an opponent is named, given what history remembers of them
 * (`played` — the `opponentsPlayed` row for that name, or nothing).
 *
 * - A remembered team fills the field with source `"history"`, over whatever
 *   was there: the team belongs to the opponent, and the opponent just changed.
 * - Nothing remembered clears a team that itself came from history — it was
 *   the previous opponent's — and leaves a picked or typed one alone, since
 *   the uploader said it and can unsay it.
 *
 * Returns null for "leave the field as it is".
 */
export function opponentTeamFromHistory(
  current: OpponentTeamFields,
  played: RememberedOpponentTeam | null | undefined,
): OpponentTeamFields | null {
  if (played?.opponentProgram?.id) {
    return {
      opponentTeamProgram: played.opponentProgram,
      opponentTeamSchool: undefined,
      opponentTeamSource: "history",
    };
  }
  const school = played?.opponentSchool?.trim();
  if (school) {
    return {
      opponentTeamProgram: undefined,
      opponentTeamSchool: school,
      opponentTeamSource: "history",
    };
  }
  return current.opponentTeamSource === "history" ? EMPTY_OPPONENT_TEAM : null;
}

/**
 * Directory results a team can pick its opponent from.
 *
 * A college is two directory rows — men's and women's — and a search for the
 * school returns both, identical but for the squad. A men's or women's team
 * never plays the other squad, so that squad's rows are dropped; co-ed and
 * never-said programs stay, since teams do play across types. What is left
 * keeps the team's own squad first, a stable partition, so the search's own
 * order (prefix hits first) holds inside each half. A team with no single
 * squad (co-ed, or never said) — and a personal workspace — gets the list as
 * it came, and the field names each row's squad instead.
 */
export function opponentTeamsForSquad<T extends { team: string | null }>(
  rows: readonly T[],
  squad: string | null | undefined,
): T[] {
  const own = toGenderedSquad(squad);
  if (!own) return [...rows];
  const other = own === "mens" ? "womens" : "mens";
  const kept = rows.filter((row) => row.team !== other);
  return [
    ...kept.filter((row) => row.team === own),
    ...kept.filter((row) => row.team !== own),
  ];
}
