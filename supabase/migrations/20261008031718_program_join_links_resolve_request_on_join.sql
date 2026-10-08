-- Join links, fourth pass: a join answers the request that preceded it.
--
-- Found by /pr-check's review of PR #388 at its final tip. A coach sets the
-- link to "with approval", a player files a request, the coach then switches
-- the link to "anyone" and the player joins at once. The request stayed
-- `open`: the Roster still listed them as waiting, and Approve failed on a
-- person who was already a member. `accept_program_join_link` now resolves
-- that address's open request in the same transaction as the membership.
--
-- Body otherwise identical to 20261007231013. Applied live as the version in
-- this file's name.

create or replace function public.accept_program_join_link(p_token text)
returns table (status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_link      public.program_join_links;
  v_seats     integer;
  v_can_upload boolean;
  v_used      integer;
  v_pending   integer;
  v_name      text;
  v_player_id uuid;
  v_claimed   boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_link
    from public.program_join_links l
   where l.token = p_token
     and l.revoked_at is null;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select lower(u.email), u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u
   where u.id = v_uid;

  -- A NULL address (auth row unreadable) also lands here: nothing below may
  -- bind a membership to an address it cannot see.
  if v_confirmed is null or v_email is null then
    return query select 'unconfirmed'::text, null::uuid;
    return;
  end if;

  -- Before seats, so a returning member is never told the program is full.
  if exists (
    select 1 from public.program_members pm
     where pm.program_id = v_link.program_id and pm.user_id = v_uid
  ) then
    return query select 'ok'::text, v_link.program_id;
    return;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Locked, because two players opening the last seat would both read
  -- `taken < seats`. The link reserved nothing; the seat is taken here.
  select p.seats, p.players_can_upload into v_seats, v_can_upload
    from public.programs p where p.id = v_link.program_id for update;
  select c.used, c.pending into v_used, v_pending
    from public.program_seat_counts(v_link.program_id) c;

  -- A roster row already carrying this address holds its seat; claiming it
  -- adds nobody, so it is never refused for seats (the same rule
  -- `program_seat_counts` documents for claim invitations).
  if not exists (
       select 1 from public.program_players pp
        where pp.program_id = v_link.program_id
          and pp.merged_into_id is null
          and pp.archived_at is null
          and pp.claimed_by_user_id is null
          and lower(pp.email) = v_email
     )
     and v_used + v_pending + 1 > coalesce(v_seats, 0) then
    return query select 'no_seats'::text, v_link.program_id;
    return;
  end if;

  -- ── Approve mode: file a request for the Roster's "Join requests" card ───
  if v_link.mode = 'approve' then
    select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
      into v_name
      from public.users u where u.id = v_uid;

    -- Idempotent through `program_requests_open_unique`
    -- (kind, program_id, lower(email)) where status = 'open'.
    insert into public.program_requests (kind, program_id, email, name, role)
    values ('invite_request', v_link.program_id, v_email, v_name, 'player')
    on conflict (kind, program_id, lower(email))
      where status = 'open' and program_id is not null
    do nothing;

    return query select 'requested'::text, v_link.program_id;
    return;
  end if;

  -- ── Open mode: claim or mint the roster row, then the membership ─────────
  select r.player_id, r.claimed into v_player_id, v_claimed
    from public._ensure_program_player_row
           (v_link.program_id, v_uid, v_email, v_link.created_by) r;

  -- NULL: removed from this roster (archived, claim kept) or merged away. The
  -- link is not a way back in; a coach restores them from the roster.
  if v_player_id is null then
    return query select 'removed'::text, v_link.program_id;
    return;
  end if;

  insert into public.program_members
    (program_id, user_id, role, upload_enabled, invited_by)
  values
    (v_link.program_id, v_uid, 'player', coalesce(v_can_upload, true), v_link.created_by)
  on conflict (program_id, user_id) do nothing;

  update public.program_join_links
     set uses = uses + 1
   where id = v_link.id;

  -- A request this person filed while the link was in approve mode is
  -- answered by the join itself. Left open, it sat in the Roster's "Join
  -- requests" card for somebody already on the team, and Approve refused it
  -- ("that person is already on this roster") until a coach declined it by
  -- hand. `resolved_by` stays null: nobody on staff resolved it.
  update public.program_requests r
     set status      = 'resolved',
         resolved_at = now()
   where r.kind = 'invite_request'
     and r.program_id = v_link.program_id
     and lower(r.email) = v_email
     and r.status = 'open';

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_link.program_id, v_uid, 'join_link.accepted', v_link.id,
     jsonb_build_object('role', 'player', 'player_id', v_player_id,
                        'claimed', v_claimed, 'mode', v_link.mode));

  return query select 'ok'::text, v_link.program_id;
end;
$function$;

revoke all on function public.accept_program_join_link(text) from public, anon;
grant execute on function public.accept_program_join_link(text) to authenticated, service_role;
