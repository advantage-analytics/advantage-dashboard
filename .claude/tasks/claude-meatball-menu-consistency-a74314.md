# Tasks — claude/meatball-menu-consistency-a74314

> Scope: team schedule create-event wizard — formats, chrome and keyboard consistency

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

## T1 · WizardShell footer draws Back and Cancel together

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/WizardShell.tsx, src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx (guess)
- **done when:**
  - [ ] `WizardShell` renders the Back `<button>` when `back` is set AND the Cancel `<Link>` when `cancelHref` is set — both at once, Back first then Cancel, in the existing footer slot left of `meter` — instead of the current `back ? … : cancelHref ? … : null` either/or (WizardShell.tsx:126-146)
  - [ ] Back and Cancel share one class string (12px, `--ink-600`, hover `--ink-900`); Cancel stays a `next/link` `<Link>`, Back stays a `<button type="button">`
  - [ ] The upload wizard's footer DOM is unchanged on every step: `UploadMatchFlow.tsx:183-184` passes `cancelHref` only on `firstStep`, so it still shows Cancel on step 1 and Back-only afterwards
  - [ ] `npm run typecheck` and `npx playwright test tests/wizard-keys-form-control.spec.ts tests/schedule-tournament-field.spec.ts` pass
- **notes:** Keeping the upload wizard's chrome identical is a deliberate scope choice (docs/ui-revamp-guardrails.md); flip it to Back+Cancel on every upload step only if the author asks. `StepIndicator` needs no change.

## T2 · Event chooser adopts WizardShell, keys and stepper

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/schedule/static/static-event-chooser.tsx, src/app/dashboard/team/schedule/new/loading.tsx, src/components/dashboard/loading/event-wizard-pending.tsx, tests/schedule-static-copy.spec.ts (guess)
- **done when:**
  - [ ] `StaticEventChooser` renders through `WizardShell` (not `EventShell`) with `stepIndex={0}` `stepCount={4}`: the `StepIndicator` shows 1 of 4 segments filled and the eyebrow reads "Step 1 of 4"; `COPY.heading` is the shell `title` and `COPY.lede` the `description`
  - [ ] Footer is the shell's: Back (to `/dashboard/team/schedule`) and Cancel (`cancelHref="/dashboard/team/schedule"`) as 12px text on the left, `selected.selectedLabel` in the `status` slot, Continue via `advButton("primary","md")` with `data-wizard-continue` pushing `selected.href`; the ghost `advButton` Cancel and the `mx-auto max-w-[820px]` footer wrapper are gone
  - [ ] `useWizardKeys` is bound with `canGoBack: false`, `continueDisabled: false`, `onContinue` = push `selected.href`: with focus on a card, plain Enter navigates to the selected flow, Escape does nothing, ⌘/Ctrl+Enter moves focus to the next card and from the last card to Continue (as `/dashboard/matches/new` binds via `useWizardKeys.ts:81-176`)
  - [ ] The card radiogroup, aside and "Add a one-off match" link render unchanged inside the shell's content column; the chooser's loading skeleton draws the same stepper + eyebrow + title + lede shape as `WizardShell`
  - [ ] `tests/schedule-static-copy.spec.ts` "the aside and the footer" test passes — retire the `drawn(chooser, file, "Cancel")` / `"Continue"` lines with a RETIRED comment in the file's existing style if the literals leave `COPY`
- **notes:** The 820px card grid now sits in the shell's content column (`CONTENT_CLS`) — let it shrink; do not widen the shell. Back and Cancel both land on the schedule here because the schedule is the previous screen; the author may drop Back on this screen only if it reads redundant.

## T3 · Dual/tournament flows: 4-step count, Back to chooser on step 1

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/schedule/static/new-dual-flow.tsx, src/components/dashboard/schedule/static/new-tournament-flow.tsx, src/components/dashboard/loading/event-wizard-pending.tsx (guess)
- **done when:**
  - [ ] In create mode both flows pass `stepCount={4}` and `stepIndex={step}` (chooser is step 1), so the school/name step shows "Step 2 of 4" with 2 segments filled and the last step "Step 4 of 4"; in `mode="edit"` both keep `stepCount={3}` and `stepIndex={step - 1}` exactly as today
  - [ ] In create mode, step 1 of both flows renders Back (navigates to `/dashboard/team/schedule/new`) AND Cancel (`/dashboard/team/schedule`); every later create step renders Back (previous step) AND Cancel (`/dashboard/team/schedule`)
  - [ ] Edit mode footers are unchanged: dual edit step 2 shows Cancel → the event only; tournament edit keeps `cancelHref` → the event, with no Back on its step 1
  - [ ] `useWizardKeys` `canGoBack` stays `false` on step 1 (Escape inert, matching the upload wizard's first step) and `true` from step 2, so Escape on step 2 returns to step 1; existing Enter / ⌘Enter bindings keep their behaviour
  - [ ] The new dual and new tournament loading skeletons draw 4 stepper segments; `npx playwright test tests/schedule-tournament-field.spec.ts tests/schedule-static-copy.spec.ts` passes (the spec clicks "Back" twice and must still land on the name field)
- **notes:** Step-1 Back is a route navigation, not `onStep`; `WizardShell.back` is `() => void`, so wrap `router.push("/dashboard/team/schedule/new")`. Do not touch `PinnedEventBar`'s `onChange` round trip. The dual's step 2 now draws Date · Site · Surface over Time · Singles format · Doubles format (commit 699e68db).
