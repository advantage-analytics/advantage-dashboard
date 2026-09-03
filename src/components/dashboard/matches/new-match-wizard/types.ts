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
  /**
   * The opponent's program, when the uploader named one. Optional everywhere —
   * a hitting partner has no program, and the name alone stays the only
   * requirement.
   *
   * The KEY, not the uuid: `search_programs` returns `program_key` and widening
   * a shipped SECURITY DEFINER function's return shape to carry an id is the
   * change 20260822090500 warns lands two things broken at once. Resolved when
   * the match is written.
   */
  opponentProgramKey?: string;
  /** Display name for the above, so the field can render without a re-fetch. */
  opponentSchool?: string;
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
  /**
   * The opponent's pooled identity, for aggregating an opponent profile across
   * every match against them. Read by nothing else, and in NO policy — unlike
   * `player2_id` directly above, which grants read access to this match.
   */
  opponent_player_id: string | null;
  /** Workspace the match belongs to. NULL = personal workspace. */
  program_id: string | null;
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
    title: "Where this match lives, and what it's made from.",
    description:
      "Three facts before the file. Once we know whose match it is, the schedule fills the rest."
  },
  video: {
    title: "Add your match video",
    description: "Drop the file and trim to the first serve — details come last."
  },
  match: {
    title: "Add your match",
    description: "Drop your file — we'll auto-fill the details for you to review."
  },
  // Not rendered: the confirm step opens on the match's own hero, which says
  // all of this better than a heading above it could.
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
    title: "Match details",
    description: "Everything the report needs — score, context, and the two video answers."
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

/**
 * What an event already knows about a line, handed to the wizard so it can
 * pre-answer everything except the video.
 *
 * This is what makes the team flow the SAME wizard rather than a second one.
 * In a personal workspace step 1 asks "where do the numbers come from?"; in a
 * team workspace the lineup already minted the line and the result already
 * named the players, so the only open question is which match this file is —
 * and that arrives answered.
 *
 * A check here is a fact the EVENT owns. Wrong ones are corrected on the event,
 * never re-typed in the wizard, or the two disagree and the event loses.
 */
export interface EventPreset {
  /**
   * Which shape this is.
   *
   * `line` — a dual court or a tournament round. The event knows everything.
   * `single` — a challenge, practice set or outside event. The workspace knows
   *   only WHOSE match it is, which is the one question the personal wizard
   *   cannot answer here; the rest is the personal details step, unchanged.
   */
  kind: "line" | "single";
  /** Null on a single match — there is no event and no line. */
  entryId: string | null;
  eventId: string | null;
  /** Opponent school for a dual, tournament name for a tournament. */
  eventName: string | null;
  /** Single only: the program's players, to pick from. */
  roster?: { userId: string; name: string; ladderPosition: number | null }[];
  /** The match this line already produced, when somebody has scored it. */
  matchId: string | null;
  /** 'S1' for a dual line, 'R16' for a tournament round. */
  round: string | null;
  /** Our side. `player1` everywhere downstream — see job-request.ts. */
  playerName: string;
  /**
   * The ACCOUNT behind `playerName`, when there is one. Written to
   * `matches.player1_id`.
   *
   * This has to travel separately from the name because in a team workspace
   * the uploader and the player are different people. The wizard used to write
   * the signed-in uploader's id here, so a coach uploading for a roster
   * athlete produced `{player1_name: "<athlete>", player1_id: <coach>}` — and
   * every consumer that keys on the id rather than the label then attributed
   * the athlete's match to the coach, with nothing on screen looking wrong.
   *
   * NULL is a real answer and the only safe default. A player with no account,
   * a doubles line, a name typed by hand — all of them get null. `player1_id`
   * is also half of the `matches` SELECT policy, so a wrong id is not merely a
   * mislabelled row: it hands read access to the wrong person.
   */
  playerUserId: string | null;
  opponentName: string;
  /** YYYY-MM-DD, from the event. */
  date: string;
  surface: string | null;
  bestOf: number;
  /**
   * Ad or no-ad, from the event's format. Nullable because the pipeline
   * refuses a job without a real answer and a `false` default would be a wrong
   * answer that looks like a real one.
   */
  adScoring: boolean | null;
  /** Already recorded courtside, so the wizard does not ask again. */
  score: { player1: number[]; player2: number[] } | null;
  /** Doubles lines cannot be video-analysed — job-request.ts refuses them. */
  supportsVideo: boolean;
  /** Where Cancel and success return to. */
  eventHref: string;
}
