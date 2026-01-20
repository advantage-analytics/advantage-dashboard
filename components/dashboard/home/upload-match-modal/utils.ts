/**
 * Utility functions for the Upload Match Modal
 */

import { FormData, WinnerLoserResult, MatchData } from "./types";

/**
 * Get the number of sets
 */
export function getNumberOfSets(bestOf: string): number {
  const num = parseInt(bestOf);
  return isNaN(num) ? 3 : num;
}

/**
 * Get player scores array adjusted to the correct number of sets
 */
export function getAdjustedScores(currentScores: (number | null)[], bestOf: string): (number | null)[] {
  const sets = getNumberOfSets(bestOf);
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

  // Convert null scores to 0 for database insertion
  const playerScoresNum = formData.playerScores.map(s => s ?? 0);
  const opponentScoresNum = formData.opponentScores.map(s => s ?? 0);

  return {
    id: matchId,
    // player1 is always playerName (Host Team), player2 is always opponentName (Guest Team)
    player1_id: playerWon ? winner.id : loser.id,
    player1_name: formData.playerName,
    player2_id: playerWon ? loser.id : winner.id,
    player2_name: formData.opponentName,
    tournament_name: formData.eventName,
    round: formData.round,
    format: {
      best_of: bestOf,
      ad_scoring: formData.adScoring,
      play_on_lets: formData.playOnLets
    },
    result: formData.result,
    date: formData.date,
    private: isPrivate,
    score: {
      player1: playerScoresNum,
      player2: opponentScoresNum,
      player1_tiebreaks: formData.playerTiebreaks,
      player2_tiebreaks: formData.opponentTiebreaks
    },
    // New metadata fields
    created_by: metadata.userId,
    source_provider: metadata.sourceProvider,
    analysis_method: metadata.analysisMethod,
    match_type: formData.matchType || metadata.matchType,
    court_type: formData.courtType || metadata.courtType,
    duration: formData.duration
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
  return `${kb.toFixed(0)} KB of ${kb.toFixed(0)} KB`;
}

/**
 * Format duration from milliseconds to H:MM format
 * Returns "-:--" if duration is 0 or undefined
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms || ms === 0) return "-:--";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Parse H:MM format string back to milliseconds
 * Returns 0 if format is invalid or "-:--"
 */
export function parseDuration(display: string): number {
  if (!display || display === "-:--") return 0;

  const match = display.match(/^(\d+):(\d{2})$/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (minutes > 59) return 0;
  return (hours * 3600 + minutes * 60) * 1000;
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
