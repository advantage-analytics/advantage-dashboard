# Tasks — codex/upload-flow-refinements

> Scope: Upload-flow score, identity, selection, approval, and video refinements; Save draft documentation only.

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

## T1 · Reproduce multi-set score loss

- **status:** done
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **files:** Best guess: tests/upload-score-regression.spec.ts (new), existing wizard fixtures.
- **done when:**
  - [ ] A fixture-backed one-set import reaches the real wizard and reproduces entry into sets 2 and 3, identifying whether values, focus, or submitted scores are lost.
  - [ ] Equivalent video-form and preset cases are exercised and their results recorded.
  - [ ] The reproduction uses intercepted submission and no real upload or vendor job; any expected failing assertion is explicitly reported as the intermediate result.
- **notes:** Plan 01. Reproduction only; do not claim a runtime fix. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T2 · Preserve newly entered score sets

- **status:** done
- **model:** gpt-5.6-sol
- **reasoning:** medium
- **needs:** T1
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, src/components/dashboard/matches/new-match-wizard/score-state.ts (new if needed), tests/upload-score-state.spec.ts (new), tests/upload-score-regression.spec.ts.
- **done when:**
  - [ ] Index updates extend short arrays with nulls and retain the entered values for sets 2–5 without overwriting other cells.
  - [ ] Adding a set records its first digit and active set count coherently; zero scores remain distinct from unanswered cells.
  - [ ] Short-array, clearing, and tiebreak cases pass; submitted game arrays include populated sets and existing scoring limits remain unchanged.
  - [ ] T1's value-loss reproduction passes after the fix.
- **notes:** Plan 02. Preserve preset/import provenance; do not change parsers. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T3 · Repair game-score focus order

- **status:** done
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **needs:** T2
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx, tests/upload-score-regression.spec.ts.
- **done when:**
  - [ ] Valid game entry focuses player 1 → player 2 → next set, including a newly mounted ghost set.
  - [ ] Entering an existing game cell selects its value for correction; clearing and invalid input do not advance.
  - [ ] Typing a 10–8 tiebreak keeps focus during multi-digit entry; the last game cell does not submit or focus a nonexistent input.
  - [ ] Browser assertions cover focus order, correction, ghost creation, and the final cell.
- **notes:** Plan 03. Use T2's coherent score transition and stable input identity. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T4 · Protect scores when reducing the format

- **status:** done
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **needs:** T3
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx, tests/upload-score-regression.spec.ts.
- **done when:**
  - [ ] Reducing a format that would remove populated sets requires an explicit data-loss choice.
  - [ ] Cancelling retains the original format and all scores; confirming removes only excluded sets.
  - [ ] Changing a format with no populated excluded sets needs no confirmation, and event-owned format locks remain intact.
  - [ ] Editing does not write score changes to an existing match before submission.
- **notes:** Plan 04. Prevent score loss only; no new scoring rules. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T5 · Define completion and import identity rules

- **status:** done
- **model:** gpt-5.6-sol
- **reasoning:** medium
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/validation.ts (new), src/components/dashboard/matches/new-match-wizard/types.ts, tests/upload-validation.spec.ts (new).
- **done when:**
  - [ ] Required-answer validation reports each missing hand/backhand value for both players alongside existing provider requirements without guessing defaults.
  - [ ] Identity comparison uses normalizedPersonName, accepting case/whitespace differences but requiring confirmation for missing names, initials, nicknames, punctuation differences, or different people.
  - [ ] Confirmation is bound to file generation, workspace, athlete, and imported identity; changing any key invalidates it.
  - [ ] Tests show that matching and confirmation never change attribution IDs and that empty names do not match.
- **notes:** Plan 05. Shared contracts only; no UI or parser changes. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T6 · Wire identity confirmation into wizard state

- **status:** done
- **model:** gpt-6-astra
- **reasoning:** high
- **needs:** T2, T5
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, tests/upload-validation.spec.ts, existing hook-test fixtures.
- **done when:**
  - [ ] Original parsed names remain separate from edited display names, and stale parse generations cannot replace current file results.
  - [ ] Personal and team mismatches block file progression and final submission until the current identity is confirmed.
  - [ ] Changing source, file, workspace, athlete, or re-picking a draft file resets confirmation while preserving event-owned values.
  - [ ] A negative player-1 answer permits correcting file/subject but cannot swap parser perspective; direct final-handler invocation cannot bypass required style fields.
- **notes:** Plan 06. Sensitive attribution and asynchronous state; no player-2 remapping. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T7 · Show import identity confirmation

- **status:** todo
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **needs:** T6
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx, src/components/dashboard/matches/new-match-wizard/ImportIdentityNotice.tsx (new), tests/upload-identity.spec.ts (new).
- **done when:**
  - [ ] The file step presents personal/team mismatch copy with the actual names, or explicit missing-name wording.
  - [ ] One confirmation action and a secondary change-file/player action are available; a negative answer explains the need for a correctly oriented export.
  - [ ] Click and keyboard continuation use the same blocking result, and the notice is announced accessibly.
  - [ ] Replacing the file resets the notice state; confirmation or name editing does not alter athlete IDs.
- **notes:** Plan 07. UI consumes T6's state; do not duplicate the identity predicate. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T8 · Align shared selected-option styling

- **status:** done
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **files:** Best guess: src/components/ui/float-menu.tsx, .skills/advantage-analytics-design/SKILL.md, existing shared-control tests.
- **done when:**
  - [ ] Selected rows show a Signal Blue check without persistent grey fill or grey pointer-hover fill.
  - [ ] Unselected options retain hover feedback and selected/unselected options retain visible keyboard focus.
  - [ ] Canonical Dropdown / Menu documentation describes the shipped treatment.
  - [ ] Representative consumers retain action-menu behavior; semantic success glyphs and white radio checks are unchanged.
- **notes:** Plan 08. Visual inspection of pointer and keyboard states; no unrelated menu redesign. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T9 · Order providers and align source selections

- **status:** blocked
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **needs:** T8
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/SourceStepContent.tsx, its imported EntitySelect implementation (resolve exact path), tests/upload-source.spec.ts (new if needed).
- **done when:**
  - [ ] Advantage Intelligence appears first among eligible providers on fresh entry.
  - [ ] Explicit SwingVision/source-link/draft choices and preset locks are preserved; import-only presets do not offer video.
  - [ ] Chosen provider/entity rows use the shared blue-check selection treatment.
  - [ ] Option labels remain readable and keyboard focus visible in the affected selectors.
- **notes:** Plan 09. EntitySelect path is a bounded import lookup, not a repository sweep. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T10 · Make player details editable and required

- **status:** todo
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **needs:** T4, T5, T7, T8
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx, tests/upload-player-details.spec.ts (new).
- **done when:**
  - [ ] Both players have required labeled underline MenuSelect controls for hand and backhand, with no Unknown option or guessed default.
  - [ ] Missing values are shown directly, optional 'if you know' copy is removed, and valid prefills remain editable.
  - [ ] Short backhand labels remain on one line with room for the check; narrow layouts stack fields instead of wrapping option text.
  - [ ] Editable names have visible edit affordances while schedule-owned locks remain intact.
  - [ ] Profile saving stays explicit and self-only; teammate edits do not write to the uploader profile or roster names, and missing styles block completion.
- **notes:** Plan 10. Validate the existing two side fields for doubles; no four-person metadata model. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T11 · Define reusable upload eligibility

- **status:** todo
- **model:** gpt-6-astra
- **reasoning:** high
- **files:** Best guess: src/lib/workspace/types.ts, src/lib/workspace/upload-eligibility.ts (new only if needed), tests/upload-eligibility.spec.ts (new).
- **done when:**
  - [ ] A reasoned result distinguishes pending approval, unavailable workspace, role restrictions, and invalid athlete; unknown/load-failed state does not pass.
  - [ ] An active recorded-contact program in its objection window remains eligible subject to existing policy; claim_pending is blocked.
  - [ ] An owner without a roster-player profile cannot supply athlete identity; an owner with an eligible profile may select it explicitly.
  - [ ] Personal uploads, player upload flags, suspended states, and staff scheduled-line rules retain their defined behavior.
  - [ ] Fixture tests keep video spending policy separate from provider-independent pending-approval restrictions.
- **notes:** Plan 11. Reuse existing claim capability and policy; do not recompute email matching. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T12 · Enforce roster subjects in wizard state

- **status:** todo
- **model:** gpt-6-astra
- **reasoning:** high
- **needs:** T6, T11
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, tests/upload-eligibility.spec.ts, targeted flow fixtures.
- **done when:**
  - [ ] Team creation has no generic uploader-ID fallback and offers only eligible roster subjects, including an owner's actual player profile.
  - [ ] Handler checks prevent pending teams and invalid roster subjects from progressing or creating a match.
  - [ ] Wrong-workspace, archived/merged, stale preset, and missing draft subjects return to selection without attributing the match to the uploader.
  - [ ] Subject changes invalidate import confirmation; active authorized paths and incomplete draft saving remain usable.
- **notes:** Plan 12. Serialize after T6; durable draft persistence remains out of scope. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T13 · Show approval restrictions at every entry

- **status:** todo
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **needs:** T7, T12
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx, tests/upload-approval.spec.ts (new).
- **done when:**
  - [ ] Fresh Source, preset File, and resumed File entry show the pending-approval explanation and disable Continue.
  - [ ] Button and keyboard behavior share the same eligibility result; Back, exit, and Save draft remain usable.
  - [ ] Returning to the page and submitting recheck eligibility; lookup failure offers retry without unlocking submission.
  - [ ] Refreshed approval clears only the approval restriction, and existing-match checks use the match's workspace rather than a newly selected workspace.
- **notes:** Plan 13. No redirect that hides the notice; preserve the staff line picker. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T14 · Enforce upload eligibility on direct writes

- **status:** todo
- **model:** gpt-6-astra
- **reasoning:** high
- **needs:** T11, T12
- **files:** Best guess: supabase/migrations/<new-timestamp>_upload_eligibility.sql (new), tests/upload-write-eligibility.spec.ts (new).
- **done when:**
  - [ ] After inspecting live guards, authenticated upload-match insertion rejects pending programs and staff-only athlete IDs while permitting personal uploads and eligible roster profiles, including owners with profiles.
  - [ ] The existing-match upload transition and client processing-job creation cannot bypass the same eligibility checks; tests name and exercise the actual upload-specific transitions.
  - [ ] Historical reads, unrelated historical updates, legitimate score-only entry, service-role processing, and scheduled-line/regraft protections retain their existing behavior.
  - [ ] Database tests run against local Supabase in Docker and exercise rejected direct requests and permitted cases; no production database is used for migration tests and applied migrations remain untouched.
  - [ ] The migration records rollback/application requirements; production application is not performed by this task.
- **notes:** Plan 14. User requires local Supabase in Docker for migration testing. If Docker is unavailable, report the blocker without falling back to production. Committing SQL does not apply it; production application is a separate deployment action. One database surface, no blanket ban on team edits. If distinct policies require independent work, report the split before broadening ownership; do not alter the queue autonomously. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T15 · Verify transfer authorization for the athlete

- **status:** todo
- **model:** gpt-6-astra
- **reasoning:** high
- **needs:** T11, T14
- **files:** Best guess: src/app/api/splitstep/upload-url/route.ts, existing upload-url authorization tests.
- **done when:**
  - [ ] The existing billingWorkspaceFor/explainVideoRefusal path is retained and resolves the match's workspace.
  - [ ] Pending programs, wrong-program subjects, and staff-only athletes are denied before a transfer credential is minted, including existing matches.
  - [ ] Personal and valid roster requests retain their allowed behavior; add only a demonstrated missing athlete guard.
  - [ ] Authorization tests stub credential minting and emit no real SAS credentials.
- **notes:** Plan 15. Verification may establish no source change is needed; record evidence rather than inventing a rewrite. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T16 · Verify final job eligibility before quota spend

- **status:** todo
- **model:** gpt-6-astra
- **reasoning:** high
- **needs:** T15
- **files:** Best guess: src/app/api/splitstep/jobs/route.ts, existing job authorization tests.
- **done when:**
  - [ ] Submission validates the match athlete, including older rows, against the match's billing workspace without duplicating quota policy.
  - [ ] Denied submissions neither reserve quota nor call the vendor.
  - [ ] Valid jobs retain top-player ordering, game-score payloads, trim billing, and workspace-switch behavior.
  - [ ] An authorization/submission failure does not convert a retryable uploaded job into a failed upload; vendor and quota boundaries are mocked in tests.
- **notes:** Plan 16. Add only missing enforcement; preserve the existing lifecycle. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T17 · Present video requirements before selection

- **status:** todo
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/FileStepContent.tsx, src/components/dashboard/matches/new-match-wizard/VideoRequirements.tsx (new if needed), existing file-step tests.
- **done when:**
  - [ ] Before selection, guidance states 1080p minimum, 30 fps minimum with 29.97 accepted, and 60 fps preferred.
  - [ ] A simple court guide includes both baselines, far service line, and outside-court space without inventing a measured margin or claiming automatic framing validation.
  - [ ] Supporting guidance covers file size, preferred format, singles, and complete-game trim requirements using Advantage Intelligence naming.
  - [ ] Mobile/desktop inspection confirms readable guidance that does not obscure errors/progress or introduce camera defaults.
- **notes:** Plan 17. Follow the reviewed provider guidance; no video-analysis engine. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T18 · Align existing video validation with requirements

- **status:** todo
- **model:** gpt-5.6-sol
- **reasoning:** medium
- **needs:** T17
- **files:** Best guess: src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (import tracing only), its existing video probe/validator (resolve exact path), tests/upload-video-requirements.spec.ts (new if needed).
- **done when:**
  - [ ] Existing checks are compared with current provider documentation; only demonstrated threshold/message gaps are changed.
  - [ ] Reliable known-invalid metadata is rejected, 29.97 fps is accepted, and unknown metadata remains distinct from a known violation.
  - [ ] Checks do not infer frame rate from playback timing or reject supported formats merely because MP4 is preferred.
  - [ ] Fixtures cover resolution/fps/size boundaries, unknown metadata, and actionable failure messages; contradictory provider boundaries are reported without inventing a threshold.
- **notes:** Plan 18. Reuse the existing probe; trace its import rather than creating a second implementation. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T19 · Document Save draft behavior

- **status:** todo
- **model:** gpt-5.3-codex-spark
- **reasoning:** medium
- **files:** Best guess: docs/upload-draft-behavior.md (new).
- **done when:**
  - [ ] The document answers save, resume, replacement, discard, retention, completion cleanup, and transfer-start behavior against the existing draft infrastructure.
  - [ ] Future acceptance criteria cover save failure staying put, durable subject/workspace binding, local versus server persistence, and duplicate prevention.
  - [ ] The document excludes File objects/credentials from payloads and specifies no new expiry job.
  - [ ] Recommendations are distinguished from shipped behavior; no draft persistence implementation or executable follow-up task is added.
- **notes:** Plan 19. Documentation only. Source: work/upload-flow-refinements/03_plan/output/plan.md. Execution preference: Codex Spark when supported; otherwise use the available equivalent and report the fallback. Own this surface only; other contributors may be working in the repository, so preserve their edits.

## T20 · Verify the integrated upload refinements

- **status:** todo
- **model:** gpt-6-astra
- **reasoning:** high
- **needs:** T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19
- **files:** Best guess: focused upload tests from T1–T19 (only actual coverage gaps), task-run verification record.
- **done when:**
  - [ ] Fixture-backed personal/team imports, video/preset paths, and draft resume exercise all implemented acceptance criteria.
  - [ ] Typecheck, lint, format check, Playwright, and required repository/task-review gates pass; actual skipped checks and environment limitations are explicitly reported.
  - [ ] Pointer/keyboard/narrow-screen review covers shared menus, focus, and player editability; direct-request checks cover approval and attribution independently of UI checks.
  - [ ] No parser, payload, quota, historical-data, or webhook regression is found; missing database execution is not represented as enforcement proof.
  - [ ] Migration rollout prerequisites and plan-only draft status are reported; no production upload or vendor quota is spent for verification.
- **notes:** Plan 20. Integrated verification only; do not sweep unrelated features. Source: work/upload-flow-refinements/03_plan/output/plan.md. Use a capable model for this task's state, attribution, or authorization reasoning; do not downgrade for cost alone. Own this surface only; other contributors may be working in the repository, so preserve their edits.
