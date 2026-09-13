-- search_programs: also match on conference.
--
-- A coach adding an event searches the program directory by typing into one box.
-- Until now that box only looked at school_name and school_abbrev, so "Big Ten"
-- and "B1G" both returned nothing even though 32 programs carry
-- conference = 'Big Ten Conference (B1G)'. Conference is the second way a coach
-- names an opponent, so it belongs in the same box.
--
-- Conference values. Most are the full name followed by a parenthesised
-- abbreviation — 'Big Ten Conference (B1G)', 'Ivy League (IVY)' — which is why
-- no separate abbreviation column is needed: the prefix tier handles "Big Ten"
-- and the contains tier finds "B1G" inside the parentheses. 181 of the 1,940
-- non-null values do NOT carry one, though ('Patriot League', 'Summit League',
-- 'Conference Carolinas', 'Region 3'…). Those match on their full name only, so
-- a coach typing "PL" for Patriot League still gets nothing. Matching an
-- abbreviation that is not written down anywhere needs a real conference table
-- with an abbrev column, which is deliberately out of scope here.
--
-- Ranking. The previous function had two tiers, school prefix then school
-- contains. Those two are kept byte-for-byte and the two conference tiers are
-- appended *below* them:
--
--   0  school name / abbreviation, prefix     <- unchanged
--   1  school name / abbreviation, contains   <- unchanged
--   2  conference, prefix
--   3  conference, contains
--
-- School before conference is the outer key, prefix before contains the inner
-- one, so a school named like a conference always wins. That order is load
-- bearing rather than cosmetic. Sorting on prefix-vs-contains first instead
-- (school prefix, conference prefix, school contains, ...) was tried and
-- regressed the obvious query: "Michigan" filled its page with Adrian and
-- Albion — members of the Michigan Intercollegiate Athletic Association — and
-- pushed University of Michigan off it entirely. Because tiers 0 and 1 are
-- untouched and conference hits can only ever land beneath them, no
-- school-name query can lose or reorder a row it returns today; conference
-- hits only fill a page that school matching left short. Verified by diffing
-- 800 school-derived terms against the previous definition: zero rows lost or
-- reordered, 11 terms newly answered, 27 short pages filled out.
--
-- Within a tier the sort is unchanged: school, then men's before women's so a
-- pair reads as a pair.
--
-- Indexes. The two conference tiers are gated on the school tiers being short
-- of a page, but that is the COMMON case, not a rare one — a coach typing one
-- school's name gets two rows back and therefore runs both conference tiers on
-- every keystroke. Unindexed they were two sequential scans of the whole table
-- each, so the indexes below are part of this change rather than a follow-up;
-- /api/programs/search is unauthenticated and pays this per keystroke. Their
-- expressions have to match the tier predicates exactly —
-- lower(coalesce(conference, '')) — because a text_pattern_ops btree and a
-- trigram GIN are only used when they do.
--
-- Indexed and with tier 2 written as a range (see there), the cost of the two
-- extra tiers is small. Measured on search_programs('stanford', 8), a
-- deliberately bad case because two school hits leave the page short and run
-- every tier: 1103 shared buffers / 6.9 ms for the old two-tier function
-- against 1141 / 8.2 ms for this one. The bulk of both figures is the
-- pre-existing tier-1 trigram scan, not the new tiers.
--
-- Shape is otherwise preserved deliberately: same signature, same eight return
-- columns (programs-server.ts maps them by name), security definer, empty
-- search_path. The revoke and grants below are re-issued so this file stands
-- alone on a fresh database: create function grants EXECUTE to PUBLIC by
-- default, and this one is security definer over public.users.

create index if not exists programs_conference_prefix_idx
  on public.programs (lower(coalesce(conference, '')) text_pattern_ops);

create index if not exists programs_conference_trgm_idx
  on public.programs using gin (lower(coalesce(conference, '')) gin_trgm_ops);

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
      least(coalesce(p_limit, 8), 20)                as n
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
  -- LIKE into an index range when the pattern is constant at plan time. Written
  -- as LIKE this tier sequentially scanned every row on every keystroke.
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
  -- Same three keys 20260824165351 sorted by, with school-vs-conference folded
  -- into the tier: school hits first, then the school, then men's before
  -- women's so a pair reads as a pair.
  order by h.tier, h.school_name, h.team
  limit (select ql.n from qe ql);
$function$;

revoke all on function public.search_programs(text, integer) from public;
grant execute on function public.search_programs(text, integer) to anon;
grant execute on function public.search_programs(text, integer) to authenticated;
grant execute on function public.search_programs(text, integer) to service_role;

-- Carried forward from 20260902091500, with the tier description brought up to
-- date. The surname note is the record of a product decision — keep it.
comment on function public.search_programs(text, integer) is
  'Claim-flow typeahead. School name/abbrev first (prefix, then contains), then conference (prefix, then contains), each tier scanned only if the ones above left the page short; returns the owner''s full name ("Diane Wu") and never an address. The dropdown is reachable by anonymous visitors and showing the surname was a deliberate product decision (20260902091500), not an oversight — do not abbreviate it back.';
