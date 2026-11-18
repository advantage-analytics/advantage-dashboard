import type { Match } from "@/lib/data/types";
import type { Hand } from "./match-detail/match-filters/shot-geometry";

/** A player's dominant hand for the match filters, or `null` when unknown. */
export type PlayerHand = Hand | null;

/**
 * Normalise a raw hand string — `users.hand` / `matches.player_hand` /
 * `matches.opponent_hand`, none of which are validated at write time — to
 * `"right" | "left" | null`. Accepts every spelling those columns are known
 * to carry: `"right"`, `"Right"`, `"RIGHT HANDED"`, `"right-handed"`,
 * `"right handed"`, `"R"` (and the left-handed equivalents), case- and
 * whitespace-insensitive. Anything else — `"ambidextrous"`, empty, garbage
 * from schema drift — is `null` rather than guessed; see the player-style-
 * labels convention this mirrors (`formatPlayerStyle` in
 * `src/lib/data/match-utils.ts`).
 */
export function normalizePlayerHand(
  raw: string | null | undefined,
): PlayerHand {
  const v = raw?.trim().toLowerCase();
  if (!v) return null;
  if (v === "r" || v.startsWith("right")) return "right";
  if (v === "l" || v.startsWith("left")) return "left";
  return null;
}

/** The seat ids that decide whose the row's `player_*` columns are. */
export type HandSeatIds = {
  player1_id?: string | null;
  player2_id?: string | null;
};

/** The match row's entered hand columns, with the seat ids that place them. */
export type RowHandColumns = HandSeatIds & {
  player_hand?: string | null;
  opponent_hand?: string | null;
  player_backhand?: string | null;
  opponent_backhand?: string | null;
};

/**
 * Which seat a match row's `player_*` columns describe; `opponent_*` describe
 * the other one. THE one place that decides it (guardrails §4): the match
 * report (`transformDbMatchToMatch`), the season loader
 * (`player-season-server.ts`) and the label console (`enteredSeats` in
 * `labels-server.ts`) all read it from here, so they cannot disagree.
 *
 * Seat one, as the wizard writes them (`buildMatchData`), on every row but
 * one shape: a legacy row with NO `player1_id` and a `player2_id`. Those rows
 * seat the account holder second, and their `player_*` columns are the
 * account holder's — so seat two's. No current writer produces that shape:
 * the wizard always fills `player1_id` and fills `player2_id` only for a
 * teammate opponent, and the schedule and MCP writes never set `player2_id`.
 * The four live rows that have it were seeded for the verifier account
 * (`scripts/seed-ask-season.ts`, `meIsP1: false`), which writes `player_*`
 * for "me" in seat two. A writer that starts leaving seat one's id empty
 * beside a seat-two id must keep that meaning or narrow this guard.
 *
 * Never a viewer question: who is reading plays no part.
 */
export function playerColumnsSeat(
  row: HandSeatIds | null | undefined,
): "player1" | "player2" {
  return !row?.player1_id && !!row?.player2_id ? "player2" : "player1";
}

/** One seat's entered hand and backhand, raw and unvalidated. */
export interface SeatHandEntry {
  hand: string | null;
  backhand: string | null;
}

/**
 * The row's entered hands and backhands placed on their seats
 * (`playerColumnsSeat`). Raw column text — `normalizePlayerHand` it before
 * comparing; `null` where the column is null or was not read.
 */
export function rowHandsBySeat(row: RowHandColumns): {
  player1: SeatHandEntry;
  player2: SeatHandEntry;
} {
  const player: SeatHandEntry = {
    hand: row.player_hand ?? null,
    backhand: row.player_backhand ?? null,
  };
  const opponent: SeatHandEntry = {
    hand: row.opponent_hand ?? null,
    backhand: row.opponent_backhand ?? null,
  };
  return playerColumnsSeat(row) === "player2"
    ? { player1: opponent, player2: player }
    : { player1: player, player2: opponent };
}

/**
 * Both players' dominant hand, normalised to `"right" | "left" | null`, for
 * the match filters' `ctx.hands` (see T3's `MatchFilters` plan).
 *
 * `match.player1.hand` and `match.player2.hand` are ALREADY seat-correct by
 * the time the client holds a `Match`, and they are the same for every
 * viewer. `transformDbMatchToMatch` (`src/lib/data/match-detail-server.ts`)
 * reads the match row's columns by seat (`rowHandsBySeat` above) —
 * `player_hand` is seat one's, `opponent_hand` seat two's, as the wizard
 * writes them, the other way round on a legacy seat-two row — and falls back
 * to that seat's own profile when the column is null. Which seat the report is
 * turned to ("you") plays no part in it.
 *
 * So there is no `youIsPlayer1` parameter here, and none may be added:
 * swapping on it would move a correct hand onto the wrong player, the silent
 * mis-attribution `docs/ui-revamp-guardrails.md` warns about. The caller
 * already has `youIsPlayer1` in scope for the filters'
 * `{ youIsPlayer1, hands }` context.
 */
export function playerHands(match: Pick<Match, "player1" | "player2">): {
  player1: PlayerHand;
  player2: PlayerHand;
} {
  return {
    player1: normalizePlayerHand(match.player1.hand),
    player2: normalizePlayerHand(match.player2.hand),
  };
}
