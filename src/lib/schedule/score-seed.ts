/**
 * The score-only flow's form state, seeded from a line and folded back into a
 * `recordResult` call.
 *
 * Pure: no Supabase, no React, no `"use client"`. It exists so the one thing
 * that can silently corrupt a scored line — the tiebreak encoding — is stated
 * once and pinned by a spec (`tests/score-seed.spec.ts`) rather than being
 * re-derived inside a component.
 *
 * **Games in the set cells, points in the tiebreak cells.** A 7-6(5) set is
 * `ourGames: [7]`, `theirGames: [6]`, with the `5` in the LOSING side's
 * tiebreak cell. Sending the tiebreak points as the set score makes the set
 * unreadable and the winner wrong, and every consumer downstream — the vision
 * pipeline's set ordering (`job-request.ts`), `transformDbMatch`'s winner,
 * `matchWon` on the schedule — counts games. Guardrails §4.3.
 *
 * **Our games first, always.** `player1` is our side everywhere downstream,
 * so `playerScores` → `ourGames` is not a naming coincidence.
 */

import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";
import type { RecordResultInput } from "./actions";

/**
 * Everything the score-only form holds — the four score rows plus the
 * opponent's name, and nothing else.
 *
 * Deliberately not a `FormData`: this flow asks one question, and a form
 * shaped like the upload wizard's would invite the wizard's other twenty
 * fields to be half-filled here. The projection `ScoreBlock` wants is built
 * at the render site from these five values.
 */
export interface ScoreFormState {
  /** Free text, "/"-separated for a doubles line. */
  opponentName: string;
  /** Our GAME count per set. Never tiebreak points. */
  playerScores: (number | null)[];
  opponentScores: (number | null)[];
  /** Our tiebreak POINTS, on the sets that had one. */
  playerTiebreaks: (number | null)[];
  opponentTiebreaks: (number | null)[];
}

function nulls(count: number): (number | null)[] {
  return Array.from({ length: count }, () => null);
}

/**
 * The initial state for one line.
 *
 * A line that was already scored courtside comes back with its GAMES filled
 * and its tiebreak cells blank — `EventPreset.score` carries `player1` /
 * `player2` game counts and no tiebreaks at all, so inventing one here would
 * be a number nobody entered. The person re-typing the set will re-type the
 * breaker with it.
 *
 * A line with no score gets `bestOf`-length nulls, so the block opens at the
 * event's own format rather than a hard-coded three.
 */
export function seedScoreForm(preset: EventPreset): ScoreFormState {
  const score = preset.score;
  const size = Math.max(preset.bestOf, score?.player1.length ?? 0);

  return {
    opponentName: preset.opponentName,
    playerScores: score
      ? Array.from({ length: size }, (_, i) => score.player1[i] ?? null)
      : nulls(size),
    opponentScores: score
      ? Array.from({ length: size }, (_, i) => score.player2[i] ?? null)
      : nulls(size),
    playerTiebreaks: nulls(size),
    opponentTiebreaks: nulls(size),
  };
}

/**
 * The `recordResult` payload for one line's typed score.
 *
 * Only the sets that were played are sent, counted from whichever cells have
 * a digit in them — the same rule `ScoreEntry` applies, so a best-of-5 form
 * with three sets typed does not send two empty ones.
 *
 * `round` is `preset.round` for a tournament (where the entry is a whole run
 * and the round is what says WHICH match this is) and null for a dual, whose
 * slot is its round and which `recordResult` fills in from the entry itself.
 * Passing a dual's `S1` here would be the same string by a longer route today,
 * and a second place to disagree with the entry tomorrow.
 */
export function toRecordResultInput(
  preset: EventPreset,
  state: ScoreFormState
): RecordResultInput {
  const played = state.playerScores
    .map((_, index) => index)
    .filter(
      (index) =>
        state.playerScores[index] !== null ||
        state.opponentScores[index] !== null
    );

  return {
    // `entryId` is null only on a preset this route never builds — the page
    // resolves an entry before it renders. An empty string reaches
    // `recordResult`'s own "That line no longer exists." rather than being
    // silently dropped.
    entryId: preset.entryId ?? "",
    round: preset.eventKind === "tournament" ? preset.round : null,
    opponentLabels: state.opponentName
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean),
    ourGames: played.map((index) => state.playerScores[index] ?? 0),
    theirGames: played.map((index) => state.opponentScores[index] ?? 0),
    ourTiebreaks: played.map((index) => state.playerTiebreaks[index] ?? null),
    theirTiebreaks: played.map(
      (index) => state.opponentTiebreaks[index] ?? null
    ),
  };
}
