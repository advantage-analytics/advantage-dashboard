import { siteUrl } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * Someone asked to be let into a program that already has an owner.
 *
 * `requestInvite()` writes a `program_requests` row with `kind =
 * 'invite_request'` and nothing else happens — the requester gets a screen and
 * then silence, for however long it takes staff to look at the queue. Silence
 * after asking to join reads as rejection, so this closes that loop.
 *
 * Two emails, because there are two moments: the acknowledgement, and the
 * answer. Only the second is optional to a system that works — but a person
 * who hears nothing for three days assumes the first never arrived and asks
 * again, which is how the queue fills with duplicates of the same request.
 */

export interface InviteRequestReceivedInput {
  to: string;
  programName: string;
  requesterName: string;
}

export function inviteRequestReceivedEmail(
  input: InviteRequestReceivedInput
): EmailMessage {
  const { to, programName, requesterName } = input;

  const content: EmailContent = {
    preheader: `Your request to join ${programName} is with the coaching staff.`,
    eyebrow: "Request received",
    heading: `Your request to join ${programName} is in`,
    body: [
      `Thanks ${requesterName} — the people who run ${programName} on Advantage can see your request now.`,
      "They decide who joins, not us, so how quickly it moves is up to them. We'll email you either way.",
    ],
    facts: [{ label: "Program", value: programName }],
    // No call to action on purpose. There is nothing for them to do, and a
    // button that only reopens a page they just left invites a second request.
    note: "If you'd rather not wait, a coach at your program can invite you directly from their team settings.",
  };

  return {
    to,
    subject: `Your request to join ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "invite_request_received" },
  };
}

export interface InviteRequestDeclinedInput {
  to: string;
  programName: string;
  /** The reviewer's note, where staff left one. */
  reason: string | null;
}

/**
 * The answer, when the answer is no.
 *
 * There is no matching "approved" email: approving a request sends the person
 * a real invitation, and two messages about one decision is one too many.
 */
export function inviteRequestDeclinedEmail(
  input: InviteRequestDeclinedInput
): EmailMessage {
  const { to, programName, reason } = input;

  const content: EmailContent = {
    preheader: `${programName} didn't add you this time.`,
    eyebrow: "Request closed",
    heading: `${programName} didn't add you`,
    body: [
      "The coaching staff have closed your request. They manage their own roster, so we can't add you ourselves or tell you more than they've said here.",
      "You can still use Advantage on your own — your matches, your account, no program needed.",
    ],
    facts: [
      { label: "Program", value: programName },
      ...(reason ? [{ label: "What they said", value: reason }] : []),
    ],
    cta: { label: "Go to your dashboard", url: `${siteUrl()}/dashboard` },
    note: "If you think this was a mistake, the fastest fix is to ask a coach at your program directly.",
  };

  return {
    to,
    // "Update on…", not the same subject as the acknowledgement. Those two
    // emails arrive days apart into the same thread-sorted inbox, and a
    // decision that looks like a duplicate of the receipt gets left unread.
    // Not "declined" in the subject either — the answer belongs in the mail,
    // not on a line their whole inbox can read over their shoulder.
    subject: `Update on your request to join ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "invite_request_declined" },
  };
}
