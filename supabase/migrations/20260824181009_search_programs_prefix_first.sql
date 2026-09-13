-- Typeahead for screen F3, restructured to answer from the prefix index first
-- and only fall through to the contains scan when the prefix cannot fill the
-- page. Applied live 2026-08-24 as version 20260824181009.
--
-- Supersedes 20260824165351_search_programs_contains.sql. Everything that file
-- said about the *shape* still holds and is unchanged here: one SECURITY
-- DEFINER call for the whole page because the right-hand column has to say who
-- already owns a program and an anonymous visitor cannot read `users`; an
-- owner rendered "D. Wu"; never an address. The match is unchanged too — the
-- term still hits anywhere in the school name or the abbreviation, prefix hits
-- still sort above mid-string ones, so "angeles" still finds University of
-- California, Los Angeles and "ucla" and "nccu" still land on the row the
-- coach meant, first.
--
--
-- What that file got wrong
--
-- Its cost paragraph claimed "from three characters up the scan is gone",
-- with "angeles" at 0.3 ms as the evidence. That is true of "angeles" and
-- false as a rule. A trigram index is driven by how many rows the term
-- matches, not by how long the term is:
--
--     term        matches   before
--     un    (2)     1,352    9.90 ms
--     univ  (4)     1,228    6.78 ms
--     universi (8)  1,228    6.56 ms      <- four more characters, same scan
--     angeles (7)       3    0.11 ms
--
-- "universi" is eight characters and still reads the whole table, because
-- 1,228 of the 1,941 rows contain it. Length bought nothing; selectivity is
-- the whole variable. And the terms a coach actually types on the way to a
-- school are the unselective ones — 63% of the directory contains "univ" —
-- so the scan was not an edge case, it was the common keystroke.
--
--
-- What this migration does
--
-- Two branches instead of one predicate.
--
--   pre   prefix hits: school_name range-scanned on
--         programs_school_name_prefix_idx, OR'd with an abbreviation prefix
--         off the trigram index. Ordered and capped at the page size.
--   rest  the previous contains predicate, minus anything `pre` already
--         matched — and gated behind `(select count(*) from pre) < n`.
--
-- The gate is two uncorrelated sub-selects, so the planner resolves it as a
-- One-Time Filter and the contains scan comes back "never executed" whenever
-- the prefix branch filled the page. That covers exactly the keystroke that
-- used to cost the most: measured on the live directory, 1,725 of the 1,941
-- programs (89%) sit under a two-character name prefix that already matches
-- eight or more programs, so the second keystroke — the one that matched the
-- most rows and had no trigram to fall back on — now fills the page from the
-- index and never reaches the scan. Later keystrokes narrow the prefix and do
-- reach it again, by which point the term is selective and the trigram index
-- answers in a fraction of a millisecond. Both ends are covered; it was the
-- middle that was never anybody's.
--
-- The prefix predicate is written as `~>=~` / `~<~` against
-- `raw || chr(1114111)`, not as `like raw || '%'`, and that is deliberate.
-- Postgres only converts LIKE into an index range when the pattern is a
-- *constant*; here the pattern comes from a parameter, so `like` would have
-- planned as a filter and the btree index would have sat idle — which is
-- exactly how it had been sitting since the day it was created.
-- 20260817074946, the prefix-only search the index was built for, also wrote
-- `like q.term || '%'` over a parameter, so it never got a range scan either;
-- its header's promise that the index would keep the scan away was never
-- true. `~>=~` and `~<~` are the text_pattern_ops operators themselves,
-- indexable with a runtime bound. The upper bound is the term plus the
-- highest code point — the same half-open range the planner builds for itself
-- when it *can* rewrite a LIKE. (chr(1114111) assumes UTF8, which this
-- database is, and would only mis-order a school name that literally
-- contained U+10FFFF.)
--
-- Order is preserved by construction rather than by a CASE: `pre` is tier 0,
-- `rest` is tier 1, and the final sort is (tier, school_name, team) — the same
-- three keys, in the same order, that 20260824165351 sorted by. Verified
-- against the live directory over 6,185 distinct terms (every 2–6 character
-- prefix of every school name, every 2–5 character prefix of every
-- abbreviation, and every 2–7 character slice from mid-name): identical row
-- sets and an identical (school_name, team) sequence for every one. The only
-- rows that swap are pairs sharing both a school name and a squad — two
-- "Anderson University" mens programs — which neither version ever ordered,
-- then or now.
--
--
-- The two-character floor now measures the trimmed input
--
-- 20260824165351 escaped `%` and `_` into the term and *then* tested
-- `length(term) >= 2`, so a single `_` became `\_`, measured two, and bought
-- a full scan: 7.14 ms and 149 buffers per call for a one-character search
-- the floor exists to reject. The floor is now taken on the trimmed input
-- before escaping — 0.08 ms, 4 buffers. The escaping itself is unchanged and
-- still applies to the contains and abbreviation patterns, so a coach who
-- types a literal `%` still matches a literal `%`.
--
--
-- What it costs, and how it was measured
--
-- Every number here is Execution Time from EXPLAIN (ANALYZE, BUFFERS) over N
-- lateral calls, divided by N, warm, against the live directory:
--
--     select count(*) from generate_series(1, N) as g(i)
--     cross join lateral public.search_programs(
--       '<term>' || repeat('x', g.i * 0), 8) s;
--
-- `repeat('x', g.i * 0)` is the empty string, but `g.i` is a Var, so the term
-- reaching the function is not a constant and the planner cannot fold it into
-- the LIKE patterns. That matters: a folded term plans a query nobody runs.
-- N is 100 for "un" and "univ", 200 for "universi" and "_", 500 for "angeles";
-- "before" was taken against 20260824165351 immediately before this migration
-- was applied, "after" against this function immediately after.
--
--     term            N     before     after      buffers/call
--     un       (2)   100    9.90 ms    0.49 ms    154 -> 35
--     univ     (4)   100    6.78 ms    0.38 ms    109 -> 38
--     universi (8)   200    6.56 ms    0.36 ms    121 -> 42
--     _        (1)   200    7.14 ms    0.08 ms    149 -> 4
--     angeles  (7)   500    0.11 ms    0.17 ms     28 -> 45
--
-- The last row is the honest cost. A term that is selective but is nobody's
-- name prefix now probes the prefix branch, finds nothing, and pays for the
-- contains scan anyway: about 0.05 ms and 17 buffers more per call. That is
-- the trade — 0.05 ms onto the terms that were already fast, 9.4 ms off the
-- ones that were not, on a call made on every keystroke.
--
-- programs_school_name_prefix_idx is kept, not dropped, and this is why: the
-- prefix branch is the only thing in the codebase that has ever used it. It
-- was created for the prefix-only search of 20260817074946 and orphaned by
-- 20260824165351's leading wildcard; `pre` is what puts it back to work, and
-- it is what the 20x on "un" is made of. programs_school_search_trgm_idx is
-- kept too — `rest` and the abbreviation prefix both ride it.
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
    where (lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
           and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
       or lower(coalesce(p.school_abbrev, '')) like qe.term || '%'
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
      else btrim(
        coalesce(left(u.first_name, 1) || '. ', '') || coalesce(u.last_name, '')
      )
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
  'Claim-flow typeahead. Prefix hits off the btree index first, contains scan only if they do not fill the page; returns an owner as "D. Wu" and never an address.';
