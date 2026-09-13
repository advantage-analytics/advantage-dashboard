-- Gate first login into two-question onboarding (T1) — trusted-path stamping.
--
-- `onboarded_at` is the gate the dashboard layout reads: null means the
-- account has not completed first-run onboarding and is redirected to
-- /onboarding. Every existing row is backfilled with created_at so nobody who
-- predates the flow is ever re-onboarded.
--
-- This migration supersedes `add_users_onboarded_at` (20260829234841), which
-- added the column but also taught `handle_new_user` to stamp it whenever the
-- auth metadata carried `onboarding_complete: 'true'`. That was a SECURITY
-- DEFINER trigger branching on attacker-controlled input: GoTrue user_metadata
-- is settable by ANY caller of signUp() with the public anon key, so a crafted
-- direct signup could pre-stamp its own account. The trigger below carries no
-- onboarded_at logic at all; accounts born already-onboarded — invite
-- acceptance (`join-actions.ts`) and the claim flow (`claim-actions.ts`) — are
-- stamped by those server actions directly, with the service role, after the
-- row exists.
--
-- Applied to the live database via the Supabase MCP as
-- `onboarded_at_server_stamped` on 2026-08-30; this file records it in the
-- repo. The column half is idempotent because the live database already
-- carries it from the superseded migration.

alter table public.users
  add column if not exists onboarded_at timestamptz;

comment on column public.users.onboarded_at is
  'When this account completed (or was exempted from) first-run onboarding. '
  'Null = the dashboard layout redirects to /onboarding. Backfilled with '
  'created_at for accounts that predate the flow; stamped server-side (service '
  'role) by the invite-acceptance and claim server actions for accounts those '
  'flows create. Never derived from auth metadata — any signUp() caller can '
  'craft that.';

update public.users
set onboarded_at = coalesce(created_at, now())
where onboarded_at is null;

-- The previous live definition of this function stamped onboarded_at from
-- `raw_user_meta_data ->> 'onboarding_complete'` — removed here, and nothing
-- may reintroduce trust in metadata. Everything else (name splitting, conflict
-- handling, the never-fail-the-signup exception guard) is the live definition,
-- unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_full_name text;
  v_first     text;
  v_last      text;
begin
  -- Google hands us full_name/name; email signups have neither. Split on the
  -- first space so "Ana Maria Vasquez" keeps "Maria Vasquez" as the surname.
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if v_full_name is not null then
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := nullif(trim(substr(v_full_name, length(v_first) + 1)), '');
  end if;

  insert into public.users (id, email, first_name, last_name)
  values (new.id, new.email, v_first, v_last)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- A raise here would abort the signup itself, so a profile that cannot be
    -- written must never cost the user their account. The row is recoverable;
    -- the failed signup is not.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$function$;
