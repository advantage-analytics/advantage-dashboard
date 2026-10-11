/**
 * What a player can tag in an Ask question: one option per personal match, and
 * one per opponent those matches name.
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
 */

import type { AskSourceMatch } from "@/lib/services/ask/events";
import { buildScoreString, matchOutcome } from "@/lib/data/match-utils";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { DbPersonalMatch } from "@/lib/data/personal-matches-server";

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

export interface AskTagOptions {
  /** Newest first; undated matches last. */
  matches: AskMatchOption[];
  /** Most matches first; ties go to whoever was played most recently. */
  opponents: AskOpponentOption[];
}

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

export function buildAskTagOptions(
  matches: readonly DbPersonalMatch[],
  sideOf: (match: DbPersonalMatch) => AskMatchSide,
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

  for (const { match, time } of newestFirst) {
    const side = sideOf(match);
    const opponentName =
      opponentNameOf(match, side)?.trim().replace(/\s+/g, " ") || null;

    matchOptions.push({
      matchId: match.id,
      opponentName,
      playedOn: playedOn(time),
      // No side, no outcome: null, never a loss.
      iWon:
        side === null ? null : matchOutcome(match.score, side === "player1"),
      // An unoriented score reads player one first, as `ask.matches` does.
      scoreText: buildScoreString(match.score, side !== "player2") || null,
      tournamentName: match.tournament_name?.trim() || null,
    });

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
  };
}
