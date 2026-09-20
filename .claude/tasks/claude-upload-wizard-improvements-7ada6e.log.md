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
