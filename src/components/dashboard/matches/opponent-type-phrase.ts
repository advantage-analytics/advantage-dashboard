import type { FilterOption } from "./matches-filter-panel";

/**
 * The opponent's hand and backhand as a filter: the two segmented rows the
 * filter panel offers, and the one sentence an applied pair reads as.
 *
 * Shared by the Matches list (its applied-filter strip) and the personal
 * Statistics page (its Opponent-type trigger), so "left" is "Left-handed
 * opponents" on both and neither can drift from the other. Pure — no React —
 * so an offline spec can read it.
 */

export const OPPONENT_HAND_OPTIONS: FilterOption[] = [
  { value: null, label: "Any" },
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
];

export const OPPONENT_BACKHAND_OPTIONS: FilterOption[] = [
  { value: null, label: "Any" },
  { value: "one-handed", label: "One-hand" },
  { value: "two-handed", label: "Two-hand" },
];

/**
 * Hand + backhand together get the curated scouting phrase; one alone gets
 * its half. `null` when neither is applied — the caller owns what "nothing"
 * reads as.
 */
export function opponentTypePhrase(
  hand: string | null | undefined,
  backhand: string | null | undefined,
): string | null {
  if (hand && backhand) {
    return `${hand === "left" ? "Left" : "Right"}-handed opponents with a ${backhand === "one-handed" ? "one" : "two"}-handed backhand`;
  }
  if (hand) return `${hand === "left" ? "Left" : "Right"}-handed opponents`;
  if (backhand) {
    return `Opponents with a ${backhand === "one-handed" ? "one" : "two"}-handed backhand`;
  }
  return null;
}
