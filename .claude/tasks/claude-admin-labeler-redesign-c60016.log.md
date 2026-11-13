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
