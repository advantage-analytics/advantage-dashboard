-- Hardening pass over the two SplitStep migrations, from a Postgres/Supabase
-- best-practices review. Three findings, all introduced by 20260802083544.

-- ---------------------------------------------------------------------------
-- 1. set_processing_jobs_updated_at was needlessly SECURITY DEFINER
-- ---------------------------------------------------------------------------
--
-- Supabase's linter flagged it twice (0028, 0029): a SECURITY DEFINER function
-- in the `public` schema is published by PostgREST as
-- /rest/v1/rpc/set_processing_jobs_updated_at, and the default EXECUTE grant to
-- PUBLIC left it callable by `anon` and `authenticated`.
--
-- Calling it outside a trigger errors on the missing NEW record, so this was
-- not exploitable — but a definer-rights function reachable from the internet
-- is not something to leave lying around, and nothing here needed elevated
-- rights in the first place: the row is only ever touched by someone already
-- updating it. SECURITY INVOKER is correct.

create or replace function public.set_processing_jobs_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger functions are invoked by the executor, which does not re-check
-- EXECUTE at fire time. Revoking only closes the RPC path.
revoke all on function public.set_processing_jobs_updated_at() from public;
revoke all on function public.set_processing_jobs_updated_at() from anon;
revoke all on function public.set_processing_jobs_updated_at() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. processing_usage.created_by had no covering index
-- ---------------------------------------------------------------------------
--
-- Caught by both the skill's FK-gap query and Supabase linter 0001. It is the
-- worse kind of gap because the column does double duty: it carries the FK to
-- users (so cascades and joins seq-scan) AND it is the column every RLS policy
-- on the table filters on, which makes it hot on literally every read.
--
-- processing_jobs already had the equivalent index; processing_usage was simply
-- missed.

create index if not exists processing_usage_created_by_idx
  on public.processing_usage (created_by);

-- ---------------------------------------------------------------------------
-- 3. Policies were not scoped to a role
-- ---------------------------------------------------------------------------
--
-- Created without a `to` clause, so they defaulted to PUBLIC and were evaluated
-- for `anon` as well. `(select auth.uid())` is null for an anonymous request, so
-- nothing leaked — the comparison never matched — but Postgres still ran the
-- policy for every anonymous request instead of skipping the table outright.
--
-- Scoping to `authenticated` is the documented Supabase pattern. service_role
-- is unaffected: it holds BYPASSRLS, so the Worker and the admin client do not
-- depend on these policies.
--
-- NOTE: match_files, match_stats, points and shots have the same unscoped
-- policies, predating this work. Deliberately not touched here — that is a
-- separate change with its own regression surface across the SwingVision path.

drop policy if exists "Users can view own processing jobs" on public.processing_jobs;
create policy "Users can view own processing jobs"
  on public.processing_jobs for select
  to authenticated
  using ((select auth.uid()) = created_by);

drop policy if exists "Users can insert own processing jobs" on public.processing_jobs;
create policy "Users can insert own processing jobs"
  on public.processing_jobs for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can update own processing jobs" on public.processing_jobs;
create policy "Users can update own processing jobs"
  on public.processing_jobs for update
  to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can delete own processing jobs" on public.processing_jobs;
create policy "Users can delete own processing jobs"
  on public.processing_jobs for delete
  to authenticated
  using ((select auth.uid()) = created_by);

drop policy if exists "Users can view own processing usage" on public.processing_usage;
create policy "Users can view own processing usage"
  on public.processing_usage for select
  to authenticated
  using ((select auth.uid()) = created_by);

drop policy if exists "Users can insert own processing usage" on public.processing_usage;
create policy "Users can insert own processing usage"
  on public.processing_usage for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can update own processing usage" on public.processing_usage;
create policy "Users can update own processing usage"
  on public.processing_usage for update
  to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "Users can delete own processing usage" on public.processing_usage;
create policy "Users can delete own processing usage"
  on public.processing_usage for delete
  to authenticated
  using ((select auth.uid()) = created_by);
