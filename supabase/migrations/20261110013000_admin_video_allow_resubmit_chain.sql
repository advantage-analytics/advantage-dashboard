-- A match the admin console admitted a video for (`admin_video_attempts`) may
-- hold no other analysis — that is what stops a second, competing upload being
-- billed against the same reservation. But the check could not tell a
-- competing upload from a RESUBMISSION of the reserved job itself, so every
-- `resubmitJob()` child on such a match was refused ('analysis-already-
-- submitted'): the admin reprocess route (2026-11-10, matches 75b5e12e and
-- 282e6e66), and the auto/manual retry of a failed console upload alike.
--
-- "Server session" below means no client role in `request.jwt.claims`: the
-- service-role key (resubmitJob, webhooks), and sessions with no claims at all
-- (migrations, cron, the SQL editor) — the same reading
-- `match_upload_transition_guard` uses. Signed-in clients hold INSERT/UPDATE
-- on processing_jobs with `created_by` as the only check, so nothing a client
-- writes into `resubmitted_from_job_id` is evidence of anything.
--
-- What is admitted now, on a video-reserved match, besides the reserved job:
--
--   • INSERT of a job whose `resubmitted_from_job_id` chain (on this match)
--     reaches the reserved job, from a server session only.
--   • Any status write to a job already on the match, from a server session —
--     so a chain broken by a deleted middle job (`ON DELETE SET NULL`) cannot
--     strand its descendants.
--   • From a client, on a job whose lineage reaches the reserved job: setting
--     status to 'cancelled' (the athlete cancelling a retry of their own
--     console upload), and nothing else. A client may also clear the lineage
--     to null — which is what the FK does when they delete a middle job, and
--     only ever loses the exception — but never point it anywhere. The
--     trigger now fires on `resubmitted_from_job_id` too, so lineage cannot be
--     forged in a write this check never saw.
--
-- Still refused: moving any existing job onto the match (a resubmission is
-- inserted on its match, never moved there), a job with no lineage, a client
-- claiming lineage, every job on a match with a spreadsheet attempt
-- (`admin_file_attempts`), and `match_files` rows on a video-reserved match.
-- The other console functions key on the attempt's own `job_id`, so a child
-- does not inherit the reserved job's protections.

create or replace function admin_uploads_private.prevent_competing_file_analysis()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_reserved uuid;
  v_is_client boolean := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
  v_lineage boolean;
begin
  perform 1 from public.matches where id=new.match_id for update;
  if exists(select 1 from public.admin_file_attempts where match_id=new.match_id) then
    raise exception 'analysis-already-submitted' using errcode='22023';
  end if;

  select job_id into v_reserved from public.admin_video_attempts where match_id=new.match_id;
  if not found then
    return new;
  end if;
  if tg_table_name<>'processing_jobs' then
    raise exception 'analysis-already-submitted' using errcode='22023';
  end if;
  if new.id=v_reserved then
    return new;
  end if;

  if tg_op='INSERT' then
    -- A client cannot claim lineage it could have written itself.
    if v_is_client then
      raise exception 'analysis-already-submitted' using errcode='22023';
    end if;
  else
    -- A move onto the reserved match is never a resubmission.
    if old.match_id is distinct from new.match_id then
      raise exception 'analysis-already-submitted' using errcode='22023';
    end if;
    if not v_is_client then
      return new;
    end if;
    -- A client may give lineage up (to null, status untouched), never set it.
    if new.resubmitted_from_job_id is distinct from old.resubmitted_from_job_id then
      if new.resubmitted_from_job_id is null and new.status is not distinct from old.status then
        return new;
      end if;
      raise exception 'analysis-already-submitted' using errcode='22023';
    end if;
    -- And may only cancel.
    if new.status is distinct from old.status and new.status is distinct from 'cancelled' then
      raise exception 'analysis-already-submitted' using errcode='22023';
    end if;
  end if;

  -- Walk up the resubmission chain on this match. Bounded: a chain is one
  -- link per retry, and the bound also ends any cycle. On the client branch
  -- the lineage is unchanged by this write, so it is the server-written one.
  select exists(
    with recursive chain(id, depth) as (
      select new.resubmitted_from_job_id, 0
      union all
      select j.resubmitted_from_job_id, c.depth+1
        from chain c
        join public.processing_jobs j on j.id=c.id and j.match_id=new.match_id
       where c.depth<32
    )
    select 1 from chain where id=v_reserved
  ) into v_lineage;
  if v_lineage then
    return new;
  end if;

  raise exception 'analysis-already-submitted' using errcode='22023';
end;
$$;

-- Fire on lineage writes too, so a client cannot set it in an UPDATE the
-- check never sees and then write status against it.
create or replace trigger prevent_competing_admin_job
  before insert or update of match_id, status, resubmitted_from_job_id on public.processing_jobs
  for each row execute function admin_uploads_private.prevent_competing_file_analysis();
