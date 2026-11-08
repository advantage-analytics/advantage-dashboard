-- Vendor deletion requests: Privacy Policy 1.5 §5 and §8 and Guardian Terms
-- 1.2 §7 promise that when match video is deleted at a user's request, we ask
-- the video analysis provider (SplitStep) to delete its copy. SplitStep has no
-- delete API (its job DELETE only cancels a queued job), and it handles
-- deletion requests forwarded to it by email.
--
-- Postgres decides WHAT is owed: a BEFORE DELETE trigger on `matches` records
-- every job of the match that reached SplitStep (`external_job_id` set). That
-- covers the match delete route and account deletion, which deletes the
-- account's matches before anything else. Team matches kept after an account
-- is deleted are not deleted, so nothing is owed for them.
--
-- `/api/cron/vendor-deletion-requests` decides WHEN: it mails the pending rows
-- once a day and stamps `sent_at`. Video retired by the one-year retention
-- sweep is not a user request, so it is not recorded.
--
-- Access: service role only. No user reads or writes these rows.

create table public.vendor_deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  vendor          text not null default 'splitstep'
                  check (vendor in ('splitstep')),
  -- What SplitStep knows the match by: the job body's `MatchID` is
  -- `matches.id`, and its job id is `processing_jobs.external_job_id`.
  vendor_match_id text not null,
  vendor_job_id   text not null,
  -- A live-DB spec account (`@example.com`, RFC 2606). Recorded, never mailed.
  is_test         boolean not null default false,
  requested_at    timestamptz not null default now(),
  sent_at         timestamptz,
  unique (vendor, vendor_job_id)
);

comment on table public.vendor_deletion_requests is
  'Video the analysis vendor must be asked to delete, because its match was '
  'deleted. Mailed by /api/cron/vendor-deletion-requests; sent_at is when.';

create index vendor_deletion_requests_pending_idx
  on public.vendor_deletion_requests (requested_at)
  where sent_at is null and not is_test;

alter table public.vendor_deletion_requests enable row level security;
revoke all on public.vendor_deletion_requests from public, anon, authenticated;
grant all on public.vendor_deletion_requests to service_role;

create or replace function public.record_vendor_deletion_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  begin
    insert into public.vendor_deletion_requests
      (vendor_match_id, vendor_job_id, is_test)
    select old.id::text,
           j.external_job_id,
           coalesce(u.email ~* '@example\.(com|org|net)$', false)
    from public.processing_jobs j
    left join public.users u on u.id = j.created_by
    where j.match_id = old.id
      and j.external_job_id is not null
    on conflict (vendor, vendor_job_id) do nothing;
  exception
    when others then
      -- A failed record must never block the user's deletion. The warning is
      -- the trail for doing it by hand.
      raise warning 'record_vendor_deletion_requests failed for match %: %',
        old.id, sqlerrm;
  end;
  return old;
end;
$function$;

revoke execute on function public.record_vendor_deletion_requests()
  from public, anon, authenticated;

create trigger matches_record_vendor_deletion_requests
  before delete on public.matches
  for each row execute function public.record_vendor_deletion_requests();
