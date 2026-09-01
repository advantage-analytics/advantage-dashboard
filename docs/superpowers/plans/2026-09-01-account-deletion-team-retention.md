# Account Deletion With Team Retention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Settings › Account › Delete account keep a person's program-filed matches with the program under a coach-managed roster profile, purge only their personal matches, and stop failing on the `program_players_claim_check` constraint.

**Architecture:** One migration adds a security-definer RPC, `release_my_account_from_programs()`, that does every program-side write in a single transaction keyed on `auth.uid()` (re-point self-uploads to the profile, null the uploader columns, un-claim the profile, drop memberships, audit). A trigger keeps `claimed_at` paired with `claimed_by_user_id` so the FK's SET NULL can never trip the check again. `deleteAccount()` calls the RPC as the user, then purges personal matches and deletes the login with the admin client, in the order it already uses.

**Tech Stack:** Next.js 16 server actions, Supabase (Postgres 15, PostgREST RPC, RLS), supabase-js v2, Playwright as the test runner against the live database via `tests/fixtures/live-db.ts`.

**Spec:** `docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md` — read it first; every task below cites its sections.

## Global Constraints

- Work in this worktree only: `/Users/cjgimena/Desktop/vscode/advantage-dashboard/.claude/worktrees/delete-cjgimena-email-d017fe`, branch `claude/delete-cjgimena-email-d017fe`. `node_modules` is absent until Task 1 runs `npm ci`; `.env.local` is already present.
- **The live database is the only schema source of truth.** Verify with `mcp__supabase__execute_sql`; never trust `supabase/migrations/` as a description of what is deployed.
- **Never edit an applied migration.** New file, stamp from `date -u +%Y%m%d%H%M%S`, applied with `mcp__supabase__apply_migration`, then `mcp__supabase__get_advisors` (load both with `ToolSearch` `select:` first if they are deferred).
- Every SQL function: `security definer`, `set search_path = ''`, every relation schema-qualified, identity from `(select auth.uid())`, `28000` when absent, `42501` for refusals. Grants: `revoke … from public, anon; grant … to authenticated`.
- `docs/ui-revamp-guardrails.md` §2: no mutation of existing match rows **except** the two reviewed exceptions. This plan adds the second; touch only `player1_id`, `player2_id`, `created_by` on matches, never `score`, `format`, `program_id`, `event_entry_id`, `match_stats`, `points`, `shots`.
- User-visible strings never say "SplitStep"; the provider is "Advantage Intelligence".
- Imports use the `@/` alias. Row types are `Db`-prefixed in `src/lib/data/types.ts`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Gates before "done": `npx tsc --noEmit`, `npm run lint` (no new warnings beyond the pre-existing count), `npm test`.

---

## File structure

| Path | Responsibility |
|---|---|
| `tests/account-deletion-retention.spec.ts` (create) | Live-DB proof of the RPC, the trigger, idempotency, and the owner guard. Domain fixtures inline, session plumbing from `tests/fixtures/live-db.ts`. |
| `supabase/migrations/<stamp>_account_deletion_retains_program_data.sql` (create) | Nullable uploader columns, `match_files` FK to SET NULL, paired-null trigger, partial index, the RPC and its grants. |
| `src/components/dashboard/settings/actions.ts` (modify, `deleteAccount` at lines 119–214) | Sequence: RPC as user → personal purge → stragglers → auth delete. |
| `src/app/dashboard/settings/account/page.tsx` (modify, lines 30–31, 79–80, 179–206) | Copy, and the owner box computed from every workspace. |
| `src/app/api/splitstep/jobs/route.ts:142`, `src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts:78`, `src/lib/services/splitstep/resubmit-job.ts:104–156` (modify) | Uploader may be null on a job row; resubmit refuses when it is. |
| `docs/ui-revamp-guardrails.md` §2 (modify, after line 77) | Second reviewed exception. |
| `docs/README.md` (modify) | Index row for the spec. |

---

### Task 1: The failing live-database spec

**Files:**
- Create: `tests/account-deletion-retention.spec.ts`
- Read for patterns: `tests/rls-workspace-isolation.spec.ts`, `tests/fixtures/live-db.ts`

**Interfaces:**
- Consumes: `runMarker`, `createAdminClient`, `createLogins`, `deleteAuthUsers`, `HAVE_ENV`, `SKIP_REASON`, `INSUFFICIENT_PRIVILEGE`, `type Session` from `./fixtures/live-db`.
- Produces: the contract Task 2's migration must satisfy — RPC name `release_my_account_from_programs` (no arguments) returning rows `{ program_id, profile_id, retained, repointed }`; audit action string `member.account_deleted`; trigger behaviour on `program_players`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm ci
```
Expected: completes without error; `node_modules/` exists.

- [ ] **Step 2: Write the spec**

Create `tests/account-deletion-retention.spec.ts`:

```ts
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

  test('team matches are re-pointed to the profile, uploader cleared, still the program's', async () => {
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

  test('the personal match is untouched and still only the player's', async () => {
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
```

- [ ] **Step 3: Run it and confirm it fails for the right reasons**

Run:
```bash
npx playwright test tests/account-deletion-retention.spec.ts
```
Expected: the fixture builds; "an owner is refused" and "the player is released" fail with a PostgREST error naming a missing function (`Could not find the function public.release_my_account_from_programs`); the dependent assertions fail; "deleting a login through auth un-claims" fails with `removed.error` set to the `program_players_claim_check` violation. `afterAll` cleans up: confirm with

```sql
select count(*) from programs where program_key like 'acct-del-%';
```
via `mcp__supabase__execute_sql` — expected `0`.

- [ ] **Step 4: Commit the red spec**

```bash
git add tests/account-deletion-retention.spec.ts
git commit -m "test: live-DB spec for account deletion retaining program data

Red on purpose: release_my_account_from_programs() and the claimed_at
trigger land in the next commit.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The migration

**Files:**
- Create: `supabase/migrations/<stamp>_account_deletion_retains_program_data.sql`
- Test: `tests/account-deletion-retention.spec.ts` (from Task 1)

**Interfaces:**
- Consumes: nothing from earlier tasks besides the spec's contract.
- Produces: `public.release_my_account_from_programs()` → `table(program_id uuid, profile_id uuid, retained integer, repointed integer)`, callable by `authenticated`; trigger `program_players_clear_claimed_at`; nullable `processing_jobs.created_by`, `processing_usage.created_by`; `match_files_uploaded_by_fkey` with `on delete set null`; index `program_players_claimed_by_idx`. Task 3 calls the RPC by this exact name.

- [ ] **Step 1: Record the current shape (the "failing test" for DDL)**

Run via `mcp__supabase__execute_sql`:

```sql
select
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='processing_jobs' and column_name='created_by') as jobs_created_by_nullable,
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='processing_usage' and column_name='created_by') as usage_created_by_nullable,
  (select confdeltype from pg_constraint where conname='match_files_uploaded_by_fkey') as match_files_fk_action,
  (select count(*) from pg_trigger where tgname='program_players_clear_claimed_at') as trigger_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='release_my_account_from_programs') as rpc_count,
  (select count(*) from pg_indexes where indexname='program_players_claimed_by_idx') as index_count;
```
Expected: `NO, NO, c, 0, 0, 0`.

- [ ] **Step 2: Write the migration file**

Get the stamp:
```bash
date -u +%Y%m%d%H%M%S
```
It must sort after `20260830140001_drop_roster_visible.sql`. Create
`supabase/migrations/<stamp>_account_deletion_retains_program_data.sql`:

```sql
-- Account deletion leaves team data behind.
--
-- Deleting auth.users used to fail for anyone with a claimed roster profile:
-- program_players.claimed_by_user_id is ON DELETE SET NULL, and
-- program_players_claim_check requires claimed_by_user_id and claimed_at to be
-- null TOGETHER, so the referential action itself violated the check. It also
-- deleted every match the person ever filed, wherever it was filed.
--
-- After this migration:
--   * A person's program-filed matches stay with the program, re-pointed to
--     their roster profile (the second reviewed exception to
--     docs/ui-revamp-guardrails.md §2), with the uploader columns cleared.
--   * The profile becomes coach-managed. The trigger below keeps the paired
--     invariant even when the FK action is what clears the claim, so a
--     Studio delete of auth.users un-claims instead of failing.
--   * The uploader columns that were NOT NULL may now outlive the uploader,
--     and match_files no longer takes the team's file rows with it.
--
-- Spec: docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md

-- 1. Uploader columns may outlive the uploader.
alter table public.processing_jobs  alter column created_by drop not null;
alter table public.processing_usage alter column created_by drop not null;

-- 2. match_files: a departed uploader must not delete the team's file rows.
--    Guarded on the current action so a re-run is a no-op.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'match_files_uploaded_by_fkey'
       and conrelid = 'public.match_files'::regclass
       and confdeltype = 'c'
  ) then
    alter table public.match_files drop constraint match_files_uploaded_by_fkey;
    alter table public.match_files
      add constraint match_files_uploaded_by_fkey
      foreign key (uploaded_by) references public.users(id)
      on update cascade on delete set null;
  end if;
end $$;

-- 3. The paired-null invariant, enforced where the FK action cannot see it.
--    Referential actions run as ordinary UPDATEs and fire row triggers.
create or replace function public.program_players_clear_claimed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.claimed_at := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists program_players_clear_claimed_at on public.program_players;
create trigger program_players_clear_claimed_at
  before update of claimed_by_user_id on public.program_players
  for each row
  when (new.claimed_by_user_id is null and new.claimed_at is not null)
  execute function public.program_players_clear_claimed_at();

-- 4. The column the release function and the SET NULL action both filter on.
--    program_players_claimed_key leads on program_id and cannot serve either.
create index if not exists program_players_claimed_by_idx
  on public.program_players (claimed_by_user_id)
  where claimed_by_user_id is not null;

-- 5. The release. No arguments: the subject is the caller, so this can only
--    ever release the account that invokes it. Called by deleteAccount() with
--    the user's own client, before the admin client deletes the login.
create or replace function public.release_my_account_from_programs()
returns table (program_id uuid, profile_id uuid, retained integer, repointed integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := (select auth.uid());
  v_class text;
  r       record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- An owner leaving would strand the program and every match kept here.
  -- Enforced in SQL so no caller can skip it; the page repeats the sentence.
  if exists (
    select 1 from public.program_members pm
     where pm.user_id = v_uid and pm.role = 'owner'
  ) then
    raise exception 'transfer ownership of your program before deleting your account'
      using errcode = '42501';
  end if;

  select u.class into v_class from public.users u where u.id = v_uid;

  -- Every program this person touches: a membership, a claimed profile, or
  -- a program-filed match. Programs in id order and a fixed statement order
  -- inside the loop, so two concurrent releases cannot lock in opposite
  -- orders.
  for r in
    select p.id as program_id,
           pp.id as profile_id,
           pm.role
      from public.programs p
      left join public.program_players pp
        on pp.program_id = p.id
       and pp.claimed_by_user_id = v_uid
       and pp.merged_into_id is null
      left join public.program_members pm
        on pm.program_id = p.id and pm.user_id = v_uid
     where pp.id is not null
        or pm.id is not null
        or exists (select 1 from public.matches m
                    where m.program_id = p.id and m.created_by = v_uid)
     order by p.id
  loop
    repointed := 0;

    -- Attribution columns only. A self-upload with no player id at all is
    -- the uploader's — the rule playerSide() already applies at read time.
    if r.profile_id is not null then
      with moved as (
        update public.matches m
           set player1_id = case
                 when m.player1_id = v_uid then r.profile_id
                 when m.player1_id is null and m.player2_id is null
                      and m.created_by = v_uid then r.profile_id
                 else m.player1_id end,
               player2_id = case when m.player2_id = v_uid then r.profile_id
                                 else m.player2_id end
         where m.program_id = r.program_id
           and (m.player1_id = v_uid or m.player2_id = v_uid
                or (m.player1_id is null and m.player2_id is null
                    and m.created_by = v_uid))
         returning m.id
      )
      select count(*) into repointed from moved;
    end if;

    -- Uploader columns: the login is leaving; the rows are not.
    update public.processing_jobs pj set created_by = null
     where pj.created_by = v_uid
       and pj.match_id in (select m.id from public.matches m
                            where m.program_id = r.program_id);
    update public.match_files mf set uploaded_by = null
     where mf.uploaded_by = v_uid
       and mf.match_id in (select m.id from public.matches m
                            where m.program_id = r.program_id);
    update public.processing_usage pu set created_by = null
     where pu.created_by = v_uid
       and pu.account_type = 'program' and pu.account_id = r.program_id;
    with kept as (
      update public.matches m set created_by = null
       where m.program_id = r.program_id and m.created_by = v_uid
       returning m.id
    )
    select count(*) into retained from kept;

    -- The profile becomes coach-managed. class_year is filled only where the
    -- coach never recorded one; the login email is never written here.
    if r.profile_id is not null then
      update public.program_players pp
         set claimed_by_user_id = null,
             claimed_at = null,
             class_year = coalesce(pp.class_year, v_class),
             updated_at = now()
       where pp.id = r.profile_id;
    end if;

    delete from public.program_members pm
     where pm.program_id = r.program_id and pm.user_id = v_uid;

    -- actor_user_id is nulled by the FK when the login goes moments later;
    -- details.former_user_id is the durable reference.
    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (r.program_id, v_uid, 'member.account_deleted', r.profile_id,
       jsonb_build_object(
         'former_user_id', v_uid,
         'role', r.role,
         'matches_retained', retained,
         'matches_repointed', repointed));

    program_id := r.program_id;
    profile_id := r.profile_id;
    return next;
  end loop;
end;
$$;

comment on function public.release_my_account_from_programs() is
  'Account deletion, program side: re-points the caller''s self-uploads to their roster '
  'profile, clears uploader columns on program-filed rows, un-claims the profile, drops '
  'memberships, audits. Idempotent. Refuses owners (42501).';

revoke execute on function public.release_my_account_from_programs() from public, anon;
grant  execute on function public.release_my_account_from_programs() to authenticated;
```

- [ ] **Step 3: Apply it**

Call `mcp__supabase__apply_migration` with `name` = the filename without `.sql` and `query` = the file's full contents. Expected: success with no error.

- [ ] **Step 4: Verify the shape**

Re-run the Step 1 query. Expected: `YES, YES, n, 1, 1, 1`.

Then confirm the grants:
```sql
select grantee, privilege_type from information_schema.routine_privileges
 where routine_schema='public' and routine_name='release_my_account_from_programs'
 order by grantee;
```
Expected: rows for `authenticated`, `postgres`, `service_role`; **no** `anon`, **no** `PUBLIC`.

- [ ] **Step 5: Run the advisors**

Call `mcp__supabase__get_advisors` with `type: "security"` and again with `type: "performance"`. Expected: nothing new naming `release_my_account_from_programs`, `program_players_clear_claimed_at`, `match_files`, `processing_jobs`, or `processing_usage`. Report the output verbatim in the task summary either way.

- [ ] **Step 6: Run the spec — it must go green**

```bash
npx playwright test tests/account-deletion-retention.spec.ts
```
Expected: 9 passed. If the first RPC test reports the function still missing, PostgREST's schema cache has not reloaded; run `notify pgrst, 'reload schema';` via `execute_sql` and retry once.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): release_my_account_from_programs and the claimed_at trigger

Program-filed matches survive account deletion, re-pointed to the roster
profile with uploader columns cleared; the profile becomes coach-managed;
owners are refused. A BEFORE UPDATE trigger keeps claimed_at paired with
claimed_by_user_id so the FK's SET NULL no longer violates
program_players_claim_check.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `deleteAccount()` calls the release first

**Files:**
- Modify: `src/components/dashboard/settings/actions.ts:119-214`

**Interfaces:**
- Consumes: `release_my_account_from_programs` (Task 2) via `supabase.rpc(...)` on the **user's** client; returns `ReleasedProgram[]`.
- Produces: `deleteAccount(): Promise<ActionResult>` unchanged in signature; two new error sentences the page shows verbatim.

- [ ] **Step 1: Replace the doc comment and the function**

Replace everything from the `/**` at line 119 through the closing `}` at line 214 with:

```ts
/**
 * Delete the signed-in user's account.
 *
 * Program-filed matches are NOT deleted. A match can only be filed under a
 * program by a current member, and where it is filed never changes, so
 * `program_id` alone says "uploaded while on the team". Those rows stay with
 * the program, attributed to the person's roster profile, which becomes
 * coach-managed. `release_my_account_from_programs()` does every program-side
 * write in one transaction — the second reviewed exception to
 * docs/ui-revamp-guardrails.md §2 — and is called with the USER's client so
 * it can only ever act on the caller. It refuses while the caller still owns
 * a program (42501); the page repeats that sentence.
 *
 * Personal matches (`program_id is null`) are purged, storage first. This
 * used to be a single `auth.admin.deleteUser()` call, and it could not work
 * for anyone who had ever uploaded a match: deleting an `auth.users` row
 * cascades into `public.users`, and three foreign keys point at that table
 * with NO ACTION — `matches.created_by`, `processing_jobs.created_by` and
 * `processing_usage.created_by`. Any one row under any of them pinned the
 * account in place, in Supabase Studio as well as here.
 *
 * The fix is NOT `ON DELETE CASCADE` on those keys. A database-level cascade
 * bypasses `purgeMatchStorage()`, which is what removes the Azure video
 * blobs, the vendor results and the uploaded provider files. So the ordering
 * is enforced here, in code, where the storage step exists.
 *
 * Order: release from programs, then storage, then personal matches, then
 * stragglers, then the auth user last. If an earlier step fails the account
 * still exists and the user can retry — every step is idempotent — where
 * the reverse would leave orphaned data belonging to nobody.
 */
export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Your session expired. Sign in again to delete your account." };
  }

  // 1. Programs first, and as the user: the RPC derives its subject from
  //    auth.uid(), so the admin client would have nobody to act for. Failing
  //    here changes nothing, which is the point of doing it first.
  const { data: released, error: releaseError } = await supabase.rpc(
    "release_my_account_from_programs"
  );

  if (releaseError) {
    if (releaseError.code === "42501") {
      return {
        ok: false,
        error:
          "You still own a program. Transfer ownership in Team settings, then delete your account.",
      };
    }
    console.error("[account delete] program release failed:", releaseError.message);
    return {
      ok: false,
      error: "We could not release your team data, so nothing was deleted. Try again.",
    };
  }

  for (const row of (released ?? []) as ReleasedProgram[]) {
    console.log(
      `[account delete] released from program ${row.program_id}: ` +
        `${row.retained} match(es) retained, ${row.repointed} re-pointed`
    );
  }

  // Admin client for the cleanup: the id is the authenticated caller's own,
  // never anything supplied by the request, so this widens what can be deleted
  // and not whose data can be reached.
  const adminClient = createAdminClient();

  // 2. Personal matches only. Program-filed rows were re-homed above and no
  //    longer carry this user as created_by; the filter makes that explicit
  //    rather than relying on it.
  const { data: matches, error: matchesError } = await adminClient
    .from("matches")
    .select("id")
    .eq("created_by", user.id)
    .is("program_id", null);

  if (matchesError) {
    console.error("[account delete] could not list matches:", matchesError.message);
    return {
      ok: false,
      error: "We could not read your matches, so nothing was deleted. Try again.",
    };
  }

  const matchIds = (matches ?? []).map((m) => m.id as string);

  // Storage BEFORE rows — the object keys live on `processing_jobs`, which
  // cascades away with the match.
  await purgeMatchStorage(adminClient, matchIds, "account delete");

  if (matchIds.length > 0) {
    const { error: matchDeleteError } = await adminClient
      .from("matches")
      .delete()
      .in("id", matchIds);

    if (matchDeleteError) {
      console.error("[account delete] match delete failed:", matchDeleteError.message);
      return {
        ok: false,
        error: "We could not delete your matches, so your account is unchanged. Try again.",
      };
    }
  }

  // 3. Stragglers: individual-ledger usage, and a job or usage row this user
  //    created against a match that was not theirs. Neither cascades from
  //    `matches`, and either one would block the auth delete below. Both are
  //    keyed to the caller and best-effort — a failure here surfaces as the
  //    auth delete refusing, which is the honest outcome.
  await adminClient.from("processing_jobs").delete().eq("created_by", user.id);
  await adminClient.from("processing_usage").delete().eq("created_by", user.id);

  // 4. The login, last.
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteAuthError) {
    console.error("[account delete] auth delete failed:", deleteAuthError.message);
    return {
      ok: false,
      error:
        "Your data was removed but the account itself could not be deleted. " +
        "Contact support and we will finish it by hand.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/** One row per program `release_my_account_from_programs()` touched. */
type ReleasedProgram = {
  program_id: string;
  profile_id: string | null;
  retained: number;
  repointed: number;
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors. If `releaseError.code` is flagged, the `PostgrestError` type has `code: string`; check the import chain rather than casting.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/settings/actions.ts
git commit -m "feat(settings): deleteAccount releases program data before purging personal matches

Calls release_my_account_from_programs() as the user, maps the owner
refusal to a sentence, and purges only program_id-null matches.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Account page copy and the owner box

**Files:**
- Modify: `src/app/dashboard/settings/account/page.tsx:30-31, 79-80, 179-206`

**Interfaces:**
- Consumes: `useWorkspace()` → `{ active, available, viewer }` (`src/lib/workspace/types.ts:151`), `Workspace.kind`, `Workspace.role`, `Workspace.name`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Read `available` from the workspace context**

Line 31, replace
```tsx
  const { active, viewer } = useWorkspace();
```
with
```tsx
  const { available, viewer } = useWorkspace();
```
(`active` is no longer read anywhere in this file after Step 2.)

- [ ] **Step 2: Compute ownership across every workspace**

Lines 79–80, replace
```tsx
  const canDelete = confirmText === viewer.email;
  const ownsProgram = active.kind === "team" && active.role === "owner";
```
with
```tsx
  const canDelete = confirmText === viewer.email;
  // Every workspace, not the active one: the guard in the database refuses
  // deletion while this account owns ANY program, and the box has to warn
  // about the same set or someone reading their personal workspace is
  // refused without ever having been told why.
  const ownedPrograms = available.filter(
    (workspace) => workspace.kind === "team" && workspace.role === "owner"
  );
  const ownsProgram = ownedPrograms.length > 0;
  const ownedNames = ownedPrograms.map((workspace) => workspace.name).join(", ");
```

- [ ] **Step 3: Rewrite the deletion sentence and the owner box**

Lines 179–182, replace
```tsx
          <span className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
            Removes match data, statistics, reports, and your account record.
            This cannot be undone.
          </span>
```
with
```tsx
          <span className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
            Removes your personal matches, statistics, reports, and your
            account record. Matches you filed under a team stay with that
            team, as a profile its coaches manage. This cannot be undone.
          </span>
```

Lines 192–204 (inside the `ownsProgram &&` block), replace
```tsx
                <div className="text-[12px] text-[var(--ink-900)]">
                  You own {active.name}
                </div>
                <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-600)]">
                  Transfer ownership first, or the program goes with you.{" "}
                  <Link
                    href="/dashboard/settings/team"
                    className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
                  >
                    Team settings
                  </Link>
                </div>
```
with
```tsx
                <div className="text-[12px] text-[var(--ink-900)]">
                  You own {ownedNames}
                </div>
                <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-600)]">
                  Deletion is blocked until you transfer ownership.{" "}
                  <Link
                    href="/dashboard/settings/team"
                    className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
                  >
                    Team settings
                  </Link>
                </div>
```

- [ ] **Step 4: Type-check and lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors; the lint warning count equals the count before this task (note it in the summary).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/account/page.tsx
git commit -m "feat(settings): account page says what deletion keeps, warns every owner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: A job row's uploader may be null

**Files:**
- Modify: `src/app/api/splitstep/jobs/route.ts:142`
- Modify: `src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts:78`
- Modify: `src/lib/services/splitstep/resubmit-job.ts:104-156`

**Interfaces:**
- Consumes: nothing from earlier tasks (the column is nullable after Task 2, which is why these types change).
- Produces: `resubmitJob()` returns `{ ok: false, reason: 'not_found', ... }` for a job whose uploader is gone; no signature change.

- [ ] **Step 1: The submit route's cast**

`src/app/api/splitstep/jobs/route.ts:142`, replace
```ts
    created_by: string;
```
with
```ts
    created_by: string | null;
```
(The guard at line 135 already compares it to `user.id` before the cast, and nothing after the cast reads it.)

- [ ] **Step 2: The resubmit route's cast**

`src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts:78`, replace
```ts
  if (!jobRow || (jobRow as { created_by: string }).created_by !== user.id) {
```
with
```ts
  if (!jobRow || (jobRow as { created_by: string | null }).created_by !== user.id) {
```

- [ ] **Step 3: `resubmitJob` refuses a parent with no uploader**

`src/lib/services/splitstep/resubmit-job.ts`. Leave `ParentJob.created_by: string` at line 106 — a resubmittable parent has an uploader, and that type feeds an insert and two billing calls that require one. Change how the row becomes a `ParentJob`. Replace lines 153–156:

```ts
  if (parentError || !parentRow) {
    return { ok: false, reason: 'not_found', message: 'Job not found.' };
  }
  const parent = parentRow as ParentJob;
```
with
```ts
  if (parentError || !parentRow) {
    return { ok: false, reason: 'not_found', message: 'Job not found.' };
  }

  // `created_by` is nullable since the uploader may have deleted their
  // account (release_my_account_from_programs). The match stayed with its
  // program, but nothing may spend quota on a departed person's behalf, so
  // the job reads as not found — the same answer the route gives for
  // "not yours".
  const raw = parentRow as Omit<ParentJob, 'created_by'> & { created_by: string | null };
  if (!raw.created_by) {
    return {
      ok: false,
      reason: 'not_found',
      message:
        'The account that uploaded this analysis no longer exists, so it cannot be retried.',
    };
  }
  const parent: ParentJob = { ...raw, created_by: raw.created_by };
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/splitstep/jobs/route.ts "src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts" src/lib/services/splitstep/resubmit-job.ts
git commit -m "fix(splitstep): tolerate a job whose uploader deleted their account

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Docs — the second guardrail exception and the index row

**Files:**
- Modify: `docs/ui-revamp-guardrails.md` (insert after line 77, the last line of the merge exception blockquote)
- Modify: `docs/README.md` (add a table row)

- [ ] **Step 1: Add the exception to §2**

In `docs/ui-revamp-guardrails.md`, directly after the blockquote line
```
> `match_id` + `is_player1`, never on a player id.
```
insert a blank line and then:

```markdown
> **A second reviewed exception, added 2026-09-01: `release_my_account_from_programs`.**
>
> Account deletion re-points `matches.player1_id` / `player2_id` from the
> departing login id to that person's roster profile id, on one program's
> rows, and clears `created_by` on the same rows. Weighed against this rule
> on the merge exception's terms and allowed for the same reason: it is the
> opposite of a silent bulk rewrite. It is a single explicit action by the
> data subject; scoped to their own rows in programs they belong to;
> touching **only** the attribution and uploader columns — never `score`,
> `format`, `program_id` or `event_entry_id`, and nothing under
> `match_stats`, `points` or `shots`; and audit-logged to `program_audit_log`
> as `member.account_deleted` with the counts. Without it a self-uploaded
> team match would detach from the coach-managed profile the moment the
> login that filed it disappears. Design:
> `docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md`.
```

- [ ] **Step 2: Index the spec**

In `docs/README.md`, after the `llm-setup.md` row of the first table, add:

```markdown
| [`superpowers/specs/2026-09-01-account-deletion-team-retention-design.md`](superpowers/specs/2026-09-01-account-deletion-team-retention-design.md) | Why deleting an account keeps program-filed matches with the program under a coach-managed profile, purges only personal ones, refuses owners, and how the `program_players_claim_check` failure was fixed at the root. **Design spec (2026-09-01)**, implemented on `claude/delete-cjgimena-email-d017fe` | You are changing account deletion, roster claims, or any FK that points at `users` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/ui-revamp-guardrails.md docs/README.md
git commit -m "docs: record the account-deletion re-point as a reviewed guardrail exception

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Gates and the click-through

**Files:** none new.

- [ ] **Step 1: The three gates**

```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: tsc clean; lint at the pre-existing warning count with 0 errors; every spec passes, including `tests/account-deletion-retention.spec.ts` (9 passed) and `tests/rls-workspace-isolation.spec.ts` (its `afterAll` deletes matches by `created_by` and still works because nothing in it calls the release).

- [ ] **Step 2: Click-through on the live app as a player**

Start the dev server with the Browser pane (`preview_start`, name from `.claude/launch.json`; create the entry `{ "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }` if missing). Use a **throwaway** Google-less email login you create in Supabase Studio for this, rostered as a `player` on ZZ Test Program (`edaf1aa0-b346-4a9f-aa8d-d47d586d25a4`) with a claimed profile, one team-filed match uploaded from the team workspace and one personal match. Then:

1. Settings › Account: the deletion sentence reads "Removes your personal matches … Matches you filed under a team stay with that team, as a profile its coaches manage." No owner box.
2. Type the email, click **Delete account**: redirected to `/`; the login is gone (`select 1 from auth.users where email = …` returns nothing).
3. As the program owner: Team › Roster shows the profile with the coach-managed mark; the team match still opens; the personal match is gone.
4. Sign in as an **owner** account instead and open Settings › Account: the box reads "You own ZZ Test Program" / "Deletion is blocked until you transfer ownership."; typing the email and clicking Delete shows "You still own a program. Transfer ownership in Team settings, then delete your account." and nothing is deleted.

Take a screenshot of steps 1 and 4 for the summary.

- [ ] **Step 3: Update the spec's status line and commit**

In `docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md`, change
```
Status: approved in brainstorm (2026-09-01), awaiting written review
```
to
```
Status: approved 2026-09-01; implemented on `claude/delete-cjgimena-email-d017fe`
```

```bash
git add docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md
git commit -m "docs: mark the account-deletion spec implemented

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

| Spec section | Task |
|---|---|
| §1 Behaviour (retention per `program_id`, coach-managed profile, seat released, owner refused) | Task 2 (RPC), proven by Task 1's spec |
| §2 Deletion sequence, error contract | Task 3 |
| §3 Migration (nullable columns, `match_files` FK, trigger, index) | Task 2 steps 2–4 |
| §4 Function body, grants, regraft trigger compatibility | Task 2 step 2; spec's "team matches are re-pointed" test exercises the trigger path |
| §5 Code changes: actions, page, row types, guardrails, README | Tasks 3, 4, 5, 6 |
| §6 Error handling sentences | Task 3 step 1 |
| §7 Testing (nine assertions, gates, click-through) | Task 1 (nine tests), Task 7 |
| §8 Out of scope | not implemented, by design |
| §9 Best-practices review | Task 2 step 5 (`get_advisors`) plus the function shape in step 2 |

Type consistency: `ReleasedProgram` (Task 3) matches the RPC's `returns table` (Task 2) column for column; the audit action string `member.account_deleted` is identical in Task 1, Task 2 and Task 6; the RPC name is identical in Tasks 1, 2, 3 and 6.
