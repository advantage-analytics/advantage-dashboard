-- Table grants sweep: privileges match the policies, and `anon` holds only
-- what a signed-out visitor is meant to read.
--
-- Nineteen tables created before 2026-09 inherited Supabase's default table
-- privileges, which hand `anon` and `authenticated` EVERY privilege — select,
-- insert, update, delete, truncate, references, trigger. Row-level security
-- is on for all of them and every policy that names `public` requires
-- `auth.uid()`, so no row has leaked and no write has landed. The grants were
-- still the latent half of a two-step failure (one permissive policy, or RLS
-- toggled off), and TRUNCATE is not governed by RLS at all: only the absence
-- of a SQL connection for those roles stood between the grant and its use.
-- `program_invites` was done on its own in 20261008012908; this is the rest,
-- in the style of 20260818041110_revoke_public_grants_on_server_only_tables.
--
-- The rule applied, table by table, against the LIVE policy list (2026-10-08):
--
--   anon           nothing — except SELECT on `programs`, whose policy
--                  "College programs are readable signed out" is the one
--                  anonymous read by design. Checked against 24 h of API
--                  logs: the only anonymous table request was GET /programs.
--                  The three anon-callable functions (`search_programs`,
--                  `program_public_status`, `program_join_link_preview`) are
--                  SECURITY DEFINER and need no table grant.
--   authenticated  exactly the commands some policy admits. A command with no
--                  policy was already refused by RLS, so revoking its grant
--                  changes the error, never the outcome. TRUNCATE, REFERENCES
--                  and TRIGGER go everywhere: PostgREST exposes none of them.
--   service_role   untouched. It bypasses RLS and these grants.
--
-- And so it stops recurring: tables this role creates in `public` no longer
-- grant anything to `anon` by default, matching what
-- 20261001184305_function_default_privileges_no_anon did for functions. A
-- table meant to be read signed out must say so in its own migration.
-- `authenticated`'s default is left alone on purpose — every new table would
-- otherwise fail with "permission denied" despite a correct policy.
--
-- Applied live as the version in this file's name.

-- ── anon: nothing, then the one read that is meant ──────────────────────────
revoke all on
  public.match_drafts, public.match_files, public.match_stats, public.matches,
  public.notification_sends, public.points, public.processing_jobs,
  public.processing_usage, public.program_audit_log, public.program_claims,
  public.program_domains, public.program_event_entries, public.program_events,
  public.program_members, public.program_players, public.programs,
  public.shots, public.splitstep_webhook_deliveries, public.user_preferences
from anon;

grant select on public.programs to anon;

-- ── authenticated: never TRUNCATE / REFERENCES / TRIGGER ────────────────────
revoke truncate, references, trigger on
  public.match_drafts, public.match_files, public.match_stats, public.matches,
  public.notification_sends, public.points, public.processing_jobs,
  public.processing_usage, public.program_audit_log, public.program_claims,
  public.program_domains, public.program_event_entries, public.program_events,
  public.program_members, public.program_players, public.programs,
  public.shots, public.splitstep_webhook_deliveries, public.user_preferences,
  public.user_notifications, public.match_stats_with_percentages
from authenticated;

-- ── authenticated: no policy at all → no privilege at all ───────────────────
-- Server-only tables: written by the service role, read by nobody else.
revoke all on
  public.notification_sends, public.program_domains,
  public.splitstep_webhook_deliveries
from authenticated;

-- ── authenticated: read-only where the only policy is SELECT ────────────────
-- Every write to these goes through a SECURITY DEFINER function.
revoke insert, update, delete on
  public.program_claims, public.program_members, public.program_players,
  public.programs, public.match_stats_with_percentages
from authenticated;

-- `user_preferences` has insert, select and update policies and no delete.
revoke delete on public.user_preferences from authenticated;

-- ── and for tables not yet written ──────────────────────────────────────────
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
