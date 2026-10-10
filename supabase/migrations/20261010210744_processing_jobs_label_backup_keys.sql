-- The storage keys of the hand-labelled publish backups taken for this job's
-- match (labels/apply-session.ts): `label-backups/{match}/{session}/{stamp}.json`
-- in `match-results`. Recorded so the match purge removes them from a fixed
-- list, as it does every other key on this row, and never by listing a
-- prefix. The purge accepts only keys under this row's own match.
alter table public.processing_jobs
  add column label_backup_keys text[] not null default '{}';
