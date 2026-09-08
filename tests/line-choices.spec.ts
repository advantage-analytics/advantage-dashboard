import { expect, test } from '@playwright/test';

import { presetFor, lineupChoices } from '@/lib/schedule/line-choices';
import type { EntryMatch, EventEntry, ProgramEvent } from '@/lib/schedule/types';

/**
 * `presetFor` and `lineupChoices`, moved out of `team/upload/page.tsx`
 * (T4). Pure logic over the schedule's own shapes — no Supabase, no
 * rendering — so these fixtures build `ProgramEvent`/`EventEntry` by hand,
 * the same way `tests/weekend-dual-reads.spec.ts` does.
 */

const EVENT: ProgramEvent = {
  id: 'e-1',
  programId: 'p-1',
  kind: 'dual',
  name: 'Rival State',
  startsOn: '2026-03-21',
  endsOn: '2026-03-21',
  site: 'home',
  surface: 'hard',
  host: null,
  format: { bestOf: 3, adScoring: true },
};

const PROGRAMS = new Map<string, { key: string; school: string }>([
  ['rival-program', { key: 'rival-state', school: 'Rival State' }],
]);

function match(id: string, hasVideo = false): EntryMatch {
  return {
    id,
    round: null,
    status: 'imported',
    score: { player1: [6, 6], player2: [3, 4] },
    opponentLabels: ['Rival Player'],
    hasVideo,
  };
}

function entry(overrides: Partial<EventEntry> & { position: number }): EventEntry {
  return {
    id: `entry-${overrides.position}`,
    eventId: EVENT.id,
    discipline: 'singles',
    slot: `S${overrides.position + 1}`,
    draw: null,
    seed: null,
    playerUserIds: ['player-user'],
    playerLabels: ['Ana Vasquez'],
    opponentLabels: ['Rival Player'],
    opponentSchool: null,
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

test.describe('lineupChoices · one row per slot', () => {
  test('an entry with no player is unset', () => {
    const noPlayer = entry({ position: 0, playerLabels: [] });
    const [choice] = lineupChoices(EVENT, [noPlayer], PROGRAMS);
    expect(choice).toMatchObject({ state: 'unset', preset: null });
  });

  test('a forfeited entry is unset even with a player', () => {
    const forfeited = entry({ position: 0, forfeit: 'ours' });
    const [choice] = lineupChoices(EVENT, [forfeited], PROGRAMS);
    expect(choice).toMatchObject({ state: 'unset', preset: null });
  });

  test('a scored line without video is a result', () => {
    const scored = entry({ position: 0, matches: [match('m-1', false)] });
    const [choice] = lineupChoices(EVENT, [scored], PROGRAMS);
    expect(choice.state).toBe('result');
    expect(choice.preset).not.toBeNull();
  });

  test('a line with hasVideo is video', () => {
    const filmed = entry({ position: 0, matches: [match('m-1', true)] });
    const [choice] = lineupChoices(EVENT, [filmed], PROGRAMS);
    expect(choice.state).toBe('video');
  });

  test('a doubles entry presets a null playerUserId', () => {
    const doubles = entry({
      position: 0,
      slot: 'D1',
      discipline: 'doubles',
      playerUserIds: ['player-a', 'player-b'],
      playerLabels: ['Ana Vasquez', 'Bea Cruz'],
      matches: [match('m-1', false)],
    });
    const [choice] = lineupChoices(EVENT, [doubles], PROGRAMS);
    expect(choice.preset?.playerUserId).toBeNull();
  });

  test('slots are deduped and returned in position order', () => {
    const s3 = entry({ position: 2, slot: 'S3', matches: [match('m-3', false)] });
    const s1 = entry({ position: 0, slot: 'S1', matches: [match('m-1', false)] });
    const s1Duplicate = entry({ position: 1, slot: 'S1', matches: [match('m-1b', false)] });

    const choices = lineupChoices(EVENT, [s3, s1, s1Duplicate], PROGRAMS);

    expect(choices.map((c) => c.slot)).toEqual(['S1', 'S3']);
  });
});

test.describe('presetFor · the preset one entry builds', () => {
  test('carries the event format and resolves the opponent program', () => {
    const opponent = entry({
      position: 0,
      opponentProgramId: 'rival-program',
      matches: [match('m-1', false)],
    });
    const preset = presetFor(EVENT, opponent, opponent.matches[0], PROGRAMS);

    expect(preset.bestOf).toBe(3);
    expect(preset.adScoring).toBe(true);
    expect(preset.opponentProgramKey).toBe('rival-state');
    expect(preset.opponentSchool).toBe('Rival State');
  });
});
