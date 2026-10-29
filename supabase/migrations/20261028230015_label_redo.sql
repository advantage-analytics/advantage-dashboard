-- The labelling console's redo (⌘⇧Z): what an undo took back, kept so it can
-- be put back.
--
-- `undo_label_op` used to rewind the newest action and forget it. Now, before
-- the rewind, it copies every row the action touched AS IT STANDS — the row
-- after the action, or null where the action removed it — into
-- `label_redo_history` under the action's op id. `redo_label_op` takes the
-- newest of those back: rows the action left behind are written back (points
-- before strokes, so a stroke's point exists), then rows it removed are
-- deleted (strokes before points).
--
-- A redo's writes go through the journal like any action — the server action
-- calls it with an `x-label-op` header — so ⌘Z undoes a redo. It is filed under
-- the redone action's own name (`app.label_redo_action`), so the console says
-- "Undid Combine points", not "Undid Redo".
--
-- Any other journaled write clears the session's redo stack: a new change
-- after an undo makes the undone branch unreachable, as in every editor. The
-- redo's own writes set `app.label_redo` so they do not clear it.

create table public.label_redo_history (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.label_sessions (id) on delete cascade,
  op_id uuid not null,
  action text not null,
  tbl text not null check (tbl in ('label_points', 'label_shots')),
  row_id uuid not null,
  -- The order the action first touched this row in (label_row_history.id).
  seq bigint not null,
  -- The row as the action left it; null when the action removed it.
  new jsonb,
  created_at timestamptz not null default now()
);

create index label_redo_history_session_idx
  on public.label_redo_history (session_id, id desc);

-- Service role only: no policy, and no grant to the API roles.
alter table public.label_redo_history enable row level security;
revoke all on public.label_redo_history from anon, authenticated;

-- ── Capture: a new change clears the redo stack ─────────────────────────────

create or replace function public.label_row_history_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_headers json;
  v_op text;
  v_session uuid;
begin
  -- The undo's own writes are not history.
  if current_setting('app.label_undo', true) = 'on' then
    return null;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_op := v_headers ->> 'x-label-op';
  if v_op is null
     or v_op !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  -- An update that changed nothing but its timestamp is not a step back.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;

  v_session := case when tg_op = 'INSERT' then new.session_id else old.session_id end;

  -- A labeller's new change ends the redo branch; a redo's own writes do not.
  if coalesce(current_setting('app.label_redo', true), '') <> 'on' then
    delete from public.label_redo_history where session_id = v_session;
  end if;

  insert into public.label_row_history
    (session_id, op_id, action, tbl, op, row_id, old)
  values (
    v_session,
    v_op::uuid,
    left(
      coalesce(
        nullif(current_setting('app.label_redo_action', true), ''),
        nullif(v_headers ->> 'x-label-action', ''),
        'Edit'
      ),
      80
    ),
    tg_table_name,
    left(tg_op, 1),
    case when tg_op = 'INSERT' then new.id else old.id end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );
  return null;
end;
$function$;

-- ── Undo: keep the after-images for redo ────────────────────────────────────

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
      'redoable', (
        select count(distinct d.op_id)
          from public.label_redo_history d
         where d.session_id = p_session_id
      ),
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

  -- Each touched row as the action left it, for redo: before the rewind.
  insert into public.label_redo_history
    (session_id, op_id, action, tbl, row_id, seq, new)
  select
    p_session_id,
    v_op,
    v_action,
    t.tbl,
    t.row_id,
    t.seq,
    case t.tbl
      when 'label_points' then
        (select to_jsonb(lp) from public.label_points lp where lp.id = t.row_id)
      else
        (select to_jsonb(ls) from public.label_shots ls where ls.id = t.row_id)
    end
  from (
    select h.tbl, h.row_id, min(h.id) as seq
      from public.label_row_history h
     where h.session_id = p_session_id
       and h.op_id = v_op
     group by h.tbl, h.row_id
  ) t;

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
    'redoable', (
      select count(distinct d.op_id)
        from public.label_redo_history d
       where d.session_id = p_session_id
    ),
    'points', to_jsonb(v_points),
    'shots', to_jsonb(v_shots),
    'deleted_points', to_jsonb(v_deleted_points),
    'deleted_shots', to_jsonb(v_deleted_shots),
    'shot_points', to_jsonb(v_shot_points)
  );
end;
$function$;

-- ── Redo ────────────────────────────────────────────────────────────────────

create function public.redo_label_op(p_session_id uuid)
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
  v_n bigint;
  r record;
begin
  perform 1
    from public.label_sessions s
   where s.id = p_session_id
     and s.status = 'labelling'
     for update;
  if not found then
    raise exception 'This session is not open for labelling.'
      using errcode = 'P0001';
  end if;

  select d.op_id, d.action
    into v_op, v_action
    from public.label_redo_history d
   where d.session_id = p_session_id
   order by d.id desc
   limit 1;
  if v_op is null then
    return jsonb_build_object(
      'redone', null,
      'remaining', 0,
      'points', '[]'::jsonb,
      'shots', '[]'::jsonb,
      'deleted_points', '[]'::jsonb,
      'deleted_shots', '[]'::jsonb,
      'shot_points', '[]'::jsonb
    );
  end if;

  select
    coalesce(array_agg(d.row_id) filter (where d.tbl = 'label_points' and d.new is not null), '{}'),
    coalesce(array_agg(d.row_id) filter (where d.tbl = 'label_shots' and d.new is not null), '{}'),
    coalesce(array_agg(d.row_id) filter (where d.tbl = 'label_points' and d.new is null), '{}'),
    coalesce(array_agg(d.row_id) filter (where d.tbl = 'label_shots' and d.new is null), '{}')
    into v_points, v_shots, v_deleted_points, v_deleted_shots
    from public.label_redo_history d
   where d.session_id = p_session_id
     and d.op_id = v_op;

  -- Every touched shot's owner, before and after: a redone move changes both.
  select coalesce(array_agg(distinct o.point_id), '{}')
    into v_shot_points
    from (
      select s.label_point_id as point_id
        from public.label_shots s
       where s.id = any (v_shots || v_deleted_shots)
      union
      select (d.new ->> 'label_point_id')::uuid
        from public.label_redo_history d
       where d.session_id = p_session_id
         and d.op_id = v_op
         and d.tbl = 'label_shots'
         and d.new is not null
    ) o;

  -- Journaled as an action of its own under the redone action's name, without
  -- clearing the rest of the redo stack.
  perform set_config('app.label_redo', 'on', true);
  perform set_config('app.label_redo_action', v_action, true);

  -- What the action left behind, points first so every stroke's point exists.
  for r in
    select d.tbl, d.row_id, d.new
      from public.label_redo_history d
     where d.session_id = p_session_id
       and d.op_id = v_op
       and d.new is not null
     order by (d.tbl = 'label_shots'), d.seq
  loop
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
    ) using r.new, r.row_id;
    -- EXECUTE leaves FOUND alone; the row count says whether it existed.
    get diagnostics v_n = row_count;
    if v_n = 0 then
      execute format(
        'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)',
        r.tbl
      ) using r.new;
    end if;
  end loop;

  -- What the action removed, strokes first.
  for r in
    select d.tbl, d.row_id
      from public.label_redo_history d
     where d.session_id = p_session_id
       and d.op_id = v_op
       and d.new is null
     order by (d.tbl = 'label_points'), d.seq desc
  loop
    execute format('delete from public.%I where id = $1', r.tbl)
      using r.row_id;
  end loop;

  perform set_config('app.label_redo', 'off', true);
  perform set_config('app.label_redo_action', '', true);

  delete from public.label_redo_history d
   where d.session_id = p_session_id
     and d.op_id = v_op;

  return jsonb_build_object(
    'redone', v_action,
    'remaining', (
      select count(distinct d.op_id)
        from public.label_redo_history d
       where d.session_id = p_session_id
    ),
    'points', to_jsonb(v_points),
    'shots', to_jsonb(v_shots),
    'deleted_points', to_jsonb(v_deleted_points),
    'deleted_shots', to_jsonb(v_deleted_shots),
    'shot_points', to_jsonb(v_shot_points)
  );
end;
$function$;

-- Server-only, like undo_label_op: the console calls it with the service key
-- after its own admin check.
revoke all on function public.redo_label_op(uuid) from public, anon, authenticated;
grant execute on function public.redo_label_op(uuid) to service_role;

-- ── Completion clears the redo stack too ────────────────────────────────────

create or replace function public.label_row_history_prune()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.label_row_history where session_id = new.id;
  delete from public.label_redo_history where session_id = new.id;
  return null;
end;
$$;
