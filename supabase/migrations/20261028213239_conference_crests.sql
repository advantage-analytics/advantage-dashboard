-- An uploadable crest per conference (Admin › Conferences).
--
-- Mirrors a program's crest: a nullable object path, drawn by `ConferenceMark`
-- when set and the initials otherwise.
--
-- Same bucket as program crests — `program-crests`, public, 512 KB, png / jpeg
-- / webp / svg, all enforced by the bucket — under a `conferences/` prefix:
-- `conferences/<conference_id>/crest-<stamp>.<ext>`. No new storage policy:
-- the bucket's client policies admit a write only under the first folder of a
-- program the caller staffs, and `conferences` is never one, so the only
-- writer is the console's service-role client after `requireAdmin()`. A
-- sibling bucket would have been a second copy of the same size and type
-- rules with nothing different to say.

alter table public.conferences
  add column if not exists crest_path text;

comment on column public.conferences.crest_path is
  'Object path of the conference crest in the program-crests bucket (conferences/<id>/…). Null = initials.';
