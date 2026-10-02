-- Account deletion leaves team data behind.
--
-- Deleting auth.users used to fail for anyone with a claimed roster profile:
-- program_players.claimed_by_user_id is ON DELETE SET NULL, and
-- program_players_claim_check requires claimed_by_user_id and claimed_at to be
-- null TOGETHER, so the referential action itself violated the check. It also
-- deleted every match the person ever filed, wherever it was filed.
--
-- After this migration:
--   * A person's program-filed matches stay with the program, re-pointed to
--     their roster profile (the second reviewed exception to
--     docs/ui-revamp-guardrails.md §2), with the uploader columns cleared.
--   * The profile becomes coach-managed. The trigger below keeps the paired
--     invariant even when the FK action is what clears the claim, so a
--     Studio delete of auth.users un-claims instead of failing.
--   * The uploader columns that were NOT NULL may now outlive the uploader,
--     and match_files no longer takes the team's file rows with it.
--
-- Spec: docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md

-- 1. Uploader columns may outlive the uploader.
alter table public.processing_jobs  alter column created_by drop not null;
alter table public.processing_usage alter column created_by drop not null;

-- 2. match_files: a departed uploader must not delete the team's file rows.
--    Guarded on the current action so a re-run is a no-op.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'match_files_uploaded_by_fkey'
       and conrelid = 'public.match_files'::regclass
       and confdeltype = 'c'
  ) then
    alter table public.match_files drop constraint match_files_uploaded_by_fkey;
    alter table public.match_files
      add constraint match_files_uploaded_by_fkey
      foreign key (uploaded_by) references public.users(id)
      on update cascade on delete set null;
  end if;
end $$;

-- 3. The paired-null invariant, enforced where the FK action cannot see it.
--    Referential actions run as ordinary UPDATEs and fire row triggers.
create or replace function public.program_players_clear_claimed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.claimed_at := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists program_players_clear_claimed_at on public.program_players;
create trigger program_players_clear_claimed_at
  before update of claimed_by_user_id on public.program_players
  for each row
  when (new.claimed_by_user_id is null and new.claimed_at is not null)
  execute function public.program_players_clear_claimed_at();

-- 4. The column the release function and the SET NULL action both filter on.
--    program_players_claimed_key leads on program_id and cannot serve either.
create index if not exists program_players_claimed_by_idx
  on public.program_players (claimed_by_user_id)
  where claimed_by_user_id is not null;

-- 5. The release. No arguments: the subject is the caller, so this can only
--    ever release the account that invokes it. Called by deleteAccount() with
--    the user's own client, before the admin client deletes the login.
create or replace function public.release_my_account_from_programs()
returns table (program_id uuid, profile_id uuid, retained integer, repointed integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := (select auth.uid());
  v_class text;
  r       record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- An owner leaving would strand the program and every match kept here.
  -- Enforced in SQL so no caller can skip it; the page repeats the sentence.
  if exists (
    select 1 from public.program_members pm
     where pm.user_id = v_uid and pm.role = 'owner'
  ) then
    raise exception 'transfer ownership of your program before deleting your account'
      using errcode = '42501';
  end if;

  select u.class into v_class from public.users u where u.id = v_uid;

  -- Every program this person touches: a membership, a claimed profile, or
  -- a program-filed match. Programs in id order and a fixed statement order
  -- inside the loop, so two concurrent releases cannot lock in opposite
  -- orders.
  for r in
    select p.id as program_id,
           pp.id as profile_id,
           pm.role
      from public.programs p
      left join public.program_players pp
        on pp.program_id = p.id
       and pp.claimed_by_user_id = v_uid
       and pp.merged_into_id is null
      left join public.program_members pm
        on pm.program_id = p.id and pm.user_id = v_uid
     where pp.id is not null
        or pm.id is not null
        or exists (select 1 from public.matches m
                    where m.program_id = p.id and m.created_by = v_uid)
     order by p.id
  loop
    repointed := 0;

    -- Attribution columns only. A self-upload with no player id at all is
    -- the uploader's — the rule playerSide() already applies at read time.
    if r.profile_id is not null then
      with moved as (
        update public.matches m
           set player1_id = case
                 when m.player1_id = v_uid then r.profile_id
                 when m.player1_id is null and m.player2_id is null
                      and m.created_by = v_uid then r.profile_id
                 else m.player1_id end,
               player2_id = case when m.player2_id = v_uid then r.profile_id
                                 else m.player2_id end
         where m.program_id = r.program_id
           and (m.player1_id = v_uid or m.player2_id = v_uid
                or (m.player1_id is null and m.player2_id is null
                    and m.created_by = v_uid))
         returning m.id
      )
      select count(*) into repointed from moved;
    end if;

    -- Uploader columns: the login is leaving; the rows are not.
    update public.processing_jobs pj set created_by = null
     where pj.created_by = v_uid
       and pj.match_id in (select m.id from public.matches m
                            where m.program_id = r.program_id);
    update public.match_files mf set uploaded_by = null
     where mf.uploaded_by = v_uid
       and mf.match_id in (select m.id from public.matches m
                            where m.program_id = r.program_id);
    update public.processing_usage pu set created_by = null
     where pu.created_by = v_uid
       and pu.account_type = 'program' and pu.account_id = r.program_id;
    with kept as (
      update public.matches m set created_by = null
       where m.program_id = r.program_id and m.created_by = v_uid
       returning m.id
    )
    select count(*) into retained from kept;

    -- The profile becomes coach-managed. class_year is filled only where the
    -- coach never recorded one; the login email is never written here.
    if r.profile_id is not null then
      update public.program_players pp
         set claimed_by_user_id = null,
             claimed_at = null,
             class_year = coalesce(pp.class_year, v_class),
             updated_at = now()
       where pp.id = r.profile_id;
    end if;

    delete from public.program_members pm
     where pm.program_id = r.program_id and pm.user_id = v_uid;

    -- actor_user_id is nulled by the FK when the login goes moments later;
    -- details.former_user_id is the durable reference.
    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (r.program_id, v_uid, 'member.account_deleted', r.profile_id,
       jsonb_build_object(
         'former_user_id', v_uid,
         'role', r.role,
         'matches_retained', retained,
         'matches_repointed', repointed));

    program_id := r.program_id;
    profile_id := r.profile_id;
    return next;
  end loop;
end;
$$;

comment on function public.release_my_account_from_programs() is
  'Account deletion, program side: re-points the caller''s self-uploads to their roster '
  'profile, clears uploader columns on program-filed rows, un-claims the profile, drops '
  'memberships, audits. Idempotent. Refuses owners (42501).';

revoke execute on function public.release_my_account_from_programs() from public, anon;
grant  execute on function public.release_my_account_from_programs() to authenticated;
