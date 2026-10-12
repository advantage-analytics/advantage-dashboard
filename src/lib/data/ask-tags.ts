/**
 * What can be tagged in an Ask question: one option per match in scope, one
 * per opponent those matches name and — in a team scope — one per roster
 * player who has a match.
 *
 * Pure on purpose — rows in, options out, no Supabase, no `next/headers`, no
 * React `cache` — so `tests/ask-tags.spec.ts` pins the grouping offline and a
 * client component can import the types. `ask-server.ts` is the loader that
 * feeds it.
 *
 * ── Which side is the opponent ──────────────────────────────────────────────
 * Never assumed. The caller hands in `sideOf`, which in production is
 * `playerSide()` (`player-identity-server.ts`) closed over the viewer's ids —
 * the same rule `ask.my_side()` restates in SQL, so a tag and the row the
 * model's query reads agree about who the opponent was. It is an argument
 * rather than an import because that module pulls in the cookie client.
 *
 * A match whose side cannot be named (`null`) is still a match option — it is
 * a row of `ask.matches` and can be asked about — but it names no opponent, so
 * it contributes to no opponent option. That is `ask.matches.opponent_name`
 * being null for the same row.
 *
 * ── Which names are one opponent ────────────────────────────────────────────
 * `normalizedPersonName` (`person-name.ts`), the repo's one definition of
 * "the same name": case and whitespace are noise, everything else is signal.
 * No nicknames and no edit distance — "A. Lee" and "Anna Lee" stay two
 * opponents, because merging them would put a stranger's matches in an answer.
 *
 * ── A team scope ────────────────────────────────────────────────────────────
 * `buildTeamAskTagOptions()` is the same builder over a program's matches.
 * The side is `programSide()` (`program-side.ts`) over the roster's ids —
 * what `ask.my_side()` restates for a program scope — and each match also
 * says whose it is: the roster player in the program's seat, by the roster's
 * spelling, or the name stored on the match when the seat names nobody on
 * the roster (a doubles line, a coach's own login). That is
 * `ask.side_player_name()`, so a chip and the row the model reads agree.
 */

import type { AskSourceMatch } from "@/lib/services/ask/events";
import { buildScoreString, matchOutcome } from "@/lib/data/match-utils";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { DbPersonalMatch } from "@/lib/data/personal-matches-server";
import { programSide } from "@/lib/data/program-side";
import {
  canonicalRosterIds,
  rosterMatchIds,
  type RosterIdRow,
} from "@/lib/data/roster-ids";

export type AskMatchSide = "player1" | "player2" | null;

/**
 * One taggable match. `AskSourceMatch` is the shape an answer's sources
 * already use for a match, so a tag chip and a source row are drawn from the
 * same fields; the tournament is the one thing the menu adds.
 *
 * The tag sent to `POST /api/ask` is `{ kind: "match", id: matchId }`.
 */
export interface AskMatchOption extends AskSourceMatch {
  tournamentName: string | null;
  /**
   * Team scope only: the roster player this match is turned to, as
   * `AskPlayerOption.id`. Null (or absent) in a personal scope, and for a
   * team match whose seat names nobody on the roster. It is how a player tag
   * finds its matches; `playerName` is for display.
   */
  playerId?: string | null;
}

export type AskOpponentHand = "left" | "right";

/**
 * One taggable opponent. The tag sent to `POST /api/ask` is
 * `{ kind: "opponent", id }`.
 */
export interface AskOpponentOption {
  /** `askOpponentKey(name)` — stable across the spellings it groups. */
  id: string;
  /** As spelled on the most recent match against them. */
  name: string;
  matchCount: number;
  /** From the most recent match that recorded one; null when none did. */
  hand: AskOpponentHand | null;
}

/**
 * One taggable roster player — team scope only. The tag sent to
 * `POST /api/ask` is `{ kind: "player", id }`.
 */
export interface AskPlayerOption {
  /** The roster's canonical id for the player (`program_roster_full.player_id`). */
  id: string;
  /** The roster's spelling. */
  name: string;
  matchCount: number;
}

export interface AskTagOptions {
  /** Newest first; undated matches last. */
  matches: AskMatchOption[];
  /** Most matches first; ties go to whoever was played most recently. */
  opponents: AskOpponentOption[];
  /**
   * Roster players with at least one match, most matches first, ties by
   * name. Always empty in a personal scope.
   */
  players: AskPlayerOption[];
}

export const NO_ASK_TAG_OPTIONS: AskTagOptions = {
  matches: [],
  opponents: [],
  players: [],
};

/**
 * The key two spellings of one opponent share, or null for a name that names
 * nobody (null, empty, whitespace). Exported so whatever resolves an opponent
 * tag back to matches groups by the same rule that built the option.
 */
export function askOpponentKey(name: string | null | undefined): string | null {
  const key = normalizedPersonName(name);
  return key === "" ? null : key;
}

/** `matches.date` as a sortable instant; null for a missing or unreadable one. */
function playedAt(date: string | null | undefined): number | null {
  if (!date) return null;
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? null : time;
}

/** The UTC day, which is what `ask.matches.played_on` states. */
function playedOn(time: number | null): string | null {
  return time === null ? null : new Date(time).toISOString().slice(0, 10);
}

/** Unknown values are dropped, not echoed — the column is free text. */
function opponentHand(raw: string | null): AskOpponentHand | null {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value.startsWith("left")) return "left";
  if (value.startsWith("right")) return "right";
  return null;
}

function opponentNameOf(match: DbPersonalMatch, side: AskMatchSide) {
  if (side === "player1") return match.player2_name;
  if (side === "player2") return match.player1_name;
  return null;
}

/** Whose match a team row is: the roster player in the program's seat. */
interface AskMatchPlayer {
  /** `AskPlayerOption.id`, or null when the seat names nobody on the roster. */
  id: string | null;
  name: string | null;
}

/** One line, or null for a name that names nobody. */
function cleanName(name: string | null | undefined): string | null {
  return name?.trim().replace(/\s+/g, " ") || null;
}

export function buildAskTagOptions<M extends DbPersonalMatch>(
  matches: readonly M[],
  sideOf: (match: M) => AskMatchSide,
  /** Team scope only: who holds the program's seat. Absent in a personal scope. */
  playerOf?: (match: M, side: AskMatchSide) => AskMatchPlayer,
): AskTagOptions {
  // Sorted here rather than trusted from the query: every "most recent"
  // below depends on this order.
  const newestFirst = matches
    .map((match) => ({ match, time: playedAt(match.date) }))
    .sort((a, b) => {
      if (a.time === null) return b.time === null ? 0 : 1;
      if (b.time === null) return -1;
      return b.time - a.time;
    });

  const matchOptions: AskMatchOption[] = [];
  const opponents = new Map<string, AskOpponentOption>();
  const players = new Map<string, AskPlayerOption>();

  for (const { match, time } of newestFirst) {
    const side = sideOf(match);
    const opponentName = cleanName(opponentNameOf(match, side));
    const player = playerOf?.(match, side) ?? null;

    matchOptions.push({
      matchId: match.id,
      opponentName,
      // Null in a personal scope: the viewer is not named to themselves.
      playerName: player?.name ?? null,
      ...(playerOf ? { playerId: player?.id ?? null } : {}),
      playedOn: playedOn(time),
      // No side, no outcome: null, never a loss.
      iWon:
        side === null ? null : matchOutcome(match.score, side === "player1"),
      // An unoriented score reads player one first, as `ask.matches` does.
      scoreText: buildScoreString(match.score, side !== "player2") || null,
      tournamentName: match.tournament_name?.trim() || null,
    });

    if (player?.id && player.name) {
      const known = players.get(player.id);
      if (known) known.matchCount += 1;
      else {
        players.set(player.id, {
          id: player.id,
          name: player.name,
          matchCount: 1,
        });
      }
    }

    const key = askOpponentKey(opponentName);
    if (key === null || opponentName === null) continue;

    const hand = opponentHand(match.opponent_hand);
    const known = opponents.get(key);
    if (known) {
      known.matchCount += 1;
      known.hand ??= hand;
    } else {
      // First seen is most recent, so this spelling is the one that stands.
      opponents.set(key, { id: key, name: opponentName, matchCount: 1, hand });
    }
  }

  return {
    matches: matchOptions,
    // Stable sort over insertion order, which is most-recently-played first.
    opponents: [...opponents.values()].sort(
      (a, b) => b.matchCount - a.matchCount,
    ),
    players: [...players.values()].sort(
      (a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name),
    ),
  };
}

// ── Team scope ───────────────────────────────────────────────────────────────

/** A program match as the team builder reads it: the personal columns plus the schedule link. */
export interface DbAskTeamMatch extends DbPersonalMatch {
  event_entry_id: string | null;
}

/** The `program_roster_full` columns the team builder reads. */
export interface AskRosterRow extends RosterIdRow {
  display_name: string | null;
  role: string;
}

/**
 * The tag options for a program's matches.
 *
 * `roster` is `program_roster_full` for the same program. A match's player is
 * the roster row its seat's id folds onto (`canonicalRosterIds`, so a claimed
 * player's two id eras are one player) when that row is a player's; the
 * roster's `display_name` is their name. A seat holding a staff login or no
 * id at all — a doubles line, a coach uploading as themselves — keeps the
 * name stored on the match and belongs to no player option.
 *
 * A match whose side cannot be decided is still an option, as in a personal
 * scope: no opponent, no player, no outcome.
 */
export function buildTeamAskTagOptions(
  matches: readonly DbAskTeamMatch[],
  roster: readonly AskRosterRow[],
): AskTagOptions {
  const rosterIds = rosterMatchIds(roster);
  const canonical = canonicalRosterIds(roster);
  const playerNames = new Map<string, string>();
  for (const row of roster) {
    const name = cleanName(row.display_name);
    if (row.role === "player" && row.player_id && name) {
      playerNames.set(row.player_id, name);
    }
  }

  return buildAskTagOptions(
    matches,
    (match) => programSide(match, rosterIds),
    (match, side) => {
      if (side === null) return { id: null, name: null };
      const seatId = side === "player1" ? match.player1_id : match.player2_id;
      const stored = cleanName(
        side === "player1" ? match.player1_name : match.player2_name,
      );
      const playerId = seatId ? (canonical.get(seatId) ?? null) : null;
      const rosterName = playerId ? playerNames.get(playerId) : undefined;
      return rosterName
        ? { id: playerId, name: rosterName }
        : { id: null, name: stored };
    },
  );
}
