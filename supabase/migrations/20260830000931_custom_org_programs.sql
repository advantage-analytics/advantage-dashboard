-- Non-collegiate programs: clubs, high schools, academies, and other
-- organizations created directly by their owner rather than claimed from the
-- ITA directory.
--
-- Shape: a discriminator on `programs` rather than a second table, because
-- program_members, the processing budget, and every RLS predicate already hang
-- off programs.id. Collegiate-only columns relax to nullable, with CHECKs
-- keeping them mandatory on 'college' rows so the directory invariants hold —
-- and program_key mandatory-NULL on custom rows, so a custom org can never be
-- resolved by /claim/[programKey], program_public_status(), or anything else
-- that addresses programs by their ITA key.

alter table public.programs
  add column org_type text not null default 'college'
    constraint programs_org_type_check
      check (org_type in ('college', 'club', 'high_school', 'academy', 'other'));

comment on column public.programs.org_type is
  'What kind of organization this program is. ''college'' rows come from the '
  'seeded ITA directory and enter ownership through the claim flow; every '
  'other value is a self-serve org whose creator simply owns it '
  '(create_custom_program). Collegiate-only columns are enforced non-null '
  'for ''college'' by programs_college_fields_check.';

alter table public.programs alter column program_key drop not null;
alter table public.programs alter column school_group drop not null;
alter table public.programs alter column team drop not null;

alter table public.programs drop constraint programs_team_check;
alter table public.programs
  add constraint programs_team_check
    check (team is null or team in ('mens', 'womens'));

-- Directory rows keep their invariants intact; custom rows must NOT carry an
-- ITA key, which is what keeps them unreachable from every claim surface.
alter table public.programs
  add constraint programs_college_fields_check
    check (
      case
        when org_type = 'college'
          then program_key is not null
           and school_group is not null
           and team is not null
        else program_key is null
      end
    );

-- The claim flow's typeahead is a public directory of collegiate programs.
-- Custom orgs are private workspaces, not directory entries: filter them out
-- at the definer, which covers /api/programs/search too. Body otherwise
-- identical to 20260824165351's revision.
create or replace function public.search_programs(p_term text, p_limit integer default 8)
returns table(
  program_key text, school_name text, team text, division text,
  conference text, state text, status text, owner_display text
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
$function$;

-- Self-serve creation. There is no external record to verify a club or academy
-- against, so the creator simply owns it: program active immediately, creator
-- as owner, upload enabled — no pending claim, no review, no email loop.
--
-- SECURITY DEFINER because `programs` and `program_members` have no INSERT
-- policies at all (every write path is a definer function or the service
-- role), and the two inserts must be one atomic step. Everything privileged is
-- derived from auth.uid(); the caller controls only the new org's own name
-- and type, both validated here.
create or replace function public.create_custom_program(
  p_name text,
  p_org_type text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 'college' is deliberately not accepted: collegiate programs enter through
  -- the seeded directory and the claim flow, never through self-serve
  -- creation — that is what keeps the claim flow's review meaning anything.
  if p_org_type is null
     or p_org_type not in ('club', 'high_school', 'academy', 'other') then
    raise exception 'invalid org type' using errcode = '22023';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  insert into public.programs (
    org_type, school_name,
    program_key, school_group, team,
    status, owner_user_id, claimed_at
  ) values (
    p_org_type, v_name,
    null, null, null,
    'active', v_uid, now()
  )
  returning id into v_id;

  insert into public.program_members (program_id, user_id, role, upload_enabled)
  values (v_id, v_uid, 'owner', true);

  return jsonb_build_object('program_id', v_id);
end;
$function$;

-- The function checks auth itself, but there is no reason for anon to be able
-- to call it at all.
revoke execute on function public.create_custom_program(text, text) from public, anon;
grant execute on function public.create_custom_program(text, text) to authenticated;
