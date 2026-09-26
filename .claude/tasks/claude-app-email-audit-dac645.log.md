# Run log — claude/app-email-audit-dac645

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add INTERNAL_ALERTS_ADDRESS and copy admin-review mail to it — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `INTERNAL_ALERTS_ADDRESS` (env override, default team@advantage-analytics.com) added to `email/config.ts`, re-exported from `index.ts`, documented in `.env.example`. `notifyAdminsReviewNeeded` now sends to `reviewNeededRecipients(admins, INTERNAL_ALERTS_ADDRESS)` (case-insensitive dedupe) under the same `claimSend` key, and no longer returns early when no admin has an email. New offline spec `tests/admin-review-recipients.spec.ts`.
**follow-ups:**

1. The "notification not sent" warn line now logs `to` instead of `adminId`; no in-repo consumer parses it.
2. No test drives `notifyAdminsReviewNeeded` end-to-end with a mocked db/send to prove the internal copy actually sends.

## T2 · "Program went live" internal alert on both claim paths — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New `programLiveInternalEmail` template (`templates/admin.ts`, tags `program_live` + path) and `notifications/program-live-mail.ts` with `notifyProgramWentLive` (keyed `claimSend("program_live:<program_id>")`, sends to `INTERNAL_ALERTS_ADDRESS`) and pure `shouldAnnounceProgramLive`. Wired into the `after()` blocks of `completeClaim` / `completeClaimWithToken` (auto path, gated on RPC status) and into `transition()` on approve → `objection_window` (reviewed path; select adds `claimant_name`). Index table row added. New offline spec `tests/program-live-email.spec.ts`.
**follow-ups:**

1. Reviewed path reads the program row twice (once in `notifyClaimant`, once for the alert); `notifyClaimant` could return the display name.
2. `docs/email-system.md` doesn't mention the new internal alerts — update it once T3 lands.
