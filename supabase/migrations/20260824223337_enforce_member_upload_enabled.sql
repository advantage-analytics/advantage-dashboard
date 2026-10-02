-- Make the per-member upload grant real, and give it a default worth enforcing.
--
-- `program_members.upload_enabled` has been written since 20260817073930 and
-- read by nothing. `/dashboard/team/upload` gated on staff alone, then — from
-- 20260824182016 — on `programs.players_can_upload`. This is the migration that
-- makes the third flag mean something: `canUploadForProgram()` in
-- `src/lib/workspace/types.ts` now admits a player only where the program says
-- players may upload AND that member's own grant is on. Staff never consult it.
-- The grant narrows one player; it widens nobody.
--
-- == Why the DEFAULT has to flip in the same migration ======================
--
-- Enforcing the column as it stands would undo 20260824182016. That migration
-- turned `players_can_upload` on everywhere so that "players can upload by
-- default" was true of a new program. This column defaults FALSE, so starting
-- to read it without flipping the default puts every player back where they
-- were — a setting that says they may upload, and a page that turns them away.
--
-- Two columns, because a member is created by accepting an invitation.
-- `accept_program_invite` inserts `program_members.upload_enabled` from
-- `program_invites.upload_enabled`, so it never falls through to this table's
-- default, and `create_program_invite` does not name the column at all — the
-- invite's own default is what an invited member actually gets. Flipping one
-- and not the other would leave a default that is true for members nobody is
-- created as.
--
-- == What the backfill touches =============================================
--
-- 3 `program_members` rows exist: 1 owner reading true, 2 players reading
-- false. Neither false is a decision. The only thing that has ever written this
-- column is the invite default and two explicit `true`s for owners
-- (`complete_program_claim`, the claim-approval path); the switch that would
-- write a deliberate false calls `set_member_upload_enabled`, which has not
-- existed since 20260818043926 dropped it. So unlike 20260824182016, this
-- backfill cannot overwrite an "off" that somebody meant — no such row can
-- exist yet.
--
-- Invitations are backfilled only while still open (`accepted_at is null`, not
-- expired). An accepted invitation already handed its grant over; rewriting it
-- would edit the record of what was granted rather than what will be. 0 rows
-- match today.
--
-- == The setter comes back =================================================
--
-- 20260818043926 dropped `set_member_upload_enabled` with the note "It comes
-- back with the control that needs it." The control exists now — the roster
-- row's "Can send video" switch, via `setMemberUploadEnabled` in
-- `src/components/dashboard/team/roster-actions.ts` — and has been calling a
-- function that is not there, so the switch moves and the write 404s. Restored
-- exactly as 20260818041025 defined it: staff-only, 42501 otherwise,
-- `search_path` pinned, EXECUTE to `authenticated` only.
--
-- Nothing about authorization moves here. Filing a match under a program still
-- requires membership at the database (`matches_block_client_regraft`), and
-- attaching one to a scheduled line still requires staff. This decides who the
-- upload page admits, which is the narrower question.

-- ---------------------------------------------------------------------------
-- The grant is on unless a coach turns it off
-- ---------------------------------------------------------------------------

alter table public.program_members
  alter column upload_enabled set default true;

alter table public.program_invites
  alter column upload_enabled set default true;

update public.program_members
   set upload_enabled = true
 where upload_enabled = false;

update public.program_invites
   set upload_enabled = true
 where upload_enabled = false
   and accepted_at is null
   and expires_at > now();

-- ---------------------------------------------------------------------------
-- Let one member spend the program's hours
-- ---------------------------------------------------------------------------

-- Separate from `programs.players_can_upload`: that is the program-wide policy,
-- this is the per-person grant. A player needs both, which is why neither one
-- can be inferred from the other.
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
  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  update public.program_members
     set upload_enabled = p_enabled
   where program_id = p_program_id and user_id = p_user_id;
end;
$$;

-- `revoke from public` is not enough on its own: Supabase ships `alter default
-- privileges … grant execute on functions to anon, authenticated,
-- service_role`, so a new function carries an explicit `anon=X` grant that
-- revoking from PUBLIC does not touch. Same reasoning as 20260818042938.
revoke all on function public.set_member_upload_enabled(uuid, uuid, boolean)
  from public;
revoke execute on function public.set_member_upload_enabled(uuid, uuid, boolean)
  from anon;
grant execute on function public.set_member_upload_enabled(uuid, uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Say what the two flags now mean
-- ---------------------------------------------------------------------------

comment on column public.program_members.upload_enabled is
  'Per-member grant, on by default: may THIS member spend the program''s '
  'analysis budget? Narrows a PLAYER only — owner/coach/staff are admitted by '
  'canUploadForProgram() without it being read. Written by '
  'set_member_upload_enabled() from the roster''s "Can send video" switch; a '
  'player needs this AND programs.players_can_upload.';

comment on column public.program_invites.upload_enabled is
  'The grant the membership starts with, on by default: accept_program_invite '
  'copies it into program_members.upload_enabled. create_program_invite does '
  'not name the column, so this default is what every invited member gets.';

-- Restating the sentence 20260818040338 wrote and 20260824182016 carried
-- forward — "A member still needs program_members.upload_enabled" — which was
-- false of every deployed build until this migration, and is now true of
-- players and false of staff. `src/lib/workspace/types.ts` carried the
-- correction in the meantime and no longer needs to.
comment on column public.programs.players_can_upload is
  'Program-wide policy, on by default: may players upload, or only staff? Read '
  'by canUploadForProgram() to gate /dashboard/team/upload, where a player '
  'needs this AND their own program_members.upload_enabled. owner/coach/staff '
  'are admitted without either being read.';
