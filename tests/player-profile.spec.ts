import { expect, test } from '@playwright/test';

import {
  clipText,
  dualRecordFrom,
  gamesWonPct,
  kpiSeries,
  lineHistoryFrom,
  seasonKpis,
  SEASON_KPI_DEFAULT_KEYS,
  SEASON_KPI_MAX,
  SEASON_KPI_MIN,
  SEASON_KPI_SPECS,
  resolveLine,
  resolveSchool,
  runningDifferential,
  type ProfileEntry,
  type ProfileEvent,
  type ProfileResult,
  type ProfileStatRow,
} from '@/lib/data/player-profile';

/**
 * The player profile's arithmetic (Platform Audit `Te` / `Te2`).
 *
 * Everything here reads from one side of a match. The failure these guard
 * against is silent: a line grouped under the wrong slot, a dual counted as
 * a tournament, a trend drawn against a two-match baseline — none of it
 * errors, and every number looks plausible on screen.
 */

function stats(
  partial: Partial<Omit<ProfileStatRow, "rates">> & { rates?: Record<string, number | null> } = {}
): ProfileStatRow {
  const { rates, ...counts } = partial;
  return {
    rates: rates ?? {},
    breakPointsConverted: null,
    breakPointOpportunities: null,
    serviceGames: null,
    serviceGamesWon: null,
    returnGames: null,
    returnGamesWon: null,
    winners: null,
    unforcedErrors: null,
    ...counts,
  };
}

/** Newest first, like the loader's list. */
function result(
  id: string,
  won: boolean | null,
  overrides: Partial<ProfileResult> = {}
): ProfileResult {
  return {
    id,
    date: null,
    isPlayer1: true,
    won,
    entryId: null,
    opponentName: 'Opponent',
    score: null,
    tournamentName: null,
    stats: null,
    ...overrides,
  };
}

function entry(id: string, slot: string | null, eventId = 'e1', opponentSchool: string | null = null): ProfileEntry {
  return { id, eventId, slot, discipline: null, opponentSchool, forfeit: null };
}

function event(id: string, kind: string, name = 'Meridian State'): ProfileEvent {
  return { id, kind, name, startsOn: null };
}

const NO_ENTRIES = new Map<string, ProfileEntry>();
const NO_EVENTS = new Map<string, ProfileEvent>();

test.describe('resolveSchool', () => {
  test('the entry names the opponent first', () => {
    expect(resolveSchool(entry('x', 'S1', 'e1', 'Big Sky'), event('e1', 'dual'), 'Invitational')).toBe('Big Sky');
  });

  test('a dual is named after its opponent', () => {
    expect(resolveSchool(entry('x', 'S1'), event('e1', 'dual', 'Meridian State'), 'Invitational')).toBe('Meridian State');
  });

  test('a tournament falls back to the match event name', () => {
    expect(resolveSchool(entry('x', null), event('e1', 'tournament', 'Fall Classic'), 'Fall Classic')).toBe('Fall Classic');
  });

  test('nothing named is null, not an empty string', () => {
    expect(resolveSchool(null, null, null)).toBeNull();
    expect(resolveSchool(null, null, '   ')).toBeNull();
  });

  test('resolveLine reads the slot and nothing else', () => {
    expect(resolveLine(entry('x', 'S3'))).toBe('S3');
    expect(resolveLine(entry('x', null))).toBeNull();
    expect(resolveLine(null)).toBeNull();
  });
});

test.describe('gamesWonPct', () => {
  test('sums the serve and return halves', () => {
    expect(
      gamesWonPct(stats({ serviceGames: 10, serviceGamesWon: 8, returnGames: 10, returnGamesWon: 4 }))
    ).toBe(60);
  });

  test('is null when either half is unmeasured', () => {
    expect(gamesWonPct(stats({ serviceGames: 10, serviceGamesWon: 8 }))).toBeNull();
    expect(gamesWonPct(null)).toBeNull();
  });

  test('is null, not zero, when no game was played', () => {
    expect(
      gamesWonPct(stats({ serviceGames: 0, serviceGamesWon: 0, returnGames: 0, returnGamesWon: 0 }))
    ).toBeNull();
  });
});

test.describe('dualRecordFrom', () => {
  const entries = new Map([
    ['d1', entry('d1', 'S3', 'dual')],
    ['t1', entry('t1', null, 'tourn')],
  ]);
  const events = new Map([
    ['dual', event('dual', 'dual')],
    ['tourn', event('tourn', 'tournament')],
  ]);

  test('counts decided matches in duals only', () => {
    const results = [
      result('a', true, { entryId: 'd1' }),
      result('b', false, { entryId: 'd1' }),
      result('c', true, { entryId: 't1' }), // tournament — not a dual
      result('d', true), // unscheduled upload — no entry
      result('e', null, { entryId: 'd1' }), // unscored
    ];
    expect(dualRecordFrom(results, entries, events)).toEqual({ wins: 1, losses: 1 });
  });
});

test.describe('lineHistoryFrom', () => {
  const entries = new Map([
    ['s3', entry('s3', 'S3')],
    ['s2', entry('s2', 'S2')],
    ['d1', entry('d1', 'D1')],
    ['draw', entry('draw', null)],
  ]);

  test('groups by slot and orders singles before doubles, low to high', () => {
    const rows = lineHistoryFrom(
      [
        result('a', true, { entryId: 'd1' }),
        result('b', true, { entryId: 's3' }),
        result('c', false, { entryId: 's2' }),
        result('d', false, { entryId: 's3' }),
      ],
      entries
    );
    expect(rows.map((r) => r.slot)).toEqual(['S2', 'S3', 'D1']);
    expect(rows[1]).toMatchObject({ slot: 'S3', wins: 1, losses: 1, winPct: 50 });
  });

  test('leaves out matches with no entry or no slot', () => {
    const rows = lineHistoryFrom(
      [result('a', true), result('b', true, { entryId: 'draw' }), result('c', true, { entryId: 's3' })],
      entries
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe('S3');
  });

  test('form is the last five decided results, oldest left', () => {
    // Newest first in, as the loader hands them over.
    const results = ['w', 'l', 'w', 'w', 'l', 'l', 'w'].map((r, i) =>
      result(`m${i}`, r === 'w', { entryId: 's3' })
    );
    const [row] = lineHistoryFrom(results, entries);
    expect(row.form).toEqual(['loss', 'win', 'win', 'loss', 'win']);
    expect(row).toMatchObject({ wins: 4, losses: 3, winPct: 57 });
  });

  test('an unscored match at a line adds no record and no tick', () => {
    const [row] = lineHistoryFrom([result('a', null, { entryId: 's3' })], entries);
    expect(row).toMatchObject({ slot: 'S3', wins: 0, losses: 0, winPct: null, form: [] });
  });
});

test.describe('kpiSeries', () => {
  test('the sparkline is the last eight measured values, oldest → newest', () => {
    const newestFirst = [10, null, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    expect(kpiSeries(newestFirst).sparkline).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('one measured match is no trend; two start one', () => {
    expect(kpiSeries([60]).trend).toBeNull();
    expect(kpiSeries([]).trend).toBeNull();
    // The newest against the one before it.
    expect(kpiSeries([62, 50]).trend).toEqual({ change: 12, changeLabel: 'vs earlier' });
  });

  test('the recent half is capped at five once the season is long', () => {
    // Newest five average 62; the six before them average 50.
    const { trend } = kpiSeries([60, 61, 62, 63, 64, 50, 50, 50, 50, 50, 50]);
    expect(trend).toEqual({ change: 12, changeLabel: 'vs earlier' });
  });

  test('a short season splits in half, newest half first', () => {
    // Four matches: [70, 70] against [50, 50].
    expect(kpiSeries([70, 70, 50, 50]).trend?.change).toBe(20);
  });
});

test.describe('the statistic catalogue', () => {
  test('every key is offered once, and the defaults are the first five', () => {
    const keys = SEASON_KPI_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SEASON_KPI_DEFAULT_KEYS).toEqual(keys.slice(0, SEASON_KPI_MAX));
  });

  test('there are more statistics than slots, so the picker has something to swap', () => {
    expect(SEASON_KPI_SPECS.length).toBeGreaterThan(SEASON_KPI_MAX);
    expect(SEASON_KPI_MIN).toBeLessThan(SEASON_KPI_MAX);
  });

  test('every tile the catalogue names is built, in catalogue order', () => {
    // The picker renders the catalogue and looks each tile up by key; a spec
    // with no tile behind it would silently drop a chosen statistic.
    const tiles = seasonKpis([], { wins: 0, losses: 0, duals: { wins: 0, losses: 0 } });
    expect(tiles.map((t) => t.key)).toEqual(SEASON_KPI_SPECS.map((s) => s.key));
    expect(tiles.every((t) => t.label && t.category)).toBe(true);
  });
});

test.describe("the hover chart's points", () => {
  test("carries each match's own opponent and date, oldest first", () => {
    const results = [
      result('a', true, { date: '2026-04-12', opponentName: 'D. Fontaine', stats: stats({ rates: { first_serve_pct: 60 } }) }),
      result('b', true, { date: '2026-04-05', opponentName: 'L. Ortega', stats: null }),
      result('c', true, { date: '2026-03-28', opponentName: 'J. Park', stats: stats({ rates: { first_serve_pct: 50 } }) }),
    ];
    const firstServe = seasonKpis(results, { wins: 3, losses: 0, duals: { wins: 0, losses: 0 } })[1];
    // The unmeasured middle match is absent, and the two that remain keep
    // their own opponent — the alignment `presentPairs` exists to protect.
    expect(firstServe.points).toEqual([
      { value: 50, date: '2026-03-28', opponent: 'J. Park' },
      { value: 60, date: '2026-04-12', opponent: 'D. Fontaine' },
    ]);
  });

  test('the chart is the sparkline enlarged — one window, same order', () => {
    // Twelve measured matches against a window of eight. Before this was one
    // window the tile drew the last eight and the hover drew all twelve, so
    // one statistic showed two different lines depending on where you looked.
    const results = Array.from({ length: 12 }, (_, i) =>
      result(`m${i}`, true, {
        date: `2026-04-${String(28 - i).padStart(2, '0')}`,
        opponentName: `Opp ${i}`,
        stats: stats({ rates: { first_serve_pct: 50 + i } }),
      })
    );
    const tile = seasonKpis(results, { wins: 12, losses: 0, duals: { wins: 0, losses: 0 } })[1];
    expect(tile.sparkline).toHaveLength(8);
    expect(tile.points).toHaveLength(8);
    expect(tile.points!.map((p) => p.value)).toEqual(tile.sparkline);
    // Oldest left, and each point still carries its own match.
    expect(tile.points![0].opponent).toBe('Opp 7');
    expect(tile.points![7].opponent).toBe('Opp 0');
  });

  test('a record has no chart, because it is not a per-match rate', () => {
    const results = [result('a', true, { stats: stats({ rates: { first_serve_pct: 60 } }) })];
    expect(seasonKpis(results, { wins: 1, losses: 0, duals: { wins: 0, losses: 0 } })[0].points).toBeUndefined();
  });
});

test.describe('clipText', () => {
  test('leaves a short paragraph alone', () => {
    expect(clipText('The serve decided the second set.', 60)).toBe('The serve decided the second set.');
  });

  test('cuts on a word and ends with an ellipsis', () => {
    const long = 'You won 78% of first-serve points but landed only 54% in, and the second serve did not hold up.';
    const clipped = clipText(long, 50);
    expect(clipped.length).toBeLessThanOrEqual(50);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped).toBe('You won 78% of first-serve points but landed…');
  });
});

test.describe('runningDifferential', () => {
  test('walks the season oldest → newest, skipping unscored matches', () => {
    expect(runningDifferential([result('c', true), result('b', null), result('a', false)])).toEqual([-1, 0]);
  });
});

test.describe('seasonKpis', () => {
  const input = { wins: 12, losses: 4, duals: { wins: 8, losses: 2 } };

  test('the record tile and its dual subtext', () => {
    const [record] = seasonKpis([], input);
    expect(record).toMatchObject({ value: '12–4', subtext: '8–2 in duals' });
  });

  test('no dual subtext before a dual has been decided', () => {
    const [record] = seasonKpis([], { ...input, duals: { wins: 0, losses: 0 } });
    expect(record.subtext).toBeUndefined();
  });

  test('break points won is a sum, so the value agrees with its subtext', () => {
    const results = [
      result('a', true, { stats: stats({ breakPointsConverted: 30, breakPointOpportunities: 60 }) }),
      result('b', true, { stats: stats({ breakPointsConverted: 4, breakPointOpportunities: 21 }) }),
    ];
    const breakTile = seasonKpis(results, input)[3];
    // 34 of 81 = 41.97%, rounded 42 — a mean of per-match rates (50%, 19%)
    // would print 35% over a subtext that says otherwise.
    expect(breakTile).toMatchObject({ value: '42%', subtext: '34 of 81' });
  });

  test('1st serve won is the player\'s own, with no team average beside it', () => {
    const results = [result('a', true, { stats: stats({ rates: { first_serve_won_pct: 74 } }) })];
    const tile = seasonKpis(results, input)[2];
    expect(tile).toMatchObject({ value: '74%', hintText: '1 more match for a trend' });
    expect(tile.subtext).toBeUndefined();
  });

  test('an unmeasured rate prints a dash and says what it is waiting on', () => {
    const [, firstServe] = seasonKpis([result('a', true)], input);
    expect(firstServe).toMatchObject({ value: '—', hintText: 'After the first report' });
  });

  test('one measured match says one more is needed; two draw a trend', () => {
    const one = [result('m1', true, { stats: stats({ rates: { first_serve_pct: 60 } }) })];
    const [, firstServe] = seasonKpis(one, input);
    expect(firstServe.trend).toBeUndefined();
    expect(firstServe.hintText).toBe('1 more match for a trend');

    const two = [65, 60].map((v, i) => result(`m${i}`, true, { stats: stats({ rates: { first_serve_pct: v } }) }));
    expect(seasonKpis(two, input)[1].trend).toEqual({ change: 5, changeLabel: 'vs earlier' });
  });
});
