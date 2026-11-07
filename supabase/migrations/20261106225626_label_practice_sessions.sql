-- Practice sessions: paid test copies of one job's AI output, one per
-- labeller, graded against a completed analyst session (the answer key).
--
-- A practice session is a `label_sessions` row with `kind = 'practice'`. It
-- reuses its source job's `results_object_key` (no vendor processing, no
-- billing), names the analyst session it is graded against, and may cover one
-- set only. It can be submitted but NEVER published:
--   * a CHECK forbids `status = 'complete'` on a practice row, so no code path
--     can close one the way Mark complete closes a publish;
--   * `claim_label_publish_lease` refuses it, so the publish never starts;
--   * `kind` can no longer change after insert, so a practice row cannot be
--     turned into an analyst one and published that way.
--
-- Uniqueness: practice rows leave `label_sessions_one_open_per_job`, so eight
-- labellers can hold the same job at once; instead one practice row per
-- (job, assignee).
--
-- Deletion: like a self review, a practice session never blocks deleting its
-- match or anyone's account, and goes with them. `admin_claim_match_storage_
-- purge` and `prepare_my_account_deletion` already only look at analyst rows,
-- so they are untouched; `matches_drop_self_review` now drops practice rows
-- too, and deleting a labeller's `users` row drops the practice rows assigned
-- to them. Deleting a practice row cascades to its own label rows only.

-- ── Columns ──────────────────────────────────────────────────────────────────

alter table public.label_sessions
  add column practice_source_session_id uuid
    references public.label_sessions (id) on delete set null,
  add column practice_set_number smallint;

comment on column public.label_sessions.practice_source_session_id is
  'Practice only: the completed analyst session this copy is graded against.';
comment on column public.label_sessions.practice_set_number is
  'Practice only: the one set the copy covers, or null for the whole match.';

create index label_sessions_practice_source
  on public.label_sessions (practice_source_session_id)
  where practice_source_session_id is not null;

-- ── Kind and shape ───────────────────────────────────────────────────────────

alter table public.label_sessions
  drop constraint label_sessions_kind_check,
  add constraint label_sessions_kind_check
    check (kind = any (array['analyst'::text, 'self'::text, 'practice'::text]));

alter table public.label_sessions
  add constraint label_sessions_practice_never_complete
    check (kind <> 'practice' or status <> 'complete'),
  add constraint label_sessions_practice_fields
    check (
      kind = 'practice'
      or (practice_source_session_id is null and practice_set_number is null)
    ),
  add constraint label_sessions_practice_set_number
    check (practice_set_number is null or practice_set_number between 1 and 5);

-- ── Uniqueness ───────────────────────────────────────────────────────────────

drop index public.label_sessions_one_open_per_job;
create unique index label_sessions_one_open_per_job
  on public.label_sessions (job_id)
  where status = any (array['labelling'::text, 'submitted'::text])
    and kind <> 'practice';

create unique index label_sessions_one_practice_per_labeller
  on public.label_sessions (job_id, assigned_to)
  where kind = 'practice';

-- ── Kind is fixed at insert ──────────────────────────────────────────────────

create function public.label_sessions_kind_immutable()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A label session''s kind cannot change.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke execute on function public.label_sessions_kind_immutable()
  from public, anon, authenticated;

create trigger label_sessions_kind_immutable
  before update of kind on public.label_sessions
  for each row execute function public.label_sessions_kind_immutable();

-- ── Publish lease refuses practice ───────────────────────────────────────────

create or replace function public.claim_label_publish_lease(p_session_id uuid)
returns timestamp with time zone
language sql
set search_path to ''
as $function$
  update public.label_sessions
     set publishing_since = now()
   where id = p_session_id
     and kind <> 'practice'
     and status in ('labelling', 'submitted')
     and (publishing_since is null or publishing_since <= now() - interval '5 minutes')
  returning publishing_since;
$function$;

-- ── Deletion follows the match and the labeller ──────────────────────────────

create or replace function public.matches_drop_self_review()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  delete from public.label_sessions s
   where s.match_id = old.id and s.kind in ('self', 'practice');
  return old;
end;
$function$;

create function public.users_drop_practice_sessions()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  delete from public.label_sessions s
   where s.kind = 'practice'
     and (s.assigned_to = old.id or s.labeller = old.id);
  return old;
end;
$function$;

revoke execute on function public.users_drop_practice_sessions()
  from public, anon, authenticated;

create trigger users_drop_practice_sessions
  before delete on public.users
  for each row execute function public.users_drop_practice_sessions();
