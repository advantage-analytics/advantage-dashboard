import { expect, test } from '@playwright/test';

import {
  BENCH,
  lineupChanged,
  lineupOrder,
  lineupSpots,
  sequenceFrom,
} from '@/lib/data/lineup-draft';

/**
 * The Roster page's Save lineup button is disabled until saving would change
 * a spot. These pin down what "change" means, spot by spot against the saved
 * roster — the same arithmetic `set_program_lineup` applies.
 */

const roster = [
  { playerId: 'a', lineupSpot: 1 },
  { playerId: 'b', lineupSpot: 2 },
  { playerId: 'c', lineupSpot: 3 },
  { playerId: 'd', lineupSpot: null },
];

test('the order as it stands is not a change', () => {
  expect(lineupChanged(['a', 'b', 'c', BENCH, 'd'], roster)).toBe(false);
});

test('swapping two lines is a change; swapping them back is not', () => {
  expect(lineupChanged(['b', 'a', 'c', BENCH, 'd'], roster)).toBe(true);
  expect(lineupChanged(['a', 'b', 'c', BENCH, 'd'], roster)).toBe(false);
});

test('benching a player, or lining one up, is a change', () => {
  expect(lineupChanged(['a', 'b', BENCH, 'c', 'd'], roster)).toBe(true);
  expect(lineupChanged(['a', 'b', 'c', 'd', BENCH], roster)).toBe(true);
});

test('a roster with gaps or shared lines normalises to 1..N, so saving it as-is IS a change', () => {
  const messy = [
    { playerId: 'a', lineupSpot: 1 },
    { playerId: 'b', lineupSpot: 1 }, // parked on the same line from Edit player
    { playerId: 'c', lineupSpot: 4 }, // a gap
  ];
  expect(lineupChanged(['a', 'b', 'c', BENCH], messy)).toBe(true);
  expect(lineupSpots(['a', 'b', 'c', BENCH], ['a', 'b', 'c'])).toEqual(
    new Map([['a', 1], ['b', 2], ['c', 3]]),
  );
});

test('no sentinel means everybody is lined up', () => {
  expect(lineupOrder(['a', 'b'])).toEqual(['a', 'b']);
  expect(lineupSpots(['a', 'b'], ['a', 'b', 'd']).get('d')).toBeNull();
});

test('sequenceFrom puts the ranked first, then the sentinel, then the bench', () => {
  expect(sequenceFrom(roster, { sentinel: 'always' })).toEqual(['a', 'b', 'c', BENCH, 'd']);
  expect(sequenceFrom(roster, { sentinel: 'if-needed' })).toEqual(['a', 'b', 'c', BENCH, 'd']);
});

test('with nobody benched, only the editor draws the sentinel', () => {
  const full = roster.slice(0, 3);
  expect(sequenceFrom(full, { sentinel: 'always' })).toEqual(['a', 'b', 'c', BENCH]);
  expect(sequenceFrom(full, { sentinel: 'if-needed' })).toEqual(['a', 'b', 'c']);
});

test('a sequence built from a roster is not a change to it', () => {
  expect(lineupChanged(sequenceFrom(roster, { sentinel: 'always' }), roster)).toBe(false);
});
