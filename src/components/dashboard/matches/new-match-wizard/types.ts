/**
 * Type definitions for the Upload Match wizard
 */

import type { ProviderKind } from "@/lib/services/upload";
import type { VideoProbe } from "@/lib/video/probe";

/** Wizard step identifiers */
export type Step = "provider" | "video" | "match" | "confirm";

/** Optional Match-step fields that the Confirm step can deep-link back to. */
export type DetailField = "round" | "matchType" | "courtType";

/** Form data structure for match details */
export interface FormData {
  eventName: string;
  round: string;
  bestOf: string;
  /**
   * Advantage scoring. Optional because "not chosen" is a real state the
   * control already renders — it styles an undefined value as empty. It used to
   * default to `false`, which meant a player who never opened the field silently
   * declared no-ad, and the submit route silently declared the opposite.
   */
  adScoring?: boolean;
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
  /** Player dominant hand */
  playerHand?: "right" | "left";
  /** Opponent dominant hand */
  opponentHand?: "right" | "left";
  /** Player backhand style */
  playerBackhand?: "one-handed" | "two-handed";
  /** Opponent backhand style */
  opponentBackhand?: "one-handed" | "two-handed";

  // --- Video-analysis fields (processing providers only) ---

  /**
   * True when YOU were at the top of frame at the start of the video.
   *
   * Camera-relative, not player-relative: ends change every odd game, so this
   * describes the opening of the video and nothing else. It is what lets us map
   * the provider's per-player predictions back onto the right person.
   */
  initialTopPlayerIsPlayer1?: boolean;
  /** Camera stayed in one position for the whole recording. */
  fixedCamera?: boolean;
  /** Trim start, seconds into the original video. */
  videoStartSeconds?: number;
  /** Trim end, seconds into the original video. */
  videoEndSeconds?: number;
}

/**
 * Metadata read from a picked video, shown back to the user.
 *
 * Aliased rather than redeclared so adding a probed field (codec, rotation) is
 * one edit in probe.ts instead of three coordinated ones.
 */
export type VideoProbeSummary = VideoProbe;

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
    /** Null when the player never chose. Not the same as choosing no-ad. */
    ad_scoring: boolean | null;
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
  opponent_hand?: "right" | "left";
  opponent_backhand?: "one-handed" | "two-handed";
}

/** Default form data values */
export const DEFAULT_FORM_DATA: FormData = {
  eventName: "",
  round: "",
  bestOf: "3",
  adScoring: undefined,
  playOnLets: false,
  result: "",
  date: "",
  time: "",
  playerName: "",
  opponentName: "",
  playerHand: "right",
  opponentHand: "right",
  playerBackhand: "two-handed",
  opponentBackhand: "two-handed",
  playerScores: [null, null, null],
  opponentScores: [null, null, null],
  playerTiebreaks: [null, null, null],
  opponentTiebreaks: [null, null, null],
  matchType: "",
  courtType: "",
  duration: 0,
  initialTopPlayerIsPlayer1: undefined,
  fixedCamera: undefined,
  videoStartSeconds: undefined,
  videoEndSeconds: undefined
};

/**
 * Step order, per provider kind.
 *
 * Import providers hand us a parseable file, so the file drop and the metadata
 * form share one step — the parser pre-fills the form. Processing providers
 * need a step of their own first: the video has to be validated and trimmed
 * before the metadata form means anything, and none of that can be inferred
 * from the file.
 */
export const STEP_ORDER_BY_KIND: Record<ProviderKind, Step[]> = {
  import: ["provider", "match", "confirm"],
  processing: ["provider", "video", "match", "confirm"],
};

/** Step configuration for titles and descriptions */
export const STEP_CONFIG: Record<Step, { title: string; description: string }> = {
  provider: {
    title: "Choose your data source",
    description: "Select the platform you exported from."
  },
  video: {
    title: "Add your video",
    description: "We'll check it works before anything uploads, then you can trim to the match itself."
  },
  match: {
    title: "Add your match",
    description: "Drop your file — we'll auto-fill the details for you to review."
  },
  confirm: {
    title: "Ready to save",
    description: "A final review before this match is saved to your dashboard."
  }
};

/**
 * Field-wise overrides for processing providers, merged over STEP_CONFIG.
 *
 * Deliberately Partial at both levels: only the differing fields are listed, so
 * editing a base title cannot leave a stale duplicate here.
 */
export const STEP_CONFIG_PROCESSING: Partial<
  Record<Step, Partial<{ title: string; description: string }>>
> = {
  match: {
    description: "Tell us how the match went — the analysis needs the final score to line up with your video."
  },
  confirm: {
    description: "A final review before this match is queued for analysis."
  }
};

/** Continue-button label per step. */
export const CONTINUE_LABEL: Record<Step, string> = {
  provider: "Continue",
  video: "Continue",
  match: "Continue",
  confirm: "Create match",
};

/** File parsing state for auto-population */
export interface ParsingState {
  isParsing: boolean;
  parseError: string | null;
  parseWarnings: string[];
  parseSuccess: boolean;
}
