import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  analyzeResults,
  buildTranscript,
  classifyPoint,
  lastServeIndex,
  reconcile,
  resolvePointWinners,
  scoreIsSelfMirroring,
  shotNumber,
  shotResult,
  POINT_FLAGS,
  SHOT_FLAGS,
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

  test('a fold that misses the entered score is refused outright', () => {
    // Spec §4.4 wanted "off by one game" to grade medium and publish. These
    // rows are the point timeline and the video seek targets, so a wrong point
    // is a false claim on screen, not a rounding error.
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
