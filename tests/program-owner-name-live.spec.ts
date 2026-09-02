import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  ANON_KEY,
  HAVE_ENV,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from './fixtures/live-db';

/**
 * The claim flow's owner name, proven against the live database.
 *
 * `program_public_status()` and `search_programs()` are the only two ways a
 * visitor to /claim/[programKey] ever learns who runs a program — `users` is
 * unreadable to them, so whatever these SECURITY DEFINER functions project is
 * the whole of it. Both used to abbreviate on purpose: the status screens
 * returned "Elena V." and the typeahead "E. Vasquez". Migration
 * `20260902091500_full_owner_name.sql` reversed that, deliberately, because a
 * coach deciding whether to wait for or object to a pending claim has to
 * recognise the claimant, and an initial on a staff of forty is a hint rather
 * than a name.
 *
 * That decision lives entirely in SQL, and nothing else would notice it going
 * back. An `owner_display` that quietly returned to `left(last_name, 1) || '.'`
 * would still be a non-null string of roughly the right shape; the TypeScript
 * would still title-case it; the page would still render a plausible-looking
 * name in the right slot; every offline spec would still pass. The regression
 * is invisible everywhere except in a real call to these two functions, which
 * is what this file is — a fence around one string, not a suite.
 *
 * Two things it is careful NOT to assert. First, casing: SQL does not
 * title-case. `titleCaseName()` (`lib/data/person-name.ts`) does, later, in
 * TypeScript, and these functions hand back whatever casing the row was stored
 * with — so the fixture stores `eLENA` / `vasQUEZ` and expects exactly that
 * back. A spec expecting `Elena Vasquez` here would be asserting the wrong
 * layer, and would fail against correct SQL. Second, the non-title casing is
 * the point of the fixture: with a tidily-cased name, a function that had
 * silently reverted to composing something else could still coincidentally
 * match. It cannot match `eLENA vasQUEZ` by accident.
 *
 * The surviving half of the old privacy bargain is not this file's subject:
 * the email, the user id and the role stay behind the definer boundary, and
 * `join-requests-staff-read.spec.ts` and `pending-invites.spec.ts` own the
 * projections that would leak them.
 *
 * Session plumbing (env loading, skip guard, logins, auth-user cleanup) comes
 * from `fixtures/live-db`: every row is created by the service-role client in
 * `beforeAll` under a per-run marker
 * (`select * from programs where program_key like 'own-name-%'` finds a
 * crashed run) and deleted in `afterAll`. The two reads themselves go through
 * an anon client, never the service role — anonymous is the caller these
 * functions were granted to, and the one the claim flow actually has.
 *
 * Run on demand:  npx playwright test tests/program-owner-name-live.spec.ts
 * (or the full suite via `npm run test`).
 */

// ---------------------------------------------------------------------------
// Fixture — one login, one claimed college program it owns.
// ---------------------------------------------------------------------------

const { mark: MARK, password: PASSWORD } = runMarker('own-name');

// Deliberately not title case, and deliberately not derivable from an
// abbreviation of itself.
const FIRST_NAME = 'eLENA';
const LAST_NAME = 'vasQUEZ';
const EXPECTED_OWNER = `${FIRST_NAME} ${LAST_NAME}`;

test.describe('claim-flow owner name (live DB)', () => {
  // One worker: both tests read the single fixture built in beforeAll.
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let anon: SupabaseClient;

  let owner: Session;
  const authUserIds: string[] = [];
  let programId: string;

  const programKey = `${MARK}-mens`;
  // `search_programs` matches on lower(school_name), so the marker leads: the
  // term below is then a prefix hit off the btree index, and unique to this
  // run whatever else the directory holds.
  const schoolName = `${MARK} Owner Name College`;

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    admin = createAdminClient();
    anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    [owner] = await createLogins(admin, ['owner'], {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });

    // The `handle_new_user` trigger already inserted the `public.users` row on
    // the auth insert, so the names are an update, not an insert.
    const named = await admin
      .from('users')
      .update({ first_name: FIRST_NAME, last_name: LAST_NAME })
      .eq('id', owner.userId)
      .select('first_name, last_name')
      .single();
    if (named.error) throw new Error(`users: ${named.error.message}`);
    // Guard, not an assertion on the subject: if the stored casing were folded
    // on the way in, both reads below would be testing nothing.
    if (named.data.first_name !== FIRST_NAME || named.data.last_name !== LAST_NAME) {
      throw new Error(
        `stored name was normalized: ${named.data.first_name} ${named.data.last_name}`
      );
    }

    // org_type defaults to 'college', which programs_college_fields_check then
    // requires program_key, school_group and team for — and which both of
    // `search_programs`' query branches filter on, so a custom-org fixture
    // would never appear in its results.
    const program = await admin
      .from('programs')
      .insert({
        program_key: programKey,
        school_group: MARK,
        school_name: schoolName,
        team: 'mens',
        status: 'active',
        owner_user_id: owner.userId,
        claimed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (program.error) throw new Error(`programs: ${program.error.message}`);
    programId = program.data.id;
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;

    // Program first: owner_user_id is ON DELETE SET NULL, so deleting the auth
    // user would orphan the row rather than take it with it.
    if (programId) {
      await admin.from('programs').delete().eq('id', programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  test('program_public_status returns the owner\'s full name, not an initialled surname', async () => {
    const { data, error } = await anon.rpc('program_public_status', {
      p_program_key: programKey,
    });
    expect(error).toBeNull();

    const row = (data ?? [])[0] as { owner_display: string | null } | undefined;
    expect(row).toBeDefined();

    // Verbatim, raw casing: the surname is whole, and no abbreviating period
    // survived anywhere in the string.
    expect(row!.owner_display).toBe(EXPECTED_OWNER);
    expect(row!.owner_display).not.toContain('.');
  });

  test('search_programs returns the owner\'s full name, not an initialled forename', async () => {
    const { data, error } = await anon.rpc('search_programs', {
      p_term: MARK,
    });
    expect(error).toBeNull();

    const rows = (data ?? []) as {
      program_key: string;
      owner_display: string | null;
    }[];
    const row = rows.find((r) => r.program_key === programKey);
    expect(row).toBeDefined();

    expect(row!.owner_display).toBe(EXPECTED_OWNER);
    expect(row!.owner_display).not.toContain('.');
  });
});
