-- T3 · Widen set_member_upload_enabled and add_program_player for admins
--
-- PROVENANCE. Both function bodies below were taken from the LIVE database on
-- 2026-09-26 with `pg_get_functiondef`, not from this folder —
-- `supabase/migrations/` runs roughly 100 migrations behind the live ledger,
-- and `20260924185012_coach_authority_invites_removals` changed authority on
-- this base after the repo copies were written. The only edits are the
-- authorisation clause in each, one local in `add_program_player`, and the
-- `by_admin` key on its audit row. Everything else is byte-for-byte live.
--
-- ── What changes ─────────────────────────────────────────────────────────────
--
-- Live `set_member_upload_enabled(uuid, uuid, boolean)` and live
-- `add_program_player(uuid, text, text, text, integer, text)` ALREADY take an
-- explicit `p_program_id uuid` as their first parameter — every dashboard
-- caller passes `workspace.active.id` for it. Neither infers the program from
-- the caller's membership. So the signatures do not move, there is no
-- superseded overload to drop (the guard below proves that rather than
-- assuming it), and every existing caller keeps compiling unchanged.
--
-- What does move is the gate. Each read
--
--     if not public.is_program_staff(p_program_id) then raise 42501
--
-- which is `user_program_role(p_program_id) in ('owner','coach','staff')` —
-- a MEMBER check on the program the caller named. Both now read
--
--     if not (public.is_program_staff(p_program_id) or public.is_admin()) then
--
-- in the shape `20260914100200_admin_program_rpcs.sql` used for the other
-- single-gate program RPCs. The admin path authorises on `public.users.is_admin`
-- alone and writes to exactly the `p_program_id` it was handed — it never
-- looks at the admin's own workspace or memberships, because an admin
-- typically has none on the program being fixed.
--
-- ── The cross-tenant case (the hole this could open) ─────────────────────────
--
-- A member of program A calling either function with program B's id reaches
-- `is_program_staff(B)`, which is A's owner's role ON B — null, so false —
-- and then `is_admin()`, false for anyone whose `users.is_admin` is not set.
-- The raise stands. `tests/admin-member-roster-writes.spec.ts` proves this
-- against the live database with three pool users (an admin who is a member
-- of nothing, a staff member of A, and a stranger who is a member of nothing).
--
-- ── Audit ────────────────────────────────────────────────────────────────────
--
-- `add_program_player` already writes `player.added` to `program_audit_log`;
-- it now carries `by_admin: true|false` in `details` so an admin-added player
-- is tellable from a coach-added one without a 27th action value.
-- `program_audit_log_action_check` (26 values live after T1/T2) is NOT touched.
-- `set_member_upload_enabled` did not log before and does not log now.
--
-- Applied to live via the Supabase MCP `apply_migration`, never `db push`.

-- ── Guard: exactly one overload of each, so nothing ungated survives ─────────

do $$
declare
  v_upload integer;
  v_add    integer;
begin
  select count(*) into v_upload
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_member_upload_enabled';
  select count(*) into v_add
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'add_program_player';

  if v_upload <> 1 or v_add <> 1 then
    raise exception
      'expected exactly one overload of set_member_upload_enabled (found %) and add_program_player (found %); another signature exists and would survive this migration ungated — drop it here first',
      v_upload, v_add;
  end if;
end;
$$;

-- ── set_member_upload_enabled ────────────────────────────────────────────────

create or replace function public.set_member_upload_enabled(
  p_program_id uuid,
  p_user_id    uuid,
  p_enabled    boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Staff of THIS program, or a platform admin. The admin branch reads
  -- `users.is_admin` only; it never infers the program from the caller.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  update public.program_members
     set upload_enabled = p_enabled
   where program_id = p_program_id and user_id = p_user_id;

  -- The roster can outlive the membership it drew: `remove_program_member`
  -- leaves the claimed profile behind, so this switch renders for somebody
  -- with no row here. Silence would be reported to the coach as success.
  if not found then
    raise exception 'That player is no longer a member of this team, so there is nothing to grant. Reload the roster.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_member_upload_enabled(uuid, uuid, boolean) is
  'Flip one member''s upload switch on the named program. Caller must be owner/coach/staff of p_program_id, or a platform admin (users.is_admin). P0002 when no membership row matches.';

revoke execute on function public.set_member_upload_enabled(uuid, uuid, boolean) from public;
revoke execute on function public.set_member_upload_enabled(uuid, uuid, boolean) from anon;
grant  execute on function public.set_member_upload_enabled(uuid, uuid, boolean) to authenticated;

-- ── add_program_player ───────────────────────────────────────────────────────

create or replace function public.add_program_player(
  p_program_id  uuid,
  p_first_name  text,
  p_last_name   text,
  p_class_year  text    default null,
  p_lineup_spot integer default null,
  p_email       text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_staff  boolean;
  v_first  text := btrim(coalesce(p_first_name, ''));
  v_last   text := btrim(coalesce(p_last_name, ''));
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_clash  text;
  v_id     uuid;
  v_seats  integer;
  v_used   integer;
  v_pending integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Staff of THIS program, or a platform admin. The admin branch reads
  -- `users.is_admin` only; it never infers the program from the caller.
  v_staff := public.is_program_staff(p_program_id);
  if not (v_staff or public.is_admin()) then
    raise exception 'not authorized to add players to this program'
      using errcode = '42501';
  end if;

  -- Both names, because the roster row has no email to fall back to and a
  -- nameless row is one nobody can find. This is also what makes the six
  -- display-name ladders in the app unreachable for a coach-managed player.
  if v_first = '' or v_last = '' then
    raise exception 'a player needs a first and last name' using errcode = '22023';
  end if;

  if v_email is not null and v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address' using errcode = '22023';
  end if;

  if p_lineup_spot is not null and p_lineup_spot < 1 then
    raise exception 'a lineup spot starts at 1' using errcode = '22023';
  end if;

  -- The reverse tripwire. Somebody already on this program with a login does
  -- not need a second, coach-managed row — that is the duplicate the whole
  -- model exists to prevent, arriving from the other direction.
  if v_email is not null then
    if exists (
      select 1
        from public.program_members pm
        join public.users u on u.id = pm.user_id
       where pm.program_id = p_program_id
         and lower(u.email) = v_email
    ) then
      raise exception 'that person already has an account on this roster'
        using errcode = '23505';
    end if;

    -- And the same address must not already be on a live profile. The partial
    -- unique index would refuse it anyway; this turns a constraint-violation
    -- string into a sentence naming who it collided with.
    select btrim(pp.first_name || ' ' || pp.last_name) into v_clash
      from public.program_players pp
     where pp.program_id = p_program_id
       and lower(pp.email) = v_email
       and pp.merged_into_id is null
       and pp.archived_at is null;

    if v_clash is not null then
      raise exception '% is already on this roster with that email', v_clash
        using errcode = '23505';
    end if;
  end if;

  -- ── Seats ────────────────────────────────────────────────────────────────
  -- Locked, because two coaches adding into the last seat would both read
  -- `taken < seats` and both insert. Last of the guards, so a refusal for a
  -- bad name or a duplicate never waits on the lock.
  select p.seats into v_seats
    from public.programs p where p.id = p_program_id for update;
  select c.used, c.pending into v_used, v_pending
    from public.program_seat_counts(p_program_id) c;

  if v_used + v_pending + 1 > coalesce(v_seats, 0) then
    raise exception
      'all % seats are taken — archive a player or revoke an open invitation to free one',
      coalesce(v_seats, 0)
      using errcode = '54000';
  end if;

  insert into public.program_players
    (program_id, first_name, last_name, class_year, lineup_spot, email, created_by)
  values
    (p_program_id, v_first, v_last, nullif(btrim(coalesce(p_class_year, '')), ''),
     p_lineup_spot, v_email, v_uid)
  returning id into v_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'player.added', v_id,
          jsonb_build_object('name', v_first || ' ' || v_last, 'email', v_email,
                             'by_admin', not v_staff));

  return v_id;
end;
$$;

comment on function public.add_program_player(uuid, text, text, text, integer, text) is
  'Add a coach-managed player row to the named program. Caller must be owner/coach/staff of p_program_id, or a platform admin (users.is_admin); the admin path never infers the program from the caller. Logs player.added with details.by_admin.';

revoke execute on function public.add_program_player(uuid, text, text, text, integer, text) from public;
revoke execute on function public.add_program_player(uuid, text, text, text, integer, text) from anon;
grant  execute on function public.add_program_player(uuid, text, text, text, integer, text) to authenticated;
