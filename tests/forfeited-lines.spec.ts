import { expect, test } from '@playwright/test';

import {
  dualScore,
  entryPlayed,
  entryState,
  forfeitWon,
  lineWon,
  supportsVideo,
} from '@/lib/schedule/entry-state';
import { LINE_STATUS } from '@/lib/schedule/line-status';
import type { EntryMatch, EventEntry } from '@/lib/schedule/types';

/**
 * Forfeited lines, and which team the point goes to.
 *
 * `entry.forfeit` records WHICH side forfeited because the two award the point
 * to opposite teams, and there is no way to tell from the screen that the
 * answer came out backwards: a forfeit renders as a clean win or a clean loss
 * either way, and the team score above it is a confident number in both cases.
 * That is the silent-wrongness class `docs/ui-revamp-guardrails.md` exists to
 * catch, so the direction is pinned here rather than left to the reader of
 * `forfeitWon`.
 *
 * The second thing pinned is the total. A dual has nine points to give, and a
 * forfeit spends one of them without playing a match — so a card with forfeits
 * on it still has to add up to nine and still has to read `decided`. Counting
 * a forfeit as unplayed instead would print a decided dual as unfinished with
 * nothing on screen looking broken.
 */

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
  outcome: 'us' | 'them' | 'unplayed' | 'forfeit-ours' | 'forfeit-theirs',
  position: number
): EventEntry {
  const forfeit =
    outcome === 'forfeit-ours'
      ? ('ours' as const)
      : outcome === 'forfeit-theirs'
        ? ('theirs' as const)
        : null;

  return {
    id: `entry-${slot}`,
    eventId: 'e-1',
    discipline: slot.startsWith('S') ? 'singles' : 'doubles',
    slot,
    position,
    draw: null,
    seed: null,
    playerUserIds: [],
    // A forfeited line carries nobody, which is what `dual-form` writes and
    // what `line-row` renders as "— no available player".
    playerLabels: forfeit === null ? [`Player ${slot}`] : [],
    opponentLabels: forfeit === null ? ['Rival Player'] : [],
    opponentSchool: 'Rival State',
    forfeit,
    matches:
      outcome === 'us' || outcome === 'them'
        ? [match(`m-${slot}`, outcome)]
        : [],
  };
}

function card(outcomes: [string, Parameters<typeof entry>[1]][]): EventEntry[] {
  return outcomes.map(([slot, outcome], index) => entry(slot, outcome, index));
}

const ALL_NINE: [string, Parameters<typeof entry>[1]][] = [
  ['S1', 'us'],
  ['S2', 'us'],
  ['S3', 'us'],
  ['S4', 'them'],
  ['S5', 'them'],
  ['S6', 'them'],
  ['D1', 'us'],
  ['D2', 'us'],
  ['D3', 'them'],
];

test.describe('which team a forfeit gives the point to', () => {
  test("'theirs' means the opponent forfeited, so we take the line", () => {
    expect(forfeitWon(entry('S6', 'forfeit-theirs', 5))).toBe(true);
  });

  test("'ours' means we could not field a player, so they take the line", () => {
    expect(forfeitWon(entry('S6', 'forfeit-ours', 5))).toBe(false);
  });

  test('a line nobody forfeited has no forfeit answer at all', () => {
    expect(forfeitWon(entry('S1', 'unplayed', 0))).toBeNull();
  });

  test('the point lands on the scoreboard on the side it was awarded', () => {
    // Same card twice, differing only in who forfeited S6. The two scores must
    // be mirror images — if they ever agree, the side is being ignored.
    const theyForfeit = dualScore(
      card([...ALL_NINE.slice(0, 5), ['S6', 'forfeit-theirs'], ...ALL_NINE.slice(6)])
    );
    const weForfeit = dualScore(
      card([...ALL_NINE.slice(0, 5), ['S6', 'forfeit-ours'], ...ALL_NINE.slice(6)])
    );

    // S1–S3 ours, S4–S5 theirs, doubles point ours (D1 + D2 of three).
    expect(theyForfeit).toEqual({ us: 5, them: 2, decided: true });
    expect(weForfeit).toEqual({ us: 4, them: 3, decided: true });
    expect(theyForfeit.us + theyForfeit.them).toBe(7);
    expect(weForfeit.us + weForfeit.them).toBe(7);
  });
});

test.describe('a dual with forfeits on it still adds up', () => {
  test('every singles line forfeited still spends all six singles points', () => {
    const score = dualScore(
      card([
        ['S1', 'forfeit-ours'],
        ['S2', 'forfeit-ours'],
        ['S3', 'forfeit-ours'],
        ['S4', 'forfeit-theirs'],
        ['S5', 'forfeit-theirs'],
        ['S6', 'forfeit-theirs'],
        ['D1', 'us'],
        ['D2', 'us'],
        ['D3', 'them'],
      ])
    );

    // Three each on the singles, and the doubles point to us: 4–3 of seven.
    expect(score).toEqual({ us: 4, them: 3, decided: true });
  });

  test('a forfeit decides its line — the dual does not read unfinished', () => {
    const withForfeit = card([
      ...ALL_NINE.slice(0, 5),
      ['S6', 'forfeit-ours'],
      ...ALL_NINE.slice(6),
    ]);
    expect(dualScore(withForfeit).decided).toBe(true);

    // The control: the same card with S6 simply unplayed is NOT decided, so
    // the assertion above is about the forfeit and not about the other eight.
    const withGap = card([
      ...ALL_NINE.slice(0, 5),
      ['S6', 'unplayed'],
      ...ALL_NINE.slice(6),
    ]);
    expect(dualScore(withGap).decided).toBe(false);
  });

  test('a forfeited line counts as played, an empty one does not', () => {
    expect(entryPlayed(entry('S6', 'forfeit-ours', 5))).toBe(true);
    expect(entryPlayed(entry('S6', 'forfeit-theirs', 5))).toBe(true);
    expect(entryPlayed(entry('S6', 'unplayed', 5))).toBe(false);
  });
});

test.describe('a forfeited line is never a line waiting to be played', () => {
  test('it reports its own state, not "empty"', () => {
    expect(entryState(entry('S6', 'forfeit-ours', 5))).toBe('forfeited');
    expect(entryState(entry('S6', 'unplayed', 5))).toBe('empty');
  });

  test('every surface that draws a line state has a label for it', () => {
    // `dual-sheet.tsx`, `line-row.tsx` and the detail pane all render through
    // this map. A missing entry would silently draw nothing where the outcome
    // belongs — reading as a line still to come.
    expect(LINE_STATUS.forfeited).toEqual({
      label: 'Forfeited',
      tone: 'neutral',
    });
  });

  test('nothing can be uploaded against it', () => {
    // A forfeited line has no match to analyse, so the video path must refuse
    // it even on singles, where it would otherwise be allowed.
    expect(supportsVideo(entry('S6', 'forfeit-ours', 5))).toBe(false);
    expect(supportsVideo(entry('S6', 'forfeit-theirs', 5))).toBe(false);
    expect(supportsVideo(entry('S6', 'unplayed', 5))).toBe(true);
    expect(supportsVideo(entry('D3', 'unplayed', 8))).toBe(false);
  });
});

test.describe('lineWon · one precedence, every surface', () => {
  /**
   * A line carrying BOTH a forfeit and a match. `setForfeit` refuses to mark a
   * line that already has one and `recordResult` refuses to score a forfeited
   * line, so the app cannot currently produce this row — but four surfaces
   * used to answer it independently and Team Home's dual sheet answered it
   * differently from the other three, printing the match result where the
   * event page printed the forfeit. The guards are app-level, so the row is
   * one direct write away; what is pinned here is that every surface would
   * agree about it.
   */
  function contested(): EventEntry {
    const e = entry('S6', 'forfeit-theirs', 5);
    // The opponent forfeited — the line is ours — but a match under it says we
    // lost. The forfeit is the outcome; the match is the thing that did not
    // happen.
    return { ...e, matches: [match('m-S6', 'them')] };
  }

  test('the forfeit outranks the match, whichever way it is asked', () => {
    const e = contested();
    expect(lineWon(e)).toBe(true);
    expect(lineWon(e, e.matches[0])).toBe(true);
    expect(lineWon(e, null)).toBe(true);
  });

  test('with no forfeit it defers to the match it was handed', () => {
    const e = entry('S1', 'them', 0);
    expect(lineWon(e, e.matches[0])).toBe(false);
    // A row told there is no match for it is undecided, even though the entry
    // holds one — that is the per-round question a tournament row asks.
    expect(lineWon(e, null)).toBeNull();
    // Asked about the whole entry, the match counts again.
    expect(lineWon(e)).toBe(false);
  });

  test('an untouched line is undecided, not lost', () => {
    expect(lineWon(entry('S1', 'unplayed', 0))).toBe(false);
    expect(lineWon(entry('S1', 'unplayed', 0), null)).toBeNull();
  });
});
