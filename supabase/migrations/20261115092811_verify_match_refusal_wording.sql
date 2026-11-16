-- verify_match's refusal named only admins, but since
-- 20261114091835_label_publish_check a labeller's publish verifies too. The
-- live body, with only the refusal sentence changed. Grants are restated
-- because a replace keeps them, and this keeps the file self-describing.

create or replace function public.verify_match(p_match_id uuid, p_actor uuid, p_errors_judged boolean default false)
returns timestamp with time zone
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not exists (
    select 1 from public.users u where u.id = p_actor and (u.is_admin or u.is_labeller)
  ) then
    raise exception 'Only an Advantage admin or labeller can verify a match'
      using errcode = '42501';
  end if;
  update public.matches
     set verified = true,
         verified_at = now(),
         verified_by = p_actor,
         errors_judged_at = case
           when p_errors_judged then now()
           else errors_judged_at
         end
   where id = p_match_id
  returning verified_at into v_at;
  if v_at is null then
    raise exception 'Match % not found', p_match_id using errcode = 'P0002';
  end if;
  -- The stat row was computed before the stamp existed (apply-session.ts
  -- recompute); count forced errors now that the match is judged.
  if p_errors_judged then
    perform public.calculate_match_stats(p_match_id);
  end if;
  return v_at;
end;
$$;

revoke execute on function public.verify_match(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.verify_match(uuid, uuid, boolean) to service_role;
