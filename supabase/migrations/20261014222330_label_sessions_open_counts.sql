-- What the console last counted open on a session, amber (can move the score)
-- and grey (about the data), so Admin › Labels can show the work left without
-- rebuilding every session's marks from its raw results file. A cache the
-- console writes when its own numbers change; null until a session is opened.
alter table public.label_sessions
  add column open_counts jsonb,
  add column open_counts_at timestamptz,
  add constraint label_sessions_open_counts_shape check (
    open_counts is null
    or (
      jsonb_typeof(open_counts) = 'object'
      and jsonb_typeof(open_counts -> 'amber') = 'number'
      and jsonb_typeof(open_counts -> 'grey') = 'number'
      and (open_counts ->> 'amber')::numeric >= 0
      and (open_counts ->> 'grey')::numeric >= 0
    )
  );
