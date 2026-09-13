-- Guardian step for junior accounts (T5) — screen 3.1's three answers.
--
-- Columns on public.users rather than a side table: onboarding already writes
-- the caller's own users row under the own-row RLS policy
-- ("Enable ALL permissions for users based on user_id", auth.uid() = id), and
-- one guardian holds one junior's account on day one — the later "hand the
-- account to the player" transfer is explicitly out of scope. No policy
-- changes: the new columns are readable and writable only by the row's owner,
-- like every other users column.
--
-- Applied to the live database via the Supabase MCP as
-- `guardian_onboarding_consent` (version 20260830070408); this file records
-- it in the repo.

alter table public.users
  add column if not exists junior_player_name text,
  add column if not exists junior_class_year text,
  add column if not exists guardian_consent_at timestamptz;

-- Cheap invariants for minors'-consent data. The server action validates the
-- same bounds; these keep any other writer honest.
alter table public.users
  add constraint users_junior_player_name_length
    check (junior_player_name is null
           or char_length(junior_player_name) between 1 and 120),
  add constraint users_junior_class_year_format
    check (junior_class_year is null or junior_class_year ~ '^[0-9]{4}$');

comment on column public.users.junior_player_name is
  'The junior this account is managed for — screen 3.1''s "Player''s name". '
  'Set only by the guardian onboarding step; null for every other persona.';

comment on column public.users.junior_class_year is
  'The junior''s high-school graduating class ("2029") — screen 3.1''s '
  '"Graduating class". Four digits; null for every other persona.';

comment on column public.users.guardian_consent_at is
  'When the guardian ticked screen 3.1''s consent checkbox. Server-stamped '
  '(never a client value) by finishGuardianOnboarding, and only when the '
  'consent flag was actually set. Null = no guardian consent on record.';
