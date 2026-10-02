-- The roster row that needs no account.
--
-- Until now there was exactly one way onto a roster: a coach emails an invite,
-- the person creates a login, and `accept_program_invite` writes a
-- `program_members` row. Until they accept they are an email address with a
-- dashed circle next to it — the coach cannot record a match for them, and
-- there is nothing to attach video to.
--
-- That is the wrong shape for a college program. A freshman who will never open
-- the app still needs statistics for lineup calls, and the season starts before
-- the roster finishes signing up.
--
-- ── Why a new table and not a `users` row ───────────────────────────────────
-- `public.users` carries `fk_users_auth (id) references auth.users(id)` and
-- `email not null unique`. A users row cannot exist without a login, and cannot
-- have a null email. Minting a phantom auth account per athlete would mean a
-- synthesized address — which `program_roster` returns and the roster table
-- renders as the subtitle for an unranked player, so the fake address ships to
-- the screen. It would also make every claim an `admin.updateUserById` on
-- somebody else's account, which is account takeover with a friendly wrapper.
--
-- ── The identity rule ───────────────────────────────────────────────────────
-- A `program_players.id` is the athlete's MATCH identity inside a program.
-- A `users.id` is their LOGIN. The two relate through `claimed_by_user_id` and
-- never by substitution: the profile id is what goes into `matches.player1_id`,
-- before and after a claim, forever. Switching to the user id at the moment of
-- claiming would split one athlete's season across two ids at an arbitrary
-- point, and `my_player_ids()` has to exist either way.
--
-- This works without touching a single writer because `matches.player1_id` was
-- already a roster-identity column that happened to only ever hold user ids:
-- no foreign key, routinely NULL, and written from a variable both writers
-- document as "the roster identity, null when there is no account"
-- (`schedule/actions.ts`, `useUploadMatchWizard.ts`).

create table if not exists public.program_players (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs(id) on delete cascade,
  first_name         text not null,
  last_name          text not null,
  class_year         text,
  lineup_spot        integer,
  -- Optional, and the key the duplicate tripwire matches on.
  email              text,
  claimed_by_user_id uuid references public.users(id) on delete set null,
  claimed_at         timestamptz,
  -- Graduated or left. Never hard-deleted: `matches.player1_id` has no foreign
  -- key, so a delete would orphan every match carrying this id in silence.
  archived_at        timestamptz,
  merged_into_id     uuid references public.program_players(id) on delete set null,
  merged_at          timestamptz,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Names are NOT NULL on purpose: this is the row that kills the email fallback.
-- Six separate display-name ladders in the app terminate in an email address,
-- and a coach-managed player may have none. The coach typed the name — that is
-- the entire Add player form — so the fallback becomes unreachable rather than
-- being papered over at six call sites.
alter table public.program_players drop constraint if exists program_players_name_check;
alter table public.program_players add constraint program_players_name_check
  check (btrim(first_name) <> '' and btrim(last_name) <> '');

-- Both halves of a claim move together or neither does.
alter table public.program_players drop constraint if exists program_players_claim_check;
alter table public.program_players add constraint program_players_claim_check
  check ((claimed_by_user_id is null) = (claimed_at is null));

alter table public.program_players drop constraint if exists program_players_merge_check;
alter table public.program_players add constraint program_players_merge_check
  check ((merged_into_id is null) = (merged_at is null)
         and merged_into_id is distinct from id);

-- The same shape check `create_program_invite` uses, so an address that would
-- be refused by the invite path cannot be smuggled in through the profile.
alter table public.program_players drop constraint if exists program_players_email_shape;
alter table public.program_players add constraint program_players_email_shape
  check (email is null or email like '%_@_%.__%');

-- Mirrors program_members_ladder_check. Deliberately NOT unique per program: a
-- coach mid-reshuffle would be blocked by it and there is no swap UI. The
-- roster warns about duplicates instead of refusing them.
alter table public.program_players drop constraint if exists program_players_lineup_check;
alter table public.program_players add constraint program_players_lineup_check
  check (lineup_spot is null or lineup_spot > 0);

-- One person holds one profile per program.
create unique index if not exists program_players_claimed_key
  on public.program_players (program_id, claimed_by_user_id)
  where claimed_by_user_id is not null;

-- The duplicate tripwire's TEETH, not just its warning. Two live roster rows in
-- one program cannot hold the same address, so the duplicate cannot be created
-- even by a caller that skips the dialog entirely.
create unique index if not exists program_players_email_key
  on public.program_players (program_id, lower(email))
  where email is not null and merged_into_id is null and archived_at is null;

create index if not exists program_players_program_idx
  on public.program_players (program_id)
  where merged_into_id is null;

alter table public.program_players enable row level security;
grant select on public.program_players to authenticated;

-- Membership alone, matching the rule 20260821070000 established when it took
-- `roster_visible` off the member list: a roster is a phone book; the
-- statistics are the private part.
drop policy if exists "Roster is visible to program members" on public.program_players;
create policy "Roster is visible to program members"
  on public.program_players for select
  using (program_id in (select public.user_program_ids()));

-- No write policies, for the reason 20260818041025 gives about program_members:
-- an UPDATE policy cannot restrict columns, so "a coach may edit a player"
-- would also be "a coach may set claimed_by_user_id" — and that column is read
-- access to every match carrying this profile's id. Every write is a SECURITY
-- DEFINER function.

comment on table public.program_players is
  'A roster row that needs no account. Its id is the athlete''s match identity inside the program, before and after a claim.';
comment on column public.program_players.claimed_by_user_id is
  'The login bound to this profile. Set ONLY by accept_program_invite, guarded on null. There is deliberately no un-claim path: claiming grants read access to every match carrying this id.';
comment on column public.program_players.email is
  'Optional. The key the duplicate tripwire matches on, and why the partial unique index above exists.';
