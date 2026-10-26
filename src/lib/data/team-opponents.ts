import { normalizedPersonName } from "@/lib/data/person-name";
import {
  byDateDescending,
  groupPersonalOpponents,
  personalOpponentKey,
  type PersonalOpponent,
  type PersonalOpponentForm,
  type PersonalOpponentMatchInput,
  type PersonalOpponentMeasure,
  type PersonalOpponentRecentMatch,
} from "@/lib/data/personal-opponents";
import { canonicalRosterIds } from "@/lib/data/roster-ids";

/**
 * The team workspace's opponents: every match a program's players have
 * played, grouped by who was on the other side of the net, with who on the
 * roster faced them.
 *
 * Pure — no Supabase, no clock, no `cache()`. `team-opponents-server.ts` does
 * the reading; everything that turns those rows into a page lives here, where
 * a spec can call it.
 *
 * ── Composed, not re-implemented ────────────────────────────────────────────
 * There is one grouping algorithm and it is `groupPersonalOpponents`. A team
 * row is that function over the whole program's matches read from player
 * one's seat; a `facedBy` entry is the same function over one roster player's
 * subset. Records, form, the recent window and the four measures therefore
 * cannot disagree between the personal page, the team row and the chip that
 * narrows it. What this module adds is only what a team has and a person does
 * not: who played, the opponent's program, and which matches the viewer may
 * edit.
 *
 * Not to be confused with `opponents-server.ts` — the program directory and
 * pooled public-record loaders, live elsewhere and keyed by program.
 */

/** The opponent's program, as the table's Program cell and the drawer draw it. */
export interface TeamOpponentProgram {
  id: string;
  schoolName: string;
  /** `programs.school_abbrev`; null where the directory has none. */
  shortCode: string | null;
  /** Public URL of the crest, resolved by the loader; null for none. */
  crestUrl: string | null;
  conference: string | null;
  division: string | null;
}

/**
 * One team match, as the loader read it.
 *
 * The team's side is ALWAYS player one, so there is no `isUserPlayer1` to
 * pass: `player1_id` names the roster player and `player2_name` the opponent.
 */
export interface TeamOpponentMatchInput extends Omit<
  PersonalOpponentMatchInput,
  "isUserPlayer1"
> {
  /**
   * `matches.player1_id`, exactly as stored. It holds two id spaces (a
   * `program_players.id` or, on a claimed player's older rows, their login),
   * so it is folded through `canonicalRosterIds` here and never normalised
   * anywhere else.
   */
  player1_id: string | null;
  /** `matches.created_by` — who may edit the match from this page. */
  created_by: string | null;
  /** The directory program on the match; either/or with `opponent_school`. */
  opponent_program: TeamOpponentProgram | null;
  /** The school as somebody typed it, when the match names no program. */
  opponent_school: string | null;
  /**
   * `matches.opponent_unattached` — said on purpose: no school or club.
   * Optional so a reader that never selected it reads as "not said".
   */
  opponent_unattached?: boolean;
}

/** One person on the roster, as far as this page draws them. */
export interface TeamOpponentRosterPlayer {
  /** `program_roster_full.player_id` — the id their matches carry. */
  playerId: string;
  /** The login bound to the row, when there is one. */
  userId: string | null;
  name: string;
  photoUrl: string | null;
}

/** A recent meeting, plus which of ours played it. */
export interface TeamOpponentRecentMatch extends PersonalOpponentRecentMatch {
  /** The roster row's canonical `playerId`. */
  rosterPlayerId: string;
}

/** One roster player's own history against one opponent. */
export interface TeamOpponentFacedBy {
  playerId: string;
  name: string;
  firstName: string;
  photoUrl: string | null;
  wins: number;
  losses: number;
  played: number;
  analyzed: number;
  /** Their last five meetings, oldest first. */
  form: PersonalOpponentForm[];
  /** Their meetings, newest first, at most six. */
  recent: TeamOpponentRecentMatch[];
  /** The four drawer measures over their meetings alone. */
  measures: PersonalOpponentMeasure[];
}

export interface TeamOpponent extends Omit<PersonalOpponent, "recent"> {
  /**
   * The program on the most recent match that carries one — a directory
   * program outranks a typed school however old it is, because it is the only
   * one of the two anybody chose from a list. Null when no match has one.
   */
  program: TeamOpponentProgram | null;
  /**
   * The school as typed on the most recent match that has one, and only when
   * `program` is null. Null when nobody has said where they play.
   */
  school: string | null;
  /**
   * Somebody said they play for no school or club — only ever true when
   * `program` and `school` are both null, so a team said anywhere outranks it.
   */
  unattached: boolean;
  /** Newest first, at most six, across every roster player. */
  recent: TeamOpponentRecentMatch[];
  /** Every meeting's id, newest first. */
  matchIds: string[];
  /** The subset of `matchIds` the viewer created. */
  editableMatchIds: string[];
  /** One entry per roster player who met them: most matches first, then name. */
  facedBy: TeamOpponentFacedBy[];
}

/** The page's headline counts, over exactly the rows the table lists. */
export interface TeamOpponentTotals {
  opponents: number;
  /**
   * Distinct places the listed opponents play: directory programs by id, plus
   * typed schools by name for opponents with no program.
   */
  programs: number;
  matches: number;
  analyzed: number;
  /**
   * Matches whose `player1_id` resolves to nobody on the roster — in none of
   * the figures above, counted so the page can say they exist.
   */
  unattributed: number;
}

export interface TeamOpponentsGrouping {
  /** Sorted by last-match date, newest first. */
  opponents: TeamOpponent[];
  totals: TeamOpponentTotals;
}

/** What a roster row is called when it carries no name at all. */
const UNNAMED_PLAYER = "Unnamed player";

/** Newest first; undated last — the order `groupPersonalOpponents` uses. */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** A team match read from player one's seat, tagged with who that was. */
interface Attributed {
  input: PersonalOpponentMatchInput;
  source: TeamOpponentMatchInput;
  rosterPlayerId: string;
}

/**
 * Group a program's matches by opponent, most recently played first.
 *
 * `season` is the current academic season (`currentSeason(now)`), passed in so
 * this stays free of the clock. `viewerId` decides `editableMatchIds`; null
 * (the default) marks nothing editable.
 */
export function groupTeamOpponents(
  inputs: readonly TeamOpponentMatchInput[],
  roster: readonly TeamOpponentRosterPlayer[],
  season: string,
  viewerId: string | null = null,
): TeamOpponentsGrouping {
  const canonical = canonicalRosterIds(
    roster.map((player) => ({
      player_id: player.playerId,
      user_id: player.userId,
    })),
  );
  const rosterById = new Map<string, TeamOpponentRosterPlayer>();
  for (const player of roster) {
    if (!rosterById.has(player.playerId)) {
      rosterById.set(player.playerId, player);
    }
  }

  // ── Who played ────────────────────────────────────────────────────────────
  // The team's side is always player one (live check 2026-10-11: 19/19 team
  // matches have `player1_id` ∈ `program_players.id`, 0 in `users`), so the
  // roster player is `player1_id` folded through `canonicalRosterIds` — which
  // also catches a claimed player's older rows, recorded under their login. An
  // id that resolves to nobody on the roster is not guessed at: the match is
  // left out and counted.
  const attributed: Attributed[] = [];
  let unattributed = 0;
  for (const source of inputs) {
    const rosterPlayerId = source.player1_id
      ? canonical.get(source.player1_id)
      : undefined;
    if (!rosterPlayerId || !rosterById.has(rosterPlayerId)) {
      unattributed += 1;
      continue;
    }
    attributed.push({
      source,
      rosterPlayerId,
      input: {
        id: source.id,
        date: source.date,
        isUserPlayer1: true,
        player1_name: source.player1_name,
        player2_name: source.player2_name,
        opponent_player_id: source.opponent_player_id,
        opponent_hand: source.opponent_hand,
        opponent_backhand: source.opponent_backhand,
        tournament_name: source.tournament_name,
        score: source.score,
        values: source.values,
      },
    });
  }

  const byMatchId = new Map(attributed.map((a) => [a.input.id, a]));
  const withPlayer = (
    recent: readonly PersonalOpponentRecentMatch[],
  ): TeamOpponentRecentMatch[] =>
    recent.map((match) => ({
      ...match,
      rosterPlayerId: byMatchId.get(match.id)!.rosterPlayerId,
    }));

  // ── Who "the same opponent" is ────────────────────────────────────────────
  // The personal key rule, unchanged: `opponent_player_id` when the match has
  // one, else the normalised `player2_name`. Opponents are matched by typed
  // name until matches store `opponent_player_id` (null on every live row as
  // of 2026-10-11), so two spellings beyond whitespace and case are two rows.
  // Merging them is deliberately not built: a merge needs somewhere to record
  // the decision, and guessing one from similar names would fold two real
  // people into one record with nothing on screen to show it happened.
  const sourcesByKey = new Map<string, Attributed[]>();
  for (const entry of attributed) {
    const key = personalOpponentKey(entry.input);
    if (key === null) continue;
    const group = sourcesByKey.get(key);
    if (group) group.push(entry);
    else sourcesByKey.set(key, [entry]);
  }

  // One roster player's subset through the same grouping gives that player's
  // record, form, recent window and measures against each opponent.
  const byPlayer = new Map<string, PersonalOpponentMatchInput[]>();
  for (const entry of attributed) {
    const own = byPlayer.get(entry.rosterPlayerId);
    if (own) own.push(entry.input);
    else byPlayer.set(entry.rosterPlayerId, [entry.input]);
  }
  const facedByKey = new Map<string, TeamOpponentFacedBy[]>();
  for (const [playerId, own] of byPlayer) {
    const player = rosterById.get(playerId)!;
    const name = player.name.trim() || UNNAMED_PLAYER;
    for (const opponent of groupPersonalOpponents(own, season)) {
      const entry: TeamOpponentFacedBy = {
        playerId,
        name,
        firstName: firstNameOf(name),
        photoUrl: player.photoUrl,
        wins: opponent.wins,
        losses: opponent.losses,
        played: opponent.played,
        analyzed: opponent.analyzed,
        form: opponent.form,
        recent: withPlayer(opponent.recent),
        measures: opponent.measures,
      };
      const list = facedByKey.get(opponent.key);
      if (list) list.push(entry);
      else facedByKey.set(opponent.key, [entry]);
    }
  }

  // The whole set through it gives the team rows, already sorted by last
  // match.
  const opponents = groupPersonalOpponents(
    attributed.map((a) => a.input),
    season,
  ).map((opponent): TeamOpponent => {
    const sources = [...(sourcesByKey.get(opponent.key) ?? [])]
      .sort((a, b) => byDateDescending(a.input.date, b.input.date))
      .map((a) => a.source);
    const program =
      sources.find((s) => s.opponent_program)?.opponent_program ?? null;
    const school = program
      ? null
      : (sources
          .map((s) => (s.opponent_school ?? "").trim().replace(/\s+/g, " "))
          .find((typed) => typed !== "") ?? null);

    return {
      ...opponent,
      program,
      school,
      unattached:
        !program && !school && sources.some((s) => s.opponent_unattached),
      recent: withPlayer(opponent.recent),
      matchIds: sources.map((s) => s.id),
      editableMatchIds:
        viewerId === null
          ? []
          : sources.filter((s) => s.created_by === viewerId).map((s) => s.id),
      facedBy: (facedByKey.get(opponent.key) ?? []).sort(
        (a, b) => b.played - a.played || a.name.localeCompare(b.name),
      ),
    };
  });

  return { opponents, totals: teamOpponentTotals(opponents, unattributed) };
}

/** The page totals, over exactly the rows the table lists. */
export function teamOpponentTotals(
  opponents: readonly TeamOpponent[],
  unattributed = 0,
): TeamOpponentTotals {
  const programs = new Set<string>();
  let matches = 0;
  let analyzed = 0;
  for (const opponent of opponents) {
    matches += opponent.played;
    analyzed += opponent.analyzed;
    if (opponent.program) programs.add(`id:${opponent.program.id}`);
    else if (opponent.school) {
      programs.add(`name:${normalizedPersonName(opponent.school)}`);
    }
  }
  return {
    opponents: opponents.length,
    programs: programs.size,
    matches,
    analyzed,
    unattributed,
  };
}
