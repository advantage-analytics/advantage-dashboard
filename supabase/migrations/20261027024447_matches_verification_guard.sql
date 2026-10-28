-- Verified by Advantage, step 0: close the write gap before the flag means
-- anything (docs/plans/advantage-review.md).
--
-- `matches.verified` becomes "Verified by Advantage": granted only by
-- Advantage, after someone checked every point against the video. Until now
-- it meant nothing — no app code writes it — but a player could set it on
-- their own match: `authenticated` holds table-level INSERT and UPDATE on
-- `matches`, "Users can update own matches" lets a creator update the row,
-- and `matches_block_client_regraft` ignores the column. Checked live
-- 2026-10-27: the only `verified = true` rows were the 17 SwingVision
-- matches `scripts/seed-ask-season.ts` writes on the eyes-on verifier
-- account; no database function writes the column.
--
-- What this does:
--   1. Resets those 17 seed rows to false, refusing if any other account's
--      match is verified (that would be a real grant, or a player's own
--      write, and either needs a look before it is wiped).
--   2. Adds provenance: verified_at, verified_by (auth.users), and
--      verified_review_id (the advantage_reviews row; its FK lands with that
--      table in step 3a).
--   3. Makes `verified` not null, and ties it to its provenance with a
--      check: verified exactly when verified_at and verified_by are set.
--   4. A client write guard. A column-level revoke cannot narrow the
--      table-level grant, so it is a trigger. For a client JWT
--      (`authenticated` / `anon`, the test `matches_block_client_regraft`
--      and `users_write_once_identity` use): an insert with verified = true
--      or any verified_* value, and an update that changes any of the four
--      columns, are refused, 42501. The service role is not a client and
--      passes — step 1's `verify_match` runs as it. A SECURITY DEFINER
--      function called from a browser still carries the browser's JWT, so
--      it is refused like the browser. `current_user` is tested too, so a
--      session that rewrites `request.jwt.claims` to another role is still a
--      client while PostgREST has it running as `authenticated` / `anon`.
--
-- A separate trigger rather than a branch in `matches_block_client_regraft`:
-- that one fires only on the columns it watches, and its body is already
-- the program/line/roster rules. This one fires on every insert and update
-- (no `of` list: a column list is decided from the SET list, so a later
-- BEFORE trigger rewriting NEW.verified* would slip past it), and is named
-- `zz_` so it fires after every other BEFORE trigger on matches and sees the
-- row as it will be written. Keep it last.
--
-- verified_by keeps the default NO ACTION: deleting an Advantage admin who
-- verified matches is refused rather than losing who verified them (SET NULL
-- would break the provenance check anyway).

do $$
declare
  n int;
begin
  select count(*) into n from public.matches
   where verified
     and created_by is distinct from '18c34090-1857-422e-b207-b4850bef3c32';
  if n > 0 then
    raise exception 'refusing: % non-seed matches are verified', n;
  end if;
  update public.matches set verified = false
   where verified
     and created_by = '18c34090-1857-422e-b207-b4850bef3c32';
end $$;

alter table public.matches
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users (id),
  add column verified_review_id uuid;

update public.matches set verified = false where verified is null;

alter table public.matches
  alter column verified set default false,
  alter column verified set not null,
  add constraint matches_verified_provenance
    check (verified = (verified_at is not null and verified_by is not null));

comment on column public.matches.verified is
  'Verified by Advantage: someone at Advantage checked every point against '
  'the video. Set only by the service role (matches_guard_verification), '
  'with verified_at and verified_by.';
comment on column public.matches.verified_at is
  'When the match was Verified by Advantage. Null while not verified.';
comment on column public.matches.verified_by is
  'The Advantage admin who verified the match. Null while not verified.';
comment on column public.matches.verified_review_id is
  'The Advantage Review that verified the match, if one did. FK added with '
  'advantage_reviews (step 3a).';

create or replace function public.matches_guard_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) not in ('authenticated', 'anon')
     and current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verified
       or new.verified_at is not null
       or new.verified_by is not null
       or new.verified_review_id is not null then
      raise exception 'Only Advantage can verify a match'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.verified is distinct from old.verified
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.verified_review_id is distinct from old.verified_review_id then
    raise exception 'Only Advantage can verify a match'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.matches_guard_verification() is
  'Refuses a client (authenticated/anon JWT) insert that sets matches.verified '
  'or any verified_* column, and a client update that changes any of them. '
  'The service role passes.';

revoke execute on function public.matches_guard_verification()
  from public, anon, authenticated;

create trigger zz_matches_guard_verification
  before insert or update
  on public.matches
  for each row execute function public.matches_guard_verification();
