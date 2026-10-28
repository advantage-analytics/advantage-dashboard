-- Self review follow-up (docs/plans/advantage-review.md, step 2, D1): a
-- Verified match's players are locked by id too, not only by name.
--
-- `20261028025013_self_review` left `player1_id` / `player2_id` out of the
-- guard, because account deletion, leaving a team and the roster merge
-- re-point them under the caller's JWT. That left a direct client UPDATE free
-- to move a Verified match to another player on the roster. Now an id on a
-- Verified match may change only to the SAME person, which is what each of
-- those flows does at the moment it writes:
--
--   - a login to its roster profile, still claimed by it
--     (`release_my_account_from_programs`, `leave_program`, which clear the
--     claim only afterwards);
--   - no player at all to the uploader's claimed profile (the same two
--     functions file a self-upload with no player id under its uploader);
--   - one roster profile to another of the same program with the same
--     normalized name (`merge_program_players` re-points before it sets
--     `merged_into_id`, and refuses any two profiles whose names differ).
--
-- Anything else is refused, as the score and names already are.
--
-- `matches_same_player` runs as the INVOKER, under the caller's RLS: inside
-- those definer flows the owner reads every row, while a direct client
-- UPDATE sees only the profiles its own policies allow — and a profile it
-- cannot see is never "the same person". It answers nothing a caller could
-- not already select.

create or replace function public.matches_same_player(
  p_old uuid, p_new uuid, p_uploader uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_old is not distinct from p_new
      or exists (
        select 1 from public.program_players pp
         where pp.id = p_new
           and pp.claimed_by_user_id = coalesce(p_old, p_uploader)
      )
      or exists (
        select 1
          from public.program_players a
          join public.program_players b
            on b.program_id = a.program_id
           and public.normalized_person_name(b.first_name, b.last_name)
             = public.normalized_person_name(a.first_name, a.last_name)
         where a.id = p_old and b.id = p_new
      );
$$;

revoke execute on function public.matches_same_player(uuid, uuid, uuid)
  from public, anon;

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

  if old.verified then
    if new.score is distinct from old.score
       or new.result is distinct from old.result
       or new.stop_reason is distinct from old.stop_reason
       or new.format is distinct from old.format
       or new.player1_name is distinct from old.player1_name
       or new.player2_name is distinct from old.player2_name
       or new.initial_top_player_is_player1
            is distinct from old.initial_top_player_is_player1 then
      raise exception 'This match is Verified by Advantage, so its score and players are locked'
        using errcode = '42501';
    end if;
    -- The uploader's own profile may fill an empty player 1 only while
    -- player 2 is empty too: the self-upload rule those flows apply.
    if not public.matches_same_player(
             old.player1_id, new.player1_id,
             case when old.player2_id is null then old.created_by end)
       or not public.matches_same_player(old.player2_id, new.player2_id, null)
       or not public.matches_same_player(
             old.opponent_player_id, new.opponent_player_id, null) then
      raise exception 'This match is Verified by Advantage, so its score and players are locked'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
