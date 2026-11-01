-- label_shots.vendor.pred_player_id holds a player's name, so label_archive was
-- keeping names it says it does not. The archive now records the seat instead,
-- in the vocabulary the labels already use. A value that is neither player nor
-- the vendor's 'None' becomes null rather than being kept. Nothing had been
-- archived, so there is no backfill. A labeller's free-text note is kept as
-- written.
--
-- A deleted match also stamps its submission item, and the CHECK loosened by
-- the previous migration now requires that stamp, so no other writer can leave
-- a succeeded match item unlinked.

alter table public.admin_upload_submission_items
  drop constraint admin_upload_submission_items_check1,
  add constraint admin_upload_submission_items_check1 check (
    status <> 'succeeded'
    or (kind = 'outcome' and outcome_id is not null and match_id is null)
    or (
      kind <> 'outcome'
      and outcome_id is null
      and (match_id is not null or result ? 'match_deleted_at')
    )
  );

create or replace function public.matches_archive_labels_and_console()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.match_storage_purge_claims where match_id = old.id
  ) then
    return old;
  end if;

  insert into public.label_archive (match_id, session_id, match_context, session, points, shots)
  select
    old.id,
    s.id,
    jsonb_build_object(
      'score', old.score,
      'format', old.format,
      'match_type', old.match_type,
      'court_type', old.court_type
    ),
    to_jsonb(s),
    coalesce((
      select jsonb_agg(to_jsonb(p) order by p.point_index)
      from public.label_points p where p.session_id = s.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        case
          when x.vendor ? 'pred_player_id' then
            to_jsonb(x) || jsonb_build_object(
              'vendor',
              x.vendor || jsonb_build_object(
                'pred_player_id',
                case x.vendor ->> 'pred_player_id'
                  when old.player1_name then 'p1'
                  when old.player2_name then 'p2'
                  when 'None' then 'None'
                end
              )
            )
          else to_jsonb(x)
        end
        order by x.created_at, x.id
      )
      from public.label_shots x where x.session_id = s.id
    ), '[]'::jsonb)
  from public.label_sessions s
  where s.match_id = old.id and s.kind = 'analyst';

  delete from public.label_sessions
   where match_id = old.id and kind = 'analyst';

  -- A target would hold its schedule slot against any later result.
  delete from public.admin_schedule_result_targets t
   using public.admin_upload_submission_items i
   where i.operation_id = t.operation_id
     and i.item_id = t.item_id
     and i.match_id = old.id;
  delete from public.admin_analysis_reservations where match_id = old.id;
  delete from public.admin_file_attempts where match_id = old.id;
  -- Before the job cascade: guard_video_job refuses a job with an attempt.
  delete from public.admin_video_attempts where match_id = old.id;
  update public.admin_upload_submission_items
     set match_id = null,
         processing_job_id = null,
         match_file_id = null,
         result = result || jsonb_build_object('match_deleted_at', now()),
         updated_at = now()
   where match_id = old.id;

  return old;
end;
$function$;
