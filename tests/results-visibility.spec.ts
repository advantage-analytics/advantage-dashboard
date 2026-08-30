import { expect, test } from '@playwright/test';

import { buildWeekendDual, teamKpis } from '@/lib/data/team-home-server';
import { scheduleRowsFrom } from '@/lib/data/schedule-server';
import type { MatchAnalysis } from '@/lib/data/match-analysis';
import type { DbSeasonMatch } from '@/lib/data/team-home-server';
import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  ProgramEvent,
} from '@/lib/schedule/types';

/**
 * The dual sheet and the KPI strip, off a full read.
 *
 * Since `20260830120000_matches_visible_to_members.sql` the `matches` read is
 * membership-only: every program member sees every line of a dual, so there
 * is no narrower read left to guard against and no `resultsScope()` left to
 * hold. What remains worth pinning is the shape these two readers produce —
 * `buildWeekendDual`'s tally arithmetic and line structure, and
 * `scheduleRowsFrom` / `teamKpis` reading off the same entries — because nothing
 * about a wrong tally looks broken on screen; the card renders full
 * `--ink-900` numbers either way.
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

/** A decided match under a line — straight sets to whichever side is named. */
function match(id: string, winner: 'us' | 'them'): EntryMatch {
  const won = [6, 6];
  const lost = [3, 4];
  return {
    id,
    round: null,
    status: 'imported',
    score:
      winner === 'us'
        ? { player1: won, player2: lost }
        : { player1: lost, player2: won },
    opponentLabels: ['Rival Player'],
    hasVideo: false,
  };
}

function entry(
  slot: string,
  discipline: 'singles' | 'doubles',
  position: number,
  matches: EntryMatch[]
): EventEntry {
  return {
    id: `entry-${slot}`,
    eventId: EVENT.id,
    discipline,
    slot,
    position,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: [`Player ${slot}`],
    opponentLabels: ['Rival Player'],
    opponentSchool: 'Rival State',
    forfeit: null,
    matches,
  };
}

/** A finished dual the program won 4–3. */
function dual(): EventDetail {
  // 4–3: S1, S3, S5 ours, S2, S4, S6 theirs, and the doubles point ours.
  const results: [string, 'us' | 'them'][] = [
    ['S1', 'us'],
    ['S2', 'them'],
    ['S3', 'us'],
    ['S4', 'them'],
    ['S5', 'us'],
    ['S6', 'them'],
    ['D1', 'us'],
    ['D2', 'us'],
    ['D3', 'them'],
  ];

  return {
    event: EVENT,
    entries: results.map(([slot, winner], index) =>
      entry(
        slot,
        slot.startsWith('S') ? 'singles' : 'doubles',
        index,
        [match(`m-${slot}`, winner)]
      )
    ),
  };
}

test.describe('buildWeekendDual · a coach reading the whole card', () => {
  test('counts the dual the schedule counts it', () => {
    const sheet = buildWeekendDual(dual());

    // Six singles points and the one point three doubles courts fold into.
    expect(sheet?.tally).toMatchObject({
      us: 4,
      them: 3,
      decided: true,
      playedLines: 9,
      singles: { us: 3, them: 3 },
      doubles: { us: 1, them: 0 },
      clinchedBy: 'us',
    });
  });

  test('an unplayed line is still an unplayed line', () => {
    const detail = dual();
    detail.entries = detail.entries.map((e) =>
      e.slot === 'S6' ? { ...e, matches: [] } : e
    );

    const sheet = buildWeekendDual(detail);
    expect(sheet?.lines.find((line) => line.slot === 'S6')?.state).toBe(
      'empty'
    );
    expect(sheet?.tally?.decided).toBe(false);
    expect(sheet?.tally?.playedLines).toBe(8);
  });

  test('the lineup and opponent come through with the tally', () => {
    const sheet = buildWeekendDual(dual());
    expect(sheet?.lines).toHaveLength(9);
    expect(sheet?.lines.map((line) => line.slot)).toContain('S6');
    expect(sheet?.opponent).toBe('Rival State');
  });
});

// ---------------------------------------------------------------------------
// The KPI strip
// ---------------------------------------------------------------------------

/** `imported` is what `isAnalysisReady` accepts for a SwingVision row. */
const ANALYZED: MatchAnalysis = { status: 'imported', providerId: null };

/** One analyzed match in the program's season, ours in `player1`. */
function seasonMatch(id: string, date: string): DbSeasonMatch {
  return {
    id,
    player1_name: 'Ana Vasquez',
    player2_name: 'Rival Player',
    player1_id: 'ana-user',
    player2_id: null,
    event_entry_id: null,
    score: { player1: [6, 6], player2: [3, 4] },
    date,
    source_provider: 'swingvision',
    verified: true,
  };
}

const SEASON = [
  seasonMatch('m-1', '2026-03-14T00:00:00.000Z'),
  seasonMatch('m-2', '2026-03-17T00:00:00.000Z'),
  seasonMatch('m-3', '2026-03-20T00:00:00.000Z'),
];
const JOBS = new Map<string, MatchAnalysis>(
  SEASON.map((row) => [row.id, ANALYZED])
);
const ROSTER = new Set(['ana-user']);

// ---------------------------------------------------------------------------
// The schedule list
// ---------------------------------------------------------------------------

/**
 * `scheduleRowsFrom` off the same `dual()` fixture `buildWeekendDual` is
 * tested against above — the schedule list's `teamScore` is `dualScore` over
 * the same entries as the dual sheet's tally, so this covers the same
 * arithmetic from the other reader. `tests/team-home-schedule-reads.spec.ts`
 * covers the rest of the mapping.
 */
test.describe('scheduleRowsFrom · the schedule list agrees with the dual sheet', () => {
  test('a full read gets the team score', () => {
    const detail = dual();
    const [row] = scheduleRowsFrom({
      events: [detail.event],
      entriesByEvent: new Map([[detail.event.id, detail.entries]]),
    });
    expect(row.teamScore).toEqual({ us: 4, them: 3 });
  });
});

test.describe('teamKpis · the strip over a full read', () => {
  test('gets its tiles', () => {
    const tiles = teamKpis(SEASON, JOBS, [], [], ROSTER);

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.find((tile) => tile.key === 'matches-analyzed')?.value).toBe(
      '3'
    );
  });
});
