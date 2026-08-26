import { expect, test } from '@playwright/test';

import {
  isNarrowedToViewer,
  resultsScope,
  type ResultsScope,
} from '@/lib/data/results-visibility';
import { buildWeekendDual, teamKpis } from '@/lib/data/team-home-server';
import type { MatchAnalysis } from '@/lib/data/match-analysis';
import type { DbSeasonMatch } from '@/lib/data/team-home-server';
import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  ProgramEvent,
} from '@/lib/schedule/types';

/**
 * Team Home's refusal to report a subset as if it were the program.
 *
 * The failure this guards is not an access breach — no teammate's row reaches
 * the wrong login. It is a **confidently wrong number**, which is worse to find
 * because nothing on the page looks broken while it happens:
 * `program_event_entries` is visible to every member, the RESULT lives on
 * `matches` under a stricter policy, and `programs.roster_visible` is
 * `not null default false`. So a player on an ordinary program reads all nine
 * lines of a dual and receives exactly one match — and `dualScore()` counted
 * over that answers **0–1** on a dual the team won 4–3, with six played lines
 * reported as "Not played" and the KPI strip printing that one player's season
 * under labels reading "Team".
 *
 * Every assertion below is about the loader refusing, because the loader is the
 * only place that can: by the time a `WeekendDual` or a `TeamKpiTile[]` reaches
 * a component there is nothing left in it that says how many rows RLS withheld.
 */

const PROGRAM: ResultsScope = 'program';
const OWN: ResultsScope = 'own';

test.describe('resultsScope · which read the caller is holding', () => {
  test('staff always read the program', () => {
    // Three spellings of staff, because `program_members.role` has three and
    // the policy's `is_program_staff` covers all of them. A rule written as
    // `role === 'coach'` would narrow an owner's page.
    for (const role of ['owner', 'coach', 'staff'] as const) {
      expect(resultsScope({ role, rosterVisible: false })).toBe(PROGRAM);
      expect(resultsScope({ role, rosterVisible: true })).toBe(PROGRAM);
    }
  });

  test('a player reads the program only where the flag opens it', () => {
    expect(resultsScope({ role: 'player', rosterVisible: true })).toBe(PROGRAM);
  });

  test('a player on a closed program reads their own rows and nothing else', () => {
    // The default case, not the edge: `roster_visible boolean not null default
    // false` (`20260817073914_programs.sql:83`). Every program starts here.
    expect(resultsScope({ role: 'player', rosterVisible: false })).toBe(OWN);
  });

  test('isNarrowedToViewer names the one scope that cannot be reported', () => {
    expect(isNarrowedToViewer(OWN)).toBe(true);
    expect(isNarrowedToViewer(PROGRAM)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The dual sheet
// ---------------------------------------------------------------------------

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
    matches,
  };
}

/**
 * A finished dual the program won 4–3, and the ONE line a restricted player
 * gets back from it.
 *
 * `visible` is the slot whose match survives RLS. Every other entry arrives
 * with its lineup intact and an empty `matches` array — which is exactly what
 * an unplayed line looks like, and the whole reason the scope has to be
 * established before anything is counted.
 */
function dual(visible: string | null): EventDetail {
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
        visible === null || visible === slot ? [match(`m-${slot}`, winner)] : []
      )
    ),
  };
}

test.describe('buildWeekendDual · a coach reading the whole card', () => {
  test('counts the dual the schedule counts it', () => {
    const sheet = buildWeekendDual(dual(null), PROGRAM);

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

  test('every line is readable, because every line came back', () => {
    const sheet = buildWeekendDual(dual(null), PROGRAM);
    expect(sheet?.lines.every((line) => line.readable)).toBe(true);
  });

  test('an unplayed line on a full read is still an unplayed line', () => {
    // The scope must not turn "nobody has played this" into "you may not see
    // it". A coach's empty S6 has always meant the court is waiting, and the
    // sheet's "Not played" is the true thing to say about it.
    const detail = dual(null);
    detail.entries = detail.entries.map((e) =>
      e.slot === 'S6' ? { ...e, matches: [] } : e
    );

    const sheet = buildWeekendDual(detail, PROGRAM);
    expect(sheet?.lines.find((line) => line.slot === 'S6')?.readable).toBe(true);
    expect(sheet?.tally?.decided).toBe(false);
    expect(sheet?.tally?.playedLines).toBe(8);
  });
});

test.describe('buildWeekendDual · a player who was handed one line of nine', () => {
  test('is given no tally at all rather than the one counted from their line', () => {
    const sheet = buildWeekendDual(dual('S3'), OWN);

    // The number that would otherwise render in full `--ink-900`: `dualScore`
    // over this read returns 1–0, and `anyPoint` is true the moment either
    // side is non-zero, so the card would print a confident score for a dual
    // it can see one ninth of. Null is the only honest answer, and it is the
    // type that makes it unrenderable rather than merely discouraged.
    expect(sheet?.tally).toBeNull();
  });

  test('the line they played is theirs to read', () => {
    const sheet = buildWeekendDual(dual('S3'), OWN);
    const own = sheet?.lines.find((line) => line.slot === 'S3');

    expect(own?.readable).toBe(true);
    expect(own?.won).toBe(true);
    expect(own?.sets.length).toBeGreaterThan(0);
  });

  test('the eight they cannot read make no claim about the court', () => {
    const sheet = buildWeekendDual(dual('S3'), OWN);
    const others = sheet?.lines.filter((line) => line.slot !== 'S3') ?? [];

    expect(others).toHaveLength(8);
    // Not "Not played" — that is a fact about the court, and this is a fact
    // about the reader. `state` stays `empty` because the entry genuinely
    // carries no match; `readable` is what stops the sheet spelling it.
    expect(others.every((line) => line.readable)).toBe(false);
    expect(others.every((line) => line.state === 'empty')).toBe(true);
  });

  test('still hands over the lineup, which is theirs to see', () => {
    // `program_event_entries` is visible to every member and the schedule page
    // already shows a player their lineup. Withholding the tally is not a
    // reason to withhold the card.
    const sheet = buildWeekendDual(dual('S3'), OWN);
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

test.describe('teamKpis · the strip is the program or it is nothing', () => {
  test('a full read gets its tiles', () => {
    const tiles = teamKpis(SEASON, JOBS, [], [], ROSTER, PROGRAM);

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.find((tile) => tile.key === 'matches-analyzed')?.value).toBe(
      '3'
    );
  });

  test('a narrowed read gets none, on identical rows', () => {
    // The same three rows, and they are real: three analyzed matches, three
    // wins, a computable sets-won mean. Every figure would render, every one
    // would be one player's, and every label would say the program's. There is
    // no caveat that fixes that — `sampleNote()` fires only under
    // `SMALL_SAMPLE_MIN`, so a player with five of their own matches gets no
    // warning at all — so the strip is withheld, which is the answer the
    // Roster page already gives to the same flag.
    expect(teamKpis(SEASON, JOBS, [], [], ROSTER, OWN)).toEqual([]);
  });
});
