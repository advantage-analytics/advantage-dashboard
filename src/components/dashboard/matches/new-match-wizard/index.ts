/**
 * Upload Match wizard - Barrel Export
 * Cleaner architecture with shell + content composition
 *
 * The wizard is a full page (`/dashboard/matches/new`); the dialog shell it
 * used to live in is gone.
 */

// Main component
export { UploadMatchFlow } from "./UploadMatchFlow";

// Shell components
export { StepIndicator } from "./StepIndicator";

// Content components
export { ProviderContent } from "./ProviderContent";
export type { ProviderContentProps } from "./ProviderContent";

export { UploadContent } from "./UploadContent";
export type { UploadContentProps } from "./UploadContent";

export { DetailsContent } from "./DetailsContent";
export type { DetailsContentProps } from "./DetailsContent";

export { ConfirmContent } from "./ConfirmContent";
export type { ConfirmContentProps } from "./ConfirmContent";

// Types
export type {
  Step,
  FormData,
  UploadedFile,
  WinnerLoserResult,
  MatchData
} from "./types";

export {
  DEFAULT_FORM_DATA,
  STEP_CONFIG,
  STEP_CONFIG_PROCESSING,
  STEP_ORDER_BY_KIND,
  CONTINUE_LABEL,
} from "./types";

// Custom hook
export { useUploadMatchWizard } from "./useUploadMatchWizard";
export type { UseUploadMatchWizardProps, UseUploadMatchWizardReturn } from "./useUploadMatchWizard";

// Utilities
export {
  getNumberOfSets,
  getAdjustedScores,
  determineWinner,
  buildMatchData,
  base64ToBlob,
  formatFileSize,
  STORAGE_KEYS,
  clearStorageData,
  loadFormDataFromStorage,
  loadUploadedFileFromStorage,
  saveFormDataToStorage
} from "./utils";
