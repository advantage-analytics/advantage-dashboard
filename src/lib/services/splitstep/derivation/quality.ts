/**
 * Per-job data quality scoring.
 *
 * The vendor gives us no per-job signal for how well a video was tracked.
 * `line_confidence` is the closest thing, and it is only usable in aggregate:
 * the docs specify a 0.5–0.9 range, so the floor and ceiling are by design
 * rather than a defect. Per stroke that band is too coarse to threshold on,
 * but its median does track quality across the three real payloads
 * (0.900 / 0.854 / 0.716), as does the share pinned at the 0.9 ceiling
 * (54.6% / 37.6% / 30.0%). Worth adding as a check; not yet done.
 *
 * We compute our own because quality is camera-dependent and varies
 * enormously between jobs with nothing in the payload announcing it. Of the
 * three real matches, unusable bounce coordinates run 4.3% / 10.4% / 22.7% —
 * with values up to `bounce_y_m: 371.7` on a court whose fence is at 18.3 m.
 *
 * So we compute our own. Each check below is something that is impossible or
 * near-impossible in a correctly tracked singles match, which makes its rate
 * a direct read on tracking failure rather than on how the match was played.
 *
 * The grade feeds `processing_jobs.derivation_confidence` and gates whether a
 * number is shown to a user at all. Spec §4.4.
 */

import { serveBracket } from './serves';
import type { SplitStepRally, SplitStepStroke } from './types';

export type QualityGrade = 'high' | 'medium' | 'low';

/**
 * `insufficient` is distinct from `fail` on purpose: it means the check had
 * nothing to measure, not that what it measured was bad. Collapsing the two
 * made a payload with no usable score fields look exactly like one whose
 * every transition was broken.
 */
export type CheckVerdict = 'pass' | 'warn' | 'fail' | 'insufficient';

export interface QualityCheck {
  id: CheckId;
  /** Plain-language statement of what was measured. */
  label: string;
  /** Measured value, 0–1. */
  value: number;
  /** Numerator/denominator behind `value`, for the report. */
  observed: number;
  total: number;
  verdict: CheckVerdict;
}

export interface QualityReport {
  grade: QualityGrade;
  checks: QualityCheck[];
  strokeCount: number;
  rallyCount: number;
  /** Checks that reached 'fail'. Empty on a medium or high grade. */
  failures: string[];
  /** Checks that reached 'warn'. */
  warnings: string[];
}

/**
 * Thresholds, calibrated against the two sample matches.
 *
 * `higherIsBetter: false` means the value is an error rate and the thresholds
 * are ceilings; true means it is a health rate and they are floors.
 *
 * Calibration intent: the cleaner sample grades `medium` and the degraded one
 * grades `low`. Nothing available today grades `high`, which is deliberate —
 * `high` should mean "no metric is even in the warn band", a bar we should
 * have to clear before presenting derived statistics as fact.
 */
interface Threshold {
  warn: number;
  fail: number;
  higherIsBetter: boolean;
}

const THRESHOLDS = {
  unusable_bounce: { warn: 0.05, fail: 0.15, higherIsBetter: false },
  serve_net_hit_mid_rally: { warn: 0.05, fail: 0.2, higherIsBetter: false },
  illegal_same_player_sequence: { warn: 0.005, fail: 0.02, higherIsBetter: false },
  unusable_player_position: { warn: 0.01, fail: 0.03, higherIsBetter: false },
  game_transition_valid: { warn: 0.98, fail: 0.92, higherIsBetter: true },
  point_transition_clean: { warn: 0.98, fail: 0.92, higherIsBetter: true },
  first_serve_spread: { warn: 0.1, fail: 0.2, higherIsBetter: false },
} as const satisfies Record<string, Threshold>;

/**
 * The check ids that have thresholds — derived from THRESHOLDS rather than
 * declared separately, so adding a check without a threshold, or renaming one
 * on only one side, is a compile error instead of a check that silently never
 * fires.
 */
export type CheckId = keyof typeof THRESHOLDS;

function verdictFor(id: CheckId, value: number): CheckVerdict {
  const t: Threshold | undefined = THRESHOLDS[id];
  // Unreachable while CheckId is derived from THRESHOLDS. Fails rather than
  // passes so that if it ever does happen — a threshold deleted at runtime,
  // a cast — the effect is a match held back, not one published unchecked.
  if (!t) return 'fail';
  if (t.higherIsBetter) {
    if (value < t.fail) return 'fail';
    if (value < t.warn) return 'warn';
    return 'pass';
  }
  if (value > t.fail) return 'fail';
  if (value > t.warn) return 'warn';
  return 'pass';
}

function check(
  id: CheckId,
  label: string,
  observed: number,
  total: number
): QualityCheck {
  // Nothing to divide by means nothing to judge. Reporting 0 here made every
  // higherIsBetter check read as a total failure on an empty denominator.
  if (total === 0) {
    return { id, label, value: 0, observed, total, verdict: 'insufficient' };
  }
  const value = observed / total;
  return { id, label, value, observed, total, verdict: verdictFor(id, value) };
}

// ---------------------------------------------------------------------------
// Score-string helpers
//
// Both `pred_game_score` and `pred_set_score` are written from the SERVER's
// perspective, so the string flips every time the server changes even though
// nothing about the match state did. Comparing them as ordered pairs reports
// a change on every single game. Comparing them as sorted pairs — which is
// what pairOf does — is orientation-agnostic and reports a change only when
// the state actually moved.
// ---------------------------------------------------------------------------

/** "1-2" or "1.0-2.0" → [1, 2] sorted. Null for "nan-nan" and other junk. */
function pairOf(score: string | null): [number, number] | null {
  if (!score) return null;
  const parts = score.split('-');
  if (parts.length !== 2) return null;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a <= b ? [a, b] : [b, a];
}

function samePair(a: [number, number] | null, b: [number, number] | null): boolean {
  return a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
}

/** Rungs of a standard game. There is no AD rung — the vendor never emits one. */
const POINT_LADDER: Record<string, number> = { '0': 0, '15': 1, '30': 2, '40': 3 };

function ladderPair(score: string | null): [number, number] | null {
  if (!score) return null;
  const parts = score.split('-');
  if (parts.length !== 2) return null;
  const a = POINT_LADDER[parts[0]];
  const b = POINT_LADDER[parts[1]];
  return a === undefined || b === undefined ? null : [a, b];
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** Bounces the parse layer had to null — sentinel or off-planet geometry. */
function unusableBounces(strokes: SplitStepStroke[]): QualityCheck {
  const bad = strokes.filter((s) => s.bounceX === null).length;
  return check(
    'unusable_bounce',
    'Strokes with a missing or physically impossible bounce location',
    bad,
    strokes.length
  );
}

/**
 * Serves flagged as hitting the net that the rally then continued past.
 *
 * Read this as a rate, not as a per-stroke verdict. The vendor documents
 * `net_hit` as contact anywhere in the ball's trajectory, and a net-cord serve
 * can legitimately clip and land in — so a rally continuing past one is not
 * by itself wrong, especially where `format.play_on_lets` is true.
 *
 * What makes the rate meaningful is that `net_hit: true` comes with
 * `in: false` on 98–99% of strokes in all three real payloads, so in practice
 * the vendor treats it as failure-to-clear. Against that, 6.4% / 25.6% / 41.9%
 * of serves is far past any plausible net-cord rate. The vendor's own
 * `height_at_net_m` agrees it is wrong: 10% / 37% / 58% of `net_hit` strokes
 * report a height above the net. That contradiction is the sharper test and
 * is the better basis for this check when we come back to it.
 */
function serveNetHitMidRally(rallies: SplitStepRally[]): QualityCheck {
  let offenders = 0;
  let serves = 0;
  for (const rally of rallies) {
    const last = rally.strokes[rally.strokes.length - 1];
    for (const serve of rally.serves) {
      serves += 1;
      if (serve.netHit && serve !== last) offenders += 1;
    }
  }
  return check(
    'serve_net_hit_mid_rally',
    'Serves flagged as net contact that the rally continued past',
    offenders,
    serves
  );
}

/**
 * Consecutive strokes credited to the same player inside one rally.
 *
 * Impossible in singles, with one legitimate exception: a first serve
 * followed by a second serve. Anything else is the tracker swapping identities
 * or inventing a stroke.
 */
function illegalSameplayerSequences(rallies: SplitStepRally[]): QualityCheck {
  let offenders = 0;
  let transitions = 0;
  for (const rally of rallies) {
    for (let i = 0; i < rally.strokes.length - 1; i += 1) {
      const a = rally.strokes[i];
      const b = rally.strokes[i + 1];
      transitions += 1;
      const bothServes = a.strokeType === 'serve' && b.strokeType === 'serve';
      if (a.playerLabel === b.playerLabel && !bothServes) offenders += 1;
    }
  }
  return check(
    'illegal_same_player_sequence',
    'Consecutive strokes credited to the same player (excluding 1st/2nd serve)',
    offenders,
    transitions
  );
}

/**
 * Strokes where the hitter's or opponent's position had to be discarded.
 *
 * A separate signal from the bounce rate: ball tracking and player tracking
 * fail independently, and player positions feed court coverage and the
 * displacement term any future winner/error heuristic will lean on.
 *
 * This check started life as "both players on the same side of the net",
 * which is impossible in singles and looked like the sharper measure. It was
 * not — every stroke it caught had a position outside the playing enclosure,
 * so the parse layer had already nulled it and the check read a flat zero on
 * both fixtures. What remains after the guard is the guard's own hit rate,
 * which is the honest number.
 */
function unusablePlayerPositions(strokes: SplitStepStroke[]): QualityCheck {
  const bad = strokes.filter(
    (s) => s.playerX === null || s.opponentX === null
  ).length;
  return check(
    'unusable_player_position',
    'Strokes with a missing or physically impossible player position',
    bad,
    strokes.length
  );
}

/**
 * Game-to-game transitions that make sense.
 *
 * Valid means either exactly one player's game count went up by one, or a set
 * boundary reset the game score to 0-0. Compared orientation-agnostically —
 * see the note above pairOf.
 */
function gameTransitions(rallies: SplitStepRally[]): QualityCheck {
  const games = collapseToGames(rallies);
  let valid = 0;
  let total = 0;

  for (let i = 0; i < games.length - 1; i += 1) {
    const cur = games[i];
    const next = games[i + 1];
    const curSet = pairOf(cur.setScore);
    const nextSet = pairOf(next.setScore);
    const curGame = pairOf(cur.gameScore);
    const nextGame = pairOf(next.gameScore);

    // Skip rather than count as invalid. An unparseable score string is a
    // parse-layer defect that unusable_bounce and its siblings already
    // measure; charging it here too penalised the game sequence for a fault
    // that has nothing to do with the game sequence, and did so
    // inconsistently — pointTransitions skips the identical case.
    if (!curSet || !nextSet || !curGame || !nextGame) continue;
    total += 1;

    if (!samePair(curSet, nextSet)) {
      // A real set boundary. The only valid successor is a fresh 0-0.
      if (nextGame[0] === 0 && nextGame[1] === 0) valid += 1;
      continue;
    }

    const [a, b] = curGame;
    const optionA: [number, number] = a + 1 <= b ? [a + 1, b] : [b, a + 1];
    const optionB: [number, number] = a <= b + 1 ? [a, b + 1] : [b + 1, a];
    if (samePair(nextGame, optionA) || samePair(nextGame, optionB)) valid += 1;
  }

  return check(
    'game_transition_valid',
    'Game-score transitions consistent with one player winning one game',
    valid,
    total
  );
}

/**
 * Point-to-point transitions inside a single game.
 *
 * Valid means exactly one side moved up exactly one rung of 0/15/30/40. Only
 * evaluated where the game and server did not change, so the perspective is
 * fixed and a direct comparison is meaningful.
 */
function pointTransitions(rallies: SplitStepRally[]): QualityCheck {
  let clean = 0;
  let total = 0;

  for (let i = 0; i < rallies.length - 1; i += 1) {
    const cur = rallies[i];
    const next = rallies[i + 1];
    const curFirst = cur.strokes[0];
    const nextFirst = next.strokes[0];
    if (!curFirst || !nextFirst) continue;

    // Different game or different server: the point score resets and flips,
    // so it carries no information about who won. Skip rather than penalise.
    if (curFirst.predGameScore !== nextFirst.predGameScore) continue;
    if (cur.server !== next.server) continue;

    const from = ladderPair(curFirst.predPointScore);
    const to = ladderPair(nextFirst.predPointScore);
    if (!from || !to) continue;

    total += 1;
    const deltaA = to[0] - from[0];
    const deltaB = to[1] - from[1];
    if ((deltaA === 1 && deltaB === 0) || (deltaA === 0 && deltaB === 1)) {
      clean += 1;
    }
  }

  return check(
    'point_transition_clean',
    'In-game point transitions where exactly one player gained one point',
    clean,
    total
  );
}

/** Spread between the two irreconcilable readings of first-serve percentage. */
function serveSpread(rallies: SplitStepRally[]): QualityCheck {
  const bracket = serveBracket(rallies);
  const c = check('first_serve_spread', '', 0, 1);
  return {
    ...c,
    label:
      'Gap between the two readings of first-serve percentage (rally structure vs in flag)',
    value: bracket.firstServeSpread,
    observed: Math.round(bracket.firstServeSpread * 1000) / 10,
    total: 100,
    verdict: verdictFor('first_serve_spread', bracket.firstServeSpread),
  };
}

interface GameBlock {
  setScore: string | null;
  gameScore: string | null;
  server: string;
}

/** Collapse the rally list into the sequence of games it walks through. */
function collapseToGames(rallies: SplitStepRally[]): GameBlock[] {
  const games: GameBlock[] = [];
  for (const rally of rallies) {
    const first = rally.strokes[0];
    if (!first) continue;
    const prev = games[games.length - 1];
    if (
      prev &&
      prev.setScore === first.predSetScore &&
      prev.gameScore === first.predGameScore &&
      prev.server === rally.server
    ) {
      continue;
    }
    games.push({
      setScore: first.predSetScore,
      gameScore: first.predGameScore,
      server: rally.server,
    });
  }
  return games;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Score a parsed match.
 *
 * Grade rule: any failing check drops the whole match to `low`. Checks are not
 * averaged — a match with 30% corrupt coordinates is unusable no matter how
 * clean its score stream is, and averaging would let good metrics launder a
 * fatal one.
 */
export function scoreQuality(
  strokes: SplitStepStroke[],
  rallies: SplitStepRally[]
): QualityReport {
  const checks: QualityCheck[] = [
    unusableBounces(strokes),
    serveNetHitMidRally(rallies),
    illegalSameplayerSequences(rallies),
    unusablePlayerPositions(strokes),
    gameTransitions(rallies),
    pointTransitions(rallies),
    serveSpread(rallies),
  ];

  const failures = checks.filter((c) => c.verdict === 'fail').map((c) => c.id);
  const warnings = checks.filter((c) => c.verdict === 'warn').map((c) => c.id);
  // A check with no data neither condemns a match nor clears it. It cannot
  // reach 'low' on its own, but it does block 'high', because 'high' is the
  // grade that lets numbers reach a coach and we did not actually verify this
  // one.
  const unmeasured = checks
    .filter((c) => c.verdict === 'insufficient')
    .map((c) => c.id);

  const grade: QualityGrade =
    failures.length > 0
      ? 'low'
      : warnings.length > 0 || unmeasured.length > 0
        ? 'medium'
        : 'high';

  return {
    grade,
    checks,
    strokeCount: strokes.length,
    rallyCount: rallies.length,
    failures,
    warnings,
  };
}
