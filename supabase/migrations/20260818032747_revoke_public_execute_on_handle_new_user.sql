-- handle_new_user is a trigger function, but living in the `public` schema means
-- PostgREST exposes it at /rest/v1/rpc/handle_new_user and the default grant to
-- PUBLIC makes it callable by anon. Nothing good comes of that surface.
--
-- Trigger execution is unaffected: EXECUTE is checked when the trigger is
-- created, not each time it fires, and the insert into auth.users is performed
-- by supabase_auth_admin rather than by anon or authenticated.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
