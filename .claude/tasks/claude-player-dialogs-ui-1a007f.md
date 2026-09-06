# Tasks — claude/player-dialogs-ui-1a007f

> Scope: Roster player dialogs — Add / Invite / Edit shell width and DS pass, the invite→add hand-off, an occupied-lineup-spot confirm, and two roster display bugs (clipped drawer score, uneven bench-dash spacing).

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

## T1 · Add `playedSets()` display-only trim helper
- **status:** done
- **model:** sonnet
- **files:** `src/lib/ui/score-format.ts`, `tests/score-format.spec.ts` (existing spec for this module — extend it, do not create a new file)
- **done when:**
  - [ ] `score-format.ts` exports a pure `playedSets(sets: ScoreLineSet[]): ScoreLineSet[]` and `scoreSetsFrom`, `tiebreakOf`, `formatScoreText` are byte-unchanged in the diff
  - [ ] `tests/score-format.spec.ts` asserts all five cases: `[6-4,0-0,0-0]→[6-4]`, `[6-4,7-6,0-0]→[6-4,7-6]`, `[0-0,0-0,0-0]→[]`, `[0-6,6-0]→unchanged`, `[]→[]`, and they pass
  - [ ] The function's doc comment states the trim is display-only and must never reach a write path or change what other readers of the adapter see
  - [ ] No file outside `score-format.ts` and its spec imports or calls `playedSets` (grep the diff)
  - [ ] `npm run lint` is clean
- **notes:** Trailing-only trim — interior and leading `0-0` sets survive. Worktree needs `npm ci` before the first lint/test.

## T2 · Drawer recent-match score: trim and unclip
- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** `src/components/dashboard/team/player-drawer.tsx` (row grid at ~line 725, `<ScoreLine>` at ~741), new `tests/player-drawer-score.spec.ts` (guess)
- **done when:**
  - [ ] The drawer's recent-match `<ScoreLine>` receives `sets={playedSets(match.sets)}`; `match-rows.tsx` and every other `ScoreLine` caller are absent from the diff
  - [ ] The row's grid template replaces the fixed `72px` score track with `minmax(72px,max-content)` and the opponent/event cell remains `minmax(0,1fr)` + `truncate`
  - [ ] A Playwright spec selects a roster player whose recent match is stored with trailing `0-0` sets and asserts the rendered score contains no `0-0` set
  - [ ] The same spec asserts the score cell's `scrollWidth <= clientWidth` for a three-set match
  - [ ] No file under `src/lib/data/` or `supabase/` is in the diff (no write path, no loader change)
- **notes:** The Playwright assertion needs an authenticated dashboard session — see the memory note "Dashboard screenshot harness" / "Unauthenticated preview harness" for the throwaway-user approach; if the harness is judged too costly, a component-level render test with fixture sets satisfies the same two assertions. `overflow-hidden` on the score cell may be dropped only if it now does nothing.

## T3 · Bench divider: symmetric dash gap
- **status:** todo
- **model:** sonnet
- **files:** `src/components/dashboard/team/roster-table.tsx` (~line 715, the BENCH `Reorder.Item`)
- **done when:**
  - [ ] The em dash is rendered as its own `aria-hidden` `<span>` and no longer appears inside the trailing string
  - [ ] The divider container has exactly one `gap-*` value (start `gap-1.5`; `gap-1` acceptable) and no leading/trailing space characters inside either label string do spacing work
  - [ ] Rendered in lineup mode, the measured gap left of the dash equals the gap right of it (state the two numbers in the commit body)
  - [ ] The commit message or a code comment names the chosen gap value and that it was picked by eye at 11px against the eyebrow
  - [ ] `npm run lint` is clean and no other `gap-2.5` occurrence in the file changes
- **notes:** Independent of the dialog work. Screen-reader text should still read as one sentence; check the sr-only/visible split if one exists.

## T4 · Dialog shell default width 440 → 520
- **status:** todo
- **model:** sonnet
- **files:** `src/components/dashboard/team/dialog-shell.tsx`
- **done when:**
  - [ ] The `width` prop union reads `440 | 480 | 520 | 560` and `RosterDialog`'s default is `520`
  - [ ] Add, Invite and Edit dialogs pass no explicit `width` and render at 520px; Merge still renders at 520 and review-requests at 480 (no other caller file in the diff)
  - [ ] The file header comment documents 520 as a deviation from SKILL.md § Dialog (v3) `w-[440px]`, borrowing the DS compare-dialog width rather than inventing a number
  - [ ] Padding, 18px rhythm, title, contract sentence, close button and footer markup are unchanged in the diff (only the union, the default and the comment move)
  - [ ] `npm run build` succeeds and the existing `maxWidth: calc(100vw - 32px)` remains
- **notes:** Must land before T5–T7 so their layout is judged at the final width.

## T5 · Add Player: occupied-spot acknowledgement gate
- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** `src/components/dashboard/team/add-player-dialog.tsx`, new `tests/add-player-spot-gate.spec.ts` (guess)
- **done when:**
  - [ ] New `spotAcknowledged` state is set to `false` in `reset()` and in the `setLineupSpot` change handler
  - [ ] When `spotTakenBy.length > 0` a checkbox reading "Yes — share #N with {names} for now." renders directly under the existing `RosterNote`, using the same classes as the "Also send an invite" checkbox (`accent-[var(--blue)]`, 12px label, 11px sub-line); no checkbox renders for a free spot
  - [ ] `ready` includes `&& (spotTakenBy.length === 0 || spotAcknowledged)` and the primary button's `disabled` expression is otherwise unchanged
  - [ ] A test covers the sequence: occupied spot → "Add to roster" disabled; tick → enabled; switch to a different occupied spot → disabled again; free spot → enabled with no checkbox
  - [ ] `spotHeldNote`, `player-fields.tsx`, `edit-player-dialog.tsx`, `addProgramPlayer` and any SQL are absent from the diff, and the gate never renders through `DialogProblem`
- **notes:** Gate, not validation — no red, no `role="alert"`. There is NO displacement write to any other player's row.

## T6 · Add Player: `initial` prefill prop + header wiring
- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** `src/components/dashboard/team/add-player-dialog.tsx`, `src/components/dashboard/team/roster-header-buttons.tsx`
- **done when:**
  - [ ] `AddPlayerDialog` accepts optional `initial?: { firstName?: string; lastName?: string; email?: string }` and applies it inside a `useEffect` keyed on the closed→open transition, not in a `useState` initializer
  - [ ] `reset()` still clears every field to empty (not to `initial`), so Cancel then reopen with the same `initial` shows the prefill again but Cancel itself leaves no residue
  - [ ] `RosterHeaderButtons` holds an `addInitial` state next to its existing `inviting`/`addingPlayer` flags and passes it as `initial`; nothing sets it yet in this task
  - [ ] A test opens/closes the dialog twice with a non-empty `initial` and asserts the prefill on both opens, and that the `created`/`formKey` duplicate-suppression still resolves `createdProfileId` for an unchanged form
  - [ ] `npm run lint` and `npm run build` are clean
- **notes:** Component stays mounted across opens — read the existing `close()` commentary before choosing the effect trigger. Header file uses `inviting`/`addingPlayer` names, not `inviteOpen`/`addOpen` as the plan writes.

## T7 · Invite → Add Player email hand-off
- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx`, `src/components/dashboard/team/roster-header-buttons.tsx`, `src/components/dashboard/team/invite-target-picker.tsx` (only if the affordance must sit inside the picker), new `tests/invite-add-handoff.spec.ts` (guess)
- **done when:**
  - [ ] When the picker selection is `null` and the email field is non-empty, one blue text action reading "Add a coach-managed profile instead →" renders under the email field; it does not render when a profile is selected or the email is empty
  - [ ] Clicking it invokes a callback in `RosterHeaderButtons` that closes Invite, sets `addInitial` to `{ email }` only (no name), and opens Add Player; the callback is a no-op when Add Player is already open
  - [ ] A test: open Invite, type an email, choose "Someone new", click the hand-off → Invite is closed and Add Player is open with the email field prefilled
  - [ ] A test (or existing spec kept green) confirms "Someone new" + Send still submits the invitation unchanged — no invite code path is removed
  - [ ] No server action, query, or file under `src/lib/data/` or `src/app/api/` is in the diff
- **notes:** Footer-left quiet text register per the DS; not a button. Invite already has an `initialEmail` prop — the hand-off flows the other direction.

## T8 · Branch verification sweep + score persistence check
- **status:** todo
- **model:** opus
- **needs:** T2, T3, T7
- **files:** none expected — this task should produce no source diff
- **done when:**
  - [ ] `npm run lint`, `npm run build` and `npm test` all pass, including the specs added in T1, T2, T5, T6 and T7
  - [ ] `git diff main...HEAD` contains no write (`update`, `upsert`, `insert`) touching `matches.score`, and no change under `src/lib/data/`, `src/app/api/` or `supabase/` — the grep command and its empty output are recorded in the log
  - [ ] One match's stored `score` JSON, read via the Supabase MCP before and after loading the roster drawer for that player, is byte-identical (both reads recorded)
  - [ ] `pipeline-guardrails-reviewer` has run over the branch diff and reports no blocking finding; `rls-boundary-reviewer` is run only if the grep above found a data-path change (it should not)
- **notes:** Verification-only, lands no code. If a check fails, reopen the owning task rather than fixing it here. Flagged at drafting: this task produces an empty diff, so `task-completion-reviewer` judges it against the evidence recorded in the log rather than against code.
