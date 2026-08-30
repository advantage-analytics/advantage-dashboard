-- A forfeit records WHICH side forfeited a line — ours or theirs — because the
-- two award the point to opposite teams. Existing rows default to not forfeited.
--
-- A forfeited line must never carry a match. The check below constrains the
-- column's domain; `setForfeit` refuses an entry that already has a match, and
-- `recordResult` refuses an entry whose forfeit is set.

alter table program_event_entries
  add column forfeit text default null
  check (forfeit is null or forfeit in ('ours', 'theirs'));

comment on column program_event_entries.forfeit is
  'Which side forfeited this line. ours = our player forfeited (point to them); '
  'theirs = opponent forfeited (point to us). null = normal line.';
