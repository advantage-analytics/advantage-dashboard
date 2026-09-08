import { expect, test } from '@playwright/test';

import { seedScoreForm, toRecordResultInput } from '@/lib/schedule/score-seed';
import type { EventPreset } from '@/components/dashboard/matches/new-match-wizard/types';

/**
 * `score-seed.ts` — the pure half of the score-only flow (T11).
 *
 * The assertion that matters most is the tiebreak encoding. A 7-6(5) set is
 * seven GAMES to six with five POINTS in the losing side's tiebreak cell,
 * exactly as `ScoreEntry` and `recordResult` already store it. Sending the
 * tiebreak points as the set score makes the set unreadable and the winner
 * wrong, everywhere a winner is derived from games — `matchWon`,
 * `transformDbMatch`, and the vision pipeline's set ordering. Guardrails §4.3.
 */

function preset(overrides: Partial<EventPreset> = {}): EventPreset {
  return {
    entryId: 'entry-1',
    eventId: 'event-1',
    eventName: 'Rival State',
    matchId: null,
    round: 'S1',
    playerName: 'Ana Vasquez',
    playerUserId: 'user-1',
    opponentName: 'Rival Player',
    date: '2026-03-21',
    surface: 'hard',
    bestOf: 3,
    adScoring: true,
    score: null,
    supportsVideo: true,
    eventHref: '/dashboard/team/schedule/event-1',
    site: 'home',
    eventKind: 'dual',
    opponentProgramKey: null,
    opponentSchool: null,
    ...overrides,
  };
}

test.describe('seedScoreForm', () => {
  test('a line with no score opens on bestOf-length nulls', () => {
    const state = seedScoreForm(preset({ bestOf: 3 }));

    expect(state.playerScores).toEqual([null, null, null]);
    expect(state.opponentScores).toEqual([null, null, null]);
    expect(state.playerTiebreaks).toEqual([null, null, null]);
    expect(state.opponentTiebreaks).toEqual([null, null, null]);
    expect(state.opponentName).toBe('Rival Player');
  });

  test('best-of-5 opens on five sets, not three', () => {
    expect(seedScoreForm(preset({ bestOf: 5 })).playerScores).toHaveLength(5);
  });

  test('a scored line seeds its sets and blanks its tiebreaks', () => {
    // `EventPreset.score` carries game counts and no tiebreaks at all, so a
    // seeded breaker would be a number nobody entered.
    const state = seedScoreForm(
      preset({ score: { player1: [6, 7], player2: [4, 6] } })
    );

    expect(state.playerScores).toEqual([6, 7, null]);
    expect(state.opponentScores).toEqual([4, 6, null]);
    expect(state.playerTiebreaks).toEqual([null, null, null]);
    expect(state.opponentTiebreaks).toEqual([null, null, null]);
  });

  test('a score longer than the format is not truncated', () => {
    const state = seedScoreForm(
      preset({ bestOf: 1, score: { player1: [6, 3, 7], player2: [4, 6, 5] } })
    );

    expect(state.playerScores).toEqual([6, 3, 7]);
    expect(state.opponentScores).toEqual([4, 6, 5]);
  });
});

test.describe('toRecordResultInput · games in the set cells, points in the tiebreaks', () => {
  test('a 7-6(5) set sends 7, 6, null and 5', () => {
    const input = toRecordResultInput(preset(), {
      opponentName: 'Rival Player',
      playerScores: [7, null, null],
      opponentScores: [6, null, null],
      // The set winner took the breaker 7-x, so the number belongs to the
      // side that lost it — here, the opponent.
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [5, null, null],
    });

    expect(input.ourGames).toEqual([7]);
    expect(input.theirGames).toEqual([6]);
    expect(input.ourTiebreaks).toEqual([null]);
    expect(input.theirTiebreaks).toEqual([5]);
  });

  test('only the sets that were played are sent', () => {
    const input = toRecordResultInput(preset({ bestOf: 5 }), {
      opponentName: 'Rival Player',
      playerScores: [6, 4, 6, null, null],
      opponentScores: [3, 6, 2, null, null],
      playerTiebreaks: [null, null, null, null, null],
      opponentTiebreaks: [null, null, null, null, null],
    });

    expect(input.ourGames).toEqual([6, 4, 6]);
    expect(input.theirGames).toEqual([3, 6, 2]);
    expect(input.ourTiebreaks).toHaveLength(3);
    expect(input.theirTiebreaks).toHaveLength(3);
  });

  test('a set with only the opponent scoring still counts as played', () => {
    const input = toRecordResultInput(preset(), {
      opponentName: 'Rival Player',
      playerScores: [null, null, null],
      opponentScores: [6, null, null],
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [null, null, null],
    });

    expect(input.ourGames).toEqual([0]);
    expect(input.theirGames).toEqual([6]);
  });

  test('our games go first — never the opponent’s', () => {
    const input = toRecordResultInput(preset(), {
      opponentName: 'Rival Player',
      playerScores: [6, 6, null],
      opponentScores: [1, 2, null],
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [null, null, null],
    });

    expect(input.ourGames).toEqual([6, 6]);
    expect(input.theirGames).toEqual([1, 2]);
  });
});

test.describe('toRecordResultInput · round', () => {
  test('a tournament sends the round', () => {
    const input = toRecordResultInput(
      preset({ eventKind: 'tournament', round: 'R16' }),
      seedFilled()
    );

    expect(input.round).toBe('R16');
  });

  test('a dual sends null — its slot is its round, and the entry owns it', () => {
    const input = toRecordResultInput(
      preset({ eventKind: 'dual', round: 'S1' }),
      seedFilled()
    );

    expect(input.round).toBeNull();
  });
});

test.describe('toRecordResultInput · opponent labels', () => {
  test('a doubles pair splits on the slash', () => {
    const input = toRecordResultInput(preset(), {
      ...seedFilled(),
      opponentName: 'Rival One / Rival Two',
    });

    expect(input.opponentLabels).toEqual(['Rival One', 'Rival Two']);
  });

  test('an empty name sends no labels, so the action can refuse it', () => {
    const input = toRecordResultInput(preset(), {
      ...seedFilled(),
      opponentName: '   ',
    });

    expect(input.opponentLabels).toEqual([]);
  });

  test('the entry id travels through', () => {
    expect(toRecordResultInput(preset(), seedFilled()).entryId).toBe('entry-1');
  });
});

function seedFilled() {
  return {
    opponentName: 'Rival Player',
    playerScores: [6, 6, null],
    opponentScores: [3, 4, null],
    playerTiebreaks: [null, null, null],
    opponentTiebreaks: [null, null, null],
  };
}
