import { expect, test } from '@playwright/test';

import {
  PERSON_NAME_MAX,
  parseTypedName,
  titleCaseTypedName,
} from '@/lib/data/person-name-case';

/**
 * The name step's casing rule — Onboarding & Team Setup screen 1.2.
 *
 * The design's sentence, which these cases pin: title case is applied on
 * blur, not enforced by validation — "McEnroe", "van der Berg" and "O'Neal"
 * survive because we only touch the first letter of each word and never
 * lowercase the rest. Read literally, a per-word rule would still turn
 * "van der Berg" into "Van Der Berg", so the rule is per FIELD: a value the
 * person has already put a capital in is theirs, and only an all-lowercase
 * value gets its first letters raised.
 *
 * `titleCaseTypedName` is the blur rule and touches letters only.
 * `parseTypedName` is the server's re-read of the same field off a raw RPC,
 * so it is the one that trims, collapses, caps and rejects.
 */

test.describe('titleCaseTypedName on a name typed in lowercase', () => {
  test('raises the first letter of each word', () => {
    expect(titleCaseTypedName('marcus reid')).toBe('Marcus Reid');
  });

  test('raises each half of a hyphenated name', () => {
    expect(titleCaseTypedName('smith-jones')).toBe('Smith-Jones');
  });

  test('raises the letter after an apostrophe', () => {
    expect(titleCaseTypedName("o'neal")).toBe("O'Neal");
  });

  test('raises an accented first letter', () => {
    expect(titleCaseTypedName('élodie')).toBe('Élodie');
  });

  test('leaves whitespace exactly as typed', () => {
    // Trimming is the server's job (`parseTypedName`); the blur rule touches
    // letters only, so a field mid-edit is never rewritten under the cursor.
    expect(titleCaseTypedName('  marcus  reid ')).toBe('  Marcus  Reid ');
  });
});

test.describe('titleCaseTypedName on a name that already carries a capital', () => {
  test('leaves a mid-word capital alone', () => {
    expect(titleCaseTypedName('McEnroe')).toBe('McEnroe');
  });

  test('leaves lowercase particles alone', () => {
    expect(titleCaseTypedName('van der Berg')).toBe('van der Berg');
  });

  test('leaves an apostrophe name alone', () => {
    expect(titleCaseTypedName("O'Neal")).toBe("O'Neal");
  });

  test('never lowercases', () => {
    expect(titleCaseTypedName('MARCUS')).toBe('MARCUS');
  });

  test('is idempotent, so a second blur changes nothing', () => {
    const once = titleCaseTypedName('marcus reid');
    expect(titleCaseTypedName(once)).toBe(once);
  });
});

test.describe('titleCaseTypedName on nothing', () => {
  test('returns an empty string unchanged', () => {
    expect(titleCaseTypedName('')).toBe('');
  });

  test('returns whitespace unchanged', () => {
    expect(titleCaseTypedName('   ')).toBe('   ');
  });
});

test.describe('parseTypedName on what the form sends', () => {
  test('trims and collapses whitespace, then cases', () => {
    expect(parseTypedName('  marcus   reid ')).toBe('Marcus Reid');
  });

  test('keeps a name the person cased themselves', () => {
    expect(parseTypedName(' van der Berg ')).toBe('van der Berg');
  });

  test('accepts a name exactly at the cap', () => {
    expect(parseTypedName('a'.repeat(PERSON_NAME_MAX))).toHaveLength(
      PERSON_NAME_MAX,
    );
  });
});

test.describe('parseTypedName on what a raw RPC can send', () => {
  test('rejects a non-string', () => {
    expect(parseTypedName(undefined)).toBeNull();
    expect(parseTypedName(null)).toBeNull();
    expect(parseTypedName(42)).toBeNull();
    expect(parseTypedName(['Marcus'])).toBeNull();
  });

  test('rejects blank input', () => {
    expect(parseTypedName('')).toBeNull();
    expect(parseTypedName('   ')).toBeNull();
  });

  test('rejects a name over the cap', () => {
    expect(parseTypedName('a'.repeat(PERSON_NAME_MAX + 1))).toBeNull();
  });

  test('never returns an empty string', () => {
    // The column is nullable and every reader is written for `null`; a blank
    // stored as `""` would render where a name goes.
    expect(parseTypedName('\t\n')).toBeNull();
  });
});
