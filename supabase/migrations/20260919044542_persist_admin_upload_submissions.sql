-- Explicit console provenance only. No membership inference or match-policy changes.
create schema if not exists admin_uploads_private;
revoke all on schema admin_uploads_private from public, anon, authenticated, service_role;

create table public.admin_upload_submissions (
  operation_id uuid primary key,
  actor_user_id uuid references public.users(id) on delete set null,
  program_id uuid not null references public.programs(id),
  kind text not null check (kind in ('file', 'video', 'dual', 'tournament', 'analysis_attachment')),
  event_id uuid references public.program_events(id),
  setup_result jsonb not null default '{}' check (jsonb_typeof(setup_result) = 'object'),
  origin text not null default 'admin_console' check (origin = 'admin_console'),
  created_at timestamptz not null default now()
);
create table public.admin_upload_submission_items (
  operation_id uuid not null references public.admin_upload_submissions(operation_id),
  item_id uuid not null,
  kind text not null check (kind in ('match', 'outcome', 'analysis_attachment')),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  match_id uuid references public.matches(id),
  outcome_id uuid references public.program_event_outcomes(id),
  processing_job_id uuid references public.processing_jobs(id),
  match_file_id uuid references public.match_files(id),
  result jsonb not null default '{}' check (jsonb_typeof(result) = 'object'),
  error_code text,
  audit_id bigint unique references public.program_audit_log(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (operation_id, item_id),
  check ((status = 'succeeded') = (audit_id is not null)),
  check (status <> 'succeeded' or ((kind = 'outcome' and outcome_id is not null and match_id is null)
    or (kind <> 'outcome' and match_id is not null and outcome_id is null))),
  check (status <> 'failed' or error_code is not null)
);
create index admin_upload_submissions_program_created on public.admin_upload_submissions(program_id, created_at desc);
create index admin_upload_submissions_event on public.admin_upload_submissions(event_id);
create index admin_upload_submissions_actor on public.admin_upload_submissions(actor_user_id);
create index admin_upload_items_match on public.admin_upload_submission_items(match_id);
create index admin_upload_items_outcome on public.admin_upload_submission_items(outcome_id);
create index admin_upload_items_job on public.admin_upload_submission_items(processing_job_id);
create index admin_upload_items_file on public.admin_upload_submission_items(match_file_id);
alter table public.admin_upload_submissions enable row level security;
alter table public.admin_upload_submission_items enable row level security;
revoke all on public.admin_upload_submissions, public.admin_upload_submission_items from public, anon, authenticated, service_role;
grant select on public.admin_upload_submissions, public.admin_upload_submission_items to authenticated;
create policy admin_upload_submissions_read on public.admin_upload_submissions for select to authenticated using ((select public.is_admin()));
create policy admin_upload_items_read on public.admin_upload_submission_items for select to authenticated using ((select public.is_admin()));

-- Preserve every live action, including Phase 2a's conference change.
alter table public.program_audit_log drop constraint program_audit_log_action_check;
alter table public.program_audit_log add constraint program_audit_log_action_check check (action in (
  'player.added', 'player.updated', 'player.archived', 'player.claimed', 'player.merged',
  'invite.created', 'invite.revoked', 'invite.accepted', 'member.removed', 'member.role_changed',
  'seats.changed', 'member.account_deleted', 'lineup.set', 'ownership.transferred', 'event.deleted',
  'player.restored', 'match.attached', 'member.left', 'program.conference_changed',
  'console.result_added', 'console.analysis_attached'
));

-- Register intent before an external upload. Caller cannot supply actor or origin.
-- Mutation RPCs must call this again in their transaction BEFORE side effects;
-- its item lock serializes identical retries. A succeeded result is terminal.
create function public.admin_begin_upload_item(
  p_operation_id uuid, p_item_id uuid, p_program_id uuid,
  p_submission_kind text, p_item_kind text, p_request jsonb
) returns public.admin_upload_submission_items
language plpgsql security definer set search_path = '' as $$
declare
  submission public.admin_upload_submissions;
  item public.admin_upload_submission_items;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  insert into public.admin_upload_submissions(operation_id, actor_user_id, program_id, kind)
    values (p_operation_id, auth.uid(), p_program_id, p_submission_kind)
    on conflict (operation_id) do nothing;
  select * into strict submission from public.admin_upload_submissions where operation_id = p_operation_id for update;
  if submission.actor_user_id is distinct from auth.uid() or submission.program_id is distinct from p_program_id
    or submission.kind is distinct from p_submission_kind then
    raise exception 'Operation identity conflict' using errcode = '22023';
  end if;
  insert into public.admin_upload_submission_items(operation_id, item_id, kind, request)
    values (p_operation_id, p_item_id, p_item_kind, p_request)
    on conflict (operation_id, item_id) do nothing;
  select * into strict item from public.admin_upload_submission_items
    where operation_id = p_operation_id and item_id = p_item_id for update;
  if item.kind is distinct from p_item_kind or item.request is distinct from p_request then
    raise exception 'Item identity conflict' using errcode = '22023';
  end if;
  return item;
end;
$$;
revoke all on function public.admin_begin_upload_item(uuid,uuid,uuid,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_begin_upload_item(uuid,uuid,uuid,text,text,jsonb) to authenticated;

-- Internal integration seam, NOT a client-callable completion endpoint. Later
-- authorized mutation RPCs call this in the SAME transaction as their write.
-- No standalone "mark successful" endpoint can forge a completed operation.
create function admin_uploads_private.finish_item(
  p_operation_id uuid, p_item_id uuid, p_result jsonb,
  p_match_id uuid default null, p_outcome_id uuid default null,
  p_processing_job_id uuid default null, p_match_file_id uuid default null,
  p_error_code text default null
) returns public.admin_upload_submission_items
language plpgsql security invoker set search_path = '' as $$
declare
  submission public.admin_upload_submissions;
  item public.admin_upload_submission_items;
  audit bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  select * into strict submission from public.admin_upload_submissions where operation_id = p_operation_id for update;
  if submission.actor_user_id is distinct from auth.uid() then
    raise exception 'Operation actor mismatch' using errcode = '42501';
  end if;
  select * into strict item from public.admin_upload_submission_items
    where operation_id = p_operation_id and item_id = p_item_id for update;
  if item.status = 'succeeded' then return item; end if;
  if p_error_code is null then
    if item.kind = 'outcome' then
      if p_match_id is not null or p_processing_job_id is not null or p_match_file_id is not null
        or not exists (select 1 from public.program_event_outcomes where id = p_outcome_id and program_id = submission.program_id) then
        raise exception 'Outcome linkage mismatch' using errcode = '22023';
      end if;
    else
      if p_outcome_id is not null or not exists (select 1 from public.matches where id = p_match_id and program_id = submission.program_id) then
        raise exception 'Match linkage mismatch' using errcode = '22023';
      end if;
      if p_processing_job_id is not null and not exists (select 1 from public.processing_jobs where id = p_processing_job_id and match_id = p_match_id and created_by = submission.actor_user_id) then
        raise exception 'Job linkage mismatch' using errcode = '22023';
      end if;
      if p_match_file_id is not null and not exists (select 1 from public.match_files where id = p_match_file_id and match_id = p_match_id and uploaded_by = submission.actor_user_id) then
        raise exception 'File linkage mismatch' using errcode = '22023';
      end if;
      if item.kind = 'analysis_attachment' and p_processing_job_id is null and p_match_file_id is null then
        raise exception 'Analysis linkage required' using errcode = '22023';
      end if;
    end if;
    insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
      values (submission.program_id, submission.actor_user_id,
        case when item.kind = 'analysis_attachment' then 'console.analysis_attached' else 'console.result_added' end,
        coalesce(p_match_id, p_outcome_id), jsonb_build_object('origin', 'admin_console',
          'operation_id', p_operation_id, 'item_id', p_item_id, 'kind', item.kind,
          'match_id', p_match_id, 'outcome_id', p_outcome_id,
          'processing_job_id', p_processing_job_id, 'match_file_id', p_match_file_id)) returning id into audit;
  end if;
  update public.admin_upload_submission_items set
    status = case when p_error_code is null then 'succeeded' else 'failed' end,
    match_id = case when p_error_code is null then p_match_id end,
    outcome_id = case when p_error_code is null then p_outcome_id end,
    processing_job_id = case when p_error_code is null then p_processing_job_id end,
    match_file_id = case when p_error_code is null then p_match_file_id end,
    result = p_result, error_code = p_error_code, audit_id = audit, updated_at = now()
    where operation_id = p_operation_id and item_id = p_item_id returning * into item;
  return item;
end;
$$;
revoke all on function admin_uploads_private.finish_item(uuid,uuid,jsonb,uuid,uuid,uuid,uuid,text) from public, anon, authenticated, service_role;

-- Later dual/tournament setup RPCs must lock the submission FOR UPDATE before
-- creating setup, reuse an existing event_id, and call this in that transaction.
create function admin_uploads_private.link_event(
  p_operation_id uuid, p_event_id uuid, p_setup_result jsonb
) returns public.admin_upload_submissions
language plpgsql security invoker set search_path = '' as $$
declare submission public.admin_upload_submissions;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  select * into strict submission from public.admin_upload_submissions
    where operation_id = p_operation_id for update;
  if submission.actor_user_id is distinct from auth.uid() then
    raise exception 'Operation actor mismatch' using errcode = '42501';
  end if;
  if submission.kind not in ('dual', 'tournament') or not exists (
    select 1 from public.program_events where id = p_event_id and program_id = submission.program_id
  ) then raise exception 'Event linkage mismatch' using errcode = '22023'; end if;
  if submission.event_id is not null then
    if submission.event_id is distinct from p_event_id or submission.setup_result is distinct from p_setup_result then
      raise exception 'Setup identity conflict' using errcode = '22023';
    end if;
    return submission;
  end if;
  update public.admin_upload_submissions set event_id = p_event_id, setup_result = p_setup_result
    where operation_id = p_operation_id returning * into submission;
  return submission;
end;
$$;
revoke all on function admin_uploads_private.link_event(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
