/**
 * Upload Match wizard - Barrel Export
 * Cleaner architecture with shell + content composition
 *
 * The wizard is a full page (`/dashboard/matches/new`); the dialog shell it
 * used to live in is gone.
 */

// Main component
export { UploadMatchFlow } from "./UploadMatchFlow";

// The wizard page's context, and the pieces composed into the shell from it.
// `UploadMatchFlow` is the one consumer today; a second flow that wants the
// same state with a different page would compose these itself.
export { UploadWizardProvider, useUploadWizard } from "./UploadWizardProvider";
export type {
  UploadWizardContextValue,
  UploadWizardProviderProps,
} from "./UploadWizardProvider";
export {
  DraftNotices,
  ProviderStep,
  FileStep,
  TrimStep,
  MatchStep,
} from "./UploadWizardSteps";
export {
  WizardQuotaMeter,
  WizardFooterStatus,
  SaveDraftButton,
} from "./UploadWizardFooter";
export { UploadMatchSuccess } from "./UploadMatchSuccess";

// Shell components
export { StepIndicator } from "./StepIndicator";
export { WizardShell, CONTENT_CLS } from "./WizardShell";
export type { WizardShellProps } from "./WizardShell";
export { useWizardKeys } from "./useWizardKeys";
export type { UseWizardKeysOptions } from "./useWizardKeys";

// Content components
export { SourceStepContent } from "./SourceStepContent";
export type { SourceStepContentProps } from "./SourceStepContent";

export { FileStepContent } from "./FileStepContent";
export type { FileStepContentProps } from "./FileStepContent";

export { TrimStepContent } from "./TrimStepContent";
export type { TrimStepContentProps } from "./TrimStepContent";

export { DetailsStepContent } from "./DetailsStepContent";
export type { DetailsStepContentProps } from "./DetailsStepContent";

export { ScoreBlock } from "./ScoreBlock";

export { PinnedLineBar } from "./PinnedLineBar";

// Types
export type {
  Step,
  FormData,
  UploadedFile,
  WinnerLoserResult,
  MatchData,
  EventPreset,
  LineChoice,
  LineOffer,
  MatchDraft,
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
export type {
  UseUploadMatchWizardProps,
  UseUploadMatchWizardReturn,
} from "./useUploadMatchWizard";

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
  saveFormDataToStorage,
} from "./utils";
