import {
  formatScoreboardStatus,
  scoreWinner,
  type MatchScore,
} from "@/lib/data/match-utils";

/**
 * Pure helpers for the public share page (`/m/[token]`). No server imports,
 * so the offline specs can load them directly.
 */

/**
 * The token in a share URL, decoded — or "" when the percent-encoding is
 * malformed (a link cut off mid-escape by a mail client). "" reads as an
 * unknown token everywhere, so the reader lands on "That link isn't valid"
 * rather than an error screen. `decodeURIComponent` throws `URIError` on bad
 * input; nothing on the public route may let that escape.
 */
export function readShareToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/**
 * Who the public page may say won: "player1", "player2", or null when the
 * match does not settle it.
 *
 * Read from the RAW score, never from `Match.score.winner` — the dashboard
 * transform defaults that to player2 when the score cannot say (no score,
 * level sets), which is harmless inside the app and a false "def." on a
 * public link. An unfinished match has no winner either, whatever the sets
 * show.
 */
export function sharedMatchWinner(
  score: MatchScore | null | undefined,
  matchContext: string | undefined,
): "player1" | "player2" | null {
  if (formatScoreboardStatus(matchContext) === "UNFINISHED") return null;
  return scoreWinner(score);
}

/** "A def. B" with the winner first, or "A vs B" when nobody won. */
export function sharedMatchPair(
  player1: string,
  player2: string,
  winner: "player1" | "player2" | null,
): string {
  if (winner === "player1") return `${player1} def. ${player2}`;
  if (winner === "player2") return `${player2} def. ${player1}`;
  return `${player1} vs ${player2}`;
}
