import { randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  ANON_KEY,
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from './fixtures/live-db';
import type { DbPendingInviteRow } from '@/lib/data/pending-invites-server';
import {
  INVITE_TTL_HOURS,
  generateToken,
  hashToken,
} from '@/lib/services/programs/tokens';

/**
 * The invitee's own door into `program_invites`, proven against the live
 * database. Locks migration `20260902032248_pending_invites.sql`.
 *
 * `program_invites` is staff-read only and must stay that way: its one policy
 * is "Program staff can read invites", and a policy that let the invitee read
 * their own row would hand them `token_hash` — the secret the emailed link is
 * built from — because RLS hides rows, never columns. So the invitee gets two
 * SECURITY DEFINER functions instead, and what this spec is really asserting
 * is the shape of that window:
 *
 *  - `pending_program_invites()` returns TEN columns and no eleventh. Every
 *    assertion on the row shape below is an assertion that `token_hash` is not
 *    in it.
 *  - It returns only invitations addressed to the caller's own confirmed
 *    address, still open, not expired, for programs they are not already in —
 *    so the fixture carries one live row plus an expired one and an
 *    already-a-member one, and the pass condition is that neither of those two
 *    ever appears.
 *  - `accept_pending_invite(id)` refuses a stranger with `wrong_address` and
 *    grants nothing, then delegates to `accept_program_invite(token_hash)`,
 *    which is what makes `ok`, `already_used` and the seat/claim invariants
 *    fall out of one code path rather than two. The last test here is the
 *    other door on that same path — a real token, hashed the way the mailer
 *    hashes it — because the whole design rests on the two doors sharing it.
 *
 * The unconfirmed-address branch is deliberately NOT covered here: a password
 * login is confirmed by construction (`createLogins` passes
 * `email_confirm: true`), so it cannot be reached from a real session.
 *
 * Session plumbing (env loading, skip guard, logins, auth-user cleanup) comes
 * from `fixtures/live-db`: every row is created by the service-role client in
 * `beforeAll` under a per-run marker
 * (`select * from programs where program_key like 'pend-inv-%'` finds a
 * crashed run) and deleted in `afterAll`.
 *
 * Run on demand:  npx playwright test tests/pending-invites.spec.ts
 * (or the full suite via `npm run test`).
 */

// ---------------------------------------------------------------------------
// Fixture — four programs, three logins, three invitations to one address.
// ---------------------------------------------------------------------------

const { mark: MARK, password: PASSWORD } = runMarker('pend-inv');

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A token hash for a row nobody will ever present a token for. */
const junkHash = () => randomBytes(32).toString('hex');

/**
 * The ten columns the migration declares, keyed by the loader's own row type.
 * A column added to `DbPendingInviteRow` without a name here — or a name here
 * the interface does not have — is a compile error, so this list cannot drift
 * from the declaration `getPendingInvites` maps.
 */
const COLUMNS: Record<keyof DbPendingInviteRow, true> = {
  invite_id: true,
  program_id: true,
  school_name: true,
  team: true,
  org_type: true,
  role: true,
  invited_by: true,
  inviter_first_name: true,
  inviter_last_name: true,
  expires_at: true,
};

/** Both accept functions return exactly this, on every path. */
type AcceptRow = { status: string; program_id: string | null };

test.describe('pending invitations, read and accepted by id (live DB)', () => {
  // One worker, in order: the accept tests mutate the beforeAll fixture, and
  // the regression at the end reads what the first test saw.
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;

  let owner: Session; // owner of the live program; the inviter on every row
  let invitee: Session; // "A" — the address all three invitations name
  let stranger: Session; // "B" — confirmed, invited to nothing

  /** A's address, read back from the login rather than rebuilt from MARK. */
  let inviteeEmail: string;

  const authUserIds: string[] = [];
  const programIds: string[] = [];

  let programLive: string; // the one open invitation A can act on
  let programMember: string; // A is already on this roster
  let programExpired: string; // an invitation that ran out
  let programToken: string; // untouched until the token-door regression

  let liveInvite: string; // the only id A may ever see
  let memberInvite: string; // open, but A is already a member — withheld
  let expiredInvite: string; // A's address, expired — withheld

  /** What A's first read returned, checked again by the regression below. */
  let firstReadIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    admin = createAdminClient();

    [owner, invitee, stranger] = await createLogins(
      admin,
      ['owner', 'invitee-a', 'stranger-b'],
      { mark: MARK, password: PASSWORD, authUserIds }
    );

    // The address the functions match on is the session's, so take it from the
    // session. Rebuilding it from MARK would pass even if `createLogin` changed
    // how it derives one.
    const who = await invitee.client.auth.getUser();
    if (!who.data.user?.email) {
      throw new Error('invitee A has no address on their session');
    }
    inviteeEmail = who.data.user.email;

    // The inviter's name is a left join in the read function; give it something
    // to find, or the two name columns prove nothing by being null.
    const named = await admin
      .from('users')
      .update({ first_name: 'Pending', last_name: 'Owner' })
      .eq('id', owner.userId);
    if (named.error) throw new Error(`inviter name: ${named.error.message}`);

    // Four programs. school_group must differ per row: programs_group_team_key
    // is unique on (school_group, team). `seats` is named rather than left to
    // the default because a full program makes `accept_program_invite` answer
    // `no_seats`, which would read here as a broken accept.
    const program = (suffix: string, label: string) => ({
      program_key: `${MARK}-${suffix}`,
      school_group: `${MARK}-${suffix}`,
      school_name: `Pending Invite ${label} ${MARK}`,
      team: 'mens',
      seats: 25,
    });

    const programs = await admin
      .from('programs')
      .insert([
        program('live', 'Live'),
        program('member', 'Member'),
        program('expired', 'Expired'),
        program('token', 'Token'),
      ])
      .select('id, program_key');
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);

    const byKey = (suffix: string) =>
      programs.data.find((p) => p.program_key === `${MARK}-${suffix}`)!.id;
    programLive = byKey('live');
    programMember = byKey('member');
    programExpired = byKey('expired');
    programToken = byKey('token');
    programIds.push(programLive, programMember, programExpired, programToken);

    // Same key set on both rows — see the note on the invitations below; a
    // `upload_enabled` omitted from one of two mixed-shape rows arrives as
    // null and trips the column's NOT NULL, not its default.
    const members = await admin.from('program_members').insert([
      // Someone has to own the program A is being invited into.
      {
        program_id: programLive,
        user_id: owner.userId,
        role: 'owner',
        upload_enabled: true,
      },
      // The `not exists` clause's whole reason for being: A is already here,
      // so the invitation below must never be offered to them.
      {
        program_id: programMember,
        user_id: invitee.userId,
        role: 'player',
        upload_enabled: true,
      },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    // Three invitations, all to A, each on its OWN program:
    // program_invites_open_email_key is unique on (program_id, lower(email))
    // for unaccepted rows, and all three of these are unaccepted.
    //
    // Identical key sets on every row, deliberately: PostgREST bulk inserts
    // null — not the column default — into keys a row omits when the rows have
    // mixed shapes.
    const expiresIn14Days = new Date(
      Date.now() + INVITE_TTL_HOURS * HOUR
    ).toISOString();

    const invites = await admin
      .from('program_invites')
      .insert([
        {
          program_id: programLive,
          // Stored exactly as given, and given in the wrong case on purpose:
          // both functions compare `lower(i.email)` against the session's
          // lowercased address, and a coach who typed a capital letter must not
          // be the reason an invitation is invisible.
          email: inviteeEmail.toUpperCase(),
          role: 'player',
          upload_enabled: true,
          token_hash: junkHash(),
          invited_by: owner.userId,
          expires_at: expiresIn14Days,
        },
        {
          program_id: programMember,
          email: inviteeEmail,
          role: 'player',
          upload_enabled: true,
          token_hash: junkHash(),
          invited_by: owner.userId,
          expires_at: expiresIn14Days,
        },
        {
          program_id: programExpired,
          email: inviteeEmail,
          role: 'player',
          upload_enabled: true,
          token_hash: junkHash(),
          invited_by: owner.userId,
          expires_at: new Date(Date.now() - DAY).toISOString(),
        },
      ])
      .select('id, program_id');
    if (invites.error) throw new Error(`invites: ${invites.error.message}`);

    // Identified by program, never by a substring of the address: MARK ends in
    // a random hex slice, and matching on text is how a run goes intermittently
    // red for reasons that read as a leak.
    const byProgram = (programId: string) =>
      invites.data.find((i) => i.program_id === programId)!.id;
    liveInvite = byProgram(programLive);
    memberInvite = byProgram(programMember);
    expiredInvite = byProgram(programExpired);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;

    if (programIds.length > 0) {
      // Children first and by program, rather than leaning on the cascade: the
      // accepted invitation also minted a program_players row and an audit
      // entry, and a cleanup that only names what beforeAll inserted would
      // leave both behind.
      await admin
        .from('program_audit_log')
        .delete()
        .in('program_id', programIds);
      await admin.from('program_invites').delete().in('program_id', programIds);
      await admin.from('program_players').delete().in('program_id', programIds);
      await admin.from('program_members').delete().in('program_id', programIds);
      await admin.from('programs').delete().in('id', programIds);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // -------------------------------------------------------------------------
  // Read side.
  // -------------------------------------------------------------------------

  test('the invitee reads exactly one invitation, in exactly the ten columns the migration declares', async () => {
    const { data, error } = await invitee.client.rpc('pending_program_invites');
    expect(error).toBeNull();

    const rows = (data ?? []) as DbPendingInviteRow[];
    firstReadIds = rows.map((r) => r.invite_id);
    expect(firstReadIds).toEqual([liveInvite]);

    const row = rows[0];
    // The projection IS the security boundary — an eleventh column here would
    // be the one that hands the invitee a working link.
    expect(Object.keys(row).sort()).toEqual(Object.keys(COLUMNS).sort());
    expect(Object.keys(row)).not.toContain('token_hash');

    // The fields the invitation card renders, present and real.
    expect(row.program_id).toBe(programLive);
    expect(row.school_name).toBe(`Pending Invite Live ${MARK}`);
    expect(row.team).toBe('mens');
    expect(row.org_type).toBe('college');
    expect(row.role).toBe('player');
    expect(row.invited_by).toBe(owner.userId);
    expect(row.inviter_first_name).toBe('Pending');
    expect(row.inviter_last_name).toBe('Owner');
    expect(row.expires_at).toBeTruthy();
  });

  test('a confirmed account nobody invited reads zero rows', async () => {
    const { data, error } = await stranger.client.rpc(
      'pending_program_invites'
    );
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('the anon role cannot call the read at all', async () => {
    // Not "returns nothing" — cannot be called. A signed-out caller who could
    // run this with a guessed session would be a way to ask which schools have
    // invited which addresses.
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await anon.rpc('pending_program_invites');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  // -------------------------------------------------------------------------
  // Accept side.
  // -------------------------------------------------------------------------

  test('a stranger holding the invite id is refused, and gains nothing — not even the program it belongs to', async () => {
    const { data, error } = await stranger.client
      .rpc('accept_pending_invite', { p_invite_id: liveInvite })
      .maybeSingle();
    expect(error).toBeNull();

    const row = data as AcceptRow;
    expect(row.status).toBe('wrong_address');
    // Null, unlike the token function's `wrong_address`: holding a link is a
    // weak proof of address, but an invite id is not a secret at all, so
    // nothing about the row is disclosed until the address is proven.
    expect(row.program_id).toBeNull();

    const seat = await admin
      .from('program_members')
      .select('user_id')
      .eq('program_id', programLive)
      .eq('user_id', stranger.userId);
    expect(seat.data).toEqual([]);
  });

  test('the addressee accepts by id: the seat, the stamp and the audit row all land', async () => {
    const { data, error } = await invitee.client
      .rpc('accept_pending_invite', { p_invite_id: liveInvite })
      .maybeSingle();
    expect(error).toBeNull();

    const row = data as AcceptRow;
    expect(row.status).toBe('ok');
    expect(row.program_id).toBe(programLive);

    // The membership, at the role the invitation named — never one the caller
    // chose, because the caller never named one.
    const seat = await admin
      .from('program_members')
      .select('role, upload_enabled')
      .eq('program_id', programLive)
      .eq('user_id', invitee.userId)
      .single();
    expect(seat.data?.role).toBe('player');
    expect(seat.data?.upload_enabled).toBe(true);

    // The invitation is spent, and by whom is recorded.
    const used = await admin
      .from('program_invites')
      .select('accepted_at, accepted_user_id')
      .eq('id', liveInvite)
      .single();
    expect(used.data?.accepted_at).toBeTruthy();
    expect(used.data?.accepted_user_id).toBe(invitee.userId);

    // Written by the delegate, not by `accept_pending_invite` — which is the
    // point of delegating: one code path binds a login to a program, so the log
    // reads the same whichever door it came through.
    const log = await admin
      .from('program_audit_log')
      .select('action, subject_id, actor_user_id')
      .eq('program_id', programLive)
      .eq('action', 'invite.accepted');
    expect(log.data).toHaveLength(1);
    expect(log.data?.[0].subject_id).toBe(liveInvite);
    expect(log.data?.[0].actor_user_id).toBe(invitee.userId);
  });

  test('accepting the same invitation twice is refused, not repeated', async () => {
    const { data, error } = await invitee.client
      .rpc('accept_pending_invite', { p_invite_id: liveInvite })
      .maybeSingle();
    expect(error).toBeNull();

    const row = data as AcceptRow;
    expect(row.status).toBe('already_used');
  });

  test('and it has left the invitee\'s list', async () => {
    const { data, error } = await invitee.client.rpc('pending_program_invites');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Regressions.
  // -------------------------------------------------------------------------

  test('the expired invitation and the one for a program they are already in were never offered', async () => {
    // Restating the first read's result against the two ids by name. The
    // equality up there already implies it; these are the two rows whose
    // appearance would matter — one is a link that has run out, the other would
    // ask a rostered player to join a team they are on.
    expect(firstReadIds).toHaveLength(1);
    expect(firstReadIds).not.toContain(expiredInvite);
    expect(firstReadIds).not.toContain(memberInvite);
  });

  test('the emailed link still works: a real token, hashed the way the mailer hashes it, is accepted', async () => {
    // The other door on the same path. `accept_pending_invite` delegates here,
    // so a change that made the id door work by re-implementing acceptance
    // would show up as this test going quiet, not red.
    const token = generateToken();

    const fresh = await admin
      .from('program_invites')
      .insert({
        program_id: programToken,
        email: inviteeEmail,
        role: 'player',
        upload_enabled: true,
        token_hash: hashToken(token),
        invited_by: owner.userId,
        expires_at: new Date(Date.now() + INVITE_TTL_HOURS * HOUR).toISOString(),
      })
      .select('id')
      .single();
    if (fresh.error) throw new Error(`fresh invite: ${fresh.error.message}`);

    const { data, error } = await invitee.client
      .rpc('accept_program_invite', { p_token_hash: hashToken(token) })
      .maybeSingle();
    expect(error).toBeNull();

    const row = data as AcceptRow;
    expect(row.status).toBe('ok');
    expect(row.program_id).toBe(programToken);

    const seat = await admin
      .from('program_members')
      .select('role')
      .eq('program_id', programToken)
      .eq('user_id', invitee.userId)
      .single();
    expect(seat.data?.role).toBe('player');
  });
});
