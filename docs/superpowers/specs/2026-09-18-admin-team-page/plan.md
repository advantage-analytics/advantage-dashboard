# Admin Team page — rebuild to the canvas ("Team page", Admin Console artifact)

## Context

The design (`TeamPage.dc.html` in artifact `1JBKjq9ciTfZkUwEQgrWUr`, 1440×1500, page "final") draws
`/admin/teams/[programId]` as **one page**: identity header → a pill row → a two-column body
(`minmax(0,1fr) 380px`, 24px gaps) holding nine cards.

**Why the code differs — it was a plan-level scope cut, not accidental drift.** Task T19 in
`.claude/tasks/claude-admin-claims-redesign-c793cc.md:296-297` told the builder to turn the canvas's
pill row into six **sub-routes** with a 2px-underline tab bar ("a tab is a choice", copied from
Settings) and to ship four of them as `ComingSoonPage` stubs ("non-Phase-1"). Commit `7b8ff1ed` did
exactly that. The canvas never drew tabs-with-pages; it drew grey-fill _view pills_ over a single
surface. T20 then shipped the admin crest upload actions but never wired the control into the header
("`ProgramCrest` at 52px for now — T20 wires the upload control", same file `:295`).

Decisions taken with the user: pills become **scroll anchors**; **per-team pilot** gets built
(migration + RPCs); an **Activity card** is added so the sixth pill lands somewhere; delivered on a
**new branch off `splitstep-integration`** through the task queue, not on the admin-uploads branch.

## Gap list (canvas → code today)

| Canvas                                                                                               | Today                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 64px crest with upload badge                                                                         | 52px read-only `ProgramCrest`; `adminUploadProgramCrest`/`adminRemoveProgramCrest` exist, unwired |
| `Edit details` button + Details card `Edit`                                                          | absent; no admin write path (`update_program_settings` is member-gated)                           |
| `⋯` more-actions                                                                                     | absent                                                                                            |
| Facts line: division·conference, city/state, domain, "Claimed Aug 26"                                | only division·conference                                                                          |
| Pill row, grey-fill active, single page                                                              | 6 sub-routes, blue underline, 4 stubs                                                             |
| People: "Transfer ownership", per-member "Uploads on", invited rows with Resend/Revoke inside People | "Make owner"; no uploads toggle; invites live in the Requests card                                |
| Requests: "Decline" / "Send invite", claim-approval note strip                                       | "Dismiss" / "Invite", titled "Invites & requests", no note                                        |
| Roster table (# · Player · Class · Account · Matches · Last match) + Add player                      | stub                                                                                              |
| Schedule & results table + "Enter results for this team"                                             | stub                                                                                              |
| Pilot card: used-of-cap, bar, Team pool / Each member / Ends / Approved, Change end date, End pilot  | "Analysis hours", hours-left, no Approved row, no actions, global `PILOT_ENDS_AT`                 |
| "Usage in September" per-member card on the page                                                     | only on `/usage` sub-route                                                                        |
| Conference card + Change + sibling teams                                                             | absent                                                                                            |
| Details card (program key, staff page, time zone, who can upload, who edits schedule, roster)        | absent (all columns exist on `programs`)                                                          |
| Activity log                                                                                         | stub                                                                                              |

## Approach

New branch `claude/admin-team-page-canvas` off `splitstep-integration` (after the admin-uploads PR
merges, since it touches `team-page-header.tsx`). Queue with `/task-add`, split **by surface** so no
task sweeps several large files. Before any UI task: read `.skills/advantage-analytics-design/SKILL.md`

- `reference/{chrome,tables,settings,primitives,empty-and-loading}.md`, and verify constants against
  the extracted `TeamPage.dc.html`, not this prose.

### 1. Database (one migration per concern; apply each to live via Supabase MCP `apply_migration` — never `db push`, the repo is 70 migrations off the live ledger)

- **`admin_program_pilot`**: `programs.pilot_ends_on date`, `pilot_approved_by uuid → users`, `pilot_approved_at timestamptz`, `pilot_ended_at timestamptz`. Backfill active programs: `pilot_ends_on = '2026-12-31'`, approved-by/at from the latest approved `program_claims` row (`reviewed_by`, `updated_at`). RPCs `admin_set_pilot_end(p_program_id, p_ends_on)` and `admin_end_pilot(p_program_id)` — `security definer`, `search_path=''`, gate `public.is_admin()`, write `program_audit_log` (extend `program_audit_log_action_check` with `pilot.end_changed`, `pilot.ended`, **preserving every live action incl. the two `console.*` ones just added**). Decide in-task what `admin_end_pilot` does to `status` (read `claim-state.ts` / `canSubmitVideo` first; do not invent a new status value without checking `programs_status_check`).
- **`admin_update_program_details`**: admin RPC (or `or public.is_admin()` widening of `update_program_settings`, matching the T4 pattern in `20260914100200_admin_program_rpcs.sql`) covering school name, team, city/state, staff_page_url, primary_domain, home_venue, default_surface, time_zone, upload_policy, events_policy, roster_public. Audited.
- **`admin_member_and_roster_writes`**: widen `set_member_upload_enabled` and `add_program_player` with `or public.is_admin()` **and an explicit `p_program_id`** (the member versions infer the program from the active workspace, which an admin doesn't have).
- Quota must honour the per-team end date: replace reads of `PILOT_ENDS_AT`/`formatPilotEnd()` (`src/lib/services/splitstep/config.ts:151,162`) on this page with the column; keep the constant as the backfill default only. Check `quota.ts` / `claim-state.ts` for anything that should stop when a pilot ends.
- Run `rls-boundary-reviewer` + `supabase:supabase-postgres-best-practices` on these.

### 2. Loader — extend `getAdminTeam` (`src/lib/data/admin-team-server.ts`, service-role, `cache()`d)

Add to `AdminTeamData`, inside the existing `Promise.all`: program detail columns (extend `PROGRAM_SELECT`), `pilot` fields + approver name, `roster` (program_players, not archived/merged, by `lineup_spot`; match count + last match per player — note `matches.player1_id` holds **both** auth uid and `program_players.id`, resolve both), `schedule` (reuse `readScheduleWithClient` from `src/lib/data/schedule-server.ts` with the admin client), `conference` + sibling programs (reuse `loadConferenceTeams`, `admin-conference-actions.ts:220`), `activity` (latest ~20 `program_audit_log` rows + actor names), per-member `uploadEnabled`. `usage` already carries per-member lines.

### 3. Server actions — `src/lib/services/programs/admin-team-actions.ts` (same pattern: `requireAdmin()`, session client for RPCs so audit rows name the admin, `revalidatePath("/admin","layout")`)

New: `adminUpdateProgramDetails`, `adminSetPilotEnd`, `adminEndPilot`, `adminSetMemberUploadEnabled`, `adminAddProgramPlayer`. Reuse as-is: `adminUploadProgramCrest`, `adminRemoveProgramCrest`, `adminInviteMember` (resend = same call), `adminRevokeInvite`, `adminResolveJoinRequest`, `adminSetProgramMemberRole`, `adminTransferProgramOwnership`, `addTeamToConference` (change conference).

### 4. Page frame

- Delete `people/ roster/ schedule/ usage/ activity/ page.tsx` and `team-tabs.tsx`; add `next.config.ts` redirects from the five sub-paths to `/admin/teams/:id#<anchor>`; run `npm run map`.
- `layout.tsx` keeps header; `page.tsx` renders pill row + `grid-cols-[minmax(0,1fr)_380px] gap-6 items-start`, columns `flex flex-col gap-6`, page padding `28px 56px 72px`.
- New `team-section-pills.tsx` (client): canvas `.vp` spec — 26px, `rounded-full`, 12px, grey-fill active — anchors to card ids, active pill via IntersectionObserver; follow match-detail's scroll-anchor pattern. Check whether `view-pills.tsx` `ViewPills<T>` already paints this and reuse it.

### 5. Header — `team-page-header.tsx`

64px crest with the 26px upload badge: adapt `CrestControl` (`settings/teams/crest-control.tsx`) to take `upload`/`remove` action props and pass the admin actions (it already owns `image-adjust-dialog`). Facts line with icons (division·conference, city+state, domain, claimed date). `Edit details` (outline md) opens a dialog reusing `SettingsField`/`advField` + `SQUAD_OPTIONS`/`SURFACE_OPTIONS` from `team-identity-card.tsx`. `⋯` via `float-menu.tsx`: Remove crest, Change conference, View as list in Teams (no invented destructive actions).

### 6. Cards (each its own task; shells from `settings-card.tsx`, rows from `AdminPersonRow`, tables per `tables.md` using a `*-table-layout.ts` constants module like `teams-table-layout.ts`)

Main column: **People** (rename to "Transfer ownership", add `adv-switch` "Uploads on", move invited rows + Resend/Revoke in) → **Requests** ("Decline"/"Send invite", `noteStripCls` claim-approval line from `claim`) → **Roster** (+ Add player, reuse `add-player-dialog.tsx` with an action prop) → **Schedule & results** ("Enter results for this team" → `adminUploadHref(id, "dual")`) → **Activity**.
Rail: **Pilot** (rewrite `pilot-usage-card.tsx`; Change end date = `date-field.tsx` in a popover; End pilot = `confirm-dialog.tsx`, `advButton("danger")`) → **Usage in {month}** (per-member lines from `data.usage`) → **Conference** (`conference-mark.tsx`, Change = `MenuSelect` over `conferenceOptionsFor`) → **Details** (kv rows, Edit opens the same dialog as the header).
Every card: honest empty state, `—` for unmeasured, no `return null` for "no data" — run the `widget-states` checklist where the hook fires.

### 7. Copy check (memory: copy the layout literally, fix stale copy)

"Players use their own 2 h before the team pool" and "Each member 2 h" — verify against `getMonthlyCapSeconds("individual")` before printing. "Advantage Intelligence" only in user-visible strings.

## Task split (for `/task-add`)

T1 pilot migration+RPCs · T2 details RPC · T3 member-upload/add-player RPC widening · T4 loader extension · T5 new server actions + specs · T6 frame: delete sub-routes, redirects, pill anchors, grid · T7 header: crest upload, facts, Edit details dialog, ⋯ · T8 People+Requests · T9 Roster · T10 Schedule · T11 Pilot card · T12 Usage+Conference+Details cards · T13 Activity card · T14 fidelity pass against the canvas + release checks.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test` (extend `tests/admin-routes.spec.ts` for the redirects; new specs for each action's admin gate + refusal of a non-admin, following `tests/admin-upload-*.spec.ts`); DB tests under `tests/database/` for the three migrations.
- Live DB: confirm functions/columns via Supabase MCP `execute_sql`; `get_advisors` for security after DDL.
- Visual: run the app, open `/admin/teams/<ZZ Test Program id edaf1aa0…>` at 1440 wide in the browser pane beside the artifact's Team page artboard; exercise crest upload, Edit details, invite/resend/revoke, uploads toggle, add player, change/end pilot, change conference; confirm each writes a `program_audit_log` row that then shows in the Activity card.
- `/pr-check medium` on the branch before the PR into `splitstep-integration`.
