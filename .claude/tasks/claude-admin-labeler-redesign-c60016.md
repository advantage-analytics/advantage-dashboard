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

- **status:** done
- **model:** opus
- **files:** guess — src/lib/data/admin-matches-server.ts, src/lib/data/admin-match-progress.ts (new), tests/admin-match-progress.spec.ts (new)
- **done when:**
  - [ ] `AdminMatchRow` gains the video's length in seconds (null when the match has no video) and, for a row in the `failed` bucket, the id of its failed job
  - [ ] `AdminMatchRow` gains the moments the steps read (uploaded, sent for analysis, results landed, label session state, verified at), read in the loader's existing batched reads and not inside a per-match loop
  - [ ] A pure exported `matchProgressSteps(row)` returns the steps in this order: Uploaded, Sent for analysis, Results landed, Being labelled, Published, Checked, each with a state, and an imported match with no processing job yields Uploaded alone
  - [ ] The new spec pins the steps for these fixtures: uploading, analysing, failed, analysed and unlabelled, being labelled, verified; Published and Checked turn done together on a verified match
- **notes:** Step names from README Matches row. "Checked" is piece 3 vocabulary with no separate fact today: an admin's Mark complete both publishes and checks, so the two steps share `matches.verified` until piece 3 splits them. Video length: the pay and usage reports already read `duration_seconds` / `billable_seconds`; use the same column they do.

## T7 · Matches screen: one-line rows and the progress panel

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

## T15 · Conference loader: one conference, its teams, its latest matches

- **status:** done
- **model:** fable
- **files:** guess — src/lib/data/admin-conferences-server.ts, src/lib/data/admin-teams-server.ts, src/lib/data/admin-matches-server.ts, src/lib/data/admin-team-links.ts, tests/admin-team-links.spec.ts
- **done when:**
  - [ ] `AdminTeamsFilters` has a `conferenceId` field and `listAdminTeams` applies it as an equality on `programs.conference_id`; the existing text `conference` filter and its `?conference=` callers are unchanged
  - [ ] `admin-matches-server.ts` exports `latestMatchesForPrograms(programIds, limit)`, which reads with `.in("program_id", …)`, returns `{ matches: [], total: 0 }` without a query for an empty id list, and puts `programId` on every match it returns; `latestMatchesForProgram` calls it instead of keeping a second copy of the body
  - [ ] `admin-conferences-server.ts` exports `getAdminConference(conferenceId)`, which calls `requireAdminOrNotFound()` before any service-role read, returns null when the id is not a row of `listAdminConferences()`, and otherwise returns `{ conference, teams, latestMatches, matchCount }`: `conference` is that `AdminConferenceRow`, `teams` is `AdminTeamRow[]` from `listAdminTeams` (view `all`, the `conferenceId` filter, a limit that covers every team so no cursor is left), each latest match carries its `programId` and program name, and a failed matches read yields `latestMatches: []` with `matchCount: null` instead of throwing
  - [ ] `admin-conferences-server.ts` exports `countAdminConferences()`, a guarded head count of `conferences` that returns null when the read fails
  - [ ] `tests/admin-team-links.spec.ts` asserts that the pure latest-matches mapper keeps `programId` and that matches from two programs come back newest upload first across both
- **notes:** No schema change and no new RPC. The conference row comes from the `cache()`d `listAdminConferences()`, so an id that is not a uuid never reaches a query. Use a named constant for the conference page's match count (5 assumed; the team page keeps 3). `readConferenceTeams` / `loadConferenceTeams` stay: `admin-team-server.ts` still uses them.

## T16 · Conference page: route, header and Details

- **status:** done
- **model:** opus
- **needs:** T15
- **files:** guess — src/app/admin/conferences/[conferenceId]/page.tsx (new), src/components/admin/conference-page-header.tsx (new), src/components/admin/conference-details.tsx (new), MAP.md, tests/admin-routes.spec.ts
- **routes:** /admin/conferences/[conferenceId]
- **done when:**
  - [ ] `src/app/admin/conferences/[conferenceId]/page.tsx` exists, calls `getAdminConference()` and `notFound()` on null, renders inside `AdminPage` in a full-width column (no max-width or centring wrapper), and `MAP.md` is regenerated in the same diff with the `/admin/conferences/[conferenceId]` row
  - [ ] The header renders a link back to `/admin/conferences`, the existing `ConferenceCrestControl` (upload, replace, remove), the conference name and the `conferenceMeta()` line
  - [ ] The header's "⋯" menu holds "Merge into…" (the existing `MergeConferenceDialog`, fed `listAdminConferences()` rows; on success the router goes to `/admin/conferences/<targetId>`) and "Delete" only while the conference has no teams, with the drawer's `FloatMenuNote` in its place otherwise; a confirmed delete calls `deleteConference`, shows its error sentence in the confirm when refused, and goes to `/admin/conferences` on success. The diff adds no server action
  - [ ] Details renders a row of facts (Division, Teams, On Advantage, and Website as a link when one is set) and exactly one Edit button, which opens a dialog with Name, Short name, Division and Website and one Save that calls `saveConference`; the dialog imports `conferenceChanged`, `storedConferenceFields` and `normalizeWebsite` from `conference-format.ts` and declares no validation of its own
  - [ ] `tests/admin-routes.spec.ts` gains an unauthenticated GET `/admin/conferences/<id>` → 307 `/login` case beside the team-detail one
- **notes:** Model: `src/app/admin/teams/[programId]/` (`layout.tsx`, `team-page-header.tsx`, `admin-details-card.tsx`). Full width is the 2026-11-13 decision in docs/superpowers/specs/2026-11-12-admin-strip/README.md. Read `.skills/advantage-analytics-design/SKILL.md` and the Next 16 docs for async `params` first. There is no separate rename action in the code: renaming is the Name field of the edit form, so the "⋯" menu carries Merge and Delete only (one editor, as on the team page). Lift what you need from `conference-drawer.tsx` but do not refactor it; T18 deletes it. Teams and Latest matches are T17.

## T17 · Conference page: Teams and Latest matches

- **status:** done
- **model:** opus
- **needs:** T16
- **files:** guess — src/app/admin/conferences/[conferenceId]/page.tsx, src/components/admin/conference-teams-section.tsx (new), src/components/admin/team-latest-matches.tsx, src/components/admin/teams-table.tsx, tests/conference-latest-matches.spec.ts (new)
- **routes:** /admin/conferences/[conferenceId], /admin/teams/[programId]
- **done when:**
  - [ ] The Teams section renders `TeamsTable` imported from `teams-table.tsx` with the loader's `teams`; the diff adds no second table component and no copy of the row markup or of `teams-table-layout.ts`
  - [ ] "Add team" sits in the Teams section header and is the existing `AddTeamPopover` (which calls `addTeamToConference`); a successful add calls `router.refresh()`; the diff adds no server action
  - [ ] A row whose `plan` is `approve` does not draw a button that does nothing: either `onApprove` opens the existing `ApprovePilotPopover`, or `TeamsTable` gains a prop under which the chip is the static `ApprovePill`
  - [ ] Latest matches renders `TeamLatestMatches` from `team-latest-matches.tsx`, parameterised rather than copied: on the conference page each row links to `/admin/matches?program=<that match's programId>&id=<matchId>` and prints the program's name, and the "All N in Matches" header link is not rendered; the team page's call site still passes `programId` and its header link and row hrefs are unchanged
  - [ ] A new offline spec renders `TeamLatestMatches` both ways and asserts the conference rows' hrefs use each match's own `programId`, and that the team variant still renders `/admin/matches?program=<programId>`
- **notes:** Admin › Matches filters by `?program=` only; there is no conference filter, which is why the header link is left off here rather than pointed at an unfiltered list. Empty states: "No teams in this conference yet" for the table, the component's own line for matches. The offline render pattern is `tests/admin-conference-card.spec.ts` (`fixtures/vm-modules`).

## T18 · Conferences list opens the page; the drawer retires

- **status:** done
- **model:** opus
- **needs:** T16
- **files:** guess — src/components/admin/conferences-table.tsx, src/components/admin/conferences-table-layout.ts, src/components/admin/conferences-page-content.tsx, src/components/admin/conference-drawer.tsx (delete), src/app/admin/conferences/page.tsx, tests/fixtures/admin-writes-harness.tsx, tests/admin-writes.spec.ts
- **routes:** /admin/conferences, /admin/conferences?view=missing
- **done when:**
  - [ ] Each `ConferencesTable` row is a link to `/admin/conferences/<id>` with a trailing chevron; the `selectedId` and `onSelect` props and the `role="button"` row are gone
  - [ ] `conference-drawer.tsx` is deleted and `conferences-page-content.tsx` no longer has the selection state, the `rail`, `syncUrl` or the Esc and arrow-key handler; the search, the three view pills (All, With teams on Advantage, Missing details), the Division menu, the sort menu, "Show all" and "Add conference" are still rendered
  - [ ] `src/app/admin/conferences/page.tsx` redirects a request carrying `?id=<id>` to `/admin/conferences/<id>`
  - [ ] After "Add conference" succeeds the router goes to `/admin/conferences/<newId>`
  - [ ] `tests/fixtures/admin-writes-harness.tsx` no longer imports `ConferenceDrawer`; its `conference` surface renders the conference page's edit dialog and "⋯" actions from T16, and `tests/admin-writes.spec.ts` still has a save case and a delete case against it. The drawer-only "a conference's teams" load cases are removed
- **notes:** Everything the drawer did has a home on the page after T16 and T17: crest, the four fields, Merge, Delete, the teams list and Add team. What goes with it is stepping row to row with the arrow keys, which was the quick way to fill gaps from the Missing details view; the view itself stays. Record rows navigate and carry a chevron (table law 3 in `.skills/advantage-analytics-design/reference/tables.md`). `AddConferenceDialog`'s doc comment mentions the drawer; update it.

## T19 · Teams: Conferences as the third view pill

- **status:** done
- **model:** opus
- **needs:** T15, T18
- **files:** guess — src/app/admin/teams/page.tsx, src/components/admin/teams-page-content.tsx, tests/admin-teams-views.spec.ts (new)
- **routes:** /admin/teams?view=conferences, /admin/teams
- **done when:**
  - [ ] `/admin/teams` accepts `?view=conferences`, and the view row has exactly three pills in this order: Programs, Pilot players, Conferences
  - [ ] On that view the page loads `listAdminConferences()` and does not call `listAdminTeams`, `listAdminTeamFacets` or `listAdminPilots`; on the other two views it calls `countAdminConferences()` for the pill and does not load the conference rows
  - [ ] The view renders `ConferencesTable` imported from `conferences-table.tsx` (no second conferences table, no copied row markup), sorted with `sortConferences(rows, "most_teams")`; the Division and Conference facet menus and the teams sort menu are not rendered on it, and the cut stays in the URL as it does for Pilot players
  - [ ] The pill-to-URL and URL-to-pill mapping is a pure exported function, and a new spec asserts all three pills round-trip and that an old `?view=in_pilot` link still reads as Programs
- **notes:** `/admin/conferences` stays the full list (search, Missing details, sort, Add conference); this view is the plain table whose rows open the conference page, which T18 already made links. Update the doc comments in both files (they say "two views").

## T20 · Point conference links at the conference page

- **status:** done
- **model:** sonnet
- **needs:** T16
- **files:** guess — src/components/admin/admin-conference-card.tsx, src/lib/data/admin-search-server.ts, tests/admin-conference-card.spec.ts, tests/fixtures/admin-search-actions-browser-mock.ts
- **routes:** /admin/teams/[programId]
- **done when:**
  - [ ] In `AdminConferenceCard`'s `fact` variant the conference name is a link to `/admin/conferences/<conference.id>`; "No conference yet" stays plain text and the `Change` / `Set conference` control is unchanged
  - [ ] The `card` variant's link and the admin search's conference result both point at `/admin/conferences/<id>`
  - [ ] `tests/admin-conference-card.spec.ts` asserts the fact variant's href and the card variant's new href, and the search mock fixture carries the new href
  - [ ] No `/admin/conferences?id=` string remains under `src/`
- **notes:** Old `?id=` bookmarks are covered by T18's redirect. Keep the fact quiet: one link on the name, no extra icon ("too cluttered and busy" was the verdict on a link on every fact).

## T21 · Team detail: the activity log on the page

- **status:** done
- **model:** opus
- **files:** guess — src/app/admin/teams/[programId]/page.tsx, src/components/admin/admin-activity-card.tsx, src/components/admin/team-sections.ts, tests/admin-team-views.spec.ts, tests/admin-activity-card.spec.ts (new)
- **routes:** /admin/teams/[programId], /admin/teams/[programId]?view=activity
- **done when:**
  - [ ] The default view in `page.tsx` renders the activity log as its last section, after Latest matches, through the existing `AdminActivityCard` (parameterised if needed, not a second copy of its row markup), and the standalone "Activity log" link to `?view=activity` is no longer rendered
  - [ ] The section shows at most a named constant of the newest entries (8 assumed) until a "Show all" control expands the rest in place; the control is not rendered when there are that many entries or fewer, and an empty log prints the card's existing empty line
  - [ ] `?view=activity` still lands on the page (it resolves to the default view, like `roster`), `tests/admin-team-views.spec.ts` pins that, and `next.config.ts` is unchanged
  - [ ] A new offline spec renders the section with fewer than, exactly, and more than the constant's number of entries and asserts the entry count and whether "Show all" is present
- **notes:** The owner's words: "the activity log should be able to be viewed on the same page". Full width, quiet, like the rest of the page (docs/superpowers/specs/2026-11-12-admin-strip/README.md). No new read: the loader already returns `activity`. Conferences record no activity of their own in the code read at add time, so the conference page has no such section.

## T22 · Migration: label claims, starting flag count, stale-claim release

- **status:** done
- **model:** fable
- **files:** guess — supabase/migrations/<timestamp>_label_queue_claims.sql (new), tests/label-queue-migration.spec.ts (new)
- **done when:**
  - [ ] One new migration file adds `label_sessions.claimed_at timestamptz null` and `label_sessions.start_open_counts jsonb null`, with a CHECK that `start_open_counts` is null or an object whose `amber` and `grey` are non-negative integers, and a partial index on `label_sessions (assigned_to) where status = 'labelling' and kind = 'analyst'`
  - [ ] The same file adds trigger function `public.label_sessions_record_start_open_counts()` and a `BEFORE UPDATE OF open_counts` trigger on `label_sessions` that sets `new.start_open_counts := new.open_counts` only when `old.open_counts is null`, `old.start_open_counts is null` and `new.open_counts is not null`
  - [ ] It adds `public.claim_label_session(p_session_id uuid, p_user_id uuid) returns text` (`set search_path = ''`). It locks the `users` row for `p_user_id` `for update` and returns `'not_labeller'` unless `is_labeller` is true. It returns `'holding'` when another session with `kind = 'analyst'`, `status = 'labelling'` and `assigned_to = p_user_id` exists, and `'taken'` unless its one `update` matches `id = p_session_id and status = 'labelling' and kind = 'analyst' and assigned_to is null`. On a match it sets `assigned_to = p_user_id` and `assigned_at = claimed_at = now()`, then returns `'claimed'`
  - [ ] It adds `public.release_stale_label_claims(p_idle interval) returns integer`. It sets `assigned_to`, `assigned_at` and `claimed_at` to null on sessions with `status = 'labelling'`, `kind = 'analyst'` and `claimed_at is not null`, where `greatest(claimed_at, max(label_work_beats.minute))` for beats on that session by `user_id = assigned_to` is older than `now() - p_idle`. It returns the row count. A `cron.schedule('release-stale-label-claims', '7 * * * *', $$select public.release_stale_label_claims(interval '48 hours')$$)` follows it. Both functions get `revoke execute … from public, anon, authenticated` and `grant execute … to service_role`
  - [ ] `tests/label-queue-migration.spec.ts` reads the migration file and asserts the two columns, the trigger's three-condition guard, all four return words of `claim_label_session`, the `48 hours` cron job, and that neither function is granted to `anon` or `authenticated`
- **notes:** WRITES THE MIGRATION FILE ONLY. Do NOT apply it to the live project or any branch database. Applying it is a separate step the owner approves. Never hand-format it (`.prettierignore`). The work signal is `label_work_beats`, not `label_sessions.updated_at`. The `label_sessions_touch_updated_at` trigger bumps `updated_at` on every update, including the console's `open_counts` save on mount (`label-console.tsx`, `recordOpenCounts` effect) and admin edits. Opening a match would therefore count as working on it, while a beat needs a key or pointer press in a visible tab (`work-beats.ts`). Only the claimer's own beats count, so an admin's review beats cannot keep a claim alive. Admin-assigned sessions (`claimed_at` null) are never released. The starting count is recorded on the console's first count, which happens on mount, before any work. Sessions already opened before this migration already hold `open_counts`, so they never get a start and keep "N flags left", as the rule asks. Model the function style on `20261010213300_claim_label_publish_lease.sql` and the cron on `20261025211338_schedule_vendor_job_reconcile.sql`. The `label_sessions_refuse_while_publishing` trigger still applies to both updates.

## T23 · Queue rules: due time, who can enter, sort, the first three

- **status:** done
- **model:** opus
- **files:** guess — src/lib/services/labels/queue.ts (new), tests/label-queue.spec.ts (new)
- **done when:**
  - [ ] `queue.ts` exports `LABEL_DUE_WINDOW_HOURS = 36`, `LABEL_QUEUE_FROM = "2026-10-29T00:00:00Z"`, `LABEL_CLAIM_CHOICES = 3` and `labelDueAt(completedAt)`, which returns `completedAt` plus 36 h for every priority
  - [ ] `labelDueText(dueAt, now)` returns "Due in N min" under an hour, "Due in N h" (floored) from one hour up, and "Overdue by N h" past due, with at least 1 h past due, while `isOverdue(dueAt, now)` is the boolean the boards style on
  - [ ] `enterLabelQueue(job)` is true only when `completedAt >= LABEL_QUEUE_FROM`, the video length from `jobVideoSeconds` (`src/lib/data/practice-server.ts`) is above zero, the match's owner email fails `isTestAccountEmail` (`src/lib/services/notifications/internal-activity-mail.ts`), and the job's session is not `complete`
  - [ ] `sortByDue` orders earliest due first with ties broken by job id, and `claimableJobIds(rows)` returns the ids of the first `LABEL_CLAIM_CHOICES` rows that have no session or an unassigned `labelling` one
  - [ ] `tests/label-queue.spec.ts` covers the min/h/overdue boundaries, a job completed 2026-10-28T23:59Z left out, a zero-length video left out, a test-email owner left out, and a fourth unassigned row that is not claimable
- **notes:** Pure module: no Supabase, no `Date.now()` inside (take `now`). `processing_jobs.priority` holds only 'standard' and 'express' and nothing sets it, so one window for every row is the settled launch rule. Also export `urgencyLevel(priority)`: 'express' becomes "express", anything else "standard". "Priority" exists only in the design until the tiers land. The test-workspace rule is an assumption awaiting the owner's answer.

## T24 · Queue loader: two board projections

- **status:** done
- **model:** fable
- **needs:** T22, T23
- **files:** guess — src/lib/data/label-queue-server.ts (new), src/lib/data/labels-server.ts, tests/label-queue-loader.spec.ts (new)
- **done when:**
  - [ ] `label-queue-server.ts` reads, service-role, completed Advantage Intelligence jobs with a results file, keeps the newest completed job per match, and filters and sorts through `enterLabelQueue` and `sortByDue` from `queue.ts`. A match whose newest job has a `complete` non-practice session does not appear
  - [ ] `loadLabellerBoard()` calls `requireLabelViewerOrNotFound()` first and returns `{ todo, inProgress, submitted, holding }`. Its row type declares no player name, program, team, match id or owner field: a to-do row carries `jobId`, `videoSeconds`, `urgency`, `dueAt` and `claimable`. An in-progress or submitted row carries `sessionId` only when the session is assigned to the viewer, plus `mine`, the labeller's first name and photo url, and `flags`
  - [ ] `loadAdminLabelBoard()` calls `requireAdminOrNotFound()` first and returns the same three lanes. Each row also carries `jobId`, `matchId`, both player names, the program name or "Personal", the assigned labeller's full name, `claimedAt`, and the last beat minute by the assignee
  - [ ] `flags` on every row is `{ resolved, total }` when `start_open_counts` is set (total = start amber + grey, resolved = total − current amber − grey, floored at 0), `{ left }` when only `open_counts` is set, and null otherwise. A pure exported mapper does this
  - [ ] `tests/label-queue-loader.spec.ts` asserts the mapper's three `flags` shapes, that the newest completed job per match wins, and that `JSON.stringify` of a labeller board built from a fixture holding player names contains neither name
- **notes:** Keep the boundary `label-assignments-server.ts` holds today: a labeller row never names whose match it is. The to-do `jobId` is the claim key T25 takes. It grants nothing because the claim re-checks the queue on the server. Name the "In progress" lane for any `labelling` session with `assigned_to` set, claimed or admin-assigned, and "Submitted" for `submitted`. `holding` is true when the viewer has a `labelling` analyst session assigned. Practice copies (`kind = 'practice'`) never enter the lanes. Reuse `countLabelWorkMinutes` / `readOpenCounts` rather than copying them. The new columns exist only once T22's migration is applied, so this reads them through `.returns<>` types and no live-DB spec should run it before then.

## T25 · Self-claim: seed, claim, admin assign clears the claim

- **status:** done
- **model:** fable
- **needs:** T22, T24
- **files:** guess — src/lib/services/labels/claim-session.ts (new), src/app/label/actions.ts, src/lib/services/labels/assign-session.ts, tests/label-claim.spec.ts (new), tests/label-assign.spec.ts
- **done when:**
  - [ ] `claimLabelMatch(jobId, deps)` takes the viewer from the server-side session and refuses a non-labeller. It refuses with a named constant sentence when the viewer already holds a session or when `jobId` is not in the server-recomputed `claimableJobIds`. It never takes a user id from its caller
  - [ ] For a job with no open session it calls `seedLabelSessionForJob({ supabase, jobId, labellerId: viewer.id })`, then calls the `claim_label_session` RPC with the session id and the viewer's id, maps each of `'holding'`, `'taken'` and `'not_labeller'` to its own sentence, and returns `{ sessionId }` only on `'claimed'`
  - [ ] `src/app/label/actions.ts` exports `claimLabelMatchAction(jobId)`, which delegates to `claimLabelMatch` with default dependencies
  - [ ] `assignLabelSession` writes `claimed_at: null` in the same update as `assigned_to` / `assigned_at`, and `tests/label-assign.spec.ts` asserts the written payload carries it
  - [ ] `tests/label-claim.spec.ts` (fake dependencies) asserts: a holding viewer is refused before any seed; a fourth-due job is refused before any seed; an existing unassigned session is claimed without a seed call; a `'taken'` RPC answer yields its sentence and no `sessionId`
- **notes:** The RPC goes through the service-role client with the gate's own id, the same pattern as `claim_label_publish_lease` and Ask's `database.ts`. Seeding is the existing path (results download, re-derive), so a claim is slow the first time. That is acceptable. A seed that loses the claim race leaves an unassigned `labelling` session, which stays in To do and is harmless. Refusal sentences sketch: "Submit your match before you claim another." / "Someone claimed that match first." / "That match is not one of the next three due." Piece 3 is out of scope: submit is unchanged.

## T26 · Urgency mark component

- **status:** done
- **model:** sonnet
- **files:** guess — src/components/admin/labels/urgency-mark.tsx (new), tests/urgency-mark.spec.ts (new)
- **done when:**
  - [ ] `UrgencyMark({ level })` with `level: "express" | "priority" | "standard"` renders an `aria-hidden` 14×14 SVG of three rising bars (3, 2 and 1 of them filled for express, priority and standard) followed by the word "Express", "Priority" or "Standard"
  - [ ] The file contains no hex or `rgb(` colour literal: fills and text colours are design-system CSS variables, and "Standard" uses the quieter ink
  - [ ] `tests/urgency-mark.spec.ts` renders each level and asserts the word and the count of filled bars
- **notes:** Shape from `docs/superpowers/specs/2026-11-12-admin-strip/Urgency.dc.html`. Its pink and purple are raw values, and the design system wins (read `.skills/advantage-analytics-design/SKILL.md` first). Built once and used by T27 and T28.

## T27 · Labeller board on `/label`

- **status:** done
- **model:** opus
- **needs:** T24, T25, T26
- **files:** guess — src/app/label/page.tsx, src/components/label/label-board.tsx (new), src/components/label/assigned-sessions-list.tsx, tests/label-board.spec.ts (new)
- **routes:** /label
- **done when:**
  - [ ] `/label` renders from `loadLabellerBoard()` three sections headed "To do", "In progress" and "Submitted", each with a "N matches · H.HH h" count. Assigned practice sets still render through `AssignedSessionsList`, filtered to practice copies
  - [ ] Each To do row shows the video hours, the `UrgencyMark` and the T23 due text, styled as overdue when `isOverdue`. A "Claim" button appears on exactly the `claimable` rows and on none while `holding`
  - [ ] Clicking Claim calls `claimLabelMatchAction(jobId)`. On success it routes to `/label/<sessionId>`. On refusal it shows the returned sentence next to the row
  - [ ] In progress lists the viewer's own session first, as a card with a "Continue labelling" link to `/label/<sessionId>`. When `flags` has a total, the card shows "X of Y flags resolved" with a `role="progressbar"` (`aria-valuenow` X, `aria-valuemax` Y), otherwise "N flags left". Every other row shows the labeller's first name and an `AdminAvatar`
  - [ ] `tests/label-board.spec.ts` renders the board from fixtures and asserts: three Claim buttons on a five-row To do; none when `holding`; "Overdue by 1 h"; the progressbar values; and no player name anywhere in the markup
- **notes:** Layout from LabDue.dc.html. Lane three is "Submitted", not the artboard's "Published, to be checked": submit does not publish until piece 3. Leave out the artboard's header stats ("checked hours", "Published, not checked yet"), which are piece 3 too. Lede sketch: "N matches to label", plus "N overdue." when any are, plus "Submit yours to claim the next one." while holding. The To do lane may show the first 8 with "Show N more".

## T28 · Admin Labels board in lanes

- **status:** done
- **model:** opus
- **needs:** T24, T26
- **files:** guess — src/app/admin/labels/page.tsx, src/components/admin/labels/labels-board.tsx, src/components/admin/labels-board/label-job-row.tsx, tests/admin-labels-board.spec.ts (new)
- **routes:** /admin/labels
- **done when:**
  - [ ] `/admin/labels` renders from `loadAdminLabelBoard()` the lanes "To do", "In progress" and "Submitted", each with its "N matches · H.HH h" count. The "Requested reviews" section and the "Pay report" link are kept
  - [ ] Every row shows "Player vs Player · Team" (or "· Personal"), hours, `UrgencyMark` and the due text. In progress and Submitted rows also show the labeller's name, and In progress rows show "X of Y flags resolved" or "N flags left"
  - [ ] Every row in every lane opens the match for the admin through the existing `useStartLabelling(jobId)` (seed or reopen, then `/admin/labels/<sessionId>`), with no claim check and no limit
  - [ ] Rows with a session keep the existing Assign menu (`assignLabelSessionAction`)
  - [ ] `tests/admin-labels-board.spec.ts` renders the board from fixtures and asserts lane order, a team name on a row, the labeller name on an In progress row, and "3 of 10 flags resolved" for a row with a start count
- **notes:** Layout from AdminAudit.dc.html, minus its piece-3 parts: no "Published, to check" lane, no Check or Send back. Optional, if cheap: "no work in N days" from the last beat on an In progress row, as the artboard shows. The board shows only the queue (analysed on or after 2026-10-29). Older matches are labelled from Admin › Matches (T29), so say so in one line under the lanes. If `listLabelJobs` has no caller left afterwards, delete it in the same diff. Otherwise leave it.

## T29 · Admin › Matches panel: label any analysed match

- **status:** done
- **model:** opus
- **files:** guess — src/components/admin/matches/match-peek-drawer.tsx, src/lib/data/admin-matches-server.ts, tests/admin-matches-label-entry.spec.ts (new)
- **routes:** /admin/matches
- **done when:**
  - [ ] The admin match row type carries `labelJobId`: the newest completed Advantage Intelligence job with a results file, else null
  - [ ] The side panel shows a "Label this match" control only when `labelJobId` is set. It calls `useStartLabelling(labelJobId)` and shows its error sentence on refusal
  - [ ] Nothing in the control reads the queue's cut-off date, so a match analysed before 2026-10-29 shows it too
  - [ ] `tests/admin-matches-label-entry.spec.ts` asserts the control's presence with a `labelJobId` and its absence without one
- **notes:** README rule: "Older waiting matches stay out of it but can still be labelled from Matches." Admin › Matches has no way into labelling today, and the panel has only Resubmit.

## T30 · Match overview: "X of Y flags resolved" with a bar

- **status:** done
- **model:** opus
- **needs:** T22
- **files:** guess — src/lib/data/labels-server.ts, src/lib/services/labels/session.ts, src/components/admin/labels/label-dashboard.tsx, tests/label-console.spec.ts
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] The session the console loads carries `startOpenCounts: FlagCounts | null`, read from `label_sessions.start_open_counts` through `readOpenCounts`
  - [ ] With `startOpenCounts` set, `FlagsLeft` reads "X of Y flags resolved", where Y = start amber + grey and X = Y − the open flags it counts today, floored at 0. It renders a `role="progressbar"` with `aria-valuenow` X and `aria-valuemax` Y, and keeps the "N can move the score, N wrong data" split after it
  - [ ] With `startOpenCounts` null, the line is unchanged: "N flags left: …" with no bar, and "No flags left" at zero
  - [ ] `tests/label-console.spec.ts` asserts both forms and the progressbar's values
- **notes:** Admin audience only, as in T14. The labeller's "Before you submit" overview is unchanged. Check that the dashboard's open count (`openFlags`) and the console's `openCounts` amber + grey count the same flags. If they differ, X takes the same source as Y (the `open_counts` pair) and the diff says why.

## T31 · Migration: published, checked, sent back

- **status:** done
- **model:** fable
- **files:** guess — supabase/migrations/<timestamp>_label_publish_check.sql (new), tests/label-publish-check-migration.spec.ts (new)
- **done when:**
  - [ ] One new migration file, whose name sorts after `20261114060750_label_queue_claims.sql`, adds these nullable columns to `label_sessions`: `published_at timestamptz`, `checked_at timestamptz`, `checked_by uuid references public.users(id) on delete set null`, `sent_back_at timestamptz`, `sent_back_by uuid references public.users(id) on delete set null` and `sent_back_note text`. It also adds four CHECKs: `label_sessions_checked_needs_complete` (`checked_at is null or status = 'complete'`); `label_sessions_sent_back_open` (`sent_back_at is null or status = 'labelling'`); `label_sessions_sent_back_note` (`(sent_back_at is null) = (sent_back_note is null)`, and `sent_back_note` is null or `char_length(btrim(sent_back_note))` is between 1 and 2000); and `label_sessions_practice_never_published` (`kind <> 'practice' or (published_at is null and checked_at is null and sent_back_at is null)`)
  - [ ] It adds the trigger function `public.label_sessions_stamp_published()` (`set search_path = ''`) and a `BEFORE UPDATE OF status` trigger on `label_sessions`. When `new.status = 'complete'` and `old.status is distinct from 'complete'`, the function sets `new.published_at := coalesce(new.published_at, now())` and nulls `sent_back_at`, `sent_back_by` and `sent_back_note`. It never writes `checked_at`
  - [ ] It backfills every existing `status = 'complete'`, non-practice session: `published_at` and `checked_at` get `completed_at`, and `checked_by` gets the match's `verified_by` when the match is verified
  - [ ] It runs `create or replace function public.verify_match(p_match_id uuid, p_actor uuid, p_errors_judged boolean default false)` with the same body, except that the actor check accepts `u.is_admin or u.is_labeller`. It also runs `create or replace function public.release_stale_label_claims(p_idle interval)` with T22's body plus `and published_at is null`. Both keep `revoke … from public, anon, authenticated` and `grant execute … to service_role`
  - [ ] `tests/label-publish-check-migration.spec.ts` reads the file and asserts: the six columns; the four CHECK names; that the trigger fires only on the move to `complete` and leaves `checked_at` alone; `is_labeller` in `verify_match`; `published_at is null` in `release_stale_label_claims`; and no `grant … to anon` or `to authenticated`
- **notes:** WRITE THE MIGRATION FILE ONLY. Do NOT apply it to the live project or to any branch database: the owner approves and applies it separately, after T22's `20261114060750_label_queue_claims.sql`, which is applied live (recorded as 20261114060750). Never hand-format it (`.prettierignore`). `label_sessions.status` gets no new value, so the open-per-job index, the publish lease and the T22 claim functions keep their meaning. The states are derived. Published, to check: `status = 'complete' and checked_at is null`. Sent back: `status = 'labelling' and sent_back_at is not null`. Last published: `completed_at`. First published (for pay): `published_at`. No RLS policy changes: `label_sessions` select and update are admin-only and the app writes through the service role. No new RPC: Check and Send back are guarded single-row updates (T33). A sent-back session stays assigned and is never released by the stale-claim job, because the note is addressed to its labeller. Live checks used to plan this: `verify_match` is SECURITY DEFINER, executable by service_role only, and raised 42501 for a non-admin actor. `matches.verified_by` references `auth.users`. The `points`/`shots` verified guards skip the service role, so publishing again over a verified match is not refused.

## T32 · Submit publishes through the existing publish path

- **status:** done
- **model:** fable
- **needs:** T31
- **files:** guess — src/lib/services/labels/submit-session.ts, src/lib/services/labels/session-status-session.ts, src/app/label/actions.ts, src/app/label/[sessionId]/page.tsx, src/components/admin/labels/label-console.tsx, tests/label-submit.spec.ts, tests/label-session-status.spec.ts
- **done when:**
  - [ ] `submitLabelSession` reads the session's `kind` after `requireLabelActor`. A `practice` copy still goes through `writeLabelSubmit` exactly as today: a snapshot and then `status = 'submitted'`, with no `claim_label_publish_lease`, `verify_match` or publish call. `tests/label-submit.spec.ts` asserts this with a fake client
  - [ ] Every other session goes through `writeLabelSessionComplete`, the same function `completeLabelSession` calls. The diff adds no second lease, apply, `verify_match` or insights call. It passes `actorId` = the gate's actor and a new `checked` flag, which is `actor.kind === "admin"`. `completeLabelSession` passes `checked: true`. The close update writes `checked_at` and `checked_by` only when `checked` is true
  - [ ] `writeLabelSessionComplete` gains an optional `beforePublish(supabase, sessionId)` hook. It runs after the lease is taken and before `publish`. `submitLabelSession` uses it to insert the `label_submissions` snapshot (the same `{ points }` rows and `submitted_by` as `writeLabelSubmit`, through one shared helper). If the snapshot fails, the lease is released and the snapshot's error is returned without calling `publish`
  - [ ] Each failure ends in its own way. A refused gate or a lease not taken writes nothing and returns that sentence. A publish refusal releases the lease, leaves the session `labelling` and the snapshot in place, and returns the publish's sentence. A failed `verify_match` releases the lease and returns a sentence ending "Publish again to retry." Success returns `{ ok: true, status: "complete", published }`. `tests/label-submit.spec.ts` asserts this call order: lease RPC, snapshot insert, publish, `verify_match` with the labeller's id, then the close update with no `checked_at`. It also asserts that a refused publish leaves the snapshot and releases the lease
  - [ ] `src/app/label/[sessionId]/page.tsx` sets `maxDuration = 120` (a publish now runs from this route). `submitLabelSessionAction` returns `LabelSessionStatusResult`, the labeller console sets its status from that answer, and `npm run typecheck` passes
- **notes:** The riskiest change on the branch: a labeller now puts labels and the Verified badge in front of a customer. Keep every server refusal that exists today: session not open, held lease, practice, no points, a missing job and imported points on the match. Keep `acceptScore: true`: a labelled score that differs from the record still publishes, as Mark complete does today. The close-failure path's `unverify_match` is existing behaviour and stays. On a publish again after a send-back it would take the badge off, which is rare and is noted for the owner. The "Mark complete again to retry" sentences become "Publish again to retry" in T37, not here; this task changes only the sentence in criterion 4. Do NOT deploy this before T31 is applied: until then `verify_match` refuses labellers, and the close update writes `checked_at`, a column that does not exist yet. Before T31 is applied, an admin's Publish would also fail on that column.

## T33 · Admin Check and Send back actions

- **status:** done
- **model:** opus
- **needs:** T31
- **files:** guess — src/lib/services/labels/check-session.ts (new), src/app/admin/labels/actions.ts, tests/label-check-session.spec.ts (new)
- **done when:**
  - [ ] `check-session.ts` exports `checkLabelSession(sessionId, deps)` and `sendBackLabelSession(sessionId, note, deps)`. Both refuse with `ADMIN_REQUIRED` unless `requireAdminActor` answers. `actions.ts` exports `checkLabelSessionAction` and `sendBackLabelSessionAction`, which delegate to them and call `revalidatePath("/admin/labels")` on success
  - [ ] Check is one update, `checked_at = now`, `checked_by = admin id`, matched on `id`, `status = 'complete'`, `kind = 'analyst'` and `checked_at is null`. Zero rows matched returns a named constant sentence
  - [ ] Send back trims the note and refuses an empty note, or one over 2000 characters, before any write. It is then one update matched on `id`, `status = 'complete'` and `kind = 'analyst'`. The update sets `status = 'labelling'`, `completed_at`, `checked_at` and `checked_by` to null, and `sent_back_at` = now, `sent_back_by` = admin id and `sent_back_note` = the trimmed note. A `23505` returns the existing `ANOTHER_SESSION_OPEN` sentence, and zero rows matched returns the raced sentence
  - [ ] Neither function calls `unverify_match` or `verify_match`, or writes `matches`, `points` or `shots`
  - [ ] `tests/label-check-session.spec.ts` (fake dependencies) asserts: a non-admin is refused before any write; a blank note is refused before any write; the exact update payload and filters for each action; and that the fake recorded no `rpc` call and no `matches` write
- **notes:** The owner's rule: the Verified badge stays on while a match is back with its labeller. This is the opposite of Reopen, which calls `unverify_match` and stays as it is in the console (an assumption, see the planner's questions). Send back works on a checked match too, and clears the check, so the next publish lands in "Published, to check" again. The labeller is whoever is assigned; `assigned_to` is not touched.

## T34 · Board loader: published-to-check lane and sent-back rows

- **status:** todo
- **model:** opus
- **needs:** T31
- **files:** guess — src/lib/services/labels/queue.ts, src/lib/data/label-queue-server.ts, tests/label-queue.spec.ts, tests/label-queue-loader.spec.ts
- **done when:**
  - [ ] `enterLabelQueue` keeps a job whose session is `complete` with `checkedAt` null, and drops it once `checkedAt` is set. `tests/label-queue.spec.ts` covers both. A `complete` session is never `claimable`, and neither is a sent-back one
  - [ ] `loadAdminLabelBoard()` returns `{ todo, inProgress, toCheck, submitted }`. `toCheck` holds the `complete`, unchecked sessions, oldest `completed_at` first, and each row carries `publishedAt` (the session's `completed_at`) and the labeller's full name. Every `inProgress` row carries `sentBack: { at, note } | null`, which is set when `status = 'labelling'` and `sent_back_at` is set
  - [ ] `loadLabellerBoard()` returns `{ todo, inProgress, published, submitted, holding }`, where `published` holds the `complete`, unchecked sessions with `publishedAt`. `sentBack` (with the note) is set only on the viewer's own row (`mine`) and is null on every other row
  - [ ] `submitted` keeps the old `submitted` sessions (handed in before this change) in both projections
  - [ ] `tests/label-queue-loader.spec.ts` asserts from fixtures: a complete unchecked session in `toCheck` / `published`; a complete checked one in no lane; a sent-back session in `inProgress` with its note on the owner's row; and that `JSON.stringify` of the labeller board contains another labeller's sent-back note nowhere
- **notes:** Keep T24's boundary: a labeller row names no player, program, match id or owner. A note is the admin's own words and reaches only the labeller it was sent to. Admin-published sessions are checked when they are published, so they never enter `toCheck`. Read the new columns through `.returns<>` types with the 42703 fallback T24 used, since they exist only once T31 is applied. Optional if cheap: on `toCheck` rows, "On time" / "N h late" from `completed_at` against `dueAt`, as AdminAudit.dc.html shows.

## T35 · Admin Labels board: "Published, to check" lane

- **status:** todo
- **model:** opus
- **needs:** T33, T34
- **files:** guess — src/components/admin/labels/labels-board.tsx, src/components/admin/labels/send-back-dialog.tsx (new), src/app/admin/labels/page.tsx, tests/admin-labels-board.spec.ts
- **routes:** /admin/labels
- **done when:**
  - [ ] `/admin/labels` renders the lanes "To do", "In progress" and "Published, to check" in that order, each with its "N matches · H.HH h" count. A "Submitted" lane renders only while `submitted` has rows
  - [ ] Each "Published, to check" row shows "Player vs Player · Team", hours, the labeller's name and "published <relative time>", plus a "Check" button calling `checkLabelSessionAction` and a "Send back" button. "Send back" opens a dialog with a required note field. Its confirm stays disabled while the trimmed note is empty, and it calls `sendBackLabelSessionAction`. A refusal shows its sentence next to the row, and success refreshes the board
  - [ ] An In progress row with `sentBack` shows "Sent back", the labeller's name, "sent back <relative time>" and the note
  - [ ] The lede reads "N published matches to check". Under that lane: "These are already live for the player. Matches you publish yourself skip this list."
  - [ ] `tests/admin-labels-board.spec.ts` asserts from fixtures: the lane order; Check and Send back on to-check rows and on no other row; the dialog's confirm disabled with a blank note; and the note on a sent-back row
- **notes:** Layout and copy from AdminAudit.dc.html. The design system wins on tokens; read `.skills/advantage-analytics-design/SKILL.md` first. Rows still open the match through `useStartLabelling`. The artboard's "34 of 126 points changed" is out of scope. Today's (admin home) "Check" row from AdminToday.dc.html is not in this task.

## T36 · Labeller board: Published lane and sent-back card

- **status:** todo
- **model:** opus
- **needs:** T34
- **files:** guess — src/components/label/label-board.tsx, src/app/label/page.tsx, tests/label-board.spec.ts
- **routes:** /label
- **done when:**
  - [ ] The third lane is headed "Published" and lists `published` rows as "<first name or You> · <relative time>" with the avatar. A "Submitted" lane renders only while `submitted` has rows
  - [ ] The viewer's own sent-back row comes first in In progress, as a card with "Sent back <relative time>", the note, "Your first version is still published. Publishing again replaces it." and a "Fix and publish again" link to `/label/<sessionId>`
  - [ ] While the viewer holds a sent-back match, the lede reads "A match was sent back to you. Fix and publish it again to claim the next one." Under the lanes: "Publishing puts a match in front of the player straight away. It can still be sent back to you."
  - [ ] `tests/label-board.spec.ts` asserts from fixtures: the "Published" heading; the sent-back card's note and link; that no Claim button shows while the viewer holds a sent-back match; and no player name in the markup
- **notes:** Layout from LabSentBack.dc.html. The artboard says "Fix and resubmit"; the owner's vocabulary has no "submit", so this uses "Fix and publish again". The artboard's header stat ("Your submitted hours, November") stays out.

## T37 · Rename to "Publish" for both audiences

- **status:** todo
- **model:** opus
- **needs:** T32
- **files:** guess — src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-confirm.ts, src/components/admin/labels/label-dashboard.tsx, src/lib/labels/guide-content.ts, src/lib/services/labels/session-status-session.ts, src/lib/services/labels/apply-session.ts, tests/label-console.spec.ts, tests/label-console-labeller.spec.ts, tests/label-console-operations.spec.ts, tests/label-guide.spec.ts, tests/label-session-status.spec.ts, tests/label-apply-session.spec.ts, tests/label-practice.spec.ts
- **routes:** /label/[sessionId], /admin/labels/[sessionId]
- **done when:**
  - [ ] The console header's button reads "Publish" for the admin (was "Mark complete") and for the labeller (was "Submit for review"). The "Submitted — waiting for review" text is gone. The labeller's Publish opens the same `complete-session` confirm the admin's does (open warnings, unmarked errors and their "Mark errors" alternative). Confirming calls `submitSession`, and the `submit-session` confirm kind is removed. A practice copy's button keeps "Submit" wording (it is graded, never published)
  - [ ] `label-confirm.ts`: the publish confirm's title is "Publish?" for both audiences. The labeller's description says the player sees it straight away with Verified by Advantage and an admin may send it back. The Reopen copy says "Publish again" in place of "Mark complete again"
  - [ ] The overview card reads "Before you publish" for both audiences, and `guide-content.ts`'s "Submit for review" section and steps say "Publish"
  - [ ] Outside comments and `src/components/admin/admin-upload-history.tsx` (an unrelated upload control), no string literal under `src/` contains "Mark complete", "Submit for review" or "Before you submit". The listed specs assert the new wording
- **notes:** `data-*` attribute names (`data-mark-complete`, `data-submit-review`) may stay, to keep the specs' selectors. The admin's Reopen button stays.

## T38 · Matches progress: split Published and Checked

- **status:** todo
- **model:** opus
- **needs:** T31
- **files:** guess — src/lib/data/admin-match-progress.ts, src/lib/data/admin-matches-server.ts, tests/admin-match-progress.spec.ts
- **routes:** /admin/matches
- **done when:**
  - [ ] `AdminMatchRow` carries `labelPublishedAt` (`completed_at` when complete, else `published_at`) and `labelCheckedAt`, both read from the match's own non-practice session in the loader's existing session read
  - [ ] "Published" is done when `labelPublishedAt` is set (`at` = that moment), "Checked" is done when `labelCheckedAt` is set, and a verified match with no such session keeps today's rule: both steps done at `verifiedAt`
  - [ ] A sent-back match shows "Being labelled" current, "Published" done and "Checked" to do
  - [ ] The file's header comment no longer says the two steps turn done together. `tests/admin-match-progress.spec.ts` covers: published and unchecked; sent back; checked; verified with no session
- **notes:** Pure function plus one loader read. No new query: add the columns to the session select the loader already makes.

## T39 · Pay report: published and checked

- **status:** todo
- **model:** opus
- **needs:** T31
- **files:** guess — src/lib/data/practice-server.ts, src/app/admin/labels/pay/page.tsx, tests/label-pay-report.spec.ts (new)
- **routes:** /admin/labels/pay
- **done when:**
  - [ ] `getLabelPayReport` counts a non-practice session once, on the UTC day of `label_sessions.published_at`, credited to the `submitted_by` of its first `label_submissions` row. A session with `published_at` null, or with no submission row, is not counted
  - [ ] A counted session's state is "checked" when `checked_at` is set, else "published" (a sent-back session counts as published). `PayLabellerRow` has `publishedSessions`, `publishedHours`, `checkedSessions` and `checkedHours` in place of submitted/approved, and `PaySessionLine` has `state: "published" | "checked"` and `publishedAt`
  - [ ] Practice sets are counted as today: submitted practice copies, by the day of their first submission
  - [ ] `/admin/labels/pay` shows "Published" and "Checked", and no "Submitted" or "Approved" text
  - [ ] `tests/label-pay-report.spec.ts` (fake deps) asserts: a session published inside the range is counted; one published before the range is not; credit goes to the first submitter; sent back counts as published; and a session the admin published with no submission is not counted
- **notes:** Hours stay the job's match video (`jobVideoSeconds`). Published and checked are disjoint counts, as submitted and approved were. Moving from the submit day to the publish day shifts old sessions that were submitted in one month and published in the next.
