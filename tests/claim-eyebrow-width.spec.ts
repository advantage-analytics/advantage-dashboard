import { expect, test } from '@playwright/test';
import { type SupabaseClient } from '@supabase/supabase-js';

import { HAVE_ENV, SKIP_REASON, createAdminClient } from './fixtures/live-db';
import { programEyebrow } from '@/lib/data/programs-server';

/**
 * The width budget for the claim flow's eyebrow line — what it guards, and
 * what it does not.
 *
 * The claim status screens open with an `.eyebrow` line built by
 * `programEyebrow()`: "STANFORD UNIVERSITY · WOMEN'S · D-I". It is one line by
 * design. When it wraps, the heading beneath it shifts down and the screen
 * reads as broken — and it wraps for exactly one reason, a school name longer
 * than anything anyone thought to look at. The directory holds ~1,941 real ITA
 * program rows, scraped, with names like "North Carolina Agricultural and
 * Technical State University" in the long tail. Nobody is going to notice the
 * day a longer one is added.
 *
 * So this spec composes the eyebrow for EVERY row in `programs` and asserts
 * each one fits the budget below.
 *
 * ── Why the live table, and not a fixture ────────────────────────────────
 * A fixture would freeze today's worst case. It would pass forever, including
 * on the day a new program row lands whose name overflows the column — which
 * is the only day this spec exists for. The guard has to read what is actually
 * in the table, so the spec fails when the DATA changes and not only when the
 * code does. That is also why it reads all ~1,941 rows rather than sampling:
 * the long tail is the interesting part.
 *
 * ── What it does NOT guard ───────────────────────────────────────────────
 *   • It does not render anything. There is no browser here, and no
 *     measurement — 8.6px per character is a constant measured once by hand
 *     (see below), not something this spec re-derives. If the eyebrow's type
 *     ever changes size, weight or tracking, that constant has to be
 *     re-measured; the spec cannot notice on its own.
 *   • It does not check WHERE the eyebrow is rendered, or that the status
 *     screens call the helper at all. The screens' own adoption is T3/T4's
 *     business; this spec only needs the helper.
 *   • The one-line guarantee is for viewports 768px and up, where the shell's
 *     heading column is at its full width. Below that the design accepts a
 *     wrapped eyebrow, so a narrow phone is deliberately out of scope.
 *
 * Env plumbing (the `.env.local` load, the skip guard, the service-role
 * client) comes from `fixtures/live-db`. This spec creates nothing and writes
 * nothing — `programs` is anon-readable and every query here is a read — so
 * there is no marker and no cleanup. It uses `createAdminClient()` anyway, for
 * consistency with the other live specs.
 *
 * Run on demand:  npx playwright test tests/claim-eyebrow-width.spec.ts
 * (or the full suite via `npm run test`).
 */

/**
 * 97 characters — the widest eyebrow the claim shell can render on one line.
 *
 * Provenance: T2 hoisted the status screens' heading out of the narrow left
 * column and into the shell's own full `840` width, so the eyebrow now has
 * 840px to work with. Measured in a real browser, `.eyebrow` type — Inter 500,
 * 10px, 2.5px letter-spacing, uppercase — renders at 8.0–8.5px per character
 * depending on the letters, worst case 8.53. Round the per-character cost up
 * to 8.6 for margin: 840 ÷ 8.6 ≈ 97.
 *
 * Today's longest real eyebrow is 74 characters, so this is a genuine ceiling
 * with headroom, not a fence around the current data. It fires only when a
 * program arrives whose eyebrow would actually wrap.
 */
const MAX_EYEBROW_CHARS = 97;

type Row = {
  school_name: string;
  team: string;
  division: string | null;
  conference: string | null;
};

/**
 * PostgREST returns at most 1,000 rows per request and says nothing about it.
 * A single `select` here would quietly check the first half of a ~1,941-row
 * table — including only half of the long tail this spec exists to guard — and
 * pass. So page explicitly, ordered by the unique `program_key` so the pages
 * partition the table rather than overlapping, and then prove the paging was
 * complete against a separate exact count.
 */
const PAGE_SIZE = 1000;

async function readAllPrograms(admin: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('programs')
      .select('school_name, team, division, conference, program_key')
      .order('program_key', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`programs page at ${from}: ${error.message}`);
    const page = (data ?? []) as (Row & { program_key: string })[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

test.describe('claim eyebrow width budget (live DB)', () => {
  // Serial, so the whole table is read once for all three tests rather than
  // once per worker — and so that a short read stops the suite instead of
  // letting the two data assertions "pass" over half a table.
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let rows: Row[];
  let exactCount: number;

  test.beforeAll(async () => {
    const admin = createAdminClient();

    const { count, error } = await admin
      .from('programs')
      .select('program_key', { count: 'exact', head: true });
    if (error) throw new Error(`programs count: ${error.message}`);
    exactCount = count ?? -1;

    rows = await readAllPrograms(admin);
  });

  test('composes an eyebrow for every row in the table', () => {
    // If these disagree, the paging above stopped early and every assertion
    // below is only as good as the rows it happened to see.
    expect(
      rows.length,
      `paged ${rows.length} program rows but the table holds ${exactCount}`
    ).toBe(exactCount);
    expect(rows.length).toBeGreaterThan(PAGE_SIZE); // the cap is real, not hypothetical
  });

  test('every eyebrow fits on one line of the claim shell', () => {
    const tooWide = rows
      .map((row) => ({
        school: row.school_name,
        eyebrow: programEyebrow(row.school_name, row.team, row.division),
      }))
      .filter(({ eyebrow }) => eyebrow.length > MAX_EYEBROW_CHARS)
      .map(
        ({ school, eyebrow }) =>
          `${school}: ${eyebrow.length} chars (budget ${MAX_EYEBROW_CHARS}) — "${eyebrow}"`
      );

    expect(
      tooWide,
      `${tooWide.length} program eyebrow(s) would wrap in the claim shell`
    ).toEqual([]);
  });

  test('no eyebrow carries the row conference', () => {
    // `programEyebrow` drops conference on purpose — school + squad +
    // division + conference runs to 136 characters for a real JUCO row, far
    // past the budget above. Adding it back is the regression this catches.
    const leaked = rows
      .filter((row) => Boolean(row.conference))
      .map((row) => ({
        school: row.school_name,
        conference: row.conference as string,
        eyebrow: programEyebrow(row.school_name, row.team, row.division),
      }))
      .filter(({ eyebrow, conference }) => eyebrow.includes(conference))
      .map(
        ({ school, conference, eyebrow }) =>
          `${school}: ${eyebrow.length} chars, includes conference "${conference}" — "${eyebrow}"`
      );

    expect(
      leaked,
      `${leaked.length} program eyebrow(s) include their conference`
    ).toEqual([]);
  });
});
