-- Record where each program_contacts row came from, so the seed's prune pass
-- can tell a scraped address it is allowed to retire from one an admin typed
-- in by hand. Applied live 2026-09-26 as version 20260926173824.
--
-- Two writers exist:
--
--   * `scripts/seed-programs.ts` — upserts the scraped staff CSV. Always sets
--     `email_domain` / `registrable_domain`; `source_url` is whatever the CSV
--     had, which for 88 rows was nothing.
--   * `inviteToClaim` in `src/lib/services/programs/admin-program-actions.ts`
--     — the admin console's "start the pilot" switch. Writes neither domain
--     column, no `source_url`, `role = 'Head coach'`, `is_freemail = false`.
--
-- No column default, on purpose: a writer that forgets to say where a row came
-- from should fail loudly rather than be silently filed as one or the other.

alter table public.program_contacts
  add column if not exists source text;

alter table public.program_contacts
  drop constraint if exists program_contacts_source_check;

alter table public.program_contacts
  add constraint program_contacts_source_check
  check (source in ('scrape', 'admin'));

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Admin rows first. The predicate is the shape `inviteToClaim` leaves behind
-- and the seed cannot: no `source_url`, no `email_domain`, and created after
-- the admin console shipped (2026-09-14; the seed ran once, on 2026-08-17).
--
-- Verified against live on 2026-09-26 before applying, read-only:
--
--   total rows                                                       3,117
--   this predicate (source_url null, email_domain null, > 2026-09-01)     0
--   cross-check: created_at::date <> '2026-08-17'                        0
--   cross-check: email_domain is null                                    0
--   for reference: source_url is null                                   88
--   min / max created_at   2026-08-17 07:43:27 / 2026-08-17 07:43:28 UTC
--
-- All three checks agree on zero — nobody has flipped the pilot switch yet.
-- The 88 null-`source_url` rows all carry an `email_domain` and sit inside
-- the seed's two-second window, so they are scrape rows whose CSV line had
-- no URL, not admin rows; that is why `source_url` alone is not the
-- discriminator. The update is kept so the migration is honest on a database
-- where the switch HAS been used.

update public.program_contacts
   set source = 'admin'
 where source is null
   and source_url is null
   and email_domain is null
   and created_at > '2026-09-01';

-- Everything the seed wrote.
update public.program_contacts
   set source = 'scrape'
 where source is null;

alter table public.program_contacts
  alter column source set not null;

-- RLS: unchanged. This table has RLS enabled with deliberately no policies and
-- all grants revoked (20260817074012, 20260818041110); a new column needs no
-- policy work.

comment on column public.program_contacts.source is
  'scrape = written by scripts/seed-programs.ts from the staff CSV; admin = typed into the admin console by inviteToClaim. Only source = ''scrape'' rows may be deleted by the seed''s prune pass — an admin''s hand-entered pilot contact must survive a re-seed.';
