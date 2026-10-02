-- Webhook deliveries now go with the match, instead of outliving it.
-- Applied live 2026-08-09 as version 20260809012747.
--
-- Was ON DELETE SET NULL: deleting a match cascaded away its processing_jobs
-- row and left the delivery behind with job_id = NULL. Three problems with
-- that, in descending order of how much they matter:
--
--   1. `raw_body` is the vendor's full payload for that match, and on a
--      completion it contains `sas_url` — a working credential to the results
--      for about a week. A user deleting a match reasonably means "remove
--      this", and retaining the vendor's copy plus a live URL to it was a
--      retention decision nobody actually made.
--   2. An orphaned row has no owner. Nothing can attribute it, so nothing can
--      clean it and no user can ask for it to go.
--   3. `results_object_key` pointed at a Supabase Storage object the delete
--      path now removes, so the row referenced something already gone.
--
-- What this costs: raw bodies are forensic evidence, and during a pilot where
-- the payload shape is unconfirmed they are how we learn the real field names
-- and the signature header. That is why webhook-payload.ts reads through
-- candidate key lists rather than fixed ones.
--
-- The loss is bounded, though, and self-limiting in the right direction:
--
--   * Deliveries for every match that still exists are untouched.
--   * UNMATCHED deliveries are untouched too. One whose external_job_id
--     matched no job already has job_id = NULL and no parent to cascade from,
--     so it survives — and those are exactly the "something is wrong" cases
--     worth keeping, the ones that reveal a mis-named field.
--
-- So we lose evidence only for matches a user actively chose to delete, and we
-- keep every delivery that is actually telling us something.

alter table public.splitstep_webhook_deliveries
  drop constraint if exists splitstep_webhook_deliveries_job_id_fkey;

alter table public.splitstep_webhook_deliveries
  add constraint splitstep_webhook_deliveries_job_id_fkey
  foreign key (job_id) references public.processing_jobs(id) on delete cascade;

comment on column public.splitstep_webhook_deliveries.job_id is
  'Job this delivery was matched to. NULL means unmatched — the vendor sent an external_job_id no row carried — and those rows are deliberately kept for forensics. Matched rows cascade away with the job, and so with the match.';
