-- Publish on submit, then the admin's check. A labeller's submit publishes the
-- session; an admin then checks it, or sends it back with a note.
--
-- label_sessions.status gets no new value. The states are read off the row:
--
--   published, to check   status = 'complete' and checked_at is null
--   sent back             status = 'labelling' and sent_back_at is not null
--
--   published_at    the first time the session reached 'complete'. Never moves
--                   again, so pay can be counted from it. completed_at stays
--                   the last publish.
--   checked_at      when an admin passed the published session. checked_by is
--                   who. Whatever reopens a session has to clear both.
--   sent_back_at    when an admin returned it to its labeller. sent_back_by is
--                   who, sent_back_note is what they asked for. All three are
--                   cleared when the session is published again.
--
-- Practice sessions never reach 'complete' and carry none of these.

alter table public.label_sessions
  add column published_at timestamptz,
  add column checked_at timestamptz,
  add column checked_by uuid references public.users(id) on delete set null,
  add column sent_back_at timestamptz,
  add column sent_back_by uuid references public.users(id) on delete set null,
  add column sent_back_note text,
  add constraint label_sessions_checked_needs_complete check (
    checked_at is null or status = 'complete'
  ),
  add constraint label_sessions_sent_back_open check (
    sent_back_at is null or status = 'labelling'
  ),
  add constraint label_sessions_sent_back_note check (
    (sent_back_at is null) = (sent_back_note is null)
    and (
      sent_back_note is null
      or char_length(btrim(sent_back_note)) between 1 and 2000
    )
  ),
  add constraint label_sessions_practice_never_published check (
    kind <> 'practice'
    or (published_at is null and checked_at is null and sent_back_at is null)
  );

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every session completed before this migration was published and checked in
-- one step by an admin, so both stamps take completed_at. checked_by is the
-- admin who verified the match; matches.verified_by points at auth.users, so
-- it is carried over only where that person still has a public.users row.
--
-- Runs before the trigger below exists and does not name status, so nothing
-- here is stamped twice. A session under a fresh publish lease makes
-- label_sessions_refuse_while_publishing raise: run the migration again once
-- the publish has finished.

update public.label_sessions s
   set published_at = s.completed_at,
       checked_at = s.completed_at,
       checked_by = (
         select u.id
           from public.matches m
           join public.users u on u.id = m.verified_by
          where m.id = s.match_id
            and m.verified
       )
 where s.status = 'complete'
   and s.kind <> 'practice'
   and s.published_at is null;

-- ── Publish stamp ───────────────────────────────────────────────────────────
-- Acts only on the move to 'complete'. The first publish sets published_at; a
-- later one keeps it. A publish answers whatever the session was sent back
-- for, so the send-back is cleared. checked_at is left alone: only an admin's
-- check writes it.

create or replace function public.label_sessions_stamp_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    new.published_at := coalesce(new.published_at, now());
    new.sent_back_at := null;
    new.sent_back_by := null;
    new.sent_back_note := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.label_sessions_stamp_published() from public, anon, authenticated;

create or replace trigger label_sessions_stamp_published
  before update of status on public.label_sessions
  for each row execute function public.label_sessions_stamp_published();

-- ── verify_match ────────────────────────────────────────────────────────────
-- The live body, with one change: the actor may be an admin or a labeller,
-- because a labeller's submit now publishes and verifies the match.

create or replace function public.verify_match(p_match_id uuid, p_actor uuid, p_errors_judged boolean default false)
returns timestamp with time zone
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not exists (
    select 1 from public.users u where u.id = p_actor and (u.is_admin or u.is_labeller)
  ) then
    raise exception 'Only an Advantage admin can verify a match'
      using errcode = '42501';
  end if;
  update public.matches
     set verified = true,
         verified_at = now(),
         verified_by = p_actor,
         errors_judged_at = case
           when p_errors_judged then now()
           else errors_judged_at
         end
   where id = p_match_id
  returning verified_at into v_at;
  if v_at is null then
    raise exception 'Match % not found', p_match_id using errcode = 'P0002';
  end if;
  -- The stat row was computed before the stamp existed (apply-session.ts
  -- recompute); count forced errors now that the match is judged.
  if p_errors_judged then
    perform public.calculate_match_stats(p_match_id);
  end if;
  return v_at;
end;
$$;

revoke execute on function public.verify_match(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.verify_match(uuid, uuid, boolean) to service_role;

-- ── Stale-claim release ─────────────────────────────────────────────────────
-- As 20261114060750_label_queue_claims.sql wrote it, plus one condition: a
-- session that has ever been published is never released. An open session
-- with published_at set was sent back, and the note is addressed to its
-- labeller.

create or replace function public.release_stale_label_claims(p_idle interval)
returns integer
language sql
set search_path = ''
as $$
  with released as (
    update public.label_sessions s
       set assigned_to = null,
           assigned_at = null,
           claimed_at = null
     where s.status = 'labelling'
       and s.kind = 'analyst'
       and s.claimed_at is not null
       and s.published_at is null
       and (s.publishing_since is null or s.publishing_since <= now() - interval '5 minutes')
       and greatest(
             s.claimed_at,
             (
               select max(b.minute)
                 from public.label_work_beats b
                where b.session_id = s.id
                  and b.user_id = s.assigned_to
             )
           ) < now() - p_idle
    returning 1
  )
  select count(*)::integer from released;
$$;

revoke execute on function public.release_stale_label_claims(interval) from public, anon, authenticated;
grant execute on function public.release_stale_label_claims(interval) to service_role;
