-- Let a claimed profile carry read access, so claiming needs no match writes.
--
-- The whole point of the claim model is that binding a login to a profile moves
-- nothing: the matches keep the profile id they were recorded with. That only
-- works if the read predicate knows the caller owns that profile.
--
-- Without this clause a claimed player sees NONE of their pre-claim history.
-- `roster_visible` defaults to false, so the program route gives a player
-- nothing, and their auth uid appears in no match row. This is the clause that
-- makes "history is untouched" true rather than aspirational.
--
-- ── Why this is not a widening ──────────────────────────────────────────────
-- `my_player_ids()` CONTAINS `auth.uid()`, so `player1_id in (my_player_ids())`
-- subsumes the old `auth.uid() = player1_id` exactly. Nothing that could be
-- read before becomes unreadable, and the only rows that become readable are
-- those carrying a profile the caller has claimed through a token bound to
-- their own verified address.
--
-- `IN`, never `NOT IN`: a NULL in the set would poison a NOT IN. The function
-- filters nulls anyway, and this keeps that from being load-bearing.

create or replace function public.visible_match_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.matches m
   where
     -- Personal route. `created_by` stays a plain equality: it is an uploader,
     -- never a player identity, and must not gain profile semantics.
     (select auth.uid()) = m.created_by
     or m.player1_id in (select public.my_player_ids())
     or m.player2_id in (select public.my_player_ids())
     -- Program route, byte-for-byte unchanged from 20260817074043.
     or (
       m.program_id is not null
       and (
         public.is_program_staff(m.program_id)
         or (
           public.user_program_role(m.program_id) = 'player'
           and exists (
             select 1
               from public.programs p
              where p.id = m.program_id
                and p.roster_visible
           )
         )
       )
     );
$$;

-- The matches table's own predicate has to move with it, for the reason
-- 20260817074043 documents: leaving it behind produced a staff member who
-- could read 2 match_stats rows for a match the list said did not exist.
-- Still inlined rather than delegating to visible_match_ids(), which would
-- rebuild the whole set to decide the row we are already standing on.
drop policy if exists "Users can read matches they created or played in" on public.matches;
create policy "Users can read matches they created or played in"
  on public.matches for select
  using (
    (select auth.uid()) = created_by
    or player1_id in (select public.my_player_ids())
    or player2_id in (select public.my_player_ids())
    or (
      program_id is not null
      and (
        public.is_program_staff(program_id)
        or (
          public.user_program_role(program_id) = 'player'
          and exists (
            select 1
              from public.programs p
             where p.id = program_id
               and p.roster_visible
          )
        )
      )
    )
  );

comment on function public.visible_match_ids() is
  'Every match id the caller may read: creator, either player identity (login or claimed profile), program staff, or a player on a roster-visible program.';
