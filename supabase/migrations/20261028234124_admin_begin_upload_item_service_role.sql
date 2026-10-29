-- admin_begin_upload_item is only ever called inside the console's SECURITY
-- DEFINER RPCs (which run as its owner), never by a client or the app. Like
-- the other functions 20261028231751 changed, EXECUTE goes to service_role
-- only; it still re-checks auth.uid() and is_admin() itself.
revoke all on function public.admin_begin_upload_item(uuid,uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_begin_upload_item(uuid,uuid,uuid,text,text,jsonb) to service_role;
