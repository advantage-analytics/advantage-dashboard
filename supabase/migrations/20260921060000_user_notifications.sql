-- Per-recipient notices: "you've been invited to X", "your request to join X
-- was approved".
--
-- Until now nothing in the schema was addressed to a person. `program_audit_log`
-- is program-wide and staff-only, and the header activity tray found invites
-- only by matching the session's confirmed address against `program_invites` —
-- which cannot tell a cold invitation from an approved request, and has no
-- notion of "seen".
--
-- Written only by SECURITY DEFINER functions; the recipient can read their own
-- rows and mark them read through `mark_notifications_read()`, nothing else.

create table public.user_notifications (
  id                bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  program_id        uuid not null references public.programs (id) on delete cascade,
  -- The invitation the notice is about. Cascades so a revoked invitation takes
  -- its notice with it rather than leaving a door that no longer opens.
  invite_id         uuid not null references public.program_invites (id) on delete cascade,
  kind              text not null
                    check (kind in ('invite.received', 'join_request.approved')),
  -- Snapshot of what the recipient needs to read the line. A custom org's
  -- `programs` row is member-only, and the recipient is not a member yet.
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  read_at           timestamptz
);

-- One notice per person per invitation: a re-invite or an approval updates the
-- row instead of stacking a second. Leads with invite_id, so it also serves the
-- FK's cascade.
create unique index user_notifications_invite_recipient_key
  on public.user_notifications (invite_id, recipient_user_id);

-- The tray's read: newest first for one recipient.
create index user_notifications_recipient_idx
  on public.user_notifications (recipient_user_id, created_at desc);

-- The unread dot, and `mark_notifications_read()`'s update.
create index user_notifications_unread_idx
  on public.user_notifications (recipient_user_id)
  where read_at is null;

-- FK cascade from `programs`.
create index user_notifications_program_idx
  on public.user_notifications (program_id);

alter table public.user_notifications enable row level security;

create policy "Recipients read their own notifications"
  on public.user_notifications
  for select
  to authenticated
  using ((select auth.uid()) = recipient_user_id);

revoke all on public.user_notifications from anon;
revoke insert, update, delete, truncate on public.user_notifications from authenticated;

-- ── Helpers ────────────────────────────────────────────────────────────────

-- The confirmed account behind an address, or null. An unconfirmed signup is
-- nobody yet — the same rule `pending_program_invites()` applies.
create or replace function public.confirmed_user_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and u.email_confirmed_at is not null
   limit 1;
$$;

revoke execute on function public.confirmed_user_for_email(text)
  from public, anon, authenticated;

-- Everything the caller has not seen, marked seen. No ids: opening the tray is
-- the whole gesture, and taking ids would only add a way to pass wrong ones.
create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_notifications
     set read_at = now()
   where recipient_user_id = (select auth.uid())
     and read_at is null;
$$;

revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- ── Audit vocabulary ───────────────────────────────────────────────────────

alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (action = any (array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached', 'member.left',
    'program.conference_changed', 'console.result_added',
    'console.analysis_attached', 'join_request.approved',
    'join_request.declined'
  ]));

-- ── Writers ────────────────────────────────────────────────────────────────

-- Unchanged apart from the notice at the end.
create or replace function public.create_program_invite(
  p_program_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamp with time zone,
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid       uuid := (select auth.uid());
  v_email     text := lower(trim(p_email));
  v_seats     integer;
  v_used      integer;
  v_pending   integer;
  v_player    public.program_players;
  v_clash_id  uuid;
  v_clash     text;
  v_id        uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- WIDENED (T4): staff of the program, or a platform admin.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to invite to this program'
      using errcode = '42501';
  end if;

  if v_email = '' or v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address'
      using errcode = '22023';
  end if;

  -- Owner is absent on purpose: ownership moves by transfer, never by
  -- invitation, and a program with two owners has no answer to "who decides".
  if p_role not in ('coach', 'staff', 'player') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  -- Somebody already inside does not need a second way in, and accepting would
  -- collide with `program_members_program_user_key`.
  if exists (
    select 1
      from public.program_members pm
      join public.users u on u.id = pm.user_id
     where pm.program_id = p_program_id
       and lower(u.email) = v_email
  ) then
    raise exception 'that person is already on this roster'
      using errcode = '23505';
  end if;

  if p_player_id is not null then
    select * into v_player
      from public.program_players
     where id = p_player_id
       and program_id = p_program_id
       and merged_into_id is null
       and archived_at is null;

    -- Checked against THIS program, so an id from somewhere else names nobody.
    -- It arrives from a browser and is untrusted.
    if not found then
      raise exception 'that player is not on this roster' using errcode = '22023';
    end if;

    if v_player.claimed_by_user_id is not null then
      raise exception '% already has an account',
        btrim(v_player.first_name || ' ' || v_player.last_name)
        using errcode = '23505';
    end if;

    -- The invitation carries the role the profile implies. A roster row is a
    -- player; inviting one as staff would bind a coach's login to an athlete's
    -- match history.
    if p_role <> 'player' then
      raise exception 'a roster player can only be invited as a player'
        using errcode = '22023';
    end if;

  else
    -- No target named, but this address is already on a coach-managed row. Do
    -- not create the duplicate; tell the caller which row it should attach to.
    --
    -- THIS LOOKUP MUST NEVER BE WIDENED. Not to `public.users`, and not to
    -- another program. As written it is not an enumeration oracle: the caller
    -- is authenticated staff of this one program, the candidate set is their
    -- own roster which they can already read in full through
    -- `program_roster_full`, and the comparison is equality on one program's
    -- rows.
    select pp.id, btrim(pp.first_name || ' ' || pp.last_name)
      into v_clash_id, v_clash
      from public.program_players pp
     where pp.program_id = p_program_id
       and pp.merged_into_id is null
       and pp.archived_at is null
       and pp.claimed_by_user_id is null
       and lower(pp.email) = v_email;

    if v_clash_id is not null then
      raise exception '% is already on this roster without an account', v_clash
        using errcode = 'P0001',
              detail  = v_clash_id::text,
              hint    = 'link_player';
    end if;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Reserved at invite time, not at acceptance: the refusal belongs in front
  -- of the coach, who is the only person who can free a seat. Only somebody
  -- NEW invited as a player reserves one — a claim invitation targets a row
  -- that already holds its seat, and staff hold none. After the tripwire
  -- above, so "this person is already on your roster" is never masked by
  -- "no seats". Locked for the same reason `add_program_player` locks.
  if p_role = 'player' and p_player_id is null then
    select p.seats into v_seats
      from public.programs p where p.id = p_program_id for update;
    select c.used, c.pending into v_used, v_pending
      from public.program_seat_counts(p_program_id, v_email) c;

    if v_used + v_pending + 1 > coalesce(v_seats, 0) then
      raise exception
        'this program has % seats, and they are taken or reserved by open invitations',
        coalesce(v_seats, 0)
        using errcode = '54000';
    end if;
  end if;

  insert into public.program_invites
    (program_id, email, role, token_hash, invited_by, expires_at, player_id)
  values
    (p_program_id, v_email, p_role, p_token_hash, v_uid, p_expires_at, p_player_id)
  on conflict (program_id, lower(email)) where accepted_at is null
  do update set role       = excluded.role,
                token_hash = excluded.token_hash,
                invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                player_id  = excluded.player_id,
                created_at = now()
  returning id into v_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'invite.created', v_id,
     jsonb_build_object('email', v_email, 'role', p_role, 'player_id', p_player_id));

  -- ── Notice ───────────────────────────────────────────────────────────────
  -- Only for an address that is already somebody. A brand-new invitee has the
  -- email, and `pending_program_invites()` finds the invitation once they
  -- confirm. A re-invite re-announces: the row goes back to unread, and keeps
  -- an "approved" kind if an approval already set it.
  v_recipient := public.confirmed_user_for_email(v_email);
  if v_recipient is not null then
    insert into public.user_notifications
      (recipient_user_id, program_id, invite_id, kind, details)
    select v_recipient, p_program_id, v_id, 'invite.received',
           jsonb_build_object(
             'school_name', p.school_name,
             'team', p.team,
             'role', p_role
           )
      from public.programs p
     where p.id = p_program_id
    on conflict (invite_id, recipient_user_id)
    do update set details    = excluded.details,
                  created_at = now(),
                  read_at    = null;
  end if;

  return v_id;
end;
$function$;

-- Approving a join request mints an invitation first (`inviteMember`), then
-- resolves the request here; declining resolves it with nothing minted. The
-- two used to be indistinguishable in the database, so the caller now says
-- which one it is. An approval turns the invitation's notice into "your
-- request was approved" — one notice for the player, not two — and both write
-- the audit row resolution never had.
--
-- `p_approved` defaults to false so a caller that predates it keeps meaning
-- what it always meant at the call site that remains: Decline.
drop function public.resolve_program_join_request(uuid);

create function public.resolve_program_join_request(
  p_request_id uuid,
  p_approved boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program_id uuid;
  v_email      text;
  v_invite_id  uuid;
begin
  select r.program_id, lower(trim(r.email))
    into v_program_id, v_email
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

  -- The invitation the approval just minted. Only looked for on approval: a
  -- decline can sit beside an older open invitation the coach sent by hand,
  -- and that one must not be relabelled as an approval.
  if p_approved then
    select i.id into v_invite_id
      from public.program_invites i
     where i.program_id = v_program_id
       and lower(i.email) = v_email
       and i.accepted_at is null;
  end if;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_program_id, (select auth.uid()),
     case when p_approved then 'join_request.approved'
          else 'join_request.declined' end,
     p_request_id,
     jsonb_build_object('email', v_email, 'invite_id', v_invite_id));

  if v_invite_id is not null then
    update public.user_notifications n
       set kind       = 'join_request.approved',
           created_at = now(),
           read_at    = null
     where n.invite_id = v_invite_id;
  end if;
end;
$function$;

revoke execute on function public.resolve_program_join_request(uuid, boolean)
  from public, anon;
grant execute on function public.resolve_program_join_request(uuid, boolean)
  to authenticated, service_role;
