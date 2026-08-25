import { expect, test } from '@playwright/test';

import { rosterProgress } from '@/lib/data/team-home-server';
import { playersLabel } from '@/components/dashboard/team/roster-vocabulary';

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
  const day = 86_400_000;

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
