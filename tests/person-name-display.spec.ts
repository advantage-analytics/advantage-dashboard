import { expect, test } from '@playwright/test';

import { titleCaseName } from '@/lib/data/person-name';

/**
 * How a name is SPELLED on screen, as distinct from who it belongs to.
 *
 * `person-name-matching.spec.ts` guards the other half of the pair: that two
 * spellings of one name compare equal. This guards what gets printed once the
 * comparison is done, and the failure it protects against is not an error but
 * an embarrassment — one roster rendering `clajerson gimena`, `CLAJERSON
 * GIMENA` and `Clajerson Gimena` in three consecutive rows, because three
 * people typed the same name three ways and nothing ever reconciled them.
 *
 * The sharper failure is over-correction. A person who typed `McCarthy`,
 * `O'Brien`, `DeMarco` or `MacLeod` has told us how their name is spelled, and
 * a title-caser that "fixes" them into `Mccarthy` and `Macleod` has corrupted
 * real data while looking tidier. So every describe below ends on inputs that
 * must come back byte-identical — that is the load-bearing half of the
 * contract, and the half a naive implementation fails.
 */

test.describe('titleCaseName re-cases what a human typed', () => {
  test('the case a roster form actually receives', () => {
    // The three spellings of one name that a shared roster produces.
    expect(titleCaseName('clajerson gimena')).toBe('Clajerson Gimena');
    expect(titleCaseName('CLAJERSON GIMENA')).toBe('Clajerson Gimena');
    expect(titleCaseName('Clajerson Gimena')).toBe('Clajerson Gimena');
  });

  test('a segment boundary is a capital, not just the first letter', () => {
    // R2 splits on `'` and `-`, so the letter after the punctuation rises too.
    // Capitalizing only token-initially would give `O'brien` and `Smith-jones`.
    expect(titleCaseName("o'brien")).toBe("O'Brien");
    expect(titleCaseName('smith-jones')).toBe('Smith-Jones');
    expect(titleCaseName("dana o'brien-smith")).toBe("Dana O'Brien-Smith");
  });

  test('an all-caps Mc name keeps its interior capital', () => {
    // R2a. Without it an uploader's caps-lock turns a family name into
    // `Mccarthy` on every screen that shows it.
    expect(titleCaseName('MCCARTHY')).toBe('McCarthy');
    expect(titleCaseName('mccarthy')).toBe('McCarthy');
    expect(titleCaseName('sean MCCARTHY')).toBe('Sean McCarthy');
  });

  test('a generational suffix is uppercased, not title-cased', () => {
    // R1b. All-caps carries no lowercase, so R1 cannot protect a suffix; R2
    // alone would render `Iii`.
    expect(titleCaseName('iii')).toBe('III');
    expect(titleCaseName('sam reid iii')).toBe('Sam Reid III');
    expect(titleCaseName('iv')).toBe('IV');
    expect(titleCaseName('xii')).toBe('XII');
  });

  test('a surname spelled from the same letters is NOT a suffix', () => {
    // R1b's uniform-casing half, and the reason it exists. `Xi`, `Vi` and
    // `Vivi` are built from i/v/x, and R1 cannot save a two-letter name — it
    // needs an uppercase after the FIRST character, which `Xi` has nowhere to
    // put. Without the uniform-casing guard every one of these came back
    // shouted: a real owner surnamed Xi read as "Wei XI manages Advantage
    // here" on a page anyone can open, signed out.
    for (const typed of ['Xi', 'Vi', 'Ivi', 'Vivi', 'Ix', 'Iv']) {
      expect(titleCaseName(typed), typed).toBe(typed);
    }
    expect(titleCaseName('Wei Xi')).toBe('Wei Xi');

    // The residue, pinned so it is a decision and not a surprise: a uniformly
    // cased token carries nothing that separates the two readings, so a name
    // typed in one case throughout still reads as a suffix. Written the
    // ordinary way — one capital, the rest lower — it is safe, which is the
    // case that actually occurs.
    expect(titleCaseName('wei xi')).toBe('Wei XI');
  });

  test('deliberate casing is returned exactly as typed', () => {
    // R1, and the reason this function is not just `.toLowerCase()` plus a
    // capital. Each of these holds an uppercase after its first character AND
    // a lowercase, which is what "somebody chose this" looks like.
    for (const typed of ['McCarthy', "O'Brien", 'DeMarco', 'MacLeod', 'LaSalle', 'III']) {
      expect(titleCaseName(typed), typed).toBe(typed);
    }
    expect(titleCaseName('Fiona MacLeod')).toBe('Fiona MacLeod');
  });
});

test.describe('titleCaseName on whitespace and emptiness', () => {
  test('the ends are trimmed and internal runs collapse to one space', () => {
    expect(titleCaseName('  dana   brooks  ')).toBe('Dana Brooks');
    expect(titleCaseName('dana\tbrooks')).toBe('Dana Brooks');
    // The doubled internal space `${first_name} ${last_name}` produces from one
    // trailing space in a single column — the spelling the matching spec calls
    // the only stray whitespace that reaches a roster row.
    expect(titleCaseName('dana  brooks')).toBe('Dana Brooks');
  });

  test('a non-breaking space collapses here even though btrim leaves it', () => {
    // JS `\s` covers U+00A0/U+202F/U+FEFF and Postgres `[[:space:]]` does not,
    // so a name pasted from Word renders clean while the stored value keeps its
    // NBSP. Harmless only because this side is display: nothing stores or
    // compares the result.
    expect(titleCaseName('dana\u00A0brooks')).toBe('Dana Brooks');
    expect(titleCaseName('dana\u202Fbrooks')).toBe('Dana Brooks');
  });

  test('nothing in means empty string out, never a throw', () => {
    // Callers render this straight into JSX, so a blank field has to be a
    // blank string rather than a crash or the word "undefined".
    expect(titleCaseName('')).toBe('');
    expect(titleCaseName('   ')).toBe('');
    expect(titleCaseName('\t\n \u00A0')).toBe('');
    expect(() => titleCaseName('---')).not.toThrow();
    expect(() => titleCaseName("''")).not.toThrow();
    expect(() => titleCaseName('🎾')).not.toThrow();
  });

  test('a name already clean comes back unchanged', () => {
    expect(titleCaseName('Dana Brooks')).toBe('Dana Brooks');
    expect(titleCaseName('Sam Reid')).toBe('Sam Reid');
    expect(titleCaseName('Ama Osei')).toBe('Ama Osei');
  });
});

test.describe('titleCaseName leaves the declined cases alone', () => {
  test('particles are capitalized like any other token', () => {
    // Declined: no particle table. Which particles lowercase is a per-family
    // answer, so `De La Cruz` is the conventional default and a bearer who
    // wants `de la Cruz` types it — R1 then protects it forever.
    expect(titleCaseName('DE LA CRUZ')).toBe('De La Cruz');
    expect(titleCaseName('de la cruz')).toBe('De La Cruz');
    expect(titleCaseName('maria de la Cruz')).toBe('Maria De La Cruz');
  });

  test('there is no `mac` rule, because three real names would pay for it', () => {
    // Declined: R2a has no `mac` twin. `Macon`, `Macey` and `Mackey` are not
    // Mac-names, and a symmetric rule would render them `MacOn`, `MacEy`,
    // `MacKey`. A genuine MacLeod typed as `MacLeod` is covered by R1 instead.
    expect(titleCaseName('macon')).toBe('Macon');
    expect(titleCaseName('macey')).toBe('Macey');
    expect(titleCaseName('mackey')).toBe('Mackey');
    expect(titleCaseName('jo macon')).toBe('Jo Macon');
  });

  test('the names this rule set must never touch', () => {
    for (const typed of ['Macon', 'Macey', 'Mackey', 'MacLeod', 'DeMarco', 'McCarthy']) {
      expect(titleCaseName(typed), typed).toBe(typed);
    }
  });
});
