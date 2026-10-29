-- "New since you last looked" for the admin console, per admin, per surface.
--
-- One table holds two kinds of row, told apart by `item_key`:
--
--   * `item_key = '*'` — the surface's watermark. `seen_at` is the admin's
--     latest look at the page; `prev_seen_at` the look before it. The page
--     marks rows newer than `prev_seen_at` as New (so a reload inside one
--     sitting keeps the dots), and the nav tab counts rows newer than
--     `seen_at` (what arrived since you last opened the page at all).
--   * any other `item_key` — one row the admin opened. Opening a row clears
--     its dot whatever the watermark says.
--
-- In the database rather than per browser: the console is used from more than
-- one machine, the nav counts are computed on the server, and the repo already
-- keeps every "has this person seen X" fact on the server
-- (`users.first_report_seen_at`, the `*_hint_done_at` columns).
--
-- No policies and no grants beyond `service_role`: every read and write goes
-- through the console's service-role client after `requireAdmin()`, like the
-- rest of the console.

create table if not exists public.admin_seen (
  admin_id uuid not null references public.users (id) on delete cascade,
  surface text not null
    check (surface in ('today', 'matches', 'requests', 'labels', 'pilots', 'teams', 'ask')),
  item_key text not null check (length(item_key) between 1 and 200),
  seen_at timestamptz not null default now(),
  prev_seen_at timestamptz,
  primary key (admin_id, surface, item_key)
);

alter table public.admin_seen enable row level security;

revoke all on table public.admin_seen from anon, authenticated;
grant select, insert, update, delete on table public.admin_seen to service_role;
