import type { ScoreLineSet } from "@/lib/ui/score-format";

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
export function formResult(won: boolean | null): FormResult {
  return won === null ? "pending" : won ? "win" : "loss";
}

/** The readout's line for the player on the other side, or null when unnamed. */
export function formVersus(opponent: string | null | undefined): string | null {
  const name = opponent?.trim();
  return name ? `vs ${name}` : null;
}
