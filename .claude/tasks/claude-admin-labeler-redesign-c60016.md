# Tasks — claude/admin-labeler-redesign-c60016

> Scope: the stripped admin console and the labeller queue, built from docs/superpowers/specs/2026-11-12-admin-strip/README.md

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

## T1 · Put the pages leaving the tab row into the admin account menu

- **status:** done
- **model:** sonnet
- **files:** guess — src/components/admin/admin-account-menu.tsx, tests/admin-shell-nav.spec.ts (new)
- **routes:** /admin
- **done when:**
  - [ ] `admin-account-menu.tsx` exports a const list of exactly seven links in this order: Requests → `/admin/requests`, Messages → `/admin/messages`, Ask → `/admin/ask`, Conferences → `/admin/conferences`, Pilots → `/admin/pilots`, Outreach → `/admin/outreach`, Pay report → `/admin/labels/pay`, and the menu renders one item per entry of that list
  - [ ] The seven items sit above "Back to the dashboard"; "Back to the dashboard", "Sign out" and the sign-out confirm dialog are still rendered and their handlers are unchanged
  - [ ] A new spec under `tests/` imports the list and asserts its labels and hrefs in order
  - [ ] The component's doc comment no longer says the menu holds two rows only
- **notes:** Piece 1 of docs/superpowers/specs/2026-11-12-admin-strip/README.md (Shell row). Navigation only: no route moves. Use the existing `FloatMenuItem` + `FloatMenuDivider`; read `.skills/advantage-analytics-design/SKILL.md` first (no numeric badges in chrome).

## T2 · Cut the admin header to four tabs

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** guess — src/components/admin/admin-header.tsx, src/lib/data/admin-nav-server.ts, tests/admin-shell-nav.spec.ts
- **routes:** /admin, /admin/pilots
- **done when:**
  - [ ] `admin-header.tsx` exports its tab list with exactly four entries in this order: Today `/admin`, Labels `/admin/labels`, Matches `/admin/matches`, Teams `/admin/teams`, and `tests/admin-shell-nav.spec.ts` asserts labels and hrefs in order
  - [ ] The `MORE` array, the "More" `FloatMenu` and its trigger are gone from `admin-header.tsx`, and `AdminNavCounts` has no `more` field
  - [ ] `loadAdminNav` returns counts for labels, matches and teams only and no longer calls the requests, messages, pilots, ask or sub-line readers; any of those helpers left with no importer is deleted in the same diff
  - [ ] The diff deletes or renames no file under `src/app/admin/` and leaves `next.config.ts`, `MAP.md` and `tests/admin-routes.spec.ts` unchanged
- **notes:** Requests, Messages and Ask keep their routes and are reached from Today's rows (T3/T4). Counts stay plain text in the label ("Matches · 3"). Update the header's doc comment (it describes six tabs and More).

## T3 · Today loader: support messages and per-row actions

- **status:** done
- **model:** opus
- **files:** guess — src/lib/data/admin-today-server.ts, src/lib/data/support-admin-server.ts, tests/admin-today-rows.spec.ts (new)
- **done when:**
  - [ ] `TodayKind` includes `"message"`, and the loader adds one row per support thread waiting on staff by the same `waitingOn(...) === "you"` rule `countMessagesForNav` uses: key `message:<threadId>`, `since` the player's latest message time; a failed read yields no message rows through the existing `settle` wrapper
  - [ ] Each `TodayItem` carries an ordered `actions` list in place of the single `primary`: a claim the Requests drawer offers a plain Approve for gets Approve (the claim id) then Decline (link to `/admin/requests?id=`); every other claim or request gets one "Open" link to that drawer; job "Open" → `/admin/matches?id=`; label "Open" with `startLabellingJobId`; ask "Open" → `/admin/ask?id=`; pilot "Add hours" → `/admin/pilots`; message "Reply" → `/admin/messages?id=<threadId>`
  - [ ] The message-row builder and the kind-to-actions mapping are pure exported functions, and the new spec asserts them for one fixture of each kind and that a mixed list sorts longest wait first
  - [ ] `RESOLVABLE_KINDS` is unchanged and `"message"` is not in it; a row whose kind is in `RESOLVABLE_KINDS` carries a trailing "Resolve" action after its other actions, and the spec asserts it for one such kind and its absence on a message row
- **notes:** README Today row: "Support messages join the list (the loader does not read them today)". The artboard's "To check" rows and "Check" action are piece 3; do not add them. Pilot "Add hours" links to the existing per-account Set hours on `/admin/pilots` (README known gap: no team-level Add hours). An unvouched "Approve anyway" claim gets Open, not a one-click Approve. Do not build the artboard's "This month: 57 matches analysed…" sentence; no loader reads it.

## T4 · Today screen: per-row actions, no pills

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** guess — src/components/admin/today/today-page-content.tsx, src/app/admin/page.tsx, src/app/admin/loading.tsx
- **routes:** /admin
- **done when:**
  - [ ] `today-page-content.tsx` no longer imports or renders `CountPills`, and the Resolved view is not rendered; rows resolved earlier stay hidden (the loader's filter is untouched) and `src/app/admin/today-actions.ts` is not deleted
  - [ ] Each row renders its `actions` in a trailing cell: link actions as links, Approve calling `approveClaim` with a pending state and its refusal sentence printed in the row, and the label action through the existing start-labelling path
  - [ ] The row's title is a link to the item (`link.href`, else the first link action's href); a row click no longer opens `TodayDrawer` and `TodayDrawer` is removed from the file; `ResolveForm` stays and is opened by the row's "Resolve" action
  - [ ] The header row and `TodayPageSkeleton` both read Kind · What · Waiting plus an unlabelled actions track, and Waiting is drawn from `since`
- **notes:** Layout and copy from docs/superpowers/specs/2026-11-12-admin-strip/AdminToday.dc.html; design-system skill wins on tokens, buttons through `advButton()`. Page sits centred in its column. Keep the existing pipeline line. Owner's decision at add time: the hand "Resolve" stays as a row action on the kinds that have no natural end, so nothing sits on Today forever; only the Resolved view goes.

## T5 · Admin resubmit of a failed analysis

- **status:** done
- **model:** fable
- **files:** guess — src/lib/services/splitstep/resubmit-job.ts, src/app/admin/matches/resubmit-action.ts (new, or a route under src/app/api/admin/splitstep/), tests/admin-resubmit.spec.ts (new)
- **done when:**
  - [ ] A new admin-only entry point takes a job id (or a match id resolved to its newest job), re-checks `users.is_admin` itself, and refuses a signed-out or non-admin caller before any job read or vendor call; the spec asserts with injected deps that nothing is sent
  - [ ] For a job in a resubmittable failed state it calls `resubmitJob()` without `reprocess: true`, bills the match's own workspace as the automatic retry resolves it (never a workspace of the admin's), and skips only the session-bound upload-contract roster read, through a named and logged parameter; the spec asserts the quota reservation is made against the match's workspace
  - [ ] A match with `verified = true` and a job that is not failed are each refused with the sentence the existing paths use, and the spec covers both
  - [ ] Refusals come back as `{ error, code }` (a route through `errorResponse()`, an action as `{ ok: false, error, code }`), and the attempt is logged with the admin's id
  - [ ] `src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts`, `tests/resubmit-authorization.spec.ts` and `tests/resubmit-route-billing.spec.ts` are unchanged, and `MAP.md` is regenerated in the same diff if a route file was added
- **notes:** README: "There is no admin action to resubmit a failed analysis; only the customer's Retry analysis exists." The customer route cannot serve an admin: it 404s on `created_by !== user.id`, bills from the caller's workspaces and reads the roster as the session user. `/api/admin/splitstep/reprocess` is for COMPLETED jobs and is free; do not reuse `reprocess`. Planner's assumptions, amend if wrong: the retry is billed to the match's workspace like the auto-retry, and the attempt ceiling, duplicate, blob and metadata checks still apply. Run rls-boundary-reviewer's concerns in mind: service role stays server-side.

## T6 · Matches loader: video hours and progress steps

- **status:** todo
- **model:** opus
- **files:** guess — src/lib/data/admin-matches-server.ts, src/lib/data/admin-match-progress.ts (new), tests/admin-match-progress.spec.ts (new)
- **done when:**
  - [ ] `AdminMatchRow` gains the video's length in seconds (null when the match has no video) and, for a row in the `failed` bucket, the id of its failed job
  - [ ] `AdminMatchRow` gains the moments the steps read (uploaded, sent for analysis, results landed, label session state, verified at), read in the loader's existing batched reads and not inside a per-match loop
  - [ ] A pure exported `matchProgressSteps(row)` returns the steps in this order: Uploaded, Sent for analysis, Results landed, Being labelled, Published, Checked, each with a state, and an imported match with no processing job yields Uploaded alone
  - [ ] The new spec pins the steps for these fixtures: uploading, analysing, failed, analysed and unlabelled, being labelled, verified; Published and Checked turn done together on a verified match
- **notes:** Step names from README Matches row. "Checked" is piece 3 vocabulary with no separate fact today: an admin's Mark complete both publishes and checks, so the two steps share `matches.verified` until piece 3 splits them. Video length: the pay and usage reports already read `duration_seconds` / `billable_seconds`; use the same column they do.

## T7 · Matches screen: one-line rows and the progress panel

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** guess — src/components/admin/matches/matches-page-content.tsx, src/components/admin/matches/match-peek-drawer.tsx, src/components/admin/admin-cells.tsx, src/app/admin/matches/page.tsx
- **routes:** /admin/matches
- **done when:**
  - [ ] The header row reads exactly Match, Workspace, Status, Video, Uploaded; the Event and Views columns are gone from the table
  - [ ] Each row is one line: the two players, the workspace cell (crest and program, or avatar and "Personal"), one status mark with its words, video hours ("—" when null) and one upload time; `TwoLineDate` and the score line are no longer rendered in the row
  - [ ] The view pills (All, Uploading, Analyzing, Failed) and the Program filter are still rendered, and `page.tsx` reads `?program=<programId|personal>` and passes it as the filter's initial value
  - [ ] `MatchPeekDrawer` renders the steps from `matchProgressSteps(row)` with each step's label and sub-line, and still shows the match id with `CopyButton`, "Open report" and the Labels link
- **notes:** Layout and copy from AdminMatches.dc.html; build with `ProgramCrest`, `AdminAvatar`, `VerifiedMark`, `StepMark`, not the artboard's placeholders. The artboard's pills (In analysis, To label, To check) and "due in" text are pieces 2 and 3: keep today's pills. `?program=` is what the team page's "All N in Matches" link (T12) lands on. Resubmit is T8.

## T8 · Resubmit buttons on Matches and Today

- **status:** todo
- **model:** opus
- **needs:** T4, T5, T7
- **files:** guess — src/components/admin/matches/resubmit-button.tsx (new), src/components/admin/matches/matches-page-content.tsx, src/components/admin/matches/match-peek-drawer.tsx, src/lib/data/admin-today-server.ts, src/components/admin/today/today-page-content.tsx, tests/admin-today-rows.spec.ts
- **routes:** /admin/matches, /admin
- **done when:**
  - [ ] One client component calls T5's entry point, shows a pending label while it runs, prints the refusal sentence inline, and refreshes the route on success
  - [ ] It is rendered on a Matches row only when the row is in the `failed` bucket and carries a failed job id, its click does not open the panel, and the panel shows it for the same rows
  - [ ] Today's "Analysis failed" rows carry a Resubmit action rendered by the same component, "Analysis stuck" rows keep "Open", and `tests/admin-today-rows.spec.ts` asserts both
  - [ ] No file under `src/components/dashboard/` or `src/app/dashboard/` changes
- **notes:** README: "A failed analysis has Resubmit, on the row and on Today." A stuck submit (`uploaded`, never sent) is not resubmittable by `resubmitJob`, so it gets no button.

## T9 · Teams list: program rows with the video-hours bar

- **status:** todo
- **model:** opus
- **files:** guess — src/lib/data/admin-teams-server.ts, src/components/admin/teams-table.tsx, src/components/admin/teams-table-layout.ts, src/components/admin/teams-page-content.tsx, src/app/admin/teams/page.tsx, tests/admin-teams-cursor.spec.ts
- **routes:** /admin/teams
- **done when:**
  - [ ] `AdminTeamRow` gains this month's video seconds used and cap, by the rule the team detail loader's usage read applies, read for the page's rows in one batched step; a failed read leaves them null
  - [ ] `TEAMS_COLUMNS` is exactly Program, Members, Video hours this month, Owner; Division, Conference, State and Plan are no longer columns, and squad, division and "Pilot" print as one facts line under the program's name
  - [ ] The hours cell draws a bar and "X of Y h" through the existing usage-format helpers, and "—" with no bar when the values are null
  - [ ] The In pilot, Needs review and Whole directory pills are gone from the toolbar while `listAdminTeams`'s view union is unchanged, and a row whose `plan` is `"approve"` still renders its Approve control
  - [ ] Specs that pin the old columns are updated in the same diff
- **notes:** Layout and copy from AdminTeams.dc.html; design-system table laws apply. "Programs" is today's `on_advantage` list; programs not on Advantage are reached through search, as the artboard's footnote says. The Division/Conference menus, sort and "Create team" are not named for removal: leave them. The second pill arrives in T10.

## T10 · Teams list: Pilot players view

- **status:** todo
- **model:** opus
- **needs:** T9
- **files:** guess — src/components/admin/teams-page-content.tsx, src/app/admin/teams/page.tsx, src/components/admin/pilots-page-content.tsx, src/lib/data/admin-pilots-server.ts
- **routes:** /admin/teams?view=pilots, /admin/pilots
- **done when:**
  - [ ] The toolbar's view pills are exactly "Programs" and "Pilot players", each with its count as text
  - [ ] `/admin/teams?view=pilots` renders one row per account from `listAdminPilots()`, and `page.tsx` calls that loader only for this view
  - [ ] The pilot rows are one component imported by both the Teams view and `pilots-page-content.tsx` (extracted, not copied), and a row still opens `SetHoursDialog` and Remove through the existing `setVideoHours` and `removeIndividualPilot` actions
  - [ ] `src/app/admin/pilots/page.tsx` still exists and `MAP.md` is unchanged
- **notes:** README Teams row: "Two views: Programs and Pilot players (the Pilots page's list moves here)." The Pilots route stays (reached from the account menu, T1). Video hours remain per account: no team-level Add hours is built.

## T11 · Team loader: player join link and latest matches

- **status:** todo
- **model:** fable
- **files:** guess — src/lib/data/admin-team-server.ts, src/lib/data/admin-matches-server.ts, tests/admin-team-links.spec.ts (new)
- **done when:**
  - [ ] `AdminTeamData` gains `joinLink` (`{ url, mode }` or null) from the program's live `program_join_links` row (`revoked_at is null`), the url built with `joinHref()`; the read creates nothing and the token is never logged
  - [ ] `AdminTeamData` gains the program's three newest matches (players, analysis status, upload time) and its match count, using admin-matches-server's status resolution rather than a second rule
  - [ ] Both reads sit in `getAdminTeam`'s existing `Promise.all` behind `requireAdminOrNotFound()`, and a failed read logs and degrades to null or an empty list instead of failing the page
  - [ ] No member last-activity field is added to the loader
  - [ ] The new spec asserts the pure mappers: a live link, no link, and a three-match list in newest-first order
- **notes:** README known gaps: "The team loader returns no last-activity time per member and no player join link… leave that column out." `program_join_links` stores the token in plaintext and is staff-only under RLS; this is a new service-role read, hence the route. `mode` is `open` or `approve` (src/lib/services/programs/join-links.ts) and the page must be able to say which.

## T12 · Team detail: one centred column

- **status:** todo
- **model:** opus
- **needs:** T11
- **files:** guess — src/app/admin/teams/[programId]/page.tsx, src/app/admin/teams/[programId]/layout.tsx, src/components/admin/team-page-header.tsx, src/components/admin/team-sections.ts, src/components/admin/team-section-pills.tsx, src/components/admin/admin-details-card.tsx, tests/admin-team-views.spec.ts
- **routes:** /admin/teams/[programId], /admin/teams/[programId]?view=usage
- **done when:**
  - [ ] `page.tsx` no longer renders `TeamSectionView`, the pill row or the 380px rail; the default view is one centred column in this order: header, Details, People, Latest matches, activity link
  - [ ] The header keeps the crest upload control and shows this month's hours with a bar and an "Add hours" link to `?view=usage`; no new hours write is added
  - [ ] Details is one row of facts with a single "Edit details" button opening `AdminTeamDetailsDialog`, the conference is still changeable from the page through the Conference card's own control, and both links print with a Copy button: the player link from `joinLink` (omitted when null, worded for its `mode`) and the coach link `/claim/<programKey>` (omitted without a key)
  - [ ] Latest matches lists the loader's three rows with a link to `/admin/matches?program=<programId>`, and the activity link goes to `?view=activity`
  - [ ] `?view=schedule`, `usage` and `activity` each render that view's existing card(s) alone in the centred column with a link back, `people` renders the People section with the Contacts card, `roster` and unknown values render the default; `tests/admin-team-views.spec.ts` pins this mapping and `next.config.ts` is unchanged
- **notes:** Layout and copy from TeamDetail.dc.html; "Keep it quiet" and "pages sit centred" are the owner's words in the README. `tests/admin-routes.spec.ts` pins the five `/admin/teams/<id>/<slug>` → `?view=<slug>` redirects, so every `?view=` must still land somewhere. There is no team-level Add hours: the link goes to the existing Pilot and Usage cards. Schedule, per-member Usage, Pilot, Contacts and Activity have no place in the artboard; they are kept behind `?view=` rather than deleted (planner's assumption). The People section keeps today's cards until T13.

## T13 · Team detail: one People list

- **status:** todo
- **model:** opus
- **needs:** T12
- **files:** guess — src/components/admin/admin-people-card.tsx, src/components/admin/admin-requests-card.tsx, src/components/admin/admin-roster-card.tsx, src/lib/data/admin-team-roster.ts, tests/admin-people-card.spec.ts, tests/admin-team-roster.spec.ts
- **routes:** /admin/teams/[programId]
- **done when:**
  - [ ] The People section is one list: join requests first, each with Approve and Decline wired to `adminResolveJoinRequest`, then members and roster players together, a roster player with a linked account appearing once
  - [ ] The only account state a row prints is "No account · Invite" on a roster player with no linked account, Invite starting the existing invite flow for that player; no last-activity text is rendered
  - [ ] The section header carries "Add player" and "Invite people", each opening the flow the Roster and People cards use today
  - [ ] The member actions that exist today (set role, transfer ownership, upload toggle, revoke a pending invite) are still reachable from the row, and pending invites are still listed
  - [ ] A spec asserts the order (requests, then people) and the once-only merge from a fixture, and specs pinning the replaced cards are updated in the same diff
- **notes:** README Team detail row and known gap: "The 'Active today' text in the artboard has no data behind it: leave that column out." Screens only: every write goes through the existing `admin-team-actions.ts` functions.

## T14 · Label match overview: checklist as the body

- **status:** todo
- **model:** opus
- **files:** guess — src/components/admin/labels/label-dashboard.tsx, src/app/design/labels/labels-preview.tsx, tests/label-console.spec.ts, tests/label-console-labeller.spec.ts, tests/label-error-marking.spec.ts, tests/label-score-stall.spec.ts
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] For the admin audience the dashboard renders one centred column with no "Left to check", "Statistics from the labels" or "Score" card, and the `data-dashboard-card` list pinned in `tests/label-console.spec.ts` is updated to the new order in the same diff
  - [ ] The admin's checklist has no "Every point checked" item and a spec asserts its absence; `src/lib/services/labels/session-status.ts` and the "Mark complete" button and confirm in `label-console.tsx` are unchanged
  - [ ] Every open check that concerns a set, point or game renders a control naming its target ("Set 1", "Point 57", "Game 9") that calls `onOpen` with that point's id, a "Wrong data fixed" row carries the open wrong-data flags, and a spec asserts the targets for a fixture with a differing set, a flag that can move the score and an unfinished game
  - [ ] "Entered at upload" is one row, closed by default, whose summary names the scoring, the starting side and best-of; opened, it still holds the lines and the scoring control it has today
  - [ ] The progress line reads "N flags left" (N from `openFlags`, split into those that can move the score and wrong data) with no bar and no "points checked" text inside the dashboard, and a spec asserts the sentence
- **notes:** Layout and copy from MatchOverview.dc.html. README: the button keeps "Mark complete" and today's behaviour ("Publish" is piece 3 wording), and "the progress line reads 'N flags left' with no bar" until piece 2 records a starting count. Admin audience only: the labeller's overview ("Before you submit", pinned by `tests/label-console-labeller.spec.ts`) is piece 2 and stays as it is. The console header's own "N of M points checked" lives in `label-console.tsx` and is not part of this task.
