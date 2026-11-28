-- 2027 pricing, stage A · the plan model
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it BEFORE deploying app code
-- that reads what it adds. (The workspace loader tolerates a missing
-- `program_plans` — `programPlansByProgram` in
-- src/lib/workspace/active-workspace-server.ts — but nothing else is obliged
-- to.) Decisions cited below are in docs/plans/2027-pricing.md.
--
-- PROVENANCE. Every object this rewrites was read from the LIVE database on
-- 2026-11-25 (`pg_get_constraintdef`, `pg_get_triggerdef`, `pg_proc.prosrc`,
-- `information_schema.column_privileges`), not from this folder, which runs
-- behind the live ledger. Latest live migration then: 20261123160122.
--
-- What it does:
--
--   users          plan widens to free | coach | coach-pro | pro (`pro` is
--                  the one legacy Lifetime row; it is dropped from the check
--                  in stage C, once that row is moved to free). Six billing
--                  columns, written only by the service role (the Stripe
--                  webhook).
--   program_plans  the season plan an admin assigns to a team (plan, term,
--                  dates, note), one row per program, in a table of its own.
--   programs       new teams, and colleges nobody has claimed yet, default
--                  to coaches-only uploads.
--   audit          two verbs, `plan.set` and `plan.cleared`.
--   RPCs           `admin_set_program_plan`, `admin_clear_program_plan`,
--                  `admin_get_program_plan`.
--
-- RE-RUNNABLE. Tables, columns and indexes are `if not exists`, functions
-- and the trigger are `create or replace`, and each check constraint and
-- policy is added inside an existence-checked block, so a second run changes
-- nothing.
--
-- ── Who can write the users columns ────────────────────────────────────────
--
-- `authenticated` holds a table-level SELECT on `public.users` and UPDATE on
-- a fixed list of columns (read live: names, profile fields, tour stamps —
-- not `plan`). A new column is in nobody's list, so the six added here are
-- not client-writable, and this migration grants nothing. The revoke below
-- says so out loud and the last block fails the migration if it stops being
-- true. `users_block_plan_self_update` is the second lock, for the day a
-- grant or policy widens: it now refuses a client JWT changing any of the
-- seven. There is no INSERT grant on `users` for clients at all.
--
-- ── Why the plan is not on `programs` ──────────────────────────────────────
--
-- `programs` has a table-level SELECT for `anon` and `authenticated`, and its
-- policies make every college row readable signed out. A column-level revoke
-- cannot narrow a table-level grant, so plan columns there would tell anyone
-- which college pays for what, and show the invoice note. `program_plans` is
-- a table of its own instead:
--
--   anon           nothing.
--   authenticated  SELECT on every column except `note` and `set_by`, and
--                  only rows of a program they belong to
--                  (`user_program_ids()`, the helper live's policies on
--                  `program_events` / `program_players` use) or, for an
--                  admin, every row. No INSERT, UPDATE or DELETE.
--   writes         only the two SECURITY DEFINER RPCs below.
--   note, set_by   only through `admin_get_program_plan`.
--
-- Default privileges in `public` hand a new table to `authenticated` and
-- `service_role` whole (read live: `arwdDxtm`), which is why the table's
-- grants start with a revoke.

-- ── users ──────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'users_plan_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_plan_check;
  end if;

  alter table public.users
    add constraint users_plan_check
    check (plan = any (array['free', 'coach', 'coach-pro', 'pro']));
end;
$$;

alter table public.users
  add column if not exists plan_period            text,
  add column if not exists plan_status            text,
  add column if not exists plan_period_start      timestamptz,
  add column if not exists plan_period_end        timestamptz,
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_plan_period_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_plan_period_check
      check (plan_period is null or plan_period in ('monthly', 'yearly'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'users_plan_status_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_plan_status_check
      check (plan_status is null or plan_status in ('active', 'past_due', 'canceled'));
  end if;
end;
$$;

create unique index if not exists users_stripe_customer_id_key
  on public.users (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists users_stripe_subscription_id_key
  on public.users (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.users.plan is
  'Paid entitlement (free | coach | coach-pro; pro is the legacy Lifetime value, read as free). Written only by the Stripe webhook via the service role; users_block_plan_self_update blocks client writes.';
comment on column public.users.plan_period is
  'How the plan is billed: monthly | yearly. Null on free. Service role only.';
comment on column public.users.plan_status is
  'The subscription''s state: active | past_due | canceled. Null when there has never been one. The plan stays while Stripe retries a failed payment (past_due). Service role only.';
comment on column public.users.plan_period_start is
  'Start of the current billing period; the plan''s hours are counted from here. Service role only.';
comment on column public.users.plan_period_end is
  'End of the current billing period. Service role only.';
comment on column public.users.stripe_customer_id is
  'Stripe customer for this account. Service role only.';
comment on column public.users.stripe_subscription_id is
  'Stripe subscription behind the plan. Service role only.';

-- No client may write these. A no-op today (nothing granted them), kept so
-- the intent survives a future blanket grant being narrowed by hand.
revoke update (
  plan, plan_period, plan_status, plan_period_start, plan_period_end,
  stripe_customer_id, stripe_subscription_id
) on public.users from anon, authenticated;

-- Same body as live, widened from `plan` to the seven billing columns.
-- `nullif(..., '')` because the setting reads as an empty string, which is
-- not JSON, once it has been set and reset in a session.
create or replace function public.users_block_plan_self_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if (new.plan is distinct from old.plan
      or new.plan_period is distinct from old.plan_period
      or new.plan_status is distinct from old.plan_status
      or new.plan_period_start is distinct from old.plan_period_start
      or new.plan_period_end is distinct from old.plan_period_end
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.stripe_subscription_id is distinct from old.stripe_subscription_id)
     and coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) in ('authenticated', 'anon') then
    raise exception 'plan is managed by billing and cannot be changed by clients'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

create or replace trigger users_block_plan_self_update
  before update of
    plan, plan_period, plan_status, plan_period_start, plan_period_end,
    stripe_customer_id, stripe_subscription_id
  on public.users
  for each row
  execute function public.users_block_plan_self_update();

-- ── program_plans ──────────────────────────────────────────────────────────

create table if not exists public.program_plans (
  program_id    uuid primary key references public.programs (id) on delete cascade,
  plan_id       text not null
    constraint program_plans_plan_id_check
    check (plan_id in ('starter', 'program', 'elite')),
  plan_term     text not null
    constraint program_plans_plan_term_check
    check (plan_term in ('spring', 'full_year')),
  starts_on     date not null,
  ends_on       date not null,
  rush_included integer not null
    constraint program_plans_rush_included_check check (rush_included >= 0),
  set_by        uuid references auth.users (id) on delete set null,
  set_at        timestamptz not null default now(),
  note          text
    constraint program_plans_note_length_check check (char_length(note) <= 500),
  constraint program_plans_window_check check (ends_on >= starts_on)
);

comment on table public.program_plans is
  'The season plan an admin assigned to a team; no row = no plan. Written only by admin_set_program_plan / admin_clear_program_plan. Members read their own team''s row, less note and set_by.';
comment on column public.program_plans.plan_id is
  'starter | program | elite.';
comment on column public.program_plans.plan_term is
  'spring | full_year.';
comment on column public.program_plans.starts_on is
  'First day of the season, inclusive. The team''s hours start here, when the plan is saved, not when it is paid.';
comment on column public.program_plans.ends_on is
  'Last day of the season, inclusive. Unused hours expire here.';
comment on column public.program_plans.rush_included is
  'Rush jobs the plan includes a season, copied from the plan when it is set (starter 0, program 3, elite 6). Not read yet: every job is Standard in this build.';
comment on column public.program_plans.set_by is
  'Admin who last set the plan. Not readable by clients; see admin_get_program_plan.';
comment on column public.program_plans.set_at is
  'When the plan was last set.';
comment on column public.program_plans.note is
  'Invoice or PO reference for the plan. Not readable by clients; see admin_get_program_plan.';

alter table public.program_plans enable row level security;

revoke all on public.program_plans from public, anon, authenticated;
grant select (
  program_id, plan_id, plan_term, starts_on, ends_on, rush_included, set_at
) on public.program_plans to authenticated;
grant all on public.program_plans to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'program_plans'
       and policyname = 'A plan is readable by its program''s members and by admins'
  ) then
    create policy "A plan is readable by its program's members and by admins"
      on public.program_plans
      for select
      to authenticated
      using (
        program_id in (select public.user_program_ids())
        or (select public.is_admin())
      );
  end if;
end;
$$;

-- ── programs ───────────────────────────────────────────────────────────────
--
-- Decision 13 (docs/plans/2027-pricing.md): a NEW team defaults to
-- coaches-only uploads. Live's two inserting functions
-- (`admin_create_program`, `create_custom_program`, read 2026-11-25) name
-- neither column, so both take these defaults.

alter table public.programs
  alter column upload_policy      set default 'owner_coaches',
  alter column players_can_upload set default false;

-- A college is rarely inserted when it joins: it claims a directory row that
-- has been sitting there under the old default. So the default alone would
-- never reach it. Nobody has chosen a policy on an unclaimed row, so those
-- move too. Every other row — claimed, pending, active, suspended — keeps
-- what it has.
update public.programs
   set upload_policy      = 'owner_coaches',
       players_can_upload = false
 where status = 'unclaimed'
   and (upload_policy is distinct from 'owner_coaches'
        or players_can_upload is distinct from false);

-- ── Audit vocabulary ───────────────────────────────────────────────────────
--
-- `program_audit_log_action_check`, read live 2026-11-25 — every value is
-- kept, in live's order. Added: 'plan.set', 'plan.cleared'.

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'program_audit_log_action_check'
       and conrelid = 'public.program_audit_log'::regclass
  ) then
    alter table public.program_audit_log
      drop constraint program_audit_log_action_check;
  end if;

  alter table public.program_audit_log
    add constraint program_audit_log_action_check check (action = any (array[
      'player.added', 'player.updated', 'player.archived', 'player.claimed',
      'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
      'member.removed', 'member.role_changed', 'seats.changed',
      'member.account_deleted', 'lineup.set', 'ownership.transferred',
      'event.deleted', 'player.restored', 'match.attached', 'member.left',
      'program.conference_changed', 'console.result_added',
      'console.analysis_attached', 'join_request.approved',
      'join_request.declined', 'pilot.end_changed', 'pilot.ended',
      'program.details_changed', 'member.upload_changed',
      'program.crest_changed', 'console.submission_reconciled',
      'match.detached', 'match.round_changed', 'pilot.eligibility_changed',
      'join_link.created', 'join_link.revoked', 'join_link.accepted',
      'join_link.mode_changed', 'program.video_sharing_changed',
      'match.opponent_team_changed',
      'plan.set', 'plan.cleared'
    ]));
end;
$$;

-- ── admin_set_program_plan ─────────────────────────────────────────────────
--
-- Assigns or replaces a team's season plan. The shape of every admin RPC:
-- admin gate, lock the program row, audit row, then the write. The lock is on
-- `programs` (not only the plan row, which may not exist yet), so two saves
-- for one team queue and the pilot columns are read under it.
--
-- A team does not hold a pilot and a plan at once. When the pilot would still
-- be running on the plan's first day (`pilot_ends_on >= p_starts_on`, not
-- ended by hand), the pilot's last day is pulled back to the day before, and
-- the audit row says so. `pilot_ended_at` is left alone: that stamp means an
-- admin stopped the pilot early by hand, and this is a pilot giving way to a
-- plan. Clearing the plan later does not put the pilot's old end date back.
--
-- Saving the same plan, term, dates and note again writes nothing and logs
-- nothing, like `admin_set_pilot_end`.

create or replace function public.admin_set_program_plan(
  p_program_id uuid,
  p_plan_id    text,
  p_term       text,
  p_starts_on  date,
  p_ends_on    date,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program        record;
  v_cur            record;
  v_has_plan       boolean;
  v_note           text := nullif(btrim(coalesce(p_note, '')), '');
  v_rush           integer;
  v_pilot_ends_on  date;
  v_details        jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  if p_plan_id is null or p_plan_id not in ('starter', 'program', 'elite') then
    raise exception 'unknown plan %', coalesce(p_plan_id, '(null)')
      using errcode = '22023';
  end if;

  if p_term is null or p_term not in ('spring', 'full_year') then
    raise exception 'unknown term %', coalesce(p_term, '(null)')
      using errcode = '22023';
  end if;

  if p_starts_on is null or p_ends_on is null then
    raise exception 'Plan start and end dates are required.' using errcode = '22023';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'The plan cannot end before it starts.' using errcode = '22023';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'The note is limited to 500 characters.' using errcode = '22023';
  end if;

  -- The figures src/lib/billing/plans.ts holds as `rushIncluded`;
  -- tests/billing-plans.spec.ts fails when the two disagree.
  v_rush := case p_plan_id
              when 'starter' then 0
              when 'program' then 3
              when 'elite'   then 6
            end;

  -- Not a key column, so the weaker lock suffices and does not block FKs into
  -- programs (which take KEY SHARE on this row).
  select p.pilot_ends_on, p.pilot_ended_at
    into v_program
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  select pp.plan_id, pp.plan_term, pp.starts_on, pp.ends_on, pp.note
    into v_cur
    from public.program_plans pp
   where pp.program_id = p_program_id;
  v_has_plan := found;

  if v_program.pilot_ends_on is not null
     and v_program.pilot_ended_at is null
     and v_program.pilot_ends_on >= p_starts_on then
    v_pilot_ends_on := p_starts_on - 1;
  end if;

  -- Same plan and no pilot to move: nothing to change, nothing to log.
  if v_has_plan
     and v_cur.plan_id = p_plan_id
     and v_cur.plan_term = p_term
     and v_cur.starts_on = p_starts_on
     and v_cur.ends_on = p_ends_on
     and v_cur.note is not distinct from v_note
     and v_pilot_ends_on is null then
    return;
  end if;

  v_details := jsonb_build_object(
    'from', case when not v_has_plan then null else jsonb_build_object(
      'plan_id',   v_cur.plan_id,
      'term',      v_cur.plan_term,
      'starts_on', v_cur.starts_on,
      'ends_on',   v_cur.ends_on,
      'note',      v_cur.note
    ) end,
    'to', jsonb_build_object(
      'plan_id',   p_plan_id,
      'term',      p_term,
      'starts_on', p_starts_on,
      'ends_on',   p_ends_on,
      'note',      v_note
    ),
    'rush_included', v_rush,
    'by_admin',      true
  );

  if v_pilot_ends_on is not null then
    v_details := v_details || jsonb_build_object(
      'pilot_ends_on',
      jsonb_build_object('from', v_program.pilot_ends_on, 'to', v_pilot_ends_on)
    );
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, (select auth.uid()), 'plan.set', null, v_details);

  insert into public.program_plans as pp (
    program_id, plan_id, plan_term, starts_on, ends_on,
    rush_included, set_by, set_at, note
  ) values (
    p_program_id, p_plan_id, p_term, p_starts_on, p_ends_on,
    v_rush, (select auth.uid()), now(), v_note
  )
  on conflict (program_id) do update
     set plan_id       = excluded.plan_id,
         plan_term     = excluded.plan_term,
         starts_on     = excluded.starts_on,
         ends_on       = excluded.ends_on,
         rush_included = excluded.rush_included,
         set_by        = excluded.set_by,
         set_at        = excluded.set_at,
         note          = excluded.note;

  if v_pilot_ends_on is not null then
    update public.programs
       set pilot_ends_on = v_pilot_ends_on,
           updated_at    = now()
     where id = p_program_id;
  end if;
end;
$function$;

revoke execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) from public, anon;
grant  execute on function public.admin_set_program_plan(uuid, text, text, date, date, text) to authenticated, service_role;

-- ── admin_clear_program_plan ───────────────────────────────────────────────
--
-- Takes the plan off a team by deleting its row; the audit row is then the
-- record of what it was and who removed it. A team with no plan is left alone
-- and nothing is logged.

create or replace function public.admin_clear_program_plan(
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cur record;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  perform 1
     from public.programs p
    where p.id = p_program_id
      for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  select pp.plan_id, pp.plan_term, pp.starts_on, pp.ends_on,
         pp.rush_included, pp.note
    into v_cur
    from public.program_plans pp
   where pp.program_id = p_program_id;

  if not found then
    return;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'plan.cleared',
    null,
    jsonb_build_object(
      'from', jsonb_build_object(
        'plan_id',       v_cur.plan_id,
        'term',          v_cur.plan_term,
        'starts_on',     v_cur.starts_on,
        'ends_on',       v_cur.ends_on,
        'rush_included', v_cur.rush_included,
        'note',          v_cur.note
      ),
      'to',       null,
      'by_admin', true
    )
  );

  delete from public.program_plans pp where pp.program_id = p_program_id;
end;
$function$;

revoke execute on function public.admin_clear_program_plan(uuid) from public, anon;
grant  execute on function public.admin_clear_program_plan(uuid) to authenticated, service_role;

-- ── admin_get_program_plan ─────────────────────────────────────────────────
--
-- The whole row for the admin's team page, with the two columns no client
-- grant covers (`note`, `set_by`) and the setter's name. No row when the team
-- has no plan. `set_by_name` is null when the admin's account is gone or has
-- no name on it.

create or replace function public.admin_get_program_plan(
  p_program_id uuid
)
returns table (
  program_id    uuid,
  plan_id       text,
  plan_term     text,
  starts_on     date,
  ends_on       date,
  rush_included integer,
  note          text,
  set_by        uuid,
  set_at        timestamptz,
  set_by_name   text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select pp.program_id, pp.plan_id, pp.plan_term, pp.starts_on, pp.ends_on,
         pp.rush_included, pp.note, pp.set_by, pp.set_at,
         nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
    from public.program_plans pp
    left join public.users u on u.id = pp.set_by
   where pp.program_id = p_program_id;
end;
$function$;

revoke execute on function public.admin_get_program_plan(uuid) from public, anon;
grant  execute on function public.admin_get_program_plan(uuid) to authenticated, service_role;

-- ── Assertions ─────────────────────────────────────────────────────────────

do $$
declare
  v_column text;
  v_fn     text;
begin
  foreach v_column in array array[
    'plan', 'plan_period', 'plan_status', 'plan_period_start',
    'plan_period_end', 'stripe_customer_id', 'stripe_subscription_id'
  ] loop
    if has_column_privilege('authenticated', 'public.users', v_column, 'UPDATE')
       or has_column_privilege('anon', 'public.users', v_column, 'UPDATE') then
      raise exception 'users.% is writable by a client role', v_column;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.admin_set_program_plan(uuid, text, text, date, date, text)',
    'public.admin_clear_program_plan(uuid)',
    'public.admin_get_program_plan(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '% is executable signed out', v_fn;
    end if;
  end loop;

  if not (select c.relrowsecurity from pg_class c
           where c.oid = 'public.program_plans'::regclass) then
    raise exception 'program_plans has no row level security';
  end if;

  -- Signed out: nothing, not one column.
  if has_any_column_privilege('anon', 'public.program_plans', 'SELECT') then
    raise exception 'program_plans is readable signed out';
  end if;

  -- Signed in: the plan, but neither the note nor who set it.
  foreach v_column in array array['note', 'set_by'] loop
    if has_column_privilege('authenticated', 'public.program_plans', v_column, 'SELECT') then
      raise exception 'program_plans.% is readable by clients', v_column;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.program_plans', 'plan_id', 'SELECT') then
    raise exception 'program_plans.plan_id is not readable by members';
  end if;

  -- No client writes, by table or by column.
  foreach v_column in array array['anon', 'authenticated'] loop
    if has_any_column_privilege(v_column, 'public.program_plans', 'INSERT')
       or has_any_column_privilege(v_column, 'public.program_plans', 'UPDATE')
       or has_table_privilege(v_column, 'public.program_plans', 'DELETE')
       or has_table_privilege(v_column, 'public.program_plans', 'TRUNCATE') then
      raise exception 'program_plans is writable by %', v_column;
    end if;
  end loop;
end;
$$;
