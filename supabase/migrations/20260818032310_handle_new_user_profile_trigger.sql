-- Profile rows were created by the /confirm and /callback route handlers, which
-- means a profile only existed if the user happened to travel through one of
-- them. Any path that establishes a session without passing through those
-- routes -- email confirmation switched off, an admin-created user, a future
-- provider -- left an auth user with no public.users row, and every RLS-scoped
-- query in the dashboard then returned nothing for them.
--
-- Creating the row in a trigger makes it atomic with the auth user instead.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_first     text;
  v_last      text;
begin
  -- Google hands us full_name/name; email signups have neither. Split on the
  -- first space so "Ana Maria Vasquez" keeps "Maria Vasquez" as the surname.
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if v_full_name is not null then
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := nullif(trim(substr(v_full_name, length(v_first) + 1)), '');
  end if;

  insert into public.users (id, email, first_name, last_name)
  values (new.id, new.email, v_first, v_last)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- A raise here would abort the signup itself, so a profile that cannot be
    -- written must never cost the user their account. The row is recoverable;
    -- the failed signup is not.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
