# Upload flow refinements — design

## Approaches considered

| Approach | Benefit | Trade-off |
| --- | --- | --- |
| Patch individual controls only | Smallest visual change; addresses immediate score and dropdown complaints | Leaves duplicate eligibility decisions, stale draft resumes, and failure handling inconsistent |
| Refine the existing wizard and centralize its validation — recommended | Preserves working provider, schedule, and draft flows; makes UI and submission agree | Requires focused changes to form updates, selection controls, and authorization boundaries |
| Rebuild the wizard around a new form/state framework | Could consolidate the whole flow | Disproportionate scope and attribution risk; unnecessary for these requirements |

## Chosen design

### Architecture and verified starting point

Keep the current full-page wizard, provider-dependent steps, server-loaded route
presets, and client-owned form state. Add no global state library, new route, or
new upload service. This is a behavior design, not an implementation or deployment.

Verified route trace:

- `src/app/dashboard/matches/new/page.tsx` renders
  `src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx`, including
  validated source/player shortcuts and saved-draft entry.
- `src/app/dashboard/team/upload/page.tsx` renders that same flow for drafts,
  scheduled-line presets, single-match presets, and eligible player uploads;
  its staff entry also offers a line picker.
- `UploadMatchFlow` renders `SourceStepContent`, `FileStepContent`,
  `TrimStepContent`, and `DetailsStepContent`. The details component imports
  `ScoreBlock` from the same directory. The flow reads `useWorkspace()` and
  delegates form state and submission to `useUploadMatchWizard`.

Live schema inspection confirms existing `programs.status`, claim status,
`program_players`, membership roles, and `match_drafts.payload`. No new table is
proposed. The live claim function activates a recorded-contact claim immediately
while its claim status is `objection_window`; an unmatched contact produces
`programs.status = claim_pending` and `program_claims.status = pending_review`.
Therefore, requiring every claim row to say `approved` would block valid programs.

Keep the uploader, roster athlete, imported player label, and camera position as
distinct facts. A changed display name is never evidence for changing an athlete ID.

### Components and interaction

#### Score entry

Use the existing `ScoreBlock`, matching the design system's ScoreGrid behavior:
40px game cells, set headers, optional tiebreak columns, and a ghost set column
within the selected format. Do not introduce a second score editor.

- Valid game entry moves focus player 1 set 1 → player 2 set 1 → player 1 set 2,
  continuing through available sets. It skips tiebreak cells. The final game cell
  keeps focus rather than moving to a nonexistent field or submitting the form.
- Emptying a cell does not advance. Invalid input does not trigger a focus move.
  Select the existing value when entering a game cell so corrections replace it.
- Tiebreak entry remains manual, allowing multi-digit values with ordinary Tab
  navigation. Preserve current scoring bounds; do not change scoring semantics.
- Update arrays by index with null padding when the target index does not yet
  exist. Preserve all other scores and keep set count consistent with visible
  entered data. Adding a ghost set and recording its first score is one coherent
  state update, followed by focus after the target mounts.
- Never use zero as the representation of an unanswered cell. Preserve actual
  zero scores, imported multi-set scores, tiebreaks, and preset-owned values.
- Format changes must not silently discard populated sets. If a smaller format
  would remove entered values, explain the loss and require an explicit choice.

Evidence: `ScoreBlock` already attempts auto-advance and computes visible sets
from filled data. The hook's score updater maps the existing array, so an index
beyond its length is not written. This is a concrete defect candidate for short
imported arrays; the reported UI failure still needs reproduction before claiming
the cause is fully established.

#### Imported identity

After parsing, retain the original imported player names separately from editable
form labels. Before leaving the file step, compare imported player 1 with the
intended athlete: the account holder in a personal workspace, the selected roster
athlete or preset athlete in a team workspace.

Use the existing person-name normalization convention after verifying its behavior
in planning. Do not add fuzzy matching that automatically equates different people.
Missing or ambiguous names require confirmation too.

For a personal mismatch, show: “This import names {imported name}, but your profile
names {profile name}. Are you player 1 in this import?” For a team mismatch:
“This import names {imported name} as player 1. Is that {selected athlete}?”
Offer one confirmation action and a secondary action to change the player or file.
Keep Continue disabled until resolved. This is a confirmation of identity, not a
permission to overwrite a roster name with an export account holder's name.

Do not offer a cosmetic player-2 swap: changing labels and scores alone would not
change the parser's point/stat perspective. If the intended athlete is not player 1,
stop this import and explain that a correctly oriented export is needed. Supporting
player-2 imports would require a separate verified mapping design outside this scope.

Confirmation applies to the current file, workspace, athlete, and imported identity.
Changing any of them clears it. Re-picking a file on draft resume reruns it. Late
parse responses from a previous file cannot satisfy the current confirmation.
Existing event/preset ownership of names, scores, and format remains authoritative.

#### Player names, hand, and backhand

Both players require known hand and backhand values, as confirmed in chat during
this stage. No “Unknown” choice and no guessed defaults. Existing valid imported
or profile values may prefill the controls, but remain visible for correction.

Use labeled underline fields and `MenuSelect`, with the design-system required
mark. Hand options: Right-handed / Left-handed. Under the Backhand label, use
One-handed / Two-handed so redundant wording does not force a narrow menu to wrap.
Keep option text on one line, reserve space for the check, and constrain menus to
the viewport. At narrow widths stack the fields instead of compressing their text.

Make editable names visibly underlined, with a labeled Edit action where the
current view is a read-back row. Show hand/backhand controls directly when missing;
do not hide required answers behind a subtle “Not set” read-back. Preserve legitimate
locks on schedule-owned identities and explain their source. Change an athlete via
the roster selector, not by typing another person's name over a linked identity.

Mirror required-field checks in both the footer and final submission. Saving a draft
may remain incomplete. Existing profile persistence behavior must be verified in
planning; these changes must not newly write a teammate's style into the uploader's
profile or silently rewrite roster names.

#### Dropdowns and design-system update

List Advantage Intelligence first among supported providers. Respect explicit
source links, resumed draft choices, and import-only presets; ordering is not a
reason to overwrite a selection or enable video for doubles.

Recommended decision: the selected row uses a blue check without a persistent grey
fill or pointer-hover fill. Unselected rows retain their hover feedback. Keyboard
focus remains visibly distinct, including on a selected row, using the existing
focus treatment. Removing selection fill must not remove the only focus indicator.

This changes the current documented `FloatMenuItem` and `EntitySelect` selected
wash. During implementation update the canonical design skill's Dropdown / Menu
rules and corresponding shared selection primitives together; audit affected shared
consumers visually. Do not remove hover from unrelated action menus, navigation,
or editable triggers. All chosen-row checks are Signal Blue; do not recolor semantic
success indicators or white checks inside blue radio controls.

#### Team approval and athlete eligibility

Expose the approval restriction at the first rendered wizard step, including when
a preset or draft skips Source. Show a persistent notice: “Your team is awaiting
approval. You can upload matches once your claim has been approved.” Disable
Continue and final submission. Keep Back, exit, and incomplete draft saving usable.

Use the active program's server-derived status. `claim_pending` blocks upload;
`active` clears this restriction only. Preserve restrictions for suspended programs,
membership, role/upload policy, player upload flags, roster membership, and scheduled
line attachment. Do not recompute email matching in the wizard or change claims logic.
Do not block an active program because an unrelated or historical claim is pending.

Recheck eligibility at write/transfer boundaries as well as in the UI. A stale page,
direct request, resumed draft, or changed workspace must not bypass it. Planning must
identify all existing create/update, upload authorization, and job submission checks
before selecting the smallest shared guard. Integration edits here serve the explicit
eligibility requirement, not a layout change; preserve payload, quota, and status logic.
If database enforcement needs strengthening, use a new migration only, after examining
the live policies and triggers; no applied migration edits or existing-row rewrites.

For team athlete selection, remove the generic owner “Myself” fallback. Require a
valid player on the active roster, including preset and draft paths. Keep the owner
as uploader/audit actor, independently of the athlete. Never repair a missing athlete
by substituting the uploader ID.

Recommendation for the unresolved owner/player overlap: an owner who also has a
genuine eligible roster-player profile may select that profile explicitly. Ownership
alone grants no athlete eligibility. This avoids treating a role as an athletic
identity and does not require a new role system. This remains a recommendation for
review because the user was unsure, not a recorded user decision.

The live `matches_block_client_regraft` trigger accepts a program member ID regardless
of role and does not itself enforce program approval. It cannot alone establish the
requested restrictions. Other live policies were not audited in this stage; do not
infer that the whole database lacks protection from this one function.

#### Video requirements

Show a compact requirements block beside the existing file chooser before selection:
“1080p minimum · 30 fps minimum · 60 fps recommended.” Include “29.97 fps accepted.”
Explain camera framing with a simple court guide: the entire court, both baselines,
far service line, and space outside the court must be visible. Do not invent a
measured outside-court margin. Recommend a centered, elevated view from behind a
baseline. Keep the existing camera and opening-position questions explicit.

Include concise supporting guidance from the provider: singles only, file under
8 GB (8,000,000,000 bytes), MP4/H.264 preferred, and a trim covering complete games
consistent with the set scores. Do not narrow accepted formats merely because one
format is preferred. User-facing copy names Advantage Intelligence only.

Reuse the existing local probe and validation path. Reject known violations of
supported checks before transfer; do not estimate fps from playback timing, reject
29.97 fps as below 30, or claim a local check proved court visibility. When metadata
cannot be checked reliably, explain that requirements still apply and that processing
may reject the file. No new browser video-analysis engine in this feature. Retain
provider-side validation and present actionable failures without exposing internals.

The brief contains the checked provider guidance. Refresh the provider's exact limits
and boundary behavior during implementation if changing validation thresholds.

### Save draft behavior contract — plan only

Reuse `match_drafts`; do not build another storage system. The existing hook creates
or updates a draft ID, and route resume already exists. The following is the proposed
contract for future draft implementation tasks, not authorization to expand this build.

| Event | Expected behavior |
| --- | --- |
| Save draft | Persist incomplete answers, source, active workspace, intended athlete, preset/attachment, trim/camera answers, and display-only filename; update the same draft on subsequent saves |
| Save succeeds | Return to the workspace's Matches destination; show the existing Draft row with Resume; announce success only after persistence succeeds |
| Save fails | Stay in the wizard, keep answers, explain the failure, and offer retry; do not claim a draft was saved |
| Resume | Load the authorized workspace-bound draft; revalidate membership, approval, athlete, preset, and provider; recover to Source if a required choice is no longer valid |
| File needed | Ask the user to reselect the file, preserving compatible answers; filename alone does not prove it is the same file; re-probe/re-parse and re-confirm identity |
| File replaced | Clear file-derived results and confirmation; revalidate trim bounds and camera answers instead of carrying them to an unrelated video |
| Workspace changed | Do not transfer the draft's athlete, destination, or approval state into another workspace |
| Save match succeeds | Remove the draft; if cleanup fails, avoid letting Resume create a duplicate completed match |
| Explicit discard | Remove the draft and corresponding local recovery state; never remove an already submitted match or video job |
| Transfer already started | Use the existing upload/job lifecycle and retry UI; do not label it an editable pre-upload draft |

Do not persist a browser File, credentials, or SAS URL in the draft payload. Saving
does not upload video, reserve quota, or create an analysis job. Keep local recovery
distinct from a durable draft: local autosave must not promise server persistence.
Retain drafts until explicit discard or successful completion; no new expiry job.

Observed defect to include if draft work is later authorized: `handleSaveDraft`
awaits `saveDraft()` but navigates regardless of a false result. Also verify that
subject identity survives serialization: the inspected save call has no explicit
subject argument. Do not infer payload coverage without checking the server action.

### Data flow and error handling

Server workspace/preset/draft → validated client state → provider selection → file
probe or parse → import identity confirmation / video trim → details validation →
fresh authorization → existing match/import/video submission.

Keep camera answers unset until answered, preserve the trim-to-billing relationship,
send game counts rather than tiebreak points, and preserve top-player-first vendor
ordering. Never change SwingVision parsing, statistics calculation, existing match
data, webhook handling, or deletion behavior to achieve these UI changes.

Use one derived list of missing answers and one eligibility result for button state,
keyboard shortcuts, and handler guards. Present pending approval as status, required
fields beside their labels, and failures in an accessible error notice. An authorization
refresh failure blocks submission with retry; it must not appear as approval. Keep
answers intact on recoverable failures. Preserve uploaded-state retry after vendor
submission failure; do not mark uploaded bytes as a failed upload.

### Testing and review

- Reproduce short-array score loss with a one-set import, then enter sets 2 and 3;
  verify visible values, state, and submitted game arrays. Cover five sets, zeros,
  clearing, ghost sets, preset scores, and best-of changes.
- Browser-test game focus order, correction, final-cell behavior, keyboard entry,
  and 10–8 tiebreak entry without auto-advance or lost digits.
- Test personal and roster import mismatches, confirmation reset on replacement,
  delayed parse results, and preset provenance. Confirm no ID changes from name edits.
- Verify both players' missing hand/backhand values block completion, including
  imported and resumed forms. Check menu labels, checks, and visible edit affordances
  on narrow and desktop layouts, pointer and keyboard focus.
- Test pending approval through fresh, preset, draft, keyboard, and direct-write
  paths; active recorded-contact programs in objection windows must remain eligible
  subject to the other rules. Cover approval changes while the wizard is open.
- Verify owners cannot fall back to their account ID; roster selection, wrong-program
  IDs, archived/merged players, and existing scheduled-line restrictions are enforced.
- Verify existing video checks against below-minimum resolution, accepted 29.97 fps,
  60 fps, unknown metadata, size boundaries, and provider rejection messages.
- When draft implementation is authorized, cover save failure staying put, reuse of
  the draft ID, resume with missing file, changed eligibility, and successful cleanup.
- Implementation gates: focused Playwright/regression coverage, typecheck, lint,
  formatting, and repository-required checks. This documentation-only stage runs
  whitespace verification, not application tests, and claims no runtime fixes.

## Open questions

- Owner/player overlap: recommended roster-profile exception above awaits review.
- Save draft remains a plan-only deliverable unless implementation is explicitly
  added to scope. Its failure behavior and persistence gaps are identified for that plan.
- The import-side reversal capability is deliberately excluded. If player-2 imports
  are required, establish a parser/stat orientation contract before adding that action.
- For doubles imports, this change validates the two existing side/profile fields;
  it does not invent four participant-style records. Confirm if per-person doubles
  hand/backhand collection is intended as additional scope.
- Exact source of the reported set 2+ failure still needs a UI reproduction; the
  short-array update defect is evidence, not a completed diagnosis of every entry path.

Resolved for this proposal: show approval at the first visible step; require known
style values for both players; use blue checks without selected-row grey fill while
preserving keyboard focus; reuse video probing rather than adding analysis; retain
existing durable draft infrastructure. Re-invocation after review approves this design.

## Also consulted

Declared inputs: stage 01 `brief.md`, `MAP.md`, `docs/ui-revamp-guardrails.md`, and
`.skills/advantage-analytics-design/SKILL.md`; stage references were empty.

Additional focused verification:

- `.claude/skills/trace-route/SKILL.md` — required route-tracing procedure.
- `src/app/dashboard/matches/new/page.tsx` — direct entry, shortcuts, draft resume.
- `src/app/dashboard/team/upload/page.tsx` — team entry and preset variants.
- `src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx` — actual
  step imports, validation, workspace context, and save-draft navigation.
- `src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx` — score
  import, hand/backhand controls, name-normalization import, and editing structure.
- `src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx` — set rendering
  and existing focus behavior.
- `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts` —
  targeted score updates, parsed provenance, draft save, and subject attribution.
- Read-only Supabase MCP inspection on 2026-09-10: columns of programs, claims,
  members, players, and drafts; status/role constraints; live definitions of
  `complete_program_claim` and `matches_block_client_regraft`. No athlete rows,
  schema mutations, or production writes.
- User's stage-02 reply: both players need known hand/backhand values; owner/player
  overlap remains uncertain. Codex Spark remains preferred for suitable bounded work
  when available; no independent agent work was needed for this design document.
