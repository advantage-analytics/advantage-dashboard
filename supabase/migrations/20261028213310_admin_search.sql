-- The admin header's Search: teams, people, matches and conferences, grouped,
-- matched ignoring accents and case and tolerating typos.
--
-- `unaccent` folds "José" to "jose"; `pg_trgm` (already installed, in
-- `extensions`) scores "Stanfrod" against "Stanford" with
-- `word_similarity`, so a typo still lands. Both run over a lower-cased,
-- unaccented copy built by `admin_search_fold()`.
--
-- No indexes: the console searches a few thousand rows in total (programs is
-- the largest, ~2k), well under what a sequential scan answers in a
-- keystroke's debounce. Add trigram indexes on the folded expressions if a
-- table grows past that.
--
-- SECURITY DEFINER with EXECUTE for `service_role` only, called by the
-- console's service-role client after `requireAdminOrNotFound()`. The caller
-- passes its own `auth.getUser()` id as `p_viewer` and the function re-checks
-- that the viewer is an admin itself — a definer function that trusted its
-- caller would be one leaked key away from a directory of every account.

create extension if not exists unaccent with schema extensions;

create or replace function public.admin_search_fold(p_text text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, '')));
$function$;

revoke execute on function public.admin_search_fold(text) from public, anon, authenticated;
grant execute on function public.admin_search_fold(text) to service_role;

create or replace function public.admin_search(
  p_viewer uuid,
  p_term text,
  p_limit integer default 6
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  extra jsonb,
  score real
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  q text := public.admin_search_fold(btrim(p_term));
  q_like text;
  q_hex text;
  lim integer := least(greatest(coalesce(p_limit, 6), 1), 20);
begin
  if p_viewer is null
     or not exists (select 1 from public.users u where u.id = p_viewer and u.is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if length(q) = 0 then
    return;
  end if;

  q_like := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- A match id, whole or in part: hex digits and dashes only, 4+ characters.
  q_hex := case when q ~ '^[0-9a-f-]{4,}$' then q else null end;

  return query
  with
  teams as (
    select 'team'::text as kind, p.id,
           p.school_name || case p.team when 'mens' then ' Men''s' when 'womens' then ' Women''s' else '' end as title,
           concat_ws(' · ', p.division, p.conference) as subtitle,
           jsonb_build_object('crestPath', p.crest_path, 'shortCode', p.school_abbrev) as extra,
           greatest(
             case when public.admin_search_fold(p.school_name) like q_like escape '\' then 1.0 else 0 end,
             extensions.word_similarity(q, public.admin_search_fold(p.school_name))
           )::real as score
      from public.programs p
  ),
  people as (
    select 'person'::text as kind, u.id,
           coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as title,
           u.email as subtitle,
           jsonb_build_object('avatarPath', u.avatar_path) as extra,
           greatest(
             case when public.admin_search_fold(concat_ws(' ', u.first_name, u.last_name, u.email)) like q_like escape '\' then 1.0 else 0 end,
             extensions.word_similarity(q, public.admin_search_fold(concat_ws(' ', u.first_name, u.last_name))),
             extensions.word_similarity(q, public.admin_search_fold(u.email)) * 0.9
           )::real as score
      from public.users u
  ),
  games as (
    select 'match'::text as kind, m.id,
           coalesce(m.player1_name, 'Unknown') || ' vs ' || coalesce(m.player2_name, 'Unknown') as title,
           m.tournament_name as subtitle,
           jsonb_build_object('date', m.date, 'programId', m.program_id) as extra,
           greatest(
             case when q_hex is not null and m.id::text like q_hex || '%' then 1.2
                  when q_hex is not null and m.id::text like '%' || q_hex || '%' then 1.1
                  else 0 end,
             case when public.admin_search_fold(concat_ws(' ', m.player1_name, m.player2_name)) like q_like escape '\' then 1.0 else 0 end,
             extensions.word_similarity(q, public.admin_search_fold(concat_ws(' ', m.player1_name, m.player2_name)))
           )::real as score
      from public.matches m
  ),
  confs as (
    select 'conference'::text as kind, c.id,
           c.name as title,
           concat_ws(' · ', c.short_name, c.division) as subtitle,
           jsonb_build_object('crestPath', c.crest_path, 'shortName', c.short_name) as extra,
           greatest(
             case when public.admin_search_fold(concat_ws(' ', c.name, c.short_name, c.label)) like q_like escape '\' then 1.0 else 0 end,
             extensions.word_similarity(q, public.admin_search_fold(c.name)),
             extensions.word_similarity(q, public.admin_search_fold(c.short_name))
           )::real as score
      from public.conferences c
  )
  (select * from teams t where t.score >= 0.45 order by t.score desc, t.title limit lim)
  union all
  (select * from people x where x.score >= 0.45 order by x.score desc, x.title limit lim)
  union all
  (select * from games g where g.score >= 0.45 order by g.score desc, (g.extra->>'date') desc nulls last limit lim)
  union all
  (select * from confs c where c.score >= 0.45 order by c.score desc, c.title limit lim);
end;
$function$;

revoke execute on function public.admin_search(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.admin_search(uuid, text, integer) to service_role;
