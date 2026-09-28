/**
 * Whether the team Schedule is open to users.
 *
 * Off, `/dashboard/team/schedule` renders `ComingSoonPage`, every sub-route
 * (`new`, `[eventId]`, `single/…`) redirects there from `next.config.ts`, and
 * each door that led into the schedule is closed: Team Home's dual, court
 * record and dual history cards and its "Add a dual" setup step, the upload
 * wizard's line offers and attach picker, the match drawer's Schedule
 * section, Edit match's "Add to an event", the player profile's line history
 * and the palette's "Add a fixture".
 *
 * Unlike the other coming-soon routes, the implementation behind this one is
 * complete and kept. Turning it back on: set this to `true`, delete the stub
 * branch at the top of `schedule/page.tsx`, point `schedule/loading.tsx` back
 * at `SchedulePageSkeleton`, and move the nav row back to second without its
 * `comingSoon`. `tests/nav-icons.spec.ts` fails until the page and the nav
 * row agree, and `tests/schedule-availability.spec.ts` skips itself.
 *
 * The flag is UI only: `canManageTeamSchedule`,
 * `matches_block_client_regraft` and every server-side check still answer as
 * before, and matches already attached to a line keep their `event_entry_id`.
 */
export const SCHEDULE_ENABLED = false;
