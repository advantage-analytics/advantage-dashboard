-- Block `users.is_admin` self-promotion.
--
-- `public.users` has a single permissive RLS policy, `Enable ALL permissions
-- for users based on user_id`, granted to `authenticated` with both USING and
-- WITH CHECK = `(select auth.uid()) = id`. That is row scoping only: it says
-- nothing about which *columns* a user may write to their own row. Combined
-- with the grants below, any signed-in user could PATCH `is_admin = true` on
-- themselves and walk into `/admin` (`src/app/admin/layout.tsx` and
-- `src/lib/services/programs/admin-actions.ts` both gate on this column, and
-- `public.is_admin()` reads it).
--
-- Live grants on public.users BEFORE this migration
-- (information_schema.role_table_grants, 2026-09-14):
--
--   anon          DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   authenticated DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   postgres      DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   service_role  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- information_schema.column_privileges confirmed these are table-wide (every
-- one of the 27 columns carried SELECT/INSERT/UPDATE/REFERENCES for both anon
-- and authenticated) — i.e. an ALL-equivalent grant, not column-scoped. This
-- migration narrows `anon` and `authenticated` only; `postgres` and
-- `service_role` are left untouched so the Stripe webhook, the admin client and
-- migrations keep working.
--
-- Why no `grant insert` for authenticated: the profile row is created by
-- `auth.users`' `on_auth_user_created` trigger calling
-- `public.handle_new_user()`, which is `SECURITY DEFINER` owned by `postgres`
-- with `search_path = ''`. It inserts as postgres, not as the signing-up
-- client, so sign-up does not need (and never used) an `authenticated` INSERT
-- privilege. No application code inserts, upserts or deletes `public.users`
-- from a client/anon key — verified by grepping every `.from("users")` call
-- site in src/ and supabase/functions/: all are select or update.
--
-- Defence in depth: the trigger below blocks the write even if a future grant
-- or policy widens again, mirroring `users_block_plan_self_update`
-- (20260806144035_separate_user_plan_from_role.sql).

create or replace function public.users_block_admin_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
       (tg_op = 'INSERT' and new.is_admin is true)
       or (tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin)
     )
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
         in ('authenticated', 'anon') then
    raise exception 'is_admin is managed by operators and cannot be changed by clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists users_block_admin_self_update on public.users;

create trigger users_block_admin_self_update
  before insert or update of is_admin on public.users
  for each row
  execute function public.users_block_admin_self_update();

comment on column public.users.is_admin is
  'Platform operator flag, read by public.is_admin() and the /admin layout. Written only by the service role or a migration; users_block_admin_self_update blocks client writes and authenticated holds no UPDATE privilege on this column.';

-- Least privilege. `anon` loses every grant: the RLS policy is scoped to the
-- `authenticated` role, so anon could never read or write a row anyway.
-- `authenticated` keeps SELECT (its own row, per RLS) and column-scoped UPDATE
-- on everything except the two operator-owned columns, `is_admin` and `plan`.
revoke all on public.users from anon, authenticated;

grant select on public.users to authenticated;

grant update (
  id,
  email,
  phone,
  dob,
  state,
  country,
  role,
  created_at,
  utr_id,
  first_name,
  last_name,
  nationality,
  weight,
  height,
  hand,
  backhand,
  class,
  atp_id,
  wta_id,
  school_name,
  onboarded_at,
  junior_player_name,
  junior_class_year,
  guardian_consent_at,
  avatar_path
) on public.users to authenticated;

-- Admins are a handful of rows in a table of every user, and `is_admin` is a
-- boolean that is false almost everywhere — a partial index keeps "list the
-- operators" off a sequential scan without indexing the false majority.
create index if not exists users_admins_idx on public.users (id) where is_admin;
