import { expect, test } from '@playwright/test';
import { type SupabaseClient } from '@supabase/supabase-js';

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  createLogin,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from './fixtures/live-db';

/**
 * Account deletion leaves team data behind — proven against the live database.
 *
 * The scenario: a player with a claimed roster profile has filed two matches
 * under their program (one carrying their login id as player 1, one carrying
 * no player ids at all) and one personal match. `release_my_account_from_programs()`
 * must leave the two team matches with the program, attributed to the
 * profile, with every uploader column cleared and the usage still on the
 * program's ledger; un-claim the profile so the roster reads it as
 * coach-managed; drop the membership; write one audit row; and leave the
 * personal match alone (that is the server action's job, not the RPC's).
 * Owners are refused. A second call is a no-op.
 *
 * The last test is the regression test for the constraint bug this work
 * started from: deleting an `auth.users` row with a claimed profile used to
 * fail on `program_players_claim_check` because the FK's SET NULL cleared
 * `claimed_by_user_id` and left `claimed_at` behind.
 *
 * Fixture rows are created by the service-role client in `beforeAll` under a
 * per-run prefix and deleted in `afterAll`: matches by id (after release
 * their `created_by` is null, so a delete keyed on the user would miss them),
 * then the program (cascades profiles, members, audit rows), then the logins.
 *
 * Run on demand:  npx playwright test tests/account-deletion-retention.spec.ts
 */

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'acct-del-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker('acct-del');

const RPC = 'release_my_account_from_programs';
const AUDIT_ACTION = 'member.account_deleted';

function firstOfThisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

test.describe('account deletion retains program data (live DB)', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session;
  let player: Session;

  const authUserIds: string[] = [];
  const matchIds: string[] = [];
  let programId: string;
  let profileId: string;
  let teamSelfMatch: string; // player1_id = the player's login id
  let teamNoIdsMatch: string; // no player ids; created_by is the only evidence
  let personalMatch: string; // program_id null
  let jobId: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    [owner, player] = await createLogins(admin, ['owner', 'player'], {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });

    const program = await admin
      .from('programs')
      .insert({
        program_key: `${MARK}-p`,
        school_group: `${MARK}-p`,
        school_name: `Retention Test School ${MARK}`,
        team: 'mens',
      })
      .select('id')
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const members = await admin.from('program_members').insert([
      { program_id: programId, user_id: owner.userId, role: 'owner' },
      { program_id: programId, user_id: player.userId, role: 'player' },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const profile = await admin
      .from('program_players')
      .insert({
        program_id: programId,
        first_name: 'Retention',
        last_name: 'Player',
        claimed_by_user_id: player.userId,
        claimed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (profile.error) throw new Error(`profile: ${profile.error.message}`);
    profileId = profile.data.id;

    const matches = await admin
      .from('matches')
      .insert([
        {
          created_by: player.userId,
          program_id: programId,
          player1_id: player.userId,
          player1_name: 'Retention Player',
          player2_name: 'Retention Opponent',
          date: new Date().toISOString(),
          tournament_name: `${MARK}-team-self`,
        },
        {
          created_by: player.userId,
          program_id: programId,
          player1_name: 'Retention Player',
          player2_name: 'Retention Opponent',
          date: new Date().toISOString(),
          tournament_name: `${MARK}-team-noids`,
        },
        {
          created_by: player.userId,
          player1_name: 'Retention Player',
          player2_name: 'Retention Opponent',
          date: new Date().toISOString(),
          tournament_name: `${MARK}-personal`,
        },
      ])
      .select('id, tournament_name');
    if (matches.error) throw new Error(`matches: ${matches.error.message}`);
    const byName = (suffix: string) =>
      matches.data.find((m) => m.tournament_name === `${MARK}-${suffix}`)!.id;
    teamSelfMatch = byName('team-self');
    teamNoIdsMatch = byName('team-noids');
    personalMatch = byName('personal');
    matchIds.push(teamSelfMatch, teamNoIdsMatch, personalMatch);

    // The team self-upload has the full uploader subtree: a job, a program
    // ledger row, and a provider file.
    const job = await admin
      .from('processing_jobs')
      .insert({ match_id: teamSelfMatch, created_by: player.userId, status: 'completed' })
      .select('id')
      .single();
    if (job.error) throw new Error(`job: ${job.error.message}`);
    jobId = job.data.id;

    const [usage, file] = await Promise.all([
      admin.from('processing_usage').insert({
        account_id: programId,
        account_type: 'program',
        billing_month: firstOfThisMonth(),
        job_id: jobId,
        created_by: player.userId,
        reserved_seconds: 600,
        actual_seconds: 600,
      }),
      admin.from('match_files').insert({
        match_id: teamSelfMatch,
        uploaded_by: player.userId,
        provider_id: 'swingvision',
      }),
    ]);
    if (usage.error) throw new Error(`usage: ${usage.error.message}`);
    if (file.error) throw new Error(`file: ${file.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;
    if (matchIds.length > 0) {
      await admin.from('matches').delete().in('id', matchIds);
    }
    if (programId) {
      await admin.from('programs').delete().eq('id', programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  test('an owner is refused until ownership is transferred', async () => {
    const { data, error } = await owner.client.rpc(RPC);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(error!.message).toContain('transfer ownership');
  });

  test('the player is released: one row per program with counts', async () => {
    const { data, error } = await player.client.rpc(RPC);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      program_id: programId,
      profile_id: profileId,
      retained: 2,
      repointed: 2,
    });
  });

  test('team matches are re-pointed to the profile, uploader cleared, still the program\'s', async () => {
    const rows = await admin
      .from('matches')
      .select('id, program_id, created_by, player1_id, player2_id')
      .in('id', [teamSelfMatch, teamNoIdsMatch]);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(2);
    for (const row of rows.data!) {
      expect(row.program_id).toBe(programId);
      expect(row.created_by).toBeNull();
      expect(row.player1_id).toBe(profileId);
      expect(row.player2_id).toBeNull();
    }

    // The program route of the matches SELECT policy still admits the owner.
    const seen = await owner.client
      .from('matches')
      .select('id')
      .in('id', [teamSelfMatch, teamNoIdsMatch]);
    expect(seen.error).toBeNull();
    expect(seen.data).toHaveLength(2);
  });

  test('the profile is now coach-managed on the roster', async () => {
    const row = await admin
      .from('program_players')
      .select('claimed_by_user_id, claimed_at, archived_at')
      .eq('id', profileId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data!.claimed_by_user_id).toBeNull();
    expect(row.data!.claimed_at).toBeNull();
    expect(row.data!.archived_at).toBeNull();

    const roster = await owner.client.rpc('program_roster_full', {
      p_program_id: programId,
    });
    expect(roster.error).toBeNull();
    const mine = (roster.data as Array<Record<string, unknown>>).find(
      (r) => r.profile_id === profileId
    );
    expect(mine).toBeDefined();
    expect(mine!.managed_by).toBe('coach');
    expect(mine!.user_id).toBeNull();
    expect(mine!.claimed_at).toBeNull();
  });

  test('usage stays on the program ledger; job and file rows lose their uploader', async () => {
    const total = await owner.client.rpc('program_usage_total', {
      p_program_id: programId,
      p_billing_month: firstOfThisMonth(),
    });
    expect(total.error).toBeNull();
    expect(Number(total.data)).toBe(600);

    const [usage, job, file] = await Promise.all([
      admin.from('processing_usage').select('created_by, released').eq('job_id', jobId).single(),
      admin.from('processing_jobs').select('created_by').eq('id', jobId).single(),
      admin.from('match_files').select('uploaded_by').eq('match_id', teamSelfMatch).single(),
    ]);
    expect(usage.data!.created_by).toBeNull();
    expect(usage.data!.released).toBe(false);
    expect(job.data!.created_by).toBeNull();
    expect(file.data!.uploaded_by).toBeNull();
  });

  test('membership is gone and one audit row records what moved', async () => {
    const member = await admin
      .from('program_members')
      .select('id')
      .eq('program_id', programId)
      .eq('user_id', player.userId);
    expect(member.data).toEqual([]);

    const audit = await admin
      .from('program_audit_log')
      .select('subject_id, details')
      .eq('program_id', programId)
      .eq('action', AUDIT_ACTION);
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0].subject_id).toBe(profileId);
    expect(audit.data![0].details).toMatchObject({
      former_user_id: player.userId,
      role: 'player',
      matches_retained: 2,
      matches_repointed: 2,
    });
  });

  test('the personal match is untouched and still only the player\'s', async () => {
    const row = await admin
      .from('matches')
      .select('created_by, program_id, player1_id')
      .eq('id', personalMatch)
      .single();
    expect(row.data!.created_by).toBe(player.userId);
    expect(row.data!.program_id).toBeNull();
    expect(row.data!.player1_id).toBeNull();

    const own = await player.client.from('matches').select('id').eq('id', personalMatch);
    expect(own.data).toHaveLength(1);
    const theirs = await owner.client.from('matches').select('id').eq('id', personalMatch);
    expect(theirs.data).toEqual([]);
  });

  test('a second release is a no-op', async () => {
    const { data, error } = await player.client.rpc(RPC);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const row = await admin
      .from('matches')
      .select('player1_id, created_by')
      .eq('id', teamSelfMatch)
      .single();
    expect(row.data!.player1_id).toBe(profileId);
    expect(row.data!.created_by).toBeNull();
  });

  test('deleting a login through auth un-claims its profile instead of failing', async () => {
    // The regression test. Before the trigger existed, this deleteUser call
    // returned "new row for relation program_players violates check
    // constraint program_players_claim_check".
    const ghost = await createLogin(admin, 'ghost', {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });
    const profile = await admin
      .from('program_players')
      .insert({
        program_id: programId,
        first_name: 'Ghost',
        last_name: 'Player',
        claimed_by_user_id: ghost.userId,
        claimed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(profile.error).toBeNull();

    const removed = await admin.auth.admin.deleteUser(ghost.userId);
    expect(removed.error).toBeNull();

    const after = await admin
      .from('program_players')
      .select('id, claimed_by_user_id, claimed_at')
      .eq('id', profile.data!.id)
      .single();
    expect(after.error).toBeNull();
    expect(after.data!.claimed_by_user_id).toBeNull();
    expect(after.data!.claimed_at).toBeNull();
  });
});
