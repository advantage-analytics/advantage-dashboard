-- A CLAIMANT-FACING message, kept strictly apart from the internal review note.
--
-- Finding: the decline email used to carry `review_notes` verbatim under
-- "Reviewer's note", but the admin field that feeds `review_notes` is labelled
-- "kept on the claim" — internal commentary an admin never meant a declined
-- claimant to read was being shipped to that claimant.
--
-- The fix is structural, not a filter: two distinct columns with two distinct
-- audiences. `review_notes` stays internal and is NEVER emailed. This column is
-- the only note that may reach the claimant, written from a review-row field
-- that discloses "they'll see this". Persisted (rather than passed straight to
-- the mail) so what was actually communicated is auditable and survives a
-- failed send. Inherits program_claims' RLS: the existing SELECT policy already
-- lets a claimant read their own claim row, which is exactly the audience of
-- this text — no new policy, no widened exposure.
alter table public.program_claims
  add column if not exists claimant_message text;

comment on column public.program_claims.claimant_message is
  'Admin-authored, CLAIMANT-FACING message shown/emailed to the claimant when a claim is declined (reject/hand-back). The ONLY note that may be emailed to the claimant. Distinct from review_notes, which is internal and must never leave the review queue.';
