-- The three restrictive Storage policies from oauth_client_read_only called
-- auth.jwt() once per row; wrapped in a select it runs once per statement
-- (Supabase's RLS-performance rule). Same rule, same roles.
--
-- Operational note on that migration's hook: PostgREST calls
-- public.oauth_client_request_guard() before every request. Dropping or
-- renaming it without first clearing pgrst.db_pre_request on the
-- authenticator role makes every PostgREST request fail.

alter policy "OAuth apps cannot upload objects" on storage.objects
  with check (((select auth.jwt()) ->> 'client_id') is null);

alter policy "OAuth apps cannot change objects" on storage.objects
  using (((select auth.jwt()) ->> 'client_id') is null)
  with check (((select auth.jwt()) ->> 'client_id') is null);

alter policy "OAuth apps cannot delete objects" on storage.objects
  using (((select auth.jwt()) ->> 'client_id') is null);
