/**
 * Utility functions for the Upload Match Modal
 */

import { FormData, WinnerLoserResult, MatchData } from "./types";

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
  userId: string,
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
      ? { id: userId, name: playerName, scores: playerScoresNum }
      : { id: null, name: opponentName, scores: opponentScoresNum },
    loser: playerWon
      ? { id: null, name: opponentName, scores: opponentScoresNum }
      : { id: userId, name: playerName, scores: playerScoresNum }
  };
}

/** Match metadata for database insertion */
export interface MatchMetadata {
  userId: string;
  sourceProvider: string;
  analysisMethod: string;
  matchType?: string;
  courtType?: string;
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
    tournament_name: formData.eventName || null,
    round: formData.round && formData.round !== "None" ? formData.round : null,
    format: {
      best_of: bestOf,
      ad_scoring: formData.adScoring,
      play_on_lets: formData.playOnLets
    },
    result: formData.result,
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
    match_type: (() => {
      const val = formData.matchType || metadata.matchType;
      return val && val !== "None" ? val : undefined;
    })(),
    court_type: (() => {
      const val = formData.courtType || metadata.courtType;
      return val && val !== "None" ? val : undefined;
    })(),
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
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
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
 * Parse a duration string back to milliseconds.
 * Accepts "2H 34M", "2h", "34m", legacy "2:34", or empty. Returns 0 if unparseable.
 */
export function parseDuration(display: string): number {
  if (!display) return 0;
  const trimmed = display.trim();
  if (!trimmed || trimmed === "-:--") return 0;

  // Legacy H:MM format
  const colonMatch = trimmed.match(/^(\d+):(\d{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (m > 59) return 0;
    return (h * 3600 + m * 60) * 1000;
  }

  // Letter format: "2H 34M", "2h", "34m"
  const hMatch = trimmed.match(/(\d+)\s*[hH]/);
  const mMatch = trimmed.match(/(\d+)\s*[mM]/);
  if (!hMatch && !mMatch) return 0;
  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  if (m > 59) return 0;
  return (h * 3600 + m * 60) * 1000;
}

/**
 * Validate a single set's score pair against standard tennis rules.
 * Allowed completed sets: 6–0..6–4, 7–5, 7–6, and the mirror images.
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
  // In-progress (e.g. 4–3, 5–5) — accept as incomplete, not invalid
  if (hi <= 6 && lo <= 6 && !(hi === 6 && lo === 5) && !(hi === 6 && lo === 6)) {
    if (hi < 6) return { kind: "incomplete" };
  }
  // 6–5, 6–6 are transitional but not final scores
  if ((hi === 6 && lo === 5) || (hi === 6 && lo === 6)) {
    return { kind: "incomplete" };
  }
  return { kind: "invalid", message: "Set must end 6–0..6–4, 7–5, or 7–6." };
}

/**
 * Derive the outcome string from completed sets, when the scores produce
 * a clean winner under best-of rules. Returns null if undecidable.
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
  for (let i = 0; i < playerScores.length; i++) {
    const v = validateSetScore(playerScores[i], opponentScores[i]);
    if (v.kind !== "ok") continue;
    if ((playerScores[i] ?? 0) > (opponentScores[i] ?? 0)) pSets++;
    else oSets++;
  }
  if (pSets >= setsToWin && pSets > oSets) return `${playerName} Wins`;
  if (oSets >= setsToWin && oSets > pSets) return `${opponentName} Wins`;
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

/**
 * Load uploaded file from localStorage
 */
export function loadUploadedFileFromStorage(): any | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.UPLOADED_FILE);
    return stored ? JSON.parse(stored) : null;
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
