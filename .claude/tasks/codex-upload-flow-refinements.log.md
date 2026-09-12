# Run log — codex/upload-flow-refinements

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Reproduce multi-set score loss — blocked

**gate:** Mechanical: lint and tsc passed; full keyless npm test passed (632 passed, 61 skipped). Initial Chromium launches were sandbox-denied; rerun with launch permission passed. Completion: VERDICT: needs-work. Tests called buildMatchData directly with manually seeded arrays, without mounting the real wizard, importing a fixture, entering score cells, or intercepting an actual wizard submission. Preset/video helper cases likewise did not exercise the required paths. Pipeline and RLS guardrails were not dispatched: completion failed first; changed production surfaces: none.

**changed:** Attempted utility-level regression test preserved in stash `7655ffd7af541b1284f2e0ea715702c82e3c25e0`; no task code committed. It demonstrates possible stale numberOfSets submission truncation, not the required UI reproduction. Task implementation and completion review used GPT-5.6 Terra because GPT-5.3 Codex Spark is unavailable in this session's subagent tool. Retry needs actual wizard coverage. No production writes, uploads, or vendor calls occurred.

## T5 · Define completion and import identity rules — blocked

**gate:** Mechanical: lint, tsc, and npm test passed after running the test step with empty Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` set to empty, escalated launch to allow browser execution). Completion review: VERDICT: needs-work due one criterion. `pipeline-guardrails-reviewer` and `rls-boundary-reviewer` were not dispatched (completion failed first).

**changed:** Added shared identity/completion validation contracts in `src/components/dashboard/matches/new-match-wizard/types.ts`, new helpers in `src/components/dashboard/matches/new-match-wizard/validation.ts`, and coverage in `tests/upload-validation.spec.ts`; blocked by missing assertion that successful/failed identity matching and confirmation preserve attribution IDs, so changes were stashed to `6366f4a6717e7bc82ee168ebb294372ca4cf8c5e`.

## T1 · Reproduce multi-set score loss — blocked

**gate:** Mechanical: lint, tsc, and the focused regression spec passed; full keyless npm test passed after rerunning outside the macOS Chromium sandbox (622 passed, 61 skipped). Completion: VERDICT: needs-work. The test calls `buildMatchData` with manually seeded arrays instead of mounting the real wizard, loading a fixture, entering sets 2 and 3, checking focus, and intercepting the wizard submission boundary. Pipeline and RLS guardrails were skipped because the completion stage failed first.

**changed:** Preserved the utility-level regression test in stash `dd56d35fdbfb37cd201e339f020850989fe45fe9`; no task code was committed. The test documents score truncation at the submission builder but does not satisfy the required real-wizard reproduction. No upload, production database write, or vendor job occurred. GPT-5.3 Codex Spark was requested by the task but was unavailable to this session's subagent tooling, so the prior implementation/review used the available fallback.

## T8 · Align shared selected-option styling — done

**gate:** Mechanical: lint, tsc, and the full keyless npm test passed; Chromium was rerun outside the macOS sandbox after the sandbox-only launch denial. Completion: VERDICT: pass. Pipeline guardrails were skipped because the diff does not touch `src/app/dashboard/`, `src/components/dashboard/`, or the upload wizard. RLS guardrails were skipped because the diff does not touch Supabase, data, API, migration, table, view, or query surfaces.

**changed:** Updated `FloatMenuItem` so a chosen option is marked by its Signal Blue check without a persistent or pointer-hover grey fill, while unchosen pointer hover and keyboard focus feedback remain. Updated the canonical Dropdown / Menu documentation and added focused coverage for selected-option and action-menu semantics. Semantic success glyphs and white radio checks are unchanged. The implementation and completion review used GPT-5.6 Terra at medium because GPT-5.3 Codex Spark is unavailable in this session's collaboration tool.

## T9 · Order providers and align source selections — blocked

**gate:** Mechanical: lint, tsc, and the full keyless npm test passed; Chromium was rerun outside the macOS sandbox after the sandbox-only launch denial. Completion: VERDICT: needs-work because selected athlete/entity rows lost their persistent wash but still render no Signal Blue check, so the shared chosen-row treatment is incomplete. Pipeline and RLS guardrails were not dispatched because the completion stage failed first.

**changed:** Attempted provider ordering, selected source/entity styling, label wrapping protection, and focused source coverage are preserved in stash `515e1654de13f31db1580f7ee515dd8554a24827`; no task code was committed. Retry must add the shared blue-check indicator to chosen athlete/entity rows and prove it in coverage while retaining source-link, draft, preset, and action behavior. GPT-5.3 Codex Spark was requested but unavailable in this session's collaboration tool, so GPT-5.6 Terra medium was used.

## T1 · Reproduce multi-set score loss — done

**gate:** Mechanical: lint, tsc, and the full keyless npm test passed; Chromium was rerun outside the macOS sandbox after the sandbox-only launch denial. The focused real-wizard browser suite passed all 3 import, video, and preset cases. Completion: VERDICT: pass. Pipeline guardrails: CLEAR, no findings; the harness is production-inaccessible and changes no parser, attribution, trim, upload, or vendor behavior. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** Added a development-only wizard reproduction route that mounts the real `UploadMatchFlow`, regenerated `MAP.md`, and replaced the utility simulation with fixture-backed Playwright coverage. One-set import and preset paths show focus advancing while sets 2 and 3 are discarded and submissions contain `[6,0,0]` / `[4,0,0]`; the video control retains and submits `[6,6,6]` / `[4,3,2]`. The test runs only against localhost and intercepts auth and match creation while blocking all other upload, Azure, vendor, and external traffic. No runtime fix was included. GPT-5.3 Codex Spark was unavailable in this session's collaboration tool, so GPT-5.6 Terra medium was used.

## T5 · Define completion and import identity rules — blocked

**gate:** Mechanical: lint, tsc, the focused 9-test validation suite, and the full keyless npm test passed; Chromium was rerun outside the macOS sandbox after the sandbox-only launch denial. Completion: VERDICT: needs-work because `IdentityConfirmationScope` and `buildImportIdentityConfirmationKey()` omit `importedAthleteId`, allowing a changed imported attribution ID with the same normalized name to retain stale confirmation. Pipeline and RLS guardrails were not dispatched because the completion stage failed first.

**changed:** The restored validation contracts and new attribution-preservation assertions are preserved in stash `3bfb6bc212b46e8d9078478bd4b9f72fbbd67c4b`; no task code was committed. The retry now proves matching, mismatch, and confirmation paths preserve both attribution IDs, but the confirmation key must also bind `importedAthleteId` and invalidate when it changes.

## T5 · Define completion and import identity rules — done

**gate:** Mechanical: lint, tsc, the focused 9-test validation suite, and the full keyless npm test passed; Chromium was rerun outside the macOS sandbox after the sandbox-only launch denial. Completion: VERDICT: pass. Pipeline guardrails: CLEAR, no findings. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** Added pure completion requirements for both players' required hand/backhand values; normalized import identity comparison; and confirmation keys bound to file generation, workspace, athlete, imported athlete ID, and normalized imported identity. Tests cover case/whitespace matching, missing/initial/nickname/punctuation/different-name confirmation, every key invalidation, empty-name behavior, and preservation of both attribution IDs. No UI, parser, API, database, or runtime wiring changed.

## T2 · Preserve newly entered score sets — done

**gate:** Mechanical: lint and tsc passed; the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database tests skipped. Focused score-state and validation coverage passed 44 tests, and the real-wizard import, video, and preset regression suite passed all 3 cases. Completion: VERDICT: pass. Pipeline guardrails: CLEAR, no findings. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** Added an atomic score-state transition that null-pads short arrays, preserves other cells and meaningful zeroes, retains scoring bounds, and advances the active set count with the first entered digit. Wired the wizard to that transition and added focused coverage through set five, clearing, tiebreaks, bounds, submitted arrays, and the T1 real-wizard paths. Preset/import provenance and parsers are unchanged.

**follow-ups:** 1. T3 can remove the redundant ghost-cell `onSetsChange` call and use the atomic transition while repairing focus behavior.

## T3 · Repair game-score focus order — blocked

**gate:** Mechanical: lint and tsc passed; the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database and localhost-harness tests skipped. Completion: VERDICT: needs-work because the focused browser run timed out in the existing source-selection helper before any new focus assertions executed, so the browser-proof criterion remains unmet. Pipeline and RLS guardrails were not dispatched because completion failed first.

**changed:** The attempted ScoreBlock focus-order fix and browser assertions for correction selection, invalid/cleared no-advance behavior, ghost-set mounting, tiebreak entry, and final-cell retention are preserved in stash `d07abfbca6e152ff20d440f420a7631f5e9f8424`; no task code was committed. Retry must repair the harness/source-selection setup and run the focused browser case through its score assertions. GPT-5.3 Codex Spark was unavailable in this session's collaboration tool, so GPT-5.6 Terra medium was used.

## T3 · Repair game-score focus order — done

**gate:** Mechanical: lint and tsc passed; the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database and localhost-harness tests skipped there. The focused real-wizard browser suite ran separately against `localhost` and passed all 4 cases. Completion: VERDICT: pass. Pipeline guardrails: CLEAR, no findings. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** Restored the saved T3 implementation, corrected the focused harness URL so Next hydrates the interactive flow, and verified game-score focus advances player 1 to player 2 to the next mounted set. Existing values select for correction, clearing and invalid values stay focused, tiebreaks accept multi-digit entry without advancing, and the final game cell neither submits nor targets a nonexistent input. GPT-5.3 Codex Spark was unavailable in this session's collaboration tool, so GPT-5.6 Terra medium was used.

## T4 · Protect scores when reducing the format — done

**gate:** Mechanical: lint and tsc passed; the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database and localhost-harness tests skipped there. The focused real-wizard browser suite ran separately and passed all 6 cases. Completion: VERDICT: pass. Pipeline guardrails: CLEAR, no findings. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** Added an explicit confirmation before a format reduction discards populated game or tiebreak sets. Cancelling preserves the original format and scores; confirming trims only excluded sets; empty reductions proceed directly; and event-owned format/scoring remain read-only. Score edits stay in local wizard state until the existing submission boundary. GPT-5.3 Codex Spark was unavailable in this session's collaboration tool, so GPT-5.6 Terra medium was used.

## T6 · Wire identity confirmation into wizard state — blocked

**gate:** Mechanical: lint and tsc passed; the focused hook/score suite passed 29 tests; and the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database tests skipped. Completion: VERDICT: pass. Pipeline guardrails blocked on one scoring-provenance finding: a preset with no event-owned `adScoring` can preserve the previous import's value when a replacement file supplies a different value. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** The identity-state wiring, stale-generation guards, reset behavior, required-style enforcement, and deterministic hook coverage are preserved in stash `5c280ba5dcb6bb12dba7499f220480c0b1620204`; no task code was committed. Retry must preserve scoring only when the attached event actually supplies it and cover replacement files when event scoring is unspecified.

## T6 · Wire identity confirmation into wizard state — done

**gate:** Mechanical: lint and tsc passed; the focused hook/score suite passed 30 tests; and the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database tests skipped. Completion: VERDICT: pass. Pipeline guardrails: CLEAR, no findings. RLS guardrails were skipped because no Supabase/data/API/migration/query boundary changed.

**changed:** Restored and completed identity confirmation state with original parsed names kept separate, stale async generations rejected, personal/team mismatch gates applied to progression and submission, context changes invalidating confirmation, parser perspective preserved, and required styles enforced at the final handler. The provenance repair now preserves scoring only when the event explicitly owns it; replacement imports can update unspecified scoring, including when an attached line changes during parsing.

## T7 · Show import identity confirmation — blocked

**gate:** Mechanical: lint and tsc passed; the focused validation suite passed 30 tests; the implementation run reported 2 passing real-wizard identity cases; and the full keyless npm test passed after rerunning outside the macOS sandbox, with live-database and localhost-harness tests skipped. Completion: VERDICT: needs-work because browser coverage exercises only the personal harness and does not prove team-workspace copy, missing-name wording, or athlete-ID preservation; the reviewer also could not reproduce the localhost-only run without its server. Pipeline and RLS guardrails were not dispatched because completion failed first.

**changed:** The identity notice, file-step integration, accessible announcement, confirmation/rejection actions, keyboard/button blocking, and personal-flow browser coverage are preserved in stash `7f7ba6ca5ab5a519dd174c620551fd20b676fdc2`; no task code was committed. Retry must add executable real-wizard coverage for team wording, missing imported names, and unchanged athlete IDs across confirmation/name editing. GPT-5.3 Codex Spark was unavailable in this session's collaboration tool, so GPT-5.6 Terra medium was used.

## T11 · Define reusable upload eligibility — blocked

**gate:** Mechanical: lint, `tsc --noEmit`, and the full keyless `npm test` all passed (770 passed, 6 skipped); no stale `.next/` retry was needed. Completion: VERDICT: pass, with all five `done when:` lines matched to specific tests and the five out-of-list call-site edits judged compiler-forced rather than drift. Pipeline guardrails: CLEAR, no findings — the three vendor attribution inputs and `job-request.ts` are absent from the diff, and nothing outside the new module's own test imports it. RLS guardrails: BLOCKED on one finding — the new module's header docstring describes `uploadEligibility()` in present tense as already consulted by "the wizard before it lets someone continue, the wizard again before it writes, and the two video routes," while the function has zero callers outside its test; read on its own, the file claims an enforcement integration that T12–T14 have not built yet. The same reviewer cleared every other boundary: no `admin.ts` import, no migration, no new table or view, the `programStatus` column sourced from the same already-RLS-readable `programs` row as the pre-existing `canSubmitVideo`, and webhook/cron auth untouched.

**changed:** The eligibility contract is preserved in stash `02c3a59856799f42a37947b183ed9abd314c36fe`; no task code was committed. It adds `src/lib/workspace/upload-eligibility.ts` (a pure `uploadEligibility()` reasoner returning nine distinguished refusal reasons, with `approval-unknown`/`roster-unknown` marked retryable, plus `ownRosterIdentity()`), a non-optional `Workspace.programStatus: ProgramStatus | null` in `src/lib/workspace/types.ts` to separate the approval question from `canSubmitVideo`'s video-spend question, 41 fixture-driven keyless tests in `tests/upload-eligibility.spec.ts`, and one compiler-forced field at each of five `Workspace`-literal call sites. Retry needs only the header paragraph rewritten to future tense naming T12–T14 as the planned consumers, then a re-gate.

**follow-ups:**

1. For T12: `program_roster_full`'s first arm excludes a `program_players` row claimed by a staff member, and `myPlayerId` is null for staff, so `getRosterPlayerOptions()` will never surface an owner's own claimed profile — T12 needs an extra read mirroring `claimedProfilesByProgram()` to offer that row, which the contract already accepts once present.
2. For T15/T16: an older row whose `player1_id` is a claimed player's login id resolves to the profile id in the eligibility result — compare people, not strings, and do not write the resolved id back.
3. `explainVideoRefusal()` still says "still being confirmed" for a suspended program; pre-existing wording, now distinguishable via the new `programStatus` field.

## T17 · Present video requirements before selection — done

**gate:** Mechanical: lint, `tsc --noEmit`, and the full keyless `npm test` all passed; no stale `.next/` retry needed. Completion: VERDICT: pass — every figure traced to `02_design/output/design.md` and `01_brief/output/brief.md` rather than invented, and the "does not obscure errors/progress" line verified structurally in the JSX rather than taken on the implementer's word. Pipeline guardrails: CLEAR, no findings — the three vendor inputs (`initialTopPlayerIsPlayer1`, set-score ordering, `fixedCamera`) have zero diff, `TrimStepContent.tsx` remains their sole owner, and the new camera-placement copy describes physical setup for image quality without implying an answer to the step-4 end-of-court question. RLS guardrails were skipped because no Supabase client, data loader, API route, migration or query changed.

**changed:** Added `src/components/dashboard/matches/new-match-wizard/VideoRequirements.tsx` — a presentational panel carrying the spec line (1080p minimum, 30 fps minimum with 29.97 accepted, 60 fps preferred), an inline-SVG court-framing schematic showing both baselines, the far service line and unlabelled space beyond the court, and four requirement rows covering camera position, framing, singles plus complete-game trim, and file size/format (under 8 GB, MP4/H.264 preferred without narrowing accepted formats). The schematic states no measured margin and carries the caption "A guide, not a check — nothing here confirms the framing," so it makes no automatic-validation claim. `FileStepContent.tsx` renders it on the video branch in place of the removed inline `VIDEO_REQUIREMENTS` array, after every error and progress strip in render order; the SwingVision/export branch and `EXPORT_REQUIREMENTS` are untouched. Inspected at 1440px and 390px via the existing `src/app/wizard-reproduction/` harness, including a forced probe-error path to confirm the panel sits below the error notice; no throwaway route was added and the inspection screenshots were removed before hand-off.

**follow-ups:**

1. T18 should compare the probe's thresholds against this copy. Note `src/lib/video/probe.ts` already lists 29.97 in `STANDARD_FPS` and snaps within a 2% tolerance, so that criterion may already be satisfied by shipped code — a verify-not-rewrite.
2. T18's criterion "checks do not infer frame rate from playback timing" may conflict with the shipped probe, which estimates fps by observing 20 frames over a 2-second sample window. Whether it conflicts depends on whether the sampler reads per-frame `mediaTime` or wall-clock; if it is genuinely wall-clock, T18 should report the contradiction rather than invent a threshold.
3. The `wizard-reproduction` harness 500s on a second direct navigation once its fixture auth cookie is set — `getClaims()` in `src/lib/supabase/middleware.ts` rejects a JWT payload with no `exp` claim. The real Playwright spec is unaffected because it controls the cookie lifecycle via `addInitScript`, but a manual inspection trips on it; adding `exp` to the harness fixture payload would fix it.

## T11 · Define reusable upload eligibility — done

**gate:** Retry of the run blocked above; the stashed work (`02c3a598…`) was restored onto a clean tree after T17 landed and applied without conflict. Mechanical: lint, `tsc --noEmit`, and the full keyless `npm test` all passed (770 passed, 6 skipped). Completion: VERDICT: pass — all five `done when:` lines re-verified against unchanged code and tests, and the documentation fix checked in both directions, confirming it did not overcorrect into denying true properties. Pipeline guardrails: CLEAR, no findings — attribution re-verified rather than inherited (`self` refused in a team workspace, the resolved athlete always echoing the matched roster row's `playerId`, a staff login failing at `athlete-not-on-roster`), and the three vendor inputs plus `job-request.ts` absent from the diff. RLS guardrails: CLEAR — the prior run's sole finding is resolved, with zero production callers independently confirmed by grep, no `admin.ts` import, no migration, no new table or view, `programStatus` still sourced from the same RLS-scoped `.eq("user_id", userId)` query that already read `programs.status`, and `claim-state.ts` confirmed dependency-free so the new type-only import cannot drag server code into a client bundle.

**changed:** Only comments changed from the blocked run — no code, tests or types moved. Seven passages across `upload-eligibility.ts` and `types.ts` were rewritten from present into future tense: the header now opens "NOT YET WIRED IN," names T12–T16 as the planned consumers, and states that attribution remains enforced solely by the `matches_block_client_regraft` trigger and RLS until those land. The retry's own sweep found four overclaims beyond the three fixed by hand — the §4 LINE comment, the `ProgramApprovalReading` doc, the `retryable` field doc, the `PENDING_APPROVAL_NOTICE` doc, and the `explainVideoRefusal()` addendum in `types.ts`. The contract itself is unchanged: a pure `uploadEligibility()` returning nine distinguished reasons with only `approval-unknown` and `roster-unknown` retryable, `ownRosterIdentity()`, a non-optional `Workspace.programStatus`, 41 fixture-driven keyless tests, and one compiler-forced field at each of five `Workspace`-literal call sites.

**follow-ups:**

1. `LINE_REQUIRES_STAFF_REFUSAL` (`upload-eligibility.ts:207`) is documented as reading "exactly as" what `explainWriteFailure()` renders for the 42501, but it carries a trailing period the rendered string does not. Verified against the **live** database this run, not the migration file: `matches_block_client_regraft` raises `only a program's staff can attach a match to a scheduled line` with no full stop, and `capitalize()` (`src/lib/utils.ts:12`) adds no punctuation. Either drop the period from the constant so the two genuinely match, or soften the comment to say a full stop is added for UI copy. Nothing renders the constant yet, so this is free to change until T13 wires it in.
2. For T12: `program_roster_full`'s first arm excludes a `program_players` row claimed by a staff member, and `myPlayerId` is null for staff, so `getRosterPlayerOptions()` will never surface an owner's own claimed profile — T12 needs an extra read mirroring `claimedProfilesByProgram()` to offer that row, which the contract already accepts once present.
3. For T15/T16: an older row whose `player1_id` is a claimed player's login id resolves to the profile id in the eligibility result — compare people, not strings, and do not write the resolved id back.
4. Once T12–T16 land, the "NOT YET WIRED IN" header and the T-number references in the rewritten comments should be collapsed back to present tense in one pass, ideally by the last of those tasks.
