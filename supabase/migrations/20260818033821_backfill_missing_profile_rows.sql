-- handle_new_user fixes profile creation going forward, and the name backfill
-- repaired rows that already existed -- but neither creates a row for an auth
-- user that never got one. Those accounts authenticate fine and then see an
-- empty dashboard, because every RLS-scoped query joins through public.users.
--
-- Currently a no-op (the route handlers happened to cover every existing user),
-- which is exactly when it is cheap to run. It also closes the window between
-- this deploy and the trigger being live.
insert into public.users (id, email, first_name, last_name)
select u.id,
       u.email,
       split_part(m.full_name, ' ', 1),
       nullif(trim(substr(m.full_name, length(split_part(m.full_name, ' ', 1)) + 1)), '')
from auth.users u
cross join lateral (
  select nullif(trim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    ''
  )), '') as full_name
) m
on conflict (id) do nothing;
