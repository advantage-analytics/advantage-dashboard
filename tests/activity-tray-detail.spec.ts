import { expect, test } from '@playwright/test';

import { trayDetail } from '@/components/dashboard/activity/tray-detail';

/**
 * `trayDetail` is the tray's only number. The design forbids a numeric badge
 * in the chrome, so this string is what the tooltip shows and what the
 * `aria-label` says — one function, so those two can never drift apart.
 *
 * The cases below are the four shapes the header can be in (nothing, work
 * only, invitations only, both) plus the singular/plural boundary on the
 * invitation half, which is the one place a stray "1 invitations" could ship
 * without anything looking broken on screen.
 */
test.describe('trayDetail counts invitations and in-flight work', () => {
  test('an idle tray says nothing is in flight', () => {
    expect(trayDetail(0, 0)).toBe('Nothing in flight');
  });

  test('work alone reads as it always has', () => {
    expect(trayDetail(0, 2)).toBe('2 in flight');
  });

  test('one in-flight job stays singular in its own way', () => {
    expect(trayDetail(0, 1)).toBe('1 in flight');
  });

  test('a single invitation is singular', () => {
    expect(trayDetail(1, 0)).toBe('1 invitation');
  });

  test('several invitations are plural', () => {
    expect(trayDetail(2, 0)).toBe('2 invitations');
  });

  test('both are joined with a middle dot, invitations first', () => {
    // Invitations lead: they are the only row that asks the reader to decide
    // something.
    expect(trayDetail(1, 2)).toBe('1 invitation · 2 in flight');
  });

  test('the plural invitation half keeps its place ahead of the work', () => {
    expect(trayDetail(2, 1)).toBe('2 invitations · 1 in flight');
  });
});
