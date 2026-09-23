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
