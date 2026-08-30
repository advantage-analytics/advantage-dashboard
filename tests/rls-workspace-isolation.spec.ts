import { expect, test } from '@playwright/test';
import { type SupabaseClient } from '@supabase/supabase-js';

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from './fixtures/live-db';

/**
 * Cross-program match isolation, proven against the live database.
 *
 * The scenario this locks: one athlete rostered in program A *and* program B,
 * with a match filed under `program_id = A`. Nothing about B — not its staff,
 * not a rostered player on another program, not the shared athlete
 * in the middle — may pull that A-filed match into B's view. The policies that
 * enforce it are the `matches` SELECT policy and the `visible_match_ids()` /
 * `visible_point_ids()` helpers that `match_stats`, `points` and `shots`
 * delegate to; `match_files` is stricter still (uploader-only). The write side
 * is the `matches` INSERT/UPDATE policies plus the
 * `matches_block_client_regraft` trigger, whose 42501 refusal is asserted on
 * here as the *expected* outcome, not a crash.
 *
 * This spec talks to the real Supabase project named in `.env.local` — the
 * live DB is this repo's only schema source of truth, so an isolation proof
 * against anything else would prove nothing. Session plumbing (env loading,
 * skip guard, logins, auth-user cleanup) comes from `fixtures/live-db`; every
 * fixture row is created by the service-role client in `beforeAll` under a
 * per-run unique prefix and deleted in `afterAll` (match first —
 * `matches.created_by` has no cascade — then programs, then the auth users).
 *
 * Run on demand:  npx playwright test tests/rls-workspace-isolation.spec.ts
 * (or the full suite via `npm run test`).
 */

// ---------------------------------------------------------------------------
// Fixture — two programs, four logins, one A-filed match with a full subtree.
// ---------------------------------------------------------------------------

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'rls-iso-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker('rls-iso');

test.describe('cross-program match isolation (live RLS)', () => {
  // One worker, in order: every test reads the beforeAll fixture.
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;

  // Logins. The athlete is the point of the fixture: rostered in BOTH
  // programs, so a naive "programs we share a member with" read would leak.
  let aOwner: Session; // owner of program A; files the match
  let athlete: Session; // player in A and in B; player1 of the match
  let bStaff: Session; // coach in B only
  let bPlayer: Session; // player in B only

  const authUserIds: string[] = [];
  const programIds: string[] = [];

  let programA: string;
  let programB: string;
  let matchId: string;
  let pointId: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    admin = createAdminClient();

    [aOwner, athlete, bStaff, bPlayer] = await createLogins(
      admin,
      ['a-owner', 'athlete', 'b-staff', 'b-player'],
      { mark: MARK, password: PASSWORD, authUserIds }
    );

    // Two programs. The assertion is that B's read stops at B's edge.
    const programs = await admin
      .from('programs')
      .insert([
        // school_group must differ: programs_group_team_key is unique on
        // (school_group, team).
        {
          program_key: `${MARK}-a`,
          school_group: `${MARK}-a`,
          school_name: `RLS Test School A ${MARK}`,
          team: 'mens',
        },
        {
          program_key: `${MARK}-b`,
          school_group: `${MARK}-b`,
          school_name: `RLS Test School B ${MARK}`,
          team: 'mens',
        },
      ])
      .select('id, program_key');
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    programA = programs.data.find((p) => p.program_key === `${MARK}-a`)!.id;
    programB = programs.data.find((p) => p.program_key === `${MARK}-b`)!.id;
    programIds.push(programA, programB);

    const members = await admin.from('program_members').insert([
      { program_id: programA, user_id: aOwner.userId, role: 'owner' },
      { program_id: programA, user_id: athlete.userId, role: 'player' },
      { program_id: programB, user_id: athlete.userId, role: 'player' },
      { program_id: programB, user_id: bStaff.userId, role: 'coach' },
      { program_id: programB, user_id: bPlayer.userId, role: 'player' },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    // The A-filed match, with one row in every table the policy tree covers.
    const match = await admin
      .from('matches')
      .insert({
        created_by: aOwner.userId,
        program_id: programA,
        player1_id: athlete.userId,
        player1_name: 'RLS Test Athlete',
        player2_name: 'RLS Test Opponent',
        date: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    matchId = match.data.id;

    // Only shots needs the point id — stats and files hang off the match.
    const [point, stats, files] = await Promise.all([
      admin
        .from('points')
        .insert({
          match_id: matchId,
          point_number: 1,
          set_number: 1,
          game_number: 1,
          server_is_player1: true,
          won_by_player1: true,
        })
        .select('id')
        .single(),
      admin.from('match_stats').insert({ match_id: matchId, is_player1: true }),
      admin.from('match_files').insert({
        match_id: matchId,
        uploaded_by: aOwner.userId,
        provider_id: 'swingvision',
      }),
    ]);
    if (point.error) throw new Error(`point: ${point.error.message}`);
    if (stats.error) throw new Error(`match_stats: ${stats.error.message}`);
    if (files.error) throw new Error(`match_files: ${files.error.message}`);
    pointId = point.data.id;

    const shots = await admin
      .from('shots')
      .insert({ point_id: pointId, shot_number: 1, is_player1: true });
    if (shots.error) throw new Error(`shots: ${shots.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;

    // Matches first: created_by has no ON DELETE, and the write-side tests
    // may have left bStaff a personal match. Everything under a match cascades.
    if (authUserIds.length > 0) {
      await admin.from('matches').delete().in('created_by', authUserIds);
    }
    if (programIds.length > 0) {
      await admin.from('programs').delete().in('id', programIds);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // -------------------------------------------------------------------------
  // Fixture sanity — zero rows below must mean "withheld", never "not there".
  // -------------------------------------------------------------------------

  test('program A reads its own match whole (fixture is real)', async () => {
    const c = aOwner.client;
    const [m, s, p, sh, f] = await Promise.all([
      c.from('matches').select('id').eq('id', matchId),
      c.from('match_stats').select('id').eq('match_id', matchId),
      c.from('points').select('id').eq('match_id', matchId),
      c.from('shots').select('id').eq('point_id', pointId),
      c.from('match_files').select('id').eq('match_id', matchId),
    ]);
    expect(m.data).toHaveLength(1);
    expect(s.data).toHaveLength(1);
    expect(p.data).toHaveLength(1);
    expect(sh.data).toHaveLength(1);
    expect(f.data).toHaveLength(1);

    // The athlete reads their own match too — the player route, which is the
    // route a leak into B would have piggybacked on.
    const own = await athlete.client.from('matches').select('id').eq('id', matchId);
    expect(own.data).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Read side — B sees nothing of the A-filed match, on all five tables.
  // -------------------------------------------------------------------------

  for (const [who, session] of [
    ['B staff (coach)', () => bStaff],
    ['B player', () => bPlayer],
  ] as const) {
    test(`${who} reads zero rows for the A-filed match`, async () => {
      const c = session().client;
      const [m, s, p, sh, f] = await Promise.all([
        c.from('matches').select('id').eq('id', matchId),
        c.from('match_stats').select('id').eq('match_id', matchId),
        c.from('points').select('id').eq('match_id', matchId),
        c.from('shots').select('id').eq('point_id', pointId),
        c.from('match_files').select('id').eq('match_id', matchId),
      ]);
      expect(m.error).toBeNull();
      expect(m.data).toEqual([]);
      expect(s.error).toBeNull();
      expect(s.data).toEqual([]);
      expect(p.error).toBeNull();
      expect(p.data).toEqual([]);
      expect(sh.error).toBeNull();
      expect(sh.data).toEqual([]);
      expect(f.error).toBeNull();
      expect(f.data).toEqual([]);
    });
  }

  // -------------------------------------------------------------------------
  // Write side — a non-member can neither file into A nor regraft onto A.
  // -------------------------------------------------------------------------

  test('a non-member cannot INSERT a match filed under program A', async () => {
    const { data, error } = await bStaff.client
      .from('matches')
      .insert({
        created_by: bStaff.userId, // passes the RLS with_check on purpose —
        program_id: programA, //      the refusal must come from the trigger
        player1_name: 'RLS Intruder',
        player2_name: 'RLS Opponent',
        date: new Date().toISOString(),
      })
      .select('id');

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(error!.message).toContain(
      'a match can only be filed under a program you belong to'
    );
  });

  test("a non-member's UPDATE of the A match touches zero rows", async () => {
    // RLS's UPDATE `using` clause hides the row entirely: no error, no rows —
    // the intruder cannot even learn the match exists.
    const { data, error } = await bStaff.client
      .from('matches')
      .update({ program_id: null })
      .eq('id', matchId)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // And the row is untouched, on the service role's authority.
    const check = await admin
      .from('matches')
      .select('program_id')
      .eq('id', matchId)
      .single();
    expect(check.data?.program_id).toBe(programA);
  });

  test('the regraft trigger blocks moving an own match into program A', async () => {
    // The one write RLS alone would allow: bStaff owns this row outright, so
    // both the UPDATE using and with_check clauses pass. The refusal is
    // matches_block_client_regraft's — asserted on as the expected failure.
    const personal = await bStaff.client
      .from('matches')
      .insert({
        created_by: bStaff.userId,
        player1_name: 'RLS B Staff',
        player2_name: 'RLS Opponent',
        date: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(personal.error).toBeNull();

    const regraft = await bStaff.client
      .from('matches')
      .update({ program_id: programA })
      .eq('id', personal.data!.id)
      .select('id');

    expect(regraft.error).not.toBeNull();
    expect(regraft.error!.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(regraft.error!.message).toContain(
      'which program and line a match belongs to is set when it is created'
    );

    // Not even into a program they DO belong to: where a match is filed is
    // decided at creation, which is what keeps every historic match pinned.
    const intoOwn = await bStaff.client
      .from('matches')
      .update({ program_id: programB })
      .eq('id', personal.data!.id)
      .select('id');
    expect(intoOwn.error).not.toBeNull();
    expect(intoOwn.error!.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
