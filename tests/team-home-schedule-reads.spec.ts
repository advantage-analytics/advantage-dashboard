import { expect, test } from '@playwright/test';

import { weekendDualRow } from '@/lib/data/team-home-server';
import { scheduleRowsFrom } from '@/lib/data/schedule-server';
import type { EventEntry, ProgramEvent } from '@/lib/schedule/types';

/**
 * The two questions Team Home asks of the schedule read.
 *
 * Both used to be answered by a second, narrower `program_events` query with an
 * ordering and a row limit of its own. They are now read off the one
 * `getProgramSchedule()` call the KPI strip already pays for, which is what
 * makes these two pure functions the whole of the logic — and what makes the
 * failure they guard silent rather than loud. A dual card that picks the wrong
 * week, or a KPI record built from rows counted differently from the schedule
 * page's, renders perfectly and says something untrue.
 */

const WEEK = { start: '2026-08-24', end: '2026-08-30' };

function event(
  id: string,
  kind: 'dual' | 'tournament',
  startsOn: string
): { id: string; kind: 'dual' | 'tournament'; startsOn: string } {
  return { id, kind, startsOn };
}

test.describe('weekendDualRow · which dual the sheet is about', () => {
  test('prefers the dual still to come over the one already played', () => {
    const events = [
      event('mon', 'dual', '2026-08-24'),
      event('sat', 'dual', '2026-08-29'),
    ];
    expect(weekendDualRow(events, WEEK, '2026-08-26')?.id).toBe('sat');
  });

  test('falls back to the last one played once the week has no dual left', () => {
    const events = [
      event('tue', 'dual', '2026-08-25'),
      event('thu', 'dual', '2026-08-27'),
    ];
    // Sunday: both are behind us, and the later one is the weekend's story.
    expect(weekendDualRow(events, WEEK, '2026-08-30')?.id).toBe('thu');
  });

  test('a dual on the day itself is still ahead, not behind', () => {
    const events = [event('sat', 'dual', '2026-08-29')];
    expect(weekendDualRow(events, WEEK, '2026-08-29')?.id).toBe('sat');
  });

  test('last week\'s dual is not this week\'s, one day out either side', () => {
    expect(
      weekendDualRow([event('sun', 'dual', '2026-08-23')], WEEK, '2026-08-26')
    ).toBeNull();
    expect(
      weekendDualRow([event('mon', 'dual', '2026-08-31')], WEEK, '2026-08-26')
    ).toBeNull();
  });

  test('a tournament in the same week is not a dual sheet', () => {
    const events = [
      event('invite', 'tournament', '2026-08-28'),
      event('sat', 'dual', '2026-08-29'),
    ];
    expect(weekendDualRow(events, WEEK, '2026-08-26')?.id).toBe('sat');
    expect(
      weekendDualRow([event('invite', 'tournament', '2026-08-28')], WEEK, '2026-08-26')
    ).toBeNull();
  });

  test('is not hidden by how much of the week has already happened', () => {
    // The read this replaced was capped at twelve rows from Monday. Thirteen
    // finished events and the dual fell off the end — no card, no error, and
    // nothing on screen to say a card was missing.
    const events = [
      ...Array.from({ length: 13 }, (_, i) =>
        event(`done-${i}`, 'tournament', '2026-08-24')
      ),
      event('sat', 'dual', '2026-08-29'),
    ];
    expect(weekendDualRow(events, WEEK, '2026-08-26')?.id).toBe('sat');
  });
});

function entry(id: string, overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id,
    eventId: 'ev',
    discipline: 'singles',
    slot: 'S1',
    position: 1,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: ['Reid'],
    opponentLabels: ['Blake'],
    opponentSchool: 'Rival State',
    matches: [],
    ...overrides,
  };
}

function won(id: string): EventEntry['matches'][number] {
  return {
    id,
    round: null,
    // Hand-scored, which is what a dual line is until somebody uploads video.
    // Nothing below reads the status — `dualScore` and `entryPlayed` decide off
    // the score alone — but a status the union does not carry would be a
    // fixture asserting against a shape the loader cannot produce.
    status: 'manual',
    score: { player1: [6, 6], player2: [4, 3] },
    opponentLabels: [],
    hasVideo: false,
  };
}

function lost(id: string): EventEntry['matches'][number] {
  return { ...won(id), score: { player1: [4, 3], player2: [6, 6] } };
}

function dualEvent(): ProgramEvent {
  return {
    id: 'ev',
    programId: 'prog',
    kind: 'dual',
    name: 'Rival State',
    startsOn: '2026-08-29',
    endsOn: '2026-08-29',
    site: 'home',
    surface: 'hard',
    host: null,
    format: { bestOf: 3, adScoring: true },
  };
}

/**
 * `scheduleRowsFrom` is the schedule page's row mapping, now shared: Team
 * Home's dual-record KPI is built from these very rows. Two answers to "did we
 * win that dual" on two screens is the failure it exists to make impossible.
 */
test.describe('scheduleRowsFrom · one mapping, two surfaces', () => {
  test('withholds a team score until every line is in', () => {
    const entries = [
      entry('a', { slot: 'S1', matches: [won('m1')] }),
      entry('b', { slot: 'S2', matches: [] }),
    ];
    const [row] = scheduleRowsFrom({
      events: [dualEvent()],
      entriesByEvent: new Map([['ev', entries]]),
    });
    expect(row.teamScore).toBeNull();
    expect(row.entryCount).toBe(2);
    expect(row.playedCount).toBe(1);
  });

  test('a tournament never carries a team score, however complete it is', () => {
    const [row] = scheduleRowsFrom({
      events: [{ ...dualEvent(), kind: 'tournament' }],
      entriesByEvent: new Map([
        ['ev', [entry('a', { matches: [won('m1')] })]],
      ]),
    });
    expect(row.teamScore).toBeNull();
    expect(row.playedCount).toBe(1);
  });

  test('counts a finished dual the way the sheet and the KPI strip both read it', () => {
    const entries = [
      ...['S1', 'S2', 'S3', 'S4'].map((slot, i) =>
        entry(`s${i}`, { slot, matches: [won(`w${i}`)] })
      ),
      ...['S5', 'S6'].map((slot, i) =>
        entry(`l${i}`, { slot, matches: [lost(`l${i}`)] })
      ),
      ...['D1', 'D2', 'D3'].map((slot, i) =>
        entry(`d${i}`, {
          slot,
          discipline: 'doubles',
          matches: [i === 2 ? lost(`dl`) : won(`dw${i}`)],
        })
      ),
    ];
    const [row] = scheduleRowsFrom({
      events: [dualEvent()],
      entriesByEvent: new Map([['ev', entries]]),
    });
    // Four singles courts plus the doubles point.
    expect(row.teamScore).toEqual({ us: 5, them: 2 });
    expect(row.playedCount).toBe(9);
  });

  test('an event with no entries is a row, not a gap', () => {
    const [row] = scheduleRowsFrom({
      events: [dualEvent()],
      entriesByEvent: new Map(),
    });
    expect(row.entryCount).toBe(0);
    expect(row.playedCount).toBe(0);
    expect(row.teamScore).toBeNull();
  });
});
