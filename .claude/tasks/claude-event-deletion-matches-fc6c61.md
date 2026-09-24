# Tasks — claude/event-deletion-matches-fc6c61

> Scope: deleting a team schedule event detaches its matches instead of being blocked, with a prose warning in the confirm dialog

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

## T1 · Let event deletion detach matches (migration + deleteEvent)

- **status:** done
- **model:** fable
- **files:** supabase/migrations/20260922<HHMMSS>_event_delete_detaches_matches.sql (new, guess), src/lib/schedule/actions.ts (`deleteEvent`, ~line 233), tests/schedule-event-delete.spec.ts, tests/schedule-event-delete-db.spec.ts
- **done when:**
  - [ ] A new file in `supabase/migrations/` does `create or replace function schedule_private.guard_event_delete()` keeping the program-gone early return, the anon/authenticated role check (42501), and the `update public.program_event_entries set id = id where event_id = old.id` serialisation from `20260910190731_delete_eligible_schedule_event.sql`, with the matches/outcomes/forfeit `raise ... 23514` removed; the audit insert's `details` jsonb gains a `detached_matches` integer counted as `count(*) from public.matches m join public.program_event_entries l on l.id = m.event_entry_id where l.event_id = old.id` before the return. The same file alters `program_event_outcomes_entry_scope_fkey` and `program_event_outcomes_event_scope_fkey` to `on delete cascade` (drop + re-add, keeping their column lists and `on update restrict`).
  - [ ] The DDL is applied to the live project via the Supabase MCP `apply_migration` with the same name as the file. Reviewer check via `execute_sql`: `select pg_get_functiondef('schedule_private.guard_event_delete'::regproc)` no longer contains `cannot be deleted` and does contain `detached_matches`; `select conname, confdeltype from pg_constraint where conname in ('program_event_outcomes_entry_scope_fkey','program_event_outcomes_event_scope_fkey')` returns `c` for both.
  - [ ] `deleteEvent` in `src/lib/schedule/actions.ts` calls `revalidatePath("/dashboard/matches")` in addition to the two existing schedule paths, and the owner/coach assertion in `tests/schedule-event-delete.spec.ts` expects `refreshed` to equal exactly `["/dashboard/team/schedule", "/dashboard/team/schedule/event", "/dashboard/matches"]`.
  - [ ] `tests/schedule-event-delete.spec.ts`'s "failures return without revalidation" case no longer lists the "recorded matches or outcomes" message (a generic message such as "Audit unavailable" remains), and `tests/schedule-event-delete-db.spec.ts`'s dependency loop (the three `insert into matches` / `set forfeit` / `set_schedule_outcome` cases) asserts instead that `delete_schedule_event` returns the event id, `program_events` row count for the event is 0, the match row still exists with `event_entry_id is null`, no `program_event_outcomes` row remains for the event, and the `event.deleted` audit row's `details->>'detached_matches'` is `'1'` for the match case and `'0'` for the other two. The audit-failure rollback case (23514 via the local check constraint) is kept.
  - [ ] `npm test -- tests/schedule-event-delete.spec.ts` passes and `npm run lint && npm run typecheck` are clean; the db spec is only run if `SCHEDULE_DELETE_LOCAL_CONTAINER` is set (it self-skips otherwise) — do not point it at any remote.
- **notes:** Decision (user, 2026-09-22): deletable events, matches survive as unassigned program matches. `matches.event_entry_id` is already `on delete set null` and entries cascade from events, so only the trigger raise and the two outcome FKs block this. Inspect the live catalog first (`list_tables` / `execute_sql` on `pg_constraint`) — verified 2026-09-22: both outcome FKs are `r` live, latest applied migration is `20260922042309`, ahead of the repo folder. Before-delete trigger, so the count runs before the entry cascade. Add a header comment superseding "Never detach recorded matches" in the 20260910190731 file. Plan: /Users/cjgimena/.claude/plans/twinkly-sleeping-kahan.md.

## T2 · Warn about attached matches in the delete-event dialog

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/schedule/static/event-actions-menu.tsx, src/components/dashboard/schedule/static/event-drawer.tsx (call site ~line 236, guess), tests/schedule-drawer-actions.spec.ts
- **done when:**
  - [ ] `EventActionsMenu` takes the drawer's already-loaded data (e.g. an `entries: EventEntry[]` prop, or `matchCount` / `hasOutcome` / `teamScore` precomputed in `event-drawer.tsx` from `detail.entries` and `dualScore`), passed from `event-drawer.tsx`; no new fetch, query, or server action is added anywhere in the diff.
  - [ ] When the summed `entry.matches.length` is 0 and no entry has an outcome or legacy `forfeit`, the `ConfirmDialog` keeps a short description with the sentence "Events with recorded matches or outcomes can't be deleted" removed; the `FloatMenuItem` `description` likewise no longer implies deletion can be blocked.
  - [ ] When the count is non-zero (or an outcome/forfeit exists), the dialog renders `<ConfirmProse>` children in the `delete-match-dialog.tsx` style (load-bearing nouns in `Em`) that name the count with correct pluralisation ("1 match stays" / "9 matches stay"), say the matches remain in the library but lose their line, name the dual team result via `dualScore` (e.g. "9–0") when the event is a dual with a non-0–0 score, and end with "There is no undo."
  - [ ] `tests/schedule-drawer-actions.spec.ts` gains a case that opens "Settled Dual" as owner or coach, opens Delete event, asserts the `alertdialog` text contains "9 matches" and "9–0", confirms, and asserts `window.actionCalls` equals `[{ action: "deleteEvent", input: "dual-settled" }]`; the existing "Long Open Dual" flow still asserts the count copy is absent, and the refusal test's `failNextDelete` string is changed to a generic server message (not the old "cannot be deleted" copy).
  - [ ] `npm test -- tests/schedule-drawer-actions.spec.ts` passes and `npm run lint && npm run typecheck` are clean.
- **notes:** No type-to-confirm, no two-step (user decision 2026-09-22). `ConfirmProse` and `Em` live in `src/components/ui/confirm-dialog.tsx` (~line 213); `ConfirmDialog` renders `children` as the body when present. `dualScore` is in `src/lib/schedule/entry-state.ts:347`. The harness fixture `dual-settled` already has 9 played matches with `teamScore { us: 9, them: 0 }` — no new fixture needed. Watch the settled-dual spec at line ~195, which assumes staff-capable viewers see a specific footer; open it as owner/coach so the Event actions menu is rendered. Plan: /Users/cjgimena/.claude/plans/twinkly-sleeping-kahan.md.

## T3 · Rewrite doubles-via-SwingVision copy to score-only

- **status:** done
- **model:** sonnet
- **files:** src/app/dashboard/help/page.tsx, src/components/dashboard/team/dual-sheet.tsx, .skills/advantage-analytics-design/reference/primitives.md, src/lib/schedule/entry-state.ts, src/lib/data/team-court-record.ts, src/components/dashboard/schedule/README.md (guess; the grep pins are exact)
- **done when:**
  - [ ] `src/app/dashboard/help/page.tsx:347` SwingVision `SourceCard` body ends "Singles only." (not "Singles and doubles."), and line 406 reads "Doubles lines record a score only." instead of "Doubles matches import via SwingVision instead."
  - [ ] `src/components/dashboard/team/dual-sheet.tsx:137` footer reads "doubles are score only"; `.skills/advantage-analytics-design/reference/primitives.md:28` reads "Doubles are score only for now."
  - [ ] The `supportsVideo` doc comment in `src/lib/schedule/entry-state.ts:145-158` no longer says a doubles line can take a SwingVision export; it states doubles lines record a score only and statistics/video are singles only. Same for the singles-only note at `src/lib/data/team-court-record.ts:26` ("Doubles lines arrive via SwingVision") and the "Add video" / "Add file" sentence at `src/components/dashboard/schedule/README.md:119`.
  - [ ] `grep -rn "via SwingVision\|SwingVision-only\|Singles and doubles" src .skills docs` returns nothing.
  - [ ] `npm run lint && npm run typecheck` clean; `tests/schedule-static-copy.spec.ts` passes.
- **notes:** Product decision 2026-09-22: doubles is unsupported for both video and SwingVision statistics; a doubles line carries a score only. `FileStepContent.tsx:102` ("Doubles exports aren't read yet.") is already correct — leave it. Comments only in entry-state.ts / team-court-record.ts; no logic changes. The code-level "Add file" strings are T4's, not this task's.

## T4 · Doubles line never offers an upload on the score flow or schedule row

- **status:** done
- **model:** opus
- **files:** src/lib/schedule/score-seed.ts, src/components/dashboard/schedule/score-only-flow.tsx, src/components/dashboard/schedule/line-row.tsx, tests/score-seed.spec.ts, tests/schedule-score-flow-outcomes.spec.ts (guess; functions verified)
- **done when:**
  - [ ] `uploadInsteadHref()` (`src/lib/schedule/score-seed.ts:256`) returns null when `preset.discipline === "doubles"`, and `savedLineUpload()` (`:286`) returns null for a doubles preset; `SavedLineUpload.action` is the literal `"Add video"` only and the string `"Add file"` no longer appears in `src/`.
  - [ ] `score-only-flow.tsx` renders no "Have the … file?" / "Upload it instead" block for a doubles line; the singles branch still renders "Have the match video?" and the ternary at `:638` is gone (only the video wording remains).
  - [ ] `line-row.tsx` `Action` (`:330-355`) returns null in the scored state for a doubles line and still renders the "Add video" `RowAction` for a singles line; the "Add file" comment block at `:334-337` is removed.
  - [ ] `tests/score-seed.spec.ts:261` asserts `savedLineUpload(preset({ discipline: "doubles", supportsVideo: false, round: "D2" }), "m", true)` is null; `tests/schedule-score-flow-outcomes.spec.ts:431-436` asserts `uploadInstead(page)` has count 0 on the S2 doubles line, and `:482` asserts no link named "Add file" exists after saving S2.
  - [ ] `npm run lint && npm run typecheck` clean; `tests/score-seed.spec.ts` and `tests/schedule-score-flow-outcomes.spec.ts` pass.
- **notes:** Gate on `discipline`, not `!supportsVideo`: `supportsVideo()` is also false for a singles line with a recorded outcome, so `videoAllowed`/`supportsVideo` alone would over-hide. `Action` in line-row currently receives only `videoAllowed`; pass `entry.discipline` (or a `doubles` boolean) from the caller at `:113`. The harness (`tests/fixtures/schedule-score-flow-outcomes-harness.tsx:75-86`) already builds S2 as `discipline: "doubles", supportsVideo: false`, so the spec flip needs no fixture change. Rename the test at `:431` to say the line offers no upload.

## T5 · Wizard and upload page refuse a doubles preset

- **status:** done
- **model:** fable
- **files:** src/components/dashboard/matches/new-match-wizard/subject-eligibility.ts, src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, src/app/dashboard/team/upload/page.tsx, src/lib/workspace/upload-eligibility.ts (only if the reason joins the contract union), tests/upload-eligibility.spec.ts (guess; seams verified)
- **done when:**
  - [ ] `wizardUploadEligibility()` returns `{ ok: false, retryable: false, message: "Doubles lines record a score only. Statistics are singles only for now." }` (with a distinct `reason`) whenever `preset?.discipline === "doubles"`, before any other rule runs; the "doubles carve-out" block at `subject-eligibility.ts:230-239` is deleted and the `attribution: null` case is gone from the `WizardEligibility` doc comment.
  - [ ] `useUploadMatchWizard.ts` no longer routes a preset by `supportsVideo` onto an import provider: `DEFAULT_IMPORT_PROVIDER_ID` (`:293`) and its comment are removed, the preset branch at `:1234-1236` always uses `DEFAULT_PROVIDER_ID`, and the `matchType` fallback at `:1259-1261` no longer derives "Doubles" from `!supportsVideo`; `handleProviderContinue` (`:1813`) and `handleCreateMatch` still stop on `eligibility.ok === false` with the new message reaching `setError` / `EligibilityNotice`.
  - [ ] `src/app/dashboard/team/upload/page.tsx` `?entry=` branch (`:170-212`) redirects to `/dashboard/team/upload` when the resolved entry's `discipline !== "singles"`, in the same style as the `entryId && !staff` redirect at `:108`, so a hand-built URL never reaches `UploadMatchFlow` with a doubles preset.
  - [ ] A spec (extend `tests/upload-eligibility.spec.ts` or add `tests/wizard-doubles-preset.spec.ts`) asserts the doubles refusal's `ok: false`, `retryable: false` and exact message, and that a singles preset with `playerUserId: null` is still refused as `athlete-required` (the carve-out did not silently widen); if the reason joins `UploadIneligibilityReason`, the "names every reason" table at `tests/upload-eligibility.spec.ts:273` is updated.
  - [ ] `npm run lint && npm run typecheck` clean; `tests/upload-eligibility.spec.ts`, `tests/upload-write-eligibility.spec.ts` and `tests/match-video-wizard-route.spec.ts` pass.
- **notes:** There is no server action in `src/lib/wizard/actions.ts` that creates an import match from a preset — the wizard inserts from the browser (`useUploadMatchWizard.ts:2846`, `event_entry_id: line?.entryId`), and the preset for `?entry=` is built server-side in `src/app/dashboard/team/upload/page.tsx`. That page is the server seam for a hand-built URL. `findUploadLines` / `attachLineGroups` (`src/lib/schedule/attach-line-state.ts:133`) already exclude non-singles entries from the "Add to an event" picker, so no change there. Decide whether the new reason lives in the contract union (`upload-eligibility.ts:137`, touches `retryable` mapping at `:226`) or is wizard-local by widening `WizardEligibility`; either is fine, document which. Do NOT detect doubles in the SwingVision validator/parser — out of scope; the gate is the preset's discipline. Personal workspaces have no doubles concept; leave them alone.

## T6 · Grey "score only" fact strip on the dual facts step

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/schedule/static/dual-build-step.tsx, tests/schedule-static-copy.spec.ts (guess; `DualFactsStep` at `:850`, `screen("dual-build-step.tsx")` already bound to `step2` at `:545`)
- **done when:**
  - [ ] `DualFactsStep` renders, directly after the second `grid-cols-3` row (Time / Singles format / Doubles format), a `<div className={noteStripCls}>` containing a lucide `Info` icon with `noteIconCls` + `text-[var(--ink-400)]`, `strokeWidth={1.5}`, `aria-hidden="true"`, then `<b className="font-medium text-[var(--ink-900)]">Doubles lines record a score only.</b>` followed by plain text "Statistics and video analysis are singles only for now." — the same markup shape as `PendingTeamNote.tsx`.
  - [ ] `noteStripCls` and `noteIconCls` are imported from `@/components/dashboard/matches/new-match-wizard/styles`; `warningStripCls` is not used and no `--warning-*` token appears in the added markup.
  - [ ] `tests/schedule-static-copy.spec.ts` (the `/dashboard/team/schedule/new/dual` describe at `:543`) gains an assertion that `step2` contains "Doubles lines record a score only. Statistics and video analysis are singles only for now."
  - [ ] `npm run lint && npm run typecheck` clean; `tests/schedule-static-copy.spec.ts` and `tests/dual-format-options.spec.ts` pass.
- **notes:** Design rule: grey for a fact, yellow for something the person must answer — this is a fact. Canvas: https://claude.ai/artifact/9BQZczs7vD8BN28JAt1Q5o, artboard "Grey fact strip — recommended". `screen()` strips JSX tags and collapses whitespace, so put `{" "}` (or a literal space) between the `</b>` and the second sentence or the assertion will not match. Widget-states hooks fire on edits under `src/components/dashboard`; a static strip has no loading/empty state, so answer them accordingly.

## T7 · Lift the Matches drawer's body sections into a shared module

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/drawer-sections.tsx (new), src/components/dashboard/matches/match-drawer.tsx, tests/drawer-sections.spec.ts (new) (guess; `DrawerFact` at match-drawer.tsx:389, `drawerSideName` :381, `toSnapshot`/`percent` :669-700, `useMatchDetails` :596)
- **done when:**
  - [ ] `src/components/dashboard/matches/drawer-sections.tsx` exports `DrawerFact`, `drawerSideName`, `DrawerHeading` (title link + `ResultMark` + `ScoreLine`, taking `href`/`label`/`title`/`won`/`sets` as plain props), `AnalysisNotice` (the in-flight block and the failed `role="alert"` block, taking `status`/`failNote`/`canRetry`), `SnapshotSection` (the "Snapshot" eyebrow and four-figure `<dl>`), `toSnapshot`, and `useMatchSnapshot(matchId)`; nothing in it imports `DisplayMatch`.
  - [ ] `match-drawer.tsx` imports those pieces and no longer defines `DrawerFact`, `drawerSideName`, `toSnapshot` or `percent`, nor contains the literal "Serve and pressure numbers appear here once analysis finishes." or the snapshot `<dl>`; the `match_stats_with_percentages` query appears only in `drawer-sections.tsx` within `src/components/dashboard/matches/`, and `MatchDrawer`'s props are unchanged.
  - [ ] `tests/drawer-sections.spec.ts` (pure) asserts `toSnapshot` maps `{first_serve_pct: 61.4, first_serve_won_pct: 74.2, break_points_converted: 3, break_point_opportunities: 5, double_faults: 2}` to `{"61%","74%","3/5","2"}`, returns `null` for an all-null row and for `null`, and that `drawerSideName("Maya Reid / Jess Park")` contains `" & "`.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/drawer-sections.spec.ts tests/schedule-drawer-actions.spec.ts tests/schedule-drawer-outcomes.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frames: `docs/superpowers/specs/2026-09-23-event-pages-match-table/DualDrawer.dc.html` and `TournamentDrawer.dc.html` show the sections these pieces must render. Behaviour-neutral for the Matches page — move, don't restyle. Keep the details cache and `forgetMatchDetails` working; the snapshot half of `useMatchDetails` moves into `useMatchSnapshot`, the team-only schedule query stays in `match-drawer.tsx`. `useMatchSnapshot` calls `@/lib/supabase/client`; browser harnesses alias that to `tests/fixtures/supabase-client-browser-mock.ts`, whose chain may need a `.select().eq().eq().maybeSingle()` path (T10 handles that).

## T8 · Build the event-page table kit (layout, header, strip, toolbar, grouped table, row selection)

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/event-table.tsx (new), src/components/dashboard/schedule/use-row-selection.ts (new), tests/fixtures/event-table-harness.tsx (new), tests/event-table.spec.ts (new) (guess; the selection model to copy is `static/static-schedule.tsx:146-380` plus `:758-770`)
- **done when:**
  - [ ] `event-table.tsx` exports `EventPageLayout` (a column of two groups — `gap-6` header+strip, `gap-3` toolbar+table+footer — with `gap-8` between them, and a `drawer` slot drawn as a flex sibling of the column like `static-schedule.tsx:386` places `EventDrawer`), `EventHeader` (`h1.text-display`, optional mark, one 12px ink-600 subline whose parts are separated by ink-300 `·` spans, actions in an `items-center` right cluster), `SummaryStrip`/`SummaryCell` (`eyebrow-sm` label, 15px ink-900 `tabular` value, optional 12px ink-500 trailing word; every cell after the first carries a 1px `--border-hairline` left rule and 28px horizontal padding, the first none; the strip has no top/bottom border), `EventToolbar`, `EventTable`, `EventGroupHead`, `EventRow` (48px, no row dividers, `aria-current="true"` + the `match-card-list.tsx` selected wash when selected) and `EventTableFooter`.
  - [ ] `use-row-selection.ts` exports `useRowSelection({ ids, initialId, param })`: click selects, re-click closes, Esc closes, ↑/↓ step through the currently visible `ids`, the selection is mirrored into `?<param>=` with `history.replaceState`, keys are ignored inside inputs, `alertdialog`/`aria-modal`, non-drawer dialogs and Radix poppers (the `static-schedule.tsx:325-345` guard), and a filter that hides the selected row clears the selection.
  - [ ] `tests/fixtures/event-table-harness.tsx` renders three rows (`a`,`b`,`c`), two `Chip` pills and a `PeekDrawerFrame kind="Line"` drawer; `tests/event-table.spec.ts` asserts: clicking `b` sets `aria-current` on `b`, `location.search` equals `?line=b`, and the drawer counter reads "Line 2 / 3"; ArrowDown moves to `c`; clicking `c` again removes `line` from the URL and the `dialog`; Escape closes an open drawer; choosing a pill that excludes the selected row closes the drawer and leaves only the matching rows.
  - [ ] `EventToolbar` draws its pills with `static/chip.tsx`'s `Chip`, its Filters button with `MatchesFilterPanel` from `matches/matches-filter-panel.tsx`, and its sort with `SortTrigger` + `FloatMenu`; it does not import `LifecycleChips`.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/event-table.spec.ts tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/schedule-static-copy.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frames: `Main.dc.html` for the header, strip, toolbar, table and footer spacing; `TournamentDrawer.dc.html` for the drawer beside the table. Filter decision (planner): the Matches page's filter model (`matchesFilterGroups` over `DisplayMatch`) is not reused. `MatchesFilterPanel<K>` is generic over segmented sections and the Schedule page already drives it that way (`static-schedule.tsx:415`), so Filters is real and cheap: one "Result" segment (Won · Lost · Undecided) on both pages. Sort is real with two orders per page: dual "Line order"/"Player", tournament "Round order"/"Date". Pills filter client-side. Do not touch `EventPageFrame` or the live pages here — T9/T11 switch over and T13 deletes. The harness `next/navigation` mock's `useSearchParams()` returns `null`, so the initial id must arrive as a prop, as `static-schedule.tsx`'s `initialSelectedId` does. Use the harness build pattern from `tests/schedule-dual-outcomes.spec.ts:29-90`. Widget-states hooks fire under `src/components/dashboard`; the table's empty body is `shared/table-empty-body.tsx`'s `TableEmptyBody`.

## T9 · Rebuild the dual page as a line table with the new header, strip and primary-action rule

- **status:** done
- **model:** opus
- **needs:** T8
- **files:** src/components/dashboard/schedule/dual-detail.tsx, src/app/dashboard/team/schedule/[eventId]/page.tsx, src/lib/schedule/dual-primary-action.ts (new), tests/dual-primary-action.spec.ts (new), tests/fixtures/schedule-dual-outcomes-harness.tsx, tests/fixtures/schedule-dual-outcomes-data.ts, tests/schedule-dual-outcomes.spec.ts (guess)
- **done when:**
  - [ ] `dualPrimaryAction(entries, eventId)` in `src/lib/schedule/dual-primary-action.ts` returns `{ label: "Add result", href: "/dashboard/team/schedule/<id>/score" }` when any entry has `forfeit === null && entryState(entry) === "empty"`; otherwise `{ label: "Add video", href: "/dashboard/team/upload?entry=<entryId>&match=<matchId>" }` when exactly one singles line has a played match with `hasVideo === false`; `{ label: "Add video", href: "/dashboard/team/upload" }` when two or more do; and `null` when none do. `tests/dual-primary-action.spec.ts` covers all four plus "a doubles line without video never counts".
  - [ ] `DualDetail` renders on `EventPageLayout`: the header has no `EventGlyphRow`, no `text-[40px]` score and no `DualTicks size="lg"`; the Result cell reads "Won 4–3" + "Final" for `OUTCOME_ENTRIES` and "In progress" + "<n> of 9 decided" for `NORMAL_ENTRIES` (n from `entryPlayed` in the spec); the Lines cell holds nine ticks + "<n> of 9 won"; the Analysis cell reads "<a> of 6" + "singles have stats"; with `canEdit` the header shows ghost "Edit dual" and a primary whose label/href equal `dualPrimaryAction(...)`, and without `canEdit` neither.
  - [ ] The table's column headers are exactly `["Line","Player","Opponent","Result","Score","Analysis"]` on `28px | minmax(170px,250px) | minmax(140px,220px) | 52px | 120px | minmax(96px,1fr)`; rows run S1–S6 under a "Singles" group head with its W–L, then D1–D3 under "Doubles" with W–L and "point ours"/"point theirs"; every doubles row's Analysis cell reads "Score only"; the footer contains "Doubles lines record a score only."; the pills read "All lines · Singles · Doubles · Needs a result" and clicking "Doubles" in the spec leaves exactly three rows.
  - [ ] `page.tsx` accepts `searchParams` and passes `searchParams.line` as the dual's initial selection and the conference + date/time/site/surface through to the subline; `dual-detail.tsx` no longer imports `LineRow`, `TableCard`, `GroupHead` or `EventPageFrame`; `tests/schedule-dual-outcomes.spec.ts`'s per-row outcome words (Forfeited/Defaulted/Withdrawn, Won/Lost) are asserted against the new rows, and its row-level "Edit result"/"View report"/"Add result" link assertions are removed with a comment that T10 re-asserts them in the drawer.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/dual-primary-action.spec.ts tests/schedule-dual-outcomes.spec.ts tests/event-table.spec.ts tests/forfeited-lines.spec.ts tests/schedule-static-copy.spec.ts tests/schedule-drawer-actions.spec.ts tests/schedule-drawer-outcomes.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frame: `Main.dc.html` (exact copy, order, spacing). The rows carry no action links; T10's drawer re-homes them — do not ship the branch between T9 and T10. There is no event-scoped upload picker: `/dashboard/team/upload` accepts only `entry`, `match`, `draft` (`upload/page.tsx:47`), so "a line to choose" means the bare route. The current primary reads "Add score"/"Upload match video"; the new copy is intentional. The footer copy is sentence case and `formatLabel` is Title Case, so derive the footer from `lineFormat(event.format, …)` with a small local formatter. Analysis words for singles rows use `matches/row-state.tsx`'s `RowLifecycle` with `{ status }`. Doubles avatars sit side by side 2px apart, not overlapped like `line-row.tsx`'s `PlayerAvatars`. `DualDetail` becomes a client component; keep `viewer` serialisable.

## T10 · Dual line drawer, including the doubles and unplayed variants

- **status:** done
- **model:** opus
- **needs:** T7, T9
- **files:** src/components/dashboard/schedule/event-line-drawer.tsx (new), src/components/dashboard/schedule/dual-detail.tsx, tests/fixtures/schedule-dual-outcomes-harness.tsx, tests/fixtures/supabase-client-browser-mock.ts, tests/schedule-dual-outcomes.spec.ts (guess)
- **done when:**
  - [ ] `event-line-drawer.tsx` wraps `PeekDrawerFrame` and composes T7's sections with a `context` slot for a page-specific list. On the dual page, clicking a singles row with a played match (NORMAL S2) opens a `role="dialog"` whose header shows "Line 2 / 9"; its title link and a footer "View match" link both point to `/dashboard/matches/normal-ready-match`; its facts contain "vs <event name> · S2"; with `canEdit`, a scored singles line with no video also shows "Add video" linking to `/dashboard/team/upload?entry=<entry>&match=<match>`.
  - [ ] The drawer's context section shows the eyebrow "This dual" with the result on the right ("Won 4–3" for `OUTCOME_ENTRIES`) and nine rows in S1…D3 order; the open line's row carries `aria-current="true"`, and clicking another row in that list switches the drawer to it.
  - [ ] A doubles line (D1) drawer contains no "Snapshot" text and no "Add video" link; it shows a `noteStripCls` strip reading "Doubles lines record a score only. Statistics and video analysis are singles only for now." and a primary "Edit result" (or "Add result" when unscored) linking to `/dashboard/team/schedule/dual-outcomes/score?entry=entry-d1`. An unplayed singles line (NORMAL S1) shows primary "Add result" matching `/score?entry=` and no ⋯ button. Outcome lines (OUTCOME S1–S6) each show "Edit result" with `href` `/dashboard/team/schedule/dual-outcomes/score?entry=entry-s<n>` and no "View report" link.
  - [ ] ⋯ (`MatchActionsMenu`) renders only when the line has a match and `canEdit` is true; the harness opened with `?viewer=player` (rendering `canEdit={false}`) shows no ⋯, no "Add result"/"Edit result"/"Add video" links, and still shows "View match" on S2.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-dual-outcomes.spec.ts tests/event-table.spec.ts tests/drawer-sections.spec.ts tests/forfeited-lines.spec.ts tests/schedule-drawer-actions.spec.ts tests/schedule-drawer-outcomes.spec.ts tests/schedule-static-copy.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frames: `DualDrawer.dc.html` (singles) and `DualDoublesDrawer.dc.html` (doubles). The note-strip markup is T6's (`static/dual-build-step.tsx` `DualFactsStep`); `noteStripCls`/`noteIconCls` from `matches/new-match-wizard/styles`. `MatchDrawer` gates ⋯ on `match.canManage` (uploader); `EntryMatch` has no such field, so gate on `canEdit` and let the server actions refuse non-owners. Outcome precedence follows `entryState`/`lineWon`; outcome words from `LINE_STATUS` (`src/lib/schedule/line-status.ts`). The spec's webpack aliases must add `@/lib/supabase/client` → the browser mock, and probably a stub for `matches/match-actions/*` dialogs' server actions. Build the drawer generically — T12 reuses it with a different `context`.

## T11 · Rebuild the tournament page as an entry-grouped match table

- **status:** done
- **model:** opus
- **needs:** T8, T9
- **files:** src/components/dashboard/schedule/tournament-detail.tsx, src/app/dashboard/team/schedule/[eventId]/page.tsx, src/lib/data/schedule-server.ts (`MATCH_COLUMNS` :42), src/lib/schedule/types.ts (`EntryMatch` :89), src/components/dashboard/schedule/team-totals-widget.tsx (delete), tests/fixtures/schedule-tournament-outcomes-data.ts, tests/fixtures/schedule-tournament-outcomes-harness.tsx, tests/schedule-tournament-outcomes.spec.ts (guess)
- **done when:**
  - [ ] `EntryMatch` gains an optional `date?: string | null`, and `schedule-server.ts`'s `MATCH_COLUMNS` selects `date` and maps it onto each match; the diff contains no file under `supabase/`.
  - [ ] `TournamentDetail` renders on `EventPageLayout` with a header of the event name and a subline built from `formatEventSpanWithYear`, `siteTitle`, `event.host` (omitted when null), `surfaceTitle` and "<n> entries"; strip cells "Record" ("W–L" + "across N matches"), "Deepest run", "First serve in" (`totals.ours.firstServeInPct` + "vs <theirs>", or "—" when `totals` is null) and "Reports" ("<ready> of <N>" + "ready"); with `canEdit`, ghost "Edit tournament" and primary "Add result" to `/dashboard/team/schedule/<id>/score`.
  - [ ] The column headers are exactly `["Date","Round","Opponent","Result","Score","Analysis"]` on `56px | 40px | minmax(150px,240px) | 52px | 140px | minmax(96px,1fr)` with no Player column; each entry has a group head with avatar, name, draw text (e.g. "Main draw · Seed 3") and a right-aligned record + finish; an entry with no matches still shows its head with "No matches yet"; the existing spec assertion `span.mono` → `["Q1","R16","QF"]` still holds; the pills read "All matches · Main draw · Qualifying · Needs video" and "Qualifying" leaves only rows whose `drawOfRound` is qualifying in the spec; the footer reads "<n> matches · <n> entries · <format>".
  - [ ] `team-totals-widget.tsx` is deleted (its only consumer was `tournament-detail.tsx`); `SchoolsFaced` and every `rail=`/`detail=`/`LineRow`/`TableCard` use are gone from `tournament-detail.tsx`; `page.tsx` passes `searchParams.match` as the tournament's initial selection; the spec's row-level "Edit result"/"View report" link assertions are removed with a comment that T12 re-asserts them in the drawer, and the outcome words (Defaulted/Withdrawn, Won/Lost) are asserted against the new rows.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-tournament-outcomes.spec.ts tests/tournament-run.spec.ts tests/event-team-totals.spec.ts tests/event-table.spec.ts tests/schedule-dual-outcomes.spec.ts tests/team-home-schedule-reads.spec.ts tests/schedule-outcome-loader.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frame: `TournamentDrawer.dc.html` (table half). `date?` is optional so existing fixtures (`src/lib/schedule/fixtures.ts`, the harness data) compile unchanged; an outcome-only row has no match date — render "—". Reuse `groupResultRowsByDraw`, `runSubline`/`runFinish`, `runRecord`, `nextRound`. The per-entry "Add result"/"Add first result" (next round) that sat in the old `GroupHead` moves into T12's drawer. Link the entry name to `/dashboard/team/roster/[playerId]` only when the id resolves to a roster player — `playerUserIds` may hold auth uids (see `page.tsx`'s viewer comment); leave it unlinked otherwise. `page.tsx` is also T9's, hence `needs: T9`.

## T12 · Tournament match drawer with the player's run

- **status:** done
- **model:** opus
- **needs:** T10, T11
- **files:** src/components/dashboard/schedule/tournament-detail.tsx, src/components/dashboard/schedule/event-line-drawer.tsx, tests/fixtures/schedule-tournament-outcomes-harness.tsx, tests/schedule-tournament-outcomes.spec.ts (guess)
- **done when:**
  - [ ] Clicking the R16 row opens `event-line-drawer`'s dialog with the "Match <n> / <N>" counter; its title link and footer "View match" both point to `/dashboard/matches/played-r16`, its facts contain "<event name> · R16", and opening the harness at `?match=played-r16` shows the drawer open on load.
  - [ ] The context section shows the eyebrow "<player>'s run" with "Seed <n> · W–L" on the right and that entry's rows (outcome-only rounds included) in the table's round order, the open row carrying `aria-current="true"`.
  - [ ] On the outcome-only rows Q1 and QF the drawer shows no "Snapshot" and a primary "Edit result" with `href` `/dashboard/team/schedule/tournament-outcomes/score?entry=tournament-entry&round=<round>`; with `canEdit` every row's drawer also shows "Add result" to `scoreHref(eventId, entry.id, nextRound(entry))`; `window.actionCalls` stays `[]` (nothing is scored in place).
  - [ ] With `canEdit={false}` (harness `?viewer=player`) the drawer shows no ⋯ and no "Add result"/"Edit result", and still shows "View match" on R16.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-tournament-outcomes.spec.ts tests/schedule-dual-outcomes.spec.ts tests/event-table.spec.ts tests/drawer-sections.spec.ts tests/tournament-run.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frame: `TournamentDrawer.dc.html` (drawer half). Reuse T10's `event-line-drawer.tsx`, changing only its `kind` ("Match") and `context`. Row keys are those `groupResultRowsByDraw` already builds (`match-<id>` / `outcome-<id>`); use them for `?match=` so an outcome-only row is selectable. The harness needs the same supabase-client alias T10 added.

## T13 · Remove the old event-page pieces and update the schedule README

- **status:** done
- **model:** opus
- **needs:** T10, T12
- **files:** src/components/dashboard/schedule/line-row.tsx (delete), src/components/dashboard/schedule/event-page.tsx, src/components/dashboard/schedule/dual-ticks.tsx, src/components/dashboard/schedule/run-strip.tsx, src/lib/schedule/score-seed.ts (receives `scoreHref`), src/components/dashboard/schedule/README.md (guess)
- **done when:**
  - [ ] `line-row.tsx` is deleted and `scoreHref` lives in `src/lib/schedule/score-seed.ts` (or `event-table.tsx`) and is imported from there; `grep -rn "schedule/line-row" src tests` returns nothing; `row-action.tsx` still exists (roster and player-profile render it).
  - [ ] For each of `EventPageFrame`, `EventTitle`, `EventFacts`, `FormatCapsule`, `DetailLine`, `TableCard`, `GroupHead`, `TABLE_ROW_CLS` in `event-page.tsx`, either the export is deleted or `grep -rn "<Name" src` shows a renderer outside the file; the file itself is deleted if nothing remains. `RunStrip` is deleted if it has no renderer. `dual-ticks.tsx` drops its `lg` size (`static/event-drawer.tsx` still renders `sm`); `event-glyph-row.tsx` is kept for the rail drawer.
  - [ ] `src/components/dashboard/schedule/README.md` §1's `[eventId]` route row names `dual-detail.tsx`/`tournament-detail.tsx` on `event-table.tsx`, with `event-line-drawer.tsx` as the drawer and `?line=`/`?match=` as the selection params, its Reads cell staying `getProgramSchedule` → `eventDetailFrom` + `getEventTeamTotals` for a tournament; §3's live-file list drops every deleted file (`team-totals-widget.tsx`, `line-row.tsx`, anything else removed above) and adds the new ones; the "Scoring has one path" sentence says the Add result / Edit result links now sit in the event pages' drawer.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/schedule-drawer-actions.spec.ts tests/schedule-drawer-outcomes.spec.ts tests/schedule-static-copy.spec.ts tests/schedule-score-flow-outcomes.spec.ts tests/forfeited-lines.spec.ts tests/tournament-run.spec.ts tests/event-team-totals.spec.ts tests/event-table.spec.ts tests/drawer-sections.spec.ts tests/dual-primary-action.spec.ts` passes.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Frames: all four in `docs/superpowers/specs/2026-09-23-event-pages-match-table/`, only to confirm nothing they draw depends on a deleted file. Guardrails §3.5: never leave a dead near-duplicate. Check reachability with the README's §5 two-grep recipe, not by name. Update `tests/forfeited-lines.spec.ts:70,189`'s comments that name `line-row`.

## T14 · Set the event-table footer 16px off the card, on the cell x

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/schedule/event-table.tsx (guess; the only file — `EventPageLayout` and `EventTableFooter` are shared by `dual-detail.tsx` and `tournament-detail.tsx`, which need no change)
- **done when:**
  - [ ] In `EventPageLayout` (`event-table.tsx:70-79`) the wrapper around `{table}{footer}` reads `className="flex flex-col gap-4"` — the `gap-2.5` is gone — and the docblock above it (`:47-52`) says the footer sits 16px under the card, not 10px.
  - [ ] `EventTableFooter`'s root div (`:~418`) has class `px-6` in addition to `text-micro flex items-center justify-between gap-4`, so the caption's left edge lands on the card's cell x (the card is `surface-card px-6`; rows inset `-mx-4 px-4` back to that x); no other class on the footer or its children changes.
  - [ ] No `gap-2.5` remains anywhere in `EventPageLayout` (`grep -n "gap-2.5" event-table.tsx` returns only `EventGroupHead`'s `gap-2.5` at `:~330`).
  - [ ] `npm run lint && npm run typecheck` pass; `npx playwright test tests/design-drift.spec.ts tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/event-table.spec.ts` pass — both existing footer-text assertions (`"Singles best of 3, no-ad · Doubles one set to 6, no-ad"` at `schedule-dual-outcomes.spec.ts:317`, `"3 matches · 2 entries · Best of 3 sets, no-ad scoring"` at `schedule-tournament-outcomes.spec.ts:235`) still pass unchanged.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. `gap-4` (16px, "Medium-large") is on the Standard Gap Scale in `reference/foundations.md:192-205`; do not invent `gap-[Npx]`. The `px-6` puts the footer text under the first column's text rather than under the card edge. Both event pages inherit this — nothing to touch in `dual-detail.tsx` / `tournament-detail.tsx`.

## T15 · Drop the W–L tally from the dual's Singles/Doubles heads

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/schedule/dual-detail.tsx, tests/schedule-dual-outcomes.spec.ts (guess; seams verified)
- **done when:**
  - [ ] `dual-detail.tsx:355` renders `<EventGroupHead label="Singles" first />` and `:361-366` renders `<EventGroupHead label="Doubles" trailing={teamPointNote(doubles)} first={…} />` — neither passes `value`; no other caller of `EventGroupHead` in `src/` passes a W–L string (`tests/fixtures/event-table-harness.tsx:171` keeps its `value="1–1"`, it exercises the kit, not the dual).
  - [ ] The `tally()` function (`dual-detail.tsx:~752-755`) and its docblock are deleted; `groupRecord()` and `teamPointNote()` (`:741-767`) stay unchanged because "point ours" / "point theirs" still draws beside Doubles.
  - [ ] `tests/schedule-dual-outcomes.spec.ts:295-302` no longer expects `"3–3"` or `"2–1"`: the Singles head assertion becomes `await expect(singlesHead.locator("..")).toHaveText("Singles")` (or an equivalent `not.toContainText("3–3")` plus the exact-text check) and the Doubles head asserts `toContainText("point ours")` and `not.toContainText("2–1")`.
  - [ ] `EventGroupHead` itself (`event-table.tsx`) keeps its `value` prop and signature — the tournament page and the harness are untouched; `git diff --stat` shows only the two files above.
  - [ ] `npm run lint && npm run typecheck` pass; `npx playwright test tests/design-drift.spec.ts tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/event-table.spec.ts` pass.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. The author asked to remove "the 1-0 text next to singles and doubles" — that is the `value` (`tally()` → "4–2"). The doubles `trailing` ("point ours" / "point theirs", `teamPointNote`) says who took the one ITA doubles point; this task KEEPS it. The tournament page's entry heads carry their own record + finish ("Seed 3 · 1–0") — a different element, and it stays.

## T16 · Event header subline as icon facts in the match-metadata register

- **status:** done
- **model:** opus
- **needs:** T14
- **files:** src/components/dashboard/schedule/event-table.tsx, src/components/dashboard/schedule/dual-detail.tsx, src/components/dashboard/schedule/tournament-detail.tsx, tests/schedule-dual-outcomes.spec.ts, tests/schedule-tournament-outcomes.spec.ts (guess; seams verified)
- **done when:**
  - [ ] `event-table.tsx` exports a new `EventFact({ icon, tabular?, children })` that mirrors `src/components/dashboard/matches/match-metadata-row.tsx:26-36` exactly: root `<span className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap">`, the icon slot expecting a 13px glyph (lucide icons are passed with `className="size-[13px] text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true"`; the court glyph is `<Image src="/icons/tennis-court-icon.svg" width={13} height={13} alt="" aria-hidden="true" />`), and the text in `<span className="text-micro">` (plus `tabular` when `tabular` is true). `EventHeader`'s subline container (`:121-140`) becomes `className="flex flex-wrap items-center gap-[14px]"` with no `style={{ color }}`, no `text-[12px]`, and the `·` separator `<span aria-hidden>` is deleted; its docblock (`:88-91`) and the `subline` prop comment now describe icon facts, not dot-joined parts.
  - [ ] `dual-detail.tsx:238-249` passes the same four facts in the same order, each wrapped in `EventFact`: `Calendar` (tabular) with the existing `formatEventDatesLong(...)` + optional ` · ${formatEventTime(...)}` string; `MapPin` with `siteTitle(event.site)`; the court `Image` with `surfaceTitle(event.surface)` (still dropped when there is no surface); `Trophy` with `conference` (dropped when empty). `tournament-detail.tsx:238-244` passes its five facts in order: `Calendar` (tabular) `formatEventSpanWithYear(...)`, `MapPin` `siteTitle(event.site)`, `GraduationCap` `event.host` (dropped when empty), court `Image` + `surfaceTitle` (dropped when empty), `Users` + `plural(entries.length, "entry", "entries")`. All icons come from `lucide-react` except the court SVG.
  - [ ] `tests/schedule-dual-outcomes.spec.ts:190-194` keeps its four `getByText` checks (`"Thu, Sep 10"`, `"Home"`, `"Hard"`, `"Big Ten"`) and adds, scoped to `header`: `locator("svg.lucide-calendar")` count 1, `locator("svg.lucide-map-pin")` count 1, `locator('img[src="/icons/tennis-court-icon.svg"]')` count 1, `locator("svg.lucide-trophy")` count 1, and `getByText("·", { exact: true })` count 0. `tests/schedule-tournament-outcomes.spec.ts:189` keeps `"2 entries"` and adds, scoped to the h1's header block, `svg.lucide-calendar`, `svg.lucide-map-pin`, `svg.lucide-users` each count 1 and `getByText("·", { exact: true })` count 0.
  - [ ] `EventGlyphRow` (`src/components/dashboard/schedule/event-glyph-row.tsx`) and `MatchMetadataRow` are not modified; `grep -rn "text-\[12px\]" src/components/dashboard/schedule/event-table.tsx` returns only `EventGroupHead`'s value span (or nothing) — the header no longer carries it.
  - [ ] `npm run lint && npm run typecheck` pass; `npx playwright test tests/design-drift.spec.ts tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/event-table.spec.ts` pass.
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Register: the Matches card/Home "match metadata" row, `src/components/dashboard/matches/match-metadata-row.tsx` (13px lucide at `--ink-400`, `text-micro` 11px ink-500 labels, 5px inside a pair, 14px between pairs) — what the codebase calls match metadata, and the register the Glyph Registry prescribes for "Fixture/event metadata" (`.skills/advantage-analytics-design/reference/chrome.md:316`). Its props are fixed (date/matchType/courtType/verification), so mirror its classes in `EventFact` rather than import it. Do NOT copy the match-detail hero's `MatchReportFacts` (`match-detail/report-facts.tsx`, ink-700) — that is the report-pane register. `EventGlyphRow` (schedule drawer only) is a near-twin at 12px/gap-3; leave it. Icons the registry does not name are guesses — `Trophy` for conference, `GraduationCap` for a tournament's host, `Users` for entries; swap freely within Lucide. lucide-react stamps `lucide-<name>` classes on its SVGs, which the spec selectors rely on. The date fact keeps its inner ` · 3:00 PM` — one fact, as `EventGlyphRow` draws it.

## T17 · Event name on the Schedule list links straight to the event page

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/static/schedule-table.tsx (`EventRow` ~line 112), tests/schedule-drawer-actions.spec.ts, tests/fixtures/schedule-drawer-actions-harness.tsx (guess; pattern to copy is `src/components/dashboard/team/roster-table.tsx:392-563`)
- **done when:**
  - [ ] In `EventRow` the event name is a `next/link` to `/dashboard/team/schedule/<row.id>`. It uses the roster name link's classes (`block truncate rounded-[var(--radius-cell)] text-[13px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`) and has `onClick={(e) => e.stopPropagation()}`.
  - [ ] The row is no longer a `<button>`, because a link can't sit inside one. Like the roster row, it keeps `id={scheduleRowId(row.id)}` and `tabIndex={0}`, exposes its selected state (e.g. `aria-current`), and opens the drawer on Enter/Space only when `event.target === event.currentTarget`.
  - [ ] A Playwright spec on the schedule harness asserts the name link's `href`, asserts that clicking the date cell still opens the drawer, and asserts that clicking the name link (with navigation intercepted) does not open the drawer.
  - [ ] The same spec asserts that ⌘/Ctrl-clicking the row (not the link) records `/dashboard/team/schedule/<id>` in `window.routerPushes`, as `roster-table.tsx:427-430` does.
- **notes:** How Roster does it: the row is a `Reorder.Item` `li` whose `onClick` opens the drawer, or runs `router.push(href)` on ⌘/Ctrl. The name is a `Link` that stops propagation. The schedule row is currently `<button aria-pressed>` (`schedule-table.tsx:126-139`), so the row element has to change before the name can become a link. Existing specs find rows by `getByRole("button", { name: /Long Open Dual/ })` (`tests/schedule-drawer-actions.spec.ts:101` and others), so update those locators. The row-click law (`.skills/advantage-analytics-design/reference/tables.md:83-101`) still holds: the row opens the drawer, and the name is a shortcut, as on Roster.

## T18 · "Add your player" in our doubles pair picker

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/static/lineup-rows.tsx (`PairPicker` ~line 359, `DoublesLineup` ~line 692), src/components/dashboard/schedule/static/lineup-name-picker.tsx (`ADD_ROW_LABEL` :50, `addTypedPlayer` :298), src/components/dashboard/schedule/static/dual-build-step.tsx (`onAddPlayer` :1057), tests/fixtures/roster-actions-browser-mock.ts, tests/schedule-doubles-picker.spec.ts (guess)
- **done when:**
  - [ ] Our "Pair for D<n>" menu offers a "Don't see your player? Add your player" row. It uses the singles picker's `ADD_ROW_LABEL` text, not a retyped copy. The row is not offered while the pair already has two players or the line is locked.
  - [ ] Typing a one-word name shows "Type a first and last name to add a player." and does not call `addProgramPlayer`. When the server refuses the add, its error shows and the line's `ourIds`/`ourLabels` stay unchanged.
  - [ ] When the add succeeds, the new player's `profileId` and name join that line's `ourIds`/`ourLabels` next to any partner already picked. The player also appears in every other doubles and singles picker's roster, through the same `added` list that `DualLineupStep.onAddPlayer` keeps.
  - [ ] `tests/schedule-doubles-picker.spec.ts` covers all three cases, and `roster-actions-browser-mock.ts` can return a success (e.g. a window flag that sets `profileId`).
- **notes:** Singles already does this through `LineupNamePicker` → `addProgramPlayer` (`lineup-name-picker.tsx:298-343`). `DoublesLineup` receives `onAddPlayer` in its props but never passes it to `PairPicker` (`lineup-rows.tsx:737-745`). Our side has real roster ids, so use `onOurSelection` with ids rather than the label path. `OpponentPairPicker`'s in-place "Add a player" field (`lineup-rows.tsx:~1000-1025`) is the layout model. The rule of one doubles line per player still applies (`pairedOn`). T18 comes before T19 in file order and both edit `DoublesLineup`, so keep that order.

## T19 · Drag whole doubles pairs between D1–D3

- **status:** done
- **model:** opus
- **files:** src/lib/schedule/singles-order.ts (or new src/lib/schedule/doubles-order.ts), src/components/dashboard/schedule/static/lineup-rows.tsx (`DoublesLineup`; reuse `ReorderableSingles`/`PlayerItem` grip + keyboard), src/components/dashboard/schedule/static/dual-build-step.tsx (`setSinglesOrder` :699, `DualLineupStep` props), src/components/dashboard/schedule/static/new-dual-flow.tsx (:595), tests/singles-order.spec.ts, tests/schedule-doubles-picker.spec.ts, tests/fixtures/schedule-doubles-picker-harness.tsx (guess)
- **done when:**
  - [ ] A pure `applyDoublesOrder(lines, order, locked)` does four things, each covered by a spec:
    - It moves only `ourIds`/`ourLabels` between doubles lines, in the given order.
    - It clears `noPlayer` on a court that receives a non-empty pair, as `applySinglesOrder` does.
    - It leaves each line's `theirLabels`/`theirNoPlayer` and every singles line unchanged.
    - It returns the lines unchanged when any doubles line is locked.
  - [ ] Each unlocked doubles row has a grip button labelled `Move <A / B>, line D<n>`. A Playwright spec focuses D1's grip and presses Space, ArrowDown ×2, Space. It asserts that D1's pair ends on D3 and the others shift up like singles (D2's pair on D1, D3's pair on D2), and every line's opponent labels are unchanged (read from the harness's "Lineup state").
  - [ ] Pressing Escape after a lift and before the drop leaves "Lineup state" exactly as it was.
  - [ ] With a settled doubles line (`?locked` fixture / `lockedByKey`), no doubles grip renders.
- **notes:** Scope: a drag moves the whole pair between courts, the way singles moves the player on a line and not the court (`lineup-rows.tsx:15-27`, `singles-order.ts:1-17`). The opponent stays with the court. There is no doubles bench. Reuse the singles gesture: `Reorder.Group`, a grip-only `dragListener={false}` with `useDragControls`, and Space/↑↓/Space/Esc. Update the file header's "Doubles are picked, not typed" section.

## T20 · Drafts know the match they fill, and fold onto it

- **status:** done
- **model:** opus
- **files:** src/lib/wizard/actions.ts (`saveMatchDraft` :586, `DraftRow` :686, `listMatchDrafts` :697), src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (`existingMatchId` :961, `handleCreateMatch` :2613), src/lib/wizard/draft-target.ts (new), tests/upload-draft-resume.spec.ts (guess)
- **done when:**
  - [ ] One exported pure helper, `draftTargetMatchId(draft)`, returns `preset?.matchId ?? attachedLine?.matchId ?? null`. The wizard's `existingMatchId` (:961) and the match-id reuse in `handleCreateMatch` (:2613-2615) both call it. A spec covers three cases: the id comes from `preset`, from `attachedLine`, or from neither.
  - [ ] `DraftRow` gains `matchId: string | null`. `listMatchDrafts` fills it from the stored payload by the same rule, using a JSON-path select rather than reading the whole payload. A spec asserts that a draft saved from a `?entry=E&match=M` preset lists with `matchId === "M"`.
  - [ ] A pure `foldDrafts(drafts, matchIds)` returns `{ standalone, byMatchId }`. Only each listed match's newest draft goes into `byMatchId`. Everything else stays in `standalone`: a draft whose match isn't listed, a draft with no match, and an older draft for a match that already has one folded. A spec covers each case.
  - [ ] A spec pins that no duplicate match is created: `saveMatchDraft` writes only to `match_drafts`, and a resumed preset draft goes down the update branch with the draft's `matchId`.
- **notes:** This is a regression pin plus the data half of the fix, with no migration; the evidence is in the diagnosis. Older drafts for the same match stay standalone so they can still be discarded. Out of scope, possible follow-up: starting "Add video" again from the drawer creates a new draft rather than resuming the existing one.

## T21 · A match row with a video draft shows Draft and Continue upload

- **status:** done
- **model:** opus
- **needs:** T20
- **files:** src/components/dashboard/matches/matches-page-content.tsx (drafts :415-662), src/components/dashboard/matches/match-card-list.tsx, src/components/dashboard/matches/match-drawer.tsx, src/components/dashboard/matches/draft-row.tsx (`draftHref` :36), tests/fixtures/matches-drafts-harness.tsx (new), tests/matches-drafts.spec.ts (new) (guess)
- **done when:**
  - [ ] `MatchesPageContent` renders `DraftRow`s only for `foldDrafts(...).standalone`. In a harness with one scored match M and one draft targeting M, that match gets exactly one row, not two.
  - [ ] That match row shows a grey outlined `StatePill` reading "Draft" beside its name, in the same variant `draft-row.tsx:119` uses.
  - [ ] That match's drawer footer has a "Continue upload" primary that links to `draftHref(draft.id, scope)`, and the ghost "Open match" button is still there. A match without a folded draft gets no such primary.
  - [ ] Drawer stepping (↑/↓) goes through standalone drafts, then matches, and no longer stops on the folded draft by itself.
- **notes:** This is the author's intent 3 ("it saves as two separate matches"). It follows the table laws: Draft is one of the allowed grey state pills (`tables.md` rule 4), and the match drawer's footer gets one primary only when an action applies. The Matches page has no harness yet, so this task builds a new Playwright harness; `tests/fixtures/match-drawer-deps-browser-mock.tsx` already exists for the drawer's dependencies.

## T22 · The event drawer shows the played match's own facts

- **status:** done
- **model:** opus
- **files:** src/lib/schedule/types.ts (`EntryMatch` :89), src/lib/data/schedule-server.ts (`MATCH_COLUMNS` :42, the `EntryMatch` mapping ~:252), src/components/dashboard/matches/drawer-sections.tsx, src/components/dashboard/matches/match-drawer.tsx (Provider fact :249-288), src/components/dashboard/schedule/event-line-drawer.tsx (facts `<dl>` :284-313), tests/fixtures/schedule-dual-outcomes-data.ts, tests/fixtures/schedule-tournament-outcomes-data.ts, tests/schedule-dual-outcomes.spec.ts, tests/schedule-tournament-outcomes.spec.ts (guess; line refs verified)
- **done when:**
  - [ ] `EntryMatch` gains optional `duration?: string | null`, `sourceProvider?: string | null`, `jobId?: string | null` and `failNote?: string | null`. `MATCH_COLUMNS` adds `duration`; the loader maps `duration` through the same formatter `transformDbMatch` uses (`src/lib/data/matches-list-types.ts:123`), maps `source_provider` (already selected, currently dropped) onto `sourceProvider`, and takes `jobId`/`failNote` from the `analysisLoader` map entry. No file under `supabase/` is in the diff.
  - [ ] `drawer-sections.tsx` exports `ProviderFact({ providerId })` — the "Provider" `DrawerFact` with its splitstep / swing-vision / logo icon branches moved verbatim from `match-drawer.tsx:249-288`, returning null for an id `providers` doesn't hold. `match-drawer.tsx` renders `<ProviderFact>` and no longer contains the string `/providers/swingvision-icon.png`. `MatchDrawer`'s props are unchanged.
  - [ ] For a line with a played match, `EventLineDrawer`'s facts run in the Matches drawer's order: Date, Court, Home/Away, Event, Duration (only when set), Provider (only when set), then Format last. Date reads the match's own day through the formatter `MatchDrawer` uses (`formatShortDate`) when `played.date` is set, else the event's dates. A line with no match keeps the event dates and draws neither Duration nor Provider.
  - [ ] `tests/schedule-tournament-outcomes.spec.ts`: the R16 drawer's Date fact shows the R16 fixture match's day, not the tournament span. `tests/schedule-dual-outcomes.spec.ts`: a singles fixture match given `duration` and `sourceProvider: "swing-vision"` shows its formatted duration and that provider's `name` from `providers`; NORMAL S1 (no match) shows no "Duration" or "Provider" fact and no link to `/dashboard/matches/`.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/drawer-sections.spec.ts tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/schedule-drawer-outcomes.spec.ts tests/schedule-outcome-loader.spec.ts tests/team-home-schedule-reads.spec.ts` passes.
- **notes:** Intent: "Drawer should be of match information like the matches route drawer". Traced: `/dashboard/team/schedule/[eventId]` → `page.tsx` → `dual-detail.tsx` / `tournament-detail.tsx` → `schedule/event-line-drawer.tsx`. T10/T12 already build that drawer from T7's `drawer-sections.tsx`; the remaining gap is that its facts come from the EVENT (event dates, no duration, no provider) where `MatchDrawer`'s come from the match. Keep the `context` list ("This dual" / "<player>'s run") — it does the Matches drawer's "Schedule" record row's job. Court stays `event.surface` (don't widen `EntryMatch` for a court type). A line with no match yet is unchanged: plain `h2` title + outcome chip, event dates, no snapshot, footer from `lineAction`. Doubles keep the grey score-only strip. Read `.skills/advantage-analytics-design/SKILL.md` and `reference/tables.md` § Peek Drawer "Match body" first.

## T23 · The event drawer's failed analysis and footer follow the Matches drawer

- **status:** done
- **model:** opus
- **needs:** T22
- **files:** src/components/dashboard/schedule/event-line-drawer.tsx (footer :221-258, `AnalysisNotice` :333), src/components/dashboard/matches/match-drawer.tsx (`RetryButton` :457), src/components/dashboard/matches/drawer-sections.tsx, tests/fixtures/schedule-dual-outcomes-data.ts, tests/schedule-dual-outcomes.spec.ts, tests/schedule-tournament-outcomes.spec.ts (guess)
- **done when:**
  - [ ] `RetryButton` is defined once (exported from `drawer-sections.tsx` or `match-drawer.tsx`) and both drawers render that one definition. For a played line whose `status` is `"failed"`, `EventLineDrawer` passes `failNote={played.failNote}` and `canRetry={canEdit && Boolean(played.jobId)}` to `AnalysisNotice`, and renders `RetryButton` in the footer under the same condition.
  - [ ] The footer follows `MatchDrawer`'s `continueHref` rule: with a played match and no follow-up, "View match" is the only footer control and uses `advButton("primary", "md")`; when a follow-up applies (the singles "Add video", the tournament's next-round "Add result", or Retry) that follow-up is the one primary and "View match" drops to `advButton("ghost", "md")`. No drawer state renders two primaries.
  - [ ] Dual harness spec: a singles fixture line with a failed match and a `failNote` shows the note inside the drawer's `role="alert"` and a "Retry" button for the coach viewer; under `?viewer=player` it shows neither and still shows "View match". A scored singles line without video shows "Add video" as the primary and "View match" not primary. Opening S1–D3 in turn, no footer holds more than one element carrying the primary variant's background class (read the exact class from `src/lib/ui/adv-button.ts` ~:60).
  - [ ] Tournament harness spec: with `canEdit`, the R16 drawer shows the next-round "Add result" as the primary and "View match" as ghost; `window.actionCalls` stays `[]`.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts tests/drawer-sections.spec.ts tests/matches-drafts.spec.ts tests/schedule-drawer-actions.spec.ts` passes.
- **notes:** Author's ruling (2026-09-23): follow the shipped `MatchDrawer` ("View match" primary, ghost when a follow-up takes the primary), not `tables.md`'s always-ghost "Open match" — this also settles T21 follow-up 1. Retry POSTs `/api/splitstep/jobs/<jobId>/resubmit`; the harness needs a `fetch` stub, or assert presence only. `EntryMatch` has no uploader field, so gate on `canEdit` and let the server refuse anyone else (T10's precedent). Doubles lines keep "Edit result"/"Add result" as their one primary.

## T24 · Tournament table tracks: Matches' Date/Result widths, no crushed columns beside the drawer

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/tournament-detail.tsx (`GRID` :79, `EntryHead` :520, `MatchTableRow` :628), src/components/dashboard/schedule/event-table.tsx (`EventTable` :345), src/components/dashboard/matches/match-list-layout.ts (`RESULT_COL` :22), tests/schedule-tournament-outcomes.spec.ts (guess)
- **done when:**
  - [ ] The tournament `GRID`'s Date track is `DATE_COL` and its Result track is `RESULT_COL`, both imported from `matches/match-list-layout.ts` (`RESULT_COL` newly exported; the Matches grids keep using it), so they are the Matches table's 72px/60px; `56px`/`52px` no longer appear in `tournament-detail.tsx`. The docblock above `GRID` states why each track has its width.
  - [ ] `EventTable` takes an optional min-inner-width class and, when given, wraps the header row and rows in one `overflow-x-auto` region carrying it. The tournament passes a width at least the sum of its tracks' minimums plus five 16px gaps. The dual page passes none, so its markup is unchanged and `tests/schedule-dual-outcomes.spec.ts` passes untouched.
  - [ ] A spec in `tests/schedule-tournament-outcomes.spec.ts` at viewport 1280×800, run once with the R16 drawer closed and once open, asserts: every `columnheader` has `scrollWidth <= clientWidth` (no clipped heading, "Round" included); every row's Score cell left x equals the "Score" header's left x within 1px; the "Date" header's width is 72±1px in both states.
  - [ ] Column headers stay exactly `["Date","Round","Opponent","Result","Score","Analysis"]`; the existing `span.mono` → `["Q1","R16","QF"]` assertion still holds; no Round cell overflows (`scrollWidth <= clientWidth`).
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-tournament-outcomes.spec.ts tests/schedule-dual-outcomes.spec.ts tests/event-table.spec.ts` passes.
- **notes:** Apply /impeccable layout: read `/Users/cjgimena/.claude/skills/impeccable/reference/layout.md`, run its scan (`/Users/cjgimena/.claude/skills/impeccable/scripts/impeccable detect --json --scope layout src/components/dashboard/schedule/tournament-detail.tsx`), and write the spatial thesis into the `GRID` docblock. The DS binds over taste: `tables.md` rule 1 — Date leads at 72px, Result sized to its widest content (60px, not the clipping 52px). Commit `d233f439` deliberately made Opponent and Analysis share spare width as `1fr` to match the Matches team grid; keep that unless the layout pass argues otherwise. `tables.md`'s "exactly one fluid cell" line is contradicted by the shipped team Matches grid, so it is not a criterion. `EntryHead`'s right cluster (W–L, finish) is the layout pass's call. The dual page's 52px Result has the same clipping risk — separate follow-up.

## T25 · One skeleton primitive family, a guard spec, and the DS/Carbon rules written down

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/loading/pending.tsx, src/components/dashboard/loading/page-skeletons.tsx, src/components/ui/skeleton.tsx (delete), .skills/advantage-analytics-design/reference/empty-and-loading.md, tests/skeleton-primitives.spec.ts (new) (guess)
- **done when:**
  - [ ] `pending.tsx` exports `PendingBar`, `PendingRegion` and a new `PendingFrame` — the page-level wrapper now inlined as `Frame` in `page-skeletons.tsx`: `role="status"`, `aria-label`, `w-full flex-1 bg-[var(--surface-card)]`, and an `aria-hidden` inner carrying `motion-safe:animate-pulse`. `page-skeletons.tsx` defines no `Bar` or `Frame` of its own, builds on these, and its export names are unchanged, so every `loading.tsx` still resolves.
  - [ ] `src/components/ui/skeleton.tsx` is deleted and `grep -rn "ui/skeleton" src` returns nothing.
  - [ ] `tests/skeleton-primitives.spec.ts` scans `src/**/*.{ts,tsx}` and asserts: `--surface-skeleton` appears only in `pending.tsx`, `src/styles/design-system/colors.css` and a `LEGACY` array listing exactly the files that still carry it at this commit; every `animate-pulse` is written `motion-safe:animate-pulse` outside `LEGACY` files; no `animate-spin` appears in `src/components/dashboard/loading/**` or any `src/app/**/loading.tsx`, except `page-skeletons.tsx` while it holds `SimplePageLoader` (listed with a comment naming T34).
  - [ ] `empty-and-loading.md` § Loading Skeleton no longer shows `bg-[#F0F0F0] rounded animate-pulse`; it names the three primitives in `pending.tsx`, the `--surface-skeleton` token and `motion-safe:animate-pulse`, and adds a short "Carbon and this system" list: skeletons for container and page loads, mirroring the loaded layout, known chrome rendered as real text; the spinner only for blocking actions and inline button states; pulse, where Carbon shimmers; a token, never hex; one `role="status"` per region.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/skeleton-primitives.spec.ts tests/match-report-pending.spec.ts tests/team-loading.spec.ts tests/home-empty-loading.spec.ts tests/event-route-loading.spec.ts` passes.
- **notes:** Routing rule said fable (cross-cutting; defines the grammar every other skeleton task depends on); the author chose opus while Fable is at its limit. Carbon loading pattern: https://carbondesignsystem.com/patterns/loading-pattern/. The DS outranks it (`.skills/advantage-analytics-design/SKILL.md` precedence; `.claude/skills/widget-states/SKILL.md`). They agree: skeletons for containers and page loads, mirroring final structure, showing what is known, never a skeleton for empty ("A skeleton is a promise"). Where they differ the DS wins: pulse not shimmer, the `--surface-skeleton` token not the stale `#F0F0F0`, no spinner inside a card. Today there are three competing primitive sets: `ui/skeleton.tsx` (unused), `page-skeletons.tsx`'s local `Bar`/`Frame`, and `pending.tsx`. T26–T34 each remove their files from `LEGACY`. Behaviour-neutral: move, don't restyle.

## T26 · The Add result page's skeleton mirrors the score flow

- **status:** done
- **model:** opus
- **needs:** T25
- **files:** src/components/dashboard/loading/score-flow-pending.tsx (new), src/app/dashboard/team/schedule/[eventId]/score/loading.tsx, src/components/dashboard/schedule/score-only-flow.tsx (export the title copy; `CONTENT_CLS` :76), tests/score-flow-pending.spec.ts (new) (guess)
- **done when:**
  - [ ] `src/app/dashboard/team/schedule/[eventId]/score/loading.tsx` default-exports `ScoreFlowPending` and no longer references `WizardPageSkeleton`.
  - [ ] `ScoreFlowPending` mirrors `ScoreOnlyFlow` top to bottom: the real `StepIndicator currentStep={0} totalSteps={1}`; a row with `PinnedLineBar`'s classes (`h-9 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]`) holding bars where the event link and "player vs opponent" sit; the `CONTENT_CLS` column at `pt-16 pb-10` with an eyebrow bar, the real `<h1>` "The result." taken from a constant exported by `score-only-flow.tsx`, and a lede bar; bars in `ScoreBlock`'s geometry (two side rows of set cells); a hairline-topped `h-16` footer with bars where Cancel, the status slot and the primary sit.
  - [ ] `tests/score-flow-pending.spec.ts` renders it to static markup through `tests/fixtures/vm-modules`' `createLoader` (like `tests/match-report-pending.spec.ts`) and asserts: exactly one `role="status"`, labelled "Loading result form"; the markup contains "The result."; no `<button`, `<a ` or `<input`; no `#` hex colour; every element carrying `--surface-skeleton` sits under an `aria-hidden="true"` ancestor and carries `motion-safe:animate-pulse`.
  - [ ] It is built only on `PendingFrame`/`PendingBar`/`PendingRegion`, with no local bar component, so `tests/skeleton-primitives.spec.ts` passes without adding to `LEGACY`.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/score-flow-pending.spec.ts tests/skeleton-primitives.spec.ts tests/event-route-loading.spec.ts tests/schedule-score-flow-outcomes.spec.ts` passes.
- **notes:** "Add Result page" traced: the event pages' "Add result" (`src/lib/schedule/dual-primary-action.ts`, `event-line-drawer.tsx`) → `/dashboard/team/schedule/[eventId]/score` → `score/page.tsx` → `schedule/score-only-flow.tsx`. Today it loads with `WizardPageSkeleton` (four form rows, no pinned bar), so the page jumps when it lands. Precedent: `src/components/dashboard/loading/event-wizard-pending.tsx` — fixed copy renders as itself, only loaded parts pulse. Apply /impeccable layout (`/Users/cjgimena/.claude/skills/impeccable/reference/layout.md`). Carbon: https://carbondesignsystem.com/patterns/loading-pattern/. "Line n of N" and the dual-vs-tournament lede can't be known in `loading.tsx`, so they stay bars. The page's crumb reads "Add score" while entry points read "Add result" — not changed here.

## T27 · The upload wizard's skeleton mirrors its first step (team upload + new match)

- **status:** done
- **model:** opus
- **needs:** T25, T26
- **files:** src/components/dashboard/loading/upload-wizard-pending.tsx (new), src/app/dashboard/team/upload/loading.tsx, src/app/dashboard/matches/new/loading.tsx, src/components/dashboard/loading/page-skeletons.tsx (`WizardPageSkeleton` :184, delete), tests/upload-wizard-pending.spec.ts (new) (guess; the opening step is read from `useUploadMatchWizard.ts` / `wizard-view.ts` `STEP_CONFIG`)
- **done when:**
  - [ ] `UploadWizardPending({ pinned }: { pinned: boolean })` exists; `team/upload/loading.tsx` renders it with `pinned`, `matches/new/loading.tsx` without. `WizardPageSkeleton` is deleted and `grep -rn "WizardPageSkeleton" src` returns nothing.
  - [ ] It mirrors `UploadMatchFlow` on the step it opens on: the real `StepIndicator` with that step's index and the wizard's step count; the 36px pinned-bar row (`PinnedLineBar`'s classes) only when `pinned`; `WizardShell`'s `CONTENT_CLS` column at `pt-16` with that step's title and lede as real text from `STEP_CONFIG`; the step body as bars in that step component's layout; `WizardShell`'s 64px hairline-topped footer.
  - [ ] `tests/upload-wizard-pending.spec.ts` (static markup, `createLoader`) asserts the T26 contract for both variants (one `role="status"`, no `<button`/`<a `/`<input`, no hex, bars `aria-hidden` and `motion-safe:`), that the pinned variant contains the `h-9` `bg-[var(--surface-subtle)]` row and the unpinned one does not, and that both contain the step's title text.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/upload-wizard-pending.spec.ts tests/skeleton-primitives.spec.ts tests/match-video-wizard-route.spec.ts` passes.
- **notes:** "Upload it Instead page" traced: `score-only-flow.tsx:644` "Upload it instead", href from `uploadInsteadHref()` (`src/lib/schedule/score-seed.ts:256`) → `/dashboard/team/upload?entry=<id>` → `upload/page.tsx`'s `?entry=` branch (:170-217) → `UploadMatchFlow` with a preset. A `loading.tsx` cannot read `searchParams`, and `team/upload` serves four branches; the pinned wizard is what every in-app link lands on, so that is the shape to mirror. The bare staff queue list will briefly show the wizard shape — accepted. `needs: T26` only because T26 removes the score page's use of `WizardPageSkeleton` before this task deletes it. Apply /impeccable layout (`/Users/cjgimena/.claude/skills/impeccable/reference/layout.md`). Carbon: https://carbondesignsystem.com/patterns/loading-pattern/.

## T28 · The upload page on an event line shows the event's trail

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/schedule/event-header-slot.tsx, src/app/dashboard/team/upload/page.tsx (`?entry=` branch :170-217), tests/event-header-trail.spec.ts (new), tests/upload-page-trail.spec.ts (new) (guess)
- **done when:**
  - [ ] `event-header-slot.tsx` exports a pure `eventTrail({ eventId, name, kind, leaf })` returning the crumb array, and `EventHeaderSlot` renders from it. `tests/event-header-trail.spec.ts` asserts a dual with leaf "Upload video" gives `[{label:"Schedule",href:"/dashboard/team/schedule"},{label:"vs Stanford",href:"/dashboard/team/schedule/e1"},{label:"Upload video"}]`, a tournament's crumb is its bare name, and with no leaf the event crumb has no `href`.
  - [ ] The `?entry=` branch of `upload/page.tsx` returns `<EventHeaderSlot eventId={group.event.id} name={group.event.name} kind={group.event.kind} leaf="Upload video" />` beside `<UploadMatchFlow preset={preset} />`, composed as `score/page.tsx` does. The bare, `?draft=` and `?match=`-only branches publish no slot and keep the static "Upload video" crumb (`src/lib/dashboard/nav.ts:163` `UNLISTED`).
  - [ ] `tests/upload-page-trail.spec.ts` transpiles `upload/page.tsx` with mocked modules (the `tests/event-route-loading.spec.ts` pattern) and asserts a staff request with `?entry=` naming a singles entry in the mocked `getUploadQueue` returns a tree containing the mocked `EventHeaderSlot` with exactly those four props, while a bare staff request and a `?match=`-only request contain no `EventHeaderSlot`.
  - [ ] `src/app/dashboard/header.tsx` is not in the diff. `npm run lint && npm run typecheck` clean; `npm test -- tests/event-header-trail.spec.ts tests/upload-page-trail.spec.ts tests/schedule-leaf.spec.ts tests/event-route-loading.spec.ts tests/upload-eligibility.spec.ts` passes.
- **notes:** Today the header draws only "Upload video" for `/dashboard/team/upload`. The pages beside it under one event (`[eventId]`, `/edit`, `/score`) publish "Schedule › vs Stanford (› Leaf)" through `EventHeaderSlot` (`header-slot.tsx`). An upload aimed at an event line belongs with them: "Schedule › vs Stanford › Upload video" for a dual, "Schedule › <Tournament> › Upload video" for a tournament. The trail shows where the page sits, not how you got there — not "… › Add score › Upload video". `header.tsx`'s `EVENT_PAGE` comment forbids another render-time path check, so the static crumb shows for one frame before the slot lands; accept that. The single-match branch's trail is out of scope.

## T29 · Schedule event and single-match skeletons mirror their pages

- **status:** done
- **model:** opus
- **needs:** T25
- **files:** src/components/dashboard/loading/page-skeletons.tsx (`EventTableSkeleton` :132, `EventPageSkeleton` :98), src/app/dashboard/team/schedule/single/[matchId]/loading.tsx, src/components/dashboard/schedule/event-line-drawer.tsx (`SnapshotPending` :359), tests/schedule-skeletons.spec.ts (new), tests/skeleton-primitives.spec.ts (guess)
- **done when:**
  - [ ] `EventTableSkeleton` mirrors `event-table.tsx`'s `EventTable`: inside the `surface-card px-6` card, a header row carrying a hairline `border-b` with six label bars on a six-track grid, one group-head bar, then nine `h-12` rows with no border of their own. `not-last:border-b` is gone. Header, strip and toolbar spacing stay `EventPageLayout`'s.
  - [ ] `EventPageSkeleton` is renamed `SingleMatchPending` (T13 follow-up 1) and mirrors `schedule/single-detail.tsx`: an eyebrow bar; a 30px title bar with a 40px score bar at the right; a facts row; a hairline-topped row at `mt-[26px] pt-3.5`; a `max-w-[640px]` subtle box shape; a `max-w-[560px]` section. No 300px rail and no nine-row list. `single/[matchId]/loading.tsx` exports it.
  - [ ] `SnapshotPending` in `event-line-drawer.tsx` is built on `PendingRegion`/`PendingBar`, keeping its real "Snapshot" eyebrow, and `event-line-drawer.tsx` leaves `LEGACY` in `tests/skeleton-primitives.spec.ts`.
  - [ ] `tests/schedule-skeletons.spec.ts` (static markup) asserts the T26 contract for both skeletons; inside `EventTableSkeleton`'s table card exactly one element carries `border-b` (the header row); `SingleMatchPending` has no element with a `grid-cols` class containing `300px`.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/schedule-skeletons.spec.ts tests/skeleton-primitives.spec.ts tests/schedule-dual-outcomes.spec.ts tests/schedule-tournament-outcomes.spec.ts` passes.
- **notes:** A `loading.tsx` can't know dual (three strip cells) vs tournament (four); draw the dual's three. If `single-detail.tsx`'s "From the report" box renders conditionally, draw its shape only if always present — a skeleton must never promise something that may not arrive. The Schedule list's `SchedulePageSkeleton` is already on `pending.tsx`; leave it. Apply /impeccable layout (`/Users/cjgimena/.claude/skills/impeccable/reference/layout.md`). Carbon: https://carbondesignsystem.com/patterns/loading-pattern/.

## T30 · In-component loading states: the edit-match dialog and the search palette

- **status:** done
- **model:** opus
- **needs:** T25
- **files:** src/components/dashboard/matches/match-actions/edit-match-dialog.tsx (:756), src/components/dashboard/loading/edit-match-pending.tsx (new), src/components/dashboard/search/search-command-palette.tsx (:922-927), tests/edit-match-pending.spec.ts (new), tests/skeleton-primitives.spec.ts (guess)
- **done when:**
  - [ ] While `!match && !loadError`, `EditMatchDialog` renders `<EditMatchPending />` — a `PendingRegion` labelled "Loading match" whose bars sit where the form's field rows render once loaded. `Loader2` and "Reading the match…" are gone from that branch. The Save button's inline `Loader2` (:734) stays.
  - [ ] The palette's three loading rows are one `PendingRegion` labelled "Loading results" built from `PendingBar`s; no bare `animate-pulse` remains in `search-command-palette.tsx`, and it leaves `LEGACY`.
  - [ ] `tests/edit-match-pending.spec.ts` (static markup) asserts the T26 contract for `EditMatchPending`, and that its bar-row count equals the number of field rows the form renders (a constant exported beside the form, or counted from its field list).
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/edit-match-pending.spec.ts tests/edit-match-dialog-logic.spec.ts tests/skeleton-primitives.spec.ts` passes.
- **notes:** Every other `animate-spin`/`Loader2` in `src/` is an inline action (Save/Retry/Switching buttons, workspace-row switch, attach-line search spinner, file-drop busy glyph, `vertical-steps.tsx` current step) — Carbon's inline-loading pattern, so they stay. Only the edit dialog's first load is content arriving. `team/page.tsx:143`'s `region("Getting set up", null, …)` stays null: a set-up team has no line, so a skeleton would promise one that never arrives. Carbon: https://carbondesignsystem.com/patterns/loading-pattern/.

## T31 · Matches and match report skeleton bars on the shared primitives

- **status:** todo
- **model:** sonnet
- **needs:** T25
- **files:** src/components/dashboard/matches/matches-skeleton.tsx, src/components/dashboard/matches/matches-title-row.tsx (:62-64), src/components/dashboard/loading/film-frame-pending.tsx, src/components/dashboard/loading/match-report-pending.tsx, tests/skeleton-primitives.spec.ts
- **done when:**
  - [ ] None of the four files defines its own bar component or writes `bg-[var(--surface-skeleton)]`; bars are `PendingBar` and status wrappers `PendingRegion`/`PendingFrame`, keeping each bar's size classes and each region's `aria-label`.
  - [ ] None of the four files is listed in `LEGACY` in `tests/skeleton-primitives.spec.ts`.
  - [ ] No other markup changes: `tests/match-report-pending.spec.ts`'s assertions pass unedited.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/skeleton-primitives.spec.ts tests/match-report-pending.spec.ts tests/matches-drafts.spec.ts` passes.
- **notes:** Mechanical swap: move, don't restyle. `PendingBar` defaults to `h-3 w-full`; check that `cn` lets a passed size class override the default before relying on it.

## T32 · Home, team, header and event-wizard skeleton bars on the shared primitives

- **status:** todo
- **model:** sonnet
- **needs:** T25
- **files:** src/components/dashboard/loading/home-skeleton.tsx, src/components/dashboard/home/home-ai-insight.tsx (:134-136), src/components/dashboard/loading/event-wizard-pending.tsx (local `Bar` :35), src/app/dashboard/header.tsx (match-crumb bars :428-440), src/app/dashboard/team/roster/[playerId]/loading.tsx (:101), tests/skeleton-primitives.spec.ts
- **done when:**
  - [ ] None of the five files defines its own bar or writes the skeleton token or `animate-pulse` directly; bars are `PendingBar`, wrappers `PendingRegion`/`PendingFrame`. The header's three match-crumb bars sit in one `PendingRegion` labelled "Loading breadcrumb" and no longer use `bg-[var(--ink-100)]`; the roster profile's bars no longer use `--color-surface-muted`.
  - [ ] None of the five files is listed in `LEGACY`.
  - [ ] No other markup changes: `tests/home-empty-loading.spec.ts` and `tests/team-loading.spec.ts` pass unedited.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/skeleton-primitives.spec.ts tests/home-empty-loading.spec.ts tests/team-loading.spec.ts tests/schedule-static-copy.spec.ts` passes.
- **notes:** Mechanical swap. The header crumb and roster profile are the two off-token skeletons in `src/` (ink-100, surface-muted). Keep sizes and labels.

## T33 · Settings skeletons on the shared primitives

- **status:** todo
- **model:** sonnet
- **needs:** T25
- **files:** src/components/dashboard/loading/settings-pending.tsx, tests/settings-pending.spec.ts (new), tests/skeleton-primitives.spec.ts
- **done when:**
  - [ ] `settings-pending.tsx` defines no bar component of its own and does not write `bg-[var(--surface-skeleton)]`; it builds on `PendingBar`/`PendingRegion`/`PendingFrame`, keeping every size class and label.
  - [ ] `settings-pending.tsx` is not in `LEGACY`.
  - [ ] `tests/settings-pending.spec.ts` renders each of `SettingsAccountPending`, `SettingsPlanPending`, `SettingsPreferencesPending`, `SettingsProfilePending`, `SettingsTeamDetailPending`, `SettingsTeamsPending` and `SettingsUsagePending` to static markup and asserts the T26 contract for each (one `role="status"` per region, no `<button`/`<a `/`<input`, no hex, bars `aria-hidden` and `motion-safe:`).
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/settings-pending.spec.ts tests/skeleton-primitives.spec.ts` passes.
- **notes:** The file is ~1021 lines; change only the bar primitive and its wrappers. If an export has several regions, assert that exact `role="status"` count rather than one.

## T34 · The dashboard root loading fallback becomes a skeleton, not a spinner

- **status:** todo
- **model:** sonnet
- **needs:** T25
- **files:** src/app/dashboard/loading.tsx, src/components/dashboard/loading/page-skeletons.tsx (`SimplePageLoader` :223), tests/skeleton-primitives.spec.ts, tests/dashboard-page-pending.spec.ts (new)
- **done when:**
  - [ ] `src/app/dashboard/loading.tsx` default-exports `DashboardPagePending`; `SimplePageLoader` is deleted, `page-skeletons.tsx` contains no `animate-spin`, and the spin exception in `tests/skeleton-primitives.spec.ts` is removed.
  - [ ] `DashboardPagePending` uses `ComingSoonPage`'s frame (`src/components/dashboard/coming-soon.tsx:53-54`: `bg-white`, `max-w-screen-2xl px-14 pt-5 pb-8`) with one bar at the `text-display` `<h1>`'s height and nothing below it.
  - [ ] `tests/dashboard-page-pending.spec.ts` (static markup) asserts exactly one `role="status"` labelled "Loading page", exactly one skeleton bar, and no `<button`/`<a `.
  - [ ] `npm run lint && npm run typecheck` clean; `npm test -- tests/dashboard-page-pending.spec.ts tests/skeleton-primitives.spec.ts` passes.
- **notes:** This boundary catches every dashboard route without its own `loading.tsx`: Ask, Help, Opponents, Statistics, Team Ask, Team Statistics and the settings redirects. Carbon keeps spinners for blocking operations; a page load gets a skeleton. The one shape those pages share is the h1, so draw only the h1 — more would invent a layout. Confirm `help/page.tsx` opens with the same frame and h1; if not, draw the h1 bar at the shared x only.
