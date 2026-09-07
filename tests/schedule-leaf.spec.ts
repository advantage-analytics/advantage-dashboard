import { expect, test } from '@playwright/test';

import { scheduleLeaf } from '@/lib/dashboard/nav';

/**
 * `scheduleLeaf` names the last crumb on the schedule's flow screens. It was
 * an exact-path map until the score-only flow arrived (T11) carrying an event
 * id in the middle of its path, which no map key can spell.
 *
 * The regex branch is pinned here because the failure is silent: a path that
 * stops matching gets a header with a linked Schedule crumb and no leaf, which
 * looks like a design decision rather than a bug.
 */
test.describe('the score-only flow', () => {
  test('an event score path is "Add score"', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/score')).toBe(
      'Add score'
    );
  });

  test('a uuid event id matches too', () => {
    expect(
      scheduleLeaf(
        '/dashboard/team/schedule/edaf1aa0-0000-4000-8000-000000000000/score'
      )
    ).toBe('Add score');
  });

  test('the event page itself has no leaf', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123')).toBeNull();
  });

  test('a deeper path under /score is not a route and gets no leaf', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/score/extra')).toBeNull();
  });

  test('a trailing slash is not the same path', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/score/')).toBeNull();
  });

  test('the score segment has to be last, not anywhere', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/score')).toBeNull();
  });
});

/**
 * The edit flow (T19) carries an event id the same way the score flow does, so
 * it gets the same regex branch and the same pins — including the negatives,
 * which are the ones that catch a pattern loosened into matching a route that
 * does not exist.
 */
test.describe('the edit flow', () => {
  test('an event edit path is "Edit"', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/edit')).toBe('Edit');
  });

  test('a uuid event id matches too', () => {
    expect(
      scheduleLeaf(
        '/dashboard/team/schedule/edaf1aa0-0000-4000-8000-000000000000/edit'
      )
    ).toBe('Edit');
  });

  test('a deeper path under /edit is not a route and gets no leaf', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/edit/extra')).toBeNull();
  });

  test('a trailing slash is not the same path', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/edit/')).toBeNull();
  });

  test('the edit segment has to be last, not anywhere', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/edit')).toBeNull();
  });

  test('scoring and editing are different leaves', () => {
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/score')).toBe(
      'Add score'
    );
    expect(scheduleLeaf('/dashboard/team/schedule/abc123/edit')).toBe('Edit');
  });
});

test.describe('the create screens still answer', () => {
  const exact: [string, string][] = [
    ['/dashboard/team/schedule/new', 'New event'],
    ['/dashboard/team/schedule/new/dual', 'New dual'],
    ['/dashboard/team/schedule/new/tournament', 'New tournament'],
    ['/dashboard/team/schedule/new/single', 'New single'],
  ];

  for (const [path, label] of exact) {
    test(`${path} is "${label}"`, () => {
      expect(scheduleLeaf(path)).toBe(label);
    });
  }

  test('the schedule root is a destination, not a leaf', () => {
    expect(scheduleLeaf('/dashboard/team/schedule')).toBeNull();
  });

  test('a path outside the schedule gets nothing', () => {
    expect(scheduleLeaf('/dashboard/matches/new')).toBeNull();
  });
});
