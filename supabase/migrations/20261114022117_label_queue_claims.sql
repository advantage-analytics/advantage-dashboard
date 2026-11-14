-- The labeller queue: a labeller takes an open analyst session for themself,
-- holds one at a time, and loses it after 48 hours without work.
--
--   claimed_at         when a labeller took the session through
--                      claim_label_session. Null on a session an admin
--                      assigned, which is what keeps those out of the
--                      stale-claim release below.
--   start_open_counts  the first open_counts the console ever saved for the
--                      session: its count on mount, before any work. The
--                      board reads progress as start minus what is open now.
--                      A session opened before this migration already holds
--                      open_counts, so it never gets a start.

alter table public.label_sessions
  add column claimed_at timestamptz,
  add column start_open_counts jsonb,
  add constraint label_sessions_start_open_counts_shape check (
    start_open_counts is null
    or (
      jsonb_typeof(start_open_counts) = 'object'
      and jsonb_typeof(start_open_counts -> 'amber') = 'number'
      and jsonb_typeof(start_open_counts -> 'grey') = 'number'
      and (start_open_counts ->> 'amber')::numeric >= 0
      and (start_open_counts ->> 'grey')::numeric >= 0
      and (start_open_counts ->> 'amber')::numeric = trunc((start_open_counts ->> 'amber')::numeric)
      and (start_open_counts ->> 'grey')::numeric = trunc((start_open_counts ->> 'grey')::numeric)
    )
  );

-- "Is this labeller already holding one?" and the board's per-labeller rows:
-- only open analyst sessions, so the index stays a handful of rows.
create index label_sessions_open_analyst_assigned_to
  on public.label_sessions (assigned_to)
  where status = 'labelling' and kind = 'analyst';

-- ── Starting flag count ─────────────────────────────────────────────────────
-- Copies the first open_counts into start_open_counts, once. Fires only when
-- an update names open_counts, and acts only on the null-to-value step.

create or replace function public.label_sessions_record_start_open_counts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.open_counts is null
     and old.start_open_counts is null
     and new.open_counts is not null then
    new.start_open_counts := new.open_counts;
  end if;
  return new;
end;
$$;

revoke execute on function public.label_sessions_record_start_open_counts() from public, anon, authenticated;

create trigger label_sessions_record_start_open_counts
  before update of open_counts on public.label_sessions
  for each row execute function public.label_sessions_record_start_open_counts();

-- ── Claim ───────────────────────────────────────────────────────────────────
-- One labeller takes one unassigned analyst session. The lock on the
-- labeller's own users row makes two claims by the same person run one after
-- the other, so the "already holding one" check cannot be raced; the single
-- update makes two people's claims on the same session settle on one winner.
--
-- Answers 'not_labeller', 'holding', 'taken' or 'claimed'.

create or replace function public.claim_label_session(p_session_id uuid, p_user_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  labeller boolean;
begin
  select u.is_labeller into labeller
    from public.users u
   where u.id = p_user_id
     for update;

  if labeller is not true then
    return 'not_labeller';
  end if;

  if exists (
    select 1
      from public.label_sessions s
     where s.assigned_to = p_user_id
       and s.status = 'labelling'
       and s.kind = 'analyst'
       and s.id <> p_session_id
  ) then
    return 'holding';
  end if;

  update public.label_sessions
     set assigned_to = p_user_id,
         assigned_at = now(),
         claimed_at = now()
   where id = p_session_id
     and status = 'labelling'
     and kind = 'analyst'
     and assigned_to is null;

  if not found then
    return 'taken';
  end if;

  return 'claimed';
end;
$$;

revoke execute on function public.claim_label_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_label_session(uuid, uuid) to service_role;

-- ── Stale-claim release ─────────────────────────────────────────────────────
-- Hands a claimed session back to the queue when its claimer has done no work
-- on it for p_idle. Work is label_work_beats (a key or pointer press in a
-- visible tab), never label_sessions.updated_at, which every update bumps,
-- the console's open_counts save on mount included. Only the claimer's own
-- beats count, so an admin reviewing the session does not keep the claim
-- alive. A session with no beats yet is measured from the claim itself.
--
-- A session under a fresh publish lease is left for the next run:
-- label_sessions_refuse_while_publishing would raise on it and take the
-- whole sweep down with it.
--
-- Answers how many sessions it released.

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

-- Hourly, at seven past. The job runs as the role that applies this
-- migration, which owns the function and so keeps execute through the revoke.
select cron.schedule('release-stale-label-claims', '7 * * * *', $$select public.release_stale_label_claims(interval '48 hours')$$);
