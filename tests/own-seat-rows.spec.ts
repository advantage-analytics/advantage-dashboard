import { expect, test } from '@playwright/test';

import {
  ownSeatRows,
  type RawStatRow,
  type SeatMatch,
} from '@/lib/data/match-stats-server';

/**
 * Which stat row is a player's OWN.
 *
 * `fetchPlayerStatRows` reads both seats of every match a player appears in and
 * hands the rows here to be narrowed to one per match — the seat the recorder
 * actually put the player on. That narrowing is where a season is attributed or
 * misattributed, and it fails silently: the opponent's row is a real row of real
 * numbers, so keeping it in place of the player's own would draw a plausible
 * history of the wrong person, and a seat-two match keyed as if it were seat one
 * simply vanishes, stopping the sparkline above it one match short with nothing
 * on screen to say so. These pin the seat rule against plain objects, no
 * database.
 */

const ME = 'me';
/** A claimed athlete also owns a roster profile; their matches carry either. */
const MY_PROFILE = 'my-roster-profile';
const STRANGER = 'stranger';
const OPPONENT = 'opponent';

/** A match with whatever sits in each id column. */
function match(
  id: string,
  player1_id: string | null,
  player2_id: string | null,
  date: string | null = '2026-03-01'
): SeatMatch {
  return { id, player1_id, player2_id, date };
}

/**
 * One seat's stat row. `mark` is a first-serve reading unique to the row, so a
 * test can prove WHICH seat survived rather than only that one did. `null` is a
 * withheld statistic — never a match played at 0%.
 */
function statRow(
  match_id: string,
  is_player1: boolean,
  mark: number | null
): RawStatRow {
  return {
    match_id,
    is_player1,
    first_serve_pct: mark === null ? null : String(mark),
  };
}

/** Result rows keyed by match, down to the one reading that tells seats apart. */
function markByMatch(rows: { match_id: string; first_serve_pct?: unknown }[]) {
  return Object.fromEntries(rows.map((r) => [r.match_id, r.first_serve_pct]));
}

test.describe('the seat a row belongs to', () => {
  test('keeps the seat-one row and drops the opponent on a seat-one match', () => {
    const rows = ownSeatRows(
      [match('m', ME, OPPONENT)],
      [statRow('m', true, 60), statRow('m', false, 20)],
      [ME]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].first_serve_pct).toBe('60');
  });

  test('keeps the seat-two row when the player was entered second — the bug', () => {
    // The match the page is open on has the player in the SECOND column. The old
    // rule kept only `is_player1 = true`, so this match left the set entirely and
    // the sparkline ended one match early under a headline drawn from this row.
    const rows = ownSeatRows(
      [match('m', OPPONENT, ME)],
      [statRow('m', true, 20), statRow('m', false, 55)],
      [ME]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].first_serve_pct).toBe('55');
    expect(rows[0].match_id).toBe('m');
  });

  test('resolves each match on its own side across a mixed history', () => {
    // Player one, player two, player one — every match carries both seats' rows.
    const matches = [
      match('a', ME, OPPONENT, '2026-01-01'),
      match('b', OPPONENT, ME, '2026-02-01'),
      match('c', ME, OPPONENT, '2026-03-01'),
    ];
    const stats = [
      statRow('a', true, 51),
      statRow('a', false, 20),
      statRow('b', true, 20),
      statRow('b', false, 52),
      statRow('c', true, 53),
      statRow('c', false, 20),
    ];

    const rows = ownSeatRows(matches, stats, [ME]);

    expect(rows).toHaveLength(3);
    expect(markByMatch(rows)).toEqual({ a: '51', b: '52', c: '53' });
  });

  test('matches a player known by login OR roster profile, on either seat', () => {
    // The login sits in seat one of one match, the profile in seat two of
    // another. Both are this player; both matches contribute their own side.
    const matches = [
      match('login-match', ME, OPPONENT),
      match('profile-match', OPPONENT, MY_PROFILE),
    ];
    const stats = [
      statRow('login-match', true, 60),
      statRow('login-match', false, 20),
      statRow('profile-match', true, 20),
      statRow('profile-match', false, 66),
    ];

    const rows = ownSeatRows(matches, stats, [ME, MY_PROFILE]);

    expect(markByMatch(rows)).toEqual({
      'login-match': '60',
      'profile-match': '66',
    });
  });
});

test.describe('a seat is never inferred from absence', () => {
  test('drops a match with the player in neither column', () => {
    // Both ids are strangers — someone else's upload, a team schedule row. Its
    // rows are readable but not this player's.
    const rows = ownSeatRows(
      [match('m', STRANGER, OPPONENT)],
      [statRow('m', true, 40), statRow('m', false, 45)],
      [ME]
    );

    expect(rows).toEqual([]);
  });

  test('drops a both-null match rather than reading it as seat one', () => {
    // `player2_id` is null in bulk, so "not seat one" can never stand in for
    // "seat two"; a row with both columns null is nobody's here.
    const rows = ownSeatRows(
      [match('m', null, null)],
      [statRow('m', true, 40), statRow('m', false, 45)],
      [ME]
    );

    expect(rows).toEqual([]);
  });

  test('drops a stranger in seat one with an empty seat two, never defaulting', () => {
    // The dangerous shape: seat one taken by someone else, seat two empty. A
    // rule that fell back to "then seat two must be me" would attribute a
    // stranger's match. `playerSeat` returns null and the match is dropped.
    const rows = ownSeatRows(
      [match('m', STRANGER, null)],
      [statRow('m', true, 40)],
      [ME]
    );

    expect(rows).toEqual([]);
  });
});

test.describe('the degenerate both-ids case', () => {
  test('prefers seat one and keeps exactly one row', () => {
    // A match recorded against oneself: the page's headline is drawn from seat
    // one, so the anchor the sparkline ends on must be the seat-one row too.
    const rows = ownSeatRows(
      [match('m', ME, ME)],
      [statRow('m', true, 61), statRow('m', false, 62)],
      [ME]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].first_serve_pct).toBe('61');
  });
});

test.describe('rows and matches that do not line up', () => {
  test('drops a stat row whose match is not in the set', () => {
    // A stat row whose match_id is not among the matches never entered through
    // the match read, so it has no seat to resolve and contributes nothing.
    const rows = ownSeatRows(
      [match('known', ME, OPPONENT)],
      [statRow('known', true, 60), statRow('unknown', true, 99)],
      [ME]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].match_id).toBe('known');
  });

  test('a match with no stat rows contributes nothing', () => {
    const rows = ownSeatRows(
      [match('a', ME, OPPONENT), match('b', ME, OPPONENT)],
      [statRow('a', true, 60)],
      [ME]
    );

    expect(rows.map((r) => r.match_id)).toEqual(['a']);
  });
});

test.describe('the shape the consumers read', () => {
  test('carries the match date onto the row', () => {
    const rows = ownSeatRows(
      [match('m', ME, OPPONENT, '2026-02-14')],
      [statRow('m', true, 60)],
      [ME]
    );

    expect(rows[0].date).toBe('2026-02-14');
  });

  test('keeps a null match date null, not the epoch', () => {
    // A row with no date is dropped from the ordered window later, not placed at
    // time zero — so the null has to survive to here intact.
    const rows = ownSeatRows(
      [match('m', ME, OPPONENT, null)],
      [statRow('m', true, 60)],
      [ME]
    );

    expect(rows[0].date).toBeNull();
  });

  test('strips is_player1 from the output', () => {
    // The seat it marked is spent, and `PlayerStatRow`'s cells are
    // string | number | null — a boolean has no place among the measurements.
    const rows = ownSeatRows(
      [match('m', OPPONENT, ME)],
      [statRow('m', false, 55)],
      [ME]
    );

    expect('is_player1' in rows[0]).toBe(false);
  });

  test('carries a null cell through untouched, never coalesced to zero', () => {
    // A match that withheld the statistic published null; the mean and the line
    // drop it rather than score it 0, so it must arrive here still null.
    const rows = ownSeatRows(
      [match('m', ME, OPPONENT)],
      [statRow('m', true, null)],
      [ME]
    );

    expect(rows[0].first_serve_pct).toBeNull();
  });
});

test.describe('nothing to attribute to', () => {
  test('empty playerIds yields no rows', () => {
    const rows = ownSeatRows(
      [match('m', ME, OPPONENT)],
      [statRow('m', true, 60)],
      []
    );

    expect(rows).toEqual([]);
  });
});
