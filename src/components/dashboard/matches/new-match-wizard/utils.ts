/**
 * Utility functions for the Upload Match wizard
 */

import { FormData, WinnerLoserResult, MatchData, UploadedFile } from "./types";

/**
 * Get the number of sets to display/edit.
 * Uses numberOfSets when set; otherwise defaults to bestOf (1, 3, or 5).
 */
export function getNumberOfSets(bestOf: string, numberOfSets?: number): number {
  const maxSets = parseInt(bestOf);
  const defaultSets = isNaN(maxSets) ? 3 : maxSets;
  const requested = numberOfSets ?? defaultSets;
  return Math.max(1, Math.min(5, requested));
}

/**
 * Get player scores array adjusted to the correct number of sets
 */
export function getAdjustedScores(
  currentScores: (number | null)[],
  bestOf: string,
  numberOfSets?: number
): (number | null)[] {
  const sets = getNumberOfSets(bestOf, numberOfSets);
  if (currentScores.length < sets) {
    return [...currentScores, ...Array(sets - currentScores.length).fill(null)];
  }
  return currentScores.slice(0, sets);
}

/**
 * Determine the winner and loser based on set scores
 */
export function determineWinner(
  playerScores: (number | null)[],
  opponentScores: (number | null)[],
  _bestOf: number, // Used for future validation of sets to win
  /**
   * The account behind `playerName` — NOT the signed-in uploader. Null when
   * the player has no account, which is an ordinary case in a team workspace
   * and must never be filled in with the uploader's id.
   */
  playerUserId: string | null,
  playerName: string,
  opponentName: string
): WinnerLoserResult {
  let playerSetsWon = 0;
  let opponentSetsWon = 0;

  // Convert null to 0 for comparison and result
  const playerScoresNum = playerScores.map(s => s ?? 0);
  const opponentScoresNum = opponentScores.map(s => s ?? 0);

  for (let i = 0; i < Math.min(playerScoresNum.length, opponentScoresNum.length); i++) {
    if (playerScoresNum[i] > opponentScoresNum[i]) {
      playerSetsWon++;
    } else if (opponentScoresNum[i] > playerScoresNum[i]) {
      opponentSetsWon++;
    }
  }

  const playerWon = playerSetsWon > opponentSetsWon;

  return {
    winner: playerWon
      ? { id: playerUserId, name: playerName, scores: playerScoresNum }
      : { id: null, name: opponentName, scores: opponentScoresNum },
    loser: playerWon
      ? { id: null, name: opponentName, scores: opponentScoresNum }
      : { id: playerUserId, name: playerName, scores: playerScoresNum }
  };
}

/** Match metadata for database insertion */
export interface MatchMetadata {
  userId: string;
  sourceProvider: string;
  analysisMethod: string;
  matchType?: string;
  courtType?: string;
  /**
   * The workspace this match belongs to. NULL is the personal workspace — see
   * migration `20260817074043`. `/api/splitstep/jobs` reads it back to decide
   * which allowance the analysis is billed against, so a team upload that
   * leaves it null quietly spends the uploader's own 2 hours instead of the
   * program's 75.
   */
  programId?: string | null;
  /**
   * The opposing player's pooled identity, when the uploader named their
   * program. Resolved before the row is written.
   *
   * Lands in `matches.opponent_player_id` and NOT in `player2_id`: that column
   * is one arm of the `matches` SELECT policy, so putting an opponent's id
   * there would hand them this match — and, through `visible_match_ids()`, both
   * players' `match_stats` — the day they claim the profile. Migration
   * 20260823090000 carries the long version.
   */
  opponentPlayerId?: string | null;
}

/**
 * Build match data object for database insertion
 */
export function buildMatchData(
  matchId: string,
  formData: FormData,
  winner: WinnerLoserResult["winner"],
  loser: WinnerLoserResult["loser"],
  isPrivate: boolean,
  metadata: MatchMetadata
): MatchData {
  // Validate bestOf - only 1, 3, or 5 are allowed
  const bestOfValue = parseInt(formData.bestOf);
  const validBestOf = [1, 3, 5];
  const bestOf = validBestOf.includes(bestOfValue) ? bestOfValue : 3;

  // Determine if the player (playerName) won
  const playerWon = formData.playerName === winner.name;

  // Use adjusted scores (respects numberOfSets when user reduced sets)
  const adjustedPlayerScores = getAdjustedScores(formData.playerScores, formData.bestOf, formData.numberOfSets);
  const adjustedOpponentScores = getAdjustedScores(formData.opponentScores, formData.bestOf, formData.numberOfSets);
  const adjustedPlayerTiebreaks = getAdjustedScores(formData.playerTiebreaks, formData.bestOf, formData.numberOfSets);
  const adjustedOpponentTiebreaks = getAdjustedScores(formData.opponentTiebreaks, formData.bestOf, formData.numberOfSets);

  const playerScoresNum = adjustedPlayerScores.map(s => s ?? 0);
  const opponentScoresNum = adjustedOpponentScores.map(s => s ?? 0);

  return {
    id: matchId,
    // player1 is always playerName (Host Team), player2 is always opponentName (Guest Team)
    player1_id: playerWon ? winner.id : loser.id,
    player1_name: formData.playerName,
    player2_id: playerWon ? loser.id : winner.id,
    player2_name: formData.opponentName,
    opponent_player_id: metadata.opponentPlayerId ?? null,
    program_id: metadata.programId ?? null,
    tournament_name: formData.eventName || null,
    round: formData.round || null,
    format: {
      best_of: bestOf,
      ad_scoring: formData.adScoring ?? null,
      play_on_lets: formData.playOnLets
    },
    result: formData.result,
    // Store the picked local date as the leading YYYY-MM-DD so it survives the
    // timestamptz round-trip (PostgREST returns timestamptz normalized to UTC, and the
    // heatmap buckets by date.slice(0,10)). getCurrentDate() already defaults this to
    // the user's LOCAL day, so the blue square lands on the day they actually played.
    date: formData.time
      ? `${formData.date}T${formData.time}:00`
      : formData.date,
    private: isPrivate,
    score: {
      player1: playerScoresNum,
      player2: opponentScoresNum,
      player1_tiebreaks: adjustedPlayerTiebreaks,
      player2_tiebreaks: adjustedOpponentTiebreaks
    },
    // New metadata fields
    created_by: metadata.userId,
    source_provider: metadata.sourceProvider,
    analysis_method: metadata.analysisMethod,
    match_type: formData.matchType || metadata.matchType || undefined,
    court_type: formData.courtType || metadata.courtType || undefined,
    duration: formData.duration,
    player_hand: formData.playerHand,
    player_backhand: formData.playerBackhand,
    opponent_hand: formData.opponentHand,
    opponent_backhand: formData.opponentBackhand
  };
}

/**
 * Convert base64 data URL to Blob for file upload
 */
export function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const base64Content = base64Data.split(",")[1];
  const byteCharacters = atob(base64Content);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Format a byte count for display, KB → MB → GB.
 *
 * Replaces an earlier KB-only version. That was written for ~2 MB xlsx exports
 * and rendered a 4 GB video as "4194304 KB".
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format a duration in SECONDS as a compact human string ("42s", "3m 12s",
 * "1h 30m").
 *
 * Note the sibling `formatDuration` below takes MILLISECONDS and returns a
 * different shape ("1H 30M"). Keep the names distinct — they are not
 * interchangeable.
 */
export function formatClipLength(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
}

/**
 * Format a transfer rate in BYTES PER SECOND ("820 KB/s", "12.4 MB/s").
 *
 * Sibling to formatFileSize on purpose: an upload panel shows both, and a size
 * reading in GB beside a rate reading in bytes/s is unreadable.
 */
export function formatTransferSpeed(bytesPerSecond: number): string {
  return bytesPerSecond < 1024 * 1024
    ? `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
    : `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Format a position in SECONDS as a clock ("2:05", "1:02:05").
 *
 * `tenths` adds a decimal place for frame-accurate trim handles, where a whole
 * second is too coarse to place a cut against a serve.
 */
export function formatClock(
  seconds: number | undefined,
  { tenths = false }: { tenths?: boolean } = {}
): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return tenths ? "0:00.0" : "—";
  }
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const base = `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
  return tenths ? `${base}.${Math.floor((seconds - whole) * 10)}` : base;
}

/**
 * Format duration from milliseconds to H:MM format
 * Returns "-:--" if duration is 0 or undefined
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms || ms === 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}M`;
  if (minutes === 0) return `${hours}H`;
  return `${hours}H ${minutes}M`;
}

/**
 * Who is ahead on sets.
 *
 * Lives here rather than in a component because BOTH the Match step's WON tag
 * and the Confirm step's readback have to answer it the same way — a rule
 * enforced by one function instead of by remembering to copy it.
 *
 * Deliberately looser than `deriveOutcome`: this reports who is ahead right
 * now, which is what a tag beside a name means, while that one refuses to name
 * a winner until the sets actually decide the match.
 */
export function leadingOnSets(
  playerScores: (number | null)[],
  opponentScores: (number | null)[]
): "player" | "opponent" | null {
  let p = 0;
  let o = 0;
  for (let i = 0; i < playerScores.length; i++) {
    const ps = playerScores[i] ?? 0;
    const os = opponentScores[i] ?? 0;
    if (ps > os) p++;
    else if (os > ps) o++;
  }
  if (p > o) return "player";
  if (o > p) return "opponent";
  return null;
}

/**
 * Play a one-shot ring pulse on an element.
 *
 * The `void offsetWidth` is a forced reflow, and it is load-bearing: without it
 * re-adding the class mid-animation does nothing, so a second pulse would be
 * silent. Shared because that subtlety survives exactly one copy-paste.
 */
export function pulseOnce(el: HTMLElement): void {
  el.classList.remove("animate-chord-pulse");
  void el.offsetWidth;
  el.classList.add("animate-chord-pulse");
  const onEnd = () => {
    el.classList.remove("animate-chord-pulse");
    el.removeEventListener("animationend", onEnd);
  };
  el.addEventListener("animationend", onEnd);
}

/**
 * A span of SECONDS as "1h 47m", "35m", "2h".
 *
 * The third member of this file's formatter family, and the one for spans a
 * person reasons about in hours: a monthly allowance and a match length. Note
 * the siblings above — `formatClipLength` keeps seconds because a trim handle
 * needs them, and `formatDuration` shouts in caps for the eyebrow rows that
 * carry match metadata elsewhere in the app. Same quantity, three audiences.
 */
export function formatHoursMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Validate a single set's score pair against standard tennis rules.
 * Allowed completed sets: 6-0..6-4, 7-5, 7-6, and the mirror images.
 * Returns null when the set is empty/incomplete (no error to show yet).
 */
export function validateSetScore(
  p: number | null,
  o: number | null
): { kind: "ok" | "incomplete" | "invalid"; message?: string } {
  if (p === null && o === null) return { kind: "incomplete" };
  if (p === null || o === null) return { kind: "incomplete" };
  if (p < 0 || o < 0 || p > 7 || o > 7) {
    return { kind: "invalid", message: "Games must be 0–7." };
  }
  const [hi, lo] = p >= o ? [p, o] : [o, p];
  // Valid completed combinations
  if (hi === 6 && lo <= 4) return { kind: "ok" };
  if (hi === 7 && (lo === 5 || lo === 6)) return { kind: "ok" };
  // In-progress (e.g. 4-3, 5-5) — accept as incomplete, not invalid
  if (hi <= 6 && lo <= 6 && !(hi === 6 && lo === 5) && !(hi === 6 && lo === 6)) {
    if (hi < 6) return { kind: "incomplete" };
  }
  // 6-5, 6-6 are transitional but not final scores
  if ((hi === 6 && lo === 5) || (hi === 6 && lo === 6)) {
    return { kind: "incomplete" };
  }
  return { kind: "invalid", message: "Set must end 6-0..6-4, 7-5, or 7-6." };
}

/**
 * Derive the outcome string from completed sets: a clean winner under best-of
 * rules, or "Unfinished" for a score that has stopped without deciding the
 * match — a retirement, a curfew, a practice set that ran out of court time.
 * Returns null while the score is still mid-entry and says nothing yet.
 *
 * "Unfinished" is the same literal the Result menu offers and the SwingVision
 * parser writes, so an entered score and an imported one land on one value.
 *
 * The three states, in order:
 *
 *  - decided — a side reached `setsToWin`. Unchanged, and checked first, so a
 *    complete score can never come back as Unfinished.
 *  - stopped — the entry is in a settled state (every set with anything in it
 *    is a legal finished set) and either every rendered set is filled, or the
 *    completed sets are LEVEL with at least two played. Level sets are the tell
 *    that no further set is coming: 6-4 4-6 in a best-of-3 is a match that
 *    stopped, not a match one set from being won.
 *  - undecidable — anything else, including a half-typed set and the ordinary
 *    lead a partial entry produces (6-4 with two empty boxes is someone typing,
 *    not a walkover).
 */
export function deriveOutcome(
  playerName: string,
  opponentName: string,
  playerScores: (number | null)[],
  opponentScores: (number | null)[],
  bestOf: number
): string | null {
  const setsToWin = Math.ceil(bestOf / 2);
  let pSets = 0;
  let oSets = 0;
  let completed = 0;
  /** A rendered set carrying data that is not (yet) a legal finished set. */
  let midEntry = false;
  let allRenderedFilled = true;
  for (let i = 0; i < playerScores.length; i++) {
    const p = playerScores[i];
    const o = opponentScores[i];
    if (validateSetScore(p, o).kind === "ok") {
      completed++;
      if ((p ?? 0) > (o ?? 0)) pSets++;
      else oSets++;
      continue;
    }
    allRenderedFilled = false;
    if (p !== null || o !== null) midEntry = true;
  }
  if (pSets >= setsToWin && pSets > oSets) return `${playerName} Wins`;
  if (oSets >= setsToWin && oSets > pSets) return `${opponentName} Wins`;
  if (midEntry || completed === 0) return null;
  if (allRenderedFilled || (completed >= 2 && pSets === oSets)) return "Unfinished";
  return null;
}

/**
 * True when a given set index has any user-entered data (score or tiebreak).
 * Used to warn before the sets stepper drops it.
 */
export function setHasData(formData: FormData, index: number): boolean {
  return (
    formData.playerScores[index] != null ||
    formData.opponentScores[index] != null ||
    formData.playerTiebreaks[index] != null ||
    formData.opponentTiebreaks[index] != null
  );
}

/**
 * Storage keys for localStorage persistence
 */
export const STORAGE_KEYS = {
  FORM_DATA: "uploadFormData",
  UPLOADED_FILE: "uploadedFile",
  SELECTED_PROVIDER: "selectedProvider"
} as const;

/**
 * Clear all upload-related data from localStorage
 */
export function clearStorageData(): void {
  localStorage.removeItem(STORAGE_KEYS.FORM_DATA);
  localStorage.removeItem(STORAGE_KEYS.UPLOADED_FILE);
  localStorage.removeItem(STORAGE_KEYS.SELECTED_PROVIDER);
}

/**
 * Load form data from localStorage
 */
export function loadFormDataFromStorage(): FormData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FORM_DATA);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.error("Error parsing form data:", e);
    return null;
  }
}

/** Persisted file metadata — the actual `File` can't survive localStorage. */
export type StoredUploadedFile = Pick<UploadedFile, "name" | "size" | "status" | "type">;

/**
 * Load uploaded file metadata from localStorage. Note: the underlying `File`
 * object is intentionally not restored — callers must prompt the user to
 * re-select the file when actually creating the match.
 */
export function loadUploadedFileFromStorage(): StoredUploadedFile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.UPLOADED_FILE);
    return stored ? (JSON.parse(stored) as StoredUploadedFile) : null;
  } catch (e) {
    console.error("Error parsing file data:", e);
    return null;
  }
}

/**
 * Save form data to localStorage
 */
export function saveFormDataToStorage(formData: FormData): void {
  localStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify(formData));
}
