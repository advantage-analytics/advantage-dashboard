-- Undo answers a diff, not every row. `undo_label_op` (label_row_history_undo)
-- rewound the newest action and answered only its name and the count left,
-- so the console's Undo (undo-session.ts) read the whole session back. The
-- journal already names every row the action touched, so the function now
-- lists them too, from the rows it rewinds before pruning them:
--
--   points          label_points rows that exist after the rewind — updated
--                   back to their old image, or re-inserted
--   shots           the same for label_shots
--   deleted_points  label_points rows the rewind deleted (the action added them)
--   deleted_shots   the same for label_shots
--   shot_points     the owning point of every touched shot: read live before
--                   the rewind (a shot it deletes still exists then) and from
--                   the journaled image (where a moved shot came from), so the
--                   console can rebuild each of those points whole
--
-- `undone` and `remaining` are unchanged for any other caller. Same signature
-- and return type, so this is a replace, not a drop: the grants carry over,
-- and are restated below anyway — service_role only.

create or replace function public.undo_label_op(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_op uuid;
  v_action text;
  v_cols text;
  v_points uuid[] := '{}';
  v_shots uuid[] := '{}';
  v_deleted_points uuid[] := '{}';
  v_deleted_shots uuid[] := '{}';
  v_shot_points uuid[] := '{}';
  r record;
begin
  -- One undo at a time per session, and none on a session that is not open.
  perform 1
    from public.label_sessions s
   where s.id = p_session_id
     and s.status = 'labelling'
     for update;
  if not found then
    raise exception 'This session is not open for labelling.'
      using errcode = 'P0001';
  end if;

  select h.op_id, h.action
    into v_op, v_action
    from public.label_row_history h
   where h.session_id = p_session_id
   order by h.id desc
   limit 1;
  if v_op is null then
    return jsonb_build_object(
      'undone', null,
      'remaining', 0,
      'points', '[]'::jsonb,
      'shots', '[]'::jsonb,
      'deleted_points', '[]'::jsonb,
      'deleted_shots', '[]'::jsonb,
      'shot_points', '[]'::jsonb
    );
  end if;

  -- The rows this action touched, by where the rewind leaves them: a row the
  -- action inserted is gone afterwards, whatever else the action did to it.
  with touched as (
    select h.tbl, h.row_id, bool_or(h.op = 'I') as gone
      from public.label_row_history h
     where h.session_id = p_session_id
       and h.op_id = v_op
     group by h.tbl, h.row_id
  )
  select
    coalesce(array_agg(t.row_id) filter (where t.tbl = 'label_points' and not t.gone), '{}'),
    coalesce(array_agg(t.row_id) filter (where t.tbl = 'label_shots' and not t.gone), '{}'),
    coalesce(array_agg(t.row_id) filter (where t.tbl = 'label_points' and t.gone), '{}'),
    coalesce(array_agg(t.row_id) filter (where t.tbl = 'label_shots' and t.gone), '{}')
    into v_points, v_shots, v_deleted_points, v_deleted_shots
    from touched t;

  -- Every touched shot's owner: where it sits now, and where its journaled
  -- image puts it back — both points change when an undo moves a stroke.
  select coalesce(array_agg(distinct o.point_id), '{}')
    into v_shot_points
    from (
      select s.label_point_id as point_id
        from public.label_shots s
       where s.id = any (v_shots || v_deleted_shots)
      union
      select (h.old ->> 'label_point_id')::uuid
        from public.label_row_history h
       where h.session_id = p_session_id
         and h.op_id = v_op
         and h.tbl = 'label_shots'
         and h.op in ('U', 'D')
         and (h.old ->> 'label_point_id') is not null
    ) o;

  perform set_config('app.label_undo', 'on', true);

  for r in
    select h.tbl, h.op, h.row_id, h.old
      from public.label_row_history h
     where h.session_id = p_session_id
       and h.op_id = v_op
     order by h.id desc
  loop
    if r.op = 'I' then
      execute format('delete from public.%I where id = $1', r.tbl)
        using r.row_id;
    elsif r.op = 'U' then
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
        into v_cols
        from pg_catalog.pg_attribute a
       where a.attrelid = format('public.%I', r.tbl)::regclass
         and a.attnum > 0
         and not a.attisdropped
         and a.attgenerated = ''
         and a.attname <> 'id';
      execute format(
        'update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where t.id = $2',
        r.tbl, v_cols
      ) using r.old, r.row_id;
    else
      execute format(
        'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)',
        r.tbl
      ) using r.old;
    end if;
  end loop;

  delete from public.label_row_history h
   where h.session_id = p_session_id
     and h.op_id = v_op;

  return jsonb_build_object(
    'undone', v_action,
    'remaining', (
      select count(distinct h.op_id)
        from public.label_row_history h
       where h.session_id = p_session_id
    ),
    'points', to_jsonb(v_points),
    'shots', to_jsonb(v_shots),
    'deleted_points', to_jsonb(v_deleted_points),
    'deleted_shots', to_jsonb(v_deleted_shots),
    'shot_points', to_jsonb(v_shot_points)
  );
end;
$function$;

-- Service role only, as before: the console's server action calls it after
-- its own admin check.
revoke all on function public.undo_label_op(uuid) from public, anon, authenticated;
grant execute on function public.undo_label_op(uuid) to service_role;
