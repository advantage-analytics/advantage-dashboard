-- One review queue for the three things that used to go nowhere.
-- Applied live 2026-08-17 as version 20260817213512.
--
-- An invite request, an ownership dispute and an unlisted-program submission
-- are one queue in practice — a person asking you to do something about a
-- program — and they differ only in which fields are set. Three tables would
-- mean three policies and three admin surfaces for one job.
--
-- Before this, all three ended at a console.log or a 404 while the UI told the
-- user their request had been received.
create table if not exists public.program_requests (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  -- Null for an unlisted program: there is no row to point at yet, which is
  -- the entire reason that request exists.
  program_id   uuid references public.programs(id) on delete cascade,
  email        text not null,
  name         text,
  -- The optional note from screen F3.3. A request that arrives with a name and
  -- a reason gets answered; a bare notification gets ignored.
  note         text,
  -- Only for kind='unlisted_program', where there is no program row to read
  -- these off.
  school_name  text,
  team         text,
  status       text not null default 'open',
  resolved_by  uuid references public.users(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.program_requests drop constraint if exists program_requests_kind_check;
alter table public.program_requests
  add constraint program_requests_kind_check
  check (kind in ('invite_request', 'ownership_dispute', 'unlisted_program'));

alter table public.program_requests drop constraint if exists program_requests_status_check;
alter table public.program_requests
  add constraint program_requests_status_check
  check (status in ('open', 'resolved', 'dismissed'));

-- An unlisted program must say which school; everything else must say which
-- program. Enforced here because the admin queue is unreadable without it.
alter table public.program_requests drop constraint if exists program_requests_target_check;
alter table public.program_requests
  add constraint program_requests_target_check
  check (
    (kind = 'unlisted_program' and school_name is not null)
    or (kind <> 'unlisted_program' and program_id is not null)
  );

-- The admin queue reads open rows, oldest first.
create index if not exists program_requests_open_idx
  on public.program_requests (created_at)
  where status = 'open';

create index if not exists program_requests_program_idx
  on public.program_requests (program_id)
  where program_id is not null;

-- One open request per person per program per kind. Someone clicking "Request
-- an invite" three times should not produce three rows for the owner to read.
create unique index if not exists program_requests_open_unique
  on public.program_requests (kind, program_id, lower(email))
  where status = 'open' and program_id is not null;

alter table public.program_requests enable row level security;

-- No policies and no grants, matching program_contacts. These rows carry the
-- email addresses of people asking for access; writes go through server
-- actions with the service role and reads through the admin pages.

comment on table public.program_requests is
  'One queue for invite requests, ownership disputes and unlisted-program submissions. Server-only: no RLS policy and no grant.';

-- ---------------------------------------------------------------------------
-- The claim tokens are now dead
-- ---------------------------------------------------------------------------

-- Claim verification rides Supabase Auth's magic link, so its token is the
-- proof of address and these two were never read. Dropping rather than leaving
-- them nullable: a hashed-token column on a claims table reads like a security
-- mechanism, and one that nothing checks is worse than none.
alter table public.program_claims drop column if exists verification_token_hash;
alter table public.program_claims drop column if exists token_expires_at;
