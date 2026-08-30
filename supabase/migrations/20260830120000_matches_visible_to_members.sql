-- Team match results are always visible to team members.
--
-- Author's ruling: a player seeing their teammates' results is the point of a
-- team workspace, so it is not a setting. The program branch of the matches
-- read predicate becomes membership-only — any member of the program reads
-- that program's matches, staff and player alike. The `roster_visible` gate
-- goes, and with it the coaches-only option, on purpose.
--
-- ── Membership predicate ────────────────────────────────────────────────────
-- `public.user_program_role(program_id) is not null`.
--
-- `user_program_role()` is a scalar `security definer` sql function over
-- `program_members` (role check-constrained to owner|coach|staff|player). For
-- a non-member its query returns zero rows, and a scalar sql function over
-- zero rows returns NULL — so IS NOT NULL is exactly "is a member". It also
-- subsumes `is_program_staff()`, which is defined as
-- `user_program_role(...) in ('owner','coach','staff')`.
--
-- The three personal clauses are byte-identical to before: `created_by` stays
-- a plain equality, and both player-identity routes keep `my_player_ids()`.
-- A personal match (program_id null) is untouched by the program branch, and
-- a non-member still matches none of the four clauses.
--
-- `visible_match_ids()` moves in lockstep, for the reason 20260822090400
-- gives: it backs the SELECT policies on `match_stats` and `points` (and
-- `shots`, through `visible_point_ids()`), and letting it drift from the
-- matches policy makes the list and the detail disagree — here, a teammate's
-- match whose every stat section draws zeroes.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Restore the previous program branch in BOTH places. The pre-change policy
-- qual, verbatim from pg_policies on 2026-08-30:
--
--   ((( SELECT auth.uid() AS uid) = created_by)
--    OR (player1_id IN ( SELECT my_player_ids() AS my_player_ids))
--    OR (player2_id IN ( SELECT my_player_ids() AS my_player_ids))
--    OR ((program_id IS NOT NULL)
--        AND (is_program_staff(program_id)
--             OR ((user_program_role(program_id) = 'player'::text)
--                 AND (EXISTS ( SELECT 1
--                    FROM programs p
--                   WHERE ((p.id = matches.program_id) AND p.roster_visible)))))))
--
-- The pre-change `visible_match_ids()` is the definition in
-- 20260822090400_match_access_by_player_identity.sql, whose program branch is
-- that same expression over `m.program_id`.

drop policy if exists "Users can read matches they created or played in" on public.matches;
create policy "Users can read matches they created or played in"
  on public.matches for select
  using (
    (select auth.uid()) = created_by
    or player1_id in (select public.my_player_ids())
    or player2_id in (select public.my_player_ids())
    -- Program route: membership-only. Staff and players read alike.
    or (
      program_id is not null
      and public.user_program_role(program_id) is not null
    )
  );

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
     -- Program route: membership-only, matching the matches policy above.
     or (
       m.program_id is not null
       and public.user_program_role(m.program_id) is not null
     );
$$;

comment on function public.visible_match_ids() is
  'Every match id the caller may read: creator, either player identity (login or claimed profile), or any member of the match''s program.';
