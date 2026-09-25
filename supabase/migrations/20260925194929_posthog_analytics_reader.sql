-- Read-only access for PostHog's data warehouse, and nothing else.
--
-- PostHog charts video-analysis volume, failures and minutes used per program.
-- Through this connection it does not need, and must not get, athletes' names,
-- emails, match stats, or the signed video/result URLs processing_jobs
-- carries (sas_url, trimmed_video_url, players_url, trajectories_url,
-- video_access_token, raw_webhook_payload). So it reads three views of
-- hand-picked columns in a schema of their own, through a role that can see
-- only that schema.
--
-- (Separately, and by decision, AI observability records LLM prompts that
-- include player first names and stats — see privacyMode in
-- src/lib/llm/adapter.ts. This file governs only the warehouse connection.)
--
-- Why views rather than grants on the tables: a column list is the only way to
-- keep those URLs out, and PostHog's sync selects whole tables. The views run
-- as their owner (security_invoker off) so the role needs no grant on — and no
-- RLS policy for — any table in public. That is safe only because the schema
-- is not exposed through the Data API (supabase/config.toml api.schemas) and
-- anon/authenticated get nothing on it; keep it that way.
--
-- The role is created WITHOUT a password, so it cannot log in until the owner
-- sets one in the SQL editor:
--   alter role posthog_reader with password '<generated>';
-- The password never belongs in this file or in git. PostHog connects through
-- the session pooler as posthog_reader.<project-ref>.
--
-- Adding a column to a view is a privacy decision: check it carries no URL,
-- token, name, email or free text before it goes in.

create schema if not exists posthog_analytics;
revoke all on schema posthog_analytics from public, anon, authenticated;

create or replace view posthog_analytics.video_jobs as
select
  id,
  match_id,
  created_by,
  provider,
  status,
  priority,
  start_time_seconds,
  end_time_seconds,
  billable_seconds,
  attempt_count,
  vendor_request_count,
  upload_progress_percent,
  -- The codes, not error_message: vendor messages are free text and can
  -- quote the URL that failed.
  error_code,
  error_category,
  error_step,
  derivation_version,
  derivation_confidence,
  resubmitted_from_job_id,
  auto_resubmitted,
  ad_scoring,
  fixed_camera,
  submitted_at,
  queued_ack_at,
  completed_at,
  created_at,
  updated_at
from public.processing_jobs;

create or replace view posthog_analytics.video_usage as
select
  id,
  account_id,
  account_type,
  billing_month,
  job_id,
  created_by,
  reserved_seconds,
  actual_seconds,
  released,
  created_at
from public.processing_usage;

create or replace view posthog_analytics.programs as
select
  id,
  school_name,
  school_abbrev,
  team,
  division,
  conference,
  conference_id,
  state,
  org_type,
  status,
  seats,
  players_can_upload,
  upload_policy,
  events_policy,
  time_zone,
  claimed_at,
  created_at,
  updated_at
from public.programs;

revoke all on all tables in schema posthog_analytics from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'posthog_reader') then
    create role posthog_reader
      login nosuperuser noinherit nocreatedb nocreaterole noreplication nobypassrls
      connection limit 3;
  end if;
end
$$;

-- Belt and braces: every transaction it opens is read-only, and no query runs
-- long enough to load the database.
alter role posthog_reader set default_transaction_read_only = on;
alter role posthog_reader set statement_timeout = '60s';

grant usage on schema posthog_analytics to posthog_reader;
grant select on all tables in schema posthog_analytics to posthog_reader;
