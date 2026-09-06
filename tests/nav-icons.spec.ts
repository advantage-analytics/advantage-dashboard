import { expect, test } from '@playwright/test';
import { ChartLine, UsersRound } from 'lucide-react';

import { PERSONAL_NAV, TEAM_NAV } from '@/lib/dashboard/nav';

/**
 * Nav data regression: the icon swap (ChartLine for Statistics, UsersRound
 * for Roster) and the `comingSoon` flag placement are both easy to silently
 * drift — a copy-pasted entry keeps the old icon, or a new route picks up
 * `comingSoon` it shouldn't. This locks both down against the nav data
 * directly rather than rendered output.
 */
test.describe('nav data: icons and comingSoon flags', () => {
  test('both Statistics entries use ChartLine', () => {
    const personalStatistics = PERSONAL_NAV.find(
      (link) => link.name === 'Statistics'
    );
    const teamStatistics = TEAM_NAV.find((link) => link.name === 'Statistics');

    expect(personalStatistics?.icon).toBe(ChartLine);
    expect(teamStatistics?.icon).toBe(ChartLine);
  });

  test('Roster uses UsersRound', () => {
    const roster = TEAM_NAV.find((link) => link.name === 'Roster');
    expect(roster?.icon).toBe(UsersRound);
  });

  test('exactly four routes are flagged comingSoon', () => {
    const flaggedHrefs = [...PERSONAL_NAV, ...TEAM_NAV]
      .filter((link) => link.comingSoon)
      .map((link) => link.href)
      .sort();

    expect(flaggedHrefs).toEqual(
      [
        '/dashboard/statistics',
        '/dashboard/ask',
        '/dashboard/team/statistics',
        '/dashboard/team/ask',
      ].sort()
    );
  });
});
