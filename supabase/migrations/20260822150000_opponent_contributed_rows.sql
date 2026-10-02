-- Who entered this roster row, when it was not the program itself.
--
-- Opponent scouting only works if two programs looking at the same athlete
-- resolve to the SAME row. A private per-program opponent table would recreate
-- the duplicate problem `merge_program_players` exists to repair, one copy per
-- scouting program, with no way to ever reconcile them.
--
-- So an opponent player is a `program_players` row hanging off the OPPONENT's
-- `programs.id`. The directory already holds all 1,940 of them and is already
-- world-readable, so the row has somewhere to live whether or not that program
-- has ever heard of this product.
--
-- ── What this column is for ─────────────────────────────────────────────────
-- NULL means the program entered its own row — every row that exists today.
-- Non-null means another program recorded this athlete while this one was
-- unclaimed. It is provenance, never authorization: nothing grants access on
-- the strength of having contributed a row.
--
-- ── What happens when the program claims its workspace ──────────────────────
-- It inherits the rows. That is the intent, not a leak: a program signing up
-- finds its roster already standing, and can edit, archive or merge it with the
-- same three functions its own staff would have used. The write guard in
-- `contribute_opponent_player` is what stops a stranger editing a roster after
-- that point.

alter table public.program_players
  add column if not exists contributed_by_program_id uuid
  references public.programs(id) on delete set null;

-- A row cannot be contributed by the program that owns it. That is not a
-- contribution, it is the NULL case, and allowing both spellings would mean two
-- ways to ask "is this ours".
alter table public.program_players
  drop constraint if exists program_players_contributor_check;
alter table public.program_players
  add constraint program_players_contributor_check
  check (contributed_by_program_id is distinct from program_id);

-- A contributed row is never a claimable seat. `accept_program_invite` binds a
-- login to a profile, and an invite is addressed by email — so a row somebody
-- else typed must not carry one, or a coach could enter a rival's athlete
-- against an address they control and wait to be handed the binding.
alter table public.program_players
  drop constraint if exists program_players_contributed_no_email;
alter table public.program_players
  add constraint program_players_contributed_no_email
  check (contributed_by_program_id is null or email is null);

-- The Opponents page's read: every row this program contributed, across all the
-- opponents it has recorded.
create index if not exists program_players_contributed_idx
  on public.program_players (contributed_by_program_id)
  where contributed_by_program_id is not null;

comment on column public.program_players.contributed_by_program_id is
  'The program that entered this row on behalf of an unclaimed program. NULL means the program entered its own. Provenance only — it grants nothing.';
