-- The route handlers inserted profiles with first_name/last_name hardcoded to
-- null, discarding the name Google had already supplied. handle_new_user now
-- reads it for new signups; this recovers it for the accounts created before.
--
-- Scoped to rows where BOTH names are null, so nothing a user has since typed
-- into their profile is overwritten.
update public.users p
set first_name = split_part(m.full_name, ' ', 1),
    last_name  = nullif(trim(substr(m.full_name, length(split_part(m.full_name, ' ', 1)) + 1)), '')
from (
  select u.id,
         nullif(trim(coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           ''
         )), '') as full_name
  from auth.users u
) m
where m.id = p.id
  and m.full_name is not null
  and p.first_name is null
  and p.last_name is null;
