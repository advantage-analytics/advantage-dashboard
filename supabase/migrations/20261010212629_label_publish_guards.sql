-- Two guards for "Mark complete" publishing a labelling session
-- (labels/session-status-session.ts, labels/apply-session.ts).
--
-- 1. append_label_backup_key: note a publish backup's key on its job in ONE
--    statement, so two publishes on the same job never lose each other's key
--    (a read-then-write would). Called with the service-role client only.
--
-- 2. The publish lease (`label_sessions.publishing_since`, fresh for five
--    minutes — PUBLISH_LEASE_MS in labels/edit-session.ts) is enforced here,
--    not only by the app's read-then-write gate:
--    • a label_points / label_shots write takes a SHARE lock on its session
--      row and refuses while the lease is fresh. Taking the lease updates that
--      row, so it waits for any edit already past the gate to commit, and the
--      publish then reads it; an edit after the lease is refused.
--    • a label_sessions update that leaves a fresh lease as it is (a session
--      field edit) is refused; the lease's own writes change it and pass.
--    The message is the console's sentence, shown as the write's error.

create or replace function public.append_label_backup_key(p_job_id uuid, p_key text)
returns boolean
language sql
set search_path = ''
as $$
  with appended as (
    update public.processing_jobs
       set label_backup_keys = array_append(label_backup_keys, p_key)
     where id = p_job_id
    returning id
  )
  select exists (select 1 from appended);
$$;

revoke execute on function public.append_label_backup_key(uuid, text) from public, anon, authenticated;
grant execute on function public.append_label_backup_key(uuid, text) to service_role;

create or replace function public.label_rows_refuse_while_publishing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  since timestamptz;
begin
  select s.publishing_since into since
    from public.label_sessions s
   where s.id = new.session_id
     for share;
  if since is not null and since > now() - interval '5 minutes' then
    raise exception 'This session is being published. Wait for it to finish, then reload.';
  end if;
  return new;
end;
$$;

create or replace function public.label_session_refuse_while_publishing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publishing_since is not null
     and old.publishing_since > now() - interval '5 minutes'
     and new.publishing_since is not distinct from old.publishing_since then
    raise exception 'This session is being published. Wait for it to finish, then reload.';
  end if;
  return new;
end;
$$;

revoke execute on function public.label_rows_refuse_while_publishing() from public, anon, authenticated;
revoke execute on function public.label_session_refuse_while_publishing() from public, anon, authenticated;

create trigger label_points_refuse_while_publishing
  before insert or update on public.label_points
  for each row execute function public.label_rows_refuse_while_publishing();

create trigger label_shots_refuse_while_publishing
  before insert or update on public.label_shots
  for each row execute function public.label_rows_refuse_while_publishing();

create trigger label_sessions_refuse_while_publishing
  before update on public.label_sessions
  for each row execute function public.label_session_refuse_while_publishing();
