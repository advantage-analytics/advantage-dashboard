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

## T19 · Drag whole doubles pairs between D1–D3 — blocked

**gate:** mechanical pass (after one run where only the known full-suite flake `match-video-attachment-flow.spec.ts:868` failed); completion needs-work
**reason:** The second done-when line is wrong, not the code. It says Space, ArrowDown ×2, Space on D1's grip moves "D1's pair to D3 and D3's pair to D1", which is a swap. The singles gesture the notes say to reuse (`moveToken`) moves one step per arrow press, so D1 moved down twice gives D2, D3, D1: D1's pair lands on D3, D3's on D2 and D2's on D1. The implementation matches singles, and its spec asserts that real result. The reviewer scored the literal criterion not met. Every other criterion passed, and so did all 32 targeted specs. The wording was a planner error in the T19 draft.
**stash:** 53dbb7e5a37cf272b1031c0e981bbb4c26acf5bc
**recover:** The author amends the criterion to "D1's pair ends on D3 and the others shift up (D2→D1, D3→D2)" (or asks for swap semantics instead). Then run `git stash apply 53dbb7e5`, set the status to `doing`, re-run the gate and the reviewer, and commit as T19.
**follow-ups:**

1. Mouse drag is untested; the specs cover keyboard only (same framer setup as singles).
2. `ReorderableDoubles` repeats about 60 lines of lift/drop/cancel logic from `ReorderableSingles`, which could become a shared hook.
3. A pair dragged off a "No pair" court leaves that court's `noPlayer` flag set, as singles does. Worth a UX check.

## T19 · Drag whole doubles pairs between D1–D3 — done

**gate:** mechanical pass (the run before it failed only on live-DB `seats-count-players.spec.ts:150`); completion pass against the amended criterion
**changed:** The author approved shift semantics and the second criterion now reads "D1's pair ends on D3 and the others shift up like singles". The work was restored from stash 53dbb7e5. New `src/lib/schedule/doubles-order.ts` holds `applyDoublesOrder`. `DoublesLineup` renders `ReorderableDoubles`/`PairItem` (grip-only framer `Reorder.Group`, using the same `moveToken` keyboard as singles), or `StaticDoubles` when any doubles line is settled. The grip and keyboard handling were extracted into `LineupGrip`/`gripKey`, which singles and doubles share. `useDualDraft.setDoublesOrder` is passed through `DualLineupStep.onDoublesOrder` and `new-dual-flow.tsx`. The harness adds `?free=1`, and specs were added in `singles-order.spec.ts` and `schedule-doubles-picker.spec.ts`.
**follow-ups:** see the blocked entry above (mouse drag untested, shared reorder hook, `noPlayer` on a vacated court).

## T20 · Drafts know the match they fill, and fold onto it — done

**gate:** mechanical pass (on re-run; the first run failed only on live-DB specs while the reviewer ran concurrently); completion pass
**changed:** New `src/lib/wizard/draft-target.ts` holds pure helpers kept out of the "use server" file: `draftTargetMatchId`, `DRAFT_TARGET_SELECT`, `draftTargetFromColumns` and `foldDrafts`. `DraftRow.matchId` is filled by `listMatchDrafts` through a JSON-path select (`payload->preset->>matchId`, `payload->attachedLine->>matchId`). The wizard's `existingMatchId` and `handleCreateMatch` reuse call the helper; a preset with a null `matchId` now falls through to `attachedLine`. `tests/fixtures/upload-wizard-hook.ts` (outside `files:`, required) lists the new module and records `queryCalls`. `upload-draft-resume.spec.ts` pins the helper, the listing, the fold and the no-duplicate update branch. A live check confirmed one draft in `match_drafts` carries `preset.matchId`, which is the double listing the author saw.
**follow-ups:**

1. The UI half is T21: wire `foldDrafts` into `src/app/dashboard/matches/(list)/page.tsx` and the grid.
2. Restarting "Add video" from the drawer creates a new draft instead of resuming the existing one.

## T21 · A match row with a video draft shows Draft and Continue upload — done

**gate:** mechanical pass; completion pass (the reviewer read criterion 3's "Open match" as the drawer's existing "View match" link)
**changed:** `MatchesPageContent` runs `foldDrafts(allDrafts, serverMatches.map(m => m.id))`. Only standalone drafts become rows, stepping entries and `?draft=` targets; a `?draft=` naming a folded draft opens its match. `MatchesGrid` (outside `files:`, the pass-through) hands the fold to `MatchCardList`, which draws an outlined `StatePill` "Draft" beside the row's name. `MatchDrawer` takes a plain `continueHref`. When it is set, "Continue upload" is the primary and "View match" drops to ghost; other matches' footers are unchanged. The drawer doesn't import `draft-row.tsx`, because that import pulled server code into the schedule drawers. Adds a Matches-page harness (`matches-drafts-harness.tsx` plus navigation and actions browser mocks) and `matches-drafts.spec.ts` covering personal and team.
**follow-ups:**

1. The drawer footer vs `tables.md`: should "View match" become a ghost "Open match" on every match, with a primary only when an action applies? That affects every match drawer.
2. On phones (`MatchCardGallery`, below 1024px) there's no Draft pill, and drafts were never listed, so a folded draft can't be reached there.
3. A failed-analysis match with a folded draft shows View match (ghost), Continue upload (primary) and Retry (outline) together. Needs a design look.

## T22 · The event drawer shows the played match's own facts — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite, first run) · completion `VERDICT: pass`

**changed:** `EntryMatch` gains optional `duration`/`sourceProvider`/`jobId`/`failNote`; `schedule-server.ts` selects `duration`, formats it with `formatDuration`, maps the previously dropped `source_provider`, and takes `jobId`/`failNote` from the analysis loader. `ProviderFact` moved verbatim from `match-drawer.tsx` into `drawer-sections.tsx` and both drawers render it. `EventLineDrawer`'s facts now run Date (the match's own day via `formatShortDate`), Court, Home/Away, Event, Duration, Provider, Format; a line with no match is unchanged. `AnalysisNotice` also receives `failNote`. Specs: dual S2 fact order + Duration "1H 42M" + Provider "SwingVision"; no-match S1 has neither; tournament R16 Date reads "Sep 11"; `drawer-sections.spec.ts` stubs `next/image` and covers `ProviderFact`.

**follow-ups:**

1. No loader spec asserts that `duration`, `sourceProvider`, `jobId` and `failNote` are mapped — one assertion in `tests/schedule-outcome-loader.spec.ts` would cover it.

## T23 · The event drawer's failed analysis and footer follow the Matches drawer — done

**gate:** mechanical GATE PASS (second run; the first failed only on live-DB specs — program-owner-name, rls-workspace-isolation, seats-count-players, teams-management) · completion `VERDICT: pass`

**changed:** `RetryButton` is exported from `match-drawer.tsx` as the one definition, with a `variant` prop defaulting to outline (Matches drawer unchanged). `EventLineDrawer` offers Retry on a failed singles match with a `jobId` when `canEdit`, and passes `failNote` only then (a player sees neither note nor Retry). The footer gives the primary to the first follow-up (Add/Edit result, Retry, Add video, next-round Add result); "View match" is primary only when there is none, ghost otherwise. Dual fixture S4 (in-progress card) is now a failed match with `jobId`/`failNote`. Specs: primary/ghost per line, coach vs player on the failed line, no drawer with two primaries across S1–D3, tournament R16 next-round "Add result" primary.

**follow-ups:**

1. Clicking Retry is untested — a `fetch` stub in the dual harness could assert the POST to `/api/splitstep/jobs/job-s4/resubmit` and one router refresh.
2. The event drawer now hides the fail note from non-editors, while the Matches drawer shows it to everyone — decide whether they should agree.
3. A tournament round with a failed analysis AND a next round gives Retry the primary and makes "Add result" outline; no fixture covers it.

## T24 · Tournament table tracks: Matches' Date/Result widths, no crushed columns beside the drawer — done

**gate:** mechanical GATE PASS (first run; covers the criterion's lint/typecheck/targeted specs) · completion `VERDICT: pass`

**changed:** `RESULT_COL` is exported from `match-list-layout.ts`. The tournament tracks are `72px 48px minmax(150px,1fr) 60px 140px minmax(96px,1fr)`, built from the imported `DATE_COL`/`RESULT_COL` through a CSS variable (`grid-cols-(--tournament-tracks)`). The Round track grew from 40px to 48px because the "ROUND" heading measured 44.5px and was clipping. The docblock above `GRID` gives the reason for each track's width. `EventTable` takes an optional `minWidth` and wraps the header and rows in one `overflow-x-auto` region; the tournament passes 646px, the dual passes nothing, so its markup is unchanged. The tournament harness now serves the real stylesheet and has a 1280×800 spec, run with the drawer closed and open, checking: no clipped headers, Score aligned with its header to within 1px, Date at 72±1px, no Round overflow. The /impeccable layout scan came back clean.

**follow-ups:**

1. The dual page's 52px Result track can clip the same way (a 48px heading, plus "Not played"). It could use `RESULT_COL` and `minWidth` the way the tournament now does.
2. A 1024px spec with the drawer open would pin the table's sideways scroll. This was checked once by hand but not kept.
3. `tables.md` says "exactly one fluid cell per table", but the Matches team grid and the tournament table both break that. Reconcile the rule in the design skill.

## T25 · One skeleton primitive family, a guard spec, and the DS/Carbon rules written down — done

**gate:** mechanical GATE PASS (second run; the first failed only on live-DB specs, teams-management and viz-bands-rls among them) · completion `VERDICT: pass`

**changed:**

- `pending.tsx` adds `PendingFrame`, the page-level status wrapper. Its inner layer is `aria-hidden` and pulses with `motion-safe`. The bars inside it stop pulsing on their own, so they don't dim twice as deep. It takes an optional `pulse` prop.
- `PendingBar` gains a `data-pending-bar` attribute.
- `page-skeletons.tsx` builds on these instead of a local `Bar`/`Frame`. Its export names are unchanged.
- `ui/skeleton.tsx` is deleted.
- `tests/skeleton-primitives.spec.ts` keeps the skeleton token and bare `animate-pulse` to `LEGACY` files. It keeps `animate-spin` out of loading files, except `page-skeletons.tsx` until T34. It fails on a `LEGACY` entry that's no longer needed, so each later task must delete its own line. `LEGACY` maps to T29–T33.
- `empty-and-loading.md` § Loading Skeleton now names the primitives, the token and the motion-safe pulse, and adds the "Carbon and this system" list.

**follow-ups:**

1. T26 and T27 should use `PendingFrame pulse={false}` so real copy, such as the "The result." heading, doesn't pulse; only the bars should.
2. `.skills/advantage-analytics-design/reference/foundations.md:108` still lists `bg-skeleton` as `bg-[#F0F0F0]`. It should point at `--surface-skeleton`.
3. SKILL.md's routing row for `empty-and-loading.md` could mention the primitives and the guard spec.

## T26 · The Add result page's skeleton mirrors the score flow — done

**gate:** mechanical GATE PASS (first run) · completion `VERDICT: pass`

**changed:** `score/loading.tsx` default-exports the new `ScoreFlowPending` (`loading/score-flow-pending.tsx`). It is built on `PendingFrame pulse={false}` plus `PendingBar`, so the real heading stays still while the bars pulse. Top to bottom:

- the real one-step `StepIndicator`
- the pinned strip in `PinnedLineBar`'s classes, with its bars on `--ink-200` because the skeleton token is invisible on `--surface-subtle`
- the real "The result." `<h1>`
- `ScoreBlock`'s two side rows of 40px cells
- the `h-16` footer

The title and content class moved into a new shared module, `schedule/score-flow-copy.ts`. `score-only-flow.tsx` is `"use client"`, so a server `loading.tsx` can't import a string from it; `score-only-flow.tsx` imports both constants and re-exports the title. Outside `files:`: `StepIndicator.tsx` swaps `#3B82F6`/`#F3F3F3` for `var(--blue)`/`var(--ink-100)`, which are the same values. `tests/score-flow-pending.spec.ts` checks the static markup against the skeleton contract.

**follow-ups:**

1. The page's crumb still reads "Add score" while every entry point says "Add result".
2. The tournament Round menu and "Upload it instead" line depend on the event, so they aren't reserved in the skeleton. The page shifts down when they land on a tournament.
3. No one has checked the pixel alignment against the real page (eyebrow height, whether the lede fits on one line) in a browser.

## T27 · The upload wizard's skeleton mirrors its first step (team upload + new match) — done

**gate:** mechanical GATE PASS (second run; the first failed only on the live-DB `match-video-attachments-db.spec.ts:2708`) · completion `VERDICT: pass`

**changed:**

- New `UploadWizardPending({ pinned })`. The pinned variant (`/dashboard/team/upload`) mirrors the file step, 2 of 4, because a preset opens there: the pinned strip, the 280px drop zone and the "What the analysis needs" block. The unpinned variant (`/dashboard/matches/new`) mirrors the provider step, 1 of 4: Workspace · For · Source field rows. Both use the real `StepIndicator` and "Step N of M", take their title and lede from `stepHeading()`, and have the sticky 64px footer. It uses `pulse={false}`.
- `WizardPageSkeleton` and `FormRows` are deleted.
- T26's pinned strip is extracted as `PinnedLinePending` in `score-flow-pending.tsx`; its markup is unchanged.
- `CONTENT_CLS` moved from the client `WizardShell.tsx` into `new-match-wizard/styles.ts`, and `WizardShell` re-exports it.
- New `tests/upload-wizard-pending.spec.ts` checks the skeleton contract for both variants.

**follow-ups:**

1. The provider field labels (Workspace / For / Source) and the video-requirements copy could move into a shared constants module, so the skeleton shows them as real text instead of bars.
2. Sharing the default provider kind (`DEFAULT_PROVIDER_KIND`) would let the skeleton read the step count instead of assuming the 4-step video flow.
3. `--ink-200` bars on tinted backgrounds now appear in two skeletons. A `PendingBar` option for tinted backgrounds would replace these one-off overrides.
4. A personal user with a saved source can jump from provider to file after hydration (`localStorage`), and the skeleton can't know this ahead of time.

## T28 · The upload page on an event line shows the event's trail — done

**gate:** mechanical GATE PASS on the third run. The first two runs each failed on one unrelated live-DB spec: `rls-workspace-isolation`, then `match-video-attachments-db`. · completion `VERDICT: pass`

**changed:**

- `event-header-slot.tsx` exports a pure `eventTrail({ eventId, name, kind, leaf })` that returns the crumb array. `EventHeaderSlot` builds from it, and existing callers render the same trail.
- The `?entry=` branch of `team/upload/page.tsx` publishes `<EventHeaderSlot … leaf="Upload video" />` beside the unchanged `<UploadMatchFlow preset />`, so the header reads "Schedule › vs Stanford › Upload video" (or the tournament's bare name). The bare, `?draft=` and `?match=` branches keep the static crumb. `header.tsx` is untouched.
- New specs: `event-header-trail.spec.ts` (the three trail shapes) and `upload-page-trail.spec.ts` (transpiles the page with mocks; checks the slot and props on `?entry=` and no slot on the bare or `?match=` requests).

**follow-ups:**

1. A resumed `?draft=` that started from an event line still shows only "Upload video". The draft carries its preset, so it could publish the same trail.
2. The `?match=`-only single-match branch could publish a trail to `/dashboard/team/schedule/single/<id>`.

## T29 · Schedule event and single-match skeletons mirror their pages — done

**gate:** mechanical GATE PASS (first run) · completion `VERDICT: pass` (criterion 2's 640px box ruled "met, qualified by the note")

**changed:**

- `EventTableSkeleton` now mirrors `EventTable`:
  - The only `border-b` is on the header row, which has six label bars on the dual's grid.
  - One group-head bar.
  - Nine borderless `h-12` rows.
  - The strip has three cells; the edit-only action bar was dropped.
- `EventPageSkeleton` is renamed `SingleMatchPending` and mirrors `single-detail.tsx`:
  - Eyebrow, then the 30px title with a 40px score bar, then the facts row.
  - The hairline status row, then the 560px section.
  - The conditional "From the report" 640px box is omitted, per the task's note.
  - Only the old skeleton used the `Title`/`Kpis`/`Rows`/`Section` helpers, so they're deleted.
- `SnapshotPending` is built on `PendingRegion`/`PendingBar` and dropped from `LEGACY`.
- New `tests/schedule-skeletons.spec.ts`: the skeleton contract, one `border-b` row, the header grid matching `dual-detail.tsx`'s `GRID`, no 300px rail and no 640px box.

**follow-ups:**

1. The skeleton copies the dual's grid string instead of importing it. Export `GRID` from `dual-detail.tsx` (or move it next to `EventTable`); for now the spec catches drift.
2. `SingleMatchPending` draws both the score bar (only present once scored) and the Score/Video rows (only present before scoring), a combination no real page state shows. Decide whether one state should win.

## T30 · In-component loading states: the edit-match dialog and the search palette — done

**gate:** mechanical GATE PASS (first run) · completion `VERDICT: pass`

**changed:**

- `EditMatchDialog`'s first load now renders `EditMatchPending` in place of the spinner and "Reading the match…". It is a `PendingRegion` labelled "Loading match" with one bar row for each entry in `EDIT_MATCH_FIELD_ROWS`.
- `EDIT_MATCH_FIELD_ROWS` is a new non-client module, `edit-match-rows.ts`. It lists the 7 always-present rows: 2 score, 2 players, 3 details.
- Conditional rows (Round, and Format/Scoring/Lets) are left out, so the skeleton doesn't promise rows that may not appear.
- The Save button's inline spinner stays.
- The search palette's three loading rows are one `PendingRegion` labelled "Loading results", built from `PendingBar`s, and the palette is off `LEGACY`.
- New `tests/edit-match-pending.spec.ts` checks the skeleton contract, and checks the row count and order against the constant and the form's own source.

**follow-ups:**

1. A match already linked to a schedule line shows its event's sentence instead of the three Details rows, so the dialog shrinks when that match loads.
2. The palette's loading status sits inside `role="listbox"`. Move it out, or put `aria-busy` on the listbox, in an accessibility pass.
3. The form doesn't render from `EDIT_MATCH_FIELD_ROWS`, so only the spec's source checks guard it against drift.

## T31 · Matches and match report skeleton bars on the shared primitives — done

**gate:** mechanical GATE PASS (first run) · completion `VERDICT: pass`

**changed:**

- `matches-skeleton.tsx`: the local `Bar` is gone, so every bar is a `PendingBar`. The outer status is a `PendingRegion`, which drops the hand-written `aria-busy` and `sr-only` span, as the other `PendingRegion` skeletons already do.
- `matches-title-row.tsx`: nests a `PendingBar` inside its own status span.
- `film-frame-pending.tsx`: now a `PendingRegion` wrapped around an absolute `PendingBar`, with the caption layered above it.
- `match-report-pending.tsx`: its two court thumbnails are sizing wrappers, each holding a `PendingBar`. `PendingBar` takes no `style` prop, so the `aspect-ratio` has to sit on the wrapper.
- `tests/skeleton-primitives.spec.ts`: all four files are off `LEGACY`.
- `match-report-pending.spec.ts` passes without any edits to it.

## T32 · Home, team, header and event-wizard skeleton bars on the shared primitives — done

**gate:** mechanical GATE PASS (first run) · completion `VERDICT: pass`

**changed:**

- Local bar components are removed and every call site uses `PendingBar` directly:
  - `home-skeleton.tsx`'s `Bar`. A first pass kept it as a pass-through; it was removed before the gate.
  - `event-wizard-pending.tsx`'s `Bar`.
  - The roster profile's `Pulse`. It was on `--color-surface-muted` and now uses the token.
- Hand-built status wrappers in `home-skeleton.tsx` and `home-ai-insight.tsx` are now `PendingRegion`.
- `RecentMatchesSkeletonContent`'s `animate={false}` now uses `[&_[data-pending-bar]]:animate-none`.
- `EditEventPending`'s raw progress rule is now `PendingBar rounded-none`.
- The header's three match-crumb bars sit in one `PendingRegion` labelled "Loading breadcrumb", off `--ink-100`.
- All five files are off `LEGACY`. `home-empty-loading` and `team-loading` pass unedited.

## T33 · Settings skeletons on the shared primitives — blocked

**gate:** mechanical GATE FAIL on all six runs. Every failure was a live-DB spec, plus the known `match-video-attachment-flow.spec.ts:848` flake. Failures per run: 1, 1, 1, 1, then 22, then 21. On the sixth run, `createUser` itself failed ("fetch failed after 20 attempts over 170s"), because the shared Supabase is degraded. None of the failures touch the task's files. The criterion's own command passed: lint, typecheck and `settings-pending` + `skeleton-primitives` (27/27). · completion `VERDICT: pass`, not reached as a gate verdict because the mechanical gate failed first.

**stash:** `4dd7cb9f1221f5ea66d0e57587175186f5d168c9`. It holds `settings-pending.tsx` on `PendingBar`/`PendingRegion`, `LEGACY` emptied, and the new `tests/settings-pending.spec.ts`.

**to resume:** once the live DB is healthy, run `git stash apply 4dd7cb9f`, reset the status to `todo`, and re-run the gate. Visible change: a multi-line text placeholder is now one block instead of one band per line, because `PendingBar` has no children.

## T34 · The dashboard root loading fallback becomes a skeleton, not a spinner — blocked

**gate:** mechanical GATE FAIL (16.4m, 172 did not run). Every failure is a live-DB spec, because the shared Supabase is still degraded, as it was for T33. A follow-up probe of `saved-views-rls.spec.ts` alone took 4m17s and failed. The gate stops at the first failure, so the completion review was not run. The criterion's own command passed: lint, typecheck, and `dashboard-page-pending` + `skeleton-primitives` (9/9).

**stash:** `be16e15c3e236f5c7fad8acc89bb5e9a4d9eb285`. Contents:

- `src/app/dashboard/loading.tsx` exports `DashboardPagePending`, which lives in `page-skeletons.tsx`: ComingSoonPage's frame, one `PendingRegion` labelled "Loading page", and one `h-9 w-64` bar.
- `SimplePageLoader` is deleted.
- The spin exception is removed from `skeleton-primitives.spec.ts`.
- New `tests/dashboard-page-pending.spec.ts`.

`help/page.tsx` does not use ComingSoonPage's frame (it's 1032px, `px-6 py-8`), so Help won't pixel-align during the loading flash. The bar keeps the frame the criterion states.

**to resume:** once the live DB is healthy, run `git stash apply be16e15c`, reset the status to `todo`, then re-run the gate and the completion review.

## T33 · Settings skeletons on the shared primitives — done

**gate:** mechanical GATE PASS on the second run after resuming (the first failed only on the live-DB `point-bookmarks-db.spec.ts:204`). The shared Supabase recovered at about 04:30 UTC. · completion `VERDICT: pass`, from the earlier review of the identical diff (stash `4dd7cb9f`, re-applied unchanged).

**changed:** `settings-pending.tsx` is built on `PendingBar`/`PendingRegion`, and `SKELETON_BG` and the `BAND` gradient-text technique are removed. `Text`/`Button`/`PillSelect`/`Pill` use a grid stack: an invisible copy of the content sets the size, and one `PendingBar` overlays it. `Column` is a `PendingRegion`. `LEGACY` in `skeleton-primitives.spec.ts` is now empty. New `tests/settings-pending.spec.ts` renders all 7 exports and checks each one's skeleton contract, including exactly one `role="status"` per export.

**follow-ups:**

1. A multi-line text placeholder is now one block instead of one band per wrapped line. `PendingBar` has no children, which is why. If per-line bands matter, `PendingBar` would need a text-band variant.

## T34 · The dashboard root loading fallback becomes a skeleton, not a spinner — blocked

**gate:** mechanical GATE PASS (first run, live DB healthy again) · completion `VERDICT: needs-work`. Criterion 2 is not met as the note qualifies it: `help/page.tsx` does not use ComingSoonPage's frame (it uses 1032px, `px-6 py-8`), and the note says "draw the h1 bar at the shared x only" in that case. The implementation kept the full `max-w-screen-2xl px-14 pt-5 pb-8` frame, so Help shifts on load. The other three criteria are met.

**stash:** `0e3f0bc6a956bcb11982519a13743a09e456bdce`. It is the same work as `be16e15c`, re-applied onto T33's commit with no conflict.

**to resume:** decide what the root fallback should draw, given that Help's frame differs from ComingSoonPage's. Then apply the stash and amend `DashboardPagePending` (and criterion 2 if needed).

## T34 · The dashboard root loading fallback becomes a skeleton, not a spinner — done

**gate:**

- **Mechanical: GATE PASS.** The byte-identical code passed a full gate on 2026-09-24, right after the live DB recovered. Two later re-runs failed only on live-DB specs (21 each) when the shared Supabase degraded again; only the task note changed in between.
- **Completion: `VERDICT: pass`**, judged against the task as amended by the author's ruling.

**changed:**

- `src/app/dashboard/loading.tsx` default-exports `DashboardPagePending`. It lives in `page-skeletons.tsx` and uses ComingSoonPage's frame: one `PendingRegion` labelled "Loading page" and one `h-9 w-64` title bar.
- `SimplePageLoader`, the spinner, is deleted. `SPIN_EXCEPTIONS` is now empty.
- New `tests/dashboard-page-pending.spec.ts`.
- The author ruled on 2026-09-24 to keep ComingSoonPage's frame and accept Help's title shift. The ruling is recorded in the T34 note.

**follow-ups:**

1. Help is the only real page that falls through to this fallback. A `help/loading.tsx` in Help's own 1032px frame would remove the shift.
2. The live DB degrades after back-to-back full-suite runs. Recovery was followed by one passing run, then two runs with 21 failures each. The suite's live specs may be exhausting the project's compute or disk-IO budget.
