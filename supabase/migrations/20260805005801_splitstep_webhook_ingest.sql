-- SplitStep webhook ingest — results bucket, durable delivery log, idempotent
-- job advance.
--
-- Implements the two architecture corrections that supersede the spec's §2 diagram
-- and storage table (now described in docs/r2-and-webhook-overview.md §2 and §5):
--
--   §2.1  Raw results JSON goes to Supabase Storage, not R2. The stroke JSON is
--         ~0.5–2 MB against a 1–5 GB video — three orders of magnitude apart, so
--         the zero-egress argument that makes R2 right for video does not carry.
--         `match-data` already holds raw SwingVision uploads; this is the same
--         pattern, not a new one.
--
--   §2.2  Derivation does not run inline in the webhook. This migration gives the
--         route everything it needs to be thin: record, advance, return.
--
-- Additive only. Nothing here touches the SwingVision path.

-- ---------------------------------------------------------------------------
-- 1. match-results bucket
-- ---------------------------------------------------------------------------
--
-- PRIVATE, unlike `match-data` (which is public: true). Nothing reads these
-- objects over an unauthenticated URL — the webhook writes with the service
-- role and the derivation Edge Function reads with it. A public bucket would be
-- an unnecessary read path onto per-athlete match data.
--
-- allowed_mime_types is deliberately left NULL rather than pinned to
-- application/json. The upload sets its own content type, so a restriction buys
-- nothing here, and this bucket holds results we have exactly one chance to
-- persist before the vendor's SAS URL expires (§7 Q5). A MIME mismatch must not
-- be the reason a match's results are lost.

insert into storage.buckets (id, name, public, file_size_limit)
values ('match-results', 'match-results', false, 52428800)
on conflict (id) do nothing;

-- Owners may read their own results. Writes are service-role only, which
-- bypasses RLS and so needs no policy.
--
-- Key layout is `results/{user_id}/{match_id}/{job_id}.json` — see
-- resultsObjectKey() in src/lib/services/splitstep/object-keys.ts. foldername()
-- splits on '/', so [1] is the literal prefix and [2] is the owner.

drop policy if exists "Users can read own match results" on storage.objects;
create policy "Users can read own match results"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'match-results'
    and (storage.foldername(name))[1] = 'results'
    and (storage.foldername(name))[2] = ((select auth.uid()))::text
  );

-- ---------------------------------------------------------------------------
-- 2. splitstep_webhook_deliveries — durable forensic log
-- ---------------------------------------------------------------------------
--
-- `processing_jobs.raw_webhook_payload` already appends every payload, but it
-- can only hold deliveries that MATCH A JOB. During the pilot the deliveries
-- most worth having are exactly the ones that do not: a payload for an unknown
-- external_job_id, a body that is not JSON, a shape that differs from the docs.
--
-- The handoff's webhook must-haves call for logging the raw body before parsing
-- "because if the payload differs from the docs at all, that log is the only
-- thing that will tell you." On Vercel Hobby, console logs are short-retention
-- and not queryable. This table is that log, durably.
--
-- Nothing is ever rejected for shape. raw_body is text, not jsonb, so a body
-- that does not parse is still recorded verbatim.

create table if not exists public.splitstep_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),

  -- Both nullable: extracted best-effort from a payload whose exact shape is
  -- not yet confirmed against the vendor's real output.
  external_job_id text,
  event text,

  -- Null when the delivery could not be matched to a job — an unknown vendor id,
  -- or a webhook that beat its own job row into the database.
  job_id uuid references public.processing_jobs (id) on delete set null,

  -- Exactly what they sent, before any parsing.
  raw_body text not null,
  -- Null when raw_body is not valid JSON.
  parsed jsonb,
  headers jsonb,

  -- False for an unsigned delivery. Unsigned is accepted during the smoke test
  -- only — see TODO(splitstep-q4) in the route.
  signature_verified boolean not null default false,

  -- SHA-256 of the raw body. Dedupes byte-identical retries; two DIFFERENT
  -- events for one job hash differently and are both kept, which is correct.
  fingerprint text not null,

  -- Set once the results JSON is durably in storage. The route reads this back
  -- to know whether a retry still owes us a download.
  results_object_key text,
  processing_error text,

  constraint splitstep_webhook_deliveries_fingerprint_key unique (fingerprint)
);

create index if not exists splitstep_webhook_deliveries_external_job_id_idx
  on public.splitstep_webhook_deliveries (external_job_id);
create index if not exists splitstep_webhook_deliveries_job_id_idx
  on public.splitstep_webhook_deliveries (job_id);
create index if not exists splitstep_webhook_deliveries_received_at_idx
  on public.splitstep_webhook_deliveries (received_at desc);

alter table public.splitstep_webhook_deliveries enable row level security;

-- No policy for `authenticated` on purpose. This log can hold payloads not yet
-- attributed to any user, so there is no correct owner predicate to write. The
-- service role bypasses RLS; everyone else sees nothing.

-- ---------------------------------------------------------------------------
-- 3. Status ordering
-- ---------------------------------------------------------------------------
--
-- Webhook deliveries arrive out of order and are retried. Without an ordering a
-- late `job_queued` retry would drag a completed job backwards to `queued` and
-- strand it there.

create or replace function public.splitstep_status_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'pending'    then 0
    when 'uploading'  then 1
    when 'uploaded'   then 2
    when 'submitting' then 3
    when 'queued'     then 4
    when 'processing' then 5
    when 'completed'  then 6
    when 'failed'     then 6
    -- Terminal, and only reachable from `completed` by our own derivation
    -- engine. A vendor webhook can never set it.
    when 'derivation_failed' then 7
    else -1
  end;
$$;

revoke all on function public.splitstep_status_rank(text) from public;
revoke all on function public.splitstep_status_rank(text) from anon;
revoke all on function public.splitstep_status_rank(text) from authenticated;

-- ---------------------------------------------------------------------------
-- 4. record_splitstep_webhook — the route's single write
-- ---------------------------------------------------------------------------
--
-- One statement so the delivery log, the job status advance and the payload
-- append cannot diverge, and so two concurrent deliveries cannot race on a
-- read-modify-write of raw_webhook_payload.
--
-- Idempotent on every axis:
--   • delivery      — unique fingerprint, ON CONFLICT returns the existing row
--   • status        — advances only when the rank strictly increases
--   • payload array — appended only when not already contained
--
-- Returns enough for the route to decide whether it still owes a download.

create or replace function public.record_splitstep_webhook(
  p_fingerprint text,
  p_raw_body text,
  p_parsed jsonb,
  p_headers jsonb,
  p_signature_verified boolean,
  p_external_job_id text default null,
  p_event text default null,
  p_next_status text default null,
  p_sas_url text default null,
  p_error_message text default null,
  -- Fallback link. We set `MatchID` on the job request ourselves, so an echoed
  -- copy is the one identifier in the payload whose name we control. If the
  -- vendor's job-id field turns out to be named something other than the docs
  -- say, this is what still attaches the delivery to a job.
  p_match_id uuid default null
)
returns table (
  delivery_id uuid,
  matched_job_id uuid,
  match_id uuid,
  created_by uuid,
  job_status text,
  results_object_key text,
  already_stored boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.splitstep_webhook_deliveries%rowtype;
  v_job public.processing_jobs%rowtype;
begin
  -- 1. Record the delivery. The no-op UPDATE is what makes RETURNING fire on
  --    conflict, so a retry gets back the row it created the first time.
  insert into public.splitstep_webhook_deliveries as d (
    fingerprint, raw_body, parsed, headers,
    signature_verified, external_job_id, event
  )
  values (
    p_fingerprint, p_raw_body, p_parsed, p_headers,
    p_signature_verified, p_external_job_id, p_event
  )
  on conflict (fingerprint) do update
    set received_at = d.received_at
  returning * into v_delivery;

  -- 2. Attach to a job, if one claims this vendor id.
  --
  -- Every column reference below is table-qualified. This function's OUT
  -- parameters include `match_id` and `created_by`, which are also column names
  -- on processing_jobs — unqualified, PL/pgSQL raises "column reference is
  -- ambiguous" at runtime, not at create time.
  if p_external_job_id is not null then
    select j.* into v_job
      from public.processing_jobs j
     where j.external_job_id = p_external_job_id
     limit 1;
  end if;

  -- Fall back to the match id we echoed on the request. Newest job wins: a match
  -- reprocessed after a failure has more than one job row, and the delivery
  -- belongs to the most recent submission.
  if v_job.id is null and p_match_id is not null then
    select j.* into v_job
      from public.processing_jobs j
     where j.match_id = p_match_id
     order by j.created_at desc
     limit 1;

    -- Claim the vendor id while we have it, so later deliveries take the fast
    -- path above. Guarded by the partial unique index on external_job_id.
    if v_job.id is not null
       and v_job.external_job_id is null
       and p_external_job_id is not null then
      update public.processing_jobs j
         set external_job_id = p_external_job_id
       where j.id = v_job.id
         and j.external_job_id is null;
    end if;
  end if;

  if v_job.id is null then
    -- Orphan. Deliberately not an error: the payload is what matters and it is
    -- already recorded above. The route logs this loudly and still returns 200,
    -- because a retry would orphan identically.
    return query
      select v_delivery.id, null::uuid, null::uuid, null::uuid,
             null::text, v_delivery.results_object_key,
             (v_delivery.results_object_key is not null);
    return;
  end if;

  -- 3. Advance the job.
  update public.processing_jobs j
     set status = case
           when p_next_status is null then j.status
           -- Never move backwards, and never off a terminal state.
           when public.splitstep_status_rank(p_next_status)
              > public.splitstep_status_rank(j.status)
             then p_next_status
           else j.status
         end,
         sas_url = coalesce(p_sas_url, j.sas_url),
         error_message = coalesce(p_error_message, j.error_message),
         queued_ack_at = case
           when p_event = 'job_queued' then coalesce(j.queued_ack_at, now())
           else j.queued_ack_at
         end,
         completed_at = case
           when p_next_status in ('completed', 'failed')
             then coalesce(j.completed_at, now())
           else j.completed_at
         end,
         raw_webhook_payload = case
           when p_parsed is null then j.raw_webhook_payload
           when j.raw_webhook_payload @> jsonb_build_array(p_parsed)
             then j.raw_webhook_payload
           else j.raw_webhook_payload || jsonb_build_array(p_parsed)
         end
   where j.id = v_job.id
  returning * into v_job;

  -- 4. Link the delivery to the job it landed on.
  update public.splitstep_webhook_deliveries d
     set job_id = v_job.id
   where d.id = v_delivery.id;

  return query
    select v_delivery.id, v_job.id, v_job.match_id, v_job.created_by,
           v_job.status, v_job.results_object_key,
           (v_job.results_object_key is not null);
end;
$$;

revoke all on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, uuid
) from public;
revoke all on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, uuid
) from anon;
revoke all on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, uuid
) from authenticated;
grant execute on function public.record_splitstep_webhook(
  text, text, jsonb, jsonb, boolean, text, text, text, text, text, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. finalize_splitstep_results — records where the JSON landed
-- ---------------------------------------------------------------------------
--
-- Split from record_splitstep_webhook because it runs AFTER the storage write.
-- Keeping them separate is what lets the envelope (and its sas_url) be durable
-- before the download is attempted — if the fetch fails, the URL needed to retry
-- by hand is already saved.

create or replace function public.finalize_splitstep_results(
  p_delivery_id uuid,
  p_job_id uuid,
  p_results_object_key text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.splitstep_webhook_deliveries d
     set results_object_key = coalesce(p_results_object_key, d.results_object_key),
         processing_error = p_error
   where d.id = p_delivery_id;

  if p_job_id is not null and p_results_object_key is not null then
    update public.processing_jobs j
       set results_object_key = coalesce(j.results_object_key, p_results_object_key)
     where j.id = p_job_id;
  end if;
end;
$$;

revoke all on function public.finalize_splitstep_results(uuid, uuid, text, text) from public;
revoke all on function public.finalize_splitstep_results(uuid, uuid, text, text) from anon;
revoke all on function public.finalize_splitstep_results(uuid, uuid, text, text) from authenticated;
grant execute on function public.finalize_splitstep_results(uuid, uuid, text, text) to service_role;
