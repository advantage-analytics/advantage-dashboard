-- Typeahead for screen F3, including whether each row is already taken.
-- Applied live 2026-08-17 as version 20260817074946.
--
-- The result list's right-hand column is, per the design, "the whole point of
-- the list": it says which programs are already claimed BEFORE anyone commits
-- to a row. That means every row needs the owner's display name, and an
-- anonymous visitor cannot read `users` at all.
--
-- One SECURITY DEFINER call for the whole page of results rather than a
-- per-row lookup. Returns a name as "D. Wu" and never an address.
--
-- Prefix match, not contains: this fires on every keystroke from anonymous
-- visitors, and a leading-wildcard pattern cannot use
-- programs_school_name_prefix_idx — it degrades to a sequential scan of all
-- 1,940 rows per keypress. The abbreviation is matched too, because a coach
-- types "UCLA" long before "University of California, Los Angeles".
create or replace function public.search_programs(p_term text, p_limit integer default 8)
returns table (
  program_key   text,
  school_name   text,
  team          text,
  division      text,
  conference    text,
  state         text,
  status        text,
  owner_display text
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select replace(replace(lower(btrim(p_term)), '%', '\%'), '_', '\_') as term
  )
  select
    p.program_key, p.school_name, p.team, p.division, p.conference, p.state, p.status,
    case
      when u.id is null then null
      else btrim(
        coalesce(left(u.first_name, 1) || '. ', '') || coalesce(u.last_name, '')
      )
    end
  from public.programs p
  left join public.users u on u.id = p.owner_user_id
  cross join q
  where length(q.term) >= 2
    and (lower(p.school_name) like q.term || '%'
      or lower(coalesce(p.school_abbrev, '')) like q.term || '%')
  -- Men's before women's within a school, so the pair reads as a pair.
  order by p.school_name, p.team
  limit least(coalesce(p_limit, 8), 20);
$$;

revoke all on function public.search_programs(text, integer) from public;
grant execute on function public.search_programs(text, integer) to anon, authenticated;

comment on function public.search_programs(text, integer) is
  'Claim-flow typeahead. Prefix match on name or abbreviation; returns an owner as "D. Wu" and never an address.';
