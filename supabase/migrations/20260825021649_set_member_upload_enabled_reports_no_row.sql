-- Make `set_member_upload_enabled` say when it changed nothing.
--
-- `20260824223337` restored the function and made what it writes decide
-- something. It returns void whether its UPDATE matched one row or none, so
-- `setMemberUploadEnabled` in
-- `src/components/dashboard/team/roster-actions.ts` reports `{ok: true}`
-- either way, and the roster switch's optimistic `setEnabled(next)` sticks.
-- The coach believes they granted upload; the next roster load shows it off
-- again with nothing explaining why. The revert already written at
-- `roster-table.tsx:246` is correct and unreachable — this is what reaches it.
--
-- == Why a no-row write is reachable at all ================================
--
-- `remove_program_member` deletes the `program_members` row but leaves
-- `program_players.claimed_by_user_id` set, so the profile still comes back
-- from `program_roster_full` arm 1 with a non-null `user_id` and
-- `role = 'player'` — which is exactly the pair `RowMenu`'s `canToggleSend`
-- tests before rendering the switch. So the control renders for somebody who
-- has no membership row to write to. Two coaches with the page open, one
-- removing while the other toggles, is the same story without the stale tab.
--
-- == Why this raises rather than returning a boolean =======================
--
-- Postgres will not let `CREATE OR REPLACE FUNCTION` change a return type, so
-- `returns boolean` would mean DROP then CREATE — and a DROP discards the ACL.
-- Supabase ships `alter default privileges … grant execute on functions to
-- anon, authenticated, service_role`, so the re-created function would come
-- back executable by `anon` unless every revoke were reproduced exactly. That
-- trap already bit this branch once: 20260824223337 had to reproduce a
-- `revoke … from anon` that a *separate later* migration had added, not just
-- the original definition. Raising keeps `CREATE OR REPLACE`, so the ACL is
-- never touched, and it matches the idiom the function already uses for the
-- staff gate.
--
-- Two raises, two codes, so a caller can tell them apart: `42501` for a
-- non-staff caller, `P0002` (`no_data_found`) for a write that matched no row.
-- Both messages are written for a person, because `roster-actions.ts` passes
-- `error.message` straight to the switch's inline error rather than replacing
-- it with a guess.
--
-- Nothing changes on the success path: `FOUND` is set by the UPDATE that is
-- already there, in the same call, so an ordinary flip on a real member costs
-- no extra statement and no extra round trip. `UPDATE` counts the rows it
-- matched, not the rows whose value changed, so re-setting a member to the
-- value they already hold still succeeds.
--
-- Authorization is untouched: same staff gate, same `42501`, same
-- `search_path` pin, same grants.

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

  -- The roster can outlive the membership it drew: `remove_program_member`
  -- leaves the claimed profile behind, so this switch renders for somebody
  -- with no row here. Silence would be reported to the coach as success.
  if not found then
    raise exception 'That player is no longer a member of this team, so there is nothing to grant. Reload the roster.'
      using errcode = 'P0002';
  end if;
end;
$$;

-- Belt and braces. `CREATE OR REPLACE` preserves the ACL, so these three are
-- no-ops today — they are here so the end state is unconditional, and so that
-- anyone who ever converts this into DROP + CREATE inherits them rather than
-- rediscovering the anon default-privilege trap.
revoke all on function public.set_member_upload_enabled(uuid, uuid, boolean)
  from public;
revoke execute on function public.set_member_upload_enabled(uuid, uuid, boolean)
  from anon;
grant execute on function public.set_member_upload_enabled(uuid, uuid, boolean)
  to authenticated;

comment on function public.set_member_upload_enabled(uuid, uuid, boolean) is
  'Turn one member''s share of the program''s analysis budget on or off. '
  'Staff only — raises 42501 otherwise. Raises P0002 when no program_members '
  'row matches, so a caller can tell a write that changed a member from one '
  'that changed nothing; the roster switch relies on it to put itself back.';
