-- The first-upload candidate query leaves out people already mailed for the
-- step it is asked about. NOT YET APPLIED LIVE — rename this file to the
-- version `schema_migrations` records when it is.
--
-- The sweep used to fetch 200 candidates and drop the already-mailed ones in
-- TypeScript. A mailed person stays in their window for days, so once more
-- than 200 had been mailed the cap filled with them and newer sign-ups were
-- never reached. Filtering here keeps the limit spent on people still owed
-- the email. `p_dedupe_prefix` is the step's `claimSend` key up to the user
-- id (`first_upload_nudge:<step>:`).
--
-- A new parameter changes the signature, so the old function is dropped
-- rather than left behind as an overload; the drop resets nothing that is
-- not re-granted below.

drop function if exists public.first_upload_nudge_candidates(interval, interval, int);

create function public.first_upload_nudge_candidates(
  p_min_age interval,
  p_max_age interval,
  p_dedupe_prefix text,
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
    and not exists (
      select 1 from public.notification_sends s
      where s.dedupe_key = p_dedupe_prefix || u.id::text
    )
  order by u.created_at
  limit p_limit;
$$;

revoke execute on function public.first_upload_nudge_candidates(interval, interval, text, int)
  from public, anon, authenticated;
grant execute on function public.first_upload_nudge_candidates(interval, interval, text, int)
  to service_role;
