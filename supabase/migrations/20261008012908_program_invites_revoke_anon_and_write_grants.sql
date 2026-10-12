-- `program_invites`: grants back to what 20260817073957 meant.
--
-- That migration wrote `grant select on public.program_invites to
-- authenticated` and nothing else — invitees never read the table (the raw
-- token is their proof, resolved server-side) and every write goes through a
-- SECURITY DEFINER function. But the table was created under the schema's
-- default privileges, which at the time handed `anon` and `authenticated`
-- every table privilege, so both roles have held DELETE, INSERT, UPDATE,
-- TRUNCATE, REFERENCES and TRIGGER on it since day one.
--
-- RLS made this moot in practice: the one policy is a staff-only SELECT and
-- there is no write policy, so an anon or authenticated client gets zero rows
-- and every write is refused at the row level. The grant was still wrong —
-- a future permissive policy, or RLS being toggled off, would have turned it
-- into a leak with no further mistake required. Found while reviewing the
-- join-link branch (PR #388); fixed on its own because it predates that work.
--
-- The same default-grant shape sits on ~18 other public tables (matches,
-- points, shots, program_members, program_players, processing_jobs, …), all
-- RLS-guarded today. That is a sweep of its own, in the style of
-- 20260818041110_revoke_public_grants_on_server_only_tables — not folded in
-- here, where one table's intent is on record and can be checked.
--
-- Applied live as the version in this file's name.

revoke all on public.program_invites from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.program_invites from authenticated;
grant select on public.program_invites to authenticated;
grant all on public.program_invites to service_role;
