import { expect, test } from '@playwright/test';

import { safeNext } from '@/lib/auth/safe-next';

/**
 * `safeNext` is the only thing standing between a `?next=` query value and a
 * navigation. Two callers already lean on it — `/callback` and `/confirm` —
 * and the login form now does too, because a password sign-in navigates
 * client-side and never touches those routes.
 *
 * The cases below are the shapes that reach a redirect target in the wild:
 * an absolute URL, the protocol-relative form that a naive `startsWith("/")`
 * check waves through, the backslash variant that browsers normalise into it,
 * and a scheme that executes rather than navigates.
 */
test.describe('safeNext clamps a hostile destination', () => {
  test('a missing value falls back to the dashboard', () => {
    expect(safeNext(null)).toBe('/dashboard');
  });

  test('an absolute URL to another origin is refused', () => {
    expect(safeNext('https://evil.com')).toBe('/dashboard');
  });

  test('a protocol-relative URL is refused', () => {
    // Passes any `startsWith("/")` test, then loads evil.com over the current
    // page's scheme. This is the one that gets shipped by accident.
    expect(safeNext('//evil.com')).toBe('/dashboard');
  });

  test('a backslash-prefixed URL is refused', () => {
    // Browsers treat `/\` as `//` in a special scheme, so this is the same
    // attack wearing a character that a `//` blocklist does not match.
    expect(safeNext('/\\evil.com')).toBe('/dashboard');
  });

  test('a javascript: URL is refused', () => {
    expect(safeNext('javascript:alert(1)')).toBe('/dashboard');
  });
});

test.describe('safeNext preserves a legitimate destination', () => {
  test('an invite path keeps its query string', () => {
    // The invite flow's whole point: land on the token page, not the
    // dashboard, and carry the page's own params through untouched.
    expect(safeNext('/join/abc?not-now=1')).toBe('/join/abc?not-now=1');
  });
});
