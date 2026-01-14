/**
 * Utility functions for the Upload Match Modal
 */

import { FormData, WinnerLoserResult, MatchData } from "./types";

/**
 * Get the number of sets based on the "best of" format
 */
export function getNumberOfSets(bestOf: string): number {
  return bestOf === "5" ? 5 : 3;
}

/**
 * Get player scores array adjusted to the correct number of sets
 */
export function getAdjustedScores(currentScores: number[], bestOf: string): number[] {
  const sets = getNumberOfSets(bestOf);
  if (currentScores.length < sets) {
    return [...currentScores, ...Array(sets - currentScores.length).fill(0)];
  }
  return currentScores.slice(0, sets);
}

/**
 * Determine the winner and loser based on set scores
 */
export function determineWinner(
  playerScores: number[],
  opponentScores: number[],
  _bestOf: number, // Used for future validation of sets to win
  userId: string,
  playerName: string,
  opponentName: string
): WinnerLoserResult {
  let playerSetsWon = 0;
  let opponentSetsWon = 0;

  for (let i = 0; i < Math.min(playerScores.length, opponentScores.length); i++) {
    if (playerScores[i] > opponentScores[i]) {
      playerSetsWon++;
    } else if (opponentScores[i] > playerScores[i]) {
      opponentSetsWon++;
    }
  }

  const playerWon = playerSetsWon > opponentSetsWon;

  return {
    winner: playerWon
      ? { id: userId, name: playerName, scores: playerScores }
      : { id: null, name: opponentName, scores: opponentScores },
    loser: playerWon
      ? { id: null, name: opponentName, scores: opponentScores }
      : { id: userId, name: playerName, scores: playerScores }
  };
}

/**
 * Build match data object for database insertion
 */
export function buildMatchData(
  matchId: string,
  formData: FormData,
  winner: WinnerLoserResult["winner"],
  loser: WinnerLoserResult["loser"],
  isPrivate: boolean
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
    }
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
