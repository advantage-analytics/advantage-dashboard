-- `matches.errors_judged_at` says a match's errors were judged forced/unforced
-- (20261029222042_forced_errors_judged). Only Advantage may set it, so it joins
-- the columns this guard already refuses from a client: the creator's table-wide
-- UPDATE and INSERT must not be able to stamp or clear it. Service-role writes
-- (`verify_match`, the label publish) pass the early return as before. Nothing
-- else in the function changes.
create or replace function public.matches_guard_verification()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
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
       or new.verified_review_id is not null
       or new.errors_judged_at is not null then
      raise exception 'Only Advantage can verify a match'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.verified is distinct from old.verified
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.verified_review_id is distinct from old.verified_review_id
     or new.errors_judged_at is distinct from old.errors_judged_at then
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
$function$;
