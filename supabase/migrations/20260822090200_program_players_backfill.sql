-- One live profile per existing player-role member.
--
-- After this the roster reads one way: every player on a program is a
-- `program_players` row, and the ones who already have logins simply arrive
-- pre-claimed. Without it, existing squads would render through
-- `program_roster_full`'s safety arm indefinitely and the system would carry
-- two kinds of player row forever.
--
-- ── This touches no match data ──────────────────────────────────────────────
-- `docs/ui-revamp-guardrails.md` §2 forbids backfills and mutations of existing
-- MATCH data. Nothing here reads or writes `matches`. Historic matches keep the
-- user id in `player1_id`, and `my_player_ids()` covers both eras — which is
-- why the profile id does not need to be grafted onto them.
--
-- Names come from the users row and may be blank: somebody who accepted an
-- invite and never filled in a profile has no first or last name. The
-- NOT NULL + non-empty check on program_players would refuse that row, so the
-- email's local part stands in for the given name and an em-dash for the
-- surname. A coach can fix it; a member silently missing from the roster is
-- the failure this whole feature exists to remove.

insert into public.program_players (
  program_id, first_name, last_name, email,
  claimed_by_user_id, claimed_at, created_by, created_at
)
select
  pm.program_id,
  coalesce(nullif(btrim(u.first_name), ''), split_part(u.email, '@', 1)),
  coalesce(nullif(btrim(u.last_name), ''), '—'),
  u.email,
  pm.user_id,
  pm.joined_at,
  pm.invited_by,
  pm.joined_at
from public.program_members pm
join public.users u on u.id = pm.user_id
where pm.role = 'player'
  and not exists (
    select 1 from public.program_players pp
     where pp.program_id = pm.program_id
       and pp.claimed_by_user_id = pm.user_id
       and pp.merged_into_id is null
  )
on conflict do nothing;

-- Carry across the ladder position that `program_members.ladder_position` was
-- holding. That column had zero writers anywhere in the app, so this is a
-- one-time lift of whatever was set by hand rather than a live sync.
update public.program_players pp
   set lineup_spot = pm.ladder_position
  from public.program_members pm
 where pm.program_id = pp.program_id
   and pm.user_id = pp.claimed_by_user_id
   and pm.ladder_position is not null
   and pp.lineup_spot is null;

comment on column public.program_members.ladder_position is
  'DEPRECATED. Lineup position now lives on program_players.lineup_spot, which covers players with no account. Kept so the 20260820072359 migration is not rewritten; do not add writers.';
