-- Two more notification switches, and a ledger that keeps one-shot mail one-shot.
-- Applied live 2026-09-13 as version 20260913230000.
--
-- `notify_team_activity` gates the three FYI notices a program owner receives
-- (join request filed, member joined, member left). They have sent
-- unconditionally since they were wired; a settings switch is the only
-- unsubscribe this product offers, so mail with no switch is mail nobody can
-- stop. `notify_usage_alerts` gates the allowance emails at 80% and 100%.
-- Both default ON like the analysis pair: a warning arriving late is worth
-- less than one arriving unasked.

alter table public.user_preferences
  add column if not exists notify_team_activity boolean not null default true,
  add column if not exists notify_usage_alerts  boolean not null default true;

-- Idempotency for mail that must send at most once per event: a webhook the
-- vendor redelivers, a derivation re-run by hand, an allowance threshold that
-- every subsequent upload in the month would cross again. The sender inserts
-- its key before sending and only proceeds when the insert won — so a second
-- attempt finds the row and stays silent. Keys are `<type>:<subject>[:<period>]`,
-- e.g. `analysis_ready:<job_id>`, `usage_low:<account_id>:<billing_month>`.
--
-- RLS on, no policies: only the service role writes here, and there is nothing
-- a browser session should read from it.
create table if not exists public.notification_sends (
  dedupe_key text primary key,
  sent_at    timestamptz not null default now()
);

alter table public.notification_sends enable row level security;

comment on table public.notification_sends is
  'One row per one-shot notification already sent, keyed by <type>:<subject>. Service role only.';
