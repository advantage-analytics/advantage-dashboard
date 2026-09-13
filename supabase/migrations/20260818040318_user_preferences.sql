-- Per-person preferences — what Settings › Preferences edits.
-- Applied live 2026-08-18 as version 20260818040318.
--
-- Its own table rather than six more columns on `public.users`. That row is
-- identity (name, dob, country, plan) and is read on every dashboard request
-- through `getWorkspaceContext`; preferences are written from one page and read
-- by the notifier. Keeping them apart means a toggle never widens the row every
-- request already pays for, and the notification settings can grow without
-- touching the table authorization reads.
--
-- Every column is NOT NULL with a default, so a user who has never opened the
-- page still has answers — the page can render defaults before the row exists
-- and the first save creates it.

create table if not exists public.user_preferences (
  user_id                   uuid primary key references public.users(id) on delete cascade,

  -- Notifications. The first two are on by default because processing has no
  -- fixed turnaround: email IS the completion signal, and defaulting it off
  -- would leave people watching a page that may not change for an hour.
  notify_analysis_ready     boolean not null default true,
  notify_analysis_failed    boolean not null default true,
  -- Coaches only, and off by default — a weekly digest nobody asked for is
  -- the kind of mail that teaches people to filter the sender.
  weekly_team_digest        boolean not null default false,

  -- Defaults.
  default_workspace         text    not null default 'last_used',
  match_report_opens_at     text    not null default 'story',
  stat_definitions_on_hover boolean not null default true,

  updated_at                timestamptz not null default now()
);

alter table public.user_preferences
  drop constraint if exists user_preferences_default_workspace_check;
alter table public.user_preferences
  add constraint user_preferences_default_workspace_check
  check (default_workspace in ('last_used', 'personal', 'team'));

alter table public.user_preferences
  drop constraint if exists user_preferences_report_opens_check;
alter table public.user_preferences
  add constraint user_preferences_report_opens_check
  check (match_report_opens_at in ('story', 'stats', 'video'));

alter table public.user_preferences enable row level security;

-- Own row only, in all three directions. There is no reason for one account to
-- read another's notification settings, and no admin path needs them.
drop policy if exists "Users read own preferences" on public.user_preferences;
create policy "Users read own preferences"
  on public.user_preferences for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own preferences" on public.user_preferences;
create policy "Users insert own preferences"
  on public.user_preferences for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own preferences" on public.user_preferences;
create policy "Users update own preferences"
  on public.user_preferences for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.user_preferences is
  'Notification and default-view settings, one row per user. Absent row = defaults.';
