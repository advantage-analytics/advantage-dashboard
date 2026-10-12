-- Team Ask: close two gaps the access review of 20261012170339 found.
--
-- 1. The side functions answered for a program the caller is not in.
--    20261012170339 put the membership test in ask.my_match_ids(), which is
--    what scopes the four views. But ask.my_side() and ask.side_player_name()
--    are also executable by ask_reader (a view's caller must be able to call
--    the functions the view uses), they are SECURITY DEFINER, and their
--    program branch read program_players / program_members for whatever
--    program the `ask.program_id` setting named — with no membership test.
--    SQL run through ask_run_query can set that setting and can build a
--    public.matches value by hand (jsonb_populate_record), so a signed-in
--    user who knew a program's id and a player's or member's id could ask:
--    "is this id on that program's roster?" (my_side) and "what is that
--    roster player's name?" (side_player_name). No match data, but a roster
--    name and a membership fact of a program they do not belong to.
--
--    Fix: the program branch of ask.my_side() answers null unless the caller
--    is a member of the selected program — the same test as
--    ask.my_match_ids(). ask.side_player_name() reads its seat through
--    ask.my_side(), so a null side gives it no id and no stored name, and it
--    carries the same test on its roster lookup as well.
--
-- 2. ask.on_roster() counted archived and merged roster profiles.
--    The app's rule (rosterMatchIds() over program_roster_full) leaves both
--    out: an archived player's matches keep their old id and resolve to no
--    side. The SQL now restates program_roster_full's three arms exactly:
--    a live profile's id or the login that claimed it; a staff member's
--    login; a player-role member's login only when no live profile is
--    claimed by it. No live program match is affected today (0 matches carry
--    an archived or merged profile's id), so this changes no current answer;
--    it keeps Ask and Team Home in step when one is archived.
--
-- 3. A team conversation outlived membership. ask_conversations and
--    ask_messages were readable by whoever asked, for good. A saved team
--    answer holds the program's statistics, so a member who leaves or is
--    removed should stop reading it. The select policies now also require
--    membership of the conversation's program; personal conversations
--    (program_id null) are unchanged. ask_delete_conversation() is unchanged:
--    a former member may still delete their own rows.
--
-- BEFORE this migration, run live and rolled back on 2026-10-12: a signed-in
-- user who is not a member of the program, through ask_run_query with the
-- setting pointed at it, got side = 'player1' and the roster name for a
-- hand-built row (and 0 rows of ask.matches).
--
-- VERIFIED live after apply (2026-10-12, version 20261012223023), rolled back,
-- as `authenticated` sessions with the JWT claims set:
--   M1 the same call by the non-member → side null, no name, 0 matches. By
--      a member of the program → 'player1', the roster name, 10 matches.
--   M2 the team probes of 20261012170339 → unchanged: a non-member in team
--      scope reads 0 matches; the member reads 10, grouped under the same
--      three roster names (1, 3 and 6 matches); ask.match_stats 10 rows
--      'me' and 10 'opponent', ask.points 1183, ask.shots 7995; the same
--      caller in personal scope reads their 1 personal match.
--   M3 a member with 3 team conversations and 3 personal ones (12 messages):
--      with their program_members row deleted inside the transaction, 0 team
--      conversations, 3 personal conversations and 6 messages read back.
--   As postgres: ask.my_side and ask.side_player_name are not executable by
--   authenticated; ask.on_roster is not executable by ask_reader;
--   ask.side_player_name still is.

create or replace function ask.on_roster(p_program_id uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Arm 1: a live roster profile, by its id or by the login that claimed it.
    exists (
      select 1 from public.program_players pp
       where pp.program_id = p_program_id
         and pp.merged_into_id is null
         and pp.archived_at is null
         and (pp.id = p_id or pp.claimed_by_user_id = p_id)
    )
    -- Arms 2 and 3: a staff member's login; a player-role member's login
    -- only when no live profile is claimed by it.
    or exists (
      select 1 from public.program_members pm
       where pm.program_id = p_program_id
         and pm.user_id = p_id
         and (
           pm.role <> 'player'
           or not exists (
             select 1 from public.program_players pp
              where pp.program_id = pm.program_id
                and pp.claimed_by_user_id = pm.user_id
                and pp.merged_into_id is null
           )
         )
    );
$$;

comment on function ask.on_roster(uuid, uuid) is
  'Restates rosterMatchIds() over program_roster_full (src/lib/data/roster-ids.ts): true for a live roster profile''s id or its claiming login, a staff member''s login, or a player-role member''s login with no live profile. Archived and merged profiles are not on the roster.';

revoke all on function ask.on_roster(uuid, uuid) from public, anon, authenticated;

create or replace function ask.my_side(m public.matches)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select ask.scope_program_id()) is not null then
      case
        -- Membership first: a caller outside the selected program learns
        -- nothing from this function, whatever row it is handed.
        when (select public.user_program_role((select ask.scope_program_id()))) is null then null
        when m.program_id is distinct from (select ask.scope_program_id()) then null
        when m.player1_id is not null and ask.on_roster(m.program_id, m.player1_id) then 'player1'
        when m.player2_id is not null and ask.on_roster(m.program_id, m.player2_id) then 'player2'
        when m.event_entry_id is not null then 'player1'
        else null
      end
    when m.player1_id is not null
     and m.player1_id in (select public.my_player_ids()) then 'player1'
    when m.player2_id is not null
     and m.player2_id in (select public.my_player_ids()) then 'player2'
    when m.player1_id is null
     and m.player2_id is null
     and m.created_by = (select auth.uid()) then 'player1'
    else null
  end;
$$;

comment on function ask.my_side(public.matches) is
  'Personal scope: restates playerSide() (src/lib/data/player-identity-server.ts). Program scope, for a member of the selected program only: restates programSide() (src/lib/data/program-side.ts) — player1 if player1_id is a roster id, else player2 if player2_id is, else player1 for a match hung on a schedule entry, else null. Null for a caller who is not a member.';

create or replace function ask.side_player_name(m public.matches)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with seat as (
    select case ask.my_side(m)
             when 'player1' then m.player1_id
             when 'player2' then m.player2_id
           end as id,
           case ask.my_side(m)
             when 'player1' then m.player1_name
             when 'player2' then m.player2_name
           end as stored_name
  )
  select coalesce(
    (
      select nullif(btrim(coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')), '')
        from public.program_players pp
       where (select ask.scope_program_id()) is not null
         and (select public.user_program_role((select ask.scope_program_id()))) is not null
         and pp.program_id = (select ask.scope_program_id())
         and pp.program_id = m.program_id
         and pp.merged_into_id is null
         and pp.archived_at is null
         and (pp.id = seat.id or pp.claimed_by_user_id = seat.id)
       order by (pp.id = seat.id) desc
       limit 1
    ),
    seat.stored_name
  )
  from seat;
$$;

comment on function ask.side_player_name(public.matches) is
  'The name of the player a match''s rows are turned to: the live roster name in a program scope (for a member of that program), else the name stored on the match; null when the side is unknown or the caller is not a member.';

revoke all on function ask.side_player_name(public.matches) from public, anon, authenticated;
grant execute on function ask.side_player_name(public.matches) to ask_reader;

-- ---------------------------------------------------------------------------
-- A team conversation is read by its author while they are a member.
-- ---------------------------------------------------------------------------
drop policy if exists ask_conversations_select on public.ask_conversations;
create policy ask_conversations_select on public.ask_conversations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (
      program_id is null
      or public.user_program_role(program_id) is not null
    )
  );

drop policy if exists ask_messages_select on public.ask_messages;
create policy ask_messages_select on public.ask_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ask_conversations c
       where c.id = ask_messages.conversation_id
         and c.user_id = (select auth.uid())
         and (
           c.program_id is null
           or public.user_program_role(c.program_id) is not null
         )
    )
  );
