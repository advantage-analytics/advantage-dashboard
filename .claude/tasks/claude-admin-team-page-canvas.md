# Tasks — claude/admin-team-page-canvas

> Scope: Rebuild `/admin/teams/[programId]` as one canvas-faithful page — anchor pills, a two-column grid of nine cards plus an Activity log — with a per-team pilot, admin details and roster RPCs applied to the live DB, the loader and server actions behind them, and redirects from the five retired sub-routes.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## Branch base — read before the first task

This branch was detached onto `origin/splitstep-integration` (`dcb62d55`) on
2026-09-26, 564 commits newer than the base the plan was written against. The
admin-uploads work (T1–T20, `codex/admin-uploads` + `codex/admin-uploads-pr-check`)
is **not** in this branch and was never opened as a PR, so on this base:

- `/admin/uploads/new`, `admin-upload-selection.ts` and `adminUploadHref` **do not exist**.
  The header's "Upload for this team" button and the schedule card's "Enter
  results for this team" link therefore land in T22, which stays `later` until
  admin-uploads merges. T9 and T14 must not invent either affordance.
- Seats counting changed (`20260921050000_seats_count_roster_players`,
  `…060000_seats_count_contributed_players`) — read the seat figure from the
  loader, never re-derive it.
- Invite and removal authority changed (`20260924185012_coach_authority_invites_removals`)
  — T3 and T11 must read the live function definitions before assuming a signature.

The design source of truth is
`docs/superpowers/specs/2026-09-18-admin-team-page/TeamPage.dc.html`
(Admin Console "Team page" artboard, 1440×1500). Verify every constant and
label against it, not against `plan.md`'s prose.

## T1 · Add per-team pilot columns and admin pilot RPCs

- **status:** done
- **model:** fable
- **files:** (guess) new `supabase/migrations/<ts>_admin_program_pilot.sql`, new `tests/database/admin-program-pilot.test.mjs`
- **done when:**
  - [ ] The migration adds `programs.pilot_ends_on date`, `pilot_approved_by uuid references public.users`, `pilot_approved_at timestamptz`, `pilot_ended_at timestamptz`, and backfills active programs with `pilot_ends_on = '2026-12-31'` plus approved-by/at from the latest approved `program_claims` row (`reviewed_by`, `updated_at`)
  - [ ] `admin_set_pilot_end(p_program_id uuid, p_ends_on date)` and `admin_end_pilot(p_program_id uuid)` are `security definer` with `set search_path = ''`, raise unless `public.is_admin()`, have execute revoked from `public` and `anon` and granted only to `authenticated`, and each inserts one `program_audit_log` row (`pilot.end_changed` / `pilot.ended`) naming `auth.uid()` as actor
  - [ ] The rewritten `program_audit_log_action_check` lists every action present in the live constraint — including `console.result_added` and `console.analysis_attached` — plus the two new ones; the migration header comment quotes the live list it was built from
  - [ ] The migration header comment states exactly what `admin_end_pilot` does (which columns it writes, whether `status` changes and to which existing value) and why, citing `programs_status_check` and `canSubmitVideo`
  - [ ] `tests/database/admin-program-pilot.test.mjs` asserts: a non-admin call raises, an admin call updates the column, one audit row per call, and a pre-existing `console.result_added` audit row still satisfies the constraint
- **notes:** Apply to the LIVE DB via Supabase MCP `apply_migration` — never `supabase db push` (the repo is ~100 migrations off the live ledger). Read the live constraint first with `execute_sql` (`pg_get_constraintdef`) and live function bodies with `pg_get_functiondef`. Do NOT invent a new `programs.status` value: read `programs_status_check`, `src/lib/workspace/claim-state.ts` and `canSubmitVideo` first. `PILOT_ENDS_AT` (`src/lib/services/splitstep/config.ts:151`) is currently read only by UI, so nothing server-side stops at pilot end today — decide whether ending a pilot must gate video submission and document the decision in the header. Keep the constant as the backfill default only. Load `supabase:supabase-postgres-best-practices` before writing; run `rls-boundary-reviewer` on the diff; run `get_advisors` (security) after applying.

## T2 · Add admin_update_program_details RPC

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** (guess) new `supabase/migrations/<ts>_admin_update_program_details.sql`, new `tests/database/admin-program-details.test.mjs`
- **done when:**
  - [ ] The migration defines `admin_update_program_details(p_program_id uuid, …)` covering school name, team, city, state, `staff_page_url`, `primary_domain`, `home_venue`, `default_surface`, `time_zone`, `upload_policy`, `events_policy`, `roster_public` — or widens `update_program_settings` with `or public.is_admin()` in the pattern of `20260914100200_admin_program_rpcs.sql`; the header comment says which and why
  - [ ] The function is `security definer`, `set search_path = ''`, raises for a non-admin caller, has execute revoked from `public`/`anon` and granted to `authenticated` only, and validates enum-like inputs against the same value sets the live check constraints accept
  - [ ] One `program_audit_log` row is written per successful call with an action value present in `program_audit_log_action_check`; if a new action is added, the constraint rewrite preserves every existing action including the `console.*` and `pilot.*` ones
  - [ ] `tests/database/admin-program-details.test.mjs` asserts: a non-admin raises, an admin updates every listed column, an invalid `upload_policy` is rejected, and exactly one audit row is written
- **notes:** Apply to live via Supabase MCP `apply_migration`, never `db push`. Run `pg_get_functiondef` on live `update_program_settings` before choosing widen-vs-new — the repo copy may be stale. Needs T1 only because both rewrite the same audit-action constraint; rebuild it from the live definition after T1 is applied. Load `supabase:supabase-postgres-best-practices`; run `rls-boundary-reviewer`; `get_advisors` after.

## T3 · Widen member-upload and add-player RPCs for admins

- **status:** done
- **model:** fable
- **files:** (guess) new `supabase/migrations/<ts>_admin_member_and_roster_writes.sql`, new `tests/database/admin-member-roster-writes.test.mjs`
- **done when:**
  - [ ] `set_member_upload_enabled` and `add_program_player` accept an explicit `p_program_id uuid`, and authorise when the caller is a permitted member of that program OR `public.is_admin()`; the admin path never infers the program from the caller's workspace
  - [ ] Both remain `security definer` with `set search_path = ''`, execute revoked from `public`/`anon`, granted to `authenticated`; any superseded overload is dropped in the same migration so no ungated signature survives
  - [ ] Existing member callers still compile and behave: `src/components/dashboard/team/roster-actions.ts`, `join-request-actions.ts`, `add-player-dialog.tsx` and `lineup-name-picker.tsx` pass the program id if the signature changed
  - [ ] `tests/database/admin-member-roster-writes.test.mjs` asserts: an admin who is not a member succeeds with `p_program_id`; a non-admin non-member raises; a member of program A cannot write to program B by passing B's id
  - [ ] The migration header records that the function bodies were taken from live `pg_get_functiondef` output, with the date
- **notes:** Apply to live via Supabase MCP `apply_migration`, never `db push`. `20260924185012_coach_authority_invites_removals` changed invite/removal authority on this base — start from live `pg_get_functiondef`, not the repo copies. Criterion 4's cross-tenant case is the hole this change could open; treat it as blocking. Load `supabase:supabase-postgres-best-practices`; run `rls-boundary-reviewer`; `get_advisors` after.

## T4 · Extend getAdminTeam: details, pilot, uploads flag, conference, activity

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/lib/data/admin-team-server.ts`
- **done when:**
  - [ ] `AdminTeamProgram` carries city, state, `staffPageUrl`, `homeVenue`, `defaultSurface`, `timeZone`, `uploadPolicy`, `eventsPolicy`, `rosterPublic` and the program key, selected via `PROGRAM_SELECT`
  - [ ] `AdminTeamData.pilot` exposes `endsOn`, `approvedAt`, `approvedByName`, `approvedByIsViewer`, `endedAt` read from the T1 columns — no read of `PILOT_ENDS_AT` in this file
  - [ ] Each entry of `members` carries `uploadEnabled: boolean`
  - [ ] `AdminTeamData.conference` holds the conference (name, short mark, division, team count, count on Advantage) plus sibling programs with a claimed/unclaimed flag, or `null` when the program has no conference
  - [ ] `AdminTeamData.activity` holds the latest 20 `program_audit_log` rows, newest first, each with action, created-at and resolved actor name; all new queries run inside the existing `Promise.all`
- **notes:** Service-role loader wrapped in `cache()` — keep it server-only. Reuse `loadConferenceTeams` (`admin-conference-actions.ts`) rather than re-querying. Verify column names against the live DB via Supabase MCP `list_tables`, not the migrations folder. Leave the existing seat figure alone — seats counting changed on this base.

## T5 · Extend getAdminTeam: roster with match counts, schedule

- **status:** done
- **model:** opus
- **needs:** T4
- **files:** (guess) `src/lib/data/admin-team-server.ts`, maybe new `src/lib/data/admin-team-roster.ts`, new `tests/admin-team-roster.spec.ts`
- **done when:**
  - [ ] `AdminTeamData.roster` lists `program_players` for the program, excluding archived and merged rows, ordered by `lineup_spot` with null spots last; each row has lineup spot, name, class and `hasAccount`
  - [ ] Each roster row's `matchCount` and `lastMatch` (result, opponent label, date) count matches whose `player1_id` equals EITHER the player's `program_players.id` OR the player's claimed auth uid
  - [ ] A pure helper does that attribution and a spec proves it: a player with 2 matches keyed by profile id and 1 keyed by auth uid reports 3; a player with none reports `matchCount: 0` and `lastMatch: null`
  - [ ] `AdminTeamData.schedule` comes from `readScheduleWithClient` (`src/lib/data/schedule-server.ts`) called with the admin client, giving date, opponent, home/away, type, score and a result state per event
- **notes:** `matches.player1_id` holds two id spaces with no FK — never normalise it; see how `my_player_ids()` resolves both. Keep the attribution in a pure function so the spec needs no DB. Split from T4 because the file is 731 lines and this half carries the judgment.

## T6 · Add admin details + pilot server actions with gate specs

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** (guess) `src/lib/services/programs/admin-team-actions.ts`, new `tests/admin-team-details-pilot-actions.spec.ts`
- **done when:**
  - [ ] `adminUpdateProgramDetails`, `adminSetPilotEnd` and `adminEndPilot` are exported, each calling `requireAdmin()` first and returning `AdminTeamOutcome`
  - [ ] Each calls its RPC through the session (cookie) Supabase client — not the service-role client — so the audit row names the admin, then calls `revalidatePath("/admin", "layout")`
  - [ ] `adminSetPilotEnd` returns `{ ok: false }` without calling the RPC for a malformed or past date
  - [ ] The new spec proves, per action, that a non-admin caller gets `{ ok: false }` and the RPC is never invoked, following the existing admin action spec pattern
- **notes:** Mirror `adminSetProgramMemberRole` in the same file for structure. No UI in this task.

## T7 · Add admin member-upload + add-player actions with gate specs

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** (guess) `src/lib/services/programs/admin-team-actions.ts`, new `tests/admin-team-member-roster-actions.spec.ts`
- **done when:**
  - [ ] `adminSetMemberUploadEnabled` and `adminAddProgramPlayer` are exported, call `requireAdmin()` first, and pass an explicit `p_program_id` to the T3 RPCs
  - [ ] Both use the session client for the RPC and call `revalidatePath("/admin", "layout")` on success
  - [ ] `adminAddProgramPlayer` accepts the same player fields `add-player-dialog.tsx` submits, so the dialog can take it as an action prop unchanged
  - [ ] The new spec proves a non-admin caller gets `{ ok: false }` and neither RPC is invoked
- **notes:** Same file as T6 — run after it to avoid a conflict, though there is no hard dependency.

## T8 · Collapse team sub-routes into one anchored page

- **status:** done
- **model:** opus
- **files:** (guess) `src/app/admin/teams/[programId]/{page,layout}.tsx`, delete `…/{people,roster,schedule,usage,activity}/page.tsx` and `src/components/admin/team-tabs.tsx`, new `src/components/admin/team-section-pills.tsx` + `team-sections.ts`, `next.config.ts`, `tests/admin-routes.spec.ts`, `MAP.md`
- **done when:**
  - [ ] The five sub-route `page.tsx` files and `team-tabs.tsx` are deleted, and nothing under `/admin/teams/[programId]` renders `ComingSoonPage`
  - [ ] `next.config.ts` redirects `/admin/teams/:programId/{people,roster,schedule,usage,activity}` to `/admin/teams/:programId#{people,roster,schedule,usage,activity}`, and `tests/admin-routes.spec.ts` asserts all five
  - [ ] `page.tsx` renders a pill row labelled exactly `Overview · People · Roster · Schedule & results · Usage · Activity log` as in-page anchors (26px tall, `rounded-full`, 12px text, grey-fill active — no underline)
  - [ ] The active pill follows scroll position via IntersectionObserver
  - [ ] The body is `grid-cols-[minmax(0,1fr)_380px] gap-6 items-start` with two `flex flex-col gap-6` columns inside page padding `28px 56px 72px`, with `<section id>` wrappers from `team-sections.ts`: `people`, `requests`, `roster`, `schedule`, `activity` in the main column and `pilot`, `usage`, `conference`, `details` in the rail; the existing People, Requests and Pilot cards mount in their sections
  - [ ] `npm run map` has been run and `MAP.md` no longer lists the five sub-routes
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/chrome.md`. Verify the `.vp` pill spec and padding against `TeamPage.dc.html`, not the plan prose. `src/components/admin/view-pills.tsx` (`ViewPills<T>`) already paints a pill row — reuse it if it fits; follow match-detail's scroll-anchor pattern. Confirm in `node_modules/next/dist/docs` that a redirect `destination` may carry a `#hash`; if it cannot, stop and report rather than re-adding route files. The `/usage` sub-route's month navigation is not on the canvas and goes away here; T16 cleans up `usageByMonth`/`adminLoadProgramUsage`. Later card tasks only fill a section — they must not restructure this grid.

## T9 · Header: 64px crest upload and facts line

- **status:** done
- **model:** opus
- **needs:** T4, T8
- **files:** (guess) `src/components/admin/team-page-header.tsx`, `src/components/dashboard/settings/teams/crest-control.tsx`
- **done when:**
  - [ ] `CrestControl` takes `upload` and `remove` action props, the Settings › Teams caller passes the member actions it used before, and its behaviour there is unchanged
  - [ ] The admin header renders the crest at 64px with the 26px upload badge, wired to `adminUploadProgramCrest` / `adminRemoveProgramCrest`
  - [ ] The facts line shows, each with its icon: `Division · Conference`, `City, ST`, the primary domain, and `Claimed <Mon D>`; a missing fact is omitted rather than printed empty, and an unclaimed program shows no claimed fact
  - [ ] The status chips (`Active`, `Pilot`) still render beside the name, and every button in the header comes from `advButton()`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/chrome.md` and `primitives.md`. Verify sizes and labels against `TeamPage.dc.html`. `CrestControl` already owns `image-adjust-dialog` — do not fork it. The canvas's "Upload for this team" button is **out of scope here**: `adminUploadHref` does not exist on this base (see Branch base) — T22 adds it. Run the widget-states checklist if the hook fires.

## T10 · Header: Edit details dialog and more-actions menu

- **status:** done
- **model:** opus
- **needs:** T6, T9
- **files:** (guess) new `src/components/admin/admin-team-details-dialog.tsx`, `src/components/admin/team-page-header.tsx`
- **done when:**
  - [ ] An outline, md `Edit details` button in the header opens a dialog with fields for school name, team, city, state, staff page URL, primary domain, home venue, default surface, time zone, who can upload, who edits the schedule, roster public/private
  - [ ] The dialog reuses `SettingsField`/`advField` and `SQUAD_OPTIONS`/`SURFACE_OPTIONS` from `team-identity-card.tsx` rather than redefining option lists
  - [ ] Save calls `adminUpdateProgramDetails`, shows the returned error inline on `{ ok: false }`, closes on success, and the save button is `advButton()` and disabled while pending
  - [ ] The dialog is exported with `open`/`onOpenChange` props so the Details card (T18) can open the same instance type
  - [ ] A `⋯` button opens a `float-menu.tsx` menu with exactly `Remove crest`, `Change conference`, `View in Teams list` — `Remove crest` is hidden when there is no crest, `Change conference` links to `#conference`, and no destructive action beyond remove-crest is added
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/settings.md` and `primitives.md`. Verify against `TeamPage.dc.html`. `Change conference` scrolls to the Conference card (T17 owns the control) instead of duplicating the picker. Run the widget-states checklist if the hook fires.

## T11 · People card: transfer label, Uploads on switch, invited rows

- **status:** done
- **model:** opus
- **needs:** T4, T7, T8
- **files:** (guess) `src/components/admin/admin-people-card.tsx`
- **done when:**
  - [ ] The owner-change control reads `Transfer ownership` (no `Make owner` string remains in the file), and the header shows the seat figure from the loader plus an `Invite someone` button
  - [ ] Each non-owner member row has an `adv-switch` labelled `Uploads on` bound to `member.uploadEnabled`, calling `adminSetMemberUploadEnabled`; on `{ ok: false }` it reverts and surfaces the error
  - [ ] Pending invites render as rows inside this card: email, a meta line `<Role> · invited <Mon D> by <name> · expires <Mon D>`, an `Invited` chip, and `Resend` / `Revoke` actions
  - [ ] `Resend` calls `adminInviteMember` with the invite's email and role; `Revoke` calls `adminRevokeInvite`; both disable while pending
  - [ ] With no members and no invites the card shows an empty-state line, not `null`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/settings.md`, `primitives.md`, `empty-and-loading.md`. Verify labels against `TeamPage.dc.html`. Rows come from `AdminPersonRow`. Seats counting changed on this base — print the loader's figure, never re-derive it. After this task invites render here only; T12 removes them from Requests. Run the widget-states checklist if the hook fires.

## T12 · Requests card: Decline / Send invite and claim note strip

- **status:** done
- **model:** opus
- **needs:** T8, T11
- **files:** (guess) `src/components/admin/admin-requests-card.tsx`
- **done when:**
  - [ ] The card is titled `Requests` with an `<n> open` count; the strings `Invites & requests`, `Dismiss` and bare `Invite` no longer appear, and it renders no invite rows
  - [ ] Each join request shows `<Name> asked to join as a <role> · <Mon D>`, the quoted note and the email, with `Decline` and `Send invite` calling `adminResolveJoinRequest` with the matching resolution
  - [ ] When `claim` is approved, a `noteStripCls` strip states who claimed, the date and the recorded reason (self-approved via the staff list / domain match / reviewed by an admin), derived from `AdminTeamClaim` fields
  - [ ] With zero requests the card shows an empty-state line and still renders the claim strip when one applies
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/settings.md` and `empty-and-loading.md`. Verify against `TeamPage.dc.html`. The canvas strip reads "Avery Lin's claim approved itself Aug 26 — the address is on the recorded staff list." That is the `skipsManualReview`/`contactMatched` case; write honest variants for the other cases rather than reusing that sentence. Run the widget-states checklist if the hook fires.

## T13 · Roster card: table and Add player

- **status:** done
- **model:** opus
- **needs:** T5, T7, T8
- **files:** (guess) new `src/components/admin/admin-roster-card.tsx` + `admin-roster-table-layout.ts`, `src/components/dashboard/team/add-player-dialog.tsx`, `src/app/admin/teams/[programId]/page.tsx`
- **done when:**
  - [ ] The `#roster` section renders a card titled `Roster` with sub-line `<n> players · <m> have accounts` and an `Add player` button
  - [ ] The table columns are exactly `# · Player · Class · Account · Matches · Last match`, widths defined in a `*-table-layout.ts` constants module
  - [ ] `#` shows the lineup spot or `—`; Account shows `Joined` or `Not claimed`; Matches shows the count or `—` at zero; Last match shows result + opponent + date, or `No matches yet`
  - [ ] `add-player-dialog.tsx` takes an action prop; the admin card passes `adminAddProgramPlayer`, and the dashboard caller keeps its existing member action with unchanged behaviour
  - [ ] An empty roster shows an empty-state row with the `Add player` affordance, not `null` and not a table of zeroes
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/tables.md`, `primitives.md`, `empty-and-loading.md`. Verify columns and labels against `TeamPage.dc.html`. `add-player-dialog.tsx` is **847 lines and shared with the dashboard roster** — use the `trace-route` skill first and add the action prop without restructuring it; if it cannot be done additively, stop and report rather than rewriting it. Match counts already resolve both `player1_id` id spaces in T5 — do not re-derive them. Run the widget-states checklist if the hook fires.

## T14 · Schedule & results card

- **status:** done
- **model:** opus
- **needs:** T5, T8
- **files:** (guess) new `src/components/admin/admin-schedule-card.tsx` + `admin-schedule-table-layout.ts`, `src/app/admin/teams/[programId]/page.tsx`
- **done when:**
  - [ ] The `#schedule` section renders a card titled `Schedule & results`
  - [ ] The table columns are exactly `Date · Event · Type · Score · Result`, widths in a `*-table-layout.ts` module; Event shows the opponent mark plus `vs <Opponent>` for home and `at <Opponent>` for away
  - [ ] Result reads `Won` / `Lost` with the score for played events, `Awaiting results` with `—` for a past event with no result, `Not played` with `—` for a future event
  - [ ] Rows are ordered newest date first, and an empty schedule shows an empty-state line instead of `null`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/tables.md` and `empty-and-loading.md`. Verify against `TeamPage.dc.html`. Read-only card — no schedule editing. The canvas's "Enter results for this team" header link is **out of scope here**: `adminUploadHref` does not exist on this base — T22 adds it. The canvas row order is Sep 20, Sep 12, Sep 6 (descending). Run the widget-states checklist if the hook fires.

## T15 · Pilot card: canvas layout, Change end date, End pilot

- **status:** done
- **model:** opus
- **needs:** T4, T6, T8
- **files:** (guess) `src/components/admin/pilot-usage-card.tsx`
- **done when:**
  - [ ] The card is titled `Pilot` with sub-line `Through <Mon D, YYYY>` from `data.pilot.endsOn`; the file no longer imports `PILOT_ENDS_AT` or `formatPilotEnd`, and the string `Analysis hours` is gone
  - [ ] It shows `<used> h of <cap> h used in <Month>`, a bar, `<left> h left` and `Resets <Mon 1>`, then kv rows `Team pool` (`<cap> h every month`), `Each member`, `Ends` (`<date> · <n> days left`), `Approved` (`<Mon D> by <name>`, or `by you` when the approver is the viewer)
  - [ ] The `Each member` value is derived from `getMonthlyCapSeconds("individual")`, not a literal `2`
  - [ ] `Change end date` opens `date-field.tsx` in a popover and calls `adminSetPilotEnd`; `End pilot` opens `confirm-dialog.tsx` with an `advButton("danger")` confirm calling `adminEndPilot`; both surface `{ ok: false }` errors
  - [ ] An ended pilot shows `Ended <date>` in place of days-left and hides `End pilot`; a missing approver prints `—`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/primitives.md` and `empty-and-loading.md`. Verify against `TeamPage.dc.html`. The confirm copy must describe what T1's migration header says End pilot does — read that header first. Other `PILOT_ENDS_AT` readers (create-team-dialog, approve-pilot-popover, program-hours-summary, FooterMeter) are out of scope. Run the widget-states checklist if the hook fires.

## T16 · Usage-in-month rail card

- **status:** done
- **model:** opus
- **needs:** T8
- **files:** (guess) new `src/components/admin/admin-usage-card.tsx`, `src/app/admin/teams/[programId]/page.tsx`, `src/lib/data/admin-team-server.ts`, `src/lib/services/programs/admin-team-actions.ts`
- **done when:**
  - [ ] The `#usage` section renders a card titled `Usage in <current month name>` with a `<n> videos` count, from `data.usage`
  - [ ] One row per member with usage: avatar, name and `<x> h`; a member drawing on their individual allowance shows `<x> of <cap> h` with `<cap>` from `getMonthlyCapSeconds("individual")`
  - [ ] The footer line `Players use their own <cap> h before the team pool` derives `<cap>` from `getMonthlyCapSeconds("individual")`, and is omitted for an org type where that rule does not hold
  - [ ] With no usage this month the card shows an empty-state line, not `null`
  - [ ] `usageByMonth` and `adminLoadProgramUsage` are removed if nothing imports them after T8, or kept with a named caller
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/primitives.md` and `empty-and-loading.md`. Verify against `TeamPage.dc.html`. Fix stale copy rather than printing the canvas literally — check how `quota.ts` orders individual vs team pool before asserting the footer. Run the widget-states checklist if the hook fires.

## T17 · Conference rail card with Change and sibling teams

- **status:** done
- **model:** opus
- **needs:** T4, T8
- **files:** (guess) new `src/components/admin/admin-conference-card.tsx`, `src/app/admin/teams/[programId]/page.tsx`
- **done when:**
  - [ ] The `#conference` section renders a card titled `Conference` showing `conference-mark.tsx`, the conference name, and `<Division> · <n> teams · <m> on Advantage`
  - [ ] Sibling teams are listed by name with an `Unclaimed` or claimed chip, each linking to `/admin/teams/<id>`; the current program is excluded
  - [ ] `Change` opens a `MenuSelect` over `conferenceOptionsFor(...)` and calls `addTeamToConference`; an `{ ok: false }` result is surfaced
  - [ ] A program with no conference shows `No conference yet` with the same control labelled `Set conference`, not `null`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/primitives.md` and `empty-and-loading.md`. Verify against `TeamPage.dc.html`. The header's `⋯ › Change conference` (T10) links to this card's anchor. Cap the visible siblings (the canvas shows 3); if truncating, say how many more. Run the widget-states checklist if the hook fires.

## T18 · Details rail card

- **status:** blocked
- **model:** sonnet
- **needs:** T4, T10
- **files:** (guess) new `src/components/admin/admin-details-card.tsx`, `src/app/admin/teams/[programId]/page.tsx`
- **done when:**
  - [ ] The `#details` section renders a card titled `Details` with kv rows in this order: `Program key`, `Staff page`, `Time zone`, `Who can upload`, `Who edits the schedule`, `Roster`
  - [ ] Values are human labels (`Everyone on the team`, `Staff`, `Private`/`Public`, `Eastern`), mapped from the stored values via the same option lists the T10 dialog uses; Staff page shows the host only and links to the full URL
  - [ ] Any null value prints `—`
  - [ ] The header `Edit` button opens the T10 `admin-team-details-dialog`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/settings.md`. Verify against `TeamPage.dc.html`. Card shell from `settings-card.tsx`. Run the widget-states checklist if the hook fires.

## T19 · Activity log card

- **status:** todo
- **model:** sonnet
- **needs:** T4, T8
- **files:** (guess) new `src/components/admin/admin-activity-card.tsx` + `admin-activity-labels.ts`, `src/app/admin/teams/[programId]/page.tsx`
- **done when:**
  - [ ] The `#activity` section renders a card titled `Activity log` listing `data.activity` newest first, each row showing a sentence label, the actor name (`—` when null) and a date
  - [ ] `admin-activity-labels.ts` maps every action in `program_audit_log_action_check` — including `console.result_added`, `console.analysis_attached`, `pilot.end_changed`, `pilot.ended` — to a label, and an unmapped action falls back to its raw string rather than throwing or hiding the row
  - [ ] With no audit rows the card shows an empty-state line, not `null`
  - [ ] No stub or `ComingSoonPage` text for activity remains anywhere under `src/app/admin/teams` or `src/components/admin`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`, then `reference/primitives.md` and `empty-and-loading.md`. This card is NOT on the canvas — it exists so the `Activity log` pill lands somewhere; match the other main-column cards. Read the live action list via Supabase MCP `execute_sql` (`pg_get_constraintdef`). Labels must say "Advantage Intelligence", never "splitstep". Run the widget-states checklist if the hook fires.

## T20 · Fidelity pass against the canvas at 1440

- **status:** todo
- **model:** opus
- **needs:** T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19
- **files:** (guess) new `docs/superpowers/specs/2026-09-18-admin-team-page/fidelity.md`, small fixes across `src/components/admin/*` and `src/app/admin/teams/[programId]/page.tsx`
- **done when:**
  - [ ] `fidelity.md` has a table with one row per measured constant — page padding, grid columns and gap, crest size, badge size, pill height/radius/font, card radius and padding, each table's column widths, rail width — giving the canvas value, the value measured in the running app at 1440 wide, and match / fixed-in-this-diff / deliberate deviation with a reason
  - [ ] Every row is `match` or `deliberate deviation`; every `fixed-in-this-diff` row has a corresponding change in the diff
  - [ ] `fidelity.md` records each of the six flows — crest upload, Edit details, invite/resend/revoke, uploads toggle, add player, change/end pilot, change conference — as exercised against the ZZ Test Program, with the `program_audit_log` action that appeared in the Activity card, or the reason a flow writes no audit row
  - [ ] Every user-visible label on the page matches the canvas text, or is listed in `fidelity.md` as corrected stale copy with the reason
- **notes:** Measure with computed styles, not by eye. Canvas values come from `TeamPage.dc.html`, not the plan prose. Test program: ZZ Test Program `edaf1aa0…` only — never exercise End pilot or Transfer ownership on a real program. The admin route needs an admin session: use the dashboard screenshot harness (throwaway service-role user + Playwright login on the worktree port) and delete the throwaway user afterwards. Fixes must stay small; a card needing restructuring gets a new task, not a sweep here.

## T21 · Release checks

- **status:** todo
- **model:** sonnet
- **needs:** T20
- **files:** (guess) whatever the checks flag; `MAP.md`
- **done when:**
  - [ ] `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test` and `npm run test:database` all exit 0, with the output summarised in the run log
  - [ ] `npm run map` produces no diff
  - [ ] `grep -rn "team-tabs\|ComingSoonPage" src/app/admin/teams src/components/admin` returns nothing, and no unused exports remain in `admin-team-actions.ts` or `admin-team-server.ts`
  - [ ] No file under `src/components/admin/` imports `@/lib/supabase/admin`, and the `client-bundle-boundary` spec passes
- **notes:** Mechanical. If a check fails for a reason needing design judgment, stop and report rather than fixing it here. Random live-spec failures are usually the shared-IP Supabase sign-in rate limit — re-run before diagnosing; ~20 live failures plus an 8–16 min run means a degraded Supabase, so stash rather than looping gates. After this, the user runs `/pr-check medium` and opens the PR into `splitstep-integration`.

## T22 · Wire the two upload links once admin-uploads lands

- **status:** later
- **model:** sonnet
- **files:** (guess) `src/components/admin/team-page-header.tsx`, `src/components/admin/admin-schedule-card.tsx`
- **done when:**
  - [ ] The header renders the canvas's `Upload for this team` primary button via `advButton("primary","md")`, linking to `adminUploadHref(program.id, null)`
  - [ ] The Schedule & results card header renders `Enter results for this team`, linking to `adminUploadHref(programId, "dual")`
  - [ ] `fidelity.md` gains a row for each of the two affordances, measured against `TeamPage.dc.html`
- **notes:** **Deliberately `later`.** `adminUploadHref` and `/admin/uploads/new` come from the admin-uploads work (`codex/admin-uploads`, plus `codex/admin-uploads-pr-check` which carries its `/pr-check` simplify commit), which was never opened as a PR and is not in this branch. Promote this task to `todo` by hand only after that work merges into `splitstep-integration`. Do not stub `adminUploadHref` locally to unblock it — that would duplicate the module the other branch owns.
