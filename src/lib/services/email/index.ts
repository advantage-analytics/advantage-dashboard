/**
 * Transactional email.
 *
 * Import from here, not from the files underneath — the split between the
 * sender, the shell and a template is an implementation detail, and a caller
 * reaching past it is how a second sender eventually appears.
 *
 * Adding an email is three steps: write a template under `templates/` that
 * returns an `EmailMessage`, export it here, and call `sendEmail()` with it
 * from a server action or route handler. The shell is not optional — an email
 * that does not render through it will not look like the six auth templates,
 * and product mail that looks unlike auth mail reads as a phishing attempt.
 *
 * ── What exists, and what fires it ──────────────────────────────────────────
 *
 * | Email                    | Trigger                                        |
 * |--------------------------|------------------------------------------------|
 * | Program invite           | `inviteMember()` — WIRED                        |
 * | Analysis ready           | `deriveAndPublish()` sets `completed` · pref `notifyAnalysisReady` — WIRED |
 * | Analysis failed          | final `failed` (webhook, poll) / `derivation_failed` · pref `notifyAnalysisFailed` — WIRED |
 * | Usage alert (80% / spent) | `reserveQuota()` crosses a line, to owner + coaches · pref `notifyUsageAlerts` — WIRED |
 * | Weekly team digest       | Monday schedule · pref `weeklyTeamDigest` — NOT WIRED, row hidden |
 * | Claim verify address     | signed-in `startClaim()` / `resendClaim()` — WIRED |
 * | Claim verify identity    | `sendClaimVerification()` — an admin, by hand, from the review queue — WIRED |
 * | Claim approved           | `approveClaim()`, to the claimant — WIRED       |
 * | Claim declined           | `rejectClaim()` / `handBackClaim()`, to the claimant — WIRED |
 * | Claim objection notice   | nothing — the announced claim was cut           |
 * | Invite request received  | `requestInvite()`, to a signed-in requester's own address — WIRED |
 * | Join request owner notice | `requestInvite()` on a NEW open row, to the program owner · pref `notifyTeamActivity` — WIRED |
 * | Member joined            | every accept path in `join-actions.ts`, to the program owner · pref `notifyTeamActivity` — WIRED |
 * | Invite request declined  | `resolveRequest(id, "dismissed")`, to the requester — WIRED |
 * | Expired-invite nudge     | `requestFreshInvite()` — WIRED                  |
 * | Ownership transferred    | `transferProgramOwnership()`, to the new owner — WIRED |
 * | Member left              | `leaveProgram()`, to the owner · pref `notifyTeamActivity` — WIRED |
 *
 * The claim and invite-request rows fire from
 * `services/programs/{admin-actions,claim-actions}.ts`. None of them can fail
 * its action: the row is written first and a failed send is logged, never
 * returned — same shape as `inviteMember`.
 *
 * Five qualifications on that table, each a decision rather than an omission:
 *
 *  - **"Claim verify identity" is the one claim email a person sends by hand,
 *    and the one that is meant to be sent twice.** Every other row here fires
 *    from an event; this one fires because an admin looked at a claim they
 *    could not decide and asked the claimed address to vouch for itself. It
 *    therefore takes NO `claimSend()` key: that guard exists for triggers that
 *    can fire twice for one event, where the second send is an accident, and
 *    here the second send is an admin pressing Resend because the first did
 *    not arrive. A dedupe key would eat the retry and report success.
 *
 *  - **The objection notice has no caller and is not waiting for one.** The
 *    announced claim — mail to every scraped contact on a program whenever
 *    somebody claimed it — was cut before launch. It is unsolicited mail to
 *    people who never signed up, it reads like phishing, and it burns the
 *    sending domain the invitations depend on. The template stays because the
 *    decision could be revisited with real consent; the header on the admin
 *    requests page (`src/app/admin/requests/page.tsx`, née `/admin/claims`)
 *    is where it was made.
 *  - **"Claim approved" fires on the reviewed path only.** A claim that matches
 *    a recorded staff contact skips review entirely and lands live inside
 *    `complete_program_claim`, with the claimant already looking at their
 *    program — no waiting screen was opened, so there is no silence to close.
 *  - **"Invite request received" is a receipt to the requester; "Join request
 *    owner notice" is the notice to the owner.** They are gated differently
 *    because they carry different risks. The receipt sends ONLY when the
 *    requester is signed in and typed their OWN account address — never to an
 *    arbitrary, unverified inbox — so the anonymous form cannot be turned into
 *    a mail relay. The owner notice goes to an address resolved server-side
 *    from `program_members` (`services/programs/program-owner.ts`), never one
 *    the form carried, and fires only when a NEW open row was created — a
 *    resubmitted form collapses into the existing row and mails nobody twice.
 *    It runs in `after()` so the caller's response is identical whether or not
 *    it fired: the form still cannot be used as a pending-request timing
 *    oracle. There is no "invite request approved": approving one sends a
 *    real invitation, and two messages about one decision is one too many.
 *  - **"Member joined" closes the far end of the invitation.** It fires from the
 *    one funnel every accept passes through, after the membership row is
 *    confirmed and before the redirect, to the owner resolved by the same
 *    `program-owner.ts` helper — skipped when the joiner IS the owner, and a
 *    failed send only logs: the membership stands either way.
 *
 * A `pref` column names the switch on Settings › Preferences that gates the
 * send. Gating and once-only delivery live in `services/notifications/` —
 * `getNotificationPrefs()` / `wantsNotification()` read the switch for a user
 * who may not be the caller, and `claimSend()` keys one-shot mail in
 * `notification_sends` so a retried webhook or a re-run derivation stays
 * silent. The digest is the one row still unwired (`docs/email-system.md` §8).
 */

export { sendEmail, type EmailMessage, type EmailResult } from "./send";
export {
  renderEmail,
  renderText,
  preferenceNote,
  type EmailContent,
  type EmailFact,
  type EmailRow,
} from "./shell";
export { FROM_ADDRESS, SUPPORT_ADDRESS } from "./config";

export {
  programInviteEmail,
  type ProgramInviteInput,
  type InviteRole,
} from "./templates/program-invite";

export {
  analysisReadyEmail,
  analysisFailedEmail,
  type AnalysisReadyInput,
  type AnalysisFailedInput,
} from "./templates/analysis";

export {
  teamDigestEmail,
  digestIsWorthSending,
  type TeamDigestInput,
  type DigestMatch,
} from "./templates/team-digest";

export {
  claimVerifyAddressEmail,
  claimVerifyIdentityEmail,
  claimApprovedEmail,
  claimDeclinedEmail,
  claimObjectionNoticeEmail,
  type ClaimVerifyAddressInput,
  type ClaimVerifyIdentityInput,
  type ClaimApprovedInput,
  type ClaimDeclinedInput,
  type ClaimObjectionNoticeInput,
} from "./templates/claim";

export {
  ownershipTransferredEmail,
  type OwnershipTransferredInput,
} from "./templates/ownership-transferred";

export {
  memberLeftOwnerEmail,
  type MemberLeftOwnerInput,
} from "./templates/member-left";

export {
  usageAlertEmail,
  type UsageAlertInput,
  type UsageAlertSeverity,
} from "./templates/usage-alert";

export {
  inviteRequestReceivedEmail,
  joinRequestOwnerNoticeEmail,
  memberJoinedOwnerEmail,
  inviteRequestDeclinedEmail,
  expiredInviteNudgeEmail,
  type InviteRequestReceivedInput,
  type JoinRequestOwnerNoticeInput,
  type MemberJoinedOwnerInput,
  type JoinedRole,
  type InviteRequestDeclinedInput,
  type ExpiredInviteNudgeInput,
} from "./templates/invite-request";
