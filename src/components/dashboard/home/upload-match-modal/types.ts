/**
 * Type definitions for the Upload Match Modal wizard
 */

/** Wizard step identifiers */
export type Step = "method" | "provider" | "upload" | "details" | "confirm";

/** Props for the main UploadMatchModal component */
export interface UploadMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Form data structure for match details */
export interface FormData {
  eventName: string;
  round: string;
  bestOf: string;
  adScoring: boolean;
  playOnLets: boolean;
  result: string;
  date: string;
  time: string;
  playerName: string;
  opponentName: string;
  playerScores: (number | null)[];
  opponentScores: (number | null)[];
  playerTiebreaks: (number | null)[];
  opponentTiebreaks: (number | null)[];
  /** Number of set inputs to show (1–5). When undefined, defaults to bestOf. */
  numberOfSets?: number;
  matchType?: string;
  courtType?: string;
  duration?: number;
  playerHand?: "right" | "left";
  playerBackhand?: "one-handed" | "two-handed";
}

/** Uploaded file metadata and data */
export interface UploadedFile {
  name: string;
  size: string;
  status: string;
  file?: File | null;
  data?: string;
  type?: string;
}

/** Winner/loser determination result */
export interface WinnerLoserResult {
  winner: {
    id: string | null;
    name: string;
    scores: number[];
  };
  loser: {
    id: string | null;
    name: string;
    scores: number[];
  };
}

/** Match data structure for database insertion */
export interface MatchData {
  id: string;
  player1_id: string | null;
  player1_name: string;
  player2_id: string | null;
  player2_name: string;
  tournament_name: string | null;
  round: string | null;
  format: {
    best_of: number;
    ad_scoring: boolean;
    play_on_lets: boolean;
  };
  result: string;
  date: string;
  private: boolean;
  score: {
    player1: number[];
    player2: number[];
    player1_tiebreaks?: (number | null)[];
    player2_tiebreaks?: (number | null)[];
  };
  // New metadata fields
  created_by: string;
  source_provider: string;
  analysis_method: string;
  match_type?: string;
  court_type?: string;
  verified?: boolean;
  duration?: number;
  player_hand?: "right" | "left";
  player_backhand?: "one-handed" | "two-handed";
}

/** Default form data values */
export const DEFAULT_FORM_DATA: FormData = {
  eventName: "",
  round: "",
  bestOf: "",
  adScoring: false,
  playOnLets: false,
  result: "",
  date: "",
  time: "",
  playerName: "",
  opponentName: "",
  playerScores: [null, null, null],
  opponentScores: [null, null, null],
  playerTiebreaks: [null, null, null],
  opponentTiebreaks: [null, null, null],
  matchType: "",
  courtType: "",
  duration: 0
};

/** Step order for navigation and indicator */
export const STEP_ORDER: Step[] = ["method", "provider", "upload", "details", "confirm"];

/** Step configuration for titles and descriptions */
export const STEP_CONFIG: Record<Step, { title: string; description: string }> = {
  method: {
    title: "Your Analysis, Your Way",
    description: "Choose which method to analyze your data"
  },
  provider: {
    title: "Choose Provider",
    description: "Choose from the following Electronic Line Calling (ELC) providers"
  },
  upload: {
    title: "Upload File",
    description: "Upload your documents here"
  },
  details: {
    title: "Match Details",
    description: "Input and correct your match information"
  },
  confirm: {
    title: "Confirm Details",
    description: "Review and confirm your match details"
  }
};

/** Footer button configuration per step */
export const STEP_FOOTER_CONFIG: Record<Step, { showBack: boolean; continueLabel: string }> = {
  method: { showBack: false, continueLabel: "Continue" },
  provider: { showBack: true, continueLabel: "Continue" },
  upload: { showBack: true, continueLabel: "Continue" },
  details: { showBack: true, continueLabel: "Continue" },
  confirm: { showBack: true, continueLabel: "Create Match" }
};

/** File parsing state for auto-population */
export interface ParsingState {
  isParsing: boolean;
  parseError: string | null;
  parseWarnings: string[];
  parseSuccess: boolean;
}
