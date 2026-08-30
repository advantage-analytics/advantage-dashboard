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
 * | Claim approved           | claim enters `objection_window`                 |
 * | Claim declined           | `rejectClaim()` / `handBackClaim()`             |
 * | Claim objection notice   | claim enters `objection_window`, to each contact |
 * | Invite request received  | `requestInvite()`                               |
 * | Invite request declined  | `resolveRequest()` with a decline                |
 * | Expired-invite nudge     | `requestFreshInvite()` — WIRED                  |
 *
 * Only the two marked WIRED are called today. The rest are written, reviewed
 * and ready — each one needs its trigger point to call it, which is a change in
 * the action or route that owns that transition, not a change here.
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
  claimApprovedEmail,
  claimDeclinedEmail,
  claimObjectionNoticeEmail,
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
