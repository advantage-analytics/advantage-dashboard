import { UNKNOWN_OPPONENT_NAME } from "@/lib/data/personal-opponents";
import type { MatchScore } from "@/lib/data/match-utils";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";

export type FormResult = "win" | "loss" | "pending";

/** What one form bar opens and what its readout says. */
export interface FormBarMatch {
  id: string;
  date: string | null;
  /** Oriented so `player1` is whoever the strip is about. */
  sets: ScoreLineSet[];
  event: string | null;
  /** The name the row does not already say: the teammate, or "vs" the opponent. */
  person: string | null;
}

/** One bar of a form strip: its result and the match behind it. */
export interface FormBar {
  result: FormResult;
  match: FormBarMatch;
}

/** A match's result as a bar: an unscored match is `"pending"`. */
function formResult(won: boolean | null): FormResult {
  return won === null ? "pending" : won ? "win" : "loss";
}

/** The fallbacks the loaders print for a match with no opponent's name. */
const NO_NAME = new Set(["Unknown", UNKNOWN_OPPONENT_NAME]);

/** The readout's line for the player on the other side, or null when unnamed. */
function formVersus(opponent: string | null | undefined): string | null {
  const name = opponent?.trim();
  return name && !NO_NAME.has(name) ? `vs ${name}` : null;
}

/** One match as a bar on a player's own strip, the score from their side. */
export function playerFormBar(match: {
  id: string;
  date: string | null;
  score: MatchScore | null;
  isPlayer1: boolean;
  won: boolean | null;
  event: string | null;
  opponent: string | null;
}): FormBar {
  return {
    result: formResult(match.won),
    match: {
      id: match.id,
      date: match.date,
      sets: scoreSetsFrom(match.score, { swap: !match.isPlayer1 }),
      event: match.event?.trim() || null,
      person: formVersus(match.opponent),
    },
  };
}
