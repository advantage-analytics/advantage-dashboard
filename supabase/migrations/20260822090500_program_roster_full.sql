-- The roster list, now that a roster row need not be an account.
--
-- `program_roster` is deliberately NOT changed. Five call sites read it, and
-- altering a SECURITY DEFINER function's return shape in the same migration
-- that adds a concept is how both land broken. It keeps its meaning and
-- becomes, correctly, the SEAT list — which is the right shape for its
-- remaining caller (`team-settings-server.ts`) and for `program_usage_by_member`,
-- since usage is per account and a coach-managed player has none.
--
-- This is the roster list. One `player_id` column comes out of it, so every
-- consumer downstream stays a Map keyed on one uuid; the two-ness of the model
-- is confined to this function and to `my_player_ids()`.

create or replace function public.program_roster_full(p_program_id uuid)
returns table (
  player_id     uuid,
  profile_id    uuid,
  user_id       uuid,
  display_name  text,
  email         text,
  role          text,
  class_year    text,
  lineup_spot   integer,
  managed_by    text,
  upload_enabled boolean,
  joined_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  -- 1 · Players. Claimed or not, the profile row IS the roster row, and its id
  --     is what their matches carry.
  select
    pp.id,
    pp.id,
    pp.claimed_by_user_id,
    btrim(pp.first_name || ' ' || pp.last_name),
    -- The profile's address wins: a coach may have recorded a school address
    -- for someone whose login is a personal one.
    coalesce(pp.email, u.email),
    'player'::text,
    coalesce(pp.class_year, u.class),
    pp.lineup_spot,
    case when pp.claimed_by_user_id is null then 'coach' else 'self' end,
    coalesce(pm.upload_enabled, false),
    coalesce(pm.joined_at, pp.created_at)
  from public.program_players pp
  left join public.users u
    on u.id = pp.claimed_by_user_id
  left join public.program_members pm
    on pm.program_id = pp.program_id and pm.user_id = pp.claimed_by_user_id
  where pp.program_id = p_program_id
    and pp.merged_into_id is null
    and pp.archived_at is null
    and p_program_id in (select public.user_program_ids())

  union all

  -- 2 · Staff seats. Still an INNER JOIN on users, and correctly so — there is
  --     no such thing as a coach-managed coach.
  select
    pm.user_id,
    null::uuid,
    pm.user_id,
    nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
    u.email,
    pm.role,
    u.class,
    null::integer,
    'self'::text,
    pm.upload_enabled,
    pm.joined_at
  from public.program_members pm
  join public.users u on u.id = pm.user_id
  where pm.program_id = p_program_id
    and pm.role <> 'player'
    and p_program_id in (select public.user_program_ids())

  union all

  -- 3 · The safety arm. A player-role member with no live profile row must not
  --     silently disappear — that is the exact failure mode of program_roster's
  --     inner join that this feature exists to work around, and it would be
  --     absurd to reintroduce it here. Always empty after the backfill; it is
  --     here so "always" is enforced rather than assumed.
  select
    pm.user_id,
    null::uuid,
    pm.user_id,
    nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
    u.email,
    'player'::text,
    u.class,
    pm.ladder_position,
    'self'::text,
    pm.upload_enabled,
    pm.joined_at
  from public.program_members pm
  join public.users u on u.id = pm.user_id
  where pm.program_id = p_program_id
    and pm.role = 'player'
    and not exists (
      select 1 from public.program_players pp
       where pp.program_id = pm.program_id
         and pp.claimed_by_user_id = pm.user_id
         and pp.merged_into_id is null
    )
    and p_program_id in (select public.user_program_ids());
$$;

revoke all on function public.program_roster_full(uuid) from public;
grant execute on function public.program_roster_full(uuid) to authenticated;

comment on function public.program_roster_full(uuid) is
  'Everyone on a program: coach-managed and claimed players from program_players, plus non-player staff seats. player_id is the id their matches carry.';
