-- Apps connected through Supabase Auth's OAuth 2.1 server (the Ask MCP
-- connector, docs/ask-mcp-connector.md) hold a full user JWT with a
-- `client_id` claim. Without this, such a token could write through
-- PostgREST and Storage whatever the person's own session can.
--
-- 1. A PostgREST pre-request hook refuses every non-read request from a token
--    that carries `client_id`, except the `ask_*` functions `/api/mcp` itself
--    calls as the user (reserve a question, read the quota and the cache,
--    save the answer, record the run, count the call). GET and HEAD run in a
--    read-only transaction, so they pass. A first-party session has no
--    `client_id` and returns on the first test.
-- 2. Restrictive Storage policies refuse object writes from the same tokens;
--    Storage does not go through PostgREST.
--
-- Adding a user-side RPC to the MCP path means adding it to the list below.

create or replace function public.oauth_client_request_guard()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  method text := coalesce(current_setting('request.method', true), '');
  path text := coalesce(current_setting('request.path', true), '');
begin
  if claims is null or claims ->> 'client_id' is null then
    return;
  end if;
  if method in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;
  if method = 'POST'
     and path ~ '^(/rest/v1)?/rpc/(ask_mcp_count_call|ask_reserve_question|ask_quota|ask_data_version|ask_cache_get|ask_cache_put|ask_save_exchange_ids|ask_record_run)$'
  then
    return;
  end if;
  raise exception using
    errcode = '42501',
    message = 'Apps connected to Advantage have read-only access.',
    hint = 'oauth_client_read_only';
end;
$$;

-- Every request runs it, signed out included.
grant execute on function public.oauth_client_request_guard() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.oauth_client_request_guard';
notify pgrst, 'reload config';

create policy "OAuth apps cannot upload objects"
  on storage.objects as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'client_id') is null);

create policy "OAuth apps cannot change objects"
  on storage.objects as restrictive for update to authenticated
  using ((auth.jwt() ->> 'client_id') is null)
  with check ((auth.jwt() ->> 'client_id') is null);

create policy "OAuth apps cannot delete objects"
  on storage.objects as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'client_id') is null);
