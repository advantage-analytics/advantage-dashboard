-- A personal match with a label session cannot be purged
-- (admin_claim_match_storage_purge refuses it). Account deletion used to find
-- that out only at the purge step, after the caller had already been released
-- from their programs. Refuse here instead, before anything is claimed or
-- released, so a refusal changes nothing.
create or replace function public.prepare_my_account_deletion()
returns table(program_id uuid, profile_id uuid, retained integer, repointed integer)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (
    select 1
    from public.label_sessions ls
    join public.matches m on m.id = ls.match_id
    where m.created_by = auth.uid()
      and m.program_id is null
  ) then
    raise exception 'label-session-protected' using errcode = '22023';
  end if;
  if not public.admin_claim_actor_deletion(auth.uid()) then
    raise exception 'console-history-protected' using errcode = '22023';
  end if;
  return query select * from public.release_my_account_from_programs();
end;
$function$;
