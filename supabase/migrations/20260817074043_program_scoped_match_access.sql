-- Give matches a workspace, and let program staff read their program's matches.
-- Applied live 2026-08-17 as version 20260817074043. Depends on 20260816100400 having landed first.
--
-- `matches.program_id` is the workspace a match belongs to. NULL means the
-- personal workspace, which is every match that exists today — so this column
-- arrives nullable and stays that way. Backfilling it would be inventing
-- program membership for 34 matches that were uploaded by individuals.
--
-- Access rules, layered on top of the reconciled predicate rather than
-- replacing it. Creator-or-player still grants access on its own; program
-- membership is an additional route, never a narrower one:
--
--   owner / coach / staff  every match belonging to the program
--   player                 their own, plus the program's IF roster_visible
--   no membership row      nothing, ever
--
-- The player rule is why `programs.roster_visible` exists. A squad is not
-- automatically a place where everyone's numbers are everyone's business, and
-- the owner is the one who knows whether it should be.

alter table public.matches
  add column if not exists program_id uuid
  references public.programs(id) on delete set null;

-- Partial: the overwhelming majority of rows are personal and NULL, and this
-- index only ever serves "matches belonging to program X".
create index if not exists matches_program_idx
  on public.matches (program_id)
  where program_id is not null;

comment on column public.matches.program_id is
  'Workspace this match belongs to. NULL = personal workspace.';

-- ---------------------------------------------------------------------------
-- Extend the single read predicate
-- ---------------------------------------------------------------------------

-- Same signature, same callers — match_stats, points and shots pick this up
-- without their policies changing at all. That is the payoff for having
-- consolidated them in the previous migration.
--
-- Still set-returning, for the reason that migration documents: a per-row
-- boolean cost 23x on a match-detail read at production scale.
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
     -- Personal route, unchanged.
     (select auth.uid()) in (m.created_by, m.player1_id, m.player2_id)
     -- Program route.
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

-- `visible_point_ids()` needs no change: it delegates to the function above, so
-- program-visible matches bring their points and shots with them automatically.

-- ---------------------------------------------------------------------------
-- The matches table's OWN policy has to move too
-- ---------------------------------------------------------------------------

-- `visible_match_ids()` serves match_stats, points and shots. It does NOT serve
-- `matches` itself, which carries its own predicate — and leaving that one on
-- the personal-only rule reintroduces exactly the split this pair of migrations
-- exists to remove, one layer up.
--
-- Caught by the RLS harness rather than by reading: a staff member who had
-- neither created nor played in a program's matches came back able to read 2
-- points and 2 match_stats rows while seeing 0 matches. Statistics for a match
-- that, as far as the list was concerned, did not exist.
--
-- The predicate is inlined rather than delegated. `visible_match_ids()` scans
-- `matches` to build its set, so calling it from this policy would rebuild the
-- whole set to decide the row we are already standing on. Referencing the
-- columns directly is the same logic without the round trip.
drop policy if exists "Users can read matches they created or played in" on public.matches;
create policy "Users can read matches they created or played in"
  on public.matches for select
  using (
    (select auth.uid()) in (created_by, player1_id, player2_id)
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

-- ---------------------------------------------------------------------------
-- What deliberately does NOT get program scope
-- ---------------------------------------------------------------------------

-- `processing_jobs` keeps its `created_by` read policy.
--
-- The row carries `sas_url` and `video_access_token` — live credentials to an
-- athlete's video file. Widening the read to everyone on a program's staff
-- would hand each of them a working link to every teammate's raw footage, which
-- is a much larger grant than "can see the match's statistics" and is not what
-- program visibility is asking for. Staff-facing progress reads through the
-- match, which is scoped above; anything needing the job row itself goes
-- through server code that can decide what to project.

comment on function public.visible_match_ids() is
  'Every match id the caller may read: creator, either player, program staff, or a player on a roster-visible program.';
