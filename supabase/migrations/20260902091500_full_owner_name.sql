-- The claim flow shows the owner's full name to anonymous visitors. Applied
-- live 2026-09-02 as version 20260902091500.
--
-- Both definer functions behind the claim flow abbreviated the owner on
-- purpose: 20260817074759 rendered "Elena V." on the status screens, and
-- 20260817074946 rendered an initial and a surname in the typeahead. Screen
-- F3.3's copy was written that way, and the abbreviation was the privacy half
-- of a bargain — a signed-out visitor could learn *someone* at a school had
-- claimed the program without learning quite who.
--
-- This migration reverses that half of the bargain, and it does so
-- deliberately. /claim/[programKey] and its search dropdown are reachable by
-- anyone with the link, signed in or not; the product owner was shown exactly
-- that trade-off and chose to show the surname anyway, because a coach who
-- is deciding whether to wait for or object to a pending claim (F3.4) needs
-- to recognise the claimant, and "Elena V." on a staff of forty is not a
-- name, it is a hint. So the owner now reads "Elena Vasquez" on both
-- surfaces. If you are reading this because a surname on an anonymous page
-- looked like a leak: it is not a bug, and it is not to be quietly put back.
--
-- What did NOT change is the other half of the bargain. The email, the user
-- id and the role stay behind SECURITY DEFINER exactly as before; the
-- projection is still the full name and nothing else, and `users` is still
-- unreadable to a visitor. "Never an address" holds.
--
-- Both bodies are the live definitions of 2026-09-02 verbatim — including the
-- `org_type = 'college'` filters 20260830000931 added to search_programs —
-- with the owner expression as the only edit. Both `returns table` lists are
-- untouched: `create or replace` will not accept a changed column list, and
-- the callers read `owner_display` by name.
create or replace function public.program_public_status(p_program_key text)
returns table (
  program_key   text,
  school_name   text,
  team          text,
  division      text,
  conference    text,
  state         text,
  status        text,
  -- 'Elena Vasquez' — the full name, never an address.
  owner_display text,
  -- How old the pending claim is. A coach deciding whether to wait or object
  -- needs to know if this happened six hours ago or six weeks ago (F3.4).
  claimed_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.program_key,
    p.school_name,
    p.team,
    p.division,
    p.conference,
    p.state,
    p.status,
    case
      when u.id is null then null
      else btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
    end,
    p.claimed_at
  from public.programs p
  left join public.users u on u.id = p.owner_user_id
  where p.program_key = p_program_key;
$$;

revoke all on function public.program_public_status(text) from public;
-- anon too: the claim flow's first screens run before an account exists.
grant execute on function public.program_public_status(text) to anon, authenticated;

comment on function public.program_public_status(text) is
  'Public projection for the claim status screens. Returns the owner''s full name ("Elena Vasquez") and never an address. The page is reachable by anonymous visitors and showing the surname was a deliberate product decision (20260902091500), not an oversight — do not abbreviate it back.';

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
    -- Trimmed and folded, but NOT yet escaped: the floor below has to see
    -- what the coach typed, not what escaping made of it.
    select lower(btrim(p_term)) as raw
  ),
  qe as (
    select
      q.raw                                          as raw,
      -- Half-open upper bound for the text_pattern_ops range scan.
      q.raw || chr(1114111)                          as raw_hi,
      replace(replace(q.raw, '%', '\%'), '_', '\_')  as term,
      least(coalesce(p_limit, 8), 20)                as n
    from q
    where length(q.raw) >= 2
  ),
  -- Tier 0. The btree half is a range, not a LIKE, so it stays indexable with
  -- a runtime bound; the abbreviation half is a prefix LIKE on the trigram
  -- index. Together they are a BitmapOr over both indexes.
  pre as (
    select p.program_key, p.school_name, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where p.org_type = 'college'
      and ((lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
            and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
        or lower(coalesce(p.school_abbrev, '')) like qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 1. Both sub-selects are uncorrelated, which is what makes the gate a
  -- One-Time Filter over the whole scan rather than a per-row test — a full
  -- page of prefix hits means this node is never executed at all.
  rest as (
    select p.program_key, p.school_name, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from pre) < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (lower(p.school_name) like '%' || qe.term || '%'
        or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
      and not ((lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
                and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
            or lower(coalesce(p.school_abbrev, '')) like qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  hits as (
    select 0 as tier, pre.*  from pre
    union all
    select 1 as tier, rest.* from rest
  )
  select
    h.program_key, h.school_name, h.team, h.division, h.conference, h.state, h.status,
    case
      when u.id is null then null
      else btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
    end
  from hits h
  left join public.users u on u.id = h.owner_user_id
  -- Same three keys 20260824165351 sorted by: prefix hits first, then the
  -- school, then men's before women's so a pair reads as a pair.
  order by h.tier, h.school_name, h.team
  limit (select ql.n from qe ql);
$$;

revoke all on function public.search_programs(text, integer) from public;
grant execute on function public.search_programs(text, integer) to anon, authenticated;

comment on function public.search_programs(text, integer) is
  'Claim-flow typeahead. Prefix hits off the btree index first, contains scan only if they do not fill the page; returns the owner''s full name ("Diane Wu") and never an address. The dropdown is reachable by anonymous visitors and showing the surname was a deliberate product decision (20260902091500), not an oversight — do not abbreviate it back.';
