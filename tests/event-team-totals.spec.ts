import { expect, test } from '@playwright/test';

import { sumTeamTotals, type TeamTotalRow } from '@/lib/data/event-team-totals';

/**
 * The event totals' arithmetic, against figures worked out by hand.
 *
 * Imported from the PURE module, never from `event-team-totals-server.ts`:
 * that one pulls `@/lib/supabase/server`, which reaches `next/headers` at
 * module load, and a spec that needs a request context to check a sum is a
 * spec that will be deleted the first time it breaks.
 *
 * Worth pinning because nothing about a wrong total looks wrong on screen. A
 * pooled ratio and a mean of per-match percentages differ by a few points on a
 * real weekend — enough to change what a coach concludes, not enough to read as
 * a bug — and a denominator of zero rendering as `0%` states that the team
 * missed every first serve when the truth is that nobody measured one.
 */

/** One side of one match. Every column the sums consume, spelled out. */
function row(
  matchId: string,
  isPlayer1: boolean,
  counts: Omit<TeamTotalRow, 'match_id' | 'is_player1'>
): TeamTotalRow {
  return { match_id: matchId, is_player1: isPlayer1, ...counts };
}

/**
 * Two matches, both sides, chosen so every figure divides by hand:
 *
 *   ours   first serves 60 + 40 = 100, in 36 + 24 = 60          → 60.0%
 *          first-serve points won 27 + 15 = 42, of 60 in        → 70.0%
 *          break points 3 + 1 of 8 + 4                          → 4 of 12
 *          points won 55 + 38 = 93, of 100 + 80 = 180           → 51.7%
 *
 *   theirs first serves 50 + 30 = 80, in 30 + 15 = 45           → 56.3%
 *          first-serve points won 21 + 9 = 30, of 45 in         → 66.7%
 *          break points 2 + 4 of 6 + 5                          → 6 of 11
 *          points won 45 + 42 = 87, of 100 + 80 = 180           → 48.3%
 */
const WEEKEND: TeamTotalRow[] = [
  row('m-1', true, {
    first_serves: 60,
    first_serves_in: 36,
    first_serve_points_won: 27,
    break_point_opportunities: 8,
    break_points_converted: 3,
    total_points: 100,
    total_points_won: 55,
  }),
  row('m-1', false, {
    first_serves: 50,
    first_serves_in: 30,
    first_serve_points_won: 21,
    break_point_opportunities: 6,
    break_points_converted: 2,
    total_points: 100,
    total_points_won: 45,
  }),
  row('m-2', true, {
    first_serves: 40,
    first_serves_in: 24,
    first_serve_points_won: 15,
    break_point_opportunities: 4,
    break_points_converted: 1,
    total_points: 80,
    total_points_won: 38,
  }),
  row('m-2', false, {
    first_serves: 30,
    first_serves_in: 15,
    first_serve_points_won: 9,
    break_point_opportunities: 5,
    break_points_converted: 4,
    total_points: 80,
    total_points_won: 42,
  }),
];

test.describe('sumTeamTotals · a weekend as one pool of points', () => {
  test('our side sums to the hand figures', () => {
    const totals = sumTeamTotals(WEEKEND);

    expect(totals.ours).toEqual({
      firstServeInPct: 60,
      firstServeWonPct: 70,
      breakPoints: { converted: 4, opportunities: 12 },
      pointsWonPct: 51.7,
    });
  });

  test('the opponent side sums to its own hand figures', () => {
    const totals = sumTeamTotals(WEEKEND);

    expect(totals.theirs).toEqual({
      firstServeInPct: 56.3,
      firstServeWonPct: 66.7,
      breakPoints: { converted: 6, opportunities: 11 },
      pointsWonPct: 48.3,
    });
  });

  test('matchesCounted is distinct matches, not rows', () => {
    // Four rows, two matches — a side is not a match.
    expect(sumTeamTotals(WEEKEND).matchesCounted).toBe(2);
  });

  test('a pooled ratio is not the mean of the per-match percentages', () => {
    // Our two matches serve 36/60 = 60% and 24/40 = 60%, so the serve figure
    // agrees either way — points do not. Per match we won 55% and 47.5%, whose
    // mean is 51.25%; pooled over 180 points it is 51.7%. The pooled one is
    // what this function must return, or the shorter match counts as heavily as
    // the longer one under a label that says otherwise.
    expect(sumTeamTotals(WEEKEND).ours.pointsWonPct).toBe(51.7);
    expect(sumTeamTotals(WEEKEND).ours.pointsWonPct).not.toBe(51.3);
  });

  test('no rows means every figure is absent, not zero', () => {
    expect(sumTeamTotals([])).toEqual({
      ours: {
        firstServeInPct: null,
        firstServeWonPct: null,
        breakPoints: null,
        pointsWonPct: null,
      },
      theirs: {
        firstServeInPct: null,
        firstServeWonPct: null,
        breakPoints: null,
        pointsWonPct: null,
      },
      matchesCounted: 0,
    });
  });
});

test.describe('sumTeamTotals · absent is never zero percent', () => {
  /** A match whose serve columns were withheld but whose points were not. */
  const WITHHELD: TeamTotalRow[] = [
    row('m-3', true, {
      first_serves: null,
      first_serves_in: null,
      first_serve_points_won: null,
      break_point_opportunities: null,
      break_points_converted: null,
      total_points: 40,
      total_points_won: 22,
    }),
  ];

  test('a null-only denominator yields null, while a measured one still divides', () => {
    const totals = sumTeamTotals(WITHHELD);

    expect(totals.ours.firstServeInPct).toBeNull();
    expect(totals.ours.firstServeWonPct).toBeNull();
    expect(totals.ours.breakPoints).toBeNull();
    // The one column that WAS measured is unaffected by the absent ones.
    expect(totals.ours.pointsWonPct).toBe(55);
    // A row is a match even when most of its columns are absent.
    expect(totals.matchesCounted).toBe(1);
  });

  test('a genuine zero is a figure, an unmeasured denominator is not', () => {
    const played = sumTeamTotals([
      row('m-4', true, {
        first_serves: 40,
        first_serves_in: 0,
        first_serve_points_won: 0,
        break_point_opportunities: 5,
        break_points_converted: 0,
        total_points: 50,
        total_points_won: 0,
      }),
    ]).ours;

    // 0 of 40 first serves in is a real, terrible 0% — not null.
    expect(played.firstServeInPct).toBe(0);
    expect(played.pointsWonPct).toBe(0);
    // 0 for 5 on break points is a real fraction, not an absent one.
    expect(played.breakPoints).toEqual({ converted: 0, opportunities: 5 });
    // But nothing landed, so there is no first-serve-won percentage to state.
    expect(played.firstServeWonPct).toBeNull();
  });

  test('null terms add nothing rather than dragging a sum down', () => {
    const mixed = sumTeamTotals([
      row('m-5', true, {
        first_serves: 20,
        first_serves_in: 12,
        first_serve_points_won: 9,
        break_point_opportunities: 3,
        break_points_converted: 2,
        total_points: 30,
        total_points_won: 18,
      }),
      row('m-6', true, {
        first_serves: null,
        first_serves_in: null,
        first_serve_points_won: null,
        break_point_opportunities: null,
        break_points_converted: null,
        total_points: null,
        total_points_won: null,
      }),
    ]).ours;

    // Identical to the measured match alone: 12/20, 9/12, 2 of 3, 18/30.
    expect(mixed).toEqual({
      firstServeInPct: 60,
      firstServeWonPct: 75,
      breakPoints: { converted: 2, opportunities: 3 },
      pointsWonPct: 60,
    });
  });
});

test.describe('sumTeamTotals · which side is ours', () => {
  test('is_player1 true is ours and everything else is theirs', () => {
    const totals = sumTeamTotals(WEEKEND);

    // The two sides must not be interchangeable — a reader that flips them
    // prints the opponent's serve percentage under the program's name.
    expect(totals.ours.breakPoints).toEqual({ converted: 4, opportunities: 12 });
    expect(totals.theirs.breakPoints).toEqual({
      converted: 6,
      opportunities: 11,
    });
  });
});
