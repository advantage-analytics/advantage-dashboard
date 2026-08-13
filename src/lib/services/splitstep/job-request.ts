/**
 * SplitStep job request assembly.
 *
 * Pure — no I/O, no side effects, no clock. Every rule here maps a value the
 * user entered onto a field the vendor expects, and several of them are
 * catastrophic when wrong in ways the UI cannot show:
 *
 *   • Top/bottom is CAMERA-relative, not player1/player2. Players change ends
 *     every odd game, so `Initial*` describes the start of the video only.
 *     Reversing it attributes every statistic to the wrong person and looks
 *     completely normal on screen.
 *
 *   • SetGameScores must be ordered from the TOP player's perspective, which is
 *     not necessarily player1's.
 *
 *   • Tiebreak sets send the GAME count (7), never the tiebreak points. A 7-6
 *     set is [7,6] — not [7,5] because the breaker finished 7-5.
 *
 * Because none of that is visible in the rendered output, this module is
 * deliberately isolated and directly testable.
 */

/** The vendor's job submission body. Field casing is theirs, not ours. */
export interface SplitStepJobRequest {
  MatchID: string;
  VideoUrl: string;
  WebhookUrl: string;
  InitialTopPlayer: string;
  InitialBottomPlayer: string;
  StartTime: number;
  EndTime: number;
  SetGameScores: [number, number][];
  FixedCamera: boolean;
  Ad: boolean;
}

export interface JobRequestInput {
  matchId: string;
  /**
   * Publicly reachable URL to the video.
   *
   * Empty while a job is still a draft — storage is not wired yet, and the
   * submission path fills this in at send time. `allowEmptyVideoUrl` controls
   * whether that is acceptable.
   */
  videoUrl: string;
  webhookUrl: string;

  player1Name: string;
  player2Name: string;
  /**
   * True when player1 stood at the top of frame at video start.
   *
   * Typed as possibly-absent because the value that reaches here often comes
   * from a nullable database column, and TypeScript cannot see that. It is
   * validated below rather than trusted — see the note there.
   */
  initialTopPlayerIsPlayer1: boolean | null | undefined;

  /** Trim window in seconds, relative to the original (untrimmed) video. */
  startTimeSeconds: number;
  endTimeSeconds: number;

  /** Per-set GAME counts. Nulls mark sets that were not played. */
  player1Scores: (number | null)[];
  player2Scores: (number | null)[];

  /** Advantage scoring. Nullable for the same reason as initialTopPlayerIsPlayer1. */
  adScoring: boolean | null | undefined;
  /** Camera stayed in one position. Same. */
  fixedCamera: boolean | null | undefined;

  /** Used to reject doubles — the provider is singles-only. */
  matchType?: string | null;

  /** Permit an empty VideoUrl, for building a draft before upload exists. */
  allowEmptyVideoUrl?: boolean;
}

export type JobRequestResult =
  | { ok: true; request: SplitStepJobRequest }
  | { ok: false; errors: string[] };

/** Match types the provider cannot process. */
const DOUBLES_MATCH_TYPES = ['doubles', 'mixed-doubles', 'mixed doubles'];

/**
 * Trim trailing unplayed sets, then confirm what remains is fully specified.
 *
 * A best-of-5 form always carries five slots; a straight-sets match leaves the
 * last two null. Those are dropped. A null *between* played sets is a genuine
 * gap in the user's input and is reported rather than guessed at.
 */
function extractSetScores(
  player1Scores: (number | null)[],
  player2Scores: (number | null)[]
): { scores?: [number, number][]; error?: string } {
  const slotCount = Math.max(player1Scores.length, player2Scores.length);

  let lastPlayed = -1;
  for (let i = 0; i < slotCount; i++) {
    if (player1Scores[i] != null || player2Scores[i] != null) {
      lastPlayed = i;
    }
  }

  if (lastPlayed === -1) {
    return { error: 'Enter the final score for at least one set.' };
  }

  const scores: [number, number][] = [];
  for (let i = 0; i <= lastPlayed; i++) {
    const p1 = player1Scores[i];
    const p2 = player2Scores[i];

    if (p1 == null || p2 == null) {
      return { error: `Set ${i + 1} is missing a game count for one player.` };
    }
    if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) {
      return { error: `Set ${i + 1} has an invalid game count.` };
    }

    scores.push([p1, p2]);
  }

  if (scores.every(([p1, p2]) => p1 === 0 && p2 === 0)) {
    return {
      error: 'Enter the game scores — every set is currently 0-0.',
    };
  }

  return { scores };
}

/**
 * Build a vendor job request from match metadata and a trim window.
 *
 * Collects every problem rather than failing on the first, so the UI can show
 * the user all of what needs fixing in one pass.
 */
export function buildSplitStepJobRequest(input: JobRequestInput): JobRequestResult {
  const errors: string[] = [];

  if (!input.matchId) {
    errors.push('Missing match id.');
  }

  if (!input.videoUrl && !input.allowEmptyVideoUrl) {
    errors.push('Missing video URL.');
  }

  if (!input.webhookUrl) {
    errors.push('Missing webhook URL.');
  }

  const player1Name = input.player1Name?.trim() ?? '';
  const player2Name = input.player2Name?.trim() ?? '';
  if (!player1Name || !player2Name) {
    errors.push('Both player names are required.');
  }

  const matchType = input.matchType?.trim().toLowerCase() ?? '';
  if (DOUBLES_MATCH_TYPES.includes(matchType)) {
    errors.push('Video analysis supports singles matches only.');
  }

  const { startTimeSeconds, endTimeSeconds } = input;
  if (!Number.isFinite(startTimeSeconds) || startTimeSeconds < 0) {
    errors.push('Trim start is invalid.');
  }
  if (!Number.isFinite(endTimeSeconds) || endTimeSeconds <= 0) {
    errors.push('Trim end is invalid.');
  }
  if (
    Number.isFinite(startTimeSeconds) &&
    Number.isFinite(endTimeSeconds) &&
    endTimeSeconds <= startTimeSeconds
  ) {
    errors.push('Trim end must come after trim start.');
  }

  // The three booleans the vendor requires, validated rather than trusted.
  //
  // These arrive from nullable columns, and a null coerces to `false` the moment
  // it is used in a ternary. For adScoring and fixedCamera that is a wrong
  // answer; for initialTopPlayerIsPlayer1 it is a silent catastrophe — it flips
  // which end each player started at, so every statistic lands on the wrong
  // person and the rendered match looks completely normal. Nothing downstream
  // can detect it, and the vendor cannot either.
  //
  // The submit route already refuses a non-boolean, but the guard belongs here,
  // where every caller inherits it rather than each one remembering.
  // Everything below is expressed from the camera's point of view.
  const topIsPlayer1 = input.initialTopPlayerIsPlayer1;
  const adScoring = input.adScoring;
  const fixedCamera = input.fixedCamera;

  if (typeof topIsPlayer1 !== 'boolean') {
    errors.push('Pick which end you started the video on.');
  }
  if (typeof adScoring !== 'boolean') {
    errors.push('Choose ad or no-ad scoring.');
  }
  if (typeof fixedCamera !== 'boolean') {
    errors.push('Say whether the camera stayed in one position.');
  }

  const setResult = extractSetScores(input.player1Scores, input.player2Scores);
  if (setResult.error) {
    errors.push(setResult.error);
  }

  // The three `typeof` checks are repeated here, and that repetition is load
  // bearing: pushing an error does not narrow a type, so without them the
  // compiler still sees `boolean | null | undefined` below and a `!` assertion
  // would be the only way out. They cannot drift from the messages above —
  // both read the same three consts.
  if (
    errors.length > 0 ||
    !setResult.scores ||
    typeof topIsPlayer1 !== 'boolean' ||
    typeof adScoring !== 'boolean' ||
    typeof fixedCamera !== 'boolean'
  ) {
    return { ok: false, errors };
  }

  const player1First = setResult.scores;

  return {
    ok: true,
    request: {
      MatchID: input.matchId,
      VideoUrl: input.videoUrl,
      WebhookUrl: input.webhookUrl,
      InitialTopPlayer: topIsPlayer1 ? player1Name : player2Name,
      InitialBottomPlayer: topIsPlayer1 ? player2Name : player1Name,
      StartTime: startTimeSeconds,
      EndTime: endTimeSeconds,
      SetGameScores: topIsPlayer1
        ? player1First
        : player1First.map(([p1, p2]): [number, number] => [p2, p1]),
      FixedCamera: fixedCamera,
      Ad: adScoring,
    },
  };
}

