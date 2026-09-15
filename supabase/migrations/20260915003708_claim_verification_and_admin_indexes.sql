-- Claim verification columns + admin console query indexes.
--
-- program_claims.verification_token_hash existed once and was dropped in
-- 20260817213512_program_requests_queue.sql because nothing read it at the
-- time. The admin claims console (this branch) needs it back, alongside the
-- rest of the verification/voucher fields and the indexes the review queue,
-- directory and usage-metering admin views scan by. No data migration is
-- needed for the re-added column: it was unused when dropped.

alter table public.program_claims
  add column if not exists verification_token_hash text,
  add column if not exists verification_sent_at timestamptz,
  add column if not exists verification_opened_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists voucher_note text;

-- Cap the admin-authored voucher note so it can't be used to stash arbitrary
-- amounts of text on a claim row.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'program_claims_voucher_note_len'
       and conrelid = 'public.program_claims'::regclass
  ) then
    alter table public.program_claims
      add constraint program_claims_voucher_note_len
      check (char_length(voucher_note) <= 500);
  end if;
end $$;

-- One live verification link per token; null (not-yet-issued / consumed)
-- tokens are excluded so they never collide.
create unique index if not exists program_claims_verification_token_hash_idx
  on public.program_claims (verification_token_hash)
  where verification_token_hash is not null;

-- Admin review queue: claims needing action, oldest first.
create index if not exists program_claims_review_queue_idx
  on public.program_claims (status, created_at)
  where status in ('pending_review', 'objected');

-- Keyset pagination for the admin claims/requests lists.
create index if not exists program_claims_created_idx
  on public.program_claims (created_at desc, id);

create index if not exists program_requests_created_idx
  on public.program_requests (created_at desc, id);

-- Program directory admin views: status filter + keyset pagination.
create index if not exists programs_status_idx
  on public.programs (status);

create index if not exists programs_directory_keyset_idx
  on public.programs (school_name, id);

-- Admin usage/billing lookups by account and month. The name
-- `processing_usage_account_month_idx` was already taken by a pre-existing,
-- narrower partial index (WHERE released = false, added for the
-- reservation-release query path) from an earlier unrelated migration.
-- Postgres's `create index if not exists` matches by name only, so reusing
-- that name here would have silently kept the old partial index in place
-- instead of creating the unconditional one this task needs — the partial
-- index is sufficient for a `... and not released` query (Postgres can prove
-- that implies released = false) but useless for a query that also needs
-- released/historical rows, which a future admin usage/billing view may.
-- So this is created under a distinct name instead, and the old
-- `processing_usage_account_month_idx` is left untouched since something
-- else may depend on its exact name.
create index if not exists processing_usage_account_month_all_idx
  on public.processing_usage (account_id, account_type, billing_month);
