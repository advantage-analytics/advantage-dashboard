import { expect, test } from '@playwright/test';

import {
  teamFirstReport,
  type DbSeasonMatch,
} from '@/lib/data/team-home-server';
import type { AnalysisStatus, MatchAnalysis } from '@/lib/data/match-analysis';
import { shortDate } from '@/lib/data/match-utils';

/**
 * Team Home's setup checklist, first card.
 *
 * The card asks two questions — "has a report ever come back for this
 * program?" and "is one on its way?" — and both were being answered from the
 * six rows the matches list renders. Six recent rows cannot answer "ever", and
 * the failure is silent in the worst direction: a program that HAS sent a match
 * and got a report back is shown "Send your first match", with a primary button
 * asking a coach to redo work they already did. Nothing looks broken.
 *
 * It is rare on a young program and gets steadily likelier as a season's rows
 * pile up in front of the first one, which is why every test below puts the
 * interesting match BEHIND a full page of six.
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
 * One row of the season read.
 *
 * `provider` is what `analysisOf` falls back to with no job on the row: a
 * provider string reads as `imported` — a file that arrived complete, and so a
 * report — where a null reads as `manual`, a score somebody typed and no
 * analysis at all.
 */
function seasonMatch(opts: {
  id: string;
  date: string;
  side?: 'player1' | 'player2';
  provider?: string | null;
}): DbSeasonMatch {
  const side = opts.side ?? 'player1';
  return {
    id: opts.id,
    player1_name: side === 'player1' ? 'Ours' : 'Stranger One',
    player2_name: side === 'player2' ? 'Ours' : 'Stranger Two',
    player1_id: side === 'player1' ? OURS : 'stranger-1',
    player2_id: side === 'player2' ? OURS : 'stranger-2',
    event_entry_id: null,
    score: null,
    date: opts.date,
    source_provider: opts.provider ?? null,
    verified: opts.provider ? true : null,
  };
}

/**
 * The six rows the matches list renders, none of them analysed.
 *
 * Hand-scored duals: plenty of rows, and not one report among them. Newest
 * first, exactly as the read hands the season over.
 */
function sixTypedScores(): DbSeasonMatch[] {
  return [6, 5, 4, 3, 2, 1].map((n) =>
    seasonMatch({ id: `recent-${n}`, date: week(n + 4) })
  );
}

/** A job on one row — the only thing that outranks the fallbacks. */
function jobsFor(
  entries: { id: string; status: AnalysisStatus; startedAt?: string }[]
): Map<string, MatchAnalysis> {
  return new Map(
    entries.map((entry) => [
      entry.id,
      {
        status: entry.status,
        providerId: 'splitstep',
        startedAt: entry.startedAt,
      } as MatchAnalysis,
    ])
  );
}

const NO_JOBS = new Map<string, MatchAnalysis>();

test.describe('teamFirstReport — a report the list cannot see', () => {
  test('a report older than the six most recent rows is still a report', () => {
    // The case the card got wrong: one analysed match, seventh in the season's
    // order, behind six hand-scored duals. Asked of the six, the answer is
    // "nothing has ever come back" and the coach is told to send their first
    // match. Asked of the program, a report is back.
    const season = [
      ...sixTypedScores(),
      seasonMatch({ id: 'the-report', date: week(0), provider: 'swingvision' }),
    ];

    const answer = teamFirstReport(season, NO_JOBS, ROSTER);

    expect(answer).not.toBeNull();
    expect(answer?.state).toBe('done');
    if (answer?.state !== 'done') return;
    expect(answer.id).toBe('the-report');
    expect(answer.date).toBe(shortDate(week(0)));
  });

  test('a match still on its way behind the same six rows is still on its way', () => {
    // The other half of the same window. Sent, running, and off the bottom of
    // the list — the card should be a progress receipt, not a fresh ask.
    const season = [
      ...sixTypedScores(),
      seasonMatch({ id: 'running', date: week(0) }),
    ];
    const jobs = jobsFor([
      {
        id: 'running',
        status: 'processing',
        startedAt: '2026-01-05T12:00:00.000Z',
      },
    ]);

    const answer = teamFirstReport(season, jobs, ROSTER);

    expect(answer?.state).toBe('progress');
    if (answer?.state !== 'progress') return;
    // Both fields the card renders off it: the chip's word and the counter's
    // clock. A boolean here would have left the receipt with nothing to print.
    expect(answer.status).toBe('processing');
    expect(answer.startedAt).toBe('2026-01-05T12:00:00.000Z');
  });

  test('a program that has genuinely sent nothing still gets the ask', () => {
    // The fix must not answer "done" for everyone. Six typed scores are rows,
    // not reports, and this card is the one thing on the page that should keep
    // asking until a match has actually been sent.
    expect(teamFirstReport(sixTypedScores(), NO_JOBS, ROSTER)).toBeNull();
  });

  test('a failed match is neither done nor on its way', () => {
    // It leaves the card active, which is the right ask: after a failure the
    // next thing to do really is to send a match.
    const season = [seasonMatch({ id: 'burnt', date: week(0) })];
    const jobs = jobsFor([{ id: 'burnt', status: 'failed' }]);

    expect(teamFirstReport(season, jobs, ROSTER)).toBeNull();
  });

  test('a report outranks a match still running, however much newer that one is', () => {
    // One receipt fits in the slot, and the finished one wins: a coach who has
    // a report should be pointed at it rather than at a progress bar.
    const season = [
      seasonMatch({ id: 'running', date: week(9) }),
      ...sixTypedScores(),
      seasonMatch({ id: 'the-report', date: week(0), provider: 'swingvision' }),
    ];
    const jobs = jobsFor([{ id: 'running', status: 'processing' }]);

    const answer = teamFirstReport(season, jobs, ROSTER);

    expect(answer?.state).toBe('done');
    if (answer?.state !== 'done') return;
    expect(answer.id).toBe('the-report');
  });

  test('the newest report is the one named, not the oldest', () => {
    // "First report" is the card's name, not its content — the receipt points
    // at a match, and the useful one to point at is the latest.
    const season = [
      seasonMatch({ id: 'newer', date: week(9), provider: 'swingvision' }),
      ...sixTypedScores(),
      seasonMatch({ id: 'older', date: week(0), provider: 'swingvision' }),
    ];

    const answer = teamFirstReport(season, NO_JOBS, ROSTER);

    expect(answer?.state).toBe('done');
    if (answer?.state !== 'done') return;
    expect(answer.id).toBe('newer');
  });

  test('the receipt names our side first, whichever column it is stored in', () => {
    // The same orientation the matches list gives the row it points at. A
    // receipt reading "Stranger One vs Ours" is the row and the card telling a
    // coach two different stories about one match.
    const stored = [
      ...sixTypedScores(),
      seasonMatch({
        id: 'the-report',
        date: week(0),
        side: 'player2',
        provider: 'swingvision',
      }),
    ];

    const answer = teamFirstReport(stored, NO_JOBS, ROSTER);

    if (answer?.state !== 'done') throw new Error('expected a done receipt');
    expect(answer.title).toBe('Ours vs Stranger One');
  });

  test('a row nothing attributes to this program keeps the stored order', () => {
    // `programSide` refuses it — nobody on the roster in either id column and
    // no `event_entry_id` — so nothing flips, exactly as the match row itself
    // refuses to draw an outcome mark for it.
    const orphan: DbSeasonMatch = {
      ...seasonMatch({ id: 'orphan', date: week(0), provider: 'swingvision' }),
      player1_name: 'Stored First',
      player2_name: 'Stored Second',
      player1_id: 'stranger-1',
      player2_id: 'stranger-2',
    };

    const answer = teamFirstReport([orphan], NO_JOBS, ROSTER);

    if (answer?.state !== 'done') throw new Error('expected a done receipt');
    expect(answer.title).toBe('Stored First vs Stored Second');
  });
});
