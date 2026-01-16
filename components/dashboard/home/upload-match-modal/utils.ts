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
  return {
    id: matchId,
    player1_id: winner.id,
    player1_name: winner.name,
    player2_id: loser.id,
    player2_name: loser.name,
    tournament_name: formData.eventName,
    round: formData.round,
    format: {
      best_of: parseInt(formData.bestOf),
      ad_scoring: formData.adScoring,
      play_on_lets: formData.playOnLets
    },
    result: formData.result,
    date: formData.date,
    private: isPrivate,
    score: {
      player1: winner.scores,
      player2: loser.scores
    },
    // New metadata fields
    created_by: metadata.userId,
    source_provider: metadata.sourceProvider,
    analysis_method: metadata.analysisMethod,
    match_type: formData.matchType || metadata.matchType,
    court_type: formData.courtType || metadata.courtType
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
