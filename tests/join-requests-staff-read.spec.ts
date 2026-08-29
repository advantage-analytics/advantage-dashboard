import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Staff read path for pending join requests, proven against the live database.
 *
 * `program_requests` deliberately has no policies and no anon/authenticated
 * grants: it also holds `ownership_dispute` rows about a program, which must
 * never be readable by that program's current staff. The only signed-in path
 * into the table is the pair of SECURITY DEFINER functions from migration
 * `20260829222046_staff_join_request_read_path.sql` —
 * `program_join_requests` (list) and `resolve_program_join_request` (write) —
 * both of which hard-code `kind = 'invite_request'`. This spec locks all of
 * that: staff read succeeds and sees ONLY open invite requests; a player, a
 * non-member and staff of another program get zero rows; the raw table stays
 * permission-denied even for staff; resolution stamps
 * status/resolved_by/resolved_at; and every wrong caller — cross-program
 * staff, non-member, dispute id, already-handled id — is refused.
 *
 * These functions are what `lib/data/join-requests-server.ts` and
 * `team/join-request-actions.ts` call through the user's own session, so
 * exercising them with real signed-in sessions here IS exercising the
 * loader's and the action's access mechanism.
 *
 * Fixtures follow tests/rls-workspace-isolation.spec.ts: every row is created
 * by the service-role client in `beforeAll` under a per-run marker
 * (`select * from programs where program_key like 'jr-req-%'` finds a crashed
 * run) and deleted in `afterAll`. Without the three Supabase env vars the
 * file skips instead of failing.
 *
 * Run on demand:  npx playwright test tests/join-requests-staff-read.spec.ts
 * (or the full suite via `npm run test`).
 */

// ---------------------------------------------------------------------------
// Environment — Playwright does not load .env.local; do it by hand.
// ---------------------------------------------------------------------------

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of [process.cwd(), path.resolve(__dirname, '..')]) {
    try {
      const raw = readFileSync(path.join(dir, '.env.local'), 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in out)) out[key] = value;
      }
      break; // first .env.local found wins
    } catch {
      // keep looking
    }
  }
  return out;
}

const fileEnv = loadEnvLocal();
const env = (key: string): string | undefined =>
  process.env[key] ?? fileEnv[key];

const SUPABASE_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const HAVE_ENV = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Fixture — two programs, four logins, five program_requests rows.
// ---------------------------------------------------------------------------

const RUN_ID = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const MARK = `jr-req-${RUN_ID}`;
const PASSWORD = `Jr-Req-${randomUUID()}`;

type Session = { client: SupabaseClient; userId: string };

/** Both refusals surface through PostgREST as `error.code`. */
const INSUFFICIENT_PRIVILEGE = '42501';
const NO_DATA_FOUND = 'P0002';

/** The row shape `program_join_requests` returns. */
interface JoinRequestRow {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  created_at: string;
}

test.describe('staff read path for pending join requests (live DB)', () => {
  // One worker, in order: the resolve tests mutate the beforeAll fixture.
  test.describe.configure({ mode: 'serial', timeout: 60_000 });
  test.skip(
    !HAVE_ENV,
    'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set'
  );

  let admin: SupabaseClient;

  let aStaff: Session; // role 'staff' in A — the least-privileged staff tier
  let aPlayer: Session; // player in A — a member, but not staff
  let bStaff: Session; // coach in B only — staff, wrong program
  let outsider: Session; // no membership anywhere

  const authUserIds: string[] = [];
  const programIds: string[] = [];
  const requestIds: string[] = [];

  let programA: string;
  let programB: string;

  // The five rows. Only the first two may ever reach program A's staff.
  let inviteA1: string; // invite_request, A, open — resolved mid-suite
  let inviteA2: string; // invite_request, A, open — the denial target
  let disputeA: string; // ownership_dispute, A, open — must stay invisible
  let resolvedA: string; // invite_request, A, already resolved
  let inviteB: string; // invite_request, B, open — B's, not A's

  async function createLogin(label: string): Promise<Session> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${MARK}-${label}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`createUser(${label}): ${error?.message}`);
    }
    authUserIds.push(data.user.id);

    const client = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({
      email: `${MARK}-${label}@example.com`,
      password: PASSWORD,
    });
    if (signIn.error) {
      throw new Error(`signIn(${label}): ${signIn.error.message}`);
    }
    return { client, userId: data.user.id };
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    aStaff = await createLogin('a-staff');
    aPlayer = await createLogin('a-player');
    bStaff = await createLogin('b-staff');
    outsider = await createLogin('outsider');

    const programs = await admin
      .from('programs')
      .insert([
        // school_group must differ: programs_group_team_key is unique on
        // (school_group, team).
        {
          program_key: `${MARK}-a`,
          school_group: `${MARK}-a`,
          school_name: `JR Test School A ${RUN_ID}`,
          team: 'mens',
        },
        {
          program_key: `${MARK}-b`,
          school_group: `${MARK}-b`,
          school_name: `JR Test School B ${RUN_ID}`,
          team: 'mens',
        },
      ])
      .select('id, program_key');
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    programA = programs.data.find((p) => p.program_key === `${MARK}-a`)!.id;
    programB = programs.data.find((p) => p.program_key === `${MARK}-b`)!.id;
    programIds.push(programA, programB);

    const members = await admin.from('program_members').insert([
      { program_id: programA, user_id: aStaff.userId, role: 'staff' },
      { program_id: programA, user_id: aPlayer.userId, role: 'player' },
      { program_id: programB, user_id: bStaff.userId, role: 'coach' },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    // Distinct emails throughout: program_requests_open_unique is unique on
    // (kind, program_id, lower(email)) for open rows. `status` is explicit on
    // every row: PostgREST bulk inserts null (not the column default) into
    // keys a row omits when the rows have mixed shapes.
    const requests = await admin
      .from('program_requests')
      .insert([
        {
          kind: 'invite_request',
          program_id: programA,
          email: `${MARK}-walk-on-1@example.com`,
          name: 'JR Walk-on One',
          note: 'Played juniors, would love a trial.',
          status: 'open',
        },
        {
          kind: 'invite_request',
          program_id: programA,
          email: `${MARK}-walk-on-2@example.com`,
          name: 'JR Walk-on Two',
          note: null,
          status: 'open',
        },
        {
          kind: 'ownership_dispute',
          program_id: programA,
          email: `${MARK}-disputer@example.com`,
          note: 'The listed owner no longer works here.',
          status: 'open',
        },
        {
          kind: 'invite_request',
          program_id: programA,
          email: `${MARK}-handled@example.com`,
          name: 'JR Already Handled',
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        },
        {
          kind: 'invite_request',
          program_id: programB,
          email: `${MARK}-b-walk-on@example.com`,
          name: 'JR B Walk-on',
          status: 'open',
        },
      ])
      .select('id, kind, program_id, email');
    if (requests.error) throw new Error(`requests: ${requests.error.message}`);
    requestIds.push(...requests.data.map((r) => r.id));

    const byEmail = (needle: string) =>
      requests.data.find((r) => (r.email as string).includes(needle))!.id;
    inviteA1 = byEmail('walk-on-1');
    inviteA2 = byEmail('walk-on-2');
    disputeA = byEmail('disputer');
    resolvedA = byEmail('handled');
    inviteB = byEmail('b-walk-on');
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!admin) return;

    // Requests first and by id: the unlisted-program shape has no program_id,
    // so a cascade off `programs` is not something to lean on here.
    if (requestIds.length > 0) {
      await admin.from('program_requests').delete().in('id', requestIds);
    }
    if (programIds.length > 0) {
      await admin.from('programs').delete().in('id', programIds);
    }
    // Auth deletion cascades public.users and program_members.
    for (const id of authUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  // -------------------------------------------------------------------------
  // Read side.
  // -------------------------------------------------------------------------

  test('program A staff read exactly the open invite requests — never the dispute, the resolved row, or another program\'s queue', async () => {
    const { data, error } = await aStaff.client.rpc('program_join_requests', {
      p_program_id: programA,
    });
    expect(error).toBeNull();

    const rows = (data ?? []) as JoinRequestRow[];
    expect(rows.map((r) => r.id).sort()).toEqual([inviteA1, inviteA2].sort());

    // The fields the roster section will render, present and real.
    const first = rows.find((r) => r.id === inviteA1)!;
    expect(first.email).toBe(`${MARK}-walk-on-1@example.com`);
    expect(first.name).toBe('JR Walk-on One');
    expect(first.note).toBe('Played juniors, would love a trial.');
    expect(first.created_at).toBeTruthy();

    // Withheld kinds by id, explicitly — the assertion above already implies
    // it, but these are the rows whose leak would matter.
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(disputeA);
    expect(ids).not.toContain(resolvedA);
    expect(ids).not.toContain(inviteB);
  });

  for (const [who, session] of [
    ['a non-member', () => outsider],
    ['staff of another program', () => bStaff],
    ['a player of the program itself', () => aPlayer],
  ] as const) {
    test(`${who} reads zero rows from program A's queue`, async () => {
      const { data, error } = await session().client.rpc(
        'program_join_requests',
        { p_program_id: programA }
      );
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  }

  test('the table itself stays permission-denied, even for staff', async () => {
    // The structural half of the guarantee: there is no query a signed-in
    // session can write against program_requests directly, so no future
    // caller can forget the kind filter and leak a dispute.
    const { data, error } = await aStaff.client
      .from('program_requests')
      .select('id')
      .limit(1);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  // -------------------------------------------------------------------------
  // Write side — resolution, and everyone who must be refused it.
  // -------------------------------------------------------------------------

  test('staff resolve one of their own program\'s requests: status, resolved_by and resolved_at all land', async () => {
    const { error } = await aStaff.client.rpc('resolve_program_join_request', {
      p_request_id: inviteA1,
    });
    expect(error).toBeNull();

    const check = await admin
      .from('program_requests')
      .select('status, resolved_by, resolved_at')
      .eq('id', inviteA1)
      .single();
    expect(check.data?.status).toBe('resolved');
    expect(check.data?.resolved_by).toBe(aStaff.userId);
    expect(check.data?.resolved_at).toBeTruthy();

    // And it has left the queue.
    const { data } = await aStaff.client.rpc('program_join_requests', {
      p_program_id: programA,
    });
    expect(((data ?? []) as JoinRequestRow[]).map((r) => r.id)).toEqual([
      inviteA2,
    ]);
  });

  for (const [who, session] of [
    ['staff of another program', () => bStaff],
    ['a non-member', () => outsider],
    ['a player of the program itself', () => aPlayer],
  ] as const) {
    test(`${who} cannot resolve program A's request`, async () => {
      const { error } = await session().client.rpc(
        'resolve_program_join_request',
        { p_request_id: inviteA2 }
      );
      expect(error).not.toBeNull();
      expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);

      // Untouched, on the service role's authority.
      const check = await admin
        .from('program_requests')
        .select('status, resolved_by')
        .eq('id', inviteA2)
        .single();
      expect(check.data?.status).toBe('open');
      expect(check.data?.resolved_by).toBeNull();
    });
  }

  test('an ownership dispute is unresolvable through this path — even by that program\'s own staff', async () => {
    // The kind filter working on the write side: to this function a dispute
    // id must be indistinguishable from a random guess.
    const { error } = await aStaff.client.rpc('resolve_program_join_request', {
      p_request_id: disputeA,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe(INSUFFICIENT_PRIVILEGE);

    const check = await admin
      .from('program_requests')
      .select('status')
      .eq('id', disputeA)
      .single();
    expect(check.data?.status).toBe('open');
  });

  test('an already-handled request refuses with P0002, and an unknown id with 42501', async () => {
    const handled = await aStaff.client.rpc('resolve_program_join_request', {
      p_request_id: resolvedA,
    });
    expect(handled.error).not.toBeNull();
    expect(handled.error!.code).toBe(NO_DATA_FOUND);

    const unknown = await aStaff.client.rpc('resolve_program_join_request', {
      p_request_id: randomUUID(),
    });
    expect(unknown.error).not.toBeNull();
    expect(unknown.error!.code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
