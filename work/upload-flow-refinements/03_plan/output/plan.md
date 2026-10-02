# Upload flow refinements — implementation plan

## Scope and execution rules

Implement the reviewed stage-02 design within the stage-01 brief. The user's
re-invocation advances the recommended design: both players need known hand and
backhand values; an owner may select a genuine eligible roster-player profile,
but ownership never supplies an athlete identity. Selected dropdown rows use blue
checks without grey selection/pointer-hover fill; keyboard focus remains visible.

Save draft is a documented behavior plan, not a persistence implementation in this
feature. Existing draft entry must still obey the new approval, identity, and required
field rules. No player-2 import remapping, four-person doubles metadata model, new
state framework, or video-analysis engine. No changes to claims matching, existing
match records, SwingVision parsers/validators, statistics, webhook handling, or quota
semantics. Do not expand format-change work beyond preventing score loss.

Each numbered step fits one fresh implementation-agent context. Separate tasks that
touch the large wizard hook or details component must run sequentially. An agent owns
only its listed surface and must preserve other contributors' changes. Prefer Codex
Spark for steps marked **Spark** when callable through the actual execution mechanism;
do not silently claim to use it if unavailable or create separate user tasks to obtain
it. Use an available model as fallback. Steps marked **deep review** concern identity,
authorization, or coordination across asynchronous state and warrant a more capable
model. These are execution preferences, not permission to bypass the task runner.

Paths below are repository-relative. Proposed helper/test files are explicitly marked
new; implementation may use an existing equivalent after checking for one. Every task
must read its applicable repository guidance, re-trace its route, and consult the
installed Next.js guide if changing framework code. No application code is written
by this stage.

## Ordered steps

### 01. Reproduce multi-set score loss — Spark

**Files:** new `tests/upload-score-regression.spec.ts`; reuse existing wizard fixtures
after locating the project's test harness.

**Change:** reproduce a one-set import followed by typing sets 2 and 3. Record the
entry route and whether the failure is a dropped value, focus problem, or submission
truncation. Cover the same hook via a video form and a preset fixture. Use fixture
files and intercepted submission, not a real upload or billable vendor job.

**Verification / done when:** the regression reaches the actual wizard and detects
the short-array defect; distinguish any additional failure instead of assuming one
cause explains all reports. A failing reproduction is an intentional intermediate
result and must be identified as such in the task record.

**Dependencies:** none.

### 02. Make score updates preserve newly entered sets — deep review

**Files:** `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts`;
new adjacent `score-state.ts` and `tests/upload-score-state.spec.ts` if extraction is
needed to test the transition independently.

**Change:** replace map-only index updates with bounded, null-padded updates. Keep
score arrays, tiebreak arrays, and active set count coherent. Expose one transition
for entering a new set so a later set-count update cannot overwrite its digit. Preserve
existing values, meaningful zeroes, and preset/import provenance. Never pad with zero.

**Verification / done when:** step 01's value-loss case passes; test short arrays,
sets 2–5, clearing, tiebreak values, and preservation of other cells. Submitted arrays
include populated sets. Existing format/scoring limits remain unchanged.

**Dependencies:** 01.

### 03. Repair game focus and set creation — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx`;
`tests/upload-score-regression.spec.ts`.

**Change:** use step 02's transition for ghost cells. Advance only after valid game
entry, in player-1/player-2/set order, after the destination mounts. Select existing
game values for correction. Do not advance on clearing, invalid input, or tiebreak
entry; keep focus in the last available game cell. Preserve stable input identity.

**Verification / done when:** browser assertions cover exact focus order, correction,
ghost-set creation, final cell, and typing 10–8 into tiebreaks without losing a digit.

**Dependencies:** 02.

### 04. Protect populated scores when changing format — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx`;
`tests/upload-score-regression.spec.ts`.

**Change:** at the existing format control, prevent a smaller format from silently
discarding populated sets. Use an existing confirmation pattern for the specific
data loss; cancellation keeps the original format and all scores. Preserve locked
event formats and existing scoring rules. Reuse step 02's state transition.

**Verification / done when:** populated later sets survive cancellation; confirmation
removes only the explicitly excluded sets; blank formats change without unnecessary
confirmation. No score changes are written to an existing match during editing.

**Dependencies:** 03; no concurrent edits to the details component.

### 05. Establish shared completion and identity rules — deep review

**Files:** new `src/components/dashboard/matches/new-match-wizard/validation.ts`;
new `tests/upload-validation.spec.ts`; adjacent `types.ts` only for shared contracts.

**Change:** define pure required-answer and import-confirmation predicates. Require
both players' hand/backhand values and existing provider requirements. Compare the
original imported player-1 label with the intended athlete using
`normalizedPersonName`; empty names never count as a match. Confirmation is keyed
to file generation, workspace, athlete, and imported identity. It cannot change IDs.

**Verification / done when:** case/whitespace differences match; nicknames, initials,
punctuation differences, missing names, and different people require confirmation.
Any key change invalidates confirmation. Known style values pass and each missing
style field is reported. No guessed boolean or hand defaults.

**Dependencies:** none; precedes all validation wiring.

### 06. Wire import identity and final validation into state — deep review

**Files:** `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts`;
`tests/upload-validation.spec.ts`; focused hook tests using the existing harness.

**Change:** retain original parsed names separately from display fields, use parse
generation identity to discard stale results, and expose the pending confirmation.
Apply step 05 at file progression and final submission. Reset on source, file,
workspace, or athlete changes and on file re-pick after draft resume. Keep event
values authoritative. A negative player-1 answer blocks this import and allows a
different file/subject; do not swap labels or parser perspective.

**Verification / done when:** personal and team mismatches block their handlers;
confirmation permits the intended athlete only; stale parse completion cannot unlock
the current file; direct final-handler invocation cannot bypass missing styles.

**Dependencies:** 02, 05; serialize with other hook edits.

### 07. Connect confirmation to the visible file step — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx`;
new adjacent `ImportIdentityNotice.tsx`; new `tests/upload-identity.spec.ts`.

**Change:** show the personal/team mismatch wording from the design within the file
step. One explicit confirmation action, with a secondary change-file/player action.
Use the same result for Continue, keyboard shortcuts, and missing-field summaries.
If names are missing, use plain missing-name copy instead of empty interpolation.
The “not player 1” state explains that a correctly oriented export is needed.

**Verification / done when:** the real flow blocks click and keyboard continuation,
announces the notice accessibly, supports correction, and resets on replacement.
Match attribution IDs remain unchanged by name editing or confirmation.

**Dependencies:** 06.

### 08. Align shared selected-option treatment and design documentation — Spark

**Files:** `src/components/ui/float-menu.tsx`, `.skills/advantage-analytics-design/SKILL.md`;
existing shared-control tests, extending only meaningful interaction assertions.

**Change:** selected options have a Signal Blue check with no persistent or pointer
hover grey fill. Unselected options retain hover feedback. Keep a visible keyboard
focus state on every option, including selected ones. Update the canonical Dropdown /
Menu rule in the same task. Do not recolor success glyphs or radio interiors.

**Verification / done when:** inspect one selected and one unselected option under
pointer and keyboard interaction; shared action menus retain their existing behavior.
Check representative shared consumers for regressions.

**Dependencies:** none.

### 09. Update source and athlete selection presentation — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/SourceStepContent.tsx`;
its actual EntitySelect implementation, located from that component's imports;
existing source-step tests or new `tests/upload-source.spec.ts`.

**Change:** display Advantage Intelligence first among eligible providers without
overwriting explicit choices. Migrate residual chosen-row black checks/grey fill to
step 08's shared treatment. Preserve source links, drafts, preset locks, and doubles
import-only behavior. Limit entity-control changes to selected-option presentation.

**Verification / done when:** ordering is correct on fresh entry, while explicit
SwingVision selection persists and video is not offered for an import-only preset.
Chosen entity checks remain visible without wrapping labels or losing keyboard focus.

**Dependencies:** 08. The EntitySelect path is a bounded import lookup, not permission
to sweep all similarly named controls.

### 10. Make player details visibly editable and required — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx`;
new `tests/upload-player-details.spec.ts`.

**Change:** replace local hand/backhand WordSelect controls with labeled underline
MenuSelect fields, required marks, and short backhand labels. Stack at narrow widths;
reserve space for the check and never wrap an option label. Show missing values
directly, remove “if you know” wording, and expose editable names clearly. Preserve
schedule-owned locks. Keep “Save to your profile” explicit and self-only; no new
automatic profile writes and no roster-name writes from display edits.

**Verification / done when:** both players' missing values block completion through
step 05; valid prefills are editable. Desktop/narrow visual checks prove readable
labels and edit affordances. A teammate edit cannot expose or trigger self-profile
saving. Validate the current two side fields for doubles without a new data model.

**Dependencies:** 04, 05, 07, 08.

### 11. Define reusable upload eligibility without duplicating video policy — deep review

**Files:** `src/lib/workspace/types.ts`; new `src/lib/workspace/upload-eligibility.ts`
only if the existing module cannot host the small pure contract cleanly;
new `tests/upload-eligibility.spec.ts`.

**Change:** expose a reasoned eligibility result that distinguishes pending team
approval, unavailable workspace, role restrictions, and invalid athlete. Reuse existing
workspace claim capability and upload policy rather than comparing every claim to
`approved`. An active recorded-contact program in an objection window remains valid.
Require roster-player identity for team attribution; allow the approved owner/roster
exception. Personal attribution stays personal. Unknown/load-failed state cannot pass.

**Verification / done when:** fixture matrix covers claim_pending, active objection
window, suspended/unavailable states, owner without player profile, owner with profile,
player upload flags, and staff scheduled-line restrictions. Keep video-only spending
rules distinct from provider-independent pending approval restrictions.

**Dependencies:** none.

### 12. Enforce roster selection and eligibility in wizard state — deep review

**Files:** `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts`;
`tests/upload-eligibility.spec.ts` and targeted flow fixtures.

**Change:** remove generic team uploader fallback and offer only eligible roster
subjects. Preserve the owner's own genuine roster profile as an explicit option.
Apply step 11 before progression and creation; revalidate presets and resumed subjects.
Missing/stale subjects return to selection without reattributing to the uploader.
Changing subject invalidates step 06's import confirmation. Existing incomplete drafts
remain savable; changing durable draft persistence is out of scope.

**Verification / done when:** unapproved teams and invalid roster subjects cannot
progress via handlers; active users retain their policy-allowed upload paths. Verify
wrong-workspace, archived/merged, stale preset, and missing draft-subject cases.

**Dependencies:** 06, 11; serialize hook ownership.

### 13. Show approval restriction on every wizard entry — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx`;
new `tests/upload-approval.spec.ts`.

**Change:** show the pending approval notice on the first visible step, whether
Source, preset File, or resumed File. Use step 11 for button and keyboard state.
Keep Back, exit, and Save draft usable. Refresh/recheck eligibility on return to the
page and before submission; show retry on lookup failure. Do not add a redirect
that hides the explanation or change the team's staff line picker unnecessarily.

**Verification / done when:** fresh/preset/draft entry all explain why Continue is
disabled; refreshed approval removes only this restriction. Other missing fields
still block completion. No new approval check targets the wrong active workspace
after an already-created match is submitted.

**Dependencies:** 07, 12; serialize flow-shell edits.

### 14. Close direct-write eligibility gaps — deep review

**Files:** one new timestamped migration under `supabase/migrations/`;
new `tests/upload-write-eligibility.spec.ts` using an isolated database fixture.

**Change:** inspect the current live function definitions again immediately before
authoring. Extend the existing client-write guard narrowly so new team upload matches
cannot bypass pending approval or attribute an athlete to a staff-only member ID.
Preserve historical read access, service-role processing, existing line linkage and
regraft protections, and legitimate score-only entry. Do not blanket-block unrelated
updates on historical rows. Cover both insert and the existing-match upload path;
apply equivalent protection to new client processing-job creation if necessary.

**Verification / done when:** direct authenticated requests for a pending program or
staff-only athlete fail; legitimate roster athletes and personal matches pass; owner
with roster profile passes; older match reads and processing callbacks still work.
Existing scheduled-line permissions remain unchanged. No production data mutations
are used for testing; applied migrations remain untouched. Record rollback strategy
and migration application requirements without applying to production in this task.

**Dependencies:** 11, 12. Before step 04 turns this into a build task, ensure its
done-when list names the upload-specific write transitions; avoid a broad ban on
all team match edits just to secure one flow.

### 15. Verify and, only where needed, extend video transfer authorization — deep review

**Files:** `src/app/api/splitstep/upload-url/route.ts` and its authorization tests.

**Change:** retain the existing match-workspace `billingWorkspaceFor` and
`explainVideoRefusal` checks. Verify the new athlete constraint for an existing match
before minting a write credential; add only the missing guard. Resolve against the
match's workspace, not the viewer's current switcher selection.

**Verification / done when:** pending claims, wrong-program subjects, and staff-only
athletes cannot obtain transfer authorization. Existing personal/valid roster requests
retain their behavior. This test must stub credential minting; no real SAS output.

**Dependencies:** 11, 14.

### 16. Verify final job authorization without altering quota behavior — deep review

**Files:** `src/app/api/splitstep/jobs/route.ts` and its authorization tests.

**Change:** preserve existing quota reservation and billing-workspace resolution.
Recheck athlete eligibility at submission if the existing guard does not cover it,
including rows created before the new checks. Keep authorization failure before
vendor submission and avoid converting a retryable uploaded job into failed upload.

**Verification / done when:** denied jobs do not spend quota or call the vendor;
valid jobs preserve top-player ordering, game scores, trim billing, and retry behavior.
Workspace switches cannot redirect the budget. Use mocked vendor/quota boundaries.

**Dependencies:** 15.

### 17. Present clear video requirements — Spark

**Files:** `src/components/dashboard/matches/new-match-wizard/FileStepContent.tsx`;
new adjacent `VideoRequirements.tsx` only to keep the existing component bounded;
existing file-step browser tests.

**Change:** show 1080p minimum, 30 fps minimum with 29.97 accepted, 60 preferred,
full-court framing including both baselines/far service line/outside-court space,
and a simple court guide. Include concise format, file-size, singles, and complete-game
trim guidance. Do not invent a margin in metres or claim automatic framing validation.

**Verification / done when:** guidance is available before file selection, readable
on mobile, and uses Advantage Intelligence naming. It does not obscure error/progress
states or introduce extra camera defaults. Copy agrees with the reviewed provider docs.

**Dependencies:** none.

### 18. Align existing video checks with requirements — deep review

**Files:** the existing video probe/validator module reached from
`useUploadMatchWizard.ts` (resolve its import; do not create a second probe);
its existing tests or new `tests/upload-video-requirements.spec.ts`.

**Change:** compare existing checks to current provider documentation. Correct only
demonstrated threshold/message gaps using reliable available metadata. Accept 29.97;
do not infer frame rate from playback timing or reject an otherwise supported format
just because MP4 is preferred. Keep unknown metadata distinct from known invalidity.

**Verification / done when:** boundary fixtures cover minimum resolution, documented
fps tolerance, file-size boundary, unknown metadata, and actionable provider failures.
Provider documentation must settle exact boundary semantics before threshold edits;
if it is contradictory, preserve the existing safe behavior and report the discrepancy.

**Dependencies:** 17; no new browser analysis pipeline.

### 19. Record the draft behavior plan — Spark, documentation only

**Files:** new `docs/upload-draft-behavior.md`.

**Change:** preserve the design's draft state/behavior table and map it to the existing
`match_drafts` action, resume route, and Save draft handler. Record future fixes:
stay on failed save, persist/revalidate subject identity, distinguish local recovery
from durable save, bind resume to the intended workspace, and prevent stale completed
drafts from creating duplicate matches. Specify no new expiry job and no credentials
or File objects in payloads. Clearly mark recommendations versus shipped behavior.

**Verification / done when:** every Save draft question in the brief has an explicit
answer and future acceptance criteria. The document does not claim these fixes shipped
and creates no executable persistence task in this feature's active queue.

**Dependencies:** none; requires no application mutation.

### 20. Integrated verification and review — deep review

**Files:** only the focused tests above if a coverage gap is found; no feature sweep.

**Change:** exercise complete personal import, team import, video/preset, and draft
resume flows with fixture-backed dependencies. Run required repository gates and
review attribution, authorization, focus, and shared dropdown regressions. Report
actual checks, skipped live checks, and migration rollout prerequisites.

**Verification / done when:** all implementation criteria above pass with no hidden
failure attributed to missing production credentials; no parser, payload, quota,
historical-data, or webhook regressions. A missing environment may explain a skipped
integration test but cannot be described as proof of database enforcement.

**Dependencies:** 01–19, excluding any explicitly documented no-change verification.

## Dependencies and queue sizing

Critical chains: 01 → 02 → 03 → 04; 05 → 06 → 07 → 10;
08 → 09 and 10; 11 → 12 → 13; 12 → 14 → 15 → 16; 17 → 18.
Step 12 also follows 06; step 13 follows 07. Step 20 follows all work.

Use these as bounded steps when stage 04 creates the branch queue. Step 14 has one
database enforcement surface; if live verification shows distinct independent
policies need separate migrations, split those tasks before execution rather than
letting one worker sweep the entire data layer. No other step may broaden its files
to absorb a neighboring large component. Shared-file steps always run sequentially.

## Planning evidence and also consulted

The only declared inputs were stage 02 `design.md`, stage 01 `brief.md`, and empty
stage-03 references. Focused verification of design questions added:

- `src/lib/data/person-name.ts`: normalization trims, collapses whitespace, and
  lowercases; punctuation/initials are not silently equated. Guard empty strings.
- `src/lib/wizard/actions.ts`: `saveMyStyle` writes only the authenticated user's
  profile; draft save persists the supplied payload under the active workspace.
  `loadMatchDraft` does not itself filter the active workspace in its query. Future
  draft work must verify RLS and cross-workspace resume behavior rather than assuming it.
- `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx`: the
  explicit profile-save button is gated by `subject.isSelf`; preserve that distinction.
- `src/app/api/splitstep/upload-url/route.ts`: already checks the match's billing
  workspace and `explainVideoRefusal` before transfer. Do not duplicate this policy.
- `src/app/api/splitstep/jobs/route.ts`: already resolves the match's billing workspace
  before quota reservation; keep this path and verify athlete eligibility separately.
- `src/lib/workspace/types.ts`: existing `canSubmitVideo`, `canUploadForProgram`,
  and `explainVideoRefusal` are the reuse points; no new claims-matching algorithm.
- Read-only Supabase MCP on 2026-09-10: `pg_policies` for matches/processing_jobs and
  their non-internal trigger inventory. Client write policies check `created_by`;
  the matches regraft trigger adds protections described in stage 02. Processing jobs
  list only the timestamp trigger. This supports targeted direct-write verification,
  not a claim that every service or storage boundary has been audited.

No live data was changed. The stage-02 source findings remain inputs rather than
newly reproduced bugs. New helper/test names above are proposals, not claims that
those files already exist. Additional source tracing is assigned to the relevant
bounded implementation step rather than expanding this stage into a repository audit.

## Test strategy

Use pure transition tests for score state and confirmation invalidation, real browser
tests for focus/editability, fixture-backed flow tests for provider/preset/import
behavior, and isolated database tests for direct writes. Mock external upload/vendor
calls and quota effects; do not spend athlete allowance to test a UI change.

Test the changed behavior at each step, then run the repository gates once on the
integrated result: `npm run typecheck`, `npm run lint`, `npm run format:check`, and
`npm run test`. No route is planned; regenerate MAP only if implementation actually
adds a route. Run any additional required hook/task-review checks. A production build
is not a substitute for these checks and is not added as an unnecessary CI gate.

For shared menu changes, manually inspect pointer selection, keyboard focus, and
narrow-screen text in the wizard plus representative existing consumers. For team
eligibility, test fresh/preset/draft paths and direct requests independently. Preserve
the active objection-window case and all established staff/player policy restrictions.

This stage only writes this plan: verify its whitespace and scope, then commit.
Application tests are deferred until application code changes; no runtime fix or
database migration is claimed by the plan commit.
