# Tasks — claude/label-let-followups

> Scope: follow-ups to the merged let-serve labelling feature (PR #408) — menu way back, database backstop, other writers, apply preview, scorecard.

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

## T1 · Serve-result menu offers "No result" when nothing can be derived

- **status:** todo
- **model:** opus
- **files:** src/components/admin/labels/label-black-shot-row.tsx (`serveResultMenu`, `serveResultPatch`, `ServeResultCell`), tests/label-black-rows.spec.ts — a guess
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `serveResultMenu` returns, when `deriveShotResult` is null (no landing to read), a "No result" item in the calculated item's slot — above the hairline, under the "Serve result" group, with a one-line description saying the landing is not placed — so a let is never the menu's only item; when a calculated item exists the menu is unchanged (calculated, hairline, Let).
  - [ ] Picking "No result" writes `{ result: null }`: `serveResultPatch` maps the item's sentinel value to `null` (the `MenuOption<string>` value cannot itself be null), and the trigger then reads "No result" as it does for any serve without a result.
  - [ ] The "No result" item reads as the current choice when the serve's result is null, and the Let item when it is `let`, so the menu shows which of the two is stored.
  - [ ] Pinned in tests/label-black-rows.spec.ts: the item set with and without a derivable landing, the sentinel → `null` patch, and that the item is absent when a calculated item exists.
- **notes:** Closes PR #408's T3 follow-up 1 (a let on a serve with no landing could only be cleared with Reset, and Reset exists only for an edited row with a seed — `canResetShot`). The existing menu spec is at tests/label-black-rows.spec.ts:1253 ("the menu: the landing's result, a hairline, then Let"); extend it rather than duplicating its fixtures. Keep the item's copy in the same register as `SERVE_RESULT_LANDED` / `SERVE_RESULT_LET` (exported constants). The dark `FloatMenu` tone and `data-menu-open` behaviour are not to change.

## T2 · Database check: a let is a serve's only

- **status:** todo
- **model:** fable
- **files:** supabase/migrations/<live-version>_label_shots_let_serve_only.sql (new), src/lib/services/labels/edit.ts (`letResultError` doc comment) — a guess
- **done when:**
  - [ ] Before any DDL, the live project (pouxujkhtbvkdwbzfvka) is checked with `execute_sql` for violating rows — `result = 'let' and (stroke is null or stroke not in ('first_serve','second_serve'))` — and the count is 0; if it is not 0 the task stops and reports the rows instead of applying anything.
  - [ ] A migration adds `label_shots_let_serve_only` as `check (result is distinct from 'let' or (stroke is not null and stroke in ('first_serve','second_serve')))` — written so a null-stroke let is refused (a bare `stroke in (...)` is null-for-null and would pass the check), while a null result and every in/out/net row still pass; the existing `label_shots_result_check` is left as it is.
  - [ ] The same DDL is applied live with `apply_migration`, and the repo file is named to the version the live migration took (`list_migrations` confirms); the file's header comment records the pre-check query and that it returned 0.
  - [ ] `letResultError`'s doc comment in edit.ts names the constraint as the database's backstop for every writer, in one sentence.
- **notes:** Data-model change, hence `fable`. `supabase/migrations/` is not Prettier-formatted — never hand-format it. The repo folder lags live by ~100 migrations, so the constraint's presence and name must be verified against the database, not the folder. No `grant` is needed (a check constraint, not a function). This is the backstop for T3's code guards; the two tasks are independent and either may land first.

## T3 · Guard the other label_shots result writers with the let rule

- **status:** todo
- **model:** opus
- **files:** src/lib/services/labels/point-combine.ts, src/lib/services/labels/point-combine-session.ts, src/lib/services/labels/reset.ts, src/lib/services/labels/seed.ts, tests/label-point-combine.spec.ts, tests/label-reset.spec.ts, tests/label-seed.spec.ts — a guess
- **done when:**
  - [ ] Point combine: every retype `combineServeRetypes` plans is judged with `letResultError(patch, shot)` (as the row would be left) before the session writes it; a refusal returns `{ error }` with no `label_shots` write — pinned by a spec on the pure plan (a crafted row whose patch would leave a let on a non-serve is refused; the existing let-and-first/second cases still pass).
  - [ ] Shot reset: `planShotReset` refuses (`{ error: "Only a serve can be a let." }` via `letResultError`) when the seed's `result`/`stroke` would leave a let on a non-serve, instead of writing it — pinned in tests/label-reset.spec.ts.
  - [ ] Seed: `labelShotResult` maps only In/Out/Net and never produces `"let"` from a vendor string (`"Let"` → null) — pinned in tests/label-seed.spec.ts.
  - [ ] A short audit comment (one place, e.g. above `letResultError` or in edit-session.ts near `writeLabelShotEdit`) lists the `label_shots` writers that compose `result`/`stroke` and where each is guarded, and names the ones that write neither (`planAddedShot`, player swap, tombstone/restore, site-removal restore).
- **notes:** Audit result this task is built on: `combineServeRetypes` (point-combine.ts:116–158) is the only code besides `writeLabelShotEdit` that writes `result: "let"`; it does so only on `isServeStroke` rows by construction, so the guard is defensive and the spec pins the invariant. `point-combine-session.ts:170–190` writes each retype with `updateIfUnchanged`. `reset.ts` writes the seed's values back (`write.result`); seeds never hold a let today. The console's optimistic path is T4, not this task. T2's database check is the backstop for all of these; do not wait on it.

## T4 · Console refuses a let patch before the optimistic apply

- **status:** todo
- **model:** sonnet
- **files:** src/components/admin/labels/label-console.tsx (the shot-patch handler around line 669, `applyLabelShotPatch`), tests/label-console-edit.spec.ts — a guess
- **done when:**
  - [ ] Before the optimistic `applyLabelShotPatch(shot, patch)`, the console runs `letResultError(patch, shot)` (edit.ts); when it returns a message, no optimistic row change is made and no save request is sent.
  - [ ] The refusal message reaches the same error surface a server `{ error }` on a shot edit does (the existing save-status path) — no new UI.
  - [ ] `applyLabelShotPatch` itself is unchanged (it is reused for undo at line ~686 and the dead-ball reason at ~694); the check lives in the handler.
  - [ ] Pinned where the console's edit path is already tested (tests/label-console-edit.spec.ts), or by a spec on a small pure seam the handler calls if the console path is not reachable offline — either way the refused patch is asserted not to be applied.
- **notes:** Closes PR #408's T1 follow-up 2 ("the console's optimistic `applyLabelShotPatch` does not call `letResultError`; only the server refuses"). label-console.tsx is ~2100 lines — read only the handler; do not refactor around it. The rail already sends the calculated result with a retype off a serve (`strokeChangePatch`), so in normal use this guard never fires; it exists so a stale row or a future caller cannot show a let on a forehand for the round trip.

## T5 · label-apply dry run says how many lets it left out

- **status:** todo
- **model:** sonnet
- **files:** src/lib/services/labels/apply.ts (the preview/stats builder near line 520–574), scripts/label-apply.ts (the dry-run printout), tests/label-apply.spec.ts — a guess
- **done when:**
  - [ ] The preview `buildAppliedRows` returns gains a count of live let serves left out of the written shots (`isLetServe`, across applied points only).
  - [ ] `scripts/label-apply.ts` prints one line naming that count in the dry run and the write summary (omitted or "0" when none — pick one and keep it).
  - [ ] Pinned in tests/label-apply.spec.ts beside "the preview counts aces, double faults and winners per side".
- **notes:** Intent (4) — handling a let in label-apply — is already satisfied by PR #410 (apply.ts header, `playedShots`, spec line 274); this only adds the observability line so an admin applying a session sees that lets were dropped on purpose.

## T6 · Scorecard: a let is its own value everywhere a result is bucketed

- **status:** todo
- **model:** opus
- **files:** src/lib/services/labels/scorecard.ts (`resultChanges`, `lastLandings.remaining`, `ServeFindings`, the "## Serves" and "## Last-stroke result changes" renderers), tests/label-scorecard.spec.ts, tests/label-marks.spec.ts — a guess
- **done when:**
  - [ ] Last-stroke result changes: a last live stroke whose result moved to `let` is its own row (`from → let`, rendered "let", never "no result") and is not counted in the summary sentence's "went in→out or net" `moved` share — pinned by a spec.
  - [ ] Last-stroke landings: a let with no landing goes to a new `remaining.let` bucket rendered as its own table row ("Left it empty, let"), not to `in`, `outOrNet` or `noResult` — pinned by a spec.
  - [ ] Serves: `serves.threeOrMore` counts live serves that are not lets (let + first + second is two serves, not listed), and a new `serves.lets` lists the points with at least one live let serve, rendered as "Points with a let serve: …" under "## Serves" — pinned by a spec.
  - [ ] `serveAfterServeIn` (marks-state.ts) is pinned as it stands: a serve following a let raises no `serve_after_serve_in` mark (a let is not "in"), while a serve following a serve called in still does — spec in tests/label-marks.spec.ts (or wherever marks-state is tested); no code change expected.
- **notes:** Decision made here, consistent with "a let is neither in nor missed": the scorecard audits how labelling differs from the vendor, and a seeded "in" the labeller turned into a let is a real difference worth seeing — so a let is shown as its own value, never folded into in / out-or-net / no-result, and never dropped. (The alternative, skipping lets in `lastLiveShot`, would hide exactly those changes.) Seeds never hold a let, so `let → x` rows cannot occur; `direction()` keys need no change. Closes PR #408's T2 follow-ups 1 and 2. `isMissedResult` stays out/net only.
