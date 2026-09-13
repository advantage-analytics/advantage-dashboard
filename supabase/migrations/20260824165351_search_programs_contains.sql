-- Typeahead for screen F3 again, now matching anywhere in the name or the
-- abbreviation instead of only at the start.
-- Applied live 2026-08-24 as version 20260824165351.
--
-- Supersedes 20260817074946_search_programs.sql. Everything that file said
-- about the shape still holds: the result list's right-hand column is, per the
-- design, "the whole point of the list" — it says which programs are already
-- claimed BEFORE anyone commits to a row — so every row needs the owner's
-- display name, and an anonymous visitor cannot read `users` at all. Hence one
-- SECURITY DEFINER call for the whole page of results rather than a per-row
-- lookup, a name returned as "D. Wu", and never an address.
--
-- What changes is the match. Prefix-only missed the school the coach was
-- looking at: "angeles" returned nothing, because University of California,
-- Los Angeles begins with "University". The abbreviation was no safety net —
-- 348 of the 1,941 rows have none, including the men's half of North Carolina
-- State. So the term now matches anywhere in either column, and a prefix hit
-- sorts above a mid-string one so "ucla" and "nccu" still land on the row the
-- coach meant, first.
--
-- The leading-wildcard scan the old header warned about is real now, and paid
-- for with a trigram index over both matched expressions — written exactly as
-- the where clause writes them, since an expression index the planner cannot
-- match is an index that does not exist. From three characters up the scan is
-- gone: "angeles" is a bitmap scan of 25 shared buffers, 0.3 ms.
--
-- Two characters cannot use it, and no index would change that: a
-- two-character pattern contains no whole trigram, so pg_trgm has nothing to
-- look up and the planner correctly falls back to the scan. That is the cost
-- this migration accepts, so here it is measured on the live directory rather
-- than waved at. EXPLAIN (ANALYZE, BUFFERS) over this query body, with the
-- worst two-character term "un" (1,352 of the 1,941 rows match): 168 shared
-- buffer hits — the whole 1.3 MB table, every one of them cached — and 5.1 ms.
-- "st" is 501 rows and 3.9 ms. Through the RPC, definer wrapper and result set
-- included, a warm call is 10 ms. Keeping that off the first keystroke is the
-- two-character floor's entire job, which is why the SQL and searchPrograms()
-- both enforce it. This table has to grow by an order of magnitude before the
-- scan costs more than the round trip that carried the keystroke.
create extension if not exists pg_trgm with schema extensions;

create index if not exists programs_school_search_trgm_idx
  on public.programs using gin (
    lower(school_name) extensions.gin_trgm_ops,
    lower(coalesce(school_abbrev, '')) extensions.gin_trgm_ops
  );

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
    and (lower(p.school_name) like '%' || q.term || '%'
      or lower(coalesce(p.school_abbrev, '')) like '%' || q.term || '%')
  order by
    -- A coach who types the start of a name means that name. "state" is the
    -- State University of New York before it is North Carolina State.
    case
      when lower(p.school_name) like q.term || '%'
        or lower(coalesce(p.school_abbrev, '')) like q.term || '%' then 0
      else 1
    end,
    -- Men's before women's within a school, so the pair reads as a pair.
    p.school_name, p.team
  limit least(coalesce(p_limit, 8), 20);
$$;

revoke all on function public.search_programs(text, integer) from public;
grant execute on function public.search_programs(text, integer) to anon, authenticated;

comment on function public.search_programs(text, integer) is
  'Claim-flow typeahead. Matches the term anywhere in the name or abbreviation, prefix hits first; returns an owner as "D. Wu" and never an address.';
