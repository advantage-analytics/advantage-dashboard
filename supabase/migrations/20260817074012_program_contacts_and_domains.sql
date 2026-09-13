-- Recorded addresses per program, and the domain evidence behind the
-- allowlist. Applied live 2026-08-17 as version 20260817074012.
--
--
-- This table is the ACTUAL defence against a stale directory. When someone
-- claims a program, every other address recorded for it gets an email naming
-- the claimant with a one-click objection link. The other coaches on staff know
-- who works there; the school's own page has been measured lagging by months.
--
-- It is emphatically NOT an authorization list. 17 of 18 duplicated coach names
-- in the outreach data had changed schools between May and July 2026. Nothing
-- here grants access, and there is deliberately no `approved` column.
--
-- 3,117 rows of real people's work email addresses.

create table if not exists public.program_contacts (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs(id) on delete cascade,
  email              text not null,
  email_domain       text,
  registrable_domain text,
  -- A personal address is a normal thing for a D2/D3/NAIA coach to have. It
  -- still gets announced to; it just never counts as domain evidence.
  is_freemail        boolean not null default false,
  name               text,
  role               text,
  source_url         text,
  -- Whether the outreach campaign already mailed this address. Kept so the
  -- announcement can respect prior contact rather than re-introducing itself.
  was_emailed        boolean not null default false,
  created_at         timestamptz not null default now()
);

-- One row per address per program. The scrape can list the same person twice
-- across source files, and announcing a claim to them twice is worse than not
-- announcing it — it reads as a system that does not know who it has told.
create unique index if not exists program_contacts_program_email_key
  on public.program_contacts (program_id, lower(email));

-- The announcement reads every contact for one program, minus the claimant.
create index if not exists program_contacts_program_idx
  on public.program_contacts (program_id);

alter table public.program_contacts enable row level security;

-- NO policies and NO grants, deliberately.
--
-- These are real people's work addresses, scraped from public staff pages. The
-- announcement runs server-side with the service role, which bypasses RLS. No
-- browser client — signed in or not — has any reason to enumerate them, and the
-- claim flow's screens are careful to show a program's owner as a first name
-- and last initial rather than an address. Granting `authenticated` a read here
-- would undo that with one query.

comment on table public.program_contacts is
  'Announced-claim recipients. Server-only: no RLS policy and no grant, so only the service role can read it.';
comment on column public.program_contacts.was_emailed is
  'Already contacted by the outreach campaign. The announcement respects prior contact.';

--
-- `programs.primary_domain` and `programs.athletics_domains` are what the claim
-- check reads — they are the fast path and the shape `checkClaimEmail()` takes.
-- This table is the WORKING behind those two columns: how many real addresses
-- were seen on each domain, whether it is academic, whether it was observed
-- directly or inferred from a subdomain.
--
-- It exists so a human reviewing a claim can see why the automatic check said
-- what it said. "Routed to review" with no explanation is a decision someone
-- has to make twice.

create table if not exists public.program_domains (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs(id) on delete cascade,
  domain             text not null,
  registrable_domain text,
  -- `primary` or `athletics` — which column on `programs` this feeds.
  kind               text,
  -- Only `.edu` and academic suffixes (`ac.uk`, `edu.au`) can auto-skip review.
  -- A coach's own business domain turns up as a program contact domain often
  -- enough to matter: `nighteaglewilderness.com` was the highest-evidence
  -- domain at one school, `chainbridgebank.com` at another.
  is_academic        boolean not null default false,
  -- How many distinct addresses were observed on this domain. Weight, not proof.
  observed_addresses integer not null default 0,
  evidence           text,
  created_at         timestamptz not null default now()
);

create unique index if not exists program_domains_program_domain_key
  on public.program_domains (program_id, lower(domain));

create index if not exists program_domains_program_idx
  on public.program_domains (program_id);

-- Reverse lookup: which programs share this domain? The shared-domain guard is
-- precomputed into `programs.domain_match_skips_review`, but review wants to
-- see the other 13 programs on `cuny.edu` rather than take the flag on trust.
create index if not exists program_domains_registrable_idx
  on public.program_domains (registrable_domain)
  where registrable_domain is not null;

alter table public.program_domains enable row level security;

-- Server-only, like program_contacts. The authoritative claim check runs
-- server-side; shipping a school's full observed-domain list to the browser
-- would tell an attacker exactly which address to forge.

comment on table public.program_domains is
  'Evidence behind programs.primary_domain and athletics_domains. Server-only: no RLS policy and no grant.';
