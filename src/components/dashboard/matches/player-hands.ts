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

/**
 * Both players' dominant hand, normalised to `"right" | "left" | null`, for
 * the match filters' `ctx.hands` (see T3's `MatchFilters` plan).
 *
 * `match.player1.hand` and `match.player2.hand` are ALREADY seat-correct by
 * the time the client holds a `Match`, and they are the same for every
 * viewer. `transformDbMatchToMatch` (`src/lib/data/match-detail-server.ts`)
 * reads the match row's columns by seat — `player_hand` is seat one's,
 * `opponent_hand` seat two's, as the wizard writes them — and falls back to
 * that seat's own profile when the column is null. Which seat the report is
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
