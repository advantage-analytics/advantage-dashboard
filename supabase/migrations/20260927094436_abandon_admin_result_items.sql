-- T24: abandon the pending items of a dual or tournament console submission,
-- and make `abandoned` the one terminal failure the apply RPCs never retry.
--
-- A dual submission prepares up to nine result items in one transaction and
-- then applies each in its own (admin_apply_dual_result); a tournament
-- submission prepares one (admin_apply_tournament_result). From the moment
-- admin_prepare_* commits, every item's admin_schedule_result_targets row
-- reserves its line (dual) or line + round (tournament):
-- guard_reserved_schedule_result refuses an ordinary coach's match or outcome
-- INSERT with `console-result-reserved` while the target's item is `pending`
-- or `succeeded`. That is the point of the design — a prepared item must win
-- over a coach typing the same score a minute later — and it is also why a
-- browser that closed between prepare and the last apply leaves the untouched
-- lines reserved for ever: the reservation has no expiry, a retry needs the
-- exact request the browser lost, and until now the way back was hand-run SQL.
--
-- `admin_abandon_result_items(p_actor_id, p_operation_id)` is the one
-- server-only path back, in one transaction:
--
--   * locks the submission `for update` (`operation-not-found` when there is
--     none; `kind-unsupported` unless kind in ('dual','tournament') — video
--     and file items have admin_reconcile_submission_item, T21);
--   * for every item still `pending`, in item_id order, takes the entry's
--     version lock — `update program_event_entries set id = id`, the same
--     lock admin_apply_* and guard_reserved_schedule_result take, so a coach's
--     write queued behind this transaction re-reads the item once it commits —
--     then sets `status = 'failed', error_code = 'abandoned',
--     updated_at = now()`;
--   * leaves `succeeded` items, and items already `failed` for any other
--     reason, untouched: their history is the truth. The
--     admin_schedule_result_targets rows stay too — they are history, and the
--     guard joins them on `i.status in ('pending','succeeded')`, so a `failed`
--     item stops reserving with no trigger change;
--   * writes one `console.submission_reconciled` audit row (T21's action)
--     recording mode `abandon`, the operation, the event and the abandoned
--     item ids. A call that finds nothing pending changes nothing and writes
--     no audit row, so a retried request is a no-op;
--   * returns `{ itemId, status, error }` for every item of the operation,
--     plus `abandonedItemIds`, `operationId`, `kind`, `programId`, `eventId`.
--
-- Any CURRENT administrator may abandon, not only the operation's actor — the
-- original actor may be gone — and the audit row names who. EXECUTE is
-- service_role only: the route supplies the verified session actor, never a
-- body field.
--
-- Terminal `abandoned`. Both apply RPCs return the saved status early for a
-- `succeeded` item and otherwise re-run the item — `failed` is retryable by
-- design, so a lost response can be resumed with the same request. Without
-- more, that same-request resume would re-apply every abandoned item and
-- re-reserve the line the coach was just given back. The two functions are
-- therefore swapped in place, via pg_get_functiondef → replace() → assert the
-- anchor was found exactly once (the 20260913032329 precedent), so the
-- early-return condition reads `item.status='succeeded' or
-- item.error_code='abandoned'`. CREATE OR REPLACE keeps each function's OID,
-- grants, SECURITY DEFINER and empty search_path; the trailing block asserts
-- all of it. Every other failure code stays retryable exactly as before.
--
-- Lock order: submission → items → entry version lock, the order both apply
-- RPCs use, so an abandon and a concurrent apply of the same operation
-- serialize on the submission row and cannot deadlock; the guard takes only
-- the entry lock and then reads items without locking them.
--
-- Live on 2026-09-27 09:33 UTC (Supabase MCP, SELECT only), the last check
-- before this file was written: 0 rows in admin_upload_submissions,
-- admin_upload_submission_items, admin_schedule_result_targets,
-- admin_dual_batches and admin_tournament_batches; 0 program_audit_log rows
-- with a console.* action; program_audit_log_action_check already accepts
-- `console.submission_reconciled` (20260927084958 is applied, migration head);
-- to_regprocedure('public.admin_abandon_result_items(uuid,uuid)') is null; and
-- the live bodies of admin_apply_dual_result and admin_apply_tournament_result
-- carry the two anchor statements below verbatim (pg_get_functiondef read
-- live, not from the repo file). Applying this reads and writes no existing
-- row. It is one-shot: `create function` and the anchor assertions fail
-- loudly on a second apply rather than hiding a divergent schema.
--
-- Applied to the live database via the Supabase MCP as
-- `abandon_admin_result_items`; this file carries the version the live
-- project recorded on apply.

create function public.admin_abandon_result_items(p_actor_id uuid, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  submission public.admin_upload_submissions;
  pending record;
  v_now timestamptz := now();
  v_abandoned uuid[] := '{}';
  v_items jsonb;
begin
  -- Any current administrator, deliberately not only the operation's actor.
  if p_actor_id is null
    or not exists (select 1 from public.users where id = p_actor_id and is_admin) then
    raise exception 'admin-required' using errcode = '42501';
  end if;

  -- Lock order shared with admin_apply_dual_result and
  -- admin_apply_tournament_result: submission → item → entry version lock.
  select * into submission from public.admin_upload_submissions
    where operation_id = p_operation_id for update;
  if not found then raise exception 'operation-not-found' using errcode = '22023'; end if;
  if submission.kind not in ('dual', 'tournament') then
    raise exception 'kind-unsupported' using errcode = '22023';
  end if;

  for pending in
    select i.item_id, t.entry_id
      from public.admin_upload_submission_items i
      left join public.admin_schedule_result_targets t
        on t.operation_id = i.operation_id and t.item_id = i.item_id
     where i.operation_id = p_operation_id and i.status = 'pending'
     order by i.item_id
       for update of i
  loop
    -- The entry's version lock: the same `update ... set id = id` the apply
    -- RPCs and guard_reserved_schedule_result take. A coach's write waiting
    -- on it re-reads this item as failed once the transaction commits.
    if pending.entry_id is not null then
      update public.program_event_entries set id = id where id = pending.entry_id;
    end if;
    update public.admin_upload_submission_items
       set status = 'failed', error_code = 'abandoned', updated_at = v_now
     where operation_id = p_operation_id and item_id = pending.item_id;
    v_abandoned := v_abandoned || pending.item_id;
  end loop;

  -- Nothing pending means nothing happened: no audit row for a no-op retry.
  if cardinality(v_abandoned) > 0 then
    insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
      values (submission.program_id, p_actor_id, 'console.submission_reconciled', submission.event_id,
        jsonb_build_object('origin', 'admin_console', 'mode', 'abandon', 'kind', submission.kind,
          'operation_id', p_operation_id, 'event_id', submission.event_id,
          'item_ids', to_jsonb(v_abandoned)));
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('itemId', i.item_id, 'status', i.status, 'error', i.error_code)
           order by i.request->>'slot', i.item_id), '[]')
    into v_items
    from public.admin_upload_submission_items i
   where i.operation_id = p_operation_id;

  return jsonb_build_object('operationId', p_operation_id, 'kind', submission.kind,
    'programId', submission.program_id, 'eventId', submission.event_id,
    'abandonedItemIds', to_jsonb(v_abandoned), 'items', v_items);
end;
$$;
revoke all on function public.admin_abandon_result_items(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_abandon_result_items(uuid, uuid)
  to service_role;

comment on function public.admin_abandon_result_items(uuid, uuid) is
  'Service-only (admin console). Any current administrator abandons every still-pending item of one dual or tournament submission in one transaction: each item is marked failed/abandoned under its entry version lock, succeeded and otherwise-failed items and the result-target rows are untouched, and one console.submission_reconciled audit row lists the abandoned item ids. abandoned is terminal: admin_apply_dual_result and admin_apply_tournament_result return without re-applying it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Terminal `abandoned` in the two apply RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- Two long functions change by one condition each. Swapped in place rather
-- than restated, and asserted, so a body that has drifted fails loudly here.

do $$
declare
  v_def text;
  v_new text;
  v_anchor text;
begin
  v_anchor := 'if item.status=''succeeded'' then return public.admin_dual_result_status(p_actor_id,p_operation_id); end if;';
  v_def := pg_get_functiondef('public.admin_apply_dual_result(uuid, uuid, uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'admin_apply_dual_result: succeeded early-return not found exactly once';
  end if;
  v_new := replace(v_def, v_anchor,
    'if item.status=''succeeded'' or item.error_code=''abandoned'' then return public.admin_dual_result_status(p_actor_id,p_operation_id); end if;');
  if v_new = v_def then
    raise exception 'admin_apply_dual_result: succeeded early-return not found';
  end if;
  execute v_new;

  v_anchor := 'if item.status=''succeeded'' then return public.admin_tournament_result_status(p_actor_id,p_operation_id); end if;';
  v_def := pg_get_functiondef('public.admin_apply_tournament_result(uuid, uuid, uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'admin_apply_tournament_result: succeeded early-return not found exactly once';
  end if;
  v_new := replace(v_def, v_anchor,
    'if item.status=''succeeded'' or item.error_code=''abandoned'' then return public.admin_tournament_result_status(p_actor_id,p_operation_id); end if;');
  if v_new = v_def then
    raise exception 'admin_apply_tournament_result: succeeded early-return not found';
  end if;
  execute v_new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fn text;
  v_def text;
  v_expected text;
begin
  -- The new function: exists, service_role-only, definer, empty search_path.
  v_fn := 'public.admin_abandon_result_items(uuid, uuid)';
  if to_regprocedure(v_fn) is null then
    raise exception '%: function is missing', v_fn;
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception '%: anon may execute it', v_fn;
  end if;
  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception '%: authenticated may execute it', v_fn;
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '%: service_role may not execute it', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.prosecdef
  ) then
    raise exception '%: must be security definer', v_fn;
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = v_fn::regprocedure
       and p.proconfig @> array['search_path=""']
  ) then
    raise exception '%: search_path is not pinned empty', v_fn;
  end if;

  -- The audit action the new function writes must already be accepted.
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.program_audit_log'::regclass
     and c.conname = 'program_audit_log_action_check';
  if v_def is null or v_def not like '%''console.submission_reconciled''%' then
    raise exception 'program_audit_log_action_check does not accept console.submission_reconciled';
  end if;

  -- The two patched apply RPCs: new condition present, security kept, grants kept.
  foreach v_fn in array array[
    'public.admin_apply_dual_result(uuid, uuid, uuid)',
    'public.admin_apply_tournament_result(uuid, uuid, uuid)'
  ] loop
    v_expected := case
      when v_fn like '%dual%' then 'if item.status=''succeeded'' or item.error_code=''abandoned'' then return public.admin_dual_result_status(p_actor_id,p_operation_id); end if;'
      else 'if item.status=''succeeded'' or item.error_code=''abandoned'' then return public.admin_tournament_result_status(p_actor_id,p_operation_id); end if;'
    end;
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position(v_expected in v_def) = 0 then
      raise exception '%: abandoned early-return is missing after the swap', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '%: anon may execute it', v_fn;
    end if;
    if has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '%: authenticated may execute it', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception '%: service_role may not execute it', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
       where p.oid = v_fn::regprocedure
         and p.prosecdef
    ) then
      raise exception '%: must be security definer', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
       where p.oid = v_fn::regprocedure
         and p.proconfig @> array['search_path=""']
    ) then
      raise exception '%: search_path is not pinned empty', v_fn;
    end if;
  end loop;
end
$$;
