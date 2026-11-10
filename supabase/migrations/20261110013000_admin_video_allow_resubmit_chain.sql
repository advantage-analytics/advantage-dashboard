-- A match the admin console admitted a video for (`admin_video_attempts`) may
-- hold no other analysis — that is what stops a second, competing upload being
-- billed against the same reservation. But the check could not tell a
-- competing upload from a RESUBMISSION of the reserved job itself, so every
-- `resubmitJob()` child on such a match was refused ('analysis-already-
-- submitted'): the admin reprocess route (2026-11-10, matches 75b5e12e and
-- 282e6e66), and the auto/manual retry of a failed console upload alike.
--
-- A job whose `resubmitted_from_job_id` chain leads back to the reserved job
-- is the same analysis run again, not a competitor, so it is let through. The
-- exception reads the row's own lineage, so it also covers that child's later
-- status writes (this trigger fires on UPDATE OF status too) — a one-off
-- bypass at insert time would have left the child unable to move past queued.
--
-- Unchanged: a spreadsheet attempt (`admin_file_attempts`) still excludes
-- every job; a job with no lineage to the reserved one is still refused; and
-- `match_files` rows on a video-reserved match are still refused. The other
-- console functions key on the attempt's own `job_id`, so a child does not
-- inherit the reserved job's protections.

create or replace function admin_uploads_private.prevent_competing_file_analysis()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_reserved uuid;
  v_ancestor uuid;
  v_depth integer := 0;
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

  -- Walk up the resubmission chain on this match. Bounded: a chain is one
  -- link per retry, and the bound also ends any cycle.
  v_ancestor := new.resubmitted_from_job_id;
  while v_ancestor is not null and v_depth<32 loop
    if v_ancestor=v_reserved then
      return new;
    end if;
    select j.resubmitted_from_job_id into v_ancestor
      from public.processing_jobs j
     where j.id=v_ancestor and j.match_id=new.match_id;
    if not found then
      v_ancestor := null;
    end if;
    v_depth := v_depth+1;
  end loop;

  raise exception 'analysis-already-submitted' using errcode='22023';
end;
$$;
