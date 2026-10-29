-- Resolving a Today row that has no natural close (Admin › Today).
--
-- Claims, requests and pilots leave Today when their real action is taken.
-- Three kinds never do: a failed or stuck analysis nobody will retry, a
-- flagged match nobody will label, and an Ask thumbs-down (`ask_feedback`
-- has no handled state). An admin resolves those here.
--
-- SHARED across admins, unlike `admin_seen`: Today is the team's inbox, so
-- one admin resolving a row clears it for everyone. Keyed by the row's own
-- Today key (`job:<job id>`, `label:<job id>`, `ask:<feedback id>`), so a
-- resolution sticks to that one thing — a retry is a new job, a new key,
-- and comes back on its own. Undo deletes the row.
--
-- Who and when are kept, with an optional note, so a resolution is a record
-- and not a silent delete. No client grants: the console's service-role
-- client writes after `requireAdmin()`.

create table if not exists public.admin_resolutions (
  item_key text primary key check (length(item_key) between 3 and 200),
  kind text not null check (kind in ('job', 'label', 'ask')),
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 500)
);

create index if not exists admin_resolutions_resolved_at_idx
  on public.admin_resolutions (resolved_at desc);

create index if not exists admin_resolutions_resolved_by_idx
  on public.admin_resolutions (resolved_by);

alter table public.admin_resolutions enable row level security;

revoke all on table public.admin_resolutions from anon, authenticated;
grant select, insert, update, delete on table public.admin_resolutions to service_role;
