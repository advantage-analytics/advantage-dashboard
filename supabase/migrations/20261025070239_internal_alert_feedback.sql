-- Mail the internal alerts inbox about every first-match feedback answer.
--
-- A fourth event on the path 20261023075659_internal_activity_alerts.sql
-- built for signups and uploads: an insert into public.product_feedback
-- (only ever written by submit_product_feedback(),
-- 20261025063957_first_match_feedback.sql) posts { kind: 'feedback', id }
-- to /api/webhooks/internal-events through pg_net, and
-- services/notifications/internal-activity-mail.ts reads the row back and
-- sends — the player, the rating as its word, the note in full, how long
-- after first reading the report they answered.
--
-- A trigger rather than a call in the route, for the same reason the other
-- three are: whatever writes the row — the dashboard route today, an admin
-- tool or the MCP connector tomorrow — the inbox hears about it. post_event
-- swallows its own errors, so an alert can never be why an answer fails to
-- save, and it queues nothing until Vault holds `cron_secret`.
--
-- The production route must know the kind before this is worth anything: a
-- `feedback` event posted to a deployment without
-- parseInternalEvent's fourth kind answers 400 and pg_net does not retry.
-- Applied to the live database on 2026-10-25 as version 20261025070239
-- (`internal_alert_feedback`); the trigger and its function were confirmed
-- present in pg_trigger and pg_proc right after.
--
-- Rollback:
--   drop trigger if exists internal_alert_feedback on public.product_feedback;
--   drop function if exists internal_alerts_private.on_feedback_submitted();

create or replace function internal_alerts_private.on_feedback_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform internal_alerts_private.post_event('feedback', new.id);
  return null;
end;
$$;

revoke all on function internal_alerts_private.on_feedback_submitted()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'internal_alert_feedback'
       and tgrelid = 'public.product_feedback'::regclass
  ) then
    create trigger internal_alert_feedback
      after insert on public.product_feedback
      for each row execute function internal_alerts_private.on_feedback_submitted();
  end if;
end
$$;
