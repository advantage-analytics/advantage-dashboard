-- Make the seed's upserts targetable.
-- Applied live 2026-08-17 as version 20260817074305.
--
-- Upsert needs a constraint it can name in ON CONFLICT, and an expression index
-- (lower(domain)) cannot be targeted that way — PostgREST answers "no unique or
-- exclusion constraint matching the ON CONFLICT specification" and the seed
-- stops halfway, with programs written and their children missing.
--
-- The seed lowercases both columns before insert, so a plain unique index is
-- equivalent in effect and actually usable. Case-insensitivity moves to the
-- boundary, where the data enters, rather than living in the index.
drop index if exists public.program_domains_program_domain_key;
create unique index if not exists program_domains_program_domain_key
  on public.program_domains (program_id, domain);

drop index if exists public.program_contacts_program_email_key;
create unique index if not exists program_contacts_program_email_key
  on public.program_contacts (program_id, email);

comment on index public.program_domains_program_domain_key is
  'Plain columns, not lower(domain): ON CONFLICT cannot target an expression index. Callers lowercase before insert.';
