-- `processing_jobs.vendor_request`: the job body we POSTed to the vendor for
-- this attempt, kept as evidence beside `raw_webhook_payload` (what they sent
-- back).
--
-- Until now the body was built, sent and discarded. Part of it survived as
-- derived columns, but not the parts that matter in a dispute: the
-- `InitialTopPlayer` / `InitialBottomPlayer` strings themselves, and the
-- `SetGameScores` actually sent — those are rebuilt from `matches.score`,
-- which can be edited after submission.
--
-- `VideoUrl` is NOT stored: it is a signed Azure credential. The CHECK below
-- refuses any body that still carries the key, so a code path that forgets to
-- strip it fails loudly instead of persisting a live URL.
--
-- Server-only. `authenticated` holds a table-wide UPDATE/INSERT grant on
-- `processing_jobs` (RLS scopes it to the creator), and a column-level REVOKE
-- cannot narrow a table-level grant — so a trigger refuses any client-role
-- write to this column. The submit routes write through the service-role
-- client; SECURITY DEFINER functions run as their owner; both pass.
--
-- No backfill: rebuilding the earlier bodies from today's match rows would
-- record a guess as evidence. Null means "not recorded".
--
-- Nullable with no default, so the add is catalog-only (no table rewrite).
--
-- Applied to the live database via the Supabase MCP as
-- `processing_jobs_vendor_request`; this file carries the version the live
-- project recorded on apply.

set local lock_timeout = '5s';

alter table public.processing_jobs
  add column if not exists vendor_request jsonb;

comment on column public.processing_jobs.vendor_request is
  'The job body POSTed to the vendor for this attempt, minus VideoUrl (a signed credential). Written by the server at submitting; null = not recorded (before 2026-10-09, or never submitted).';

-- Existence-checked rather than drop-and-re-add: re-runnable with no DROP.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.processing_jobs'::regclass
       and conname = 'processing_jobs_vendor_request_shape'
  ) then
    alter table public.processing_jobs
      add constraint processing_jobs_vendor_request_shape check (
        vendor_request is null
        or (jsonb_typeof(vendor_request) = 'object' and not vendor_request ? 'VideoUrl')
      );
  end if;
end
$$;

-- SECURITY INVOKER on purpose: `current_user` must be the caller's role.
create or replace function public.guard_processing_jobs_vendor_request()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and new.vendor_request is not null)
    or (tg_op = 'UPDATE' and new.vendor_request is distinct from old.vendor_request)
  ) then
    raise exception 'vendor_request is written by the server only'
      using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function public.guard_processing_jobs_vendor_request()
  from public, anon, authenticated;

create or replace trigger processing_jobs_guard_vendor_request
  before insert or update of vendor_request on public.processing_jobs
  for each row execute function public.guard_processing_jobs_vendor_request();

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  assert exists (
    select 1 from pg_attribute
     where attrelid = 'public.processing_jobs'::regclass
       and attname = 'vendor_request'
       and atttypid = 'jsonb'::regtype
       and not attnotnull
       and not attisdropped),
    'processing_jobs.vendor_request: missing, or not nullable jsonb';
  assert exists (
    select 1 from pg_constraint
     where conrelid = 'public.processing_jobs'::regclass
       and conname = 'processing_jobs_vendor_request_shape'),
    'processing_jobs_vendor_request_shape: constraint is missing';
  assert exists (
    select 1 from pg_trigger
     where tgrelid = 'public.processing_jobs'::regclass
       and tgname = 'processing_jobs_guard_vendor_request'
       and not tgisinternal),
    'processing_jobs_guard_vendor_request: trigger is missing';
end
$$;
