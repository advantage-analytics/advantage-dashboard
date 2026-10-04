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
 * the time the client holds a `Match` — do not re-derive attribution from
 * `youIsPlayer1` here. `transformDbMatchToMatch`
 * (`src/lib/data/match-detail-server.ts` ~line 175) reads the match row's
 * `player_hand`/`opponent_hand` columns — `player_*` is the account holder
 * ("you", the uploader/creator), `opponent_*` the other side — and assigns
 * them onto `player1`/`player2` using that SAME request's `isUserPlayer1`:
 *
 * ```
 * p1Hand = isUserPlayer1 ? userHand : oppHand
 * p2Hand = isUserPlayer1 ? oppHand  : userHand
 * ```
 *
 * So when the account is player2 (`youIsPlayer1 === false`),
 * `match.player2.hand` already IS the account's hand. Swapping again on the
 * client using `youIsPlayer1` would flip an already-correct answer back onto
 * the wrong player — the exact silent mis-attribution
 * `docs/ui-revamp-guardrails.md` warns about. No `youIsPlayer1` parameter
 * here: it plays no part in this function's own mapping, and the caller
 * already has it in scope for the filters' `{ youIsPlayer1, hands }` context.
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
