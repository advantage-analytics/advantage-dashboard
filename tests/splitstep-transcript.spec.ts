import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  ACCEPT_UNRECONCILED_FOLD,
  analyzeResults,
  buildTranscript,
  classifyPoint,
  lastServeIndex,
  reconcile,
  pressureFor,
  resolvePointWinners,
  scoreIsSelfMirroring,
  shotNumber,
  shotResult,
  POINT_FLAGS,
  SHOT_FLAGS,
  type PointWinner,
  type SplitStepRally,
  type SplitStepStroke,
} from '@/lib/services/splitstep/derivation';

/**
 * The transcript layer: point winners from the score fold, reconciliation
 * against the entered score, result_type, shot numbering and flags.
 *
 * The one match with ground truth is a live customer payload and is NOT
 * committed, so the fixtures here cannot assert against a known score. They
 * assert the two things that can be checked without one: that the fold is
 * self-consistent (feeding it its own output must reconcile, and must identify
 * player1), and that every structural rule holds on real data.
 */

const FIXTURES = path.join(__dirname, 'fixtures', 'splitstep');
const load = (n: string) => JSON.parse(readFileSync(path.join(FIXTURES, n), 'utf8'));
const clean = load('clean-match.json');
const degraded = load('degraded-match.json');

/** Orderless set key plus a game key, matching what transcript.ts builds. */
function keysFor(rallies: SplitStepRally[]) {
  const key = new Map<number, { set: string; game: string }>();
  for (const r of rallies) {
    const f = r.strokes[0];
    const set = (f?.predSetScore ?? '')
      .split('-')
      .map((s) => s.trim())
      .sort()
      .join('-');
    key.set(r.rallyId, { set, game: `${set}|${f?.predGameScore}|${r.server}` });
  }
  return key;
}

function stroke(over: Partial<SplitStepStroke>): SplitStepStroke {
  return {
    eventId: 0, videoTime: 0, trimmedFrame: 0, rallyId: 1, strokeNumber: 1,
    playerLabel: 'A', predPointScore: '0-0', predGameScore: '0-0',
    predSetScore: '0-0', strokeType: 'groundstroke', strokeSide: 'forehand',
    strokeScore: 1, sideScore: 1, playerX: 0, playerY: -5, opponentX: 0,
    opponentY: 5, speedKmh: 100, spinType: 'flat', initialHeightM: 1,
    heightAtNetM: 1.5, netHit: false, bounceX: 0, bounceY: 5, bounceScore: 1,
    in: true, lineConfidence: 0.9, ...over,
  };
}

function rally(strokes: SplitStepStroke[]): SplitStepRally {
  return {
    rallyId: 1,
    strokes,
    server: strokes[0]?.playerLabel ?? 'A',
    serves: strokes.filter((s) => s.strokeType === 'serve'),
  };
}

test.describe('shot numbering', () => {
  test('the deciding serve is 1 and the return is 2', () => {
    // calculate_match_stats joins serve.shot_number = 1 to ret.shot_number = 2.
    expect(shotNumber(0, 0)).toBe(1);
    expect(shotNumber(1, 0)).toBe(2);
    expect(shotNumber(2, 0)).toBe(3);
  });

  test('a faulted serve takes 0, keeping exactly one row at 1', () => {
    // Two rows at shot_number 1 fan out that join: production shows 1,550
    // returns producing 2,534 joined rows because SwingVision puts both serves
    // there. Derived rows must not reproduce it.
    expect(shotNumber(0, 1)).toBe(0);
    expect(shotNumber(1, 1)).toBe(1);
    expect(shotNumber(2, 1)).toBe(2);
  });

  test('a groundstroke struck between the two serves also takes 0', () => {
    // 20 / 17 / 17 rallies across the real payloads have one. Numbering it
    // relative to the first serve would make the SECOND SERVE the return.
    const r = rally([
      stroke({ strokeType: 'serve', in: false }),
      stroke({ playerLabel: 'B' }),
      stroke({ strokeType: 'serve' }),
      stroke({ playerLabel: 'B' }),
    ]);
    const serveIndex = lastServeIndex(r);
    expect(serveIndex).toBe(2);
    expect(r.strokes.map((_, i) => shotNumber(i, serveIndex))).toEqual([0, 0, 1, 2]);
  });
});

test.describe('result_type', () => {
  const served = (over: Partial<SplitStepStroke> = {}) =>
    stroke({ strokeType: 'serve', strokeSide: 'overhead', ...over });

  test('the point winner striking last is a Winner, on the correct side', () => {
    const r = rally([served(), stroke({ playerLabel: 'B', strokeSide: 'backhand' })]);
    expect(classifyPoint(r, 'B')).toBe('Backhand Winner');
    expect(classifyPoint(r, 'A')).toBe('Backhand Unforced Error');
  });

  test('an unreturned serve is a Service Winner, never an Ace', () => {
    // Nothing records an attempted-and-missed swing, so the two cannot be
    // separated. Emitting Ace would be a guess; match_stats.aces is suppressed.
    const r = rally([served()]);
    expect(classifyPoint(r, 'A')).toBe('Service Winner');
  });

  test('a second serve the server lost is a Double Fault', () => {
    const r = rally([served({ in: false }), served({ in: false })]);
    expect(classifyPoint(r, 'B')).toBe('Double Fault');
  });

  test('a lone lost serve yields no result_type rather than a false Double Fault', () => {
    // There was no first fault, so calling this a double fault would invent one.
    expect(classifyPoint(rally([served({ in: false })]), 'B')).toBeNull();
  });

  test('never emits a Forced Error string', () => {
    // 'Forehand Forced Error' matches neither LIKE in calculate_match_stats, so
    // such a point would vanish from every aggregate instead of landing in one.
    for (const winner of ['A', 'B']) {
      const out = classifyPoint(
        rally([served(), stroke({ playerLabel: 'B', strokeSide: 'forehand' })]),
        winner
      );
      expect(out).not.toMatch(/Forced/);
    }
  });
});

test.describe('shots.result is structural, not the in flag', () => {
  test('a mid-rally stroke is In even when the vendor flags it out', () => {
    // The opponent played the next ball, so it was in. This contradiction is
    // the most common defect in the payload (16-38% of strokes).
    const r = rally([
      stroke({ strokeType: 'serve' }),
      stroke({ playerLabel: 'B', in: false }),
      stroke({ playerLabel: 'A' }),
    ]);
    expect(
      shotResult({ stroke: r.strokes[1], index: 1, rally: r, serveIndex: 0, winner: 'A' })
    ).toBe('In');
  });

  test('the last stroke follows the point winner, not the flag', () => {
    const r = rally([stroke({ strokeType: 'serve' }), stroke({ playerLabel: 'B', in: false })]);
    expect(
      shotResult({ stroke: r.strokes[1], index: 1, rally: r, serveIndex: 0, winner: 'B' })
    ).toBe('In');
    expect(
      shotResult({ stroke: r.strokes[1], index: 1, rally: r, serveIndex: 0, winner: 'A' })
    ).toBe('Out');
  });

  test('an unreturned serve the server won is In', () => {
    // Marking it Out would contradict its own Service Winner and drop it from
    // second_serves_in.
    const r = rally([
      stroke({ strokeType: 'serve', in: false }),
      stroke({ strokeType: 'serve', in: false }),
    ]);
    expect(
      shotResult({ stroke: r.strokes[1], index: 1, rally: r, serveIndex: 1, winner: 'A' })
    ).toBe('In');
  });
});

test.describe('reconciliation', () => {
  test('a self-mirroring score is detected', () => {
    // A retirement recorded 3-3 satisfies both mappings and identifies nobody.
    expect(scoreIsSelfMirroring({ player1: [3], player2: [3] })).toBe(true);
    expect(scoreIsSelfMirroring({ player1: [6, 3], player2: [6, 3] })).toBe(true);
    expect(scoreIsSelfMirroring({ player1: [6, 4], player2: [4, 6] })).toBe(false);
  });

  test('clean: the fold is self-consistent and identifies player1', () => {
    const a = analyzeResults(clean);
    const winners = resolvePointWinners(a.rallies, a.players);
    const key = keysFor(a.rallies);

    const probe = reconcile({
      winners,
      labels: a.players,
      score: { player1: [], player2: [] },
      gameKeyOf: (id) => key.get(id)?.game ?? '',
      setKeyOf: (id) => key.get(id)?.set ?? '',
    });

    // Feeding the fold its own per-set counts must reconcile, and must name
    // player1 without ever comparing a string to matches.player1_name.
    const [p1, p2] = a.players;
    const again = reconcile({
      winners,
      labels: a.players,
      score: {
        player1: probe.foldedSets.map((s) => s[p1] ?? 0),
        player2: probe.foldedSets.map((s) => s[p2] ?? 0),
      },
      gameKeyOf: (id) => key.get(id)?.game ?? '',
      setKeyOf: (id) => key.get(id)?.set ?? '',
    });

    expect(again.ok).toBe(true);
    expect(again.player1Label).toBe(p1);
    expect(again.games.length).toBeGreaterThan(10);
    // Only the final rally may be unresolved — it has no successor to compare
    // against and is settled by the fold landing on the entered score.
    expect(again.unresolvedPoints).toEqual([a.rallies[a.rallies.length - 1].rallyId]);
  });

  test('degraded: refused, because five points resolve no winner at all', () => {
    // This is the designed outcome, not a gap. The payload's tiebreak
    // fragments into pseudo-games and its warm-up rally carries a "nan-nan"
    // set score, so five points mid-match cannot be attributed. Publishing a
    // transcript with five unknown points would put five specific false claims
    // on the timeline with nothing marking which.
    const a = analyzeResults(degraded);
    const winners = resolvePointWinners(a.rallies, a.players);
    const key = keysFor(a.rallies);
    const out = reconcile({
      winners,
      labels: a.players,
      score: { player1: [10, 6, 5], player2: [6, 3, 2] },
      gameKeyOf: (id) => key.get(id)?.game ?? '',
      setKeyOf: (id) => key.get(id)?.set ?? '',
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/resolved no winner/);
    expect(out.unresolvedPoints.length).toBeGreaterThan(1);
  });

  test('a fold that misses the entered score is marked unreconciled, never ok', () => {
    // Spec §4.4 wanted "off by one game" to grade medium and publish. These
    // rows are the point timeline and the video seek targets, so a wrong point
    // is a false claim on screen, not a rounding error.
    //
    // Under ACCEPT_UNRECONCILED_FOLD (2026-09-02) the rows are written anyway,
    // but `ok` MUST stay false and the reason MUST survive: an accepted
    // transcript is not a verified one, and the publish log says which.
    const a = analyzeResults(clean);
    const winners = resolvePointWinners(a.rallies, a.players);
    const out = reconcile({
      winners,
      labels: a.players,
      score: { player1: [6, 4], player2: [4, 6] },
      gameKeyOf: () => 'g',
      setKeyOf: () => 's',
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/does not match the entered score/);
    // No geometry was passed, so only distance could name player1 — and a
    // constant game key folds the whole match into ONE game, which sits
    // exactly as far from [6,4]/[4,6] under either mapping. A tie names
    // nobody, bypass or not: this stays a refusal rather than a coin flip.
    expect(out.player1Label).toBeNull();
    expect(out.player1Source).toBeNull();
  });

  test('bypass: geometry plus the wizard input names player1 when the fold cannot', () => {
    test.skip(!ACCEPT_UNRECONCILED_FOLD, 'Gate 1 is restored');
    const a = analyzeResults(clean);
    const winners = resolvePointWinners(a.rallies, a.players);
    const key = keysFor(a.rallies);
    const [first, second] = a.players;
    const out = reconcile({
      winners,
      labels: a.players,
      score: { player1: [6, 4], player2: [4, 6] },
      gameKeyOf: (id) => key.get(id)?.game ?? '',
      setKeyOf: (id) => key.get(id)?.set ?? '',
      geometryTopLabel: second,
      initialTopIsPlayer1: false,
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/does not match the entered score/);
    // Geometry outranks distance: the top player was `second`, and the
    // wizard said the top player is NOT player1, so player1 is `first`.
    expect(out.player1Label).toBe(first);
    expect(out.player1Source).toBe('geometry');
    // Rows can be written from this: every point is settled.
    expect(out.settledWinners).toHaveLength(winners.length);
    expect(out.games.length).toBeGreaterThan(10);
  });

  test('bypass: a transcript is still built from an unreconciled fold', () => {
    test.skip(!ACCEPT_UNRECONCILED_FOLD, 'Gate 1 is restored');
    const a = analyzeResults(clean);
    const t = buildTranscript({
      rallies: a.rallies,
      labels: a.players,
      // Deliberately wrong: nothing about the clean fixture folds to this.
      score: { player1: [6, 0, 6], player2: [0, 6, 0] },
      initialTopIsPlayer1: null,
    });
    expect(t.ok).toBe(true);
    expect(t.points).toHaveLength(a.rallies.length);
    expect(t.reconciliation.ok).toBe(false);
    expect(t.reconciliation.player1Label).not.toBeNull();
    expect(['geometry', 'distance']).toContain(t.reconciliation.player1Source);
    // The reason travels with the transcript so the publish log can say why.
    expect(t.reason).toMatch(/does not match the entered score/);
  });
});

test.describe('transcript', () => {
  test('refuses without an entered score', () => {
    const a = analyzeResults(clean);
    const t = buildTranscript({
      rallies: a.rallies,
      labels: a.players,
      score: null,
      initialTopIsPlayer1: null,
    });
    // matches.score is the only automatic correctness check that exists.
    expect(t.ok).toBe(false);
    expect(t.points).toHaveLength(0);
    expect(t.reason).toMatch(/score is required/);
  });

  test('builds rows whose numbering and coordinates match the database frame', () => {
    const a = analyzeResults(clean);
    const winners = resolvePointWinners(a.rallies, a.players);
    const key = keysFor(a.rallies);
    const probe = reconcile({
      winners, labels: a.players, score: { player1: [], player2: [] },
      gameKeyOf: (id) => key.get(id)?.game ?? '', setKeyOf: (id) => key.get(id)?.set ?? '',
    });
    const [p1, p2] = a.players;
    const t = buildTranscript({
      rallies: a.rallies,
      labels: a.players,
      score: {
        player1: probe.foldedSets.map((s) => s[p1] ?? 0),
        player2: probe.foldedSets.map((s) => s[p2] ?? 0),
      },
      initialTopIsPlayer1: null,
    });
    expect(t.ok).toBe(true);
    expect(t.points.length).toBe(a.rallies.length);

    for (const point of t.points) {
      expect(point.point_number).toBeGreaterThan(0);
      expect(point.set_number).toBeGreaterThan(0);
      expect(point.game_number).toBeGreaterThan(0);
      expect(typeof point.won_by_player1).toBe('boolean');
      expect(typeof point.server_is_player1).toBe('boolean');

      // Exactly one shot at 1 per point, or the return join fans out.
      const atOne = point.shots.filter((s) => s.shot_number === 1);
      expect(atOne).toHaveLength(1);
      expect(atOne[0].shot_type).toMatch(/Serve/);

      for (const shot of point.shots) {
        if (shot.zone !== null) {
          expect(['T', 'Body', 'Wide', 'Crosscourt', 'Middle', 'Down the Line'])
            .toContain(shot.zone);
        }
        if (shot.result !== null) expect(['In', 'Out', 'Net']).toContain(shot.result);
        // Court frame: y runs 0..23.77 with the net at 11.885, so a landing
        // sits near that range rather than in 0..1.
        if (shot.landing_y !== null) {
          expect(shot.landing_y).toBeGreaterThan(-6);
          expect(shot.landing_y).toBeLessThan(30);
        }
      }
    }

    // point_number is 1..n with no gaps; game_number is global, not per-set.
    expect(t.points.map((p) => p.point_number)).toEqual(
      t.points.map((_, i) => i + 1)
    );
    const games = new Set(t.points.map((p) => p.game_number));
    expect(games.size).toBe(Math.max(...games));
  });

  test('flags record the contradictions rather than hiding them', () => {
    // Uses the clean fixture because the degraded one is refused outright, and
    // a refused match produces no rows to carry flags.
    const a = analyzeResults(clean);
    const winners = resolvePointWinners(a.rallies, a.players);
    const key = keysFor(a.rallies);
    const probe = reconcile({
      winners, labels: a.players, score: { player1: [], player2: [] },
      gameKeyOf: (id) => key.get(id)?.game ?? '', setKeyOf: (id) => key.get(id)?.set ?? '',
    });
    const [p1, p2] = a.players;
    const t = buildTranscript({
      rallies: a.rallies, labels: a.players,
      score: {
        player1: probe.foldedSets.map((s) => s[p1] ?? 0),
        player2: probe.foldedSets.map((s) => s[p2] ?? 0),
      },
      initialTopIsPlayer1: null,
    });
    expect(t.ok).toBe(true);

    const shotFlags = t.points.flatMap((p) => p.shots).flatMap((s) => s.flags);
    const pointFlags = t.points.flatMap((p) => p.flags);

    // The degraded payload's defining defect: balls called out that play
    // continued past. It must be recorded, not silently corrected away.
    expect(shotFlags.filter((f) => f === SHOT_FLAGS.OUT_BALL_RALLY_CONTINUED).length)
      .toBeGreaterThan(100);
    expect(shotFlags).toContain(SHOT_FLAGS.NET_HIT_CONTRADICTS_HEIGHT);
    expect(shotFlags).toContain(SHOT_FLAGS.GEOMETRY_DISCARDED);
    expect(pointFlags).toContain(POINT_FLAGS.SAME_PLAYER_CONSECUTIVE);
    expect(pointFlags).toContain(POINT_FLAGS.WINNER_DISPUTED);
  });
});

test.describe('pressure points', () => {
  test('a break point is the returner one point from the game', () => {
    // Was previously never set, so every derived row defaulted to false and a
    // 6-4 6-4 match — which contains at least two breaks of serve — reported
    // zero break points. That is a fabricated statistic, not a missing one.
    const serve = stroke({ strokeType: 'serve', strokeSide: 'overhead' });
    const at = (score: string) =>
      rally([{ ...serve, predPointScore: score }, stroke({ playerLabel: 'B' })]);
    const base = {
      labels: ['A', 'B'],
      gamesThisSet: { A: 0, B: 0 },
      setsWon: { A: 0, B: 0 },
      adScoring: true,
      bestOf: 3,
    };

    // Server-relative: "30-40" is server 30, returner 40.
    expect(pressureFor({ rally: at('30-40'), ...base }).isBreakPoint).toBe(true);
    // 40-30 is the server's game point, not a break point.
    expect(pressureFor({ rally: at('40-30'), ...base }).isBreakPoint).toBe(false);
    // Under ad scoring 40-40 is deuce — neither side wins on this point.
    expect(pressureFor({ rally: at('40-40'), ...base }).isBreakPoint).toBe(false);
  });

  test('under no-ad, 40-40 IS a break point', () => {
    // The deciding point is the most pressured point in tennis. Defaulting to
    // ad scoring would silently drop it, which is the same class of error as
    // the fabricated zero, one level subtler.
    const r = rally([
      stroke({ strokeType: 'serve', strokeSide: 'overhead', predPointScore: '40-40' }),
      stroke({ playerLabel: 'B' }),
    ]);
    const base = {
      rally: r,
      labels: ['A', 'B'],
      gamesThisSet: { A: 0, B: 0 },
      setsWon: { A: 0, B: 0 },
      bestOf: 3,
    };
    expect(pressureFor({ ...base, adScoring: false }).isBreakPoint).toBe(true);
    expect(pressureFor({ ...base, adScoring: true }).isBreakPoint).toBe(false);
  });

  test('set point needs the game to close the set, match point the match', () => {
    const r = rally([
      stroke({ strokeType: 'serve', strokeSide: 'overhead', predPointScore: '40-30' }),
      stroke({ playerLabel: 'B' }),
    ]);
    const mk = (games: Record<string, number>, sets: Record<string, number>) =>
      pressureFor({ rally: r, labels: ['A', 'B'], gamesThisSet: games, setsWon: sets, adScoring: true, bestOf: 3 });

    // Serving at 5-4, 40-30 — one point from the set.
    expect(mk({ A: 5, B: 4 }, { A: 0, B: 0 }).isSetPoint).toBe(true);
    // Same point at 3-4 wins the game, not the set.
    expect(mk({ A: 3, B: 4 }, { A: 0, B: 0 }).isSetPoint).toBe(false);
    // 5-5 would only reach 6-5, which does not close a set.
    expect(mk({ A: 5, B: 5 }, { A: 0, B: 0 }).isSetPoint).toBe(false);
    // With a set already won, best-of-3 makes it match point too.
    expect(mk({ A: 5, B: 4 }, { A: 1, B: 0 }).isMatchPoint).toBe(true);
    expect(mk({ A: 5, B: 4 }, { A: 0, B: 0 }).isMatchPoint).toBe(false);
  });
});

/**
 * The trailing point, on a hand-written fold.
 *
 * The fixture tests above cannot catch this: they feed the fold its own output
 * back as the entered score, so a mis-credited final game reconciles against
 * its own mistake. `clean-match.json` also happens to end 40-0, which is the
 * one shape where carrying the previous winner forward gives the right answer.
 *
 * So this builds the winners array directly. Nine points, two games, and a
 * final game that runs 40-0 → 40-15 → game: the last two points go to
 * DIFFERENT players, which is exactly what the old fold got wrong.
 */
test.describe('reconcile: the final point', () => {
  const LABELS = ['A', 'B'];

  // Game 1: A holds to love. Game 2: A leads 40-0, B takes one, A closes it —
  // and that closing point is the one `resolveWinner` cannot see, because it
  // has no successor rally to compare against.
  const WINNERS: PointWinner[] = [
    { rallyId: 1, server: 'A', winner: 'A', via: 'ladder' },
    { rallyId: 2, server: 'A', winner: 'A', via: 'ladder' },
    { rallyId: 3, server: 'A', winner: 'A', via: 'ladder' },
    { rallyId: 4, server: 'A', winner: 'A', via: 'game' },
    { rallyId: 5, server: 'B', winner: 'A', via: 'ladder' },
    { rallyId: 6, server: 'B', winner: 'A', via: 'ladder' },
    { rallyId: 7, server: 'B', winner: 'A', via: 'ladder' },
    { rallyId: 8, server: 'B', winner: 'B', via: 'ladder' },
    { rallyId: 9, server: 'B', winner: null, via: null },
  ];

  const gameKeyOf = (id: number) => (id <= 4 ? 'g1' : 'g2');
  const setKeyOf = () => 's1';

  const run = (score: { player1: number[]; player2: number[] }) =>
    reconcile({ winners: WINNERS, labels: LABELS, score, gameKeyOf, setKeyOf });

  test('is settled from the entered score, not carried over from the previous point', () => {
    // A won both games. Carrying `lastWinnerInGame` forward across the
    // unresolved point credited game 2 to B, folded 1-1, and refused a match
    // that was entirely correct.
    const rec = run({ player1: [2], player2: [0] });

    expect(rec.reason).toBe(null);
    expect(rec.ok).toBe(true);
    expect(rec.player1Label).toBe('A');
    expect(rec.foldedSets).toEqual([{ A: 2 }]);
    expect(rec.games.map((g) => g.winner)).toEqual(['A', 'A']);
  });

  test('settledWinners names the final point, so it is not written as player2', () => {
    const rec = run({ player1: [2], player2: [0] });

    // `won_by_player1: winner === player1` reads false for null, so an
    // unsettled final point was recorded as won by player2 in every match.
    expect(rec.settledWinners).toHaveLength(WINNERS.length);
    expect(rec.settledWinners[8].winner).toBe('A');
    // The raw diagnostic still says the vendor stream could not resolve it.
    expect(rec.unresolvedPoints).toEqual([9]);
  });

  test('settling tries both labels but never calls a score neither reproduces ok', () => {
    // The point is that this reads the answer off the entered score, not that
    // it accepts whatever it is given. There are two games here, so no
    // assignment of one point can fold them into three.
    const rec = run({ player1: [2], player2: [1] });

    expect(rec.ok).toBe(false);
    expect(rec.reason).toContain('does not match the entered score');
    if (ACCEPT_UNRECONCILED_FOLD) {
      // Bypass: A=[2] vs entered [2]/[1] is distance 1; B as player1 is 3.
      expect(rec.player1Label).toBe('A');
      expect(rec.player1Source).toBe('distance');
    }
  });

  test('bypass: a tie on distance with no geometry is still refused', () => {
    test.skip(!ACCEPT_UNRECONCILED_FOLD, 'Gate 1 is restored');
    // Two resolved games, one each, against an entered 3-3: both mappings are
    // equally wrong, geometry is absent, so there is nothing to name player1
    // from. Writing rows here would be a coin flip on which human owns every
    // statistic, which is the one thing the bypass may not do.
    const split = WINNERS.map((w, i) =>
      i >= 5 ? { ...w, winner: 'B', via: 'game' as const } : w
    );
    const rec = reconcile({
      winners: split,
      labels: LABELS,
      score: { player1: [3], player2: [3] },
      gameKeyOf,
      setKeyOf,
    });
    expect(rec.ok).toBe(false);
    expect(rec.player1Label).toBeNull();
    expect(rec.player1Source).toBeNull();
  });

  test('1-1 is reachable, and still refused — as a mirror, not as a mismatch', () => {
    // 1-1 is what the OLD fold produced for these nine points, and it IS
    // reproducible: credit the trailing point to B. That is precisely why
    // settling cannot be allowed to stop at "some assignment matches" — a
    // score equal to its own mirror satisfies both label mappings and so
    // identifies nobody. The refusal has to come from the mirror check, and
    // the reason has to say so, or a coach reads "we disagree with your score"
    // for a score nobody disagrees with.
    const rec = run({ player1: [1], player2: [1] });

    expect(rec.ok).toBe(false);
    expect(rec.reason).toContain('its own mirror');
  });

  test('a fully resolved match is unaffected', () => {
    const resolved = WINNERS.map((w, i) =>
      i === WINNERS.length - 1 ? { ...w, winner: 'A', via: 'game' as const } : w
    );
    const rec = reconcile({
      winners: resolved,
      labels: LABELS,
      score: { player1: [2], player2: [0] },
      gameKeyOf,
      setKeyOf,
    });

    expect(rec.ok).toBe(true);
    expect(rec.unresolvedPoints).toEqual([]);
    expect(rec.settledWinners).toEqual(resolved);
  });
});
