# Run log — claude/upload-wizard-improvements-7ada6e

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Read the team pool for the wizard's remaining-hours figure — blocked

**gate:** mechanical FAIL (lint pass, typecheck pass, tests 1 failed / 1975 passed); completion review not run.

**reason:** `tests/upload-approval.spec.ts:369` — "switching the active workspace mid-flow does not re-decide a reused match against it" — asserts `rosterRpcCallCount` is unchanged after a workspace switch. The wizard fixture's Supabase stub (`tests/fixtures/upload-wizard-hook.ts:254`) increments `rosterRpcCallCount` on EVERY `rpc()` call regardless of name, so the task's new `program_usage_total` call (which correctly re-runs when `activeWorkspace.id` changes) is counted as a roster fetch. The product change itself met the brief: team branch reads the RPC, personal select unchanged, error path untouched, `isTrimStep` in deps, comment rewritten; `authenticated` has EXECUTE on `program_usage_total` on the live DB (verified read-only). The fix is in the fixture — count only the roster RPC by name — which sits outside the task's `files:`.

**stash:** bae6abe75c821cbc70704aa5a81ceb3303d1b870

**follow-ups:**

1. Make the fixture's `rpc` stub take the function name and count only the roster RPC; return a scalar for `program_usage_total`.
2. `program_usage_total` is now called from the browser — confirm its body is SECURITY DEFINER with a membership check (only the grant was verified).
3. `quotaAccountType` in the hook now only matters on the personal branch; could be simplified.

## T2 · Add the pure quotaRefusal gate and its spec — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (5/5 criteria met, scope clean).

**changed:** `validation.ts` exports pure `quotaRefusal()` — unknown remaining never refuses, zero allowance returns the personal/team "used up" sentence with the reset date, an over-allowance trim returns the "needs {x} h but only {y} h is left" sentence via `formatHoursTenths`; exact fit passes. New `tests/upload-quota-gate.spec.ts` covers unknown, zero (both copies), exactly-fits, over-by-one-second, and that no string says "splitstep".

**follow-ups:**

1. `capSeconds` is accepted by the signature but unused in any message — available if T3 wants a richer sentence.

## T5 · Refuse an over-allowance upload before the SAS is minted — blocked

**gate:** mechanical FAIL (lint pass, typecheck pass, tests 1 failed / 1984 passed); completion review not run.

**reason:** `tests/client-bundle-boundary.spec.ts:148` — "no client file reaches a server-only module". The task put `peekQuota()` in `src/lib/services/splitstep/quota.ts` as its criteria require, reaching the service-role client through a dynamic `import("@/lib/supabase/admin")`. But `quota.ts` is statically imported by the client hook `useUploadMatchWizard.ts` (for `accountTypeFor` / `monthlyCapSecondsFor`), and the boundary spec follows dynamic imports too: `useUploadMatchWizard.ts -> quota.ts -> src/lib/supabase/admin.ts` (six leak paths reported). A genuine boundary violation, not a harness artefact. Everything else met the brief: `capRefusalMessage()` extracted with the sentence byte-identical, both deps wired, 429 placed after `explainVideoRefusal` and before the mint, fail-open on a failed read, three new spec cases green (90/90 across the three authorization specs); column names verified read-only against the live DB. The criterion "`quota.ts` exports `peekQuota`" cannot be met as written without breaking the boundary — the task needs amending so `peekQuota` lives in a server-only module (e.g. `src/lib/services/splitstep/quota-peek.ts`), or the client-safe helpers move out of `quota.ts` first.

**stash:** 83fe4fa1897f54c2984ff8c05c5b06d595037ac8

**follow-ups:**

1. Re-add T5 with `peekQuota` in a new server-only module that imports the pure helpers from `quota.ts`; `capRefusalMessage()` can stay in `quota.ts` (pure).
2. The peek counts this match's own unreleased reservation as used, so a re-upload to an already-submitted match errs toward refusing — consider excluding the match's own job ids.
3. `loadBillableSeconds` reads the newest `processing_jobs` row for the match (`order created_at desc limit 1`); `recordBlobName` updates every row — no single-row precedent existed.
4. `getPersonalUsage` in `src/lib/data/usage-server.ts` repeats the same ledger sum and could share a helper.

## T7 · Add jump buttons, coalesced seeks and jump-to-handle to the trim step — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (5/5 criteria met, scope clean). widget-states: loading ✓ / empty ✓ unchanged by the diff, error n/a (client step, no server region).

**changed:** `TrimStepContent.tsx` — the in-frame control row now reads `−1m · −10s · ‹frame · play · frame› · +10s · +1m` (`JUMP_STEP_SECONDS` from the alignment hook, local `LONG_JUMP_SECONDS = 60`, each with an `aria-label`); `seekBy` and the rail click go through `seekLatest`, with rapid jumps based on `wantedSeekRef.current ?? el.currentTime`; `handleSeeked` now flushes a parked seek outside a drag too (required, or the last tap of a rapid sequence was dropped — reviewer judged it in scope); Start/End readouts are buttons that seek to the handle; the playhead stays visible during a drag. `clampCut`, `moveHandle`, the drag commit path, `tooShort` and every `onTrimChange` call site untouched.

**follow-ups:**

1. The control row is now eight 28px buttons (~260px); a portrait clip's player can be ~228px wide, so the row may overflow the frame — wants a wrap or min-width rule.
2. `LONG_JUMP_SECONDS` could live beside `JUMP_STEP_SECONDS` in `use-attachment-alignment.ts` if a third surface needs it.
3. PageUp/PageDown on the trim handles, matching the alignment step's rail.

## T8 · Add set-to-playhead buttons and step-scoped keys to the trim step — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (5/5 criteria met, scope clean). widget-states: loading ✓ / empty ✓ unchanged by the diff, error n/a (client step, no server region).

**changed:** `TrimStepContent.tsx` — "Set start here" / "Set end here" (`advButton("ghost", "sm")` + `focusRingCls`) beside the readouts, calling the existing `moveHandle` with `wantedSeekRef.current ?? el.currentTime`; disabled when the playhead is past the opposite handle (± one frame), fed by a 150 ms throttled `playheadTime` state mirrored from the imperative `playheadRef`. A React `onKeyDown` on the step root (`tabIndex={-1}`) maps Space play/pause, ←/→ ±10 s, Shift+←/→ ±60 s, I/O set start/end; bails on ctrl/meta/alt and `isFormControl`, leaves Enter/Escape to the wizard, and leaves Space alone on a focused button. Handles `stopPropagation()` arrows so a focused handle still nudges one frame / 1 s. Mono key hint under the rail. No new clamp, no direct `onTrimChange`.

**follow-ups:**

1. Keys fire only when focus is inside the step (click the player or rail first). If that proves too subtle, a window listener that bails on `role="slider"` targets is the alternative.
2. T9 should assert: focused-handle ArrowRight moves one frame and does not seek; click the video then Space toggles playback.
3. With Shift+arrow covering ±1 min, the `±1m` buttons could be dropped if the control row gets crowded.

## T9 · Cover trim navigation with a real-browser spec — done

**gate:** mechanical PASS on the second full run — the first run failed one unrelated live-DB test (`tests/rls-workspace-isolation.spec.ts:183`, "program A reads its own match whole"), which passed 6/6 alone and on the full re-run; the task touches no `src/` file. Completion review `VERDICT: pass` (5/5 criteria met; the third fixture file judged in scope).

**changed:** new `tests/trim-step-navigation.spec.ts` (7 tests) with `tests/fixtures/trim-step-harness.tsx` and `tests/fixtures/trim-step-window.ts`, on the alignment spec's webpack bundle-and-serve pattern; `TrimStepContent` mounts directly from props, no provider and no `src/` change. Covers: jump buttons vs frame step, the step's own clamp against a declared 1 s duration, arrow / Shift-arrow keys, "Set start here" → `onTrimChange(≈playhead, end unchanged)`, `I` then `O` round-tripping through the form, Set start disabled at and past the end handle (and re-enabled on return), and the mirror for Set end. Fixture clip is 2.000 s, so +10 s is asserted as a clamp. `--repeat-each=3` → 21/21.

**follow-ups:**

1. `tests/rls-workspace-isolation.spec.ts` flaked once under the full suite (live Supabase, shared sign-in rate limit) — not this branch's change.
2. Three browser specs now duplicate ~70 lines of bundle-and-serve plumbing; a shared `tests/fixtures/browser-harness.ts` would collapse them.
3. A ~30 s fixture clip would let +10 s be asserted as arithmetic and give the hold-to-zoom drag path (needs ≥45 s) any browser coverage at all.
4. Space play/pause and the Space-on-a-focused-button guard are untested.

## T1 · Read the team pool for the wizard's remaining-hours figure — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (5/5 criteria met). Unblocked by the author on 2026-09-19: stash `bae6abe7` re-applied plus an authorized fixture fix outside `files:`.

**changed:** `useUploadMatchWizard.ts` — the remaining-quota effect reads `program_usage_total` for a team workspace (the table read is RLS-scoped to the caller's own rows), keeps the four-filter `processing_usage` select for personal, leaves the figure untouched on an RPC error, and re-runs on arriving at the trim step (`isTrimStep` in deps); doc comment rewritten. `tests/fixtures/upload-wizard-hook.ts` — the `rpc()` stub returns a scalar for `program_usage_total` and no longer counts it as a roster fetch, which is what failed `tests/upload-approval.spec.ts:369` the first time.

## T5 · Refuse an over-allowance upload before the SAS is minted — done

**gate:** mechanical PASS on the second full run — the first failed one unrelated timing test (`tests/match-video-attachment-flow.spec.ts:848`, "unmounting mid-upload cancels the attempt"), which passed 60/60 alone with `--repeat-each=3` and on the full re-run. Completion review `VERDICT: pass` (5/5 criteria met, scope clean). Unblocked by the author on 2026-09-19: stash `83fe4fa1` re-applied plus an authorized amendment to criterion 1.

**changed:** `quota.ts` — pure `capRefusalMessage()` (sentence byte-identical, `reserveQuota` now calls it) and read-only `peekQuota(supabase, workspace, now?)`, keyed and summed exactly as `reserve_processing_quota`. Amendment: the client is a PARAMETER, the idiom `reserveQuota`/`releaseQuota`/`reconcileQuota` already use, so `quota.ts` imports no service-role factory and `tests/client-bundle-boundary.spec.ts` passes. `upload-url/handler.ts` — new deps `loadBillableSeconds` and `remainingQuotaSeconds`; after `explainVideoRefusal` and before the mint, `billable > remaining` → 429 `{ error, usedSeconds, capSeconds }`; a null or thrown read is logged and fails open. `route.ts` wires both, handing `peekQuota` its `adminClient()`; billable seconds come from the newest `processing_jobs` row for the match. Three new cases in `tests/upload-url-authorization.spec.ts`. No migration; `reserveQuota()` at `/jobs` remains the authority.

**follow-ups:**

1. The peek counts this match's own unreleased reservation as used, so a re-upload to an already-submitted match errs toward refusing.
2. `getPersonalUsage` in `src/lib/data/usage-server.ts` repeats the same ledger sum and could share a helper with `peekQuota`.
3. `tests/match-video-attachment-flow.spec.ts:848` flaked once under full-suite load — not this branch's change.

## T3 · Wire quotaRefusal into the provider, trim and create handlers — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (5/5 criteria met; fixture + wiring spec judged in scope).

**changed:** `useUploadMatchWizard.ts` — `providerQuotaRefusal` (computed only for a processing provider, exposed on the return object and type) stops `handleProviderContinue` at zero allowance while the import path makes no quota call; `refusalForWindow()` feeds `processingStrategy.billableSeconds()` — the figure `createProcessingJob` is handed — into `quotaRefusal`; `handleTrimContinue` sets the error and stays, or clears it and advances; `handleTrimChange` clears the error; `handleCreateMatch` re-checks with its other pre-flight checks, before the match row is written. No quota term in `wizardContinueBlocked` or `useWizardGates.ts`. `tests/fixtures/upload-wizard-hook.ts` gains `billableSeconds`/`minTrimSeconds` on the stub strategy and a `quotaCapSeconds` option; new `tests/upload-quota-wiring.spec.ts` (4 tests).

**follow-ups:**

1. IMPORTANT — the hook's `error` string is rendered ONLY on the match-details step (`DetailsStepContent.tsx` ~L1274, fed from `MatchStep` in `UploadWizardSteps.tsx`). On the trim step `setError()` is invisible, so an over-allowance Continue click currently looks like a dead button. T4 renders `providerQuotaRefusal` on step 1 but nothing covers the trim step — needs a task: render `error` on the trim step (a `noteStripCls` strip in `TrimStep`/`TrimStepContent`).
2. The client figure is refreshed on arriving at the trim step only; a teammate spending the pool before Save is caught by the server 429 (T5), by design.
3. `processingStrategy` is rebuilt every render, so `refusalForWindow`'s `useCallback` never memoizes — harmless today.

## T4 · Show over-allowance in the footer meter and on the provider card — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (4/4 criteria met, scope clean). widget-states: loading ✓ / empty ✓ unchanged — `WizardQuotaMeter`'s `null` for an unknown allowance or an import provider is untouched, the unpriced/under-allowance `FooterMeter` markup is byte-identical (asserted), the step-1 strip renders nothing while the allowance is unresolved; error n/a (client components, no server region).

**changed:** `FooterMeter.tsx` — when the trimmed window costs more than is left, the readout reads `Spends {n} h · Over by {x} h`, readout and pending bar are `var(--error)` via inline style, and the `aria-label` states the overage; exact fit is not "over", matching `quotaRefusal()`. `SourceStepContent.tsx` — new optional `quotaRefusal` prop rendered as a `noteStripCls` + `XCircle` strip with `role="alert"` in the Source field's existing `below` slot (step 1 is an `EntitySelect`-style field, not a card grid), after the import and pending-team branches so it cannot show for SwingVision. `UploadWizardSteps.tsx` threads `providerQuotaRefusal`. New `tests/footer-meter-overage.spec.ts` (5 assertions, `renderToStaticMarkup`).

**follow-ups:**

1. STILL OPEN — the trim step has no display for the hook's `error`, so the over-allowance refusal raised on Continue is invisible there (see T3's log entry). Needs its own task.
2. Step 1 shows one strip at a time: a workspace with an advisory video refusal AND a spent allowance now shows only the quota sentence.
3. The meter bar clamps at full, so a 3× overage draws the same red bar as a 1-second one; the readout carries the magnitude.

## T6 · Record the usage gate in the guardrails and pipeline docs — done

**gate:** mechanical PASS (lint, typecheck, full test suite); completion review `VERDICT: pass` (4/4 criteria met; every factual claim checked against the shipped code).

**changed:** `docs/ui-revamp-guardrails.md` — §2's `upload-url/handler.ts` entry now names the read-only allowance peek, with a callout recording the user-approved exception dated 2026-09-19 (position in the ladder, 429 body, fail-open, `reserveQuota()` at `/jobs` still the authority); §5's quota item closed in the doc's struck-through "Done, date" convention, describing the step-1 and trim-Continue gates, the meter's "Over by x h", and — stated as a known gap — that the trim-step refusal is set but not yet displayed. `docs/video-pipeline-overview.md` §8 — `peekQuota()` (read-only, fail-open), the wizard's `quotaRefusal` gate, and the team meter reading `program_usage_total`.

**follow-ups:**

1. `docs/video-pipeline-overview.md` §8's closing paragraph ("Only the `individual` tier is reachable … no membership to read") is stale: `quotaTierFor()` returns `"program"` for a verified collegiate team. Left untouched as the task instructed; wants a one-paragraph correction.
2. STILL OPEN — render the hook's `error` on the trim step (see T3 and T4 entries); the guardrails doc now records it as a known gap, so close that sentence when it lands.
