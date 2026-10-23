-- Mail the internal alerts inbox about every new signup and every new upload.
--
-- Three triggers, one POST each to /api/webhooks/internal-events through
-- pg_net, which reads the row back and sends
-- (services/notifications/internal-activity-mail.ts):
--
--   signup              public.users insert (handle_new_user writes it for
--                       every auth path: password, magic link, invite, join)
--   video_upload        a first-attempt processing_jobs row that leaves
--                       pending/uploading for anything but cancelled/failed:
--                       the bytes are in Azure. Resubmits are skipped.
--   swingvision_upload  a match_files insert (/api/upload writes it once the
--                       .xlsx is in storage)
--
-- Triggers rather than calls in the app because there are too many doors to
-- cover by hand — the wizard, the MCP connector, admin uploads, every sign-in
-- method — and a trigger sees them all.
--
-- pg_net queues the request in this transaction and sends it after commit,
-- so a rolled-back insert announces nothing. post_event swallows its own
-- errors: an alert must never be the reason a signup or an upload fails.
--
-- BEFORE this sends anything, Vault needs the CRON_SECRET bearer (SQL editor,
-- not a migration — a secret must never land in this folder):
--
--   select vault.create_secret('<the value of CRON_SECRET in Vercel>', 'cron_secret');
--
-- Until then post_event returns without queueing. It is the same secret the
-- schedule_stalled_upload_sweep migration reads; rotate CRON_SECRET and this
-- row must change with it (vault.update_secret) or the route answers 401.
--
-- The URL is production's. Applied to any other project, these would call
-- production with that project's secret and be refused.

create extension if not exists pg_net with schema extensions;

create schema if not exists internal_alerts_private;
revoke all on schema internal_alerts_private from public;

create or replace function internal_alerts_private.post_event(
  p_kind text,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select secret.decrypted_secret
    into v_secret
    from vault.decrypted_secrets as secret
   where secret.name = 'cron_secret';

  if v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://app.advantage-analytics.com/api/webhooks/internal-events',
    body := jsonb_build_object('kind', p_kind, 'id', p_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'internal alert % % not queued: %', p_kind, p_id, sqlerrm;
end;
$$;

create or replace function internal_alerts_private.on_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform internal_alerts_private.post_event('signup', new.id);
  return null;
end;
$$;

create or replace function internal_alerts_private.on_video_uploaded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.resubmitted_from_job_id is not null
     or new.status in ('pending', 'uploading', 'cancelled', 'failed') then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status not in ('pending', 'uploading') then
    return null;
  end if;

  perform internal_alerts_private.post_event('video_upload', new.id);
  return null;
end;
$$;

create or replace function internal_alerts_private.on_match_file_uploaded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform internal_alerts_private.post_event('swingvision_upload', new.id);
  return null;
end;
$$;

-- Nobody calls these but the triggers below. The schema revoke and the
-- 20261001184305 default privileges already leave them owner-only; this says
-- so outright in case the migration ever runs as a different owner.
revoke all on all functions in schema internal_alerts_private
  from public, anon, authenticated;

create trigger internal_alert_signup
  after insert on public.users
  for each row execute function internal_alerts_private.on_user_created();

create trigger internal_alert_video_upload
  after insert or update of status on public.processing_jobs
  for each row execute function internal_alerts_private.on_video_uploaded();

create trigger internal_alert_swingvision_upload
  after insert on public.match_files
  for each row
  when (new.provider_id = 'swing-vision')
  execute function internal_alerts_private.on_match_file_uploaded();
