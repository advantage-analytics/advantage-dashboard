# Tasks — claude/task-add-match-upload-f95ba8

> Scope: Match upload wizard UX fixes and reliability improvements

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

## T1 · Suggest Unfinished for incomplete scores
- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/DetailsContent.tsx, src/components/dashboard/matches/new-match-wizard/utils.ts
- **done when:**
  - [ ] With every rendered set filled but neither side clinching (e.g. best-of-3 entered 6-4 / 4-6), the Result cell auto-shows "Unfinished" without the user opening the menu
  - [ ] With a clinched score (6-4 / 6-2 best-of-3) the Result cell still auto-shows "<Player> Wins" — the existing deriveOutcome path is unchanged for complete scores
  - [ ] If the user manually picks a Result from the menu, that choice is never overwritten by the auto-suggestion (the `!formData.result` guard, or equivalent, still holds)
  - [ ] Partially-typed scores (only set 1 of 3 entered) do not trigger the Unfinished suggestion mid-entry
- **notes:** "Unfinished" already exists as a Result option; deriveOutcome currently returns null when no side clinches — extend that path rather than adding a parallel derivation. The Won tag beside player names is untouched.

## T2 · Reword "Your end at start"
- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/DetailsContent.tsx
- **done when:**
  - [ ] The SelectCell label "Your end at start" is replaced with wording that names the video frame and the player, e.g. "Where you start in the video" — no tennis jargon ("end") left in the label
  - [ ] The hint text explains it is where the uploader's player stands when the video begins, not who serves first, and that switching ends later doesn't matter
  - [ ] END_OPTIONS labels still map true → top of frame, false → bottom of frame; the `initialTopPlayerIsPlayer1` field name and value semantics are untouched (guardrail-critical)
  - [ ] The missing-field summary label "your end" in UploadMatchFlow.tsx is updated to match the new wording
- **notes:** Copy-only task, but this field is one of the three guardrail-critical inputs — a flipped value silently attributes every stat to the wrong player. Wording may change freely; the boolean mapping may not.

## T3 · Fix failure toast's "Open the match" action
- **status:** done
- **model:** opus
- **files:** src/components/dashboard/toast/upload-failure-listener.tsx, src/components/dashboard/toast/toast-provider.tsx, src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts
- **done when:**
  - [ ] The root cause is identified and stated in the commit message: why clicking "Open the match" on a failed-upload toast does nothing or lands on a broken page
  - [ ] After the fix, dispatching `match-upload-failed` with a matchId whose match row exists yields a toast whose action navigates to /dashboard/matches/<matchId>
  - [ ] When the failure means no viewable match exists (e.g. the insert itself failed), the toast renders without the "Open the match" action instead of rendering a dead link
  - [ ] All three dispatch sites are checked and consistent about whether they include matchId in the event detail
- **notes:** The listener only adds the action when `detail.matchId` is set, so the bug likely lives at the dispatch sites. Reproduce by dispatching the CustomEvent from the console before touching code.

## T4 · Ask whose match this is in team workspaces
- **status:** done
- **model:** fable
- **files:** src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx, src/components/dashboard/matches/new-match-wizard/DetailsContent.tsx, src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, src/components/dashboard/matches/new-match-wizard/utils.ts
- **done when:**
  - [ ] In a team workspace with no event preset, the wizard shows a required "who played this match" choice: the uploader themself, or a roster member of the program
  - [ ] Selecting a roster member writes that member's player id onto the created match row, and the match detail page attributes stats to that player
  - [ ] In a personal workspace the new control never renders and the insert payload is byte-identical to before for the same inputs
  - [ ] The event-preset flow (PinnedMatchContent roster picker) is unchanged — the new control does not render when `preset` is set
  - [ ] The "Your name" field pre-fills from the chosen player instead of asking again
- **notes:** Read docs/ui-revamp-guardrails.md first — player attribution is exactly the silent-failure class it warns about. Verify the correct match column for the subject player against the live DB (Supabase MCP), not supabase/migrations/. Workspace kind comes from `useWorkspace()`.

## T5 · Visible keep-tab-open warning during video upload
- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx, src/lib/services/splitstep/submit-match-video.ts
- **done when:**
  - [ ] While any upload is in phase "uploading", the progress screen carries a plainly readable warning — body-size text near the progress bars, not a 10px uppercase footnote — saying to keep this tab open until the upload finishes
  - [ ] The beforeunload handler in submit-match-video.ts covers the whole uploading window (verify and fix if needed)
  - [ ] The warning disappears once every upload has left the "uploading" phase
  - [ ] The existing distinction survives: navigating within the app does not stop the transfer, only closing the tab does
- **notes:** A beforeunload handler and a footnote already exist; this task is about making the warning impossible to miss. Follow the design system for cautionary tone.

## T6 · "Upload another" opens a new tab
- **status:** done
- **model:** opus
- **needs:** T5
- **files:** src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx
- **done when:**
  - [ ] Clicking "Upload another" while an upload is in flight opens /dashboard/matches/new in a new tab; the current tab stays on the progress screen with its upload still listed and Cancel still working
  - [ ] Adjacent copy warns not to close the original tab because its upload is still running there
  - [ ] The new tab opens with a blank wizard — the in-flight tab's draft/localStorage state does not leak into it
  - [ ] With no upload in flight (all phases terminal), "Upload another" behaves as today — same-tab wizard remount via the runId bump
- **notes:** STORAGE_KEYS draft persistence is shared across tabs; DashboardShell clears upload localStorage when the path leaves /dashboard/matches/new. If the localStorage collision cannot be resolved cleanly, stop and flag it rather than shipping cross-tab state corruption.

## T7 · Investigate vendor Azure blob read timeout
- **status:** done
- **model:** fable
- **files:** src/app/api/splitstep/upload-url/route.ts, src/lib/services/splitstep/config.ts, src/lib/services/splitstep/video-url/azure-sas.ts, src/lib/services/splitstep/webhook-payload.ts
- **done when:**
  - [ ] The commit message or task log states, with file:line references, where the download SAS URL the vendor receives is generated and what its expiry and permissions are
  - [ ] The error is classified: whether it's our SAS/storage configuration or the vendor's Python client read timeout on a large blob — with evidence for the classification
  - [ ] If the cause is in-repo, the fix is applied and the changed value is visible in the diff
  - [ ] If the cause is vendor-side, no speculative code change is made; instead a concrete recommendation is recorded in this task's notes in the queue file
- **notes:** The error is Python `requests` phrasing — a read timeout mid-body usually means a slow/stalled stream, not an expired SAS (that would be a 403). config.ts discusses expiry rationale.

  **Investigation result (2026-08-29) — vendor-side, no code change.**

  SAS URL is minted at `src/lib/services/splitstep/video-url/azure-sas.ts:341–387` (`AzureSasVideoUrlStrategy.mint()`), signed via `signBlobUrl()` at line 148–171, injected into the job body at `src/app/api/splitstep/jobs/route.ts:424`. Permissions: read-only (`'r'`). Expiry: 14 days (`VENDOR_URL_TTL_SECONDS`, `config.ts:97`), with a 5-minute clock-skew backdate and HTTPS-only restriction.

  The recorded error on job `e6e8dea4` is verbatim Python `urllib3` `ReadTimeoutError` phrasing. Failure webhook landed 19 minutes after SAS issue with 13.99 days of validity remaining — the SAS was valid, Azure accepted the GET and started streaming, and the vendor's socket read timeout fired mid-body on a multi-GB (~117-minute) video. An expired SAS returns an immediate HTTP 403; this did not.

  **Recommendation to send the vendor (contact: Christian):**
  The download client needs to tolerate a multi-GB streaming body. Two options:
  1. **Preferred:** use the `azure-storage-blob` Python SDK — `BlobClient.from_blob_url(sas_url).download_blob()` does chunked, ranged GETs with per-chunk retries automatically.
  2. Or keep `requests` but use `stream=True` with a generous read timeout (e.g. `timeout=(10, 300)`), and on `ReadTimeout` / `ChunkedEncodingError` resume via an HTTP `Range` header from the last byte received. Azure Blob fully supports range requests.
  In either case: retry the whole download at least once before marking the job failed — the SAS stays valid for 14 days, so a retry costs nothing.

  **Optional future work (product decision, not part of this fix):** the webhook handler could treat an `error_message` matching a download failure pattern as retryable (the SAS is still valid), rather than landing the job in `failed` with no recovery path.
