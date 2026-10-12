-- What a public match link carries beyond Statistics.
--
-- A link has always shown the Statistics view and nothing else. This adds the
-- first per-link option: `include_visualizations` puts the Visualizations view
-- (the court charts, drawn from the same points and shots the statistics are
-- counted from) on `/m/<token>` as well. Video is deliberately not here — it
-- is a different exposure and gets its own column and its own rule.
--
-- Default false, so every link handed out before this stays exactly what its
-- footer says it is: statistics only. A link made after this asks for
-- visualizations explicitly (`enableMatchShare`).
--
-- Changing the option must not mint a new token — the link is already in
-- someone's inbox — so this is the table's first UPDATE path. It is as narrow
-- as it can be made: the policy is the same `can_share_match` rule the insert
-- and delete policies use, and the grant is on this one column, so `token`,
-- `match_id`, `created_by` and `created_at` stay as immutable to
-- `authenticated` as they were.

alter table public.match_share_links
  add column include_visualizations boolean not null default false;

comment on column public.match_share_links.include_visualizations is
  'The public page also shows the Visualizations view. Statistics are always shown.';

create policy "match_share_links_update_sharers"
  on public.match_share_links
  for update
  to authenticated
  using (public.can_share_match(match_id))
  with check (public.can_share_match(match_id));

grant update (include_visualizations) on table public.match_share_links to authenticated;
