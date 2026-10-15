-- The labelling console's undo: a journal of every label row a labeller's
-- action changed, and the function that rewinds the newest action.
--
-- Each console write reaches PostgREST carrying two headers the server
-- actions set (src/lib/supabase/op-context.ts): `x-label-op`, one uuid per
-- action, and `x-label-action`, its name. The row triggers below copy the row
-- as it was BEFORE the write into `label_row_history` under that op id. A
-- write with no header — seeding, a backfill script, SQL by hand — is not a
-- labeller's action and is never journaled, so Undo can never take it back.
--
-- `undo_label_op` replays the newest op's rows newest-first: an inserted row
-- is deleted, an updated row gets its old image back, a deleted row is
-- re-inserted. That walks the tables back through the same states the action
-- took them through, so the foreign key from a stroke to its point holds at
-- every step.

create table public.label_row_history (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.label_sessions (id) on delete cascade,
  op_id uuid not null,
  action text not null,
  tbl text not null check (tbl in ('label_points', 'label_shots')),
  op text not null check (op in ('I', 'U', 'D')),
  row_id uuid not null,
  -- The row before the write; null for an insert.
  old jsonb,
  created_at timestamptz not null default now()
);

create index label_row_history_session_idx
  on public.label_row_history (session_id, id desc);

-- Service role only: no policy, and no grant to the API roles.
alter table public.label_row_history enable row level security;
revoke all on public.label_row_history from anon, authenticated;

create function public.label_row_history_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_headers json;
  v_op text;
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

  insert into public.label_row_history
    (session_id, op_id, action, tbl, op, row_id, old)
  values (
    case when tg_op = 'INSERT' then new.session_id else old.session_id end,
    v_op::uuid,
    left(coalesce(nullif(v_headers ->> 'x-label-action', ''), 'Edit'), 80),
    tg_table_name,
    left(tg_op, 1),
    case when tg_op = 'INSERT' then new.id else old.id end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );
  return null;
end;
$function$;

create trigger label_points_history
  after insert or update or delete on public.label_points
  for each row execute function public.label_row_history_capture();

create trigger label_shots_history
  after insert or update or delete on public.label_shots
  for each row execute function public.label_row_history_capture();

-- Rewind the newest journaled action of a session. Answers
-- `{ undone, remaining }`: the action's name (null when there was nothing to
-- undo) and how many actions are still on the journal.
create function public.undo_label_op(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_op uuid;
  v_action text;
  v_cols text;
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
    return jsonb_build_object('undone', null, 'remaining', 0);
  end if;

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
    )
  );
end;
$function$;

-- The console calls this through a server action on the service role, after
-- its own admin check. Nobody signed in calls it directly.
revoke all on function public.undo_label_op(uuid) from public, anon, authenticated;
revoke all on function public.label_row_history_capture() from public, anon, authenticated;
grant execute on function public.undo_label_op(uuid) to service_role;
