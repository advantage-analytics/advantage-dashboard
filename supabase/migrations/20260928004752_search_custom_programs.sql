-- search_custom_programs: an authenticated typeahead over the custom orgs.
--
-- Custom orgs (club, high_school, academy, other) are private workspaces:
-- 20260830050000 narrowed the `programs` SELECT policy so a non-member cannot
-- read their row at all, and `search_programs` filters to org_type = 'college'
-- at the SQL layer on purpose. That leaves a second coach at "Centennial" with
-- no way to discover that a teammate already made the club — they can only
-- create a duplicate. This function publishes the MINIMUM a signed-in user
-- needs to recognise an existing team: its name, its type and its owner's
-- first name with a surname initial ("Elena V."). Nothing else crosses the
-- definer boundary — not `owner_user_id`, not `status`, not a contact column,
-- not the flags. The projection is closed the way `redactForPlayer` is in
-- programs-server.ts: adding a column here has to be a deliberate act.
--
-- Authenticated only. EXECUTE is revoked from `anon` and `public`: the college
-- directory is public because it is on the ITA website, but a private club's
-- existence is not a published fact, so an anonymous visitor gets a permission
-- error rather than a row. The route that calls this
-- (`/api/programs/custom-search`) checks the session first and answers
-- `Cache-Control: private, no-store` — never the shared `s-maxage` the public
-- college search uses.
--
-- The member-only SELECT policy on `programs` is untouched: a non-member who
-- learns a program_id from this function still reads nothing from the table.
--
-- Ranking copies `search_programs` tiers 0–1 — prefix on lower(school_name)
-- first (a range over `programs_school_name_prefix_idx`, not a LIKE, so the
-- planner can use the btree with a runtime bound), then contains (the trigram
-- half of `programs_school_search_trgm_idx`). The abbreviation and conference
-- tiers do not apply: custom rows carry neither. Within a tier: name, then id,
-- so two clubs with one name always come back in one order.
--
-- p_org_type narrows to one of the four custom types when it is one of them;
-- anything else (null, '', 'college', a typo) means "every custom type".
-- 'college' is deliberately not a valid narrowing — this function never
-- returns a college row whatever the argument says.

create or replace function public.search_custom_programs(
  p_term     text,
  p_org_type text,
  p_limit    integer default 8
)
returns table (
  program_id    uuid,
  school_name   text,
  org_type      text,
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
      case
        when p_org_type in ('club', 'high_school', 'academy', 'other')
          then p_org_type
        else null
      end                                            as kind
    from q
    where length(q.raw) >= 2
  ),
  -- Tier 0. Name prefix, as a range so the btree index applies.
  name_pre as (
    select p.id, p.school_name, p.org_type, p.owner_user_id
    from public.programs p
    cross join qe
    where p.org_type <> 'college'
      and (qe.kind is null or p.org_type = qe.kind)
      and lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
      and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi
    order by p.school_name, p.id
    limit (select ql.n from qe ql)
  ),
  -- Tier 1. Name contains, only when the prefix tier left the page short.
  -- Both sub-selects are uncorrelated, so the gate is a One-Time Filter over
  -- the scan rather than a per-row test.
  name_rest as (
    select p.id, p.school_name, p.org_type, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from name_pre) < (select qc.n from qe qc)
      and p.org_type <> 'college'
      and (qe.kind is null or p.org_type = qe.kind)
      and lower(p.school_name) like '%' || qe.term || '%'
      and not (lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
           and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
    order by p.school_name, p.id
    limit (select ql.n from qe ql)
  ),
  hits as (
    select 0 as tier, name_pre.*  from name_pre
    union all
    select 1 as tier, name_rest.* from name_rest
  )
  select
    h.id,
    h.school_name,
    h.org_type,
    -- "Elena V." — first name plus a surname initial. Enough to recognise a
    -- colleague, and deliberately less than the college directory's full
    -- name (20260902091500): that one is public by product decision, this
    -- one is a private club's owner shown to strangers who are merely signed
    -- in. Null when the owner row is gone or carries no name at all.
    case
      when u.id is null then null
      else nullif(
        btrim(
          coalesce(u.first_name, '')
          || ' '
          || case
               when nullif(btrim(coalesce(u.last_name, '')), '') is null then ''
               else left(btrim(u.last_name), 1) || '.'
             end
        ),
        ''
      )
    end
  from hits h
  left join public.users u on u.id = h.owner_user_id
  order by h.tier, h.school_name, h.id
  limit (select ql.n from qe ql);
$function$;

-- create function grants EXECUTE to PUBLIC by default, and this is a security
-- definer over public.users: close it, then open it to signed-in users only.
revoke all on function public.search_custom_programs(text, text, integer) from public;
revoke execute on function public.search_custom_programs(text, text, integer) from anon;
grant execute on function public.search_custom_programs(text, text, integer) to authenticated;
grant execute on function public.search_custom_programs(text, text, integer) to service_role;

comment on function public.search_custom_programs(text, text, integer) is
  'Signed-in typeahead over custom orgs (org_type <> college): name prefix, then contains; optionally narrowed to one custom org_type. Projects only program_id, school_name, org_type and the owner''s first name + surname initial — never owner_user_id, status or a contact column. Not granted to anon: a private club''s existence is not a published fact.';
