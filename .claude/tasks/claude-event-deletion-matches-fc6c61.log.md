# Run log — claude/event-deletion-matches-fc6c61

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Let event deletion detach matches (migration + deleteEvent) — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** New migration `20260923021801_event_delete_detaches_matches.sql` — both `program_event_outcomes` scope FKs `restrict → cascade`, `guard_event_delete()` keeps the role checks and entry serialisation but drops the matches/outcomes/forfeit 23514 raise and records `detached_matches` in the audit row. Applied live by the session owner via the Supabase MCP after explicit sign-off (the auto-mode classifier blocked dispatching a subagent with live-DDL authority, so the subagent wrote files only and the live apply ran in-session). `deleteEvent` now also revalidates `/dashboard/matches`. `schedule-event-delete.spec.ts` and `-db.spec.ts` updated to the detach semantics; the db spec's race-order test was reworked too since it hard-coded the old refusal.
**follow-ups:**

1. Add a one-line pointer in the header of `20260910190731_delete_eligible_schedule_event.sql` to the superseding migration.
2. Matches list may want a "reassign to event" affordance now that detached matches are a first-class state (`route.ts:160` already computes `attachable`).

## T2 · Warn about attached matches in the delete-event dialog — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** `EventActionsMenu` takes `entries` + `isDual` from the drawer's loaded `detail`; a local `deleteCost()` derives match count, outcome presence and `dualScore` — no new query. Empty events keep a one-line description; events with matches/outcomes render `ConfirmProse` naming the count (pluralised), that matches stay in the library but lose their line, the dual team result, and "There is no undo." Menu-item description now reads "Recorded matches stay in the library". Spec gains the Settled Dual case; refusal test uses a generic server error. Deviation from criterion 4: test asserts "7–0" not "9–0" — `dualScore` applies ITA scoring (6 singles + 1 doubles) so nine won lines are 7–0, matching the drawer's own score row; the "9–0" in the criterion was the fixture's stale list-row `teamScore`. Reviewer verified and accepted.
**follow-ups:**

1. Fix the `dual-settled` fixture's list-row `teamScore { us: 9, them: 0 }` (`tests/fixtures/schedule-drawer-actions-harness.tsx:184`) to 7–0 so it agrees with its own lines.
2. The outcome-only sentence ("Lines settled by forfeit, default or withdrawal…") has no harness fixture with an outcome, so it is untested.

## T3 · Rewrite doubles-via-SwingVision copy to score-only — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** Every claim that doubles arrive via SwingVision now says doubles lines record a score only: the help page's SwingVision card ("Singles only.") and video section, the Team Home dual card footer, the design-system primitives reference, the `supportsVideo` doc comment in `entry-state.ts`, the court-record note, the schedule README's post-save footer sentence (a doubles line offers nothing), and the D8 row of `docs/ux-overhaul-brief.md` (outside `files:`, required by the grep criterion). Comments and copy only; no logic. The first dispatch was cut off by a session rate limit after lint/typecheck passed; the same subagent was resumed to finish the README line and the spec.
**follow-ups:**

1. Sweep `supabase/functions/` and the email templates for the same "doubles via SwingVision" phrasing — the grep criterion covered only `src`, `.skills` and `docs`.

## T4 · Doubles line never offers an upload on the score flow or schedule row — done

**gate:** mechanical GATE PASS on the second run (the first run's one failure was the known live `match-video-attachments-db` claim flake, unrelated to this diff); completion `VERDICT: pass`.
**changed:** `uploadInsteadHref` and `savedLineUpload` return null for a doubles preset, `SavedLineUpload.action` is `"Add video"` only, the score flow's file/video ternary is gone (only "Have the match video?" remains, and a doubles line never reaches it), and `line-row.tsx`'s `Action` takes a `doubles` prop instead of `videoAllowed` and renders nothing on a scored doubles line. "Add file" no longer appears anywhere in `src/` (one wizard doc-comment phrase trimmed outside `files:`). Both specs flipped to assert the absence.
**follow-ups:**

1. The score page still says "the score is entered with the file" beside "Upload it instead"; now that only video is offered, "with the video" reads truer.
2. `useUploadMatchWizard.ts`'s comment above `DEFAULT_IMPORT_PROVIDER_ID` still explains why a doubles line defaults to the SwingVision import — T5 removes that path and should drop the comment with it.

## T5 · Wizard and upload page refuse a doubles preset — done

**gate:** mechanical GATE PASS on the second run; completion `VERDICT: pass`. The first gate run failed one real test (`tests/upload-validation.spec.ts:444`) that encoded the removed `supportsVideo → import provider` routing; the same subagent was resumed to fix it (the test now selects the import provider explicitly, assertions unchanged) before re-gating.
**changed:** `wizardUploadEligibility()` refuses `discipline === "doubles"` first, with reason `doubles-unsupported` kept wizard-local (`WizardEligibility` widened; the contract union and its reason table untouched) and the message "Doubles lines record a score only. Statistics are singles only for now."; the doubles carve-out and `attribution: null` case are gone. `useUploadMatchWizard.ts` drops `DEFAULT_IMPORT_PROVIDER_ID` and every `supportsVideo` read — a preset always opens on the default provider with `matchType` "Singles" — and the silent pre-eligibility guard in `handleProviderContinue` is removed so the refusal reaches `EligibilityNotice`. The team upload page redirects a non-singles `?entry=` to `/dashboard/team/upload`. Specs: four new eligibility cases; `upload-source.spec.ts` and `upload-validation.spec.ts` updated to the new routing.
**follow-ups:**

1. `EventPreset.supportsVideo` is now written by `presetFor` and read by nothing in the wizard; dropping it touches schedule code (`entrySupportsVideo`) and wants its own pass.
2. The `?match=` single-match preset (`singleMatchPreset`) carries no `discipline`; confirm `getTeamSingleMatch` can never return a doubles row, else that seam needs the same gate.
3. T3's copy and `DOUBLES_UNSUPPORTED_REFUSAL` spell the same sentence in two places; one constant if they ever drift.

## T6 · Grey "score only" fact strip on the dual facts step — done

**gate:** mechanical GATE PASS on the second run (the first run failed four live-DB specs — admin RPCs, point bookmarks, owner name, seat counts — the shared-IP Supabase sign-in rate limit, unrelated to a static strip); completion `VERDICT: pass`.
**changed:** `DualFactsStep` draws a grey fact strip under the Time / Singles format / Doubles format row on the wizard's `noteStripCls` with a lucide `Info` icon: bold "Doubles lines record a score only." then "Statistics and video analysis are singles only for now." Grey by the design rule (a fact, not a question); `warningStripCls` unused. Header comments on the step and the strip say why. `schedule-static-copy.spec.ts` asserts the sentence on step two.

## T7 · Lift the Matches drawer's body sections into a shared module — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** New `matches/drawer-sections.tsx` holds `drawerSideName`, `DrawerFact`, `DrawerHeading`, `AnalysisNotice`, `SnapshotSection`, `toSnapshot` and `useMatchSnapshot` (its own cache, plus `forgetMatchSnapshot`); nothing in it imports `DisplayMatch`. `match-drawer.tsx` composes them with unchanged props and markup; its team-only schedule query became a private `useScheduleLink` with its own cache, and `forgetMatchDetails` keeps its signature and now clears both caches. Pure spec `tests/drawer-sections.spec.ts` via `createLoader()`. Deviations the reviewer accepted: `useMatchSnapshot(matchId, pending = false)` takes an optional in-flight flag so an empty answer is not cached while analysing; the snapshot and the schedule row are now two queries that can land a moment apart.
**follow-ups:**

1. T10 needs `tests/fixtures/supabase-client-browser-mock.ts` to support `.select().eq().eq().maybeSingle()` before a browser harness can render `useMatchSnapshot`.
2. `MatchDrawer`'s doc comment still describes its body inline; point it at `drawer-sections.tsx` once the event drawers share it.

## T8 · Build the event-page table kit (layout, header, strip, toolbar, grouped table, row selection) — done

**gate:** mechanical GATE PASS on the second run; completion `VERDICT: pass`. The first run failed `design-drift.spec.ts` on a real finding: `SummaryCell`'s value was `text-[15px]`, off the type scale. The same subagent snapped it to 16px, the size the Matches drawer's snapshot figures use; the design system outranks the mockup's 15px.
**changed:** New `schedule/event-table.tsx` (presentational, props-driven): `EventPageLayout` (two groups, `gap-6`/`gap-3`, `gap-8` between, drawer as a flex sibling), `EventHeader`, `SummaryStrip`/`SummaryCell`, `EventToolbar` (`Chip` pills, `MatchesFilterPanel` filters, `SortTrigger` + `FloatMenu` sort), `EventTable` (empty body inside the card via `TableEmptyBody`), `EventGroupHead`, `EventRow` (48px, `aria-current` + the Matches wash) and `EventTableFooter`. New `schedule/use-row-selection.ts`: the Schedule page's selection model lifted — click/re-click, Esc, ↑/↓ over visible ids, `?<param>=` via `replaceState`, the same key guard, and a filter cut clears the selection. Harness + `tests/event-table.spec.ts`. Outside `files:`: `tests/fixtures/match-drawer-deps-browser-mock.tsx` stubs `MatchActionsMenu` and `next/image` so a browser harness can bundle `PeekDrawerFrame`. Live pages untouched.
**follow-ups:**

1. T9/T11: a click on a player-name link inside an `EventRow` must not also toggle the row (`match-card-list.tsx` stops propagation).
2. Move `PeekDrawerFrame` out of `match-drawer.tsx` into its own file so harnesses stop needing the deps mock.
3. When a filter hides the selected row the drawer closes without its slide-out; Esc, × and re-click still animate.

## T9 · Rebuild the dual page as a line table with the new header, strip and primary-action rule — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite incl. design-drift); completion `VERDICT: pass`.
**changed:** New `dualPrimaryAction()` in `src/lib/schedule/dual-primary-action.ts` (Add result → one-line Add video → bare Add video → null; doubles and forfeited lines never count) with its spec. `dual-detail.tsx` is now a client component on T8's kit: 40px mark + subline header, ghost "Edit dual" + the computed primary for `canEdit`; strip Result (from `dualScore`: Won/Lost/Tied X–Y + Final, or In progress + n of 9 decided), Lines (nine `md` ticks + n of 9 won), Analysis (a of 6 + singles have stats, counting ready statuses completed/imported/timeline); toolbar pills, Result filter, Line order/Player sort; the exact column template with Singles/Doubles group heads, outcome chips in the Score cell, "Score only" on doubles, footer format via `lineFormat` + "Doubles lines record a score only."; `?line=` selection. `page.tsx` passes `searchParams.line`. Outside `files:`: `dual-ticks.tsx` gains an `md` size and `static/event-mark.tsx` a 40px mark. No drawer yet (`drawer={null}`) — rows carry no actions until T10; do not ship between T9 and T10.
**follow-ups:**

1. T10 renders the drawer from `selection.drawerId`/`index`/`total`/`closing`/`openedByKeyboard`/`finishClose`; row actions move there (rules in `line-row.tsx`'s `Action` and `scoreHref`).
2. `EventPageSkeleton` in `loading/page-skeletons.tsx` still draws the old layout for both event pages — update it once T11 lands.
3. Player names are plain text because lineup ids can be auth uids that 404 on the roster route; link them once a lineup id can be told to be a roster player id.
4. The footer always prints doubles scoring (from `lineFormat`'s fallback); the frame omits it when no doubles format was recorded.
5. The subline shows site ("Away") rather than `event.host`, matching the frame; the old glyph row preferred host.

## T10 · Dual line drawer, including the doubles and unplayed variants — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite incl. design-drift); completion `VERDICT: pass`. The first dispatch was cut off by a session rate limit mid-work; a fresh subagent resumed from the uncommitted draft and kept it.
**changed:** New `schedule/event-line-drawer.tsx`: `EventLineDrawer` on `PeekDrawerFrame` composing T7's sections (heading, facts, analysis notice, snapshot with a `role="status"` skeleton), a `context` slot, and a footer from the shared rule — "Add result"/"Edit result" when due, else "View match"; outline "Add video" for a scored singles line with no video; doubles = grey score-only strip, no snapshot; ⋯ only with a played match and `canEdit`. Also exports `LineContextList`, `LineContextRow`, `lineFormatWords`. `line-row.tsx`'s row-action rule is now an exported pure `lineAction()` used by rows and drawer. `dual-detail.tsx` renders the drawer with a "This dual" context list (result on the right, nine lines, `aria-current`, click to switch; selecting a hidden line resets the filters first). Outside `files:`: `NORMAL_ENTRIES` filled to nine lines (S3 manual loss without video) and the `MatchActionsMenu` stub draws a testable button. The dual page is whole again — line actions are reachable through the drawer.
**follow-ups:**

1. `MatchActionsMenu` gets no `onDeleted`, so after a delete the drawer stays open until the server refresh.
2. Context rows render doubles through `drawerSideName`; the frame shows surnames only ("Brooks / Osei").
3. `useMatchSnapshot` (T7) never settles if its query rejects, leaving the skeleton up.
4. The counter counts visible rows ("Line 2 / 3" under a pill filter), per the selection model.

## T11 · Rebuild the tournament page as an entry-grouped match table — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite incl. design-drift); completion `VERDICT: pass`.
**changed:** `EntryMatch` gains optional `date`, selected and mapped by `schedule-server.ts`'s `MATCH_COLUMNS` (loader only, nothing under `supabase/`). `tournament-detail.tsx` rewritten as a client component on T8's kit: header + subline (span · site · host · surface · n entries), ghost "Edit tournament" + primary "Add result" for `canEdit`; strip Record / Deepest run / First serve in / Reports ("—" when nothing played or no totals); the exact six columns grouped by entry (avatar, name, draw text, record + finish, "No matches yet"), outcome-only rounds with "—" dates and a status chip; pills, Result filter, Round order/Player sort; footer with count and format; `?match=` selection with `drawer={null}` for T12. `page.tsx` passes `searchParams.match` and a `rosterPlayerIds` map (one cached `getRosterPlayerOptions` call) so an entry name links only to a real roster profile. `team-totals-widget.tsx` deleted (no other importer); `SchoolsFaced`, rail/detail, `LineRow`, `TableCard` gone. Outside `files:`: `schedule/README.md` live-file list.
**follow-ups:**

1. T12: `selection.drawerId` is a `TournamentRow.id` (match id, or outcome id for an outcome-only round); `tournamentRows(entry)` returns `{ id, entry, round, match, draw }` in ladder order. An entry with no matches has no selectable row, so its "Add first result" needs a home.
2. `EventPageSkeleton` (`loading/page-skeletons.tsx`) still draws the old layout for both event pages.
3. `event-page.tsx`'s `EventPageFrame`, `TableCard`, `GroupHead`, `DetailLine`, `EventFacts` and `line-row.tsx`'s `LineRow` now have no importers; README ~line 139 still describes the tournament page on `EventPageFrame` — T13.
4. `runRecord`/`runFinish` ignore outcome-only rounds, so a head can read "through the round of 16" after a QF withdrawal.
5. Entry heads show initials only; the dual page shows the viewer's own photo.

## T12 · Tournament match drawer with the player's run — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite incl. design-drift); completion `VERDICT: pass`.
**changed:** `tournament-detail.tsx` replaces `drawer={null}` with `EventLineDrawer kind="Match"` (round as the line label, event name as the event label) and a "<player>'s run" context list — "Seed n · W–L" from `runRecord`, every round of the entry in table order incl. outcome-only rounds, `aria-current` on the open one, picking a hidden round clears the filter. Selection keeps T11's bare ids (`?match=played-r16`). Empty entries get a coach-only "Add first result" link in their group head (the score page without `?entry=` only reaches the first empty entry). `event-line-drawer.tsx` gains optional `nextResultHref` (an outline "Add result" beside the round's own primary, never two primaries) and a round-aware `focusKey`; the dual drawer is unchanged. Harness `?viewer=player` → `canEdit={false}`; spec selectors narrowed to the table because the run list repeats round labels; seven new drawer tests.
**follow-ups:**

1. `nextRound()` looks only at matches, so it can offer a round that already has an outcome (QF withdrawal), and a finished run still offers "Add result" — hide it once a run is over, or make `nextRound` skip rounds with an outcome.
2. Drawer facts differ from the frame: Date shows the event span not the match day, Event reads "· R16" not "· Main draw R16", and the fifth fact is Format not the provider.
3. `useMatchSnapshot` (T7) never settles if its query rejects — now used on both event pages.
4. The run list shortens opponents with `drawerSideName`, giving doubles pairs as "A. X & B. Y".

## T13 · Remove the old event-page pieces and update the schedule README — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite incl. design-drift and generate-map); completion `VERDICT: pass`.
**changed:** Deleted `line-row.tsx`, `event-page.tsx` and `run-strip.tsx` (reachability checked by grep; no renderer left for `EventPageFrame`, `EventFacts`, `FormatCapsule`, `DetailLine`, `TableCard`, `GroupHead`, `TABLE_ROW_CLS`, `LineRow`, `RunStrip`). Moves, bodies unchanged: `scoreHref` → `lib/schedule/score-seed.ts`; `lineAction`/`LineAction` → new `lib/schedule/line-action.ts`; `runRecord` → `lib/schedule/tournament-run.ts`; `EventTitle` → `event-table.tsx`. `dual-ticks.tsx` drops `lg`. `row-action.tsx` and `event-glyph-row.tsx` kept (still rendered). README §1 route row, §3 live-file list, and the "Scoring has one path" sentence updated. Also: new `EventTableSkeleton` for `[eventId]/loading.tsx` (header, strip, toolbar, card of 48px rows); `EventPageSkeleton` kept for `single/[matchId]`. Comment-only fixes in `forfeited-lines.spec.ts`, `pinned-event-bar.tsx`, `actions.ts`.
**follow-ups:**

1. `EventPageSkeleton` is now used only by `single/[matchId]`; check it against `single-detail.tsx`'s layout and rename it.
2. `line-action.ts` has no spec of its own; a pure spec could pin the branch order (outcome, add result, status, report, video) including "doubles never offers video".

## T14 · Set the event-table footer 16px off the card, on the cell x — done

**gate:** mechanical GATE PASS on the second run (the first run's failures were live-DB specs hitting the shared-IP Supabase sign-in limit, unrelated to a class change); completion `VERDICT: pass`.
**changed:** `EventPageLayout`'s table+footer wrapper `gap-2.5` → `gap-4` (docblock now says 16px); `EventTableFooter` gains `px-6` so the caption starts on the card's cell x. Both event pages inherit it; no other file touched.

## T15 · Drop the W–L tally from the dual's Singles/Doubles heads — done

**gate:** mechanical GATE PASS on the second run (the first run's failures were live-DB specs hitting the Supabase sign-in rate limit); completion `VERDICT: pass`.
**changed:** The dual's Singles and Doubles group heads no longer pass a `value`, so the W–L count is gone; `tally()` deleted. "point ours"/"point theirs" stays beside Doubles (`groupRecord()` still feeds `teamPointNote()`). Spec asserts the Singles head reads exactly "Singles" and the Doubles head carries no "2–1". `EventGroupHead`, the harness and the tournament page untouched.

## T16 · Event header subline as icon facts in the match-metadata register — done

**gate:** mechanical GATE PASS on the second run (the first failed one live-RLS spec on the Supabase sign-in rate limit); completion `VERDICT: pass`.
**changed:** New exported `EventFact` in `event-table.tsx`, classes copied from `matches/match-metadata-row.tsx` (13px ink-400 glyph, `text-micro` label, 5px inside a pair). `EventHeader`'s subline is now `flex flex-wrap items-center gap-[14px]` with no colour override, no `text-[12px]` and no `·` separators. Dual: Calendar (date · time), MapPin (site), court SVG (surface), Trophy (conference). Tournament: Calendar (span), MapPin (site), GraduationCap (host), court SVG (surface), Users (entries). Specs assert each icon once and no bare "·".
**follow-ups:**

1. `tests/fixtures/event-table-harness.tsx` still passes plain strings as `subline`; switch it to `EventFact`s so the harness matches production.
2. `SummaryCell`'s trailing label still uses `text-[12px]`; consider a type token.

## T17 · Event name on the Schedule list links straight to the event page — done

**gate:** mechanical pass (lint, typecheck, full suite); completion pass
**changed:** `schedule-table.tsx` `EventRow` is now a focusable `div` (`aria-current`, Enter/Space only on the row itself, ⌘/Ctrl-click pushes the event route) and the event name is a roster-style `next/link` to `/dashboard/team/schedule/<id>` that stops propagation. `schedule-drawer-actions.spec.ts` adds a test for the link href, name-click-doesn't-peek, date-cell-peeks and ⌘/Ctrl-click routerPushes; row locators moved off role "button", and "Open dual" link lookups became `exact: true`.
**follow-ups:**

1. Each row is now two Tab stops (row + name link), as on Roster; consider `tabIndex={-1}` on the link.
2. Row `div` has no ARIA role (same as Roster's `li`); a shared row role/label treatment for both tables.
3. Roster rows get a `has-[:focus-visible]` wash when the name link is focused; Schedule rows don't yet.

## T18 · "Add your player" in our doubles pair picker — blocked

**gate:** mechanical FAIL (environmental); completion pass
**reason:** Lint, typecheck and every schedule/lineup spec passed (89/89; doubles-picker 19/19), and `task-completion-reviewer` returned `VERDICT: pass`. The full suite failed on four consecutive runs, each on a different set of live-DB specs (`claim-eyebrow-width`, `match-video-attachments-db`, `teams-management`, `program-owner-name-live`, `seats-count-players`, `viz-bands-rls`; errors were `57014 statement timeout` and `AuthRetryableFetchError`). One run's only failure was the known full-suite flake `match-video-attachment-flow.spec.ts:868`, which passes alone (20/20). None of these touch the lineup step. The shared Supabase was degraded, so this was stashed by rule, not for a code fault.
**stash:** 3d5a87d6bab7c8e95d0f614b94d004ed1ea79a88
**recover:** `git stash apply 3d5a87d6`, set status back to `doing`, re-run `check.sh gate`, then commit as T18.
**follow-ups:**

1. `useDualDraft`'s `extraPlayers` learns about new players only through the singles label path. A player added from a doubles pair and then typed as free text into a singles line won't resolve to an id.
2. Nothing checks for duplicate names when adding a player; the singles picker has the same gap.

## T18 · "Add your player" in our doubles pair picker — done

**gate:** mechanical pass (on re-run once the live DB recovered; the one failure before it, `match-video-attachments-db.spec.ts:2708`, passed alone 42/42); completion pass (from the blocked run, on the same diff)
**changed:** Our doubles pair picker gains the singles picker's "Don't see your player? Add your player" row. It shares the `ADD_ROW_LABEL` and new `ADD_NAME_REQUIRED` constants from `lineup-name-picker.tsx` and is offered only while the pair has a free seat. It refuses one-word names before the server, and a refused add shows the error and leaves the line unchanged. A successful add joins the pair by id through `DualLineupStep.onAddPairPlayer` → `onOurSelection` and lands in the shared `added` roster. The roster-actions browser mock can now succeed (`window.__addProgramPlayer`) and records calls. `schedule-doubles-picker.spec.ts` covers the three cases. The work was restored from stash 3d5a87d6.
