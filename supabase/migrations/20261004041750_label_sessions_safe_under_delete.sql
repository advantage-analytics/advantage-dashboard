-- Two corrections to 20261004035856_label_sessions_block_match_delete.
--
-- 1. A label session could still be created AFTER a match's purge claim was
--    taken: the claim checks label_sessions once, then storage is removed, and
--    a session inserted in between made the final matches delete fail on the
--    RESTRICT key with the files already gone. Every other admin-console table
--    refuses a row for a match whose deletion is in progress through
--    admin_uploads_private.reject_purging_match(); label_sessions now does too.
--
-- 2. ON DELETE RESTRICT on job_id could strand an account deletion. A job is
--    deleted on its own, without its match, when its creator deletes their
--    account and the match belongs to a program that keeps it. That delete is
--    best-effort and its failure is ignored, after which the auth delete fails
--    with the user's personal data already removed. The labels do not need the
--    job row: each label shot carries its own frozen vendor stroke, and the
--    session keeps match_id and results_object_key. So the job link is cleared
--    instead of blocking, and the labels stay.
--
-- match_id stays ON DELETE RESTRICT: a match delete is refused up front by the
-- purge claim, before anything is touched.

create trigger reject_purging_match
  before insert or update of match_id on public.label_sessions
  for each row execute function admin_uploads_private.reject_purging_match();

alter table public.label_sessions alter column job_id drop not null;

alter table public.label_sessions
  drop constraint label_sessions_job_id_fkey,
  add constraint label_sessions_job_id_fkey
    foreign key (job_id) references public.processing_jobs(id) on delete set null;
