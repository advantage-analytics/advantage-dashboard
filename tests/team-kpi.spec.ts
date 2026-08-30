import { expect, test } from '@playwright/test';

import {
  SMALL_SAMPLE_MIN,
  TREND_MIN_SPAN_DAYS,
  countTile,
  halfSplitChange,
  sampleNote,
  seriesTile,
  spanDays,
  type TeamKpiObservation,
} from '@/lib/data/team-kpi';
import {
  teamKpis,
  type DbSeasonMatch,
  type DbTeamStat,
} from '@/lib/data/team-home-server';
import type { MatchAnalysis } from '@/lib/data/match-analysis';
import type { MatchScore } from '@/lib/data/match-utils';
import type { ScheduleRow } from '@/lib/schedule/types';

/**
 * The Team Home KPI strip's refusals.
 *
 * The tiles are the easy half. These guard the three things that make the strip
 * honest rather than decorative — a stated sample under every figure computed
 * from too few matches, no trend line drawn through a single afternoon, and no
 * series at all on a figure that has none. All three fail silently: a sparkline
 * through two points looks exactly like a sparkline through twenty.
 */

/** `n` matches, one per day, ending today. */
function daily(values: number[]): TeamKpiObservation[] {
  const day = 86_400_000;
  const end = Date.parse('2026-03-20T00:00:00.000Z');
  return values.map((value, index) => ({
    value,
    date: new Date(end - (values.length - 1 - index) * day).toISOString(),
  }));
}

/** `n` matches all played on one Saturday — a full sample spanning no time. */
function oneAfternoon(values: number[]): TeamKpiObservation[] {
  return values.map((value) => ({ value, date: '2026-03-20T18:00:00.000Z' }));
}

test.describe('spanDays', () => {
  test('is whole days between the oldest and newest row', () => {
    expect(spanDays(daily([1, 2, 3, 4, 5, 6, 7, 8]).map((o) => o.date))).toBe(7);
  });

  test('one row spans nothing', () => {
    // Not an error and not a week: a single match has no duration.
    expect(spanDays(['2026-03-20T00:00:00.000Z'])).toBe(0);
    expect(spanDays([])).toBe(0);
  });

  test('ignores dates it cannot read rather than counting them as the epoch', () => {
    const dates = daily([1, 2, 3, 4, 5, 6, 7, 8]).map((o) => o.date);
    expect(spanDays([...dates, 'not a date'])).toBe(7);
  });
});

test.describe('halfSplitChange', () => {
  test('compares equal-sized windows, dropping the middle of an odd sample', () => {
    // Earlier half [10, 10], recent half [20, 20]; the 99 in the middle belongs
    // to neither, because a two-match window against a three-match one is a
    // comparison of different things.
    expect(halfSplitChange([10, 10, 99, 20, 20])).toBe(10);
  });

  test('is zero when nothing moved — which is not the same as null', () => {
    expect(halfSplitChange([50, 50, 50, 50])).toBe(0);
  });

  test('refuses a sample too small to have two halves', () => {
    expect(halfSplitChange([10, 20, 30])).toBeNull();
    expect(halfSplitChange([])).toBeNull();
  });
});

test.describe('the small-sample gate', () => {
  test('below the threshold a tile names its count and draws nothing', () => {
    const tile = seriesTile('first-serve', 'Team 1st serve', 'match', '62%', daily([60, 62, 64]));

    expect(tile.sample).toBe(3);
    expect(tile.sparkline).toEqual([]);
    expect(tile.change).toBeNull();
    expect(sampleNote(tile)).toBe('3 matches — small sample');
  });

  test('a dual sample is counted in duals, never in matches', () => {
    // The strip's caveat is one rule, but each tile states it in the unit that
    // is actually true of the figure above it.
    const tile = countTile('dual-record', 'Dual record', 'dual', '2–1', [
      '2026-02-01',
      '2026-02-08',
      '2026-02-15',
    ]);
    expect(sampleNote(tile)).toBe('3 duals — small sample');
  });

  test('one row is singular', () => {
    const tile = seriesTile('sets-won', 'Sets won', 'match', '67%', daily([67]));
    expect(sampleNote(tile)).toBe('1 match — small sample');
  });
});

test.describe('the week-of-data gate', () => {
  test('a full sample played in one afternoon earns no trend', () => {
    // Six matches is past the count threshold and spans zero days. A line drawn
    // through them reports the difference between COURTS as a trend over time.
    const tile = seriesTile(
      'sets-won',
      'Sets won',
      'match',
      '55%',
      oneAfternoon([100, 0, 50, 100, 50, 33])
    );

    expect(tile.sample).toBeGreaterThanOrEqual(SMALL_SAMPLE_MIN);
    expect(tile.spanDays).toBe(0);
    expect(tile.sparkline).toEqual([]);
    expect(tile.change).toBeNull();
    // Not "small sample" — it is not short of data, it is short of time.
    expect(sampleNote(tile)).toBe('6 matches — trends after a week');
  });

  test('a week apart but only two matches still earns no trend', () => {
    const tile = seriesTile('first-serve', 'Team 1st serve', 'match', '61%', [
      { value: 58, date: '2026-03-01T00:00:00.000Z' },
      { value: 64, date: '2026-03-20T00:00:00.000Z' },
    ]);

    expect(tile.spanDays).toBeGreaterThanOrEqual(TREND_MIN_SPAN_DAYS);
    expect(tile.sparkline).toEqual([]);
    expect(tile.change).toBeNull();
    expect(sampleNote(tile)).toBe('2 matches — small sample');
  });

  test('both gates passed, the trend and the line appear', () => {
    const tile = seriesTile(
      'first-serve',
      'Team 1st serve',
      'match',
      '62%',
      daily([58, 58, 60, 62, 64, 64, 66, 66])
    );

    expect(tile.spanDays).toBe(7);
    expect(tile.sparkline).toEqual([58, 58, 60, 62, 64, 64, 66, 66]);
    // [58, 58, 60, 62] → 59.5 against [64, 64, 66, 66] → 65.
    expect(tile.change).toBe(5.5);
    // No caveat once the tile carries a real trend.
    expect(sampleNote(tile)).toBeNull();
  });

  test('the sparkline is chronological and draws every observation, not a trailing window', () => {
    const tile = seriesTile(
      'sets-won',
      'Sets won',
      'match',
      '50%',
      daily([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
    // Oldest → newest — a sparkline drawn backwards is a trend reported in
    // reverse — and all ten, because ten is what the headline above it
    // averaged and what the change beside it split in half.
    expect(tile.sparkline).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

/* ------------------------------------------------------------------------- *
 * One tile, one window
 * ------------------------------------------------------------------------- */

/**
 * The tile makes three claims about its figure — the headline, the signed
 * change, and the shape of the line — and all three must be about the same
 * matches.
 *
 * They were not. The line drew a trailing eight while the headline averaged
 * the whole season and the change split that whole season in half, so a
 * program that improved across the year but dipped in its last few weeks got a
 * falling line beside a rising number. Nothing looks broken when that happens:
 * both are drawn correctly, neither is labelled with the stretch of season it
 * covers, and a coach reads whichever one they looked at first.
 *
 * This is the failure a length cap cannot be tested for by inspection — it is
 * invisible until the series is longer than the cap AND its tail disagrees
 * with its body, which is why the fixtures below arrange exactly that.
 */
test.describe('the headline, the change and the line read one series', () => {
  /**
   * Twelve observations, one a day, that FALL across the whole span and RISE across
   * their last eight: four high readings, then a low run climbing back.
   *
   * Halves of all twelve: [90, 90, 90, 90, 10, 15] → 64.2 against
   * [20, 25, 30, 35, 40, 45] → 32.5, so the season fell by about 32 points.
   * The trailing eight, [10 … 45], climbs monotonically from first to last.
   */
  const DIPPED_THEN_CLIMBED = [90, 90, 90, 90, 10, 15, 20, 25, 30, 35, 40, 45];

  /** What the old code drew: the most recent eight observations. */
  const OLD_SPARK_WINDOW = 8;

  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  /** What the loader would print above the line — `meanOfPresent`, rounded. */
  const HEADLINE = `${Math.round(mean(DIPPED_THEN_CLIMBED))}%`;

  test('a falling season never draws the rising tail underneath it', () => {
    const tile = seriesTile(
      'first-serve',
      'Team 1st serve',
      'match',
      HEADLINE,
      daily(DIPPED_THEN_CLIMBED)
    );

    const tail = DIPPED_THEN_CLIMBED.slice(-OLD_SPARK_WINDOW);
    // The fixture is only a test of anything if its tail really does move
    // against its body: the tail climbs, the season drops.
    expect(halfSplitChange(tail)).toBeGreaterThan(0);
    expect(tile.change).toBeLessThan(0);

    // So the tail must not be what gets drawn beside that negative number.
    expect(tile.sparkline).not.toEqual(tail);
    expect(tile.sparkline).toEqual(DIPPED_THEN_CLIMBED);
    // And the drawn line falls end to end, the way the change says it did.
    expect(tile.sparkline[tile.sparkline.length - 1]).toBeLessThan(
      tile.sparkline[0]
    );
  });

  test('the change is the drawn line halved, not a different stretch of season', () => {
    const tile = seriesTile(
      'sets-won',
      'Sets won',
      'match',
      HEADLINE,
      daily(DIPPED_THEN_CLIMBED)
    );

    // The strongest form of the rule: recompute the change from nothing but
    // what a coach can see, and get the number printed beside it.
    expect(halfSplitChange(tile.sparkline)).toBe(tile.change);
  });

  test('the headline is the mean of the line, not the mean of something longer', () => {
    // The loader formats `meanOfPresent` over these same observations, so the
    // headline is honest only while the line is the whole series.
    const tile = seriesTile(
      'first-serve',
      'Team 1st serve',
      'match',
      HEADLINE,
      daily(DIPPED_THEN_CLIMBED)
    );

    expect(tile.sample).toBe(DIPPED_THEN_CLIMBED.length);
    expect(mean(tile.sparkline)).toBeCloseTo(mean(DIPPED_THEN_CLIMBED), 10);
    expect(`${Math.round(mean(tile.sparkline))}%`).toBe(tile.value);
  });
});

/* ------------------------------------------------------------------------- *
 * The gates, at their exact edges
 * ------------------------------------------------------------------------- */

/**
 * Drawing the whole series changes HOW MUCH a tile draws, and must change
 * nothing about WHETHER it draws. These pin both thresholds to the observation
 * either side of them, including on series longer than the window that used to
 * be capped — a long season that fails a gate has more to hide, not less.
 */
test.describe('the gates are unmoved by the length of the series', () => {
  /** `n` values, one a day, so the span is `n - 1` days. */
  const ramp = (n: number) => Array.from({ length: n }, (_, i) => 50 + i);

  test('the count gate opens exactly at SMALL_SAMPLE_MIN', () => {
    // One short of the threshold, with weeks of calendar behind it.
    const short = seriesTile(
      'first-serve',
      'Team 1st serve',
      'match',
      '55%',
      Array.from({ length: SMALL_SAMPLE_MIN - 1 }, (_, i) => ({
        value: 50 + i,
        date: new Date(
          Date.parse('2026-01-05T00:00:00.000Z') + i * 7 * 86_400_000
        ).toISOString(),
      }))
    );
    expect(short.sample).toBe(SMALL_SAMPLE_MIN - 1);
    expect(short.spanDays).toBeGreaterThanOrEqual(TREND_MIN_SPAN_DAYS);
    expect(short.sparkline).toEqual([]);
    expect(short.change).toBeNull();

    // The threshold itself, over the same weekly calendar.
    const exact = seriesTile(
      'first-serve',
      'Team 1st serve',
      'match',
      '55%',
      Array.from({ length: SMALL_SAMPLE_MIN }, (_, i) => ({
        value: 50 + i,
        date: new Date(
          Date.parse('2026-01-05T00:00:00.000Z') + i * 7 * 86_400_000
        ).toISOString(),
      }))
    );
    expect(exact.sample).toBe(SMALL_SAMPLE_MIN);
    expect(exact.sparkline).toHaveLength(SMALL_SAMPLE_MIN);
    expect(exact.change).not.toBeNull();
  });

  test('the span gate opens exactly at TREND_MIN_SPAN_DAYS', () => {
    // A day short of a week, and past the count threshold twice over.
    const day = 86_400_000;
    const start = Date.parse('2026-03-01T00:00:00.000Z');
    const tight = seriesTile(
      'sets-won',
      'Sets won',
      'match',
      '55%',
      Array.from({ length: 12 }, (_, i) => ({
        value: 50 + i,
        date: new Date(
          start + Math.round((i * (TREND_MIN_SPAN_DAYS - 1) * day) / 11)
        ).toISOString(),
      }))
    );
    expect(tight.sample).toBe(12);
    expect(tight.spanDays).toBe(TREND_MIN_SPAN_DAYS - 1);
    expect(tight.sparkline).toEqual([]);
    expect(tight.change).toBeNull();
    expect(sampleNote(tight)).toBe('12 matches — trends after a week');

    // The same twelve, one day wider.
    const wide = seriesTile(
      'sets-won',
      'Sets won',
      'match',
      '55%',
      daily(ramp(TREND_MIN_SPAN_DAYS + 1))
    );
    expect(wide.spanDays).toBe(TREND_MIN_SPAN_DAYS);
    expect(wide.sparkline).toHaveLength(TREND_MIN_SPAN_DAYS + 1);
  });

  test('a long season played in one afternoon still draws nothing', () => {
    // Twenty observations — well past both the count threshold and the eight
    // the line used to cap at — spanning no calendar at all. Length is not
    // evidence of time, and a longer line drawn through one Saturday is a
    // bigger lie, not a smaller one.
    const tile = seriesTile(
      'sets-won',
      'Sets won',
      'match',
      '55%',
      oneAfternoon(ramp(20))
    );

    expect(tile.sample).toBe(20);
    expect(tile.spanDays).toBe(0);
    expect(tile.sparkline).toEqual([]);
    expect(tile.change).toBeNull();
    expect(sampleNote(tile)).toBe('20 matches — trends after a week');
  });
});

test.describe('tallies never get a series', () => {
  test('a record carries its sample but no trend, however long the season', () => {
    const dates = Array.from({ length: 20 }, (_, i) =>
      new Date(Date.parse('2026-01-10T00:00:00.000Z') + i * 7 * 86_400_000).toISOString()
    );
    const tile = countTile('dual-record', 'Dual record', 'dual', '14–6', dates);

    expect(tile.sample).toBe(20);
    expect(tile.spanDays).toBeGreaterThan(TREND_MIN_SPAN_DAYS);
    expect(tile.trendable).toBe(false);
    expect(tile.sparkline).toEqual([]);
    expect(tile.change).toBeNull();
    // And no note either — a full-season record is not waiting for anything.
    expect(sampleNote(tile)).toBeNull();
  });
});

/* ------------------------------------------------------------------------- *
 * `teamKpis()` — which tiles exist at all
 * ------------------------------------------------------------------------- */

/**
 * Everything above tests a tile once it has been decided on. This block tests
 * the decision.
 *
 * `teamKpis()` is the function that answers "does this figure get a tile?", and
 * every one of its answers fails silently when it is wrong: a `0–0` dual record
 * on a program that has never finished a dual looks exactly like a program
 * that has gone winless, and a strip that appears on day zero looks exactly
 * like a strip with data in it. Four states decide what a coach sees, and each
 * has a test below.
 */

/** The one roster id every fixture attributes to. */
const OURS = 'roster-player';
const ROSTER = new Set([OURS]);

/** Monday of week `n` of the fixture season, as a `date` column holds it. */
function week(n: number): string {
  const opener = Date.parse('2026-01-05T00:00:00.000Z');
  return new Date(opener + n * 7 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A finished match, written from the WINNER's point of view.
 *
 * Two sets or three, and the side that took it is a parameter — because the
 * whole point of `programSide` is that a match our program won from the
 * `player2` column must read the same as one it won from `player1`, and the
 * two are indistinguishable on screen when the orientation is wrong.
 */
function wonBy(side: 'player1' | 'player2', sets: 2 | 3): MatchScore {
  const winner = sets === 3 ? [6, 4, 6] : [6, 6];
  const loser = sets === 3 ? [4, 6, 3] : [4, 3];
  return side === 'player1'
    ? { player1: winner, player2: loser }
    : { player1: loser, player2: winner };
}

/**
 * One row of the season read.
 *
 * `side: null` puts strangers in both id columns and no `event_entry_id`, which
 * is the row `programSide` refuses to attribute. `analyzed` drives
 * `source_provider`, because a provider string is what `importedAnalysis` reads
 * as ready and a null falls back to `manualAnalysis` — a typed score, not
 * analysis.
 */
function seasonMatch(opts: {
  id: string;
  date: string;
  side: 'player1' | 'player2' | null;
  score: MatchScore | null;
  analyzed?: boolean;
}): DbSeasonMatch {
  const analyzed = opts.analyzed ?? true;
  return {
    id: opts.id,
    // Names are on the row for `teamFirstReport()`'s receipt, not for the
    // strip — nothing `teamKpis` returns has a player's name in it.
    player1_name: opts.side === 'player1' ? 'Ours' : 'Stranger One',
    player2_name: opts.side === 'player2' ? 'Ours' : 'Stranger Two',
    player1_id: opts.side === 'player1' ? OURS : 'stranger-1',
    player2_id: opts.side === 'player2' ? OURS : 'stranger-2',
    event_entry_id: null,
    score: opts.score,
    date: opts.date,
    source_provider: analyzed ? 'swingvision' : null,
    verified: analyzed ? true : null,
  };
}

function stat(
  matchId: string,
  isPlayer1: boolean,
  firstServePct: number | string | null
): DbTeamStat {
  return {
    match_id: matchId,
    is_player1: isPlayer1,
    first_serve_pct: firstServePct,
  };
}

function dual(
  id: string,
  startsOn: string,
  teamScore: { us: number; them: number } | null
): ScheduleRow {
  return {
    id,
    kind: 'dual',
    name: `Dual ${id}`,
    startsOn,
    endsOn: startsOn,
    site: 'home',
    entryCount: 9,
    playedCount: teamScore ? 9 : 0,
    workingCount: 0,
    teamScore,
  };
}

/** The read hands rows over newest first; the function is what re-orders them. */
function newestFirst(rows: DbSeasonMatch[]): DbSeasonMatch[] {
  return [...rows].reverse();
}

/** Every tile key on the strip, in the order the loader pushes them. */
function keysOf(tiles: { key: string }[]): string[] {
  return tiles.map((tile) => tile.key);
}

test.describe('teamKpis — day zero', () => {
  test('no analyzed match means no tiles at all, however much else exists', () => {
    // Deliberately a program with plenty to say and nothing to say it FROM:
    // three scored matches, two decided duals, and stat rows for all of them.
    // Every other gate in the function would happily produce a tile here.
    const season = [
      seasonMatch({
        id: 'm-1',
        date: week(0),
        side: 'player1',
        score: wonBy('player1', 3),
        analyzed: false,
      }),
      seasonMatch({
        id: 'm-2',
        date: week(1),
        side: 'player2',
        score: wonBy('player2', 2),
        analyzed: false,
      }),
      // A real upload, mid-pipeline. `source_provider` IS set on this row —
      // the job is what says it is not ready yet, and `analysisOf` has to
      // prefer the job over the provider fallback. If it ever stopped doing
      // so, this row alone would light the whole strip up on day zero.
      seasonMatch({
        id: 'm-3',
        date: week(2),
        side: 'player1',
        score: wonBy('player1', 3),
      }),
    ];
    const jobs = new Map<string, MatchAnalysis>([
      ['m-3', { status: 'processing', providerId: null }],
    ]);

    const tiles = teamKpis(
      newestFirst(season),
      jobs,
      [stat('m-1', true, 61), stat('m-2', false, 58), stat('m-3', true, 64)],
      [dual('e-1', week(0), { us: 5, them: 2 }), dual('e-2', week(1), { us: 3, them: 4 })],
      ROSTER
    );

    // Not "four tiles of zeroes", not "a strip of em dashes". Nothing.
    expect(tiles).toEqual([]);
  });
});

test.describe('teamKpis — analyzed matches, no decided dual', () => {
  test('the dual tile is absent rather than printed as 0–0', () => {
    const season = Array.from({ length: 6 }, (_, index) => {
      const side = index % 2 === 0 ? ('player1' as const) : ('player2' as const);
      return seasonMatch({
        id: `m-${index}`,
        date: week(index),
        side,
        score: wonBy(side, 3),
      });
    });

    const tiles = teamKpis(
      newestFirst(season),
      new Map(),
      season.map((row, index) => stat(row.id, index % 2 === 0, 60)),
      [
        // Played, but not finished: `teamScore` stays null until every line is
        // in, and a dual half-recorded is not a dual won or lost.
        dual('e-live', week(0), null),
        // Finished level. In neither column, so in no sample — counting it
        // under a record would stop the record adding up to the duals beside
        // it.
        dual('e-tied', week(1), { us: 4, them: 4 }),
        // Impossible in production and here on purpose: the filter is on
        // `kind`, not on "has a team score". A tournament must never
        // contribute to a DUAL record even if a score somehow reached it.
        { ...dual('e-tourney', week(2), { us: 6, them: 1 }), kind: 'tournament' },
      ],
      ROSTER
    );

    expect(keysOf(tiles)).toEqual(['sets-won', 'first-serve', 'matches-analyzed']);
    expect(tiles.some((tile) => tile.key === 'dual-record')).toBe(false);
    // Nothing on the strip is standing in for the record that is missing —
    // no `0–0`, and no record-shaped value at all.
    expect(tiles.map((tile) => tile.value)).not.toContain('0–0');
    expect(tiles.every((tile) => !tile.value.includes('–'))).toBe(true);
  });
});

test.describe('teamKpis — below the sample threshold', () => {
  test('every tile carries its count and none carries a trend', () => {
    // Three matches over a fortnight: past the SPAN gate, nowhere near the
    // COUNT one. That is what makes this a test of the count rather than of
    // the calendar.
    const season = Array.from({ length: 3 }, (_, index) =>
      seasonMatch({
        id: `m-${index}`,
        date: week(index),
        side: 'player1',
        score: wonBy('player1', 3),
      })
    );

    const tiles = teamKpis(
      newestFirst(season),
      new Map(),
      season.map((row) => stat(row.id, true, 57)),
      season.map((row, index) => dual(`e-${index}`, row.date, { us: 5, them: 2 })),
      ROSTER
    );

    expect(keysOf(tiles)).toEqual([
      'dual-record',
      'sets-won',
      'first-serve',
      'matches-analyzed',
    ]);
    expect(tiles.every((tile) => tile.spanDays >= TREND_MIN_SPAN_DAYS)).toBe(true);

    for (const tile of tiles) {
      expect(tile.sample).toBe(3);
      expect(tile.sample).toBeLessThan(SMALL_SAMPLE_MIN);
      // No line, and no delta to colour it — a trend through three matches is
      // the chart that lies.
      expect(tile.sparkline).toEqual([]);
      expect(tile.change).toBeNull();
      // And each figure names the sample it rests on, in its own unit.
      expect(sampleNote(tile)).toBe(
        tile.key === 'dual-record' ? '3 duals — small sample' : '3 matches — small sample'
      );
    }
  });
});

test.describe('teamKpis — mid-season', () => {
  test('the measurable figures earn a trend and the tallies still do not', () => {
    // Eight matches, one a week, so both gates are cleared: eight ≥ the count
    // threshold and forty-nine days ≥ the span one. The program plays from
    // `player2` on alternate weeks, which is the case a wrong orientation
    // renders identically to a right one.
    const season = Array.from({ length: 8 }, (_, index) => {
      const side = index % 2 === 0 ? ('player1' as const) : ('player2' as const);
      // First half 2–1, second half 2–0: sets won climbs from 66.7% to 100%.
      return seasonMatch({
        id: `m-${index}`,
        date: week(index),
        side,
        score: wonBy(side, index < 4 ? 3 : 2),
      });
    });

    const stats: DbTeamStat[] = [];
    season.forEach((row, index) => {
      const ourSideIsPlayer1 = index % 2 === 0;
      // A numeric column arrives from PostgREST as a string on some rows and a
      // number on others; both have to reach the average.
      const ours = index < 4 ? 55 : 65;
      stats.push(stat(row.id, ourSideIsPlayer1, index % 3 === 0 ? String(ours) : ours));
      // The OPPONENT's half of the same match, and nowhere near our figure.
      // If the tile ever keyed on the wrong side, the average would be 20%.
      stats.push(stat(row.id, !ourSideIsPlayer1, 20));
    });

    const tiles = teamKpis(
      newestFirst(season),
      new Map(),
      stats,
      season.map((row, index) =>
        dual(`e-${index}`, row.date, index < 6 ? { us: 5, them: 2 } : { us: 2, them: 5 })
      ),
      ROSTER
    );

    expect(keysOf(tiles)).toEqual([
      'dual-record',
      'sets-won',
      'first-serve',
      'matches-analyzed',
    ]);

    const byKey = Object.fromEntries(tiles.map((tile) => [tile.key, tile]));

    // The two measured figures: a full sparkline, a signed change, and a
    // headline that is the mean of the series drawn beneath it.
    const sets = byKey['sets-won'];
    expect(sets.trendable).toBe(true);
    expect(sets.sparkline).toHaveLength(8);
    expect(sets.sparkline.slice(0, 4).every((value) => Math.round(value) === 67)).toBe(true);
    expect(sets.sparkline.slice(4)).toEqual([100, 100, 100, 100]);
    expect(sets.value).toBe('83%');
    expect(sets.change).toBeCloseTo(33.3, 1);

    const serve = byKey['first-serve'];
    expect(serve.sparkline).toEqual([55, 55, 55, 55, 65, 65, 65, 65]);
    expect(serve.value).toBe('60%');
    expect(serve.change).toBe(10);

    // The two tallies: their samples are as large and their seasons as long,
    // and they still draw nothing. A record is not a measurement repeated over
    // time, and a count of analyzed matches only ever rises.
    for (const key of ['dual-record', 'matches-analyzed']) {
      expect(byKey[key].trendable).toBe(false);
      expect(byKey[key].sparkline).toEqual([]);
      expect(byKey[key].change).toBeNull();
    }
    expect(byKey['dual-record'].value).toBe('6–2');
    expect(byKey['matches-analyzed'].value).toBe('8');

    // Past the threshold and past the week, nothing is waiting on anything, so
    // no tile explains itself.
    expect(tiles.map((tile) => sampleNote(tile))).toEqual([null, null, null, null]);
  });
});
