/**
 * Type definitions for the Upload Match wizard
 */

import type { ProviderKind } from "@/lib/services/upload";
import type { VideoProbe } from "@/lib/video/probe";
import type { EventSite } from "@/lib/schedule/types";

/** Wizard step identifiers */
/**
 * Wizard step identifiers.
 *
 * `file` is the drop step for BOTH kinds — a video for a processing provider,
 * an export for an import one. `trim` is the video check that only a
 * processing provider needs. `match` is the last step: there is no confirm
 * step — Save match writes the record, and the match's own page says the rest
 * better than a summary above it could. Design: Upload Wizard v5.
 */
export type Step = "provider" | "file" | "trim" | "match";

/** Where a pre-filled value came from, for the "from …" provenance tag. */
export type ValueSource = "file" | "export" | "event" | "profile" | "history" | "roster" | "new";

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

  // --- Provenance and identity, so the details step can say where a value
  // came from and the save can attribute the opponent. None are typed.

  /** Where `date`/`time` came from. Undefined when nothing set it. */
  dateSource?: ValueSource;
  /** Where the opponent's name came from. Undefined for a typed name. */
  opponentSource?: ValueSource;
  /**
   * The opponent's pooled identity when a roster row was picked or a program
   * player was created. Travels with the CLICK, never the text.
   */
  opponentPlayerId?: string | null;
  /** Where the player's hand and backhand came from. */
  playerStyleSource?: ValueSource;
  /** Where the opponent's hand and backhand came from. */
  opponentStyleSource?: ValueSource;
  /** Tournament, dual or a one-off — decides whether Round is asked. */
  eventKind?: "tournament" | "dual" | "other";
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
  // Unset, not defaulted: the details step reads "Not set" and offers Add.
  // A defaulted right hand claimed a fact about a player nobody had stated.
  playerHand: undefined,
  opponentHand: undefined,
  playerBackhand: undefined,
  opponentBackhand: undefined,
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
 * Both kinds drop their file on a step of its own — step 2 asks for one thing.
 * An import provider's export is read there, so the details step opens
 * pre-filled. A processing provider's video then needs a check of its own:
 * the trim window and the two camera answers, none of which can be inferred
 * from the file, and all of which the vendor refuses a job without.
 */
export const STEP_ORDER_BY_KIND: Record<ProviderKind, Step[]> = {
  import: ["provider", "file", "match"],
  processing: ["provider", "file", "trim", "match"],
};

/** Step configuration for titles and descriptions */
export const STEP_CONFIG: Record<Step, { title: string; description: string }> = {
  provider: {
    title: "Where this match lives, and what it's made from.",
    description:
      "Three facts before the file. Once we know whose match it is, the schedule fills the rest."
  },
  // The import copy; the video copy is the processing override below.
  file: {
    title: "The export.",
    description:
      "The XLSX the app shares. Its numbers are already computed — we read them, nothing is processed."
  },
  // Only a processing provider reaches this step, so there is no import copy.
  trim: {
    title: "Trim to the first serve.",
    description:
      "Start at the first point, end at the last. The window has to match the score you enter next."
  },
  // The import copy; the video copy is the processing override below.
  match: {
    title: "Score and context.",
    description: "Read from the export. Change anything that's wrong — the file won't be."
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
  file: {
    title: "The file.",
    description:
      "One full match from one camera. Leave the warm-up in — you'll trim to the first serve next."
  },
  match: {
    title: "Score and context.",
    description: "The score is the one thing the video can't tell us. The rest fills what it can."
  }
};

/** Continue-button label per step. */
export const CONTINUE_LABEL: Record<Step, string> = {
  provider: "Continue",
  file: "Continue",
  trim: "Continue",
  match: "Save match",
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
  /** Home, away or neutral — the bar's map-pin fact. Null for a single. */
  site: EventSite | null;
  /** What kind of event the line belongs to. Null for a single. */
  eventKind: "dual" | "tournament" | null;
  /**
   * The opponent program behind a dual, so the opponent picker can offer its
   * roster and a new name can be saved to it. Null where the event named no
   * program, and for every tournament and single.
   */
  opponentProgramKey: string | null;
  opponentSchool: string | null;
  /**
   * The event's other lines, for the pinned bar's Change menu — picking one
   * rewrites the bar and nothing else, so the file already dropped stays.
   * Only on a `line` preset that came from an event.
   */
  lineup?: LineChoice[];
}

/** One row of the pinned bar's lineup menu (design 10a). */
export interface LineChoice {
  /** 'S1'…'D3', or a tournament round. */
  slot: string;
  /** Who holds the line. Null where nobody is assigned. */
  playerName: string | null;
  /** The slot's own state, as the row's trailing word. */
  state: "result" | "video" | "open" | "unset";
  /** The preset to switch to. Null for an unset line, which cannot be picked. */
  preset: EventPreset | null;
}

/**
 * A saved draft, as `match_drafts` holds it and the Matches table lists it.
 *
 * The File never survives — it is re-picked on resume — so `fileName` is only
 * a label. `preset` is carried whole so a draft started from an event line
 * resumes with its bar; `attachedLine` is the schedule offer the person
 * accepted on the details step.
 */
export interface MatchDraft {
  id: string;
  step: Step;
  stepCount: number;
  stepIndex: number;
  provider: string | null;
  formData: FormData;
  fileName: string | null;
  preset: EventPreset | null;
  attachedLine: LineOffer | null;
  updatedAt: string;
}

/**
 * A lineup slot the schedule OFFERS on the details step — the file's date
 * matched an open line for this player within two days (design 3d/7a).
 * Accepting fills opponent, date, court, format and scoring from the line and
 * the event; Detach empties them again.
 */
export interface LineOffer {
  entryId: string;
  /** The match this line already produced, when somebody scored it. */
  matchId: string | null;
  eventId: string;
  eventName: string;
  eventKind: "dual" | "tournament";
  slot: string | null;
  playerName: string;
  opponentName: string;
  opponentProgramKey: string | null;
  opponentSchool: string | null;
  /** YYYY-MM-DD. */
  date: string;
  site: EventSite;
  surface: string | null;
  bestOf: number;
  adScoring: boolean | null;
}
