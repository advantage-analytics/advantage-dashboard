# Run log — claude/admin-labeler-redesign-c60016

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Put the pages leaving the tab row into the admin account menu — done

**gate:** mechanical pass · completion pass

**changed:** `admin-account-menu.tsx` exports `ADMIN_MENU_LINKS` (Requests, Messages, Ask, Conferences, Pilots, Outreach, Pay report) and renders one `FloatMenuItem` per entry above "Back to the dashboard"; `tests/admin-shell-nav.spec.ts` pins the list.

**follow-ups:**

1. Once the tab row is cut, decide whether the account menu needs an active-route highlight for these seven pages.
2. The seven new rows carry no icons, unlike "Back to the dashboard" and "Sign out"; confirm that is wanted.

## T2 · Cut the admin header to four tabs — done

**gate:** mechanical pass · completion pass

**changed:** `admin-header.tsx` exports `ADMIN_TABS` (Today, Labels, Matches, Teams) and drops the More menu; `loadAdminNav` returns labels, matches and teams counts only; the nav helpers left with no importer are deleted from the requests, messages, pilots, ask, conferences and outreach loaders; `tests/admin-shell-nav.spec.ts` pins the tabs.

**follow-ups:**

1. `src/lib/data/admin-today-server.ts` (around line 64) still names `countAskForNav` in a comment; it no longer exists.
2. The five loaders that lost a helper may hold imports with no caller left; lint passed, but worth a look.

## T3 · Today loader: support messages and per-row actions — done

**gate:** mechanical pass · completion pass

**changed:** `admin-today-server.ts` adds the `message` kind (one row per support thread waiting on staff, key `message:<threadId>`), replaces `primary` with an ordered `actions` list built by the pure `todayActions`, and sorts through `sortLongestWaitFirst`; resolvable kinds carry a trailing Resolve. `today-page-content.tsx` got the minimal `DrawerPrimary` that keeps the current screen working. `tests/admin-today-rows.spec.ts` pins one fixture per kind.

**follow-ups:**

1. T4 wires the `approve` action to `approveClaim` and the `resolve` action to the resolve form, and removes the "Review claim" relabel in `DrawerPrimary`.
2. Message rows have no link of their own and a generic sub-line; the latest message excerpt would need one more read.
3. `readMessageDrafts` reads every thread with a player message, uncapped. Fine at current volume.
4. `claimOffersApprove` copies the Requests drawer's rule by hand; the reviewer did not confirm the two match.

## T4 · Today screen: per-row actions, no pills — done

**gate:** mechanical pass · completion pass

**changed:** `today-page-content.tsx` rewritten: each row lists its `actions` in a trailing cell (links, Approve through `approveClaim` with a pending state and an inline refusal, the label action through `useStartLabelling`, Resolve opening `ResolveForm` under the row), the title links to the item, and `CountPills`, the Resolved view and `TodayDrawer` are gone. Header and skeleton share one `HeaderRow` (Kind, What, Waiting). `src/app/admin/page.tsx` stops passing `resolved`.

**follow-ups:**

1. `admin-today-server.ts` still builds the Resolved list that nothing reads now; drop that work.
2. Every row action is an outline button; decide whether the first one should be primary.
3. The artboard bolds overdue waits; there is no due time to drive that until piece 2.
4. `/admin` has had no eyes-on check yet.

## T5 · Admin resubmit of a failed analysis — done

**gate:** mechanical pass · completion pass

**changed:** new server action `resubmitFailedAnalysisAction` (`src/app/admin/matches/resubmit-action.ts`) over the deps-injected core `adminResubmitFailedAnalysis` (`src/lib/services/splitstep/admin-resubmit.ts`): admin check before any read, takes a job id or a match id, refuses verified and non-failed jobs with the existing sentences, returns `{ ok, error, code }`, logs every attempt with the admin's id. `resubmit-job.ts` gains the `adminRetry` parameter that bills through `resolveAutoRetryWorkspace()` and skips only the roster read. `tests/admin-resubmit.spec.ts` (17 tests). `docs/ui-revamp-guardrails.md` records the exception to the frozen file.

**follow-ups:**

1. A job the admin console created bills the administrator who uploaded it (uncapped for personal, refused for a team the admin is not in). Same gap as the auto-retry; resolving billing from the match's audit row would close it.
2. This path does not check for a label session in progress, unlike `/api/admin/splitstep/reprocess`.
3. A cancelled job is refused for an admin ("only sent again by the athlete"); confirm that is wanted.
4. `quota` and `attempt_ceiling` are the two refusal codes worth their own copy in T8.
5. The spec README still says no admin resubmit exists; it is a point-in-time record.

## T6 · Matches loader: video hours and progress steps — done

**gate:** mechanical pass · completion pass

**changed:** `AdminMatchRow` gains `videoSeconds` (the pay report's `jobVideoSeconds`), `failedJobId`, `sentForAnalysisAt`, `resultsLandedAt`, `labelState` and `verifiedAt`, all from the loader's existing batched reads. New pure `matchProgressSteps(row)` in `src/lib/data/admin-match-progress.ts` returns Uploaded, Sent for analysis, Results landed, Being labelled, Published, Checked with a state each; an import with no job yields Uploaded alone. `tests/admin-match-progress.spec.ts` pins the fixtures.

**follow-ups:**

1. `videoSeconds` can be 0 when a job has neither a trimmed span nor billable seconds; T7 decides whether 0 shows as "—".
2. Being labelled has no moment; `label_sessions.started_at` and `submitted_at` exist if the panel wants one.
3. A cancelled job has no mark of its own in the steps.

## T7 · Matches screen: one-line rows and the progress panel — done

**gate:** mechanical pass · completion pass

**changed:** the Matches table is five columns (Match, Workspace, Status, Video, Uploaded) with one-line rows: players, `WorkspaceCell` (crest and program, or the owner's avatar and "Personal"), one status mark with its words, video hours ("—" when 0 or null), one upload time. `MatchPeekDrawer` lists the steps from `matchProgressSteps(row)` with a sub-line each and keeps the match id, Open report and the Labels link. `page.tsx` reads `?program=` as the Program filter's initial value. `AdminAvatar` gains a 16px size.

**follow-ups:**

1. Write the Program filter back to `?program=` so a filtered view can be shared.
2. `MatchStatus` repeats `RowLifecycle`'s branches; one shared "status to mark and words" helper would stop them drifting.
3. The loader still fetches 30-day views for every row though only the drawer shows them.
4. Search still matches `row.event` with the Event column gone.

## T8 · Resubmit buttons on Matches and Today — done

**gate:** mechanical pass · completion pass

**changed:** new `ResubmitButton` (`src/components/admin/matches/resubmit-button.tsx`) calls `resubmitFailedAnalysisAction`, shows a pending label, prints the refusal inline (`quota` adds an "Add hours" link, `attempt_ceiling` disables the button) and refreshes on success. It renders on a failed Matches row and in its panel through the shared `resubmittableJobId(row)`, and on Today's "Analysis failed" rows through a new `resubmit` action type; "Analysis stuck" rows keep Open. `tests/admin-today-rows.spec.ts` asserts both.

**follow-ups:**

1. `input_rejected` can never succeed on retry either; give it the disabled treatment `attempt_ceiling` has.
2. Success refreshes twice (the action's `revalidatePath` and `router.refresh()`).
3. A refusal sentence under the button makes the one-line rows taller; check it on screen.
4. `jobDrafts`' failed-or-stuck choice of `failedJobId` has no test (it reads the database).

## T9 · Teams list: program rows with the video-hours bar — done

**gate:** mechanical pass · completion pass

**changed:** `AdminTeamRow` gains `videoUsedSeconds` and `videoCapSeconds` from one batched usage read by the team page's rule (null on a failed read). `TEAMS_COLUMNS` is Program, Members, Video hours this month, Owner; squad, division and "Pilot" print as a facts line under the name; the hours cell reuses `HoursMeter` with "X of Y h", or "—". The In pilot, Needs review and Whole directory pills are gone; the Approve chip moves into the Program cell. New `tests/admin-teams-columns.spec.ts`.

**follow-ups:**

1. The batched usage query is under Supabase's row cap and could undercount a very busy month; a grouped-sum RPC removes the risk.
2. `listAdminTeams` now runs the usage query for the upload wizard's team picker too, which never shows hours.
3. `countAdminTeamViews` still counts four views; the page reads two.
4. Claim-pending and suspended programs lose their status line once they have a squad or division.

## T10 · Teams list: Pilot players view — done

**gate:** mechanical pass · completion pass

**changed:** Teams' toolbar has two view pills, Programs and Pilot players, each with its count. `/admin/teams?view=pilots` renders `PilotsTable` (extracted to `src/components/admin/pilots/pilots-table.tsx` and shared with the Pilots page) from `listAdminPilots()`, loaded for that view only; other views use the new `countAdminPilots()` head count. The old `?view=` values still resolve. The Teams test harness gained stubs for the pilot actions.

**follow-ups:**

1. The Pilot players empty state has no Add pilot action; link it to `/admin/pilots`.
2. No spec covers the Teams harness with `view: "pilots"`.
3. Opening the Pilot players view records a look at the "teams" surface too, clearing its New dots.
4. `countAdminPilots` is a second query on every Programs-view load.

## T11 · Team loader: player join link and latest matches — done

**gate:** mechanical pass · completion pass

**changed:** `AdminTeamData` gains `joinLink` (`{ url, mode }` or null, from the program's live `program_join_links` row), `latestMatches` (three newest, same status rule as Admin › Matches) and `matchCount`. Both reads sit in `getAdminTeam`'s `Promise.all` behind the admin check and degrade on failure. Pure mappers in the new `src/lib/data/admin-team-links.ts`; `admin-matches-server.ts` exports `latestMatchesForProgram` and shares `resolvedAnalysis`, `seatNames` and `compareNewestUpload` with the list. `tests/admin-team-links.spec.ts`.

**follow-ups:**

1. `latestMatchesForProgram` reads every match of the program to find the newest three, since `matches` has no `created_at`; a large program wants a SQL-side "newest upload".
2. `joinLink === null` does not tell "no live link" from "read failed"; add a `joinLinkFailed` flag if the page needs to.
3. `matchCount` includes practice matches; check it against what Matches filtered to the workspace shows.
4. The two new reads have run only through their pure mappers, never against real data.

## T12 · Team detail: one centred column — done

**gate:** mechanical pass · completion pass

**changed:** the team page is one centred column (header, Details, People, Latest matches, activity link); `team-section-pills.tsx` and the 380px rail are gone. The header keeps the crest control and gains `TeamHours` (bar plus "Add hours" to `?view=usage`). `AdminDetailsCard` is a row of facts with one "Edit details" button and the player and coach links with Copy; the Conference card sits beneath it. New `TeamLatestMatches` links to `/admin/matches?program=`. `team-sections.ts` is now the `?view=` map (schedule, usage, activity, people; roster and unknown fall back to the default), pinned by `tests/admin-team-views.spec.ts`.

**follow-ups:**

1. The Conference card is still a full bordered card under Details; the artboard draws it as one fact with an inline Change.
2. `team-latest-matches.tsx` imports `MatchStatus` and `UploadedAt` from the large `matches-page-content.tsx`; a small shared module would trim the team page's bundle.
3. Details dropped the Program key fact (it is inside the coach link).
4. Non-default views still render the full header, hours bar included, above their card.

## T13 · Team detail: one People list — done

**gate:** mechanical pass · completion pass

**changed:** the team page's People section is one `AdminPeopleList` built by the pure `adminPeopleRows` (`src/lib/data/admin-team-people.ts`): join requests first with Approve and Decline (`adminResolveJoinRequest`), then staff, roster players and unrostered members with a linked player folded into one row, then pending invites with Resend and Revoke. "No account · Invite" is the only account state printed; "Add player" and "Invite people" sit in the header; role menu, Transfer ownership and the upload switch stay on member rows. The Requests and Roster cards and the roster table layout are deleted. `tests/admin-team-people.spec.ts` replaces `admin-people-card.spec.ts`; the write harness covers Approve and inviting a roster player.

**follow-ups:**

1. Move each member row's Transfer ownership and upload switch into a "⋯" menu; the rows are busier than the artboard.
2. Fold a pending invite into its unclaimed profile's row instead of showing both.
3. The artboard's "Show 10 more" truncation for a long roster is not built.
4. The header meta adds seats used to the artboard's count line; confirm it is wanted.
5. Rename `admin-people-card.tsx`; it is no longer a card. The roster loader still computes `matchCount` and `lastMatch` that nothing shows.

## T14 · Label match overview: checklist as the body — done

**gate:** mechanical pass · completion pass

**changed:** for the admin audience `LabelDashboard` renders one centred column: a "N flags left" line (score-moving and wrong data, no bar), the checklist as the body, and "Entered at upload" as one closed `<details>` row. "Left to check", "Statistics from the labels", "Score" and the "Every point checked" item are gone for the admin; each open check names its target (set, point or game) and opens it; a "Wrong data fixed" row carries the grey flags. The labeller audience renders as before. `session-status.ts` and `label-console.tsx` are untouched. `tests/label-console.spec.ts` and `tests/label-error-marking.spec.ts` updated.

**follow-ups:**

1. The console header in `label-console.tsx` still spans the full width and still says "N of M points checked" above the centred column.
2. Once piece 2 records a starting flag count, the progress line becomes "X of Y flags resolved" with the artboard's bar.
3. The artboard's checklist summary ("N open") beside "Before you publish" is not built.
4. `AdminChecklist` repeats much of `PublishCheck`'s row markup, and `publishChecks` takes an `admin` boolean.

## T15 · Conference loader: one conference, its teams, its latest matches — done

**gate:** mechanical pass · completion pass

**changed:** `getAdminConference(conferenceId)` returns a conference row, its teams (through `listAdminTeams` with a new `conferenceId` filter), its five latest matches with `programId` and `programName`, and a match count; `countAdminConferences()` is a guarded head count. `latestMatchesForPrograms(programIds, limit)` replaces the single-program body, which now calls it. `tests/admin-team-links.spec.ts` covers matches from two programs.

**follow-ups:**

1. `listAdminTeams` turns a query error into an empty list, so a failed teams read on the conference page would read as "no teams".
2. Teams then matches are read in sequence; a `programs.conference_id` join would let them run together.
3. `latestMatchesForPrograms` reads every match of every program to find the newest few.
4. The Teams `?conference=` text filter could now move to `conference_id`.

## T16 · Conference page: route, header and Details — done

**gate:** mechanical pass · completion pass

**changed:** new route `/admin/conferences/[conferenceId]` (full width inside `AdminPage`, `notFound()` on an unknown id) with `ConferencePageHeader` (back link, crest control, name, meta line, "⋯" with Merge into… and Delete only when the conference has no teams) and `ConferenceDetails` (Division, Teams, On Advantage, Website facts; one Edit dialog calling `saveConference`). `MAP.md` regenerated; `tests/admin-routes.spec.ts` gains the unauthenticated 307 case.

**follow-ups:**

1. `getAdminConference()` is not wrapped in `cache()`; a later layout or metadata caller would read twice.
2. The merge dialog and delete confirm are duplicated between the drawer and this header until T18 deletes the drawer.
3. The new route spec case is live-DB and was not run in the gate.

## T17 · Conference page: Teams and Latest matches — done

**gate:** mechanical pass · completion pass

**changed:** the conference page renders a Teams section (`conference-teams-section.tsx`: the shared `TeamsTable` with the loader's teams, `AddTeamPopover` in the header refreshing on add, Approve chips opening `ApprovePilotPopover`) and `TeamLatestMatches` with a new `scope: "conference"` variant (each row links to its own program's matches and prints the program name; no "All N in Matches" link). The team page's call site is unchanged. New `tests/conference-latest-matches.spec.ts`.

**follow-ups:**

1. The Approve-popover wiring is now in both `teams-page-content.tsx` and `conference-teams-section.tsx`; one shared hook would do.
2. A conference filter on Admin › Matches would let the conference variant show "All N in Matches".
3. `TeamLatestMatches` reads `programName` through a cast, not a narrowed type.

## T18 · Conferences list opens the page; the drawer retires — done

**gate:** mechanical pass · completion pass

**changed:** each `ConferencesTable` row is a link to `/admin/conferences/<id>` with a chevron; `conference-drawer.tsx` is deleted and the list page loses its selection state, rail, `syncUrl` and key handler while keeping search, the three view pills, Division, sort, "Show all" and "Add conference". `/admin/conferences?id=<id>` redirects to the page; a created conference lands on its page. The write harness renders `ConferencePageHeader` and `ConferenceDetails`, keeping the save and delete cases; the drawer-only teams-load cases are gone.

**follow-ups:**

1. `admin-conference-card.tsx`, `admin-search-server.ts` and the search mock still link to `/admin/conferences?id=`; T20 points them at the page.
2. Two comments in `tests/fixtures/admin-team-harness-server.ts` still mention the conference drawer.
3. `AddConferenceDialog` calls `router.refresh()` right after the caller's `router.push`.
4. Arrow-key stepping through Missing details is gone; a "next missing" link on the conference page would bring it back.
