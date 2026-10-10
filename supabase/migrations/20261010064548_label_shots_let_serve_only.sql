-- A let is a serve's result only: the database backstop behind every writer
-- (edit.ts `letResultError` guards the edit paths; this refuses the rest).
-- `result is distinct from 'let'` passes a null result and every in/out/net
-- row; the `stroke is not null and` keeps a null-stroke let from slipping
-- through, since a bare `stroke in (...)` is null-for-null and would pass.
-- `label_shots_result_check` is left as it is.
--
-- Pre-check run against the live project before this DDL, returned 0 rows:
--   select count(*) from public.label_shots
--   where result = 'let'
--     and (stroke is null or stroke not in ('first_serve', 'second_serve'));
alter table public.label_shots
  add constraint label_shots_let_serve_only
    check (
      result is distinct from 'let'
      or (stroke is not null and stroke in ('first_serve', 'second_serve'))
    );
