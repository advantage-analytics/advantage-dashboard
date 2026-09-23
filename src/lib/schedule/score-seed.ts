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
import type { EntryOutcome, MatchEnding, OutcomeSide } from "./types";

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
  /** Null for a match played out; "retired" or "defaulted" when it stopped. */
  ending: MatchEnding | null;
  /** Which side retired or defaulted. Null until the coach picks one. */
  stoppedBy: OutcomeSide | null;
}

/**
 * The key a saved outcome is filed under in the score flow.
 *
 * A dual line has one outcome (round null); a tournament entry can hold one
 * per round. Both the page that seeds the map and the form that reads it go
 * through here, so the two cannot disagree on the separator.
 */
export function outcomeKey(entryId: string, round: string | null): string {
  return round === null ? entryId : `${entryId}/${round}`;
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
export function seedScoreForm(
  preset: EventPreset,
  savedOutcome: Pick<EntryOutcome, "kind" | "side"> | null = null,
): ScoreFormState {
  const score = preset.score;
  // A stopped match names its winner; the side that stopped is the other one.
  const stoppedByWinner: OutcomeSide | null =
    score?.winner === "player1"
      ? "theirs"
      : score?.winner === "player2"
        ? "ours"
        : null;
  // A default with no score was saved as an outcome, not a match. A legacy
  // withdrawal reads as the retirement it was; a forfeit is the lineup's and
  // never reaches this form.
  const fromOutcome: Pick<ScoreFormState, "ending" | "stoppedBy"> | null =
    savedOutcome?.kind === "default"
      ? { ending: "defaulted", stoppedBy: savedOutcome.side }
      : savedOutcome?.kind === "withdrawal"
        ? { ending: "retired", stoppedBy: savedOutcome.side }
        : null;
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
    ending: fromOutcome?.ending ?? preset.ending ?? null,
    stoppedBy:
      fromOutcome?.stoppedBy ?? (preset.ending ? stoppedByWinner : null),
  };
}

/**
 * The `recordResult` payload for one line's typed score.
 *
 * Only the sets that were played are sent, counted from whichever cells have
 * a digit in them, so a best-of-5 form with three sets typed does not send two
 * empty ones.
 *
 * `round` is `preset.round` for a tournament (where the entry is a whole run
 * and the round is what says WHICH match this is) and null for a dual, whose
 * slot is its round and which `recordResult` fills in from the entry itself.
 * Passing a dual's `S1` here would be the same string by a longer route today,
 * and a second place to disagree with the entry tomorrow.
 */
export function toRecordResultInput(
  preset: EventPreset,
  state: ScoreFormState,
): RecordResultInput {
  const played = state.playerScores
    .map((_, index) => index)
    .filter(
      (index) =>
        state.playerScores[index] !== null ||
        state.opponentScores[index] !== null,
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
      (index) => state.opponentTiebreaks[index] ?? null,
    ),
    ending:
      state.ending && state.stoppedBy
        ? { kind: state.ending, side: state.stoppedBy }
        : null,
  };
}

/** Has any cell — a set or a tiebreak — got a digit in it? */
export function scoreTyped(state: ScoreFormState): boolean {
  return [
    ...state.playerScores,
    ...state.opponentScores,
    ...state.playerTiebreaks,
    ...state.opponentTiebreaks,
  ].some((value) => value !== null);
}

/**
 * What Save does with the form, decided in one place.
 *
 * - **Played out, or retired:** a score, so a match. A retirement stopped
 *   mid-play and always has one.
 * - **Defaulted:** a score when one was typed (a default mid-match), otherwise
 *   the no-score outcome a default before a ball is hit has always been. A
 *   line that already holds a match cannot drop to no score — the match
 *   stays, and the coach enters where it stopped.
 * - **A saved outcome being replaced by a score** clears it first: the
 *   database refuses a match on a line that holds an outcome.
 */
export type SavePlan =
  | { kind: "score"; input: RecordResultInput; clearOutcomeFirst: boolean }
  | { kind: "outcome"; side: OutcomeSide }
  | { kind: "error"; message: string };

export function planSave(
  preset: EventPreset,
  state: ScoreFormState,
  savedOutcome: Pick<EntryOutcome, "kind" | "side"> | null,
): SavePlan {
  const verb = state.ending === "retired" ? "retired" : "defaulted";
  if (state.ending && !state.stoppedBy) {
    return { kind: "error", message: `Choose who ${verb}.` };
  }

  if (state.ending === "defaulted" && !scoreTyped(state)) {
    if (preset.matchId) {
      return {
        kind: "error",
        message: "This line already has a score. Enter where it stopped.",
      };
    }
    return { kind: "outcome", side: state.stoppedBy! };
  }

  const input = toRecordResultInput(preset, state);
  if (input.ourGames.length === 0) {
    return {
      kind: "error",
      message:
        state.ending === "retired"
          ? "Enter the score when they retired."
          : "Enter at least one set.",
    };
  }
  if (input.opponentLabels.length === 0) {
    return { kind: "error", message: "Name the opponent." };
  }
  if (preset.discipline === "doubles" && input.opponentLabels.length !== 2) {
    return { kind: "error", message: "Choose both players in their pair." };
  }
  return {
    kind: "score",
    input,
    clearOutcomeFirst: savedOutcome !== null && savedOutcome.kind !== "forfeit",
  };
}

/** The team upload wizard, opened on one line — the page that presets it. */
const UPLOAD_PATH = "/dashboard/team/upload";

/**
 * Where "Upload it instead" goes, or null when the page must not offer it.
 *
 * For the coach who opened the score page with the file already in hand: the
 * upload wizard records the score at its last step, so the file and the score
 * go in together. Offered only where that is true and nothing is lost:
 *
 * - **A dual.** The upload page takes `?entry=` and, for a tournament run,
 *   falls back to the entry's FIRST match when no `?match=` names one — a
 *   round with no result yet has no match to name, so the video would land on
 *   another round.
 * - **No result on the line yet.** A scored line already has its "Add video"
 *   on the event page, and a line holding an outcome is out of the upload
 *   queue, which would bounce the link.
 * - **Nothing typed.** The typed digits do not travel to the wizard; hiding
 *   the offer once a digit is in keeps them from being silently dropped.
 * - **A viewer who may upload.** Scoring follows the events policy and
 *   uploading its own, so a coach may hold one and not the other.
 * - **A singles line.** Doubles is score-only: neither video analysis nor
 *   SwingVision statistics take it, so there is nothing to upload.
 */
export function uploadInsteadHref(
  preset: EventPreset,
  state: ScoreFormState,
  { canUpload, hasOutcome }: { canUpload: boolean; hasOutcome: boolean },
): string | null {
  if (!canUpload || hasOutcome) return null;
  if (preset.discipline === "doubles") return null;
  if (preset.eventKind !== "dual" || !preset.entryId || preset.matchId) {
    return null;
  }
  if (scoreTyped(state) || state.ending) return null;

  return `${UPLOAD_PATH}?${new URLSearchParams({ entry: preset.entryId })}`;
}

/** The line just saved, as the footer offers its video: "S1 saved · Add video". */
export interface SavedLineUpload {
  /** The slot on a dual, the round on a tournament. */
  label: string;
  href: string;
  action: "Add video";
}

/**
 * What the footer offers after a played score is saved, or null.
 *
 * The match id rides along for the same reason it does on the event page's
 * row: a tournament entry holds many matches, and the upload page attaches to
 * whichever one `?match=` names. A doubles line is score-only, so it offers
 * nothing.
 */
export function savedLineUpload(
  preset: EventPreset,
  matchId: string,
  canUpload: boolean,
): SavedLineUpload | null {
  if (!canUpload || !preset.entryId || !matchId) return null;
  if (preset.discipline === "doubles") return null;
  const query = new URLSearchParams({ entry: preset.entryId, match: matchId });
  return {
    label: preset.round ?? "Line",
    href: `${UPLOAD_PATH}?${query}`,
    action: "Add video",
  };
}
