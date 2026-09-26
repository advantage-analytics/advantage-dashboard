-- Program claims — the record of who asked for a program and how it resolved.
-- Applied live 2026-08-17 as version 20260817073946.
--
-- One program is claimed once, by one person, who becomes its owner. Everyone
-- else enters by invite. This table is the audit trail of that single event,
-- including the ones that were rejected or objected to.
--
-- The first claimant always walks into an EMPTY workspace, so a mis-claim leaks
-- nothing. The risk it carries is wrong ownership, and the defences against
-- that are the objection window and the announcement — not the domain check.
-- `domain_matched` decides only whether a human has to look; it grants nothing,
-- skips no window, and assigns no role.

-- Admin identity. `users.is_admin` already exists — boolean, NOT NULL, default
-- false — so this adds no column and needs no env allowlist. SECURITY DEFINER
-- because `users` is scoped to `auth.uid() = id` and a policy on another table
-- would otherwise be asking a question it cannot see the answer to.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.is_admin from public.users u where u.id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.program_claims (
  id                       uuid primary key default gen_random_uuid(),
  program_id               uuid not null references public.programs(id) on delete cascade,
  -- Null until the magic link is clicked — the claim is submitted before an
  -- account exists.
  claimant_user_id         uuid references public.users(id) on delete set null,
  claimed_email            text not null,
  claimant_name            text not null,
  claimant_role            text not null,
  -- Whether `claimed_email` matched the program's known domains. Recorded
  -- because it explains the routing, not because it confers anything.
  -- The address belongs to a domain observed at this school.
  domain_matched           boolean not null default false,
  -- Whether that match was specific enough to skip a human. A SEPARATE answer:
  -- a shared, inferred or non-academic domain matches and still routes to
  -- review. Collapsing the two is what would auto-approve the cases the
  -- dataset's four guards exist to catch.
  skips_manual_review      boolean not null default false,
  -- Why, in words, straight into the review email.
  match_reason             text,
  status                   text not null default 'pending_email',
  -- Hashed, never the raw token. A leaked database row must not be a working
  -- claim link.
  verification_token_hash  text,
  token_expires_at         timestamptz,
  objection_window_ends_at timestamptz,
  reviewed_by              uuid references public.users(id) on delete set null,
  review_notes             text,
  -- When the announcement went out, and to how many people. Zero recipients is
  -- the case that matters: it means the only defence against a stale directory
  -- did not fire, and the review queue has to say so rather than let the claim
  -- pass quietly.
  announced_at             timestamptz,
  announced_recipients     integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.program_claims
  drop constraint if exists program_claims_status_check;
alter table public.program_claims
  add constraint program_claims_status_check
  check (status in (
    'pending_email',
    'pending_review',
    'objection_window',
    'approved',
    'rejected',
    'objected'
  ));

alter table public.program_claims
  drop constraint if exists program_claims_role_check;
alter table public.program_claims
  add constraint program_claims_role_check
  check (claimant_role in (
    'head_coach',
    'assistant_coach',
    'director_of_tennis',
    'operations',
    'other'
  ));

-- At most one live claim per program.
--
-- The single most important constraint here. Without it two people claiming the
-- same program within the objection window both succeed, and the loser
-- discovers it only when their workspace turns out to be someone else's.
create unique index if not exists program_claims_one_open_per_program
  on public.program_claims (program_id)
  where status in ('pending_email', 'pending_review', 'objection_window');

create index if not exists program_claims_claimant_idx
  on public.program_claims (claimant_user_id)
  where claimant_user_id is not null;

-- The review queue and the objection-window sweeper both read by status.
create index if not exists program_claims_status_idx
  on public.program_claims (status);

alter table public.program_claims enable row level security;

grant select on public.program_claims to authenticated;

-- A claimant sees their own claim; an admin sees all of them.
--
-- Nobody else, including other members of the same program: the claim row
-- carries the claimant's email address, and screen 3 deliberately shows a
-- program's owner as a first name and last initial rather than an address.
drop policy if exists "Claimants and admins can read claims" on public.program_claims;
create policy "Claimants and admins can read claims"
  on public.program_claims for select
  using (
    (claimant_user_id is not null and claimant_user_id = (select auth.uid()))
    or public.is_admin()
  );

-- No write policies. Submission, verification, approval and objection all run
-- server-side. An approve link in an email is a shortcut to a page, never the
-- authorization itself.

comment on table public.program_claims is
  'Audit trail of program claims. domain_matched only decides whether review is needed; it grants nothing.';
comment on column public.program_claims.announced_recipients is
  'How many other recorded contacts were emailed. 0 means the claim went unannounced — surface it in review.';
