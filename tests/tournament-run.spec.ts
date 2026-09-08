import { expect, test } from '@playwright/test';

import { ROUND_ORDER, roundLongLabel } from '@/lib/schedule/format';
import { groupByDraw, runFinish } from '@/lib/schedule/tournament-run';
import type { EntryMatch, EventEntry } from '@/lib/schedule/types';

/**
 * `roundLongLabel` and `runFinish` — the two sentences the tournament page
 * writes about a run, pinned as pure functions.
 *
 * Hand-built entries rather than a loader, the same shape
 * `tests/opponent-meetings.spec.ts` uses, so a drift in `EventEntry` fails at
 * compile time rather than at runtime. Nothing here renders: the point of
 * moving these out of `tournament-detail.tsx` was that a run's shape and its
 * one-line summary can be checked without a browser.
 */

function match(id: string, round: string | null, winner: 'us' | 'them' | null): EntryMatch {
  const won = [6, 6];
  const lost = [3, 4];
  return {
    id,
    round,
    status: 'imported',
    score:
      winner === null
        ? null
        : winner === 'us'
          ? { player1: won, player2: lost }
          : { player1: lost, player2: won },
    opponentLabels: ['Rival Player'],
    hasVideo: false,
  };
}

function entry(matches: EntryMatch[], draw: string | null = 'Main draw'): EventEntry {
  return {
    id: 'e-1',
    eventId: 'ev-1',
    discipline: 'singles',
    slot: null,
    position: 1,
    draw,
    seed: 3,
    playerUserIds: [],
    playerLabels: ['Dana Brooks'],
    opponentLabels: ['Rival Player'],
    opponentSchool: 'Ridgeline',
    opponentProgramId: null,
    forfeit: null,
    matches,
  };
}

test.describe('roundLongLabel', () => {
  /**
   * Every code in `ROUND_ORDER`, spelled out. The article is part of the label
   * for a main-draw round and absent for qualifying and consolation, which is
   * the whole reason the mapping is a table rather than a template.
   */
  const EXPECTED: Record<string, string> = {
    Q1: 'qualifying round 1',
    Q2: 'qualifying round 2',
    Q3: 'qualifying round 3',
    R128: 'the round of 128',
    R64: 'the round of 64',
    R32: 'the round of 32',
    R16: 'the round of 16',
    QF: 'the quarter-final',
    SF: 'the semi-final',
    F: 'the final',
    C1: 'consolation round 1',
    C2: 'consolation round 2',
    C3: 'consolation round 3',
  };

  test('maps every round in ROUND_ORDER', () => {
    for (const code of ROUND_ORDER) {
      expect(roundLongLabel(code)).toBe(EXPECTED[code]);
    }
    // The record and the ladder describe the same set — a round added to one
    // and not the other is a run that prints a bare code mid-sentence.
    expect(Object.keys(EXPECTED).sort()).toEqual([...ROUND_ORDER].sort());
  });

  test('is case-insensitive and passes an unknown code through', () => {
    expect(roundLongLabel('qf')).toBe('the quarter-final');
    expect(roundLongLabel('R7')).toBe('R7');
  });
});

test.describe('runFinish', () => {
  test('is null before anything is played', () => {
    expect(runFinish(entry([]))).toBeNull();
  });

  test('"out in …" when the furthest round was lost', () => {
    expect(
      runFinish(entry([match('m1', 'R16', 'us'), match('m2', 'QF', 'them')]))
    ).toBe('out in the quarter-final');
  });

  test('"won the final" when F was won', () => {
    expect(
      runFinish(entry([match('m1', 'SF', 'us'), match('m2', 'F', 'us')]))
    ).toBe('won the final');
  });

  test('"through …" when the furthest round was won and is not the final', () => {
    expect(
      runFinish(entry([match('m1', 'R32', 'us'), match('m2', 'R16', 'us')]))
    ).toBe('through the round of 16');
  });

  /**
   * The furthest round decides, not the array's last row. `matches` arrives in
   * whatever order Postgres returned, and reading the tail reported a qualifier
   * as out in Q2 after they had come through it.
   */
  test('reads the ladder, not the array order', () => {
    expect(
      runFinish(entry([match('m1', 'R32', 'us'), match('m2', 'Q2', 'us')], 'Qualifying'))
    ).toBe('through the round of 32');
  });
});

test.describe('groupByDraw', () => {
  test('buckets a run by the draw each ROUND belongs to', () => {
    const run = entry(
      [match('m1', 'Q1', 'us'), match('m2', 'Q2', 'us'), match('m3', 'R32', 'them')],
      'Qualifying'
    );
    expect(groupByDraw(run).map((segment) => segment.draw)).toEqual([
      'Qualifying',
      'Main draw',
    ]);
  });

  test('a run inside one draw is one segment', () => {
    const run = entry([match('m1', 'R32', 'us'), match('m2', 'R16', 'them')]);
    const segments = groupByDraw(run);
    expect(segments).toHaveLength(1);
    expect(segments[0].matches).toHaveLength(2);
  });

  test('falls back to the entry draw when the round says nothing', () => {
    const run = entry([match('m1', null, 'us')], 'Flight B');
    expect(groupByDraw(run).map((segment) => segment.draw)).toEqual(['Flight B']);
  });
});
