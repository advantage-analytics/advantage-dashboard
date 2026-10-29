-- admin_begin_upload_item: a personal target (program null) inserts nothing.
--
-- `admin_submit_match_video` creates a player's personal submission itself,
-- with its owner and billing, before calling this. Postgres checks
-- `admin_upload_submissions_target_check` on the proposed row BEFORE
-- `on conflict do nothing` arbitrates, so this function's own insert of a
-- (program null, no owner) row fails the check even though the row exists.
-- With no program the submission must already exist: the `strict` select
-- below refuses one that does not. Signature, grants and every program path
-- unchanged.
create or replace function public.admin_begin_upload_item(p_operation_id uuid, p_item_id uuid, p_program_id uuid, p_submission_kind text, p_item_kind text, p_request jsonb)
 returns admin_upload_submission_items
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  submission public.admin_upload_submissions;
  item public.admin_upload_submission_items;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  if p_program_id is not null then
    insert into public.admin_upload_submissions(operation_id, actor_user_id, program_id, kind)
      values (p_operation_id, auth.uid(), p_program_id, p_submission_kind)
      on conflict (operation_id) do nothing;
  end if;
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
$function$;
