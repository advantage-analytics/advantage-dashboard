-- Staff read path for pending join requests ("Request an invite" rows).
--
-- `program_requests` is deliberately server-only: RLS is enabled with no
-- policies and the anon/authenticated grants were revoked by 20260818041110.
-- That stays exactly as it is — the table also holds `ownership_dispute`
-- rows *about* a program, and surfacing those to the program's current
-- staff could tip off a squatter, so no grant may ever reopen the table
-- surface to signed-in users.
--
-- Program staff still need the `invite_request` slice: someone asked to
-- join from /claim/[programKey]/request, and today only /admin/claims can
-- see it. So the access path is a pair of SECURITY DEFINER functions that
-- hard-code kind = 'invite_request' in their own bodies. Structural, not
-- filtered-by-convention: `authenticated` has zero table grants, so the only
-- SQL a signed-in session can reach is the SQL below, and that SQL cannot
-- name a dispute row.

create or replace function public.program_join_requests(p_program_id uuid)
returns table (
  id uuid,
  email text,
  name text,
  note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.email, r.name, r.note, r.created_at
    from public.program_requests r
   where r.program_id = p_program_id
     and r.kind = 'invite_request'
     and r.status = 'open'
     and public.is_program_staff(p_program_id)
   order by r.created_at;
$$;

comment on function public.program_join_requests(uuid) is
  'Open invite_request rows for one program, visible to that program''s owner/coach/staff only. Everyone else gets zero rows. Never returns ownership_dispute or unlisted_program rows.';

create or replace function public.resolve_program_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid;
begin
  select r.program_id
    into v_program_id
    from public.program_requests r
   where r.id = p_request_id
     and r.kind = 'invite_request';

  -- One refusal covers "no such row", "not an invite request" and "not your
  -- program": distinguishing them would confirm to a non-staff caller which
  -- ids exist, and an ownership_dispute id must look exactly like a random
  -- guess.
  if v_program_id is null or not public.is_program_staff(v_program_id) then
    raise exception 'only this program''s staff can resolve a join request'
      using errcode = '42501';
  end if;

  update public.program_requests r
     set status = 'resolved',
         resolved_by = (select auth.uid()),
         resolved_at = now()
   where r.id = p_request_id
     and r.kind = 'invite_request'
     and r.status = 'open';

  -- Matching nothing here means the row was already resolved or dismissed —
  -- a second staff member got there first, or the admin queue did. Raise
  -- like set_member_upload_enabled does, so a stale screen learns it
  -- instead of pretending the click worked.
  if not found then
    raise exception 'that request has already been handled'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.resolve_program_join_request(uuid) is
  'Marks one open invite_request resolved (status/resolved_by/resolved_at), staff of the request''s program only. 42501 for anyone else or any other kind; P0002 when already handled.';

-- Functions default EXECUTE to PUBLIC; these two are for signed-in users only.
revoke all on function public.program_join_requests(uuid) from public, anon;
revoke all on function public.resolve_program_join_request(uuid) from public, anon;
grant execute on function public.program_join_requests(uuid) to authenticated;
grant execute on function public.resolve_program_join_request(uuid) to authenticated;
