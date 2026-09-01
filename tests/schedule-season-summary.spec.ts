import { expect, test } from '@playwright/test';

import { seasonSummaryFrom } from '@/lib/data/schedule-server';
import type { ProgramSchedule } from '@/lib/data/schedule-server';
import type { AnalysisStatus } from '@/lib/data/match-analysis';
import type {
  EntryMatch,
  EventEntry,
  EventKind,
  ProgramEvent,
} from '@/lib/schedule/types';

/**
 * The schedule page's season block, derived.
 *
 * Three figures on one line — a form strip, "3–1 in duals" and "31 of 36 lines
 * analyzed" — and all three fail silently. A form mark is a filled circle
 * either way, a record is a confident pair of numbers whether or not it counted
 * the right events, and a coverage ratio reads perfectly well at 100% because
 * its denominator quietly shrank. Nothing on screen looks broken in any of
 * those cases, which is why the boundaries live here rather than in the
 * reader's head.
 *
 * Pure over an already-read `ProgramSchedule`: no database, no dev server.
 */

function event(
  id: string,
  kind: EventKind,
  startsOn: string
): ProgramEvent {
  return {
    id,
    programId: 'prog',
    kind,
    name: kind === 'dual' ? 'Rival State' : 'Ridgeline Invitational',
    startsOn,
    endsOn: startsOn,
    site: 'home',
    surface: 'hard',
    host: null,
    format: { bestOf: 3, adScoring: true },
  };
}

/**
 * One match on a line. `status` defaults to `manual` — what a hand-scored dual
 * line is until somebody uploads a video — so a fixture only names a status
 * when the coverage figure is what it is about.
 */
function match(
  id: string,
  winner: 'us' | 'them',
  status: AnalysisStatus = 'manual'
): EntryMatch {
  const won = [6, 6];
  const lost = [3, 4];
  return {
    id,
    round: null,
    status,
    score:
      winner === 'us'
        ? { player1: won, player2: lost }
        : { player1: lost, player2: won },
    opponentLabels: ['Rival Player'],
    hasVideo: status !== 'manual' && status !== 'imported',
  };
}

function entry(id: string, overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id,
    eventId: 'ev',
    discipline: 'singles',
    slot: 'S1',
    position: 1,
    draw: null,
    seed: null,
    playerUserIds: [],
    playerLabels: ['Reid'],
    opponentLabels: ['Blake'],
    opponentSchool: 'Rival State',
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

/**
 * A full ITA card: six singles and three doubles, each line's outcome given as
 * `us` / `them`, or `null` for a line nobody has played yet.
 */
function card(
  eventId: string,
  outcomes: (('us' | 'them') | null)[],
  status: AnalysisStatus = 'manual'
): EventEntry[] {
  const slots = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'D1', 'D2', 'D3'];
  return outcomes.map((outcome, index) =>
    entry(`${eventId}-${slots[index]}`, {
      eventId,
      slot: slots[index],
      position: index,
      discipline: slots[index].startsWith('S') ? 'singles' : 'doubles',
      matches: outcome
        ? [match(`${eventId}-m${index}`, outcome, status)]
        : [],
    })
  );
}

/** Six singles won, three doubles won — a 7–0 dual, every line in. */
const SWEPT: ('us' | 'them')[] = ['us', 'us', 'us', 'us', 'us', 'us', 'us', 'us', 'us'];
/** The mirror image: a 0–7 loss. */
const SWEPT_AWAY: ('us' | 'them')[] = SWEPT.map(() => 'them');

/** `events` is newest-first, exactly as `readSchedule` returns it. */
function schedule(
  ...items: [ProgramEvent, EventEntry[]][]
): ProgramSchedule {
  const ordered = [...items].sort((a, b) =>
    b[0].startsOn.localeCompare(a[0].startsOn)
  );
  return {
    events: ordered.map(([e]) => e),
    entriesByEvent: new Map(ordered.map(([e, entries]) => [e.id, entries])),
  };
}

test.describe('seasonSummaryFrom · the dual record and its marks', () => {
  test('a season with no events at all is zeroes, not an absence', () => {
    // The `7e` day-zero frame. A program that has never entered an event still
    // renders the block, so every figure has to have a defined value — and the
    // ratio has to be 0 of 0 rather than a division nobody performed.
    expect(seasonSummaryFrom({ events: [], entriesByEvent: new Map() })).toEqual(
      {
        form: [],
        dualRecord: { won: 0, lost: 0 },
        lines: { analyzed: 0, total: 0 },
      }
    );
  });

  test('reads oldest first, so the strip runs forwards through the season', () => {
    // `events` arrives newest-first; a form strip reads left to right. The
    // reversal is invisible if it is wrong — four marks either way — and it
    // reverses the story the season tells.
    const summary = seasonSummaryFrom(
      schedule(
        [event('sep', 'dual', '2026-09-12'), card('sep', SWEPT_AWAY)],
        [event('oct', 'dual', '2026-10-03'), card('oct', SWEPT)],
        [event('nov', 'dual', '2026-11-07'), card('nov', SWEPT)]
      )
    );
    expect(summary.form).toEqual(['lost', 'won', 'won']);
    expect(summary.dualRecord).toEqual({ won: 2, lost: 1 });
  });

  test('an undecided dual gets no mark and no column', () => {
    // One line still to play. `scheduleRowsFrom` withholds the team score for
    // the same reason: a partial dual has no result, and a mark claims it does.
    const unfinished = card('mar', [
      'us',
      'us',
      'us',
      'us',
      'them',
      null,
      'us',
      'us',
      'them',
    ]);
    const summary = seasonSummaryFrom(
      schedule(
        [event('feb', 'dual', '2026-02-14'), card('feb', SWEPT)],
        [event('mar', 'dual', '2026-03-01'), unfinished]
      )
    );
    expect(summary.form).toEqual(['won']);
    expect(summary.dualRecord).toEqual({ won: 1, lost: 0 });
    // …but its lines are still lines: nine from the finished dual and nine
    // from the unfinished one. Coverage is about work owed, and the work is
    // owed whether or not the card has finished.
    expect(summary.lines.total).toBe(18);
  });

  test('a dual with no lineup yet is undecided, not a loss', () => {
    // `dualScore` reports `decided: false` on an empty card. Reading its 0–0 as
    // a result would print a defeat for a dual nobody has entered a lineup for.
    const summary = seasonSummaryFrom(
      schedule([event('apr', 'dual', '2026-04-04'), []])
    );
    expect(summary.form).toEqual([]);
    expect(summary.dualRecord).toEqual({ won: 0, lost: 0 });
    expect(summary.lines).toEqual({ analyzed: 0, total: 0 });
  });

  test('a tournament is never a dual, however complete it is', () => {
    // "in duals" is the figure's own wording, and a bracket has no
    // team-vs-team result to fold into a tally.
    const summary = seasonSummaryFrom(
      schedule([
        event('invite', 'tournament', '2026-10-03'),
        [
          entry('t1', {
            eventId: 'invite',
            slot: null,
            draw: 'main',
            matches: [match('t1-r32', 'us'), match('t1-r16', 'them')],
          }),
        ],
      ])
    );
    expect(summary.form).toEqual([]);
    expect(summary.dualRecord).toEqual({ won: 0, lost: 0 });
    // Its lines still count — a tournament weekend is most of the video work
    // a season owes.
    expect(summary.lines.total).toBe(2);
  });

  test('a decided dual with no winner takes neither a mark nor a column', () => {
    // A short card — four singles, no doubles point to break the tie. Every
    // line is in, so the dual is decided, and 2–2 is not a result either way.
    // `won + lost` is therefore allowed to be less than the duals played,
    // exactly as `opponentDualHistory` lets `played` exceed `us + them`.
    const level = ['S1', 'S2', 'S3', 'S4'].map((slot, index) =>
      entry(`lvl-${slot}`, {
        eventId: 'lvl',
        slot,
        position: index,
        matches: [match(`lvl-m${index}`, index < 2 ? 'us' : 'them')],
      })
    );
    const summary = seasonSummaryFrom(
      schedule([event('lvl', 'dual', '2026-05-02'), level])
    );
    expect(summary.form).toEqual([]);
    expect(summary.dualRecord).toEqual({ won: 0, lost: 0 });
  });

  test('the record is the marks counted, so the two cannot disagree', () => {
    const summary = seasonSummaryFrom(
      schedule(
        [event('a', 'dual', '2026-01-10'), card('a', SWEPT)],
        [event('b', 'dual', '2026-01-17'), card('b', SWEPT_AWAY)],
        [event('c', 'dual', '2026-01-24'), card('c', SWEPT)],
        [event('d', 'dual', '2026-01-31'), card('d', SWEPT)]
      )
    );
    // The design's own line: one loss, then three wins, and "3–1 in duals".
    expect(summary.form).toEqual(['won', 'lost', 'won', 'won']);
    expect(summary.dualRecord.won).toBe(
      summary.form.filter((result) => result === 'won').length
    );
    expect(summary.dualRecord.lost).toBe(
      summary.form.filter((result) => result === 'lost').length
    );
  });
});

test.describe('seasonSummaryFrom · lines analyzed over lines total', () => {
  test('none analyzed is 0 of 36, not 0 of 0', () => {
    // The failure this pins: a denominator built from lines that produced a
    // match would be 0 here too, and "0 of 0" reads as a program with nothing
    // to analyse rather than one that has analysed nothing.
    const summary = seasonSummaryFrom(
      schedule(
        [event('a', 'dual', '2026-01-10'), card('a', SWEPT)],
        [event('b', 'dual', '2026-01-17'), card('b', SWEPT)],
        [event('c', 'dual', '2026-01-24'), card('c', SWEPT)],
        [event('d', 'dual', '2026-01-31'), card('d', SWEPT)]
      )
    );
    expect(summary.lines).toEqual({ analyzed: 0, total: 36 });
  });

  test('all analyzed is n of n', () => {
    const summary = seasonSummaryFrom(
      schedule([event('a', 'dual', '2026-01-10'), card('a', SWEPT, 'completed')])
    );
    expect(summary.lines).toEqual({ analyzed: 9, total: 9 });
  });

  test('a line nobody has played yet is owed, not absent', () => {
    // Four lines, one filmed and analysed, three with no match row at all.
    const entries = ['S1', 'S2', 'S3', 'S4'].map((slot, index) =>
      entry(`p-${slot}`, {
        eventId: 'p',
        slot,
        position: index,
        matches: index === 0 ? [match('p-m0', 'us', 'completed')] : [],
      })
    );
    expect(
      seasonSummaryFrom(schedule([event('p', 'dual', '2026-02-07'), entries]))
        .lines
    ).toEqual({ analyzed: 1, total: 4 });
  });

  test('a forfeited line is out of both halves', () => {
    // `getUploadQueue` drops forfeits from its totals because a forfeited line
    // has no match to film. Leaving it in the denominator here would hold a
    // fully covered dual at 8 of 9 permanently, reporting finished work as
    // outstanding — and it would never be obvious which line was missing.
    const entries = card('ff', SWEPT, 'completed');
    entries[5] = entry('ff-S6', {
      eventId: 'ff',
      slot: 'S6',
      position: 5,
      forfeit: 'theirs',
      playerLabels: [],
      opponentLabels: [],
      matches: [],
    });
    expect(
      seasonSummaryFrom(schedule([event('ff', 'dual', '2026-02-21'), entries]))
        .lines
    ).toEqual({ analyzed: 8, total: 8 });
    // The forfeit still decides the line, so the dual is decided and won.
    expect(
      seasonSummaryFrom(schedule([event('ff', 'dual', '2026-02-21'), entries]))
        .form
    ).toEqual(['won']);
  });

  test('a tournament run is counted per round, not per entry', () => {
    // One entry, four rounds, two of them with a report. Counting the run as
    // one line would call the whole entry analysed off a single round's report
    // — and it would agree with `getUploadQueue`'s totals on nothing.
    const run = entry('t1', {
      eventId: 'invite',
      slot: null,
      draw: 'main',
      matches: [
        match('r32', 'us', 'completed'),
        match('r16', 'us', 'timeline'),
        match('qf', 'us', 'processing'),
        match('sf', 'them', 'manual'),
      ],
    });
    expect(
      seasonSummaryFrom(
        schedule([event('invite', 'tournament', '2026-10-03'), [run]])
      ).lines
    ).toEqual({ analyzed: 2, total: 4 });
  });

  test('analyzed means a report exists, not that something is still running', () => {
    // Every in-flight status, one line each. `isInFlight` / `isWorking` /
    // `isLiveUpdating` all say yes to some of these; none of them is the
    // question, and any of them would report a queue as coverage.
    const inFlight: AnalysisStatus[] = [
      'uploading',
      'uploaded',
      'queued',
      'processing',
      'deriving',
      'processed',
    ];
    const entries = inFlight.map((status, index) =>
      entry(`f-${index}`, {
        eventId: 'f',
        slot: `S${index + 1}`,
        position: index,
        matches: [match(`f-m${index}`, 'us', status)],
      })
    );
    expect(
      seasonSummaryFrom(schedule([event('f', 'dual', '2026-03-14'), entries]))
        .lines
    ).toEqual({ analyzed: 0, total: 6 });
  });

  test('a failed job is not analyzed, and neither is a hand-scored line', () => {
    const terminal: AnalysisStatus[] = [
      'failed',
      'derivation_failed',
      'manual',
    ];
    const entries = terminal.map((status, index) =>
      entry(`x-${index}`, {
        eventId: 'x',
        slot: `S${index + 1}`,
        position: index,
        matches: [match(`x-m${index}`, 'us', status)],
      })
    );
    expect(
      seasonSummaryFrom(schedule([event('x', 'dual', '2026-03-21'), entries]))
        .lines
    ).toEqual({ analyzed: 0, total: 3 });
  });

  test('a verified timeline and a file import both count as reports', () => {
    // The three `isAnalysisReady` states, which is the definition this uses.
    // `timeline` has a checked point-by-point transcript and no aggregates —
    // still a report to read; `imported` arrived complete and never had a job,
    // so it is analysed with `hasVideo` false, which is why the count is not
    // `matchState`'s `ready`.
    const ready: AnalysisStatus[] = ['completed', 'timeline', 'imported'];
    const entries = ready.map((status, index) =>
      entry(`r-${index}`, {
        eventId: 'r',
        slot: `S${index + 1}`,
        position: index,
        matches: [match(`r-m${index}`, 'us', status)],
      })
    );
    expect(
      seasonSummaryFrom(schedule([event('r', 'dual', '2026-03-28'), entries]))
        .lines
    ).toEqual({ analyzed: 3, total: 3 });
  });

  test('counts every event in the season, duals and tournaments together', () => {
    const summary = seasonSummaryFrom(
      schedule(
        [event('a', 'dual', '2026-01-10'), card('a', SWEPT, 'completed')],
        [
          event('invite', 'tournament', '2026-01-17'),
          [
            entry('t1', {
              eventId: 'invite',
              slot: null,
              draw: 'main',
              matches: [match('r32', 'us', 'completed'), match('r16', 'them')],
            }),
            entry('t2', { eventId: 'invite', slot: null, draw: 'qualifying' }),
          ],
        ]
      )
    );
    expect(summary.lines).toEqual({ analyzed: 10, total: 12 });
    expect(summary.dualRecord).toEqual({ won: 1, lost: 0 });
  });
});
