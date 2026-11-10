-- `preserve_video_result` (BEFORE UPDATE on public.matches) froze a
-- console-reserved match's recorded result only while the reserved job
-- (`admin_video_attempts.job_id`) was live. Since 20261110013000 a retry or
-- admin reprocess (`resubmitJob()`) can carry the attempt on as another job on
-- the same match, so once the reserved job ended a running child no longer
-- stopped the score, players, date, format, source_provider or
-- analysis_method from being edited mid-analysis.
--
-- It now protects the match while ANY job on it is live, using the rule
-- `admin_reconcile_submission_item` uses since 20261110074526: status not
-- ended, or completed with `derivation_version` still null (derive-and-publish
-- is running). It looks match-wide rather than down the
-- `resubmitted_from_job_id` chain, so a retry orphaned by a deleted middle job
-- still counts. The gate is still "this match has a console video attempt";
-- the field list and the 'recorded-result-protected' refusal are unchanged.
--
-- Abandon still passes: it refuses while any other job on the match is live,
-- and fails the reserved job before it writes `analysis_method='manual'`.

create or replace function admin_uploads_private.preserve_video_result()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare field text;
begin
  if exists (select 1 from public.admin_video_attempts a where a.match_id = old.id)
    and exists (select 1 from public.processing_jobs j
        where j.match_id = old.id
          and (j.status not in ('failed', 'completed', 'derivation_failed', 'cancelled')
               or (j.status = 'completed' and j.derivation_version is null))) then
    foreach field in array array['id','created_by','program_id','event_entry_id','player1_id','player2_id','opponent_player_id','player1_name','player2_name','score','result','round','tournament_name','date','match_type','format','court_type','source_provider','analysis_method'] loop
      if to_jsonb(old)->field is distinct from to_jsonb(new)->field then raise exception 'recorded-result-protected' using errcode='22023'; end if;
    end loop;
  end if;
  return new;
end;
$function$;

revoke all on function admin_uploads_private.preserve_video_result()
  from public, anon, authenticated, service_role;
