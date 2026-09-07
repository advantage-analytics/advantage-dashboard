import { expect, test } from '@playwright/test';

import {
  readCourt,
  servePlacementCaption,
  shareInWords,
} from '@/lib/ui/serve-placement-caption';

/**
 * The sentence under Home's serve-placement bars. Pure, so it is tested as a
 * table: one case per shape the generator can name, plus the word each share
 * turns into.
 */
test.describe('shareInWords', () => {
  test('names the fractions a reader would say, and falls back to the number', () => {
    expect(shareInWords(14)).toBe('14%');
    expect(shareInWords(20)).toBe('a quarter');
    expect(shareInWords(29)).toBe('a quarter');
    expect(shareInWords(30)).toBe('a third');
    expect(shareInWords(44)).toBe('a third');
    expect(shareInWords(45)).toBe('half');
    expect(shareInWords(59)).toBe('half');
    expect(shareInWords(60)).toBe('two thirds');
    expect(shareInWords(69)).toBe('two thirds');
    expect(shareInWords(70)).toBe('three quarters');
    expect(shareInWords(79)).toBe('three quarters');
    expect(shareInWords(80)).toBe('80%');
    expect(shareInWords(91)).toBe('91%');
  });
});

test.describe('readCourt', () => {
  test('finds the leading zone and the runner-up, ties in bar order', () => {
    expect(readCourt([31, 11, 6])).toEqual({
      total: 48, pcts: [65, 23, 13], top: 'T', topPct: 65, second: 'Body', secondPct: 23,
    });
    expect(readCourt([5, 5, 5])).toMatchObject({ top: 'T', second: 'Body' });
    expect(readCourt([0, 0, 0])).toMatchObject({ total: 0, pcts: [0, 0, 0], topPct: 0 });
  });
});

test.describe('servePlacementCaption', () => {
  test('stays off while either court is too thin to read', () => {
    expect(servePlacementCaption({ deuce: readCourt([2, 0, 0]), ad: readCourt([10, 3, 2]) })).toBeNull();
    expect(servePlacementCaption({ deuce: readCourt([10, 3, 2]), ad: readCourt([1, 1, 0]) })).toBeNull();
  });

  test('both courts, one address, same zone', () => {
    expect(servePlacementCaption({ deuce: readCourt([31, 11, 6]), ad: readCourt([26, 8, 6]) })).toBe(
      'Both courts go to the T: two thirds of first serves or more.'
    );
  });

  test('both courts, one address, different zones', () => {
    expect(servePlacementCaption({ deuce: readCourt([31, 11, 6]), ad: readCourt([6, 8, 26]) })).toBe(
      'Deuce goes to the T, ad goes wide — one address each.'
    );
  });

  test('one court is an address, the other spreads — cites the runner-up', () => {
    // Deuce 64 / 22 / 14, ad 41 / 33 / 26 — Pa2's own bars. The spreading
    // court is evidenced by its SECOND zone, never its tail.
    expect(servePlacementCaption({ deuce: readCourt([31, 11, 6]), ad: readCourt([17, 13, 11]) })).toBe(
      'Deuce is one address; the ad court spreads — a third of those first serves go into the body.'
    );
    expect(servePlacementCaption({ deuce: readCourt([17, 13, 11]), ad: readCourt([6, 8, 26]) })).toBe(
      'Ad is one address; the deuce court spreads — a third of those first serves go into the body.'
    );
  });

  test('the spreading court is never evidenced by a negligible tail', () => {
    // Ad 55 / 40 / 5. Citing the tail read "spreads — 5% ... go wide", a
    // figure that argues against the claim it was offered for.
    const caption = servePlacementCaption({
      deuce: readCourt([14, 4, 2]),
      ad: readCourt([11, 8, 1]),
    });
    expect(caption).toBe(
      'Deuce is one address; the ad court spreads — a third of those first serves go into the body.'
    );
    expect(caption).not.toContain('5%');
  });

  test('neither is an address but one leans', () => {
    expect(servePlacementCaption({ deuce: readCourt([22, 10, 8]), ad: readCourt([14, 13, 13]) })).toBe(
      'Deuce leans to the T at 55%; the ad court is closer to even.'
    );
  });

  test('neither is an address and neither leans', () => {
    expect(servePlacementCaption({ deuce: readCourt([16, 12, 12]), ad: readCourt([12, 11, 17]) })).toBe(
      'Neither court has a fixed address — the T leads deuce, wide leads ad, both under 45%.'
    );
    // Ad tops at exactly 50%, so the ceiling must clear it rather than
    // land on it.
    expect(servePlacementCaption({ deuce: readCourt([3, 4, 3]), ad: readCourt([1, 2, 1]) })).toBe(
      'Neither court has a fixed address — the body leads both, under 55%.'
    );
  });

  test('the ceiling clears the larger share, never equals it', () => {
    // Deuce 45 / 30 / 25, ad 40 / 35 / 25. `Math.ceil(45/5)*5` is 45, which
    // claimed a court sitting at exactly 45% was "under 45%".
    const caption = servePlacementCaption({
      deuce: readCourt([9, 6, 5]),
      ad: readCourt([8, 7, 5]),
    });
    expect(caption).toBe(
      'Neither court has a fixed address — the T leads both, under 50%.'
    );
    expect(caption).not.toContain('under 45%');
  });
});
