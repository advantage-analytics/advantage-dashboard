-- Pilot terms acceptances: the table a coach's "I accept" lands in, and the
-- one place SQL knows which version of the terms is current. Applied live
-- 2026-09-26 as version 20260926181544.
--
-- Design approved 2026-09-26 (docs/superpowers/specs/2026-09-26-pilot-terms-
-- design.html): acceptance is recorded PER USER at the moment a team is
-- created or claimed, and the program is stamped onto the row AFTER the
-- program exists. `program_id` is therefore nullable — in the custom-team
-- flow there is no program yet when the coach accepts; the creating RPC fills
-- it in. Enforcement (the RPCs refusing without a row) is a SEPARATE
-- migration, `*_pilot_terms_enforcement.sql`, applied only together with the
-- terms screen: this file is safe to apply ahead of the UI because nothing
-- reads the table yet.
--
-- The version literal lives in exactly two places that name each other:
--   * `public.current_pilot_terms_version()` below (SQL)
--   * `PILOT_TERMS_VERSION` in src/lib/services/programs/pilot-terms.ts
-- Bump both in the same change. A row whose `terms_version` is not the
-- current one is treated as NO acceptance — a new version means everyone
-- accepts again.
--
-- Access model:
--   * authenticated may INSERT its own row (`user_id = auth.uid()`) and may
--     write only `user_id` and `terms_version` — `id`, `accepted_at` come
--     from defaults and `program_id` is stamped by the RPCs alone, through
--     the column-level insert grant rather than a policy clause;
--   * authenticated may SELECT its own rows;
--   * no UPDATE or DELETE policy and no such grant: an acceptance is a fact,
--     and only the service role (or a SECURITY DEFINER RPC) rewrites it;
--   * anon has nothing.

create table public.pilot_terms_acceptances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade
                default auth.uid(),
  program_id    uuid references public.programs (id) on delete set null,
  terms_version text not null,
  accepted_at   timestamptz not null default now()
);

comment on table public.pilot_terms_acceptances is
  'One row per pilot-terms acceptance. program_id is stamped by the creating '
  'RPC after the program exists; a terms_version other than '
  'current_pilot_terms_version() counts as no acceptance.';

-- The enforcement lookup: newest acceptance of a given version for a user.
create index pilot_terms_acceptances_user_version_idx
  on public.pilot_terms_acceptances (user_id, terms_version, accepted_at desc);

-- Foreign-key index — the programs delete path (`on delete set null`) scans it.
create index pilot_terms_acceptances_program_idx
  on public.pilot_terms_acceptances (program_id)
  where program_id is not null;

-- ── The current version ─────────────────────────────────────────────────────
--
-- Mirrors `PILOT_TERMS_VERSION` in src/lib/services/programs/pilot-terms.ts.
-- Immutable on purpose: the planner may fold it into the enforcement
-- predicate, and a bump is a new migration replacing this body.

create or replace function public.current_pilot_terms_version()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '2026-fall-pilot-1'::text;
$$;

comment on function public.current_pilot_terms_version() is
  'The pilot terms version a coach must have accepted. Mirrors '
  'PILOT_TERMS_VERSION in src/lib/services/programs/pilot-terms.ts.';

revoke execute on function public.current_pilot_terms_version() from public, anon;
grant execute on function public.current_pilot_terms_version()
  to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.pilot_terms_acceptances enable row level security;

create policy "Users insert their own acceptance"
  on public.pilot_terms_acceptances
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users read their own acceptances"
  on public.pilot_terms_acceptances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No update or delete policy: see the header.

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- Supabase's default privileges grant ALL (incl. TRUNCATE, which RLS never
-- covers) to anon and authenticated on every new table. Take it back, then
-- hand out only what the policies above are written for.

revoke all on public.pilot_terms_acceptances from public, anon, authenticated;
grant select on public.pilot_terms_acceptances to authenticated;
grant insert (user_id, terms_version) on public.pilot_terms_acceptances
  to authenticated;
grant all on public.pilot_terms_acceptances to service_role;
