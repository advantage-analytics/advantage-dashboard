# Run log — claude/workspace-creation-no-account-70909e

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T2 · Create the shared onboarding answer vocabulary with an offline spec — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New pure module `src/app/onboarding/answers.ts` — `RECORDING_SOURCES`, `ACQUISITION_SOURCES` (player/coach labels from the canvas), `ROSTER_SIZE_BANDS`, `WEEKLY_FILM_BANDS`, `ACQUISITION_DETAIL_MAX`, derived types, four guards, `providerForRecordingSource()`. New offline spec `tests/onboarding-answers.spec.ts` (24 tests) covering the provider mapping, guard rejection and the coach-vs-player label rule.

## T1 · Add onboarding intake columns, `set_program_intake` RPC and `Viewer.recordingSource` — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `supabase/migrations/20260926182506_onboarding_intake_answers.sql` — applied live as `onboarding_intake_answers` (version 20260926182506): `users.recording_source / acquisition_source / acquisition_source_detail`, `programs.roster_size_band / weekly_film_band`, six null-allowing check constraints, column comments, and owner-gated `set_program_intake(uuid,text,text)` (security definer, `search_path = ''` mirroring `update_program_settings` rather than the task's literal `public`; anon revoked). Advisors before/after: only delta is the new function in the expected authenticated-SECURITY-DEFINER lint class. `Viewer.recordingSource` added and mapped through `isRecordingSource`; six `Viewer` fixture literals gained `recordingSource: null` for typecheck.
**follow-ups:** 1. T4's action should surface the RPC's 42501 as "only the owner can answer this" and validate bands with the `answers.ts` guards before calling. 2. A shared `viewerFixture()` under `tests/fixtures` would make the next `Viewer` column one edit instead of six.

## T3 · Add onboarding steps 1.5 and 1.7 and persist the answers — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `onboarding-flow.tsx` — `Step` 1–6; eyebrows "Step 1"/"Step 2"/"Step 3–5 of 5"; step 3 Continue and Skip advance to step 5; step 5 = three recording-source cards from `RECORDING_SOURCES` (FileSpreadsheet/Video/Smartphone, 840px); step 6 = two-column heard-about rows with the "Somewhere else" reveal ("Where?", 120 max), "Go to my dashboard", Skip stores nulls; PostHog `setPersonProperties` + `onboarding_completed` before the action; 1.3/1.4 "allowance" copy. `actions.ts` — `parseIntake` validates the enums and detail rule with plain errors; the three columns are written in the same update as `onboarded_at`.
**follow-ups:** 1. `src/components/claim/role-choice.tsx:39` still says "one shared budget" — same card copy as 1.3, outside this task's files. 2. On the college path the last button reads "Go to my dashboard" but lands on `/claim/program?intent=join`; consider "Continue" or "Find my program" for `college === "yes"`. 3. The coach exit sends no `onboarding_completed` event (path kept unchanged by spec).
