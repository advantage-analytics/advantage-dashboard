import { expect, test } from '@playwright/test';

import { requesterName } from '@/components/dashboard/team/roster-vocabulary';

/**
 * What the Roster page's join-request rows call somebody.
 *
 * The public "Request an invite" form requires an address and nothing else, so
 * roughly half of these rows arrive with `name: null` — and the row still has
 * to say who is asking. `requesterName` is that rule, and the part worth
 * locking is what it does NOT do: it prints the local part as written rather
 * than dressing it up as a person's name. A coach reading this list is reading
 * about a stranger, and "Jsharma" or "J Sharma" would be a name the product
 * made up, presented with the same confidence as one somebody actually typed.
 *
 * Pure and offline — no database, no browser. The access half of this feature
 * is covered against the live database in `join-requests-staff-read.spec.ts`.
 */

test.describe('requesterName · the name on a pending join request row', () => {
  test('a name they gave is the name shown', () => {
    expect(
      requesterName({ name: 'Priya Sharma', email: 'psharma@school.edu' })
    ).toBe('Priya Sharma');
  });

  test('a name they gave wins over the address, even where the two disagree', () => {
    // The address is not evidence about the name. Somebody using a shared or
    // parental mailbox still gets called what they said they are called.
    expect(
      requesterName({ name: 'Priya Sharma', email: 'thesharmas@example.com' })
    ).toBe('Priya Sharma');
  });

  test('surrounding whitespace is trimmed off a real name', () => {
    expect(
      requesterName({ name: '  Priya Sharma  ', email: 'psharma@school.edu' })
    ).toBe('Priya Sharma');
  });

  test('no name falls back to the local part of the address', () => {
    expect(requesterName({ name: null, email: 'psharma@school.edu' })).toBe(
      'psharma'
    );
  });

  test('a name that is only whitespace is no name at all', () => {
    // `fileRequest` writes `name?.trim() || null`, so this should not reach the
    // table — but a blank row is the one outcome that must not happen, and the
    // fallback is cheap insurance against the next writer of that insert.
    expect(requesterName({ name: '   ', email: 'psharma@school.edu' })).toBe(
      'psharma'
    );
  });

  test('the local part is printed verbatim — not title-cased, not un-dotted', () => {
    // The whole point of the fallback. Each of these would read as a name the
    // person had given if it were prettied, and none of them is one.
    expect(requesterName({ name: null, email: 'jsharma@school.edu' })).toBe(
      'jsharma'
    );
    expect(requesterName({ name: null, email: 'priya.sharma@school.edu' })).toBe(
      'priya.sharma'
    );
    expect(requesterName({ name: null, email: 'tennis-recruit-22@school.edu' })).toBe(
      'tennis-recruit-22'
    );
  });

  test('an address with no local part falls through to the whole address', () => {
    // Not something the form can file, but a row rendering an empty name would
    // be a blank line with two buttons beside it.
    expect(requesterName({ name: null, email: '@school.edu' })).toBe(
      '@school.edu'
    );
  });
});
