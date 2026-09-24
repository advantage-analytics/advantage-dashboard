/**
 * The specs that create auth users on a live Supabase project, by file name.
 *
 * `playwright.config.ts` runs these in their own project, one file at a time
 * on one worker, so a run's sign-ins and admin user calls arrive as a trickle
 * instead of a burst — see `isTransientAuthError` in `./live-db.ts` for the
 * rate limits that burst used to hit. Every other spec stays fully parallel.
 *
 * A spec belongs here when it calls `createLogin(`, `createLogins(` or
 * `auth.admin.createUser(`. `tests/live-db-target-guard.spec.ts` fails when
 * this list and the files disagree, so a new live spec cannot land outside
 * the serial project.
 */
export const LIVE_DB_SPECS = [
  "account-deletion-retention.spec.ts",
  "admin-conferences-rpcs.spec.ts",
  "admin-program-rpcs.spec.ts",
  "admin-routes.spec.ts",
  "admin-self-promotion.spec.ts",
  "join-requests-staff-read.spec.ts",
  "leave-program.spec.ts",
  "match-video-attachments-db.spec.ts",
  "pending-invites.spec.ts",
  "personal-home-scope.spec.ts",
  "point-bookmarks-db.spec.ts",
  "program-member-avatars.spec.ts",
  "program-owner-name-live.spec.ts",
  "rls-workspace-isolation.spec.ts",
  "saved-views-rls.spec.ts",
  "schedule-outcomes-db.spec.ts",
  "seats-count-players.spec.ts",
  "teams-management.spec.ts",
  // Loopback-only (a local Docker stack), but it creates users all the same.
  "upload-write-eligibility.spec.ts",
  "viz-bands-rls.spec.ts",
] as const;

/** What makes a spec a live one — the calls that create auth users. */
export const LIVE_DB_CALL = /createLogins?\(|auth\.admin\.createUser\(/;

/** The name of the Playwright project that runs `LIVE_DB_SPECS`. */
export const LIVE_DB_PROJECT = "live-db";
