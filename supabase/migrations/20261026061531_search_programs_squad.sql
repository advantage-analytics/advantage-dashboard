-- search_programs, narrowed to one squad.
--
-- A men's or women's team picking an opponent's school never plays the other
-- squad, and a college is two directory rows — so filtering in the browser
-- after an 8-row page left a women's team with half a page. The squad is now a
-- predicate inside every tier, so the limit counts only rows that can be
-- picked.
--
-- A new three-argument overload rather than a changed signature: replacing
-- the two-argument function's argument list means a drop and re-create, which
-- resets its anon grant (the claim flow searches signed out). The two-argument
-- function keeps its exact signature and grants and becomes a call into this
-- one with no squad. `p_team` has no default on purpose: PostgREST resolves by
-- the named arguments sent, so a call naming only `p_term`/`p_limit` matches
-- the two-argument function alone and is never ambiguous.
--
-- `p_team` narrows only for 'mens' or 'womens'. Anything else — null, 'coed',
-- a typo — searches every squad, the same as the two-argument call: the
-- directory holds colleges only, and a college is never co-ed, so a co-ed
-- club narrowing to 'coed' would otherwise find nothing.

create or replace function public.search_programs(
  p_term text,
  p_team text,
  p_limit integer default 8
)
returns table(
  program_key text,
  school_name text,
  team text,
  division text,
  conference text,
  state text,
  status text,
  owner_display text
)
language sql
stable
security definer
set search_path to ''
as $function$
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
      least(coalesce(p_limit, 8), 20)                as n,
      -- The one squad to keep, or null for every squad.
      case when p_team in ('mens', 'womens') then p_team end as squad
    from q
    where length(q.raw) >= 2
  ),
  -- Tier 0. The btree half is a range, not a LIKE, so it stays indexable with
  -- a runtime bound; the abbreviation half is a prefix LIKE on the trigram
  -- index. Together they are a BitmapOr over both indexes.
  school_pre as (
    select p.program_key, p.school_name, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and ((lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
            and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
        or lower(coalesce(p.school_abbrev, '')) like qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 1. Both sub-selects are uncorrelated, which is what makes the gate a
  -- One-Time Filter over the whole scan rather than a per-row test — a full
  -- page of prefix hits means this node is never executed at all.
  school_rest as (
    select p.program_key, p.school_name, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from school_pre) < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and (lower(p.school_name) like '%' || qe.term || '%'
        or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
      and not ((lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
                and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
            or lower(coalesce(p.school_abbrev, '')) like qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 2. Conference prefix — "Big Ten" against 'Big Ten Conference (B1G)'.
  -- A range rather than a prefix LIKE, for the same reason tier 0 is: the
  -- pattern here is built from a parameter, and the planner only rewrites a
  -- LIKE into an index range when the pattern is constant at plan time.
  -- Excluding the school-contains predicate also excludes the school-prefix
  -- one, since a prefix hit is always also a contains hit.
  conf_pre as (
    select p.program_key, p.school_name, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from school_pre) + (select count(*) from school_rest)
          < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and lower(coalesce(p.conference, '')) operator(pg_catalog.~>=~) qe.raw
      and lower(coalesce(p.conference, '')) operator(pg_catalog.~<~) qe.raw_hi
      and not (lower(p.school_name) like '%' || qe.term || '%'
            or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 3. Conference contains — this is what catches "B1G" inside
  -- 'Big Ten Conference (B1G)'.
  conf_rest as (
    select p.program_key, p.school_name, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from school_pre) + (select count(*) from school_rest)
          + (select count(*) from conf_pre) < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and lower(coalesce(p.conference, '')) like '%' || qe.term || '%'
      -- Must be the same range test tier 2 matched on, or a row lands twice.
      and not (lower(coalesce(p.conference, '')) operator(pg_catalog.~>=~) qe.raw
           and lower(coalesce(p.conference, '')) operator(pg_catalog.~<~) qe.raw_hi)
      and not (lower(p.school_name) like '%' || qe.term || '%'
            or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  hits as (
    select 0 as tier, school_pre.*  from school_pre
    union all
    select 1 as tier, school_rest.* from school_rest
    union all
    select 2 as tier, conf_pre.*    from conf_pre
    union all
    select 3 as tier, conf_rest.*   from conf_rest
  )
  select
    h.program_key, h.school_name, h.team, h.division, h.conference, h.state, h.status,
    case
      when u.id is null then null
      else btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
    end
  from hits h
  left join public.users u on u.id = h.owner_user_id
  -- School hits first, then the school, then men's before women's so a pair
  -- reads as a pair.
  order by h.tier, h.school_name, h.team
  limit (select ql.n from qe ql);
$function$;

-- Public like the two-argument function: the route behind both is public, and
-- every row is a published directory fact.
revoke all on function public.search_programs(text, text, integer) from public;
grant execute on function public.search_programs(text, text, integer)
  to anon, authenticated, service_role;

comment on function public.search_programs(text, text, integer) is
  'Program typeahead narrowed to one squad (p_team mens|womens; anything else searches all). '
  'The two-argument search_programs is this with no squad.';

-- The two-argument function, same signature and grants, now a call into the
-- three-argument one. Still SECURITY DEFINER, so the inner call runs as its
-- owner whatever the caller's grants.
create or replace function public.search_programs(p_term text, p_limit integer default 8)
returns table(
  program_key text,
  school_name text,
  team text,
  division text,
  conference text,
  state text,
  status text,
  owner_display text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.search_programs(p_term, null::text, p_limit);
$function$;
