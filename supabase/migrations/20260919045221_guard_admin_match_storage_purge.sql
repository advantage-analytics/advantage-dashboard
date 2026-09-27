-- A durable deletion claim spans database checks and external storage cleanup.
-- All console admissions lock the same parent before checking the claim.
create table public.match_storage_purge_claims (
  match_id uuid primary key references public.matches(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.match_storage_purge_claims enable row level security;
revoke all on public.match_storage_purge_claims from public, anon, authenticated, service_role;
create policy purge_claims_service_read on public.match_storage_purge_claims
  for select to service_role using (true);

create function public.admin_claim_match_storage_purge(p_match_ids uuid[])
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.matches where id = any(p_match_ids) order by id for update;
  if exists(select 1 from public.admin_upload_submission_items where match_id = any(p_match_ids))
    or exists(select 1 from public.admin_analysis_reservations where match_id = any(p_match_ids))
    or exists(select 1 from public.admin_file_attempts where match_id = any(p_match_ids))
    or exists(select 1 from public.admin_video_attempts where match_id = any(p_match_ids)) then
    return false;
  end if;
  insert into public.match_storage_purge_claims(match_id)
    select id from public.matches where id = any(p_match_ids)
    on conflict (match_id) do nothing;
  return true;
end;
$$;
revoke all on function public.admin_claim_match_storage_purge(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.admin_claim_match_storage_purge(uuid[]) to service_role;

create function admin_uploads_private.reject_purging_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.match_id is not null then
    perform 1 from public.matches where id = new.match_id for update;
    if exists(select 1 from public.match_storage_purge_claims where match_id = new.match_id) then
      raise exception 'match-deletion-in-progress' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.reject_purging_match() from public, anon, authenticated, service_role;
create trigger reject_purging_match before insert or update of match_id on public.admin_upload_submission_items for each row execute function admin_uploads_private.reject_purging_match();
create trigger reject_purging_match before insert or update of match_id on public.admin_analysis_reservations for each row execute function admin_uploads_private.reject_purging_match();
create trigger reject_purging_match before insert or update of match_id on public.admin_file_attempts for each row execute function admin_uploads_private.reject_purging_match();
create trigger reject_purging_match before insert or update of match_id on public.admin_video_attempts for each row execute function admin_uploads_private.reject_purging_match();

-- Account cleanup claims the actor before releasing teams or personal bytes.
create table public.admin_actor_delete_claims (
  actor_user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_actor_delete_claims enable row level security;
revoke all on public.admin_actor_delete_claims from public, anon, authenticated, service_role;
create policy actor_delete_claims_service_read on public.admin_actor_delete_claims
  for select to service_role using (true);

create function public.admin_claim_actor_deletion(p_actor_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.users where id = p_actor_id for update;
  if not found then return false; end if;
  if exists(select 1 from public.admin_upload_submissions where actor_user_id = p_actor_id)
    or exists(select 1 from public.admin_video_attempts a join public.processing_jobs j on j.id=a.job_id where j.created_by=p_actor_id) then
    return false;
  end if;
  insert into public.admin_actor_delete_claims(actor_user_id) values(p_actor_id)
    on conflict (actor_user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.admin_claim_actor_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_claim_actor_deletion(uuid) to service_role;

create function admin_uploads_private.reject_deleting_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.actor_user_id is not null then
    perform 1 from public.users where id=new.actor_user_id for update;
    if exists(select 1 from public.admin_actor_delete_claims where actor_user_id=new.actor_user_id) then
      raise exception 'account-deletion-in-progress' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function admin_uploads_private.reject_deleting_actor() from public, anon, authenticated, service_role;
create trigger reject_deleting_actor before insert or update of actor_user_id on public.admin_upload_submissions for each row execute function admin_uploads_private.reject_deleting_actor();

-- Keep claim creation and ownership refusal in one transaction: a refused
-- release rolls the claim back, while successful release protects later I/O.
create function public.prepare_my_account_deletion()
returns table(program_id uuid, profile_id uuid, retained integer, repointed integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.admin_claim_actor_deletion(auth.uid()) then
    raise exception 'console-history-protected' using errcode = '22023';
  end if;
  return query select * from public.release_my_account_from_programs();
end;
$$;
revoke all on function public.prepare_my_account_deletion() from public, anon, authenticated, service_role;
grant execute on function public.prepare_my_account_deletion() to authenticated;
