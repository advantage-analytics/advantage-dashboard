-- A match the admin console admitted a video for (`admin_video_attempts`) may
-- hold no other analysis — that is what stops a second, competing upload being
-- billed against the same reservation. But the check could not tell a
-- competing upload from a RESUBMISSION of the reserved job itself, so every
-- `resubmitJob()` child on such a match was refused ('analysis-already-
-- submitted'): the admin reprocess route (2026-11-10, matches 75b5e12e and
-- 282e6e66), and the auto/manual retry of a failed console upload alike.
--
-- What is admitted now, on a video-reserved match, besides the reserved job:
--
--   • INSERT of a job whose `resubmitted_from_job_id` chain (on this match)
--     reaches the reserved job — but only from a server session. Signed-in
--     clients hold INSERT/UPDATE on processing_jobs with `created_by` as the
--     only check, so a lineage they could write themselves proves nothing;
--     `resubmitJob()` runs with the service role.
--   • Status writes to a job already on the match: from a server session
--     always (the webhook, the reconciler — so a chain broken by a deleted
--     middle job, `ON DELETE SET NULL`, cannot strand its descendants), and
--     from a client only where the lineage still reaches the reserved job (so
--     an athlete can still cancel a retry of their own console upload).
--
-- Still refused: moving any existing job onto the match (a resubmission is
-- inserted on its match, never moved there), a job with no lineage, a client
-- claiming lineage on insert, every job on a match with a spreadsheet attempt
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

  -- A move onto the reserved match is never a resubmission.
  if tg_op='UPDATE' then
    if old.match_id is distinct from new.match_id then
      raise exception 'analysis-already-submitted' using errcode='22023';
    end if;
    -- A status write to a job already here, from a server session.
    if not v_is_client then
      return new;
    end if;
  elsif v_is_client then
    raise exception 'analysis-already-submitted' using errcode='22023';
  end if;

  -- Walk up the resubmission chain on this match. Bounded: a chain is one
  -- link per retry, and the bound also ends any cycle.
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
