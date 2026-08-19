-- Let a claim finish on a different device than it started on.
-- Applied live 2026-08-18 as version 20260818040823.
--
-- ── The bug ─────────────────────────────────────────────────────────────────
-- Between the setup form and the emailed link, the claim lived in one place:
-- an httpOnly cookie named `advantage_pending_claim`. The program key existed
-- nowhere else. So a coach who filled the form on a laptop and opened the email
-- on their phone hit "We lost track of which program" — the cookie was in the
-- other browser.
--
-- That is not an edge case. Filling a form on a desktop and reading mail on a
-- phone is the ordinary way people do this, so a large share of real claims
-- would have failed at the last step, with an error message that reads like our
-- mistake because it is.
--
-- ── Why this does not reopen the denial of service ──────────────────────────
-- The original flow inserted a `program_claims` row anonymously on submit, and
-- `program_claims_one_open_per_program` is UNIQUE. A script walking the 1,940
-- enumerable program keys parked an open claim on every program and locked out
-- every legitimate claimant. The uniqueness on program was the weapon, not the
-- write.
--
-- This table has no constraint on `program_key` at all. Ten thousand rows
-- pointing at the same program block nobody: the claim itself is still created
-- only by `complete_program_claim`, after a verified session.
--
-- Two further bounds:
--
--   * `startClaim` writes here only AFTER `signInWithOtp` succeeds, so row
--     creation is gated by Supabase's email rate limit and its per-address and
--     per-IP OTP throttles. Rows cannot be created faster than mail goes out.
--   * The primary key is the address, so one live pending claim per address —
--     repeat submissions update in place rather than accumulating.
--
-- ── What it does change ─────────────────────────────────────────────────────
-- Anyone could already trigger a magic link to any address; that is inherent to
-- magic links. What is new is that a link triggered by someone else now carries
-- a program with it, so a recipient who clicks without reading could complete a
-- claim they did not start.
--
-- The blast radius is small and deliberately so. The RPC only ever binds the
-- claim to the VERIFIED session address, so the sender cannot claim anything
-- themselves. Auto-approval additionally requires that address to be on that
-- program's recorded staff list — which means the only claims that settle
-- silently are ones where the recipient genuinely is that program's staff, and
-- the program is genuinely theirs. Everything else lands in `pending_review`
-- where a human sees it, and both landing screens name the program with a way
-- to hand it back.
--
-- The TTL is the other half: an unclaimed row stops being actionable within the
-- day.
create table if not exists public.pending_claims (
  -- Stored already lowercased by the caller, and the PRIMARY KEY is the plain
  -- column rather than lower(email): ON CONFLICT cannot target an expression
  -- index, which is the same trap that bit program_contacts.
  --
  -- Keying on the address gives latest-wins for free. Someone who starts a
  -- claim on one program and then another should end up claiming the second,
  -- which is exactly what the cookie this replaces did when it was overwritten.
  email        text primary key,
  program_key  text not null references public.programs(program_key) on delete cascade,
  full_name    text not null,
  role         text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index if not exists pending_claims_expires_idx on public.pending_claims (expires_at);

alter table public.pending_claims enable row level security;

-- No policies and no grants, matching program_contacts and program_requests.
-- These rows say which program a named person is midway through claiming;
-- nothing in a browser has any reason to read them, and the server actions that
-- do use the service role.

comment on table public.pending_claims is
  'A claim between the form and the emailed link. Server-only: no RLS policy and no grant. Replaces an httpOnly cookie that only existed in the browser that started the claim.';
comment on column public.pending_claims.expires_at is
  'Matches the magic link''s own life. Expired rows are swept opportunistically by startClaim.';
