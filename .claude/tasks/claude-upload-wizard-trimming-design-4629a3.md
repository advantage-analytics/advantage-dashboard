# Tasks — claude/upload-wizard-trimming-design-4629a3

> Scope: Score and Context step designs for /dashboard/matches/new (canvas https://claude.ai/artifact/AzLwXtfWFQzuzK93ocwa1i) plus the pinned-line swap investigation.

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

## T1 · Score grid: Tab follows the digit path, new hint copy

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx (guess), src/components/ui/kbd.tsx (import only), tests/upload-score-regression.spec.ts or a sibling spec on the `/wizard-reproduction?mode=new` route (guess)
- **done when:**
  - [ ] Tab in a game cell is intercepted (`preventDefault`) and moves focus along the same path a game digit takes in `setDigit`: player cell → opponent cell of the same set → next set's player cell (or the dashed add-set cell while `ghost` is true); Tab from the last cell with nowhere to go, and Shift+Tab anywhere, are left to the browser.
  - [ ] Tab in a tiebreak cell moves the way Enter does in `enterTiebreak`: player TB → opponent TB (same set) → next set's player cell. A game digit that completes a tiebreak pair still lands focus on the player's TB cell, as today.
  - [ ] The hint under the rows reads exactly `Each digit moves to the next box · [tab] or [enter] leaves a tiebreak box`, where `[tab]` and `[enter]` are `<Kbd size="sm">` chips (`src/components/ui/kbd.tsx`), and the line's colour is `--ink-600` (not `--ink-500` / `text-micro`'s default). The existing `· type in the dashed column to add a set` and `· format from the event` suffixes stay.
  - [ ] A Playwright spec drives the real grid in a browser through the `/wizard-reproduction?mode=new` route (as `tests/upload-score-regression.spec.ts` does) and asserts, via `document.activeElement`'s `aria-label`, the Tab path for a 7–6 set (player set 1 → Tab → opponent set 1 → type 6/7 → TB cell → Tab → opponent TB → Tab → player set 2).
  - [ ] `npm run typecheck` and `npm run lint` pass; `tests/upload-score-state.spec.ts` is unchanged and green.
- **notes:** Copy is author-approved — do not reword. Focus keys live in `refs.current` keyed by `key(row, i, tb)`; reuse `focusKey` and `scoreColumns` rather than reading DOM order. Tab must still leave the grid entirely from the last reachable cell so keyboard users are not trapped. `useWizardKeys.ts` does not intercept Tab today — confirm it stays that way.

## T2 · Score caption: "How to enter a tiebreak" popover

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx (guess), src/components/ui/popover.tsx (import only), tests/upload-score-help.spec.ts (new, offline render via tests/fixtures/vm-modules.ts `createLoader()` with `@/components/ui/popover` stubbed inline as tests/upload-player-details.spec.ts does)
- **done when:**
  - [ ] Beside the `Score` `FieldCaption` (left of the format text, in the caption row) there is a `<button type="button">` reading exactly `How to enter a tiebreak` with a lucide `HelpCircle` icon, 11px, `--ink-600`, hover `--ink-900`, using `focusRingCls` from `./styles`.
  - [ ] Clicking it opens a `Popover` (`@/components/ui/popover`, `floatMenuCls` shell) titled `Entering a tiebreak` with two worked examples, each a sentence plus a row of mini score boxes (a smaller version of `CELL_CLS`, read-only, `aria-hidden`) showing the games and the TB box: example 1 draws `7 6 [TB]` and reads exactly `A set that ends 7–6. Type the games and a TB box opens beside the set. The tiebreak points go in it.`; example 2 draws `1 0 [TB]` and reads exactly `A match tiebreak for the third set. Enter that set as 1–0 to whoever won it, then the points in its TB box.`
  - [ ] The button is not rendered when the `ScoreBlock` is used by the schedule's score page with `gamesTo === 8` (a doubles pro-set has no tiebreak column) — or, if the subagent finds that surface should keep it, the notes say why.
  - [ ] The new spec renders `ScoreBlock` to static markup with the popover stubbed inline and asserts the button label, the popover title and both example sentences verbatim.
  - [ ] `npm run typecheck`, `npm run lint` pass.
- **notes:** Copy is author-approved — keep the en dashes in `7–6` and `1–0`. This is help, not a notice: no amber, no `WizardNotice`. The mini boxes are illustrative — plain spans, never real inputs, so the keyboard walk in `useWizardKeys` does not count them.

## T3 · Opponent naming hints under the name input and the selects

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx (guess — the `namingOpponent` branch of the players section, ~lines 1462–1650), tests/upload-player-details.spec.ts (extend)
- **done when:**
  - [ ] While `namingOpponent` is true, the line under the opponent name input reads exactly `[enter] to add them`, where `[enter]` is a `<Kbd size="sm">enter</Kbd>` chip, 11px, `--ink-600`; it replaces the current `Hand and backhand after the name` line.
  - [ ] While `namingOpponent` is true, a single line spanning under the two disabled `Hand` / `Backhand` `MenuSelect`s reads exactly `Hand and backhand open once the opponent is added.`, 11px, `--ink-600`; it is not rendered once an opponent is set.
  - [ ] Neither line uses the unlayered `text-micro` class for colour — colour comes from a Tailwind `text-[var(--ink-600)]` class (see `FieldCaption.tsx`'s note on DS class layering).
  - [ ] `tests/upload-player-details.spec.ts` gains source assertions (its existing pattern) that both strings are present and that `Hand and backhand after the name` is gone.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/upload-player-details.spec.ts` pass.
- **notes:** Copy is author-approved. The selects' `disabled={namingOpponent}` stays as is — the hint explains the state, it does not change it. The grid is `sm:grid-cols-subgrid` over three columns; the second hint needs to sit under columns 2–3 (`sm:col-span-2 sm:col-start-2`), same trick the "Save to your profile" button uses.

## T4 · Subject bar on steps 2–4 for non-preset flows

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/SubjectBar.tsx (new), src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx (the `pinned` slot), src/components/dashboard/matches/new-match-wizard/RosterMenu.tsx (`workspaceLabel` import only), tests/upload-subject-bar.spec.ts (new, offline render via tests/fixtures/vm-modules.ts)
- **done when:**
  - [ ] `UploadWizardPage` passes `<SubjectBar>` into `WizardShell`'s `pinned` slot when `meta.preset` is null, `meta.workspaceKind === "team"`, and `step !== firstStep`; a preset flow still renders `PinnedLineBar` and nothing else there.
  - [ ] The bar matches `PinnedLineBar`'s shell (`h-9`, `border-b border-[var(--border-hairline)]`, `bg-[var(--surface-subtle)]`, `px-[18px]`) and reads `For <subject name>` (12px, name in `font-medium`), a hairline divider, then `workspaceLabel(workspace)` (11px `--ink-600`, from `RosterMenu.tsx`), a spacer, and a right-aligned blue text button styled like PinnedLineBar's `Change` reading `Not <first name>?` — or `Not you?` when the subject's `playerId` equals `workspace.myPlayerId`.
  - [ ] The subject name comes from `wizard.whoPlayed.subject` (`kind: "roster"` → `subject.name`), never from `formData.playerName` alone; the bar renders nothing when `whoPlayed.subject` is null.
  - [ ] The button takes an `onNotSubject: () => void` prop. On step 2 (`stepOrder[1]`) the page wires it to `wizard.handleBack` (straight to step 1, no dialog); on later steps it calls the same prop and the dialog is T5's — until then the prop is wired to `handleBack` on those steps too, with a `// T5` comment naming the swap.
  - [ ] The new spec renders `SubjectBar` to static markup for (a) a roster subject `Marcus Reid` → contains `For`, `Marcus Reid`, `Not Marcus?`; (b) a subject whose id is `myPlayerId` → `Not you?`; and `npm run typecheck` / `npm run lint` pass.
- **notes:** Team-only by construction: in a personal workspace the uploader IS the player and step 1 has no picker to return to, so "Not you?" would have nowhere to go. `subjectFirstNameOf` in `wizard-view.ts` already splits a first name; reuse it. Blue text button = `text-[var(--blue)] hover:text-[var(--blue-hover)]`, `rounded-[var(--radius-button)]`, no icon. `DashboardShell` only clears upload localStorage when the path leaves `/dashboard/matches/new`; the bar never navigates, so that is untouched.

## T5 · "Start over with a different player?" dialog and the hook's start-over reset

- **status:** todo
- **model:** fable
- **needs:** T4
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (new `startOver` handler + return type), src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx or a new StartOverDialog.tsx beside SubjectBar.tsx, src/components/ui/confirm-dialog.tsx (import only), tests/upload-start-over.spec.ts (new, via tests/fixtures/upload-wizard-hook.ts), tests/upload-subject-bar.spec.ts (extend for the dialog copy), docs/investigations/2026-09-23-start-over-guardrails-review.md (new)
- **done when:**
  - [ ] The hook exports `startOver(): void` which sets `step` to `firstStep`, calls `applyMatchSubject(null)`, `resetIdentityAnswer()`, `setError(null)`, clears `topPlayerAnswerStale` and the trim-answer baseline, and resets ONLY these `formData` fields to their `DEFAULT_FORM_DATA` values: `playerName`, `playerHand`, `playerBackhand`, `playerStyleSource`, `opponentName`, `opponentSource`, `opponentPlayerId`, `opponentHand`, `opponentBackhand`, `opponentStyleSource`, `opponentProgramKey`, `opponentSchool`, `playerScores`, `opponentScores`, `playerTiebreaks`, `opponentTiebreaks`, `numberOfSets`, `result`, `retiredSide`, `videoStartSeconds`, `videoEndSeconds`, `fixedCamera`, `initialTopPlayerIsPlayer1`. `uploadedFile`, the probe, `selectedProvider`, `progressKind`, `eventName`, `round`, `bestOf`, `adScoring`, `date`/`time`, `courtType` are untouched.
  - [ ] On steps 3 and 4 the bar's button opens `ConfirmDialog` with `tone="danger"`, title `Start over with a different player?`, `confirmLabel` `Start over`, `cancelLabel` `Keep <first name>`, and a `ConfirmProse` body of two paragraphs: `Kept: your video file.` then `Cleared: ` + the step's list. Step 3 (trim) description is exactly `The video check was set up for <Name>, so you'll pick the player again and redo it.` with cleared text `the trim window and both camera answers.`; step 4 (match) description is exactly `The video check and this score were set up for <Name>, so you'll go through each step again from step 1.` with cleared text `the trim window, both camera answers, this score and the players.` `<Name>` is the subject's full name. Confirm calls `startOver()` and closes; Cancel/Esc leave everything as it was. Step 2 keeps T4's no-dialog jump.
  - [ ] Nothing outside step 1 writes the match subject: the only callers of `applyMatchSubject` with a non-null value remain `chooseMatchSubject` and the initial-state seed (grep in the diff), and `startOver` writes null only.
  - [ ] `tests/upload-start-over.spec.ts` drives the real hook through `uploadWizardHarness({ team: true, props: { initialProvider: "splitstep" } })`: choose a roster subject, set a trim window, answer both camera questions, type a score and opponent, call `startOver()`, then assert `step === "provider"`, `whoPlayed.subject === null`, every field in criterion 1 is back to default, `topPlayerAnswerStale === false`, and `uploadedFile` / `selectedProvider` are unchanged.
  - [ ] `pipeline-guardrails-reviewer` has been run on the diff and its report is saved at `docs/investigations/2026-09-23-start-over-guardrails-review.md` in the diff; `npm run typecheck`, `npm run lint` pass.
- **notes:** Copy is author-approved — keep it verbatim. `fixedCamera`/`initialTopPlayerIsPlayer1` stay `boolean | undefined`, never coerced (`docs/ui-revamp-guardrails.md` §3.1). The 400ms autosave effect will write the cleared form to localStorage on its own — do not call `clearStorageData()`, which would also drop `SELECTED_PROVIDER` and the file entry. `useScoreCheck` holds its own "asked/dismissed" state keyed on step — check it re-asks after a start-over rather than remembering a dismissed check for the old score. Draft rows (`saveDraft`) are untouched by this; a saved draft that is later started over simply saves the emptier form next time. Author decision 2026-09-23: starting over keeps the video file.

## T6 · Investigate what survives a PinnedLineBar line swap

- **status:** blocked
- **model:** fable
- **files:** docs/investigations/2026-09-23-pinned-line-swap-carries-answers.md (new, the findings), tests/upload-line-swap.spec.ts (new, via tests/fixtures/upload-wizard-hook.ts — mutate `h.props.preset` then `h.render()` to model `onSwitchPreset`), src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (the preset seeding effect at ~line 1229, only if the fix is trivial and confirmed)
- **done when:**
  - [ ] The findings doc names, field by field, what the preset seeding effect rewrites on a line swap (`playerName`, `opponentName`, `date`, `bestOf`, `adScoring`, score …) and what it leaves standing, and gives a verdict for each of: `initialTopPlayerIsPlayer1`, `fixedCamera`, `playerHand`/`playerBackhand`/`playerStyleSource`, `opponentHand`/`opponentBackhand`/`opponentStyleSource`, `playerTiebreaks`/`opponentTiebreaks`, the trim window and `topPlayerAnswerStale`'s baseline — with the line numbers the verdict rests on.
  - [ ] The new spec seeds a splitstep preset for line A, sets a trim window, answers `initialTopPlayerIsPlayer1: true` and `fixedCamera: true`, sets `playerHand`/`opponentHand`, swaps `h.props.preset` to line B (different `entryId`, `playerName`, `opponentName`) and re-renders; it asserts the current behaviour for each field above — written so that a field that carries over to the wrong person is a FAILING assertion.
  - [ ] Either the fix ships and the spec passes: on a swap (i.e. `seededRef.current` already true) the effect also clears `initialTopPlayerIsPlayer1`, both players' hand/backhand and their `*StyleSource`, `playerTiebreaks`/`opponentTiebreaks`, and re-arms the top-player baseline, while `fixedCamera` (about the recording, not the players) and the trim window are kept — OR the doc's "Proposed fix" section names the exact change and why it was not trivial, and the failing assertions are marked `test.fail()` with the doc path in the annotation.
  - [ ] `PinnedLineBar.tsx`'s header comment ("Picking one rewrites the bar and nothing else") is corrected to say what a swap does clear, if anything now does.
  - [ ] `npm run typecheck`, `npm run lint` pass; `tests/upload-camera-answer-reset.spec.ts` stays green.
- **notes:** From a read of the code: the seed effect (`useEffect` keyed on `preset` at ~1229) spreads `draft?.formData` then the preset's event facts over `prev` and touches none of the video answers or player styles, so the carry-over looks real for `initialTopPlayerIsPlayer1` (camera-relative "was YOU at the top" — the "you" just changed) and for both hand/backhand pairs. `fixedCamera` is genuinely about the file and should survive. Independent of T5 in code, but both edit the hook — run after T5 if the queue is drained in order.
