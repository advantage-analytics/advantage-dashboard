-- One labelling edit, one transaction, one round trip.
--
-- The console's structural edits (split, add point, …) used to write row by
-- row from the server action: a split late in a match made 100+ sequential
-- requests, ~160 ms each from a laptop, and a failure part-way left half an
-- edit saved. The plan stays in TypeScript (point-split.ts, point-insert.ts);
-- this applies the writes it computed, in order, all or nothing.
--
-- p_ops is a JSON array of
--   {"op":"update","table":"label_points"|"label_shots","ids":[uuid…],
--    "set":{column: value…},"expect_status":"edited"?}
--   {"op":"insert","table":"label_points"|"label_shots","values":{column: value…}}
-- Every row must belong to p_session. An update must touch every id it names
-- (and, with expect_status, only while the row still has that status) or the
-- whole edit rolls back with SQLSTATE LB409, which the server reads as "this
-- changed in another tab". Columns are checked against the table; id,
-- session_id, created_at and updated_at are never set by an update. Answers
-- the inserted rows, in order.
--
-- Undo still journals every row: the history trigger reads x-label-op from
-- request.headers, which PostgREST sets for this call as for any other.
-- Server only: the service role calls it after requireAdmin().

create or replace function public.label_apply_edit(p_session uuid, p_ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_kind text;
  v_table text;
  v_fields jsonb;
  v_keys text[];
  v_valid text[];
  v_ids uuid[];
  v_expect text;
  v_count integer;
  v_row jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_session is null or jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'label_apply_edit: a session and an array of operations are required'
      using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_kind := v_op ->> 'op';
    v_table := v_op ->> 'table';
    if v_table is null or v_table not in ('label_points', 'label_shots') then
      raise exception 'label_apply_edit: unknown table %', v_table using errcode = '22023';
    end if;
    v_fields := case v_kind when 'update' then v_op -> 'set' when 'insert' then v_op -> 'values' end;
    if jsonb_typeof(v_fields) is distinct from 'object' then
      raise exception 'label_apply_edit: % needs an object of columns', coalesce(v_kind, 'an operation')
        using errcode = '22023';
    end if;
    if v_kind = 'insert' then
      v_fields := v_fields || jsonb_build_object('session_id', p_session);
    end if;

    v_keys := array(select jsonb_object_keys(v_fields));
    v_valid := array(
      select c.column_name::text
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name = any (v_keys)
        and (v_kind = 'insert' or c.column_name not in ('id', 'session_id', 'created_at', 'updated_at'))
        and c.column_name not in ('created_at', 'updated_at')
    );
    if cardinality(v_valid) is distinct from cardinality(v_keys) or cardinality(v_keys) = 0 then
      raise exception 'label_apply_edit: % cannot set %', v_table,
        array(select k from unnest(v_keys) k where not (k = any (v_valid)))
        using errcode = '22023';
    end if;

    if v_kind = 'update' then
      v_ids := array(select (jsonb_array_elements_text(v_op -> 'ids'))::uuid);
      if cardinality(v_ids) = 0 then
        raise exception 'label_apply_edit: an update names no rows' using errcode = '22023';
      end if;
      v_expect := v_op ->> 'expect_status';
      execute format(
        'update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I, $1) r
          where t.id = any ($2) and t.session_id = $3 and ($4::text is null or t.status = $4)',
        v_table,
        (select string_agg(format('%1$I = r.%1$I', k), ', ') from unnest(v_valid) k)
      ) using v_fields, v_ids, p_session, v_expect;
      get diagnostics v_count = row_count;
      if v_count <> cardinality(v_ids) then
        raise exception 'label_apply_edit: % of % % rows were as read', v_count, cardinality(v_ids), v_table
          using errcode = 'LB409';
      end if;
    elsif v_kind = 'insert' then
      execute format(
        'insert into public.%1$I as t (%2$s) select %3$s from jsonb_populate_record(null::public.%1$I, $1) r
          returning to_jsonb(t.*)',
        v_table,
        (select string_agg(format('%I', k), ', ') from unnest(v_valid) k),
        (select string_agg(format('r.%I', k), ', ') from unnest(v_valid) k)
      ) into v_row using v_fields;
      v_out := v_out || jsonb_build_array(v_row);
    else
      raise exception 'label_apply_edit: unknown operation %', v_kind using errcode = '22023';
    end if;
  end loop;

  return v_out;
end;
$$;

revoke execute on function public.label_apply_edit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.label_apply_edit(uuid, jsonb) to service_role;
