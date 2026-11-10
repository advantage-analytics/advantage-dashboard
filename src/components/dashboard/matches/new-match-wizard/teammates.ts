/**
 * Teammates as opponents — the Details step's opponent menu offers the
 * program's own roster, so a practice set against a teammate can name them.
 *
 * Pure rules only (no JSX, no client), so a spec can import them: who is
 * offered, where the section sits, what a pick writes into the form and how
 * "People you've played" steps aside for someone already listed here.
 *
 * Form state, plus the one rule the save needs: `teammateSeat()`, which turns
 * the picked teammate back into the two ids `matches` takes — re-read from the
 * live roster, never trusted from the form. `buildMatchData` (`utils.ts`)
 * writes them.
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
 * The roster row's `program_players` id, or null when it has none.
 *
 * `program_roster_full` returns players from two arms (read off the live
 * function, 2026-11-10). The ordinary one emits `pp.id` as `player_id` and
 * `pp.claimed_by_user_id` as `user_id`: a profile id and a login id, which
 * are different id spaces and never equal. The "safety arm" — a player-role
 * member with no live profile row, "always empty after the backfill" — emits
 * the member's LOGIN id as both. So a row whose two ids are equal has no
 * profile, and its `playerId` must never reach a column whose foreign key
 * points at `program_players` (`matches.opponent_player_id`): that insert
 * fails, and the upload with it.
 */
export function rosterProfileId(
  row: Pick<RosterPlayerOption, "playerId" | "userId">,
): string | null {
  return row.userId !== null && row.userId === row.playerId
    ? null
    : row.playerId;
}

/** The two ids a teammate opponent puts on the match row. */
export interface TeammateSeat {
  /**
   * `matches.player2_id` — the id this teammate's own matches carry
   * (`program_roster_full.player_id`), so every seat reader finds them in
   * seat two exactly as it finds them in seat one of their own uploads.
   */
  seatId: string;
  /**
   * `matches.opponent_player_id` — their `program_players` id, or null for a
   * safety-arm row, which has none (`rosterProfileId`).
   */
  profileId: string | null;
}

/**
 * The teammate the form names, checked against the roster as it is NOW — or
 * null, and the match saves as it would for a typed name.
 *
 * Null unless all of: the opponent was picked from Teammates; the id that
 * travelled with the pick is still a row on this program's roster (a resumed
 * draft can outlive an archive, a merge, or a switch of workspace); and that
 * row is not the match's subject, under either of its ids — one person in
 * both seats would turn every seat reader's answer into whichever seat it
 * happens to test first.
 *
 * This is the only door into `player2_id`. That column is an arm of the
 * `matches` SELECT policy, so what goes through must be a member of the
 * program the match is filed under — someone the program arm of the same
 * policy already lets read it — and never an id the form merely remembers.
 */
export function teammateSeat(
  form: Pick<FormData, "opponentSource" | "opponentPlayerId">,
  roster: readonly RosterPlayerOption[] | null | undefined,
  subjectId: string | null | undefined,
): TeammateSeat | null {
  if (!opponentIsTeammate(form) || !form.opponentPlayerId || !roster) {
    return null;
  }
  const row = roster.find((r) => r.playerId === form.opponentPlayerId);
  if (!row) return null;
  if (subjectId && (row.playerId === subjectId || row.userId === subjectId)) {
    return null;
  }
  return { seatId: row.playerId, profileId: rosterProfileId(row) };
}

/**
 * What picking a teammate writes. The roster row's id — for every row but a
 * safety-arm one their `program_players` id, never the claimed login; the
 * save re-reads it through `teammateSeat()` before any column takes it — and
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
