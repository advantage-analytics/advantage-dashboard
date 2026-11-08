-- What kind of shot a labelled stroke was, beyond its stroke and spin: an
-- approach, a lob, a drop shot, a passing shot. The labeller's answer key for
-- the report's net-game rules (match-filters/net-game.ts), which read these
-- from ball and player tracking and have not been checked against labels yet.
--
-- A list, because one shot can be two things (a lob that passes the net
-- player). Empty, never null: no tag is the common case.
--
-- Deliberately NOT a value field (edit.ts `LABEL_SHOT_VALUE_FIELDS`): the
-- vendor never reads a tag, so a tag must not move a shot from `kept` to
-- `edited` — that status measures the vendor's own reading. It sits beside
-- `unclear` instead, and is not in the frozen `seed`. When rule guesses
-- arrive they get their own baseline, so an untouched guess never reads as a
-- confirmed one.
--
-- The row-history journal stores `to_jsonb(old)` and `undo_label_op`
-- restores every non-id column, so Undo and Redo cover tags with no change.
-- Additive only; label_shots keeps its service-role-writes-only policy, so no
-- grant changes.
alter table public.label_shots
  add column tags text[] not null default '{}'
    check (tags <@ array['approach', 'lob', 'drop_shot', 'passing']::text[]);

comment on column public.label_shots.tags is
  'The labeller''s shot kinds: approach, lob, drop_shot, passing. Not a value field: it never moves the kept/edited status and is not in seed.';
