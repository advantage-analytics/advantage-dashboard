# Tasks — claude/app-email-audit-dac645

> Scope: internal admin notification emails — team inbox copy of admin review, program-went-live and analysis-failed alerts

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

## T1 · Add INTERNAL_ALERTS_ADDRESS and copy admin-review mail to it

- **status:** todo
- **model:** sonnet
- **files:** src/lib/services/email/config.ts, src/lib/services/email/index.ts, src/lib/services/notifications/admin-review-mail.ts, .env.example, tests/admin-review-recipients.spec.ts (new; names are guesses)
- **done when:**
  - [ ] `config.ts` exports `INTERNAL_ALERTS_ADDRESS`, read as `process.env.INTERNAL_ALERTS_ADDRESS?.trim() || "team@advantage-analytics.com"`, with a doc comment in the file's existing style; `index.ts` re-exports it beside `FROM_ADDRESS`/`SUPPORT_ADDRESS`; `.env.example` documents the variable as optional with that default
  - [ ] `admin-review-mail.ts` exports a pure `reviewNeededRecipients(adminEmails: readonly string[], internal: string): string[]` that returns the admin addresses plus `internal`, deduped case-insensitively (an admin whose email is `Team@Advantage-Analytics.com` yields no second copy), and `notifyAdminsReviewNeeded` sends one `adminReviewNeededEmail` per address in that list — the current `if (admins.length === 0) return;` is removed so the internal address still gets a copy when no admin has an email
  - [ ] No new `claimSend` key: the diff contains exactly the existing `claimSend(\`admin_review:${event.kind}:${event.id}\`)`call and no other`claimSend` call in that file
  - [ ] `tests/admin-review-recipients.spec.ts` (offline, no DB) asserts `reviewNeededRecipients`: (a) internal appended when absent, (b) not duplicated when present in any case, (c) `[internal]` for an empty admin list; and asserts `INTERNAL_ALERTS_ADDRESS` imported from `@/lib/services/email` is a non-empty string containing `@`
  - [ ] The "Admin review needed" row in the `index.ts` doc-comment table reads "to every `is_admin` user plus `INTERNAL_ALERTS_ADDRESS`"
- **notes:** Template unchanged — the existing `note` ("You're getting this because you're an admin…") is acceptable for the team inbox. Only one email spec exists today (`tests/match-video-expiry-email.spec.ts`); copy its offline style. Do not touch `should-notify.ts`.

## T2 · "Program went live" internal alert on both claim paths

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/lib/services/email/templates/admin.ts, src/lib/services/email/index.ts, src/lib/services/notifications/program-live-mail.ts (new), src/lib/services/programs/claim-actions.ts (`completeClaim` + `completeClaimWithToken` `after()` blocks), src/lib/services/programs/admin-actions.ts (`transition`), tests/program-live-email.spec.ts (new)
- **done when:**
  - [ ] `templates/admin.ts` exports `programLiveInternalEmail(input: ProgramLiveInternalInput): EmailMessage` with input `{ to, programName, claimantName, claimantEmail, path: "auto" | "reviewed", adminUrl }`; it builds an `EmailContent` (preheader set, `facts` rows for Program, Claimant `name (email)`, and Path reading "Auto-approved" / "Approved by an admin", one CTA to `adminUrl`), returns `html: renderEmail(...)`, `text: renderText(...)`, `tags: { type: "program_live", path }`; both are exported from `index.ts` and a "Program went live (internal)" row is added to the doc-comment table naming both triggers
  - [ ] `services/notifications/program-live-mail.ts` exports `notifyProgramWentLive(db, { programId, programName, claimantName, claimantEmail, path })` that calls `claimSend(\`program_live:${programId}\`)` first and returns without sending when it is false, sends one message to `INTERNAL_ALERTS_ADDRESS` with `adminUrl = \`${siteUrl()}/admin\``, logs (never throws/returns) a `!sent.ok`, and exports a pure `shouldAnnounceProgramLive(rpc: { status: ClaimStatus; already_owned: boolean } | null): boolean`that is true only for`status`in`objection_window`/`approved`(use`programStatusFor(status) === "active"`from`claim-state.ts`) with `already_owned === false`
  - [ ] Auto path: both `completeClaim` and `completeClaimWithToken` in `claim-actions.ts` call `notifyProgramWentLive(..., { path: "auto" })` inside their existing `after()` callback, guarded by `shouldAnnounceProgramLive(rpc)`, using the same `programDisplayName(...)`, claimant name and email already passed to `notifyIfClaimNeedsReview` and `rpc.program_id`; `notifyIfClaimNeedsReview` itself is unchanged
  - [ ] Reviewed path: `transition()` in `admin-actions.ts` calls `notifyProgramWentLive(..., { path: "reviewed" })` only when `event.type === "approve"` and `next === "objection_window"`, after the `programs` status update and after `notifyClaimant`; the claim select adds `claimant_name` and passes it (falling back to `claimed_email` when null); `rejectClaim`/`handBackClaim`/`reopenClaim` paths do not call it
  - [ ] `tests/program-live-email.spec.ts` (offline) asserts the template for both `path` values: subject, `tags`, the Path fact text, the CTA `href` equals `${siteUrl()}/admin`, and the text part's first line; and asserts `shouldAnnounceProgramLive` for `objection_window`, `approved` (true), `pending_review`, `pending_email`, `already_owned: true`, `null` (false)
- **notes:** The RPC (`complete_program_claim` / `_with_token`) returns only `program_id / status / already_owned / contact_matched` — never a claim id — so key on `program_id`. `contact_matched` is NOT the whole auto path (a `domain_match_skips_review` program also lands live with `contact_matched=false`); decide on `status`, not the flag. Reviewed-path "live" is `objection_window` (`approved` only arrives later via `settle`). `program_live:<program_id>` fires once per program lifetime — a program handed back and reclaimed later never alerts again; accepted by the author 2026-09-26.

## T3 · "Analysis failed" internal alert inside notifyAnalysisOutcome

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/lib/services/email/templates/analysis.ts, src/lib/services/email/index.ts, src/lib/services/notifications/analysis-mail.ts, tests/analysis-failed-internal-email.spec.ts (new)
- **done when:**
  - [ ] `templates/analysis.ts` exports `analysisFailedInternalEmail(input: AnalysisFailedInternalInput): EmailMessage` with input `{ to, jobId, matchId, matchTitle, stage, errorCode, errorMessage, uploaderName, uploaderEmail }` (`stage: string`, `errorCode`/`errorMessage`/`uploaderName`/`uploaderEmail`: `string | null`); it builds an `EmailContent` with preheader set, `facts` rows for Job, Match (id), Stage, Code (omitted when null), Uploader (`name (email)` or "Unknown — account deleted" when both null), one CTA to `${siteUrl()}/dashboard/matches/<matchId>`, `text: renderText(...)`, `tags: { type: "analysis_failed_internal" }`; exported from `index.ts` with a table row "Analysis failed (internal)" that says "no pref, `claimSend("analysis_failed_internal:<job_id>")`"
  - [ ] `analysis-mail.ts` exports a pure `analysisFailureStage(job: { status: string | null; error_step: string | null }): string` returning `"derivation_failed"` for that status and `"failed · <error_step>"` / `"failed"` otherwise, and the job select in `notifyAnalysisOutcome` adds `status, error_code, error_step`
  - [ ] In `notifyAnalysisOutcome`, when `outcome === "failed"` the internal send runs as its own step placed BEFORE the `if (!uploaderId || !matchId) return;` guard and BEFORE `getNotificationPrefs` is called — gated only by `matchId` being present and `claimSend(\`analysis_failed_internal:${jobId}\`)`returning true — sending`analysisFailedInternalEmail`to`INTERNAL_ALERTS_ADDRESS`(uploader name/email resolved from`users`when`created_by`is set, nulls otherwise); a`!sent.ok`is logged under the existing`LOG` prefix; the athlete's path below it is unchanged in behaviour and key
  - [ ] No call site changes: the diff does not touch `src/app/api/webhooks/splitstep/route.ts`, `src/lib/services/splitstep/reconcile.ts` or `src/lib/services/splitstep/derive-and-publish.ts` — every FINAL failed send already funnels through `notifyAnalysisOutcome({ outcome: "failed" })` (7 call sites) and the internal alert lives there once
  - [ ] `tests/analysis-failed-internal-email.spec.ts` (offline) asserts the template's subject, `tags`, the Stage/Code/Uploader fact text for a full input and for the null-uploader/null-code input, the CTA href, and asserts `analysisFailureStage` for `derivation_failed`, `failed` + `downloading_video`, and `failed` + null
- **notes:** `processing_jobs` already carries `error_code`, `error_step`, `error_category`, `error_message`; the athlete mail reads only `error_message` today. Keep `analysisFailedEmail` and its `notifyAnalysisFailed` gate exactly as they are — the internal alert is additive. `analysis-mail.ts` imports `programs-server`; if the spec cannot import it offline, keep `analysisFailureStage` in a small pure module (e.g. `analysis-failure-stage.ts`) and import it from both.
