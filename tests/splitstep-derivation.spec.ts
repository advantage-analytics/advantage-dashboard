import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  analyzeResults,
  BASELINE_M,
  DOUBLES_HALF_WIDTH_M,
  kmhToMph,
  MAX_PLAUSIBLE_X_M,
  MAX_PLAUSIBLE_Y_M,
  metersToNormalized,
  parseStrokes,
  SERVICE_LINE_M,
  SINGLES_HALF_WIDTH_M,
  serveShotType,
} from '@/lib/services/splitstep/derivation';

/**
 * Fixture-driven tests for the SplitStep derivation library.
 *
 * The two fixtures are real full-match results from the vendor and they are
 * deliberately different in quality: `clean` tracked well, `degraded` did not.
 * Several assertions below pin the exact gap between them, because that gap is
 * the thing the quality scorer exists to detect.
 */

const FIXTURES = path.join(__dirname, 'fixtures', 'splitstep');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

const clean = loadFixture('quan-friend-2025-09-28.json');
const degraded = loadFixture('rudyquan-usc-2025-05-08.json');

test.describe('court conversion', () => {
  test('maps the four court landmarks exactly', () => {
    expect(metersToNormalized(-DOUBLES_HALF_WIDTH_M, 0).x).toBeCloseTo(0, 10);
    expect(metersToNormalized(DOUBLES_HALF_WIDTH_M, 0).x).toBeCloseTo(1, 10);
    expect(metersToNormalized(0, -BASELINE_M).y).toBeCloseTo(0, 10);
    expect(metersToNormalized(0, BASELINE_M).y).toBeCloseTo(1, 10);

    const centre = metersToNormalized(0, 0);
    expect(centre.x).toBeCloseTo(0.5, 10);
    expect(centre.y).toBeCloseTo(0.5, 10);
  });

  test('places the singles sideline and service line where they belong', () => {
    // Singles sideline sits inside the doubles court by the alley width.
    expect(metersToNormalized(SINGLES_HALF_WIDTH_M, 0).x).toBeCloseTo(
      (SINGLES_HALF_WIDTH_M + DOUBLES_HALF_WIDTH_M) / (2 * DOUBLES_HALF_WIDTH_M),
      10
    );
    // Service line is 6.4 of 11.885 metres from the net toward the baseline.
    expect(metersToNormalized(0, SERVICE_LINE_M).y).toBeCloseTo(
      0.5 + SERVICE_LINE_M / (2 * BASELINE_M),
      10
    );
  });

  test('does not clamp out-of-court positions', () => {
    // An out ball must normalize outside 0-1, or a placement chart would
    // silently redraw it as landing on the line.
    expect(metersToNormalized(0, BASELINE_M + 1).y).toBeGreaterThan(1);
    expect(metersToNormalized(-DOUBLES_HALF_WIDTH_M - 1, 0).x).toBeLessThan(0);
  });

  test('converts km/h to mph', () => {
    expect(kmhToMph(160.9344)).toBeCloseTo(100, 3);
  });
});

test.describe('parse layer', () => {
  for (const [name, fixture] of [
    ['clean', clean],
    ['degraded', degraded],
  ] as const) {
    test(`${name}: no sentinel or impossible value survives`, () => {
      const { strokes } = parseStrokes(fixture);
      expect(strokes.length).toBeGreaterThan(1000);

      for (const stroke of strokes) {
        const numbers = [
          stroke.bounceX,
          stroke.bounceY,
          stroke.playerX,
          stroke.playerY,
          stroke.opponentX,
          stroke.opponentY,
          stroke.speedKmh,
          stroke.heightAtNetM,
          stroke.initialHeightM,
          stroke.bounceScore,
          stroke.lineConfidence,
        ];
        for (const value of numbers) {
          if (value === null) continue;
          expect(Number.isFinite(value)).toBe(true);
          expect(Math.abs(value - -9999)).toBeGreaterThanOrEqual(1);
        }

        // Ground-truth columns are "None" in 100% of vendor rows; nothing
        // downstream should ever see that string.
        for (const s of [
          stroke.predPointScore,
          stroke.predGameScore,
          stroke.predSetScore,
          stroke.spinType,
        ]) {
          expect(s).not.toBe('None');
        }

        // Surviving coordinates must be inside the playing enclosure.
        for (const [x, y] of [
          [stroke.bounceX, stroke.bounceY],
          [stroke.playerX, stroke.playerY],
          [stroke.opponentX, stroke.opponentY],
        ] as const) {
          if (x === null || y === null) continue;
          expect(Math.abs(x)).toBeLessThanOrEqual(MAX_PLAUSIBLE_X_M);
          expect(Math.abs(y)).toBeLessThanOrEqual(MAX_PLAUSIBLE_Y_M);
        }
      }
    });
  }

  test('the degraded fixture loses far more bounces than the clean one', () => {
    const nullRate = (fixture: unknown) => {
      const { strokes } = parseStrokes(fixture);
      return strokes.filter((s) => s.bounceX === null).length / strokes.length;
    };
    // ~4% versus ~23%. If these converge, either the vendor fixed something or
    // the enclosure guard stopped firing.
    expect(nullRate(clean)).toBeLessThan(0.08);
    expect(nullRate(degraded)).toBeGreaterThan(0.18);
  });

  test('shifts timestamps into original-video time', () => {
    const offset = 137.5;
    const base = parseStrokes(clean).strokes;
    const shifted = parseStrokes(clean, { startTimeSeconds: offset }).strokes;

    expect(shifted).toHaveLength(base.length);
    for (let i = 0; i < base.length; i += 1) {
      expect(shifted[i].videoTime).toBeCloseTo(base[i].videoTime + offset, 6);
    }
    // The first serve of the match should now sit at trim start + its offset,
    // which is what the video player seeks against.
    expect(shifted[0].videoTime).toBeGreaterThan(offset);
  });

  test('rejects a payload that is not an array', () => {
    expect(() => parseStrokes({ strokes: [] })).toThrow(/must be a JSON array/);
  });
});

test.describe('rally grouping', () => {
  test('clean fixture: 156 rallies, all numbered 1..n, all opening on a serve', () => {
    const result = analyzeResults(clean);
    expect(result.rallies).toHaveLength(156);
    expect(result.malformedNumbering).toEqual([]);
    expect(result.missingOpeningServe).toEqual([]);
    expect(result.players).toEqual(['Quan', 'Friend']);
    expect(result.droppedStrokes).toBe(0);
  });

  test('degraded fixture: 168 rallies, one pre-match fragment without a serve', () => {
    const result = analyzeResults(degraded);
    expect(result.rallies).toHaveLength(168);
    expect(result.malformedNumbering).toEqual([]);
    // Rally 0 is warm-up play before the first serve — it also carries the
    // "nan-nan" set score.
    expect(result.missingOpeningServe).toEqual([0]);
    expect(result.players).toHaveLength(2);
  });

  test('stroke numbers within a rally are contiguous from 1', () => {
    for (const fixture of [clean, degraded]) {
      for (const rally of analyzeResults(fixture).rallies) {
        rally.strokes.forEach((stroke, index) => {
          expect(stroke.strokeNumber).toBe(index + 1);
        });
      }
    }
  });
});

test.describe('serve bracket', () => {
  test('serve ordinal maps to our shot_type vocabulary', () => {
    expect(serveShotType(0)).toBe('First Serve');
    expect(serveShotType(1)).toBe('Second Serve');
  });

  test('clean fixture brackets first-serve percentage at 70% / 52%', () => {
    const { serves } = analyzeResults(clean);
    expect(serves.byRallyStructure.firstServePercentage).toBeCloseTo(0.699, 2);
    expect(serves.byInFlag.firstServePercentage).toBeCloseTo(0.519, 2);
    expect(serves.firstServeSpread).toBeCloseTo(0.179, 2);
  });

  test('degraded fixture brackets first-serve percentage at 67% / 41%', () => {
    const { serves } = analyzeResults(degraded);
    expect(serves.byRallyStructure.firstServePercentage).toBeCloseTo(0.671, 2);
    expect(serves.byInFlag.firstServePercentage).toBeCloseTo(0.413, 2);
    expect(serves.firstServeSpread).toBeCloseTo(0.257, 2);
  });

  test('the two double-fault readings disagree by several times over', () => {
    for (const fixture of [clean, degraded]) {
      const { serves } = analyzeResults(fixture);
      // Structure is the conservative count, the flag the inflated one. If
      // this inverts, the in-flag interpretation has changed.
      expect(serves.byInFlag.doubleFaults).toBeGreaterThan(
        serves.byRallyStructure.doubleFaults * 3
      );
    }
  });

  test('serve court sides split roughly evenly', () => {
    for (const fixture of [clean, degraded]) {
      const { serveSides, rallies } = analyzeResults(fixture);
      const known = serveSides.deuce + serveSides.ad;
      expect(known).toBeGreaterThan(rallies.length * 0.9);
      // Alternating service courts means neither side should dominate.
      expect(Math.abs(serveSides.deuce - serveSides.ad)).toBeLessThan(known * 0.15);
    }
  });

  test('ace candidates are far too few to populate a real ace statistic', () => {
    // Existing SwingVision data carries 67 aces and 486 service winners. The
    // vendor stream cannot separate the two, and barely finds either.
    expect(analyzeResults(clean).aceCandidates).toBeLessThan(10);
    expect(analyzeResults(degraded).aceCandidates).toBeLessThan(10);
  });
});

test.describe('quality scorer', () => {
  test('grades the clean fixture medium and the degraded one low', () => {
    expect(analyzeResults(clean).quality.grade).toBe('medium');
    expect(analyzeResults(degraded).quality.grade).toBe('low');
  });

  test('clean fixture has no failing check', () => {
    const { quality } = analyzeResults(clean);
    expect(quality.failures).toEqual([]);
    expect(quality.warnings.length).toBeGreaterThan(0);
  });

  test('degraded fixture fails on tracking, not just on scoring', () => {
    const { quality } = analyzeResults(degraded);
    expect(quality.failures).toContain('unusable_bounce');
    expect(quality.failures).toContain('serve_net_hit_mid_rally');
    expect(quality.failures).toContain('illegal_same_player_sequence');
    expect(quality.failures).toContain('unusable_player_position');
  });

  test('clean fixture score stream is internally consistent', () => {
    const { quality } = analyzeResults(clean);
    const byId = new Map(quality.checks.map((c) => [c.id, c]));
    // Both score checks are clean once the server-perspective flip is
    // accounted for — this is why the score stream, not the stroke flags,
    // anchors the deferred point-winner engine.
    expect(byId.get('game_transition_valid')?.value).toBe(1);
    expect(byId.get('point_transition_clean')?.value).toBe(1);
  });

  test('degraded fixture score stream breaks at the tiebreak', () => {
    const { quality } = analyzeResults(degraded);
    const byId = new Map(quality.checks.map((c) => [c.id, c]));
    expect(byId.get('game_transition_valid')!.value).toBeLessThan(0.95);
    expect(byId.get('game_transition_valid')!.value).toBeGreaterThan(0.8);
  });

  test('every check reports its own numerator and denominator', () => {
    const { quality } = analyzeResults(clean);
    expect(quality.checks).toHaveLength(7);
    for (const c of quality.checks) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.total).toBeGreaterThan(0);
      expect(['pass', 'warn', 'fail']).toContain(c.verdict);
    }
  });
});
