import { expect, test } from '@playwright/test';

import {
  KPI_SERIES_WINDOW,
  buildKpiHistory,
  type PlayerStatRow,
} from '@/lib/data/match-stats-server';

/**
 * What a match page's KPI tile is allowed to claim.
 *
 * Four numbers with a line under each is the easy half. These guard the three
 * claims that make them honest: an average that is not the match it is being
 * compared against, a line that ends on the match being read, and silence where
 * nothing was measured. All three fail invisibly — a baseline dragged toward
 * zero by one withheld statistic looks exactly like a baseline, and a line
 * ending on last month's match looks exactly like a line ending on this one.
 */

const MATCH_ID = 'current';
const MATCH_DAY = '2026-03-20';

/** `n` days before the match under test, in the shape `matches.date` stores. */
function daysBefore(n: number): string {
  const day = 86_400_000;
  return new Date(Date.parse(`${MATCH_DAY}T00:00:00.000Z`) - n * day)
    .toISOString()
    .slice(0, 10);
}

/** The view returns percentages as numeric strings; absent stays absent. */
function cell(value: number | null): string | null {
  return value === null ? null : String(value);
}

/**
 * One of the player's matches, measuring first serve in and nothing else.
 *
 * `null` is a match that WITHHELD the statistic — a video-derived match that
 * published some columns and not others. It is never a match played at 0%.
 */
function firstServe(
  matchId: string,
  date: string,
  value: number | null
): PlayerStatRow {
  return { match_id: matchId, date, first_serve_pct: cell(value) };
}

/** The match the page is about — the newest date in every fixture here. */
function currentMatch(value: number | null): PlayerStatRow {
  return firstServe(MATCH_ID, MATCH_DAY, value);
}

/** A match measuring all four keys, in the order the strip shows them. */
function allFour(
  matchId: string,
  date: string,
  [firstIn, firstWon, secondWon, saved]: (number | null)[]
): PlayerStatRow {
  return {
    match_id: matchId,
    date,
    first_serve_pct: cell(firstIn),
    first_serve_won_pct: cell(firstWon),
    second_serve_won_pct: cell(secondWon),
    break_points_saved_pct: cell(saved),
  };
}

test.describe('the baseline', () => {
  test('averages the player OTHER matches, never this one', () => {
    // 100% on the day would otherwise be averaged into the figure it is about
    // to be compared against, and a one-match player would see a delta of zero
    // on every tile.
    const { baseline } = buildKpiHistory(
      [
        currentMatch(100),
        firstServe('a', daysBefore(2), 50),
        firstServe('b', daysBefore(1), 60),
      ],
      MATCH_ID
    );

    expect(baseline.firstServeIn).toBe(55);
  });

  test('drops a match that withheld the statistic instead of scoring it zero', () => {
    const { baseline } = buildKpiHistory(
      [
        currentMatch(70),
        firstServe('a', daysBefore(2), 60),
        firstServe('b', daysBefore(1), null),
      ],
      MATCH_ID
    );

    // 60, not 30. The absent match is not a match played at 0%.
    expect(baseline.firstServeIn).toBe(60);
  });

  test('keeps a real zero, which is a measurement', () => {
    const { baseline } = buildKpiHistory(
      [
        currentMatch(70),
        firstServe('a', daysBefore(2), 0),
        firstServe('b', daysBefore(1), 60),
      ],
      MATCH_ID
    );

    expect(baseline.firstServeIn).toBe(30);
  });

  test('has no key at all when nothing measured it', () => {
    const { baseline } = buildKpiHistory(
      [
        currentMatch(70),
        firstServe('a', daysBefore(2), null),
        firstServe('b', daysBefore(1), null),
      ],
      MATCH_ID
    );

    // Absent, not 0 — "we have never measured this" and "you average zero" are
    // different sentences, and the tile says different things about them.
    expect('firstServeIn' in baseline).toBe(false);
  });

  test('reports whole percent, as the label under the tile prints it', () => {
    const { baseline } = buildKpiHistory(
      [
        currentMatch(70),
        firstServe('a', daysBefore(2), 60.4),
        firstServe('b', daysBefore(1), 61.6),
      ],
      MATCH_ID
    );

    expect(baseline.firstServeIn).toBe(61);
  });
});

test.describe('the series', () => {
  test('runs oldest to newest and ends on this match', () => {
    const { series } = buildKpiHistory(
      [
        firstServe('b', daysBefore(1), 62),
        currentMatch(58),
        firstServe('a', daysBefore(9), 50),
      ],
      MATCH_ID
    );

    expect(series.firstServeIn).toEqual([50, 62, 58]);
  });

  test('covers at most this match and the seven before it', () => {
    const earlier = Array.from({ length: 12 }, (_, i) =>
      firstServe(`m${i}`, daysBefore(12 - i), 40 + i)
    );

    const { series } = buildKpiHistory([...earlier, currentMatch(70)], MATCH_ID);

    expect(series.firstServeIn).toHaveLength(KPI_SERIES_WINDOW);
    expect(series.firstServeIn).toEqual([45, 46, 47, 48, 49, 50, 51, 70]);
  });

  test('leaves out a match played after this one', () => {
    const rows = [
      firstServe('before', daysBefore(2), 50),
      currentMatch(60),
      firstServe('after', '2026-03-25', 90),
    ];

    const { baseline, series } = buildKpiHistory(rows, MATCH_ID);

    // A later match is still part of who the player is, so it counts toward the
    // average; it is not part of the run up to this match, so it is not on the
    // line that ends here.
    expect(series.firstServeIn).toEqual([50, 60]);
    expect(baseline.firstServeIn).toBe(70);
  });

  test('drops a gap rather than drawing it as zero', () => {
    const rows = [
      firstServe('a', daysBefore(3), 50),
      firstServe('b', daysBefore(2), null),
      firstServe('c', daysBefore(1), 62),
      currentMatch(58),
    ];

    const { series } = buildKpiHistory(rows, MATCH_ID);

    expect(series.firstServeIn).toEqual([50, 62, 58]);
  });

  test('is absent below two points', () => {
    const { series } = buildKpiHistory([currentMatch(58)], MATCH_ID);

    // One point is a dot, and a chart drawn through it still reads as a trend.
    expect('firstServeIn' in series).toBe(false);
  });

  test('is absent when this match is not in the set to end on', () => {
    // buildKpiHistory draws a line only if this match is among the rows — the
    // anchor its window ends on. Absent, there is no anchor and no line, and
    // that is now the whole answer: `getMatchKpiHistory` no longer manufactures
    // a bare anchor to force a right edge, so a match with no own-seat stat row
    // lands here and correctly draws nothing. A line that stopped short of this
    // match would be read as this match's trend.
    const { baseline, series } = buildKpiHistory(
      [
        firstServe('a', daysBefore(2), 50),
        firstServe('b', daysBefore(1), 60),
      ],
      MATCH_ID
    );

    expect('firstServeIn' in series).toBe(false);
    expect(baseline.firstServeIn).toBe(55);
  });
});

test.describe('one measured match', () => {
  test('yields a baseline and no line', () => {
    const { baseline, series } = buildKpiHistory(
      [currentMatch(null), firstServe('a', daysBefore(3), 58)],
      MATCH_ID
    );

    expect(baseline.firstServeIn).toBe(58);
    expect('firstServeIn' in series).toBe(false);
  });
});

test.describe('the four keys', () => {
  test('each reads its own column', () => {
    const rows = [
      allFour('a', daysBefore(1), [60, 70, 50, 40]),
      allFour(MATCH_ID, MATCH_DAY, [64, 74, 54, 44]),
    ];

    const { baseline, series } = buildKpiHistory(rows, MATCH_ID);

    expect(baseline).toEqual({
      firstServeIn: 60,
      firstServeWon: 70,
      secondServeWon: 50,
      breakPointsSaved: 40,
    });
    expect(series).toEqual({
      firstServeIn: [60, 64],
      firstServeWon: [70, 74],
      secondServeWon: [50, 54],
      breakPointsSaved: [40, 44],
    });
  });

  test('a key one source withholds goes quiet on its own', () => {
    const rows = [
      allFour('a', daysBefore(1), [60, 70, 50, null]),
      allFour(MATCH_ID, MATCH_DAY, [64, 74, 54, null]),
    ];

    const { baseline, series } = buildKpiHistory(rows, MATCH_ID);

    expect('breakPointsSaved' in baseline).toBe(false);
    expect('breakPointsSaved' in series).toBe(false);
    expect(baseline.firstServeIn).toBe(60);
    expect(series.firstServeIn).toEqual([60, 64]);
  });
});
