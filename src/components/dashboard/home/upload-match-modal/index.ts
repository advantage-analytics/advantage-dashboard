/**
 * Upload Match Modal - Barrel Export
 * Cleaner architecture with shell + content composition
 */

// Main component
export { UploadMatchModal } from "./UploadMatchModal";

// Shell components
export { StepIndicator } from "./StepIndicator";

// Content components
export { MethodContent } from "./MethodContent";
export type { MethodContentProps } from "./MethodContent";

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
  UploadMatchModalProps,
  FormData,
  UploadedFile,
  WinnerLoserResult,
  MatchData
} from "./types";

export { DEFAULT_FORM_DATA, STEP_CONFIG, STEP_ORDER, STEP_FOOTER_CONFIG } from "./types";

// Custom hook
export { useUploadMatchModal } from "./useUploadMatchModal";
export type { UseUploadMatchModalProps, UseUploadMatchModalReturn } from "./useUploadMatchModal";

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
