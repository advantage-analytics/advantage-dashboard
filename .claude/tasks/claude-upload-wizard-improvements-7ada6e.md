# Tasks — claude/upload-wizard-improvements-7ada6e

> Scope: upload wizard — trim-step navigation polish and a video-usage gate (wizard + upload-url)

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

## T1 · Read the team pool for the wizard's remaining-hours figure

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (guess — the remaining-quota effect at ~L878-922)
- **done when:**
  - [ ] When `activeWorkspace.kind === "team"`, the remaining-quota effect calls `supabase.rpc("program_usage_total", { p_program_id: activeWorkspace.id, p_billing_month: currentBillingMonth() })` and no longer reads the `processing_usage` table on that branch
  - [ ] A personal workspace still runs the existing `processing_usage` select with its four `.eq()` filters unchanged
  - [ ] An RPC error leaves `remainingQuotaSeconds` as it was (no `setRemainingQuotaSeconds` call on the error path), matching the existing `if (error || cancelled) return` behaviour
  - [ ] The effect's dependency list includes a value derived from `step` that changes when the step becomes `"trim"`, so the read re-runs on arriving there
  - [ ] The doc comment above `remainingQuotaSeconds` no longer says it "mirrors its arithmetic exactly" and instead states that team reads go through `program_usage_total` because RLS scopes the table to `created_by = auth.uid()`
- **notes:** Why: in a team workspace the direct table read is RLS-scoped to the caller's own rows, so the meter shows MY usage against the TEAM cap and any gate built on it under-blocks. `src/lib/data/usage-server.ts:getProgramUsage` (L122) is the reference call — mirror how it reads the RPC's return shape rather than guessing. Before coding, confirm via the Supabase MCP (`execute_sql`) that role `authenticated` has EXECUTE on `program_usage_total` on the live DB; if it does not, stop and report — this task carries no migration. The file is 2892 lines: read only the ranges you need. Do not touch `handleTrimChange`, eligibility, or any of the three inputs in docs/ui-revamp-guardrails.md §4.

## T2 · Add the pure quotaRefusal gate and its spec

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/validation.ts, tests/upload-quota-gate.spec.ts (new) (guess)
- **done when:**
  - [ ] `validation.ts` exports `quotaRefusal({ remainingSeconds, neededSeconds, capSeconds, resetsOn, workspaceKind })` returning `string | null`, with no React or Supabase import added to the file
  - [ ] It returns `null` when `remainingSeconds` is `undefined`, and `null` when `Math.ceil(neededSeconds) === remainingSeconds` (exactly fits)
  - [ ] When `remainingSeconds <= 0` it returns "This month's analysis hours are used up. They reset on {resetsOn}." for `personal` and "Your team's analysis hours for this month are used up. They reset on {resetsOn}." for `team`
  - [ ] When `Math.ceil(neededSeconds) > remainingSeconds` (and remaining > 0) it returns "This trim needs {x} h but only {y} h is left this month. Shorten the selection to continue." with both figures produced by `formatHoursTenths` from `./utils`
  - [ ] `tests/upload-quota-gate.spec.ts` asserts all of: unknown, zero (personal and team copy), exactly-fits, and over-by-one-second
- **notes:** Pure function, no wiring — T3 consumes it. `neededSeconds: 0` with remaining > 0 must return `null` (step 1 uses that to ask "is there any allowance at all"). No user-visible string may contain "splitstep". Model the spec on the pure-function tests in `tests/upload-identity.spec.ts` (plain import, no browser).

## T3 · Wire quotaRefusal into the provider, trim and create handlers

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (guess — handleProviderContinue ~L1631, handleTrimContinue ~L1706, handleTrimChange ~L1796, handleCreateMatch ~L2251)
- **done when:**
  - [ ] `handleProviderContinue`, after the eligibility block, calls `quotaRefusal` with `neededSeconds: 0` only when `isProcessingProvider`; a non-null result goes to `setError` and returns before `setStep` — the import-provider path reaches `setStep` without any quota call
  - [ ] `handleTrimContinue` computes `quotaRefusal` with the trimmed window's billable seconds (`processingStrategy.billableSeconds(...)`, the same figure passed to `createProcessingJob`); non-null → `setError(msg)` and no `setStep`; null → `setError(null)` then `setStep("match")`
  - [ ] `handleTrimChange` clears the error (`setError(null)`) so the refusal disappears as soon as the window changes
  - [ ] `handleCreateMatch` makes the same `quotaRefusal` call before `createProcessingJob` and returns with `setError` on a refusal
  - [ ] `wizardContinueBlocked` and `useWizardGates.ts` gain no quota term — Continue on the trim step is not disabled for over-quota — and the hook's return object exposes the step-1 refusal sentence (e.g. `providerQuotaRefusal: string | null`) for T4 to render
- **notes:** User decision: the trim-step Continue stays clickable and the error is raised ON CLICK; zero allowance blocks Advantage Intelligence at step 1; SwingVision import is unaffected. `remainingSeconds === undefined` never blocks — the server is the authority. `tests/upload-identity.spec.ts` has source-text assertions on gate wiring (~L441, L466) — keep them passing. Read docs/ui-revamp-guardrails.md first; do not change `videoStartSeconds`/`videoEndSeconds` semantics or the `duration` write in `handleTrimChange`, only add the error clear. File is 2892 lines — read by range.

## T4 · Show over-allowance in the footer meter and on the provider card

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/matches/new-match-wizard/FooterMeter.tsx, src/components/dashboard/matches/new-match-wizard/SourceStepContent.tsx (guess — the provider card may need a prop threaded through UploadWizardSteps.tsx)
- **done when:**
  - [ ] In `FooterMeter`, when priced and `selectedSeconds > remainingSeconds`, the readout contains "Over by {x} h" with x = `formatHoursTenths(selectedSeconds - remainingSeconds)` instead of the "… of … h left after" text
  - [ ] In that same state the readout text and the pending bar segment are coloured `var(--error)`, applied via inline `style`, and the `aria-label` states the overage
  - [ ] When `selectedSeconds <= remainingSeconds` (or unpriced) the rendered output is unchanged from today
  - [ ] With the Advantage Intelligence provider selected and the step-1 refusal from T3 non-null, a `noteStripCls` strip under that provider card shows the sentence; it renders nothing for the SwingVision provider or when the refusal is null
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` (then `reference/components`) and `docs/ui-revamp-guardrails.md` before building. DS type classes are unlayered and beat Tailwind colour utilities — use inline `style` for colour overrides. Buttons, if any, use `advButton()` / `rounded-[6px]`; add no new primary. Copy the existing `noteStripCls` + `XCircle` pattern from `TrimStepContent.tsx` (~L1071) or `FileStepContent.tsx` (~L439). User-visible strings say "Advantage Intelligence", never splitstep. Run the `trace-route` skill to confirm `SourceStepContent.tsx` is what `/dashboard/matches/new` step 1 renders.

## T5 · Refuse an over-allowance upload before the SAS is minted

- **status:** done
- **model:** fable
- **files:** src/app/api/splitstep/upload-url/handler.ts, src/app/api/splitstep/upload-url/route.ts, src/lib/services/splitstep/quota.ts, tests/upload-url-authorization.spec.ts (guess)
- **done when:**
  - [ ] `quota.ts` exports `peekQuota(workspace)` that uses the admin client to sum `coalesce(actual_seconds, reserved_seconds)` over `processing_usage` filtered by `account_id`, `account_type`, `billing_month` and `released = false`, takes the cap from `monthlyCapSecondsFor`, and performs no insert, update or `reserve_processing_quota` call
  - [ ] `quota.ts` exports `capRefusalMessage()` and `reserveQuota`'s refusal `message` is built by calling it, with the sentence text unchanged
  - [ ] `UploadUrlDeps` gains `loadBillableSeconds(matchId)` (reads `processing_jobs.billable_seconds`) and `remainingQuotaSeconds(workspace)`, both wired in `route.ts`; in `handleUploadUrl` the check sits after the `explainVideoRefusal` block and before `videoObjectKey()` / `deps.mintUploadSas`
  - [ ] `billable > remaining` returns status 429 with body `{ error, usedSeconds, capSeconds }` where `error` comes from `capRefusalMessage()`; a thrown or errored peek (or billable read) is logged and the handler continues to mint (fails open)
  - [ ] `tests/upload-url-authorization.spec.ts` adds three cases: over allowance → 429 with `mintUploadSas` and `recordBlobName` never called; exactly fits → 200; peek read fails → 200
- **notes:** User-approved exception to the guardrails never-touch list (2026-09-19); read-only peek, no migration, reserveQuota() at /jobs remains the authority; peek failure fails open. The 429 body's `error` travels the existing `payload.error` → `match-upload-failed` → `UploadFailureListener` path — add no new client plumbing. The `processing_jobs` row exists before this call and `billable_seconds` is already rewritten to the cut length when the browser remuxed. `@azure/storage-blob` must not reach a client bundle; keep everything new server-side. Verify column names against the live DB via the Supabase MCP, not `supabase/migrations/`. Extend the spec's existing `deps` fixture (~L117) rather than building a second one. Docs are T6 — do not edit them here. After the gate, the branch should also be run past `rls-boundary-reviewer` and `pipeline-guardrails-reviewer`.

## T6 · Record the usage gate in the guardrails and pipeline docs

- **status:** done
- **model:** sonnet
- **needs:** T3, T5
- **files:** docs/ui-revamp-guardrails.md, docs/video-pipeline-overview.md
- **done when:**
  - [ ] `docs/ui-revamp-guardrails.md` §2's entry for `upload-url/handler.ts` (~L130) states it now also peeks the allowance and answers 429 before minting, and that this was a user-approved exception dated 2026-09-19
  - [ ] `docs/ui-revamp-guardrails.md` §5's quota item (~L306) is updated to say the wizard now gates on remaining allowance (step 1 for zero, on Continue at the trim step), rather than describing it as open
  - [ ] `docs/video-pipeline-overview.md` §8 (Quota) describes `peekQuota()` as read-only and fail-open, names `reserveQuota()` at `/jobs` as still the authority, and mentions the wizard's `quotaRefusal` gate and the team meter reading `program_usage_total`
  - [ ] No file outside `docs/` changes
- **notes:** Describe what T3 and T5 actually shipped — read their commits first rather than restating the plan. §8 currently says only the `individual` tier is reachable; if that is no longer true in the code, flag it in your report but do not rewrite it in this task.

## T7 · Add jump buttons, coalesced seeks and jump-to-handle to the trim step

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx (guess — control row ~L811-875, seekBy ~L639, rail onPointerDown ~L926, readouts ~L1051-1068, applyPlayhead ~L292-306)
- **done when:**
  - [ ] The in-frame control row renders, in order, `−1m · −10s · ‹frame · play · frame› · +10s · +1m`, each new button with an `aria-label`, calling `seekBy` with ±`JUMP_STEP_SECONDS` (imported from `match-video-attachment/use-attachment-alignment.ts`) and ±a local `LONG_JUMP_SECONDS = 60`
  - [ ] `seekBy` and the rail's `onPointerDown` seek both go through `seekLatest` instead of `seekTo`
  - [ ] The Start and End timecode readouts are `<button type="button">` elements that seek to `start` / `end` respectively, carrying `focusRingCls`, with their visible text unchanged
  - [ ] `applyPlayhead` no longer sets opacity to 0 because of `draggingRef.current` (still hidden when outside the zoomed window), and its comment is updated to match
  - [ ] `clampCut`, `moveHandle`, the drag handlers' commit path, `minTrimSeconds`/`tooShort` logic and the `onTrimChange` call sites are unchanged in the diff
- **notes:** Presentation only — `videoStartSeconds`/`videoEndSeconds` semantics are guardrailed (docs/ui-revamp-guardrails.md §3.1/§4). Read `.skills/advantage-analytics-design/SKILL.md` (+ `reference/components`, `reference/focus`) and `docs/ui-revamp-guardrails.md` first. New in-frame buttons reuse the existing `controlCls` (L110) so they match the frame-step buttons; `rounded-[6px]` / `advButton()` conventions apply to anything outside the video frame; no new primary. DS type classes beat Tailwind colour utilities — keep the readouts' colour via inline `style` if a DS class is on the node. `seekLatest` already clamps and coalesces; note `seekBy` reads `el.currentTime`, which lags while a seek is in flight — base rapid jumps on `wantedSeekRef.current ?? el.currentTime` so five quick clicks move 50 s, not 10. The file is 1114 lines; T8 builds on this, so keep the diff tight.

## T8 · Add set-to-playhead buttons and step-scoped keys to the trim step

- **status:** done
- **model:** opus
- **needs:** T7
- **files:** src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx (guess — beside the readouts ~L1051-1068; handle onKeyDown ~L1019)
- **done when:**
  - [ ] "Set start here" and "Set end here" buttons sit beside the Start / End readouts and call `moveHandle("start" | "end", <video currentTime>)` — no new clamp or direct `onTrimChange` call is introduced
  - [ ] Set start is `disabled` when the playhead ≥ `end − frameStep`, and Set end is `disabled` when the playhead ≤ `start + frameStep`
  - [ ] A keydown listener scoped to the step maps `Space` → play/pause, `←/→` → ±10 s, `Shift+←/→` → ±60 s, `I` / `O` → set start / end; it returns early when `isFormControl()` (from `useWizardKeys.ts`) is true and never handles `Enter`
  - [ ] The handle elements' own `onKeyDown` calls `stopPropagation()` for arrow keys so a focused handle keeps its existing frame / 1 s nudge
  - [ ] A one-line `mono` hint listing the keys renders under the rail
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` (+ `reference/components`, `reference/focus`) and `docs/ui-revamp-guardrails.md` first. Buttons are secondary/quiet, `rounded-[6px]`, `focusRingCls` from `./styles`; no new primary (the footer Continue is the only one) and do not hand-roll a near-miss of `advButton()`. DS type classes are unlayered and beat Tailwind colour utilities — use inline `style` for colour overrides. The playhead is kept in `playheadRef` and written imperatively, so the disabled state needs a React-visible value — derive it from a throttled state or the existing `timeupdate`/`seeked` handlers rather than re-rendering per frame. If `isFormControl` is not exported from `useWizardKeys.ts`, export it rather than copying it. `Enter` stays the wizard's Continue. The real-browser spec is T9.

## T9 · Cover trim navigation with a real-browser spec

- **status:** done
- **model:** opus
- **needs:** T8
- **files:** tests/trim-step-navigation.spec.ts (new), tests/fixtures/trim-step-harness.tsx (new) (guess — modelled on tests/match-video-alignment-step.spec.ts and its harness/window fixtures)
- **done when:**
  - [ ] A new spec bundles a harness that mounts `TrimStepContent` with a fixture video from `tests/fixtures/match-video` and a recorded `onTrimChange`, using the same webpack + local-server pattern as `tests/match-video-alignment-step.spec.ts`
  - [ ] It asserts that clicking the +10 s button raises the video's `currentTime` by 10 s (clamped to duration)
  - [ ] It asserts that "Set start here" calls `onTrimChange(start = currentTime, end unchanged)`, and that the `I` and `O` keys do the same for start and end
  - [ ] It asserts that Set start is disabled once the playhead is at or past the end handle
  - [ ] No file under `src/` changes
- **notes:** No throwaway route — the alignment spec's bundle-and-serve harness is the pattern; read its first ~120 lines and its `tests/fixtures/match-video-alignment-step-harness.tsx` before writing. If `TrimStepContent` cannot mount outside the wizard provider without a `src/` change, stop and report rather than editing the component to suit the test. `npm test` also checks `MAP.md` — this task adds no route, so it should not need regenerating.

## T10 · Capture the pointer on the trim rail and handles so a fast release ends the gesture

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx (guess — window-listener effect ~L601-656, `draggingRef` mirror ~L409, `dragCtx` ~L580, `startDrag` ~L658, rail `onPointerDown` ~L1095, handle `onPointerDown` ~L1182), tests/trim-step-navigation.spec.ts
- **done when:**
  - [ ] No `window.addEventListener("pointermove" | "pointerup" | "pointercancel")` remains in `TrimStepContent.tsx`; the rail's `onPointerDown` and each handle's `onPointerDown` call `e.currentTarget.setPointerCapture(e.pointerId)` (wrapped in try/catch), and the gesture's move / release / cancel handling lives in `onPointerMove`, `onPointerUp`, `onPointerCancel` and `onLostPointerCapture` on that same element
  - [ ] Those handlers read the gesture in progress from a ref written synchronously inside `onPointerDown` (not from the `dragging` state or an effect that mirrors it — the `[dragging]` mirroring effect is removed), so a release that arrives before React re-renders still ends the gesture: afterwards `document.body.style.cursor` is back to its previous value, a scrub release has called `play()`, and a subsequent pointer move with no button held leaves `video.currentTime` alone
  - [ ] Release behaviour is otherwise unchanged in the diff: a handle release writes exactly one `onTrimChange(value.start, value.end)` followed by `seekTo` of the moved cut and nulls `liveRef`/`wantedSeekRef`; a scrub release writes no `onTrimChange`; `pointercancel` and lost capture take the same path as release; `clampCut`, `applyDrag`'s rAF coalescing, `seekLatest`, `moveHandle` and every `onTrimChange` call site are untouched
  - [ ] `tests/trim-step-navigation.spec.ts` gains a test that, inside one `page.evaluate`, dispatches a `pointerdown` and then a `pointerup` on the rail synchronously in the same task (before any microtask or re-render), then moves the mouse across the rail with no button held, and asserts the video is not paused, `document.body.style.cursor` is not `"grabbing"`, and `currentTime` did not follow the pointer; a mirror for the `Trim start` slider asserts at most one `onTrimChange` and no `ew-resize` body cursor left behind
  - [ ] The existing 16 tests in `tests/trim-step-navigation.spec.ts` pass unchanged with `--repeat-each=3`, and `npm run lint` and `npm run typecheck` are clean
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` (§3.1, §4) first — this is behaviour-only, no markup or copy change, and `videoStartSeconds`/`videoEndSeconds` semantics are guardrailed. Why the effect-based subscription loses the release: React subscribes in a passive effect after the render `setDragging` schedules, and a `pointerup` delivered before that (a click on a main thread busy decoding a large file) is never observed, so the step latches in scrub — the video never plays and every later mouse move seeks with no button held. With `setPointerCapture` every subsequent pointer event for that `pointerId` is routed to the captured element regardless of where the pointer is, so the handlers can live on the rail / handle themselves and no subscription timing exists. The body-cursor set/restore may stay wherever it is cleanest as long as restoration does not depend on the effect having run before the release. A synthetic `PointerEvent` carries no active `pointerId`, so `setPointerCapture` throws `NotFoundError` on it — hence the try/catch, which also keeps jsdom-style harnesses alive. The rail already has `touch-none` and the handle's `onPointerDown` already `stopPropagation()`s; keep both. The file is ~1330 lines — read by range. The real-browser harness is `tests/fixtures/trim-step-harness.tsx` (records `onTrimChange` via `tests/fixtures/trim-step-window.ts`); the fixture clip is 2.000 s, so assert "did not follow the pointer" against the position the move would have seeked to, not against an absolute time.

## T11 · Clear the top-player answer when the window start moves past a threshold

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (guess — `handleTrimChange` ~L1903, `handleInputChange` ~L2301, return object ~L3001), src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx (`Question` ~L294, its call site ~L1318), src/components/dashboard/matches/new-match-wizard/UploadWizardSteps.tsx (~L236-272), tests/upload-camera-answer-reset.spec.ts (new, on the `tests/upload-quota-wiring.spec.ts` pattern)
- **done when:**
  - [ ] `handleTrimChange` is the only place the clear happens (no change to `moveHandle`, the handle drag release, the `I` key or the `CutField` Set button — all four already reach it), and it sets `initialTopPlayerIsPlayer1` to `undefined` only when the new `startSeconds` differs from the start recorded when the answer was given by more than a named exported constant `TOP_PLAYER_ANSWER_RESET_SECONDS = 30`; `fixedCamera` is never written by it
  - [ ] The baseline is the window start at the moment `handleInputChange("initialTopPlayerIsPlayer1", …)` last ran (re-recorded on every answer), so the distance is cumulative: ten +10 s jumps clear it, while any number of frame nudges, ±10 s jumps and drags that stay within 30 s of that baseline do not; a call that changes only `endSeconds` never clears it, whatever the distance
  - [ ] No new Continue gate: `wizardContinueBlocked` and `useWizardGates.ts` gain no term — the existing "sleeps while `undefined`" rule is what stops Continue after a clear
  - [ ] While the answer is cleared by a start move (a hook-exposed boolean, e.g. `topPlayerAnswerStale`, true from the clear until the next answer), the "at the start" `Question`'s hint reads "Your window start moved — answer again for its new first frame" and the caption keeps its existing `required` treatment; once answered the hint returns to "At the start of your selected window — ends change every odd game", and the `Camera` question is visually unchanged throughout
  - [ ] `tests/upload-camera-answer-reset.spec.ts` drives the hook through `uploadWizardHarness` and asserts: answer then move start by 29 s → kept; by 31 s → `undefined`; three moves of 15 s from the same baseline → cleared on the third; end-only move of 600 s → kept; `fixedCamera` unchanged in every case; re-answering after a clear resets the baseline so a further 20 s move keeps it
- **notes:** Product decision (author, 2026-09-20): clear past a threshold, not always and not warn-only. Reasoning to carry: a false clear costs one click, a false keep costs every statistic (`docs/ui-revamp-guardrails.md` §4), so the rule fails safe — but clearing on a one-frame nudge would train a reflex re-click without re-checking the frame, which yields the same wrong answer the rule exists to prevent, so frame-level trimming must be left alone. Why 30 s: it is longer than every single fine-positioning step the step offers (one frame, 1 s Shift-nudge, ±10 s jump) so a "find the first serve" pass never trips it, and shorter than a change-of-ends break (~90 s) and the shortest game (~3 min), so a start repositioned across a changeover — the only move that can flip the answer — cannot slip under it; the author's ~60 s example would let a drag from mid-changeover to the next game's first serve keep a stale answer. One constant, one place to tune. Measure against the start AT ANSWER TIME, not the previous trim value, or creep by repeated small jumps never clears. Draft resume (`tests/upload-draft-resume.spec.ts`) can restore an answer with no baseline recorded — on the first trim change in that state, treat the current committed `videoStartSeconds` as the baseline rather than clearing. Read `.skills/advantage-analytics-design/SKILL.md` and the guardrails §3.1 / §4 first; the fields stay `boolean | undefined`, never defaulted; user-visible strings say "Advantage Intelligence" if the provider is named. Threading the stale flag through `UploadWizardSteps.tsx` → `TrimStepContent` mirrors how `refusal={error}` already travels. `useUploadMatchWizard.ts` is ~3000 lines — read by range. `tests/fixtures/upload-wizard-hook.ts` is the harness; extend its options only if the existing ones cannot express a state.
