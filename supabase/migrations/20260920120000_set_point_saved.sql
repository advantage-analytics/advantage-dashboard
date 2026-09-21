-- Saving a point is workspace-wide: anyone who can SEE a match may bookmark
-- its points, not only the uploader.
--
-- The UPDATE policy on `points` stays creator-only on purpose. A policy cannot
-- name columns, so widening it would let every viewer rewrite a teammate's
-- score, result and timing. This function is the one narrow door: it checks
-- visibility with the same `visible_match_ids()` the SELECT policy uses, and
-- writes `saved` and nothing else.
--
-- Returns the stored value, or NULL when the point is not visible to the
-- caller (or does not exist) — the client treats NULL as "did not land".
--
-- STRICT: a NULL argument returns NULL without running. Unguarded, a NULL
-- `p_saved` trips `points.saved NOT NULL` only on a row the caller can see, so
-- the error itself would say "this point exists and is yours to see".
create or replace function public.set_point_saved(p_point_id uuid, p_saved boolean)
returns boolean
language sql
volatile
strict
security definer
set search_path to ''
as $$
  update public.points p
     set saved = p_saved
   where p.id = p_point_id
     and p.match_id in (select public.visible_match_ids())
  returning p.saved;
$$;

revoke all on function public.set_point_saved(uuid, boolean) from public, anon;
grant execute on function public.set_point_saved(uuid, boolean) to authenticated;
