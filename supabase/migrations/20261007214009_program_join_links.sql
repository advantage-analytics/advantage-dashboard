-- Program join links: one reusable, un-addressed token per program that any
-- signed-in person can open to join as a PLAYER.
--
-- Until now every membership was minted one address at a time
-- (`create_program_invite` → mail → `/join/[token]` → `accept_program_invite`).
-- A coach handing a link to a group chat was the missing case. This adds the
-- table, its RLS, and five RPCs; the `/join/[token]` door and `JoinPane`
-- screens are reused by the app (plan: a-user-was-asking-moonlit-blum.md).
--
-- Decisions (2026-10-07)
-- ----------------------
--   * Players only. Staff and coaches keep email invites: a link forwarded
--     into a group chat must never mint a coach.
--   * Token stored in PLAINTEXT, like `match_share_links.token` and unlike the
--     hashed invite/claim tokens. A join link must stay copyable after a page
--     reload — a coach who posted it last season needs the same URL again —
--     and hashing would force "Reset to see it". The blast radius of a leaked
--     row is bounded: it admits a `player` with the program's default upload
--     setting, every join is visible in the Members list and the audit log,
--     and one click revokes it. Minted server-side with `generateToken()`.
--   * One live link per program (`revoked_at is null`); Reset = revoke + mint.
--   * Seats are enforced at accept time, never reserved by the link.
--   * `mode`: 'open' joins at once; 'approve' files a `program_requests` row
--     for the Roster's "Join requests" card (existing approve path).
--   * Authority mirrors what exists: any staff member may mint (staff invite
--     players today); owner + coaches change the mode or turn the link off
--     (the gate `set_program_member_role` uses).
--
-- Audit vocabulary: dotted like the rest of `program_audit_log` —
-- `join_link.created`, `join_link.revoked`, `join_link.accepted`. The action
-- CHECK constraint is widened below.
--
-- The claim-by-email-or-mint-a-row logic that `accept_program_invite`'s
-- player branch carried is factored into `_ensure_program_player_row` and
-- `accept_program_invite` is re-created to call it, so the two doors cannot
-- drift. Its grants are re-stated after the `create or replace`.

-- ── Table ──────────────────────────────────────────────────────────────────
create table public.program_join_links (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete cascade,
  token       text not null unique,
  mode        text not null default 'open' check (mode in ('open', 'approve')),
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  uses        integer not null default 0
);

comment on table public.program_join_links is
  'Reusable per-program join links admitting players. Plaintext token (see migration header); one live row per program; writes only through SECURITY DEFINER RPCs.';

-- One live link per program. Also the index every staff read uses.
create unique index program_join_links_live_key
  on public.program_join_links (program_id)
  where revoked_at is null;

alter table public.program_join_links enable row level security;

-- Staff read their program's link (token included — they are the ones who
-- hand it out). No insert/update/delete policy: every write goes through the
-- RPCs below, which decide who is asking and write the audit row.
create policy "program_join_links_select_staff"
  on public.program_join_links
  for select
  to authenticated
  using (public.is_program_staff(program_id));

-- Supabase's default privileges hand every new table to anon/authenticated;
-- take them back. `anon` gets nothing: the signed-out landing goes through
-- `program_join_link_preview`, which never returns the token.
revoke all on table public.program_join_links from public, anon, authenticated;
grant select on table public.program_join_links to authenticated;
grant all on table public.program_join_links to service_role;

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
    'join_request.declined', 'pilot.end_changed', 'pilot.ended',
    'program.details_changed', 'member.upload_changed',
    'program.crest_changed', 'console.submission_reconciled',
    'match.detached', 'match.round_changed',
    'join_link.created', 'join_link.revoked', 'join_link.accepted'
  ]));

-- ── Shared helper: every player-role member has exactly one live profile ───
-- Called from inside SECURITY DEFINER functions that have already decided who
-- is asking and locked the `programs` row. Not granted to API roles: a direct
-- call would let any login mint itself a roster row in any program.
--
-- Returns the profile id and whether an existing row was claimed.
--
--   1. An unclaimed, unarchived, unmerged row in this program carrying the
--      session's address is CLAIMED (audit `player.claimed`). This is the
--      headline join-link case: a coach types the roster with emails, posts
--      one link, and every player lands on their own row with their matches
--      already attached.
--   2. Otherwise a new row is inserted. Names come from the profile the
--      signup trigger wrote; when it has none, the email's local part and an
--      em-dash stand in — `program_players` requires both, and a coach can
--      correct them. A member who cannot be inserted at all would vanish from
--      the roster, which is the failure this invariant exists to remove.
create or replace function public._ensure_program_player_row(
  p_program_id uuid,
  p_user_id uuid,
  p_email text,
  p_created_by uuid
)
returns table (player_id uuid, claimed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_email     text := lower(p_email);
  v_player_id uuid;
begin
  if p_user_id is null or v_email is null then
    raise exception 'a player row needs a login and an address' using errcode = '22023';
  end if;

  -- Already holds a row here (a returning member, or a second click).
  select pp.id into v_player_id
    from public.program_players pp
   where pp.program_id = p_program_id
     and pp.claimed_by_user_id = p_user_id;

  if v_player_id is not null then
    return query select v_player_id, false;
    return;
  end if;

  -- Guarded on `claimed_by_user_id is null` in the UPDATE itself, not checked
  -- and then written: a profile id in `matches.player1_id` is READ ACCESS to
  -- every match carrying it, so the window between a check and a write is a
  -- window in which one athlete's season could be handed to two accounts.
  update public.program_players
     set claimed_by_user_id = p_user_id,
         claimed_at         = now(),
         updated_at         = now()
   where id = (
           select pp.id
             from public.program_players pp
            where pp.program_id = p_program_id
              and pp.merged_into_id is null
              and pp.archived_at is null
              and pp.claimed_by_user_id is null
              and lower(pp.email) = v_email
            limit 1
         )
     and claimed_by_user_id is null
  returning id into v_player_id;

  if v_player_id is not null then
    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (p_program_id, p_user_id, 'player.claimed', v_player_id,
       jsonb_build_object('email', v_email));

    return query select v_player_id, true;
    return;
  end if;

  insert into public.program_players
    (program_id, first_name, last_name, email, claimed_by_user_id, claimed_at, created_by)
  select
    p_program_id,
    coalesce(nullif(btrim(u.first_name), ''), split_part(v_email, '@', 1)),
    coalesce(nullif(btrim(u.last_name), ''), '—'),
    v_email,
    p_user_id,
    now(),
    p_created_by
  from public.users u
  where u.id = p_user_id
  on conflict (program_id, claimed_by_user_id) where claimed_by_user_id is not null
  do nothing
  returning id into v_player_id;

  -- The conflict branch (raced by a parallel claim) leaves `v_player_id`
  -- null; read the row that won.
  if v_player_id is null then
    select pp.id into v_player_id
      from public.program_players pp
     where pp.program_id = p_program_id
       and pp.claimed_by_user_id = p_user_id;
  end if;

  return query select v_player_id, false;
end;
$function$;

revoke all on function public._ensure_program_player_row(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public._ensure_program_player_row(uuid, uuid, text, uuid)
  to service_role;

-- ── accept_program_invite: the player branch now calls the helper ──────────
-- Body otherwise identical to the live definition (20260921050000 in the
-- repo). The `player_id is not null` claim branch keeps its own UPDATE: it
-- targets ONE named row and must answer `player_gone` / `already_claimed`,
-- which the by-email helper has no reason to know about.
create or replace function public.accept_program_invite(p_token_hash text)
returns table (status text, program_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_invite    public.program_invites;
  v_player    public.program_players;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_invite
    from public.program_invites i
   where i.token_hash = p_token_hash;

  -- Ordered so the most specific answer wins: a used invitation that has also
  -- expired should read as used.
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_invite.accepted_at is not null then
    return query select 'already_used'::text, v_invite.program_id;
    return;
  end if;

  if v_invite.expires_at <= now() then
    return query select 'expired'::text, v_invite.program_id;
    return;
  end if;

  -- `is distinct from`, NEVER `<>`. If the session's `auth.users` row cannot be
  -- read, `v_email` is NULL and `lower(email) <> NULL` evaluates to NULL —
  -- which plpgsql treats as false, skips the branch, and falls through to grant
  -- the membership. This fails closed: unknown address, no membership.
  if lower(v_invite.email) is distinct from v_email then
    return query select 'wrong_address'::text, v_invite.program_id;
    return;
  end if;

  -- Still locked: acceptance moves a reservation from `pending` to `used`, and
  -- a coach adding a player at the same moment must see one or the other.
  perform 1 from public.programs where id = v_invite.program_id for update;

  -- ── Claim, or mint ───────────────────────────────────────────────────────
  if v_invite.player_id is not null then
    select * into v_player
      from public.program_players
     where id = v_invite.player_id
       and program_id = v_invite.program_id;

    if not found or v_player.merged_into_id is not null
       or v_player.archived_at is not null then
      return query select 'player_gone'::text, v_invite.program_id;
      return;
    end if;

    -- Guarded on `claimed_by_user_id is null` in the UPDATE itself, not checked
    -- and then written. Two clicks racing must not both bind: a profile id in
    -- `matches.player1_id` is READ ACCESS to every match carrying it, so the
    -- window between a check and a write is a window in which one athlete's
    -- season could be handed to two accounts.
    update public.program_players
       set claimed_by_user_id = v_uid,
           claimed_at         = now(),
           -- Fill the address only if the profile had none; a coach's record of
           -- a school address should not be overwritten by a personal login.
           email              = coalesce(email, v_email),
           updated_at         = now()
     where id = v_invite.player_id
       and claimed_by_user_id is null;

    if not found then
      return query select 'already_claimed'::text, v_invite.program_id;
      return;
    end if;

    insert into public.program_audit_log
      (program_id, actor_user_id, action, subject_id, details)
    values
      (v_invite.program_id, v_uid, 'player.claimed', v_invite.player_id,
       jsonb_build_object('email', v_email));

  elsif v_invite.role = 'player' then
    -- "Someone new", accepted as a player. Shared with the join-link door:
    -- claim the roster row carrying this address if a coach added one since
    -- the invitation went out, else mint one.
    perform public._ensure_program_player_row
      (v_invite.program_id, v_uid, v_email, v_invite.invited_by);
  end if;

  insert into public.program_members
    (program_id, user_id, role, upload_enabled, invited_by)
  values
    (v_invite.program_id, v_uid, v_invite.role, v_invite.upload_enabled,
     v_invite.invited_by)
  on conflict (program_id, user_id) do nothing;

  -- Guarded on `accepted_at is null` so two clicks racing cannot both stamp it.
  update public.program_invites
     set accepted_at = now(),
         accepted_user_id = v_uid
   where id = v_invite.id
     and accepted_at is null;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_invite.program_id, v_uid, 'invite.accepted', v_invite.id,
     jsonb_build_object('role', v_invite.role, 'player_id', v_invite.player_id));

  return query select 'ok'::text, v_invite.program_id;
end;
$function$;

-- Re-stated: a create-or-replace keeps grants, but the repo rule is to say
-- them again next to the body so a later drop+create cannot silently open it.
revoke all on function public.accept_program_invite(text) from public, anon;
grant execute on function public.accept_program_invite(text) to authenticated, service_role;

-- ── set_program_join_link: mint (and replace) ──────────────────────────────
-- Any staff member or a platform admin. Revokes the live row and inserts the
-- new one in the same transaction, so Reset is one call. Returns the new id.
create or replace function public.set_program_join_link(
  p_program_id uuid,
  p_token text,
  p_mode text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_old_id   uuid;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to manage this program''s join link'
      using errcode = '42501';
  end if;

  if p_mode not in ('open', 'approve') then
    raise exception 'unknown join link mode %', p_mode using errcode = '22023';
  end if;

  -- The token is minted by the server (`generateToken()`, 32 bytes base64url
  -- = 43 chars). Anything shorter did not come from there.
  if p_token is null or length(p_token) < 32 then
    raise exception 'join link token is too short' using errcode = '22023';
  end if;

  -- Serialises two staff resetting at once against the one-live-row index.
  perform 1 from public.programs where id = p_program_id for update;

  update public.program_join_links
     set revoked_at = now()
   where program_id = p_program_id
     and revoked_at is null
  returning id into v_old_id;

  insert into public.program_join_links (program_id, token, mode, created_by)
  values (p_program_id, p_token, p_mode, v_uid)
  returning id into v_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'join_link.created', v_id,
     jsonb_build_object('mode', p_mode, 'replaced', v_old_id));

  return v_id;
end;
$function$;

revoke all on function public.set_program_join_link(uuid, text, text) from public, anon;
grant execute on function public.set_program_join_link(uuid, text, text) to authenticated, service_role;

-- ── set_program_join_link_mode: owner / coach ──────────────────────────────
-- Same gate as `set_program_member_role`: owner or coach, or a platform admin.
create or replace function public.set_program_join_link_mode(
  p_program_id uuid,
  p_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_caller text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_mode not in ('open', 'approve') then
    raise exception 'unknown join link mode %', p_mode using errcode = '22023';
  end if;

  v_caller := public.user_program_role(p_program_id);
  if public.is_admin() then
    v_caller := 'owner';
  end if;
  if v_caller is null or v_caller not in ('owner', 'coach') then
    raise exception 'Only coaches can change who the link admits.'
      using errcode = '42501';
  end if;

  update public.program_join_links
     set mode = p_mode
   where program_id = p_program_id
     and revoked_at is null;

  if not found then
    raise exception 'This program has no join link.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.set_program_join_link_mode(uuid, text) from public, anon;
grant execute on function public.set_program_join_link_mode(uuid, text) to authenticated, service_role;

-- ── revoke_program_join_link: owner / coach ────────────────────────────────
-- Silent when there is nothing live (clicking twice is ordinary), like
-- `archive_program_player`.
create or replace function public.revoke_program_join_link(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_caller text;
  v_id     uuid;
  v_uses   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_caller := public.user_program_role(p_program_id);
  if public.is_admin() then
    v_caller := 'owner';
  end if;
  if v_caller is null or v_caller not in ('owner', 'coach') then
    raise exception 'Only coaches can turn the link off.' using errcode = '42501';
  end if;

  update public.program_join_links
     set revoked_at = now()
   where program_id = p_program_id
     and revoked_at is null
  returning id, uses into v_id, v_uses;

  if v_id is null then
    return;
  end if;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'join_link.revoked', v_id,
     jsonb_build_object('uses', v_uses));
end;
$function$;

revoke all on function public.revoke_program_join_link(uuid) from public, anon;
grant execute on function public.revoke_program_join_link(uuid) to authenticated, service_role;

-- ── accept_program_join_link ───────────────────────────────────────────────
-- Statuses, in the order they are decided:
--   not_found    no live row carries this token (unknown or revoked)
--   unconfirmed  the session's address is not confirmed — same rule as
--                `accept_pending_invite`, checked before anything is written
--   ok           already a member (a second click, or a returning player):
--                nothing to do, the page sends them to the dashboard
--   no_seats     every seat is taken or reserved by an open invitation
--   requested    mode 'approve': an open `program_requests` row exists now
--   ok           mode 'open': roster row claimed or minted, membership added
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

  insert into public.program_members
    (program_id, user_id, role, upload_enabled, invited_by)
  values
    (v_link.program_id, v_uid, 'player', coalesce(v_can_upload, true), v_link.created_by)
  on conflict (program_id, user_id) do nothing;

  update public.program_join_links
     set uses = uses + 1
   where id = v_link.id;

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

-- ── program_join_link_preview ──────────────────────────────────────────────
-- What the `/join/[token]` landing needs before anyone has joined — or signed
-- up. No row for an unknown or revoked token. Never returns the token, the
-- program id, or anything about other members.
--
--   program_name / program_team  `programs.school_name` and `team`, for the
--                                app's `programDisplayName()`
--   seats_free                   a new player could join right now
--   created_by_name              "{Coach} shared this link"
--   roster_match_name            the unclaimed, unarchived roster row in this
--                                program carrying the session's address, so
--                                the page can say "your coach already has you
--                                on the roster as …" — null signed out or
--                                when nothing matches. Reads `auth.email()`,
--                                the JWT claim, so a signed-out call can only
--                                ever learn about its own (absent) address.
create or replace function public.program_join_link_preview(p_token text)
returns table (
  program_name text,
  program_team text,
  org_type text,
  mode text,
  seats_free boolean,
  created_by_name text,
  roster_match_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.school_name,
    p.team,
    p.org_type,
    l.mode,
    (c.used + c.pending) < coalesce(p.seats, 0),
    (select nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')
       from public.users u where u.id = l.created_by),
    (select btrim(pp.first_name || ' ' || pp.last_name)
       from public.program_players pp
      where pp.program_id = l.program_id
        and pp.merged_into_id is null
        and pp.archived_at is null
        and pp.claimed_by_user_id is null
        and (select auth.email()) is not null
        and lower(pp.email) = lower((select auth.email()))
      limit 1)
  from public.program_join_links l
  join public.programs p on p.id = l.program_id
  cross join lateral public.program_seat_counts(l.program_id) c
  where l.token = p_token
    and l.revoked_at is null;
$function$;

-- Granted to `anon` ON PURPOSE (the repo default since 20261001184305 is no
-- anon execute): the signed-out landing has to name the program and say
-- whether there is room before an account exists. It is keyed on a 32-byte
-- CSPRNG token and returns nothing for a miss, so it is not an enumeration
-- oracle. It is the ONLY anon-executable function in this migration.
revoke all on function public.program_join_link_preview(text) from public;
grant execute on function public.program_join_link_preview(text) to anon, authenticated, service_role;
