-- Write-once identity: once set, the account itself can no longer change its
-- date of birth, its persona, or the guardian fields.
--
--   users.dob                  the age gate's answer (src/app/onboarding/age.ts)
--   users.role                 the persona onboarding records (`parent` marks a
--                              guardian account)
--   users.guardian_consent_at  when a guardian consented (Guardian Terms 1.1)
--   users.junior_player_name   the player a guardian account is for
--   users.junior_class_year
--
-- Why: these decide whether an account may hold an account at all, may join
-- a team (`join_age_refusal()`, 20261026080000), and whether its video may
-- ever train models (`training_excluded_for()`, 20261026061018). All five are
-- column-granted to `authenticated` (20260914100000), so before this a
-- signed-in browser could PATCH an under-13's `dob` to an adult date, or a
-- guardian account's `role` and consent to nothing, straight through
-- PostgREST — and walk past both rules.
--
-- The rule, for a client JWT (`authenticated` / `anon`, the same test
-- `users_block_plan_self_update` uses):
--   * null → a value is allowed: onboarding, the join screens' age gate and
--     Settings › Profile (for an account that predates the gate) all set a
--     date for the first time this way;
--   * a value → anything else (another value, or null) is refused, 42501;
--   * a first `dob` under 13 is refused too: the app never sends one
--     (`age.ts` refuses it first), so only a direct call reaches this.
-- The service role is not a client and passes: a correction made by
-- support, `adoptMembership`'s persona write and `createAccountAndAccept`'s
-- first `dob` all run as it. A SECURITY DEFINER function called from a
-- browser still carries the browser's JWT, so it would be refused like the
-- browser — no database function writes these columns today (checked
-- 2026-10-26); one that must, on a client's behalf, decides that here.
--
-- Not a column-grant change: a grant cannot say "only while null", and
-- revoking UPDATE would also take away the first write the app's own flows
-- make with the session client.
--
-- APPLY WITH THE DEPLOY, alongside 20261025230000 and 20261026080000. Applied
-- early it is harmless to production's flows (they only ever fill these
-- columns), but Settings › Profile on the code before this change sends the
-- stored `dob` back on every save, so an edited date there would start
-- failing with the database's sentence rather than the page's.

create or replace function public.users_write_once_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
     not in ('authenticated', 'anon') then
    return new;
  end if;

  if old.dob is not null and new.dob is distinct from old.dob then
    raise exception 'date of birth is set once; contact support to correct it'
      using errcode = '42501';
  end if;
  if old.dob is null and new.dob is not null
     and new.dob > (current_date - interval '13 years') then
    raise exception 'an account holder must be 13 or older'
      using errcode = '42501';
  end if;

  if old.role is not null and new.role is distinct from old.role then
    raise exception 'the account''s persona is set once at onboarding'
      using errcode = '42501';
  end if;

  if (old.guardian_consent_at is not null
        and new.guardian_consent_at is distinct from old.guardian_consent_at)
     or (old.junior_player_name is not null
        and new.junior_player_name is distinct from old.junior_player_name)
     or (old.junior_class_year is not null
        and new.junior_class_year is distinct from old.junior_class_year) then
    raise exception 'guardian consent and the player it covers are set once'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.users_write_once_identity() is
  'Refuses a client change to users.dob, role, guardian_consent_at, '
  'junior_player_name or junior_class_year once set, and a first dob under '
  '13. The service role passes.';

revoke execute on function public.users_write_once_identity()
  from public, anon, authenticated;

create trigger users_write_once_identity
  before update of dob, role, guardian_consent_at, junior_player_name,
    junior_class_year
  on public.users
  for each row execute function public.users_write_once_identity();
