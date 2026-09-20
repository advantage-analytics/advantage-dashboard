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
