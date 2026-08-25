import { expect, test } from '@playwright/test';

import {
  rosterProgress,
  teamAttention,
  type RosterProgress,
} from '@/lib/data/team-home-server';
import { playersLabel } from '@/components/dashboard/team/roster-vocabulary';
import { INVITE_TTL_HOURS } from '@/lib/services/programs/tokens';

/**
 * Who Team Home's setup checklist thinks is on the roster.
 *
 * The failure this guards is the quietest kind: nothing errors, nothing renders
 * broken, and a coach who has finished building their squad is told to go and
 * build it. `rosterProgress` used to count SEATS — `program_members` rows — and
 * a coach-managed player has none. They are a `program_players` row with no
 * login, which is how most rosters on this product are built: a coach adds
 * fourteen names in August and uploads for all of them before a single one has
 * an account. Counted as seats that program has nobody, so "Your team" stayed
 * on "Build your roster" through a whole season.
 *
 * So the fixtures below are `program_roster_full` rows — the RPC the loader
 * already reads for match attribution, and the only one that returns a
 * coach-managed player — and each is pinned against the seat list it would have
 * been counted from, so this can never quietly become a test of a program that
 * happens to have both.
 */

/** A `program_roster_full` row, cut down to what the count reads. */
type RosterRow = { role: string; managed_by: 'coach' | 'self' };

/** A `program_members` seat, cut down the same way. */
type Seat = { role: string };

/** Wednesday 26 Aug 2026, 12:00 UTC — the read's one clock. */
const NOW = Date.parse('2026-08-26T12:00:00.000Z');

/** One day, for fixtures that are written as an offset from it. */
const day = 86_400_000;

/**
 * A program built entirely by hand: four players, not one login among them,
 * and the two staff seats belonging to the people who built it.
 */
const COACH_BUILT: RosterRow[] = [
  { role: 'player', managed_by: 'coach' },
  { role: 'player', managed_by: 'coach' },
  { role: 'player', managed_by: 'coach' },
  { role: 'player', managed_by: 'coach' },
  { role: 'owner', managed_by: 'self' },
  { role: 'coach', managed_by: 'self' },
];

/** The same program's seats. Staff only — which is the whole bug. */
const COACH_BUILT_SEATS: Seat[] = [
  { role: 'owner' },
  { role: 'coach' },
];

/**
 * The Roster page's own count, transcribed from
 * `app/dashboard/team/roster/page.tsx`. Restated here rather than imported,
 * because the point of the assertions below is that the two agree — a shared
 * helper would make them agree by construction and prove nothing.
 */
function rosterPageCount(rows: RosterRow[]): number {
  return rows.filter((m) => m.role === 'player').length;
}

test.describe('rosterProgress · a roster built entirely of coach-managed profiles', () => {
  test('the fixture is the shape the bug needs: players on the roster, none in the seat list', () => {
    expect(rosterPageCount(COACH_BUILT)).toBe(4);
    expect(COACH_BUILT.every((row) => row.role !== 'player' || row.managed_by === 'coach')).toBe(true);
    expect(COACH_BUILT_SEATS.filter((seat) => seat.role === 'player')).toHaveLength(0);

    // The bug in one line: handed the seat list, the same function answers that
    // this program has no players at all. `getTeamHomeData` hands it the
    // `program_roster_full` rows instead, which is the fix.
    expect(rosterProgress(COACH_BUILT_SEATS, [], NOW).players).toBe(0);
  });

  test('counts them, so the checklist card can show its done receipt', () => {
    const progress = rosterProgress(COACH_BUILT, [], NOW);

    // The criterion this test exists for: a program with a full squad and no
    // logins is not zero players, and "Your team" must not go on asking for
    // invitations nobody needs to send.
    expect(progress.players).toBeGreaterThan(0);
    expect(progress.players).toBe(4);
    expect(progress.outstanding).toBe(0);
  });

  test('reports the number the coach reads on /dashboard/team/roster, in the same words', () => {
    const progress = rosterProgress(COACH_BUILT, [], NOW);

    expect(progress.players).toBe(rosterPageCount(COACH_BUILT));
    expect(playersLabel(progress.players)).toBe('4 players');
  });
});

test.describe('rosterProgress · who counts as a player', () => {
  test('staff seats are excluded — four coaches and no squad is not a built roster', () => {
    // The reason the exclusion is here at all: a program with four coaches and
    // no roster is not 0% of the way to being set up, it is at the start.
    const staffOnly: RosterRow[] = [
      { role: 'owner', managed_by: 'self' },
      { role: 'coach', managed_by: 'self' },
      { role: 'coach', managed_by: 'self' },
      { role: 'staff', managed_by: 'self' },
    ];

    expect(rosterProgress(staffOnly, [], NOW).players).toBe(0);
  });

  test('claimed and unclaimed profiles are one roster, not two', () => {
    const mixed: RosterRow[] = [
      { role: 'player', managed_by: 'coach' },
      { role: 'player', managed_by: 'self' },
      { role: 'player', managed_by: 'coach' },
      { role: 'coach', managed_by: 'self' },
    ];

    // Claiming a profile binds a login to a row that was already on the roster.
    // It does not add a player, and the count must not move when it happens.
    expect(rosterProgress(mixed, [], NOW).players).toBe(3);
  });
});

test.describe('rosterProgress · outstanding invitations', () => {
  test('counts player invitations only, and does not fold them into the roster', () => {
    const invites = [
      { role: 'player', createdAt: new Date(NOW - day).toISOString() },
      { role: 'coach', createdAt: new Date(NOW - day).toISOString() },
    ];

    const progress = rosterProgress(COACH_BUILT, invites, NOW);

    // Four on the roster and one person still to answer — two separate facts,
    // and the receipt prints them as two separate clauses.
    expect(progress.players).toBe(4);
    expect(progress.outstanding).toBe(1);
  });

  test('a program with nobody yet but invitations out is still past the ask', () => {
    const invites = [
      { role: 'player', createdAt: new Date(NOW - day).toISOString() },
    ];

    const staffOnly: RosterRow[] = [{ role: 'owner', managed_by: 'self' }];
    const progress = rosterProgress(staffOnly, invites, NOW);

    expect(progress.players).toBe(0);
    expect(progress.outstanding).toBe(1);
  });
});

/**
 * The countdown on those invitations, and the one alert that reads it.
 *
 * `expiringSoon` and `expiringInDays` have exactly one reader in the codebase —
 * `teamAttention()`'s `invites-expiring` row — so the contract is only half
 * testable from `rosterProgress` alone, and both halves are asserted here.
 *
 * The bug: the filter was `expiry <= horizon`, which an expiry six days in the
 * PAST satisfies as readily as one two days in the future, and the countdown's
 * `Math.max(0, …)` then turned the negative day count into 0. An invitation
 * that lapsed last month pinned "One invite expires today" to Needs attention
 * every morning until somebody withdrew it — the exact alert that teaches a
 * coach the list is not worth reading.
 *
 * Fixtures are written as "an invitation whose link dies at X" and the
 * `created_at` the loader actually reads is derived backwards from it, so a
 * change to `INVITE_TTL_HOURS` moves the fixtures with it rather than quietly
 * turning a live invitation into a lapsed one.
 */

const TTL_MS = INVITE_TTL_HOURS * 60 * 60 * 1000;

/** A player invitation whose link stops working at `expiresAt`. */
function inviteExpiringAt(expiresAt: number) {
  return { role: 'player', createdAt: new Date(expiresAt - TTL_MS).toISOString() };
}

/** The `invites-expiring` row, or undefined when the list does not raise one. */
function inviteAlert(progress: RosterProgress, now: number) {
  return teamAttention([], progress, now).find((alert) => alert.kind === 'invite-expiring');
}

test.describe('rosterProgress · an invitation that has already expired', () => {
  /** Sent 20 days ago on a 14-day TTL: dead for six days and still on the card. */
  const LAPSED = [inviteExpiringAt(NOW - 6 * day)];

  test('is not counted as expiring — it has expired, which is a different fact', () => {
    const progress = rosterProgress(COACH_BUILT, LAPSED, NOW);

    expect(progress.expiringSoon).toBe(0);
    expect(progress.expiringInDays).toBeNull();
  });

  test('the alert list does not claim it expires today, or on any other day', () => {
    const progress = rosterProgress(COACH_BUILT, LAPSED, NOW);
    const alert = inviteAlert(progress, NOW);

    // The whole point of the task: no row at all, and in particular not the
    // one that read "One invite expires today" for the rest of the season.
    expect(alert).toBeUndefined();
    expect(teamAttention([], progress, NOW)).toHaveLength(0);
  });

  test('still counts as outstanding, so the card and the alert agree about it', () => {
    const progress = rosterProgress(COACH_BUILT, LAPSED, NOW);

    // The roster card lists every unaccepted invitation as "N invites pending"
    // with a Resend beside it and has no word for an expired one. Dropping the
    // lapsed row from `outstanding` too would leave the card showing a person
    // the checklist had stopped counting — two answers about one invitation,
    // which is what criterion 4 forbids. One voice, the card's.
    expect(progress.outstanding).toBe(1);
    expect(inviteAlert(progress, NOW)).toBeUndefined();
  });

  test('reaching its expiry instant is already expired — the line the database draws', () => {
    // `accept_program_invite` refuses on `expires_at <= now()`, so an
    // invitation whose instant is exactly `now` opens nothing. It must not be
    // advertised as expiring today either.
    const progress = rosterProgress(COACH_BUILT, [inviteExpiringAt(NOW)], NOW);

    expect(progress.expiringSoon).toBe(0);
    expect(progress.expiringInDays).toBeNull();
    expect(inviteAlert(progress, NOW)).toBeUndefined();
  });

  test('does not silence a live invitation sent beside it', () => {
    const invites = [...LAPSED, inviteExpiringAt(NOW + 2 * day)];
    const progress = rosterProgress(COACH_BUILT, invites, NOW);

    // Both are pending; only one still has a clock. The filter must drop the
    // dead one without taking the live one with it.
    expect(progress.outstanding).toBe(2);
    expect(progress.expiringSoon).toBe(1);
    expect(inviteAlert(progress, NOW)?.subject).toBe('One invite expires in 2 days');
  });
});

test.describe('rosterProgress · "today" and "tomorrow" mean what they say', () => {
  test('an invitation dying later today is the one case that prints "today"', () => {
    // 12:00 on the read's clock, expiring at 18:00 the same day.
    const progress = rosterProgress(COACH_BUILT, [inviteExpiringAt(NOW + 6 * 3_600_000)], NOW);

    expect(progress.expiringInDays).toBe(0);
    expect(inviteAlert(progress, NOW)?.subject).toBe('One invite expires today');
  });

  test('a late-evening read does not call tomorrow morning today', () => {
    // 23:00 Wednesday, expiring 10:00 Thursday. Eleven hours away — under one
    // elapsed day, which is what used to floor it to 0 and print "today" on a
    // day the invitation outlives.
    const lateNow = Date.parse('2026-08-26T23:00:00.000Z');
    const invites = [inviteExpiringAt(Date.parse('2026-08-27T10:00:00.000Z'))];
    const progress = rosterProgress(COACH_BUILT, invites, lateNow);

    expect(progress.expiringInDays).toBe(1);
    expect(inviteAlert(progress, lateNow)?.subject).toBe('One invite expires tomorrow');
  });

  test('nothing outstanding leaves the countdown null and the list empty', () => {
    const progress = rosterProgress(COACH_BUILT, [], NOW);

    expect(progress.expiringSoon).toBe(0);
    expect(progress.expiringInDays).toBeNull();
    expect(teamAttention([], progress, NOW)).toHaveLength(0);
  });
});
