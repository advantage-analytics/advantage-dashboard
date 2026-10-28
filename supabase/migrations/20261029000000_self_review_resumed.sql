-- Self review comes back (Advantage Review step 2). Undoes
-- `20261028155028_self_review_paused`: the signed-in caller may again ask who
-- may fix a match, read its self review and save fixes. Every check stays
-- inside the functions (`can_fix_match_points`, the Verified lock); the two
-- reading helpers stay revoked, since only the definer `self_review_save`
-- calls them.

grant execute on function public.can_fix_match_points(uuid) to authenticated;
grant execute on function public.self_review_state(uuid) to authenticated;
grant execute on function public.self_review_save(uuid, jsonb) to authenticated;
