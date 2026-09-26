import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * "Something is waiting on you" — the one email that goes to admins rather
 * than to a claimant, a requester or a program owner.
 *
 * One shape covers every reason an admin queue row exists (a claim that
 * failed auto-approval, a claim somebody objected to, a fresh invite request,
 * an unlisted-program submission): `programName` / `claimantName` /
 * `claimedEmail` / `reason` say who is asking and why a human has to look,
 * and `requestsUrl` is the one CTA — a deep link straight to that row in
 * `/admin/requests`, built by the caller (`admin-review-mail.ts`) as
 * `${siteUrl()}/admin/requests?id=<id>` so it lands on the exact row the
 * Requests drawer (T15) opens via its `?id=` param, never a bare list an
 * admin has to search.
 *
 * Deliberately generic rather than one template per event kind: every one of
 * these rows is "a human has to make a call", and an admin working the queue
 * benefits from the same five facts every time rather than four near-identical
 * templates that drift apart the next time the copy changes.
 */
export interface AdminReviewNeededInput {
  /** One admin's address. The caller sends one message per admin. */
  to: string;
  programName: string;
  /** The claimant's or requester's name — whatever `notifyAdminsReviewNeeded` resolved for this event. */
  claimantName: string;
  /** The claimant's or requester's email — the address on the row itself. */
  claimedEmail: string;
  /** Why this needs a human — `reviewReason()` for a claim, a plain sentence for a request. */
  reason: string;
  /** Pre-built by the caller: `${siteUrl()}/admin/requests?id=<id>`. */
  requestsUrl: string;
}

export function adminReviewNeededEmail(
  input: AdminReviewNeededInput,
): EmailMessage {
  const { to, programName, claimantName, claimedEmail, reason, requestsUrl } =
    input;

  const content: EmailContent = {
    preheader: `${programName} needs a decision: ${reason}`,
    eyebrow: "Needs a decision",
    heading: `${programName} is waiting on you`,
    body: [
      `${claimantName} (${claimedEmail}) is waiting on ${programName}, and it needs an admin to look rather than settle on its own.`,
      reason,
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "From", value: `${claimantName} (${claimedEmail})` },
      { label: "Reason", value: reason },
    ],
    cta: { label: "Open requests", url: requestsUrl },
    note: "You're getting this because you're an admin on Advantage Analytics.",
  };

  return {
    to,
    subject: `${programName} needs a decision`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "admin_review_needed" },
  };
}

/**
 * "A program just went live" — an FYI to the internal alerts inbox, never to
 * a user and never to the `is_admin` fan-out.
 *
 * Unlike `adminReviewNeededEmail`, nothing is waiting on the reader: the claim
 * is already settled and the coach is already inside their workspace. It
 * exists because a program landing live is the moment worth a human glance —
 * a new team to welcome, or a claim that should not have auto-approved — and
 * without it that moment only shows up if somebody happens to open `/admin`.
 *
 * `path` says which door the claim came through: `"auto"` when
 * `complete_program_claim*` landed it live on its own (a recorded staff
 * contact, or a program that skips review on a domain match), `"reviewed"`
 * when an admin approved it from the queue. It is also the Resend tag, so the
 * two can be told apart in the log without opening a message.
 */
export interface ProgramLiveInternalInput {
  /** `INTERNAL_ALERTS_ADDRESS`, passed by the caller (`program-live-mail.ts`). */
  to: string;
  programName: string;
  claimantName: string;
  claimantEmail: string;
  path: "auto" | "reviewed";
  /** Pre-built by the caller: `${siteUrl()}/admin`. */
  adminUrl: string;
}

export function programLiveInternalEmail(
  input: ProgramLiveInternalInput,
): EmailMessage {
  const { to, programName, claimantName, claimantEmail, path, adminUrl } =
    input;

  const pathLabel = path === "auto" ? "Auto-approved" : "Approved by an admin";

  const content: EmailContent = {
    preheader: `${claimantName} now owns ${programName} (${pathLabel.toLowerCase()}).`,
    eyebrow: "Program live",
    heading: `${programName} is live`,
    body: [
      `${claimantName} (${claimantEmail}) claimed ${programName}, and the workspace is live.`,
      path === "auto"
        ? "It skipped review, so nobody on the team has looked at it yet."
        : "An admin approved it from the review queue.",
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Claimant", value: `${claimantName} (${claimantEmail})` },
      { label: "Path", value: pathLabel },
    ],
    cta: { label: "Open admin", url: adminUrl },
    note: "Sent to the internal alerts inbox. Nothing needs doing unless something looks wrong.",
  };

  return {
    to,
    subject: `${programName} is live`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "program_live", path },
  };
}
