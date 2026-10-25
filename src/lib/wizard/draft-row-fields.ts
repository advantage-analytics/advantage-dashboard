import type { Step } from "@/components/dashboard/matches/new-match-wizard/types";
import type { ProviderKind } from "@/lib/services/upload";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The handful of answers a listed draft reads back — on its Matches row and
 * in its rail — and the pure rules that turn a `match_drafts` row into them.
 * Kept out of `actions.ts` because that module is `"use server"`: every
 * export there must be an action, and these are plain functions a browser
 * bundle and a spec both call.
 */
export interface DraftFields {
  /** The wizard step it stopped on. */
  step: Step;
  /** The source it was started from, or null before one was picked. */
  providerId: string | null;
  /** That source's kind; null for an id the registry does not hold. */
  providerKind: ProviderKind | null;
  opponentName: string | null;
  /** The match day entered so far (`YYYY-MM-DD`), or null. */
  matchDate: string | null;
  courtType: string | null;
  /** Games entered so far, one entry per complete set; empty until one is in. */
  score: ScoreLineSet[];
}

/**
 * The JSON paths the list selects for those fields — never the whole
 * payload, which carries every answer the wizard holds. The two columns the
 * step and the source live in (`step`, `provider`) are selected by name.
 */
export const DRAFT_FIELDS_SELECT =
  "opponent_name:payload->formData->>opponentName, match_date:payload->formData->>date, court_type:payload->formData->>courtType, player_scores:payload->formData->playerScores, opponent_scores:payload->formData->opponentScores";

/** What `DRAFT_FIELDS_SELECT` and the two named columns add to a row. */
export interface DraftFieldColumns {
  step: string | null;
  provider: string | null;
  opponent_name: string | null;
  match_date: string | null;
  court_type: string | null;
  player_scores: unknown;
  opponent_scores: unknown;
}

const STEPS: readonly Step[] = ["provider", "file", "trim", "match"];

export function isStep(value: unknown): value is Step {
  return (
    typeof value === "string" && (STEPS as readonly string[]).includes(value)
  );
}

/**
 * The row's fields, with the provider's kind answered by the caller (the
 * server resolves it; this module stays free of the upload registry so the
 * Matches bundle does not pull it in).
 */
export function draftFieldsFromColumns(
  row: DraftFieldColumns,
  providerKind: ProviderKind | null,
): DraftFields {
  return {
    // A row written before `step` existed, or by a hand that typed nonsense,
    // reads as the first step rather than failing the page.
    step: isStep(row.step) ? row.step : "provider",
    providerId: row.provider || null,
    providerKind,
    opponentName: row.opponent_name?.trim() || null,
    matchDate: row.match_date || null,
    courtType: row.court_type || null,
    score: draftScoreSets(row.player_scores, row.opponent_scores),
  };
}

/**
 * The sets typed so far, from the wizard's two game arrays: leading entries
 * where both sides hold a number and at least one game was played. The first
 * gap ends the score — a third set typed before the second is not a score.
 */
export function draftScoreSets(
  player: unknown,
  opponent: unknown,
): ScoreLineSet[] {
  if (!Array.isArray(player) || !Array.isArray(opponent)) return [];
  const sets: ScoreLineSet[] = [];
  for (let i = 0; i < Math.min(player.length, opponent.length); i++) {
    const p = player[i];
    const o = opponent[i];
    if (typeof p !== "number" || typeof o !== "number") break;
    if (p === 0 && o === 0) break;
    sets.push({ player1: p, player2: o });
  }
  return sets;
}

/**
 * One word per step, for the places that name a step outside the wizard —
 * the draft row's lifecycle cell and the rail's "Stopped at …". The wizard
 * itself never prints these: its header counts ("Step 3 of 4") and
 * `STEP_CONFIG` titles each step with a sentence. An import provider's file
 * step is its export.
 */
export function stepLabel(step: Step, kind: ProviderKind | null): string {
  if (step === "file" && kind === "import") return "Export";
  return STEP_LABEL[step];
}

const STEP_LABEL: Record<Step, string> = {
  provider: "Source",
  file: "File",
  trim: "Video check",
  match: "Details",
};

/** The name a draft gets before it has one. */
export const UNTITLED_DRAFT = "Untitled match";

/**
 * How a draft is named, the way the match rail names a match: "vs Opponent"
 * on a personal list, "Player vs Opponent" on a team one. Null until there
 * is a name to give — callers print `UNTITLED_DRAFT`, and the discard
 * confirm says "this draft" instead of naming it.
 */
export function draftTitle(
  draft: { playerName: string | null; opponentName: string | null },
  scope: "personal" | "team",
): string | null {
  const opponent = draft.opponentName?.trim() || null;
  const player = draft.playerName?.trim() || null;
  if (scope === "personal") return opponent ? `vs ${opponent}` : null;
  if (player && opponent) return `${player} vs ${opponent}`;
  return player ?? (opponent ? `vs ${opponent}` : null);
}
