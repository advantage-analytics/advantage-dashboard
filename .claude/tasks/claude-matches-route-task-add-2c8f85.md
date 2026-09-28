# Tasks — claude/matches-route-task-add-2c8f85

> Scope: Matches list route — stale "Draft"/"Continue upload" on matches that already have a video job, and the dead Estimates lifecycle chip

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

## T1 · Hide and reap drafts whose match already has a video job

- **status:** todo
- **model:** opus
- **files:** src/lib/wizard/draft-target.ts, src/components/dashboard/matches/matches-page-content.tsx, src/app/dashboard/matches/(list)/page.tsx, src/lib/wizard/actions.ts, tests/matches-drafts.spec.ts, tests/fixtures/matches-drafts-harness.tsx (guess)
- **done when:**
  - [ ] `foldDrafts` (or a pure helper beside it in `draft-target.ts`) treats a draft as stale when its target match carries `analysis.jobId` (a `processing_jobs` row exists, any status): a stale draft is neither folded onto the row nor listed as a standalone row, so `MatchCardList` gets `hasDraft=false` and `MatchDrawer` gets `continueHref=null` for that match.
  - [ ] A draft targeting a match whose analysis is `manual` (score-only, no `jobId`) or absent still folds exactly as today — the four existing cases in `tests/matches-drafts.spec.ts` pass unchanged.
  - [ ] `tests/matches-drafts.spec.ts` gains a case where `m-scored` carries `analysis: { status: "queued", jobId: "job-1", providerId: "splitstep" }` in the harness and asserts: no "Draft" pill in that row, the drawer footer has no "Continue upload" link, and "View match" is the footer's primary.
  - [ ] Server side, `listMatchDrafts` (or the list page before it passes `drafts` down) drops drafts whose target match has a `processing_jobs` row visible to the viewer and deletes those `match_drafts` rows best-effort (`.in("match_id", targetIds)` on `processing_jobs`; the delete stays a fire-and-forget that never fails the page).
  - [ ] `npm run typecheck` and `npm test -- tests/matches-drafts.spec.ts` pass.
- **notes:** Confirmed on prod: draft b0416132… targets match 599b8159… whose job b74a1e04… is `derivation_failed`; the row shows Draft + Continue upload. Server exclusion is the source of truth (it also removes the row); the client guard covers a job that appears via the Realtime merge while the page is open. `processing_jobs` RLS is per-creator, so the server filter only sees the viewer's own jobs — the client guard (which reads the enriched `analysis`) is what covers a coach's job on a player's draft. Read `docs/ui-revamp-guardrails.md` first; nothing here touches the wizard's three attribution inputs.

## T2 · Wizard submit deletes every draft targeting the match

- **status:** todo
- **model:** sonnet
- **files:** src/lib/wizard/actions.ts, src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts (guess)
- **done when:**
  - [ ] `actions.ts` exports `deleteMatchDraftsForMatch(matchId: string): Promise<void>` that deletes the signed-in user's `match_drafts` rows whose `payload->preset->>matchId` or `payload->attachedLine->>matchId` equals `matchId` (RLS already scopes by `user_id`).
  - [ ] `handleCreateMatch` calls it right after the match row write succeeds (beside the existing `deleteMatchDraft(draftId)` at :3347), in both the reuse (`reusingMatch`) and insert branches, best-effort with the same `void … .catch(() => undefined)` shape.
  - [ ] The existing `deleteMatchDraft(draftId)` call is kept, so a draft with no target match (standalone) is still removed on submit.
  - [ ] `tests/fixtures/matches-page-actions-browser-mock.ts` (and any other alias of `@/lib/wizard/actions`) exports the new action as a no-op so the browser harnesses still bundle; `npm run typecheck` passes.
- **notes:** Root cause of the live stale row: a wizard opened from the schedule line (`?entry=&match=`) has `draftId === null`, so an earlier "Save draft" for the same line survives the upload. `useUploadMatchWizard.ts` is ~3,700 lines — edit only the submit block around :3340-3350; do not read the whole file.

## T3 · Remove the dead "Estimates" lifecycle chip

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/matches/lifecycle-chips.tsx, src/components/dashboard/matches/matches-page-content.tsx, src/components/admin/view-pills.tsx (comment only) (guess)
- **done when:**
  - [ ] `LifecycleValue` is `"all" | "new" | "in-progress"`; the chip row renders All · New · In progress and no "Estimates" button.
  - [ ] `isEstimate`, the `estimates` branch of the lifecycle filter (:616-617) and the `estimates` entry of `LIFECYCLE_NOUN` are deleted; `grep -rn -i "estimates" src/components/dashboard/matches` returns nothing.
  - [ ] A URL carrying `?lifecycle=estimates` (parsed at :523-526) falls back to `all` and the `lifecycle` param is not re-written into the URL for it.
  - [ ] The lifecycle-chips doc comment and `view-pills.tsx:44` no longer describe an Estimates view; `npm run typecheck` and `npm run lint` pass.
- **notes:** Deliberate placeholder from Platform Audit Pb2 (DS 19f) for a Phase 2 low-confidence flag that does not exist on `MatchAnalysis`. `src/app/dashboard/help/page.tsx:80` mentions "Stats labeled as estimates" — help copy about future stats labelling, not the chip; leave it.
