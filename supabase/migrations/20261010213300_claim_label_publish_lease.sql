-- Take a session's publish lease (labels/session-status-session.ts) stamped
-- by the database's clock, the same clock label_publish_guards checks it
-- with, so app-server skew cannot shift the five-minute window. Answers the
-- stamp, which the close and the release then match on; no row when the
-- session is not labelling or a fresh lease is already on it.

create or replace function public.claim_label_publish_lease(p_session_id uuid)
returns timestamptz
language sql
set search_path = ''
as $$
  update public.label_sessions
     set publishing_since = now()
   where id = p_session_id
     and status = 'labelling'
     and (publishing_since is null or publishing_since <= now() - interval '5 minutes')
  returning publishing_since;
$$;

revoke execute on function public.claim_label_publish_lease(uuid) from public, anon, authenticated;
grant execute on function public.claim_label_publish_lease(uuid) to service_role;
