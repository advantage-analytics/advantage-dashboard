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
