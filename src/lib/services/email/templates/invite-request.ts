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
 *
 * A third joined them for the other way in. Someone who was already invited and
 * let the link lapse is not asking the review queue to consider them — they are
 * asking one named coach to press resend — so `expiredInviteNudgeEmail` goes to
 * that coach rather than into the queue.
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

export interface ExpiredInviteNudgeInput {
  /** The inviter's own address, read from `program_invites.invited_by`. */
  to: string;
  programName: string;
  /** The address the expired invitation was sent to. */
  inviteeEmail: string;
  expiredOn: Date;
}

/**
 * The nudge from screen 9.2a — "or we can nudge her for you".
 *
 * A third message in this family because it is the same shape of event: a
 * person outside the program asking to be let in. What differs is that this
 * one already had an invitation, so the recipient is the one coach who sent it
 * rather than the review queue, and the ask is "resend", not "consider me".
 *
 * The recipient is never chosen by the caller. `requestFreshInvite()` reads it
 * off the invitation row the token addresses, so the only address this can
 * ever reach is the one that sent the invitation in the first place.
 *
 * Nothing internal goes in it: no token, no invite id, no program id. The
 * expired token is a live-looking credential and the coach does not need it —
 * resending mints a new one.
 */
export function expiredInviteNudgeEmail(
  input: ExpiredInviteNudgeInput
): EmailMessage {
  const { to, programName, inviteeEmail, expiredOn } = input;

  // UTC, like every other date in this module: expiry was compared against
  // `now()` in Postgres, and a local-zone rendering prints a day the database
  // disagrees with.
  const expired = expiredOn.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const content: EmailContent = {
    preheader: `${inviteeEmail} opened your invitation after it had expired.`,
    eyebrow: "Invite expired",
    heading: `${inviteeEmail} needs a new invite`,
    body: [
      `The invitation you sent to ${inviteeEmail} for ${programName} expired before it was used, and they have just asked for another.`,
      "Nothing has changed on your roster. An expired invitation grants nothing on its own, and a replacement can only come from you.",
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Invited", value: inviteeEmail },
      { label: "Expired", value: expired },
    ],
    cta: { label: "Send a new invite", url: `${siteUrl()}/dashboard/team/roster` },
    note: "Inviting the same address again refreshes the invitation rather than adding a second one. If you would rather not, nothing else happens.",
  };

  return {
    to,
    subject: `${inviteeEmail} asked for a new invite to ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "invite_nudge_expired" },
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
