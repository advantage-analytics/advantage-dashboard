-- The first-upload nudges: a switch to stop them, and the query that finds
-- who they go to. Applied live 2026-10-25 as version 20261025042516.
--
-- `email_getting_started` gates the two "add your first match" emails
-- (`services/notifications/first-upload-mail.ts`). Default ON: they go to
-- someone who signed up days ago, and each carries a one-click unsubscribe
-- that turns this off. user_preferences grants by column, so the new column
-- needs its own INSERT and UPDATE grant or the settings form's upsert fails.

alter table public.user_preferences
  add column if not exists email_getting_started boolean not null default true;

grant insert (email_getting_started), update (email_getting_started)
  on public.user_preferences to authenticated;

-- Everyone a nudge could go to right now: signed up between `p_min_age` and
-- `p_max_age` ago, not an admin, in no program (team onboarding is its own
-- sequence, not built yet), switch on, and nothing added — no match they
-- created or play in as player 1, no processing job. A draft counts as added:
-- they found the page, and the upload-paused mail covers a stuck one.
--
-- Service role only. It reads every user's address, so a signed-in caller
-- must never reach it; the cron route calls it with the service key.
create or replace function public.first_upload_nudge_candidates(
  p_min_age interval,
  p_max_age interval,
  p_limit int
)
returns table (
  user_id uuid,
  email text,
  first_name text,
  signed_up_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.id, u.email, u.first_name, u.created_at
  from public.users u
  left join public.user_preferences up on up.user_id = u.id
  where u.created_at <= now() - p_min_age
    and u.created_at >  now() - p_max_age
    and not u.is_admin
    and coalesce(up.email_getting_started, true)
    and not exists (select 1 from public.program_members pm where pm.user_id = u.id)
    and not exists (
      select 1 from public.matches m
      where m.created_by = u.id or m.player1_id = u.id
    )
    and not exists (select 1 from public.processing_jobs j where j.created_by = u.id)
  order by u.created_at
  limit p_limit;
$$;

revoke execute on function public.first_upload_nudge_candidates(interval, interval, int)
  from public, anon, authenticated;
grant execute on function public.first_upload_nudge_candidates(interval, interval, int)
  to service_role;
