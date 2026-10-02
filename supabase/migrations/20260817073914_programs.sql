-- Collegiate programs — the directory a team workspace is claimed against.
-- Applied live 2026-08-17 as version 20260817073914.
--
-- Shaped against the real seed dataset (1,940 programs: 552 D1, 342 D2, 641 D3,
-- 208 NAIA, 197 JUCO), not the spec's estimate of 552. The spec is out of date
-- on that point: it says D2/D3/NAIA/JUCO "are not in the dataset yet", and they
-- are — 95% of all 1,940 carry domain evidence. "My program isn't listed"
-- becomes the rare path it should be.
--
-- The rows are a directory, not an authorization list: being here means a
-- program can be FOUND, never that anyone has access to it.
--
-- Men's and women's are SEPARATE ROWS. They are separate workspaces with
-- separate budgets and usually separate staff. Whether they share one 75-hour
-- allowance is UNRESOLVED — the MOU says "per program per month" and never
-- defines "program". Treated as separate here, which is the recoverable
-- direction: merging two budgets later is a migration, un-merging one after a
-- season of use is a support incident.

create table if not exists public.programs (
  id             uuid primary key default gen_random_uuid(),

  -- The ITA team code, e.g. `AbileneChristianUniversityM`. Stable natural key
  -- from the dataset, and the join key across its three CSVs. Kept beside a
  -- uuid rather than used as the primary key because it is external data that
  -- moves when the scrape is rebuilt, and four tables point at this row.
  program_key    text not null,

  -- School identity is `normalized-name|STATE`, NOT the name.
  --
  -- This is load-bearing and was a live vulnerability in the dataset build.
  -- Glendale Community College exists in AZ and CA, Anderson University in SC
  -- and IN, Marian University in WI and IN. Keying on name alone pooled their
  -- domain evidence, so an @gccaz.edu address auto-claimed the CALIFORNIA
  -- program. 1,940 programs resolve to 1,080 school groups.
  school_group   text not null,
  school_name    text not null,
  school_abbrev  text,
  team           text not null,

  division       text,
  conference     text,
  city           text,
  state          text,
  athletics_url  text,
  -- Shown to whoever reviews a claim, so the check is one tab away.
  staff_page_url text,

  -- Registrable domain carrying the most observed addresses, academic domains
  -- preferred over athletics `.com` sites. Null where there is no evidence —
  -- 88 programs, concentrated in JUCO. Nothing here is inferred from a school
  -- website; where there is no evidence the field is null, per the spec's
  -- Part 3 item 3.
  primary_domain          text,
  -- True when the primary is the registrable parent of an observed subdomain
  -- but was never seen directly. Those never auto-skip review: `af.edu`
  -- inferred from a USAFA address would open the claim to the entire Air Force.
  primary_domain_inferred boolean not null default false,
  -- Subdomains and secondary domains actually observed, e.g. `vols.utk.edu`.
  athletics_domains       text[] not null default '{}',

  -- THE field the claim route reads. Precomputes three of the four guards:
  -- school identity, shared domains (90 programs — `cuny.edu` covers 14), and
  -- inferred parents (75). The fourth, non-academic suffixes, is checked at
  -- claim time against the domain that actually matched. 1,687 of 1,940 are
  -- eligible; the rest route to a human on any claim.
  domain_match_skips_review boolean not null default false,
  -- Why it is false, verbatim into the admin review email.
  review_reasons            text,

  -- Evidence weight, shown in review so a decision has something behind it.
  contact_count             integer not null default 0,
  domain_evidence_count     integer not null default 0,
  domain_shared_with_schools integer not null default 0,

  status         text not null default 'unclaimed',
  owner_user_id  uuid references public.users(id) on delete set null,
  claimed_at     timestamptz,

  -- Can players see each other's matches? Off by default: a squad is not
  -- automatically a place where everyone's numbers are everyone's business,
  -- and the owner is the one who knows whether it should be.
  roster_visible boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- `ncaa_id` is deliberately absent. The dataset has the column and it is empty
-- throughout — no NCAA IDs were available and none were guessed. An
-- always-null column would only invite someone to populate it by inference.

alter table public.programs drop constraint if exists programs_team_check;
alter table public.programs
  add constraint programs_team_check check (team in ('mens', 'womens'));

alter table public.programs drop constraint if exists programs_status_check;
alter table public.programs
  add constraint programs_status_check
  check (status in ('unclaimed', 'claim_pending', 'active', 'suspended'));

alter table public.programs drop constraint if exists programs_division_check;
alter table public.programs
  add constraint programs_division_check
  check (division is null or division in ('D1', 'D2', 'D3', 'NAIA', 'JUCO'));

create unique index if not exists programs_program_key_key
  on public.programs (program_key);

-- One row per squad per school GROUP. Not (school_name, team) — that collides
-- on 8 real rows in the seed data and would have rejected the second Anderson
-- University and the second Glendale Community College outright.
create unique index if not exists programs_group_team_key
  on public.programs (school_group, team);

-- Typeahead on screen 2 is a prefix match over 1,940 rows, fired by anonymous
-- visitors. text_pattern_ops so `lower(school_name) like 'meri%'` uses the
-- index rather than scanning.
create index if not exists programs_school_name_prefix_idx
  on public.programs (lower(school_name) text_pattern_ops);

create index if not exists programs_owner_idx
  on public.programs (owner_user_id)
  where owner_user_id is not null;

alter table public.programs enable row level security;

-- Explicit rather than relying on Supabase's default privileges. Those are
-- configured on the hosted project and absent anywhere the migrations are
-- replayed — which is where this was caught. RLS still decides the rows; this
-- only decides whether the role may ask.
grant select on public.programs to anon, authenticated;

-- Readable by everyone, including anonymous visitors.
--
-- The claim flow's first two screens happen BEFORE an account exists — you pick
-- your program, then you sign up. Requiring auth to search the directory would
-- invert the flow. Nothing exposed here is sensitive: school, squad, division
-- and conference are published facts, and the contact addresses live in a
-- separate table that anon cannot read at all.
drop policy if exists "Programs are publicly readable" on public.programs;
create policy "Programs are publicly readable"
  on public.programs for select
  using (true);

-- No insert/update/delete policy on purpose. Seeding and claim transitions run
-- with the service role, which bypasses RLS; leaving the write side with no
-- policy at all means a leaked anon key cannot claim, rename or suspend a
-- program even by accident.

comment on table public.programs is
  'Collegiate program directory, 1,940 rows. Presence here means findable, never authorized — access comes from program_members.';
comment on column public.programs.school_group is
  'normalized-name|STATE. School identity is name AND state: two schools share a name often enough that pooling their domain evidence was a live auto-claim vulnerability.';
comment on column public.programs.domain_match_skips_review is
  'The field the claim route reads. Precomputed guards: school identity, shared domains, inferred parents. Non-academic suffixes are checked at claim time.';
