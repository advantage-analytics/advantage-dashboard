import { normalizePlayerHand } from "@/components/dashboard/matches/player-hands";

/**
 * An opponent's hand and backhand as the Opponents page words them.
 *
 * `matches.opponent_hand` / `opponent_backhand` are stored raw and unvalidated
 * ("right", "two-handed", and whatever older writers spelled). Both functions
 * return `null` for anything they do not recognise rather than echoing it —
 * the cell then draws the em dash, which is the honest reading of a value
 * nobody can vouch for.
 */

/** "Right-handed" / "Left-handed", or null when unknown. */
export function opponentHandLabel(
  raw: string | null | undefined,
): "Right-handed" | "Left-handed" | null {
  const hand = normalizePlayerHand(raw);
  if (hand === "right") return "Right-handed";
  if (hand === "left") return "Left-handed";
  return null;
}

/**
 * "One-handed" / "Two-handed", or null when unknown. The spellings are the
 * ones `formatPlayerStyle` (`lib/data/match-utils.ts`) accepts.
 */
export function opponentBackhandLabel(
  raw: string | null | undefined,
): "One-handed" | "Two-handed" | null {
  const value = raw?.trim().toLowerCase().replace(/\s+/g, "-");
  if (value === "one-handed" || value === "1-handed") return "One-handed";
  if (value === "two-handed" || value === "2-handed") return "Two-handed";
  return null;
}
