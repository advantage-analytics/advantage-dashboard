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
