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
 * | Analysis ready           | job reaches `completed` · pref `notifyAnalysisReady`  |
 * | Analysis failed          | job reaches `failed`/`derivation_failed` · pref `notifyAnalysisFailed` |
 * | Weekly team digest       | Monday schedule · pref `weeklyTeamDigest`      |
 * | Claim verify address     | signed-in `startClaim()` / `resendClaim()` — WIRED |
 * | Claim approved           | `approveClaim()`, to the claimant — WIRED       |
 * | Claim declined           | `rejectClaim()` / `handBackClaim()`, to the claimant — WIRED |
 * | Claim objection notice   | nothing — the announced claim was cut           |
 * | Invite request received  | `requestInvite()`, to a signed-in requester's own address — WIRED |
 * | Invite request declined  | `resolveRequest(id, "dismissed")`, to the requester — WIRED |
 * | Expired-invite nudge     | `requestFreshInvite()` — WIRED                  |
 *
 * The claim and invite-request rows fire from
 * `services/programs/{admin-actions,claim-actions}.ts`. None of them can fail
 * its action: the row is written first and a failed send is logged, never
 * returned — same shape as `inviteMember`.
 *
 * Three qualifications on that table, each a decision rather than an omission:
 *
 *  - **The objection notice has no caller and is not waiting for one.** The
 *    announced claim — mail to every scraped contact on a program whenever
 *    somebody claimed it — was cut before launch. It is unsolicited mail to
 *    people who never signed up, it reads like phishing, and it burns the
 *    sending domain the invitations depend on. The template stays because the
 *    decision could be revisited with real consent; the header on
 *    `app/admin/claims/page.tsx` is where it was made.
 *  - **"Claim approved" fires on the reviewed path only.** A claim that matches
 *    a recorded staff contact skips review entirely and lands live inside
 *    `complete_program_claim`, with the claimant already looking at their
 *    program — no waiting screen was opened, so there is no silence to close.
 *  - **"Invite request received" is a receipt to the requester, not a notice to
 *    the owner** (the queue table's earlier "to the program owner" was a
 *    drafting error). It sends ONLY when the requester is signed in and typed
 *    their OWN account address — never to an arbitrary, unverified inbox — so
 *    the anonymous request form cannot be turned into a mail relay or a
 *    pending-request timing oracle. There is no "invite request approved":
 *    approving one sends a real invitation, and two messages about one decision
 *    is one too many.
 *
 * The analysis and digest rows are still unwired, and still waiting on the
 * trigger points named in `docs/email-system.md` §8.
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
  claimApprovedEmail,
  claimDeclinedEmail,
  claimObjectionNoticeEmail,
  type ClaimVerifyAddressInput,
  type ClaimApprovedInput,
  type ClaimDeclinedInput,
  type ClaimObjectionNoticeInput,
} from "./templates/claim";

export {
  inviteRequestReceivedEmail,
  inviteRequestDeclinedEmail,
  expiredInviteNudgeEmail,
  type InviteRequestReceivedInput,
  type InviteRequestDeclinedInput,
  type ExpiredInviteNudgeInput,
} from "./templates/invite-request";
