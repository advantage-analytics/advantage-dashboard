-- Bound WHO a program match may be attributed to.
-- Applied live 2026-08-24 as version 20260824211820.
--
-- 20260821232306 closed the INSERT half of the regraft hole: `program_id` must
-- be a program you belong to, `event_entry_id` needs staff. It never looked at
-- `player1_id`, and that column is the third door in the same room.
--
-- == Why this matters more now =============================================
--
-- Uploading FOR a teammate is intended product behaviour -- the roster page
-- advertises it, and `program_settings.players_can_upload` (now on by default)
-- exists to let a player, not just staff, reach the wizard. The wizard's
-- `?player=` branch therefore writes a CHOSEN teammate's id into `player1_id`
-- while `created_by` stays the uploader. Nothing below the picker constrained
-- that id: the INSERT policy checks only `auth.uid() = created_by`, and the
-- regraft trigger validated the other two columns. So a crafted POST could
-- name ANY uuid at all as the player.
--
-- That is not merely a mislabelled row. `player1_id` is half the `matches`
-- SELECT policy --
--
--   player1_id in (select my_player_ids())
--
-- -- so naming a stranger's id hands them read access to a match they never
-- played, and naming a uuid belonging to nobody buries a row that no roster
-- view will ever reconcile.
--
-- == The rule ==============================================================
--
-- A match with `program_id` set may only name a `player1_id` that belongs to
-- SOMEONE ON THAT PROGRAM. Two shapes are accepted, and both are required --
-- `my_player_ids()` returns exactly this union, so refusing either half would
-- refuse real matches:
--
--   * a `program_players.id` of that program -- what the roster picker and
--     `program_event_entries.player_user_ids` carry, and what all seven
--     existing program matches use. Archived and merged profiles included:
--     leaving the roster does not un-play a match, and `merge_program_players`
--     re-points attribution between exactly these rows.
--   * a `program_members.user_id` of that program -- what the ordinary wizard
--     writes when a member uploads their OWN match from a team workspace
--     (`playerUserId = userId` with no preset). Refusing this shape would
--     break every self-upload inside a team.
--
-- NULL still passes, deliberately. A doubles line has two accounts and one
-- column, so `recordResult` and the wizard both write null on purpose -- it is
-- the honest answer, and it names nobody, so it grants nothing. The attack is
-- naming a uuid, not omitting one.
--
-- `program_id is null` -- the entire personal workspace -- is untouched: the
-- new branch cannot fire without a program.
--
-- `player2_id` is untouched too. The opponent is frequently from another
-- program or has no identity at all; their pooled identity lives in
-- `opponent_player_id`, which 20260823090000 keeps out of every policy.
--
-- == UPDATE, not just INSERT ==============================================
--
-- The INSERT check alone would be one POST away from irrelevant: the UPDATE
-- policy is `auth.uid() = created_by`, so an uploader could file a legal match
-- and then move `player1_id` to any uuid they liked. `player1_id` joins the
-- trigger's UPDATE column list, and re-attribution is bound by the same rule.
-- The check runs only when the value actually CHANGES, so an unrelated write
-- that merely restates it can never fail.
--
-- Both legitimate re-attribution paths stay green:
--   * `merge_program_players` -- moves matches to the SURVIVING profile, which
--     is a `program_players` row of the same program by construction.
--   * `recordResult` -- fills a scored line from
--     `program_event_entries.player_user_ids`, which are that program's roster
--     ids (and null for doubles).
--
-- The service role is exempt throughout, exactly as before, so the webhook,
-- the derivation publisher and every server-side job are unaffected.
--
-- The predicate is INLINE rather than a new `is_program_player()` helper on
-- purpose: a callable SECURITY DEFINER function answering "is uuid X on
-- program Y" is a membership oracle any authenticated user could probe. The
-- trigger is already SECURITY DEFINER and is the one place that decides what a
-- legal program match looks like.
create or replace function public.matches_block_client_regraft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
begin
  if not v_is_client then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.program_id is not null
       and new.program_id not in (select public.user_program_ids()) then
      raise exception 'a match can only be filed under a program you belong to'
        using errcode = '42501';
    end if;

    if new.event_entry_id is not null then
      if not public.is_program_staff(new.program_id) then
        raise exception 'only a program''s staff can attach a match to a scheduled line'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.program_event_entries e
         where e.id = new.event_entry_id
           and e.program_id is not distinct from new.program_id
      ) then
        raise exception 'that line belongs to a different program'
          using errcode = '42501';
      end if;
    end if;

    if new.program_id is not null
       and new.player1_id is not null
       and not exists (
         select 1 from public.program_players pp
          where pp.id = new.player1_id
            and pp.program_id = new.program_id
       )
       and not exists (
         select 1 from public.program_members pm
          where pm.user_id = new.player1_id
            and pm.program_id = new.program_id
       ) then
      raise exception
        'that player is not on this program''s roster, so the match cannot be filed under it'
        using errcode = '42501';
    end if;

    return new;
  end if;

  -- UPDATE: neither column may move at all. Where a match is filed is decided
  -- when it is created.
  if new.program_id is distinct from old.program_id
     or new.event_entry_id is distinct from old.event_entry_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  -- UPDATE: attribution may move, but only within the same roster. Guarded on
  -- an actual change so a write that restates the current value never fails.
  if new.player1_id is distinct from old.player1_id
     and new.program_id is not null
     and new.player1_id is not null
     and not exists (
       select 1 from public.program_players pp
        where pp.id = new.player1_id
          and pp.program_id = new.program_id
     )
     and not exists (
       select 1 from public.program_members pm
        where pm.user_id = new.player1_id
          and pm.program_id = new.program_id
     ) then
    raise exception
      'a match can only be re-attributed to someone on the same program''s roster'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists matches_block_client_regraft on public.matches;

-- `player1_id` joins the UPDATE column list. On INSERT the `of` list is ignored
-- and the trigger fires for every row, which is what is wanted: a NULL
-- program_id passes every check and costs three branches.
create trigger matches_block_client_regraft
  before insert or update of program_id, event_entry_id, player1_id
  on public.matches
  for each row
  execute function public.matches_block_client_regraft();

comment on function public.matches_block_client_regraft() is
  'Refuses a client write that files a match under a program it does not belong to, attaches it to a scheduled line the caller does not run, or attributes it to somebody who is not on that program. INSERT: program_id must be one of yours, event_entry_id needs staff and must match program_id, player1_id must be a program_players row or a program_members user of program_id (null is allowed -- doubles lines carry no single account). UPDATE: program_id and event_entry_id may not change, and player1_id may only move to someone on the same roster.';
