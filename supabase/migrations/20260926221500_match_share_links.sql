-- Public read-only match links.
--
-- One row per match that its owner has chosen to share with anyone holding
-- the link. This is the deliberate opt-in the `public_results` view
-- (20260822150500) asked for before anything made the private tier
-- addressable: it hands out a handle to one match's stats and points,
--
--   * per match, never per account or program,
--   * only by the match's uploader, either seated player, or program staff
--     (`can_share_match`) — a teammate who can merely VIEW the match cannot
--     publish it,
--   * read back only by the service role, keyed on the token. `anon` has no
--     grant on this table or on anything it points at; the public page runs
--     `getSharedMatchData` on the server and renders a read-only report.
--
-- Turning sharing off deletes the row, and turning it back on mints a new
-- token, so a link that was once handed out stays dead. The token is 32
-- bytes of CSPRNG output (`generateToken()` in
-- src/lib/services/programs/tokens.ts), stored as-is: these links are public
-- by the sharer's choice, so a leaked row is a leaked public link, not a
-- credential — unlike claim and invite tokens, which are hashed.

create table public.match_share_links (
  match_id uuid primary key references public.matches (id) on delete cascade,
  token text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.match_share_links is
  'Per-match opt-in public links. Read by the service role only; see the migration header.';

-- Who may publish a match: its uploader, either seated player (login or a
-- claimed roster profile — `my_player_ids()` names both), or the program's
-- staff. Deliberately narrower than the `matches` SELECT policy, which lets
-- any program member read.
create or replace function public.can_share_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and (
        (select auth.uid()) = m.created_by
        or m.player1_id in (select public.my_player_ids())
        or m.player2_id in (select public.my_player_ids())
        or (m.program_id is not null and public.is_program_staff(m.program_id))
      )
  );
$$;

revoke all on function public.can_share_match(uuid) from public;
grant execute on function public.can_share_match(uuid) to authenticated;

alter table public.match_share_links enable row level security;

create policy "match_share_links_select_sharers"
  on public.match_share_links
  for select
  to authenticated
  using (public.can_share_match(match_id));

create policy "match_share_links_insert_sharers"
  on public.match_share_links
  for insert
  to authenticated
  with check (
    public.can_share_match(match_id)
    and created_by = (select auth.uid())
  );

create policy "match_share_links_delete_sharers"
  on public.match_share_links
  for delete
  to authenticated
  using (public.can_share_match(match_id));

-- No UPDATE policy: a link is minted or removed, never edited.

revoke all on table public.match_share_links from public, anon, authenticated;
grant select, insert, delete on table public.match_share_links to authenticated;
grant all on table public.match_share_links to service_role;
