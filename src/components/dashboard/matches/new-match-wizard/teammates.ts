/**
 * Teammates as opponents — the Details step's opponent menu offers the
 * program's own roster, so a practice set against a teammate can name them.
 *
 * Pure rules only (no JSX, no client), so a spec can import them: who is
 * offered, where the section sits, what a pick writes into the form and how
 * "People you've played" steps aside for someone already listed here.
 *
 * Form state only. What reaches `matches` for a teammate is the save's
 * business (`buildMatchData` in `utils.ts`).
 */

import { isPracticeMatch } from "@/lib/matches/match-type";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { RosterPlayerOption } from "@/lib/data/roster-shared";

import { EMPTY_OPPONENT_TEAM } from "./opponent-team";
import type { FormData } from "./types";

/** The roster rows the menu offers, and the label above them. */
export interface TeammateSection<P extends RosterPlayerOption> {
  /** "Teammates · ZZ Test Program · M". */
  label: string;
  players: readonly P[];
}

/**
 * The program's roster minus the match's subject. `subjectId` is whatever id
 * the subject carries — a roster pick's `program_players.id`, or a preset's
 * player, which may be a login id — so both of a row's ids are compared.
 * With no subject known nobody is dropped.
 */
export function teammateOptions<P extends RosterPlayerOption>(
  roster: readonly P[] | null | undefined,
  subjectId: string | null | undefined,
): P[] {
  if (!roster) return [];
  if (!subjectId) return [...roster];
  return roster.filter(
    (row) => row.playerId !== subjectId && row.userId !== subjectId,
  );
}

/** The same filter the other sections use: the typed term, as a substring. */
export function teammatesMatching<P extends { name: string }>(
  teammates: readonly P[],
  needle: string,
): P[] {
  return needle
    ? teammates.filter((p) => normalizedPersonName(p.name).includes(needle))
    : [...teammates];
}

/**
 * "People you've played" without anyone the Teammates section lists — a
 * teammate met before is one person, offered once, as a teammate. Matched on
 * the pooled id where the past match recorded one, else on the name.
 */
export function playedWithoutTeammates<
  R extends { name: string; playerId: string | null },
>(played: readonly R[], teammates: readonly RosterPlayerOption[]): R[] {
  if (teammates.length === 0) return [...played];
  const ids = new Set(teammates.map((t) => t.playerId));
  const names = new Set(teammates.map((t) => normalizedPersonName(t.name)));
  return played.filter(
    (p) =>
      !(p.playerId && ids.has(p.playerId)) &&
      !names.has(normalizedPersonName(p.name)),
  );
}

/**
 * Practice puts Teammates first — who you practise against is usually a
 * teammate. Anything else lists them last: after "People you've played", and
 * in a dual after the opponent school's roster.
 */
export function teammatesFirst(
  matchType: string | null | undefined,
  inDual: boolean,
): boolean {
  return !inDual && isPracticeMatch(matchType);
}

/** True while the form's opponent is a teammate picked from the roster. */
export function opponentIsTeammate(
  form: Pick<FormData, "opponentSource">,
): boolean {
  return form.opponentSource === "teammate";
}

/**
 * What picking a teammate writes. Their `program_players` id — the one
 * `matches.opponent_player_id`'s FK points at, never the claimed login — and
 * their saved style from the roster row. Their team is this program, which
 * the "their team" field does not ask about, so its keys are cleared.
 */
export function teammatePick(
  row: RosterPlayerOption,
): Pick<
  FormData,
  | "opponentName"
  | "opponentSource"
  | "opponentPlayerId"
  | "opponentHand"
  | "opponentBackhand"
  | "opponentStyleSource"
  | "opponentTeamProgram"
  | "opponentTeamSchool"
  | "opponentTeamSource"
> {
  const hand = row.hand ?? undefined;
  const backhand = row.backhand ?? undefined;
  return {
    opponentName: row.name,
    opponentSource: "teammate",
    opponentPlayerId: row.playerId,
    opponentHand: hand,
    opponentBackhand: backhand,
    opponentStyleSource: hand || backhand ? "roster" : undefined,
    ...EMPTY_OPPONENT_TEAM,
  };
}
