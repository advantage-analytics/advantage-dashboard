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
 *
 * The fourth faces the other direction. The receipt tells the requester their
 * ask was recorded; `joinRequestOwnerNoticeEmail` tells the program's owner
 * that it exists, because a request nobody is told about waits exactly as long
 * as one that was never filed.
 *
 * The fifth closes the far end of the same loop. `memberJoinedOwnerEmail` tells
 * the owner that an invitation was accepted — the one event in this family that
 * is good news, and the one the roster page otherwise records in silence.
 */

export interface InviteRequestReceivedInput {
  /** The requester. This is their receipt, not a notice to the program. */
  to: string;
  programName: string;
  /**
   * Null when they left the name field empty — it is optional on the form, so
   * the greeting has to read without it rather than printing a dangling dash.
   */
  requesterName: string | null;
}

export function inviteRequestReceivedEmail(
  input: InviteRequestReceivedInput,
): EmailMessage {
  const { to, programName, requesterName } = input;

  const name = requesterName?.trim();

  const content: EmailContent = {
    preheader: `Your request to join ${programName} is with the coaching staff.`,
    eyebrow: "Request received",
    heading: `Your request to join ${programName} is in`,
    body: [
      `Thanks${name ? ` ${name}` : ""} — the people who run ${programName} on Advantage can see your request now.`,
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

export interface JoinRequestOwnerNoticeInput {
  /**
   * The program owner's account address, resolved server-side from the
   * `program_members` row with `role = 'owner'` — never anything the request
   * form carried.
   */
  to: string;
  /** "Elena Vasquez", "Elena", or null — the greeting reads without it. */
  ownerName: string | null;
  programName: string;
  /** The address the requester typed. Unverified: it is what they will be invited at. */
  requesterEmail: string;
  /** Optional on the form, so the copy has to survive its absence. */
  requesterName: string | null;
}

/**
 * The notice to the program's owner that someone asked to join.
 *
 * Recipient is the OWNER only, by the author's wording — even though coaches
 * and staff can also approve from the roster page. That is the narrowest
 * reading, chosen on purpose: mailing every approver on every request turns
 * one ask into three emails, and a coach who wants the notice can be added
 * once the owner has said so. If that turns out wrong, widen the recipient
 * list in `requestInvite()`, not here — this template is per-recipient.
 *
 * It fires only when a NEW open request was created. The unique index
 * collapses a resubmitted form into the row already on file, and the send is
 * gated on that distinction, so a second click cannot mail the owner twice.
 *
 * Nothing internal goes in it: no request id, no program id. The CTA is the
 * roster page, which is where the request is approved and where the row
 * already shows — a link straight to an approve action would be a one-click
 * grant sitting in an inbox.
 */
export function joinRequestOwnerNoticeEmail(
  input: JoinRequestOwnerNoticeInput,
): EmailMessage {
  const { to, ownerName, programName, requesterEmail, requesterName } = input;

  const owner = ownerName?.trim();
  const requester = requesterName?.trim();
  // "Elena Vasquez (elena@…)" when they gave a name, the bare address when
  // they did not — the address is the one thing the row always has.
  const who = requester ? `${requester} (${requesterEmail})` : requesterEmail;

  const content: EmailContent = {
    preheader: `${who} asked to join ${programName}.`,
    eyebrow: "Join request",
    heading: `${requester ?? requesterEmail} asked to join ${programName}`,
    body: [
      `Hi${owner ? ` ${owner}` : ""} — ${who} has asked to join ${programName} on Advantage.`,
      "Nothing has changed on your roster. Approving sends them an invitation and reserves a seat; declining closes the request and lets them know.",
    ],
    facts: [
      { label: "Program", value: programName },
      ...(requester ? [{ label: "Name", value: requester }] : []),
      { label: "Email", value: requesterEmail },
    ],
    cta: {
      label: "Review the request",
      url: `${siteUrl()}/dashboard/team/roster`,
    },
    note: "You decide who joins, not us. If you don't recognise this person, declining is the whole of what you need to do.",
  };

  return {
    to,
    subject: `${requester ?? requesterEmail} asked to join ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "join_request_owner_notice" },
  };
}

/**
 * Mirrors `program_members_role_check`. Owner is here where `InviteRole` has
 * none, because this template announces a membership that already exists
 * rather than one being offered — and an owner joining their own program is a
 * row this copy would otherwise have no word for.
 */
export type JoinedRole = "owner" | "coach" | "staff" | "player";

const JOINED_ROLE_NOUN: Record<JoinedRole, string> = {
  owner: "the owner",
  coach: "a coach",
  staff: "staff",
  player: "a player",
};

const JOINED_ROLE_LABEL: Record<JoinedRole, string> = {
  owner: "Owner",
  coach: "Coach",
  staff: "Staff",
  player: "Player",
};

export interface MemberJoinedOwnerInput {
  /**
   * The program owner's account address, resolved server-side with
   * `getProgramOwner()` — never anything the accepting session carried.
   */
  to: string;
  /** "Elena Vasquez", "Elena", or null — the greeting reads without it. */
  ownerName: string | null;
  programName: string;
  /** The joiner's own account address. Always present; the name may not be. */
  joinerEmail: string;
  /** Null when their profile has no name yet, so the copy names the address. */
  joinerName: string | null;
  /**
   * Read back off the `program_members` row the accept just wrote, never from
   * an argument the accepting caller could choose. Null when the row could not
   * be read or carries a role this copy has not learned — the sentence drops
   * the standing rather than inventing one.
   */
  role: JoinedRole | null;
}

/**
 * Somebody the program invited has finished joining it.
 *
 * The other half of `programInviteEmail`. An invitation leaves the coach with
 * no way to know whether it landed: the roster row changes silently, so the
 * only way to find out is to go and look. A coach who invites six players at
 * the start of a season checks the page repeatedly, or stops checking and
 * misses the one that never arrived.
 *
 * Recipient is the OWNER only, matching `joinRequestOwnerNoticeEmail` and for
 * the same reason — one join should not fan out into three emails. Widen it in
 * `join-actions.ts`, not here; this template is per-recipient.
 *
 * It announces a membership that already exists, so there is nothing to
 * approve and nothing internal to carry: no invite id, no token, no program
 * id. The CTA is the roster page, which is where the new row already shows.
 */
export function memberJoinedOwnerEmail(
  input: MemberJoinedOwnerInput,
): EmailMessage {
  const { to, ownerName, programName, joinerEmail, joinerName, role } = input;

  const owner = ownerName?.trim();
  const joiner = joinerName?.trim();
  // "Jordan Ellis (jordan@…)" when the profile has a name, the bare address
  // when it does not — the address is the one thing the account always has.
  const who = joiner ? `${joiner} (${joinerEmail})` : joinerEmail;
  const name = joiner ?? joinerEmail;
  const asRole = role ? ` as ${JOINED_ROLE_NOUN[role]}` : "";

  const content: EmailContent = {
    preheader: `${who} accepted their invitation to ${programName}.`,
    eyebrow: "New member",
    heading: `${name} joined ${programName}`,
    body: [
      `Hi${owner ? ` ${owner}` : ""} — ${who} accepted their invitation and is now on ${programName}${asRole}.`,
      "They can sign in from now on, and any match they log shows up on your roster. Nothing else is waiting on you.",
    ],
    facts: [
      { label: "Program", value: programName },
      ...(joiner ? [{ label: "Name", value: joiner }] : []),
      { label: "Email", value: joinerEmail },
      ...(role ? [{ label: "Role", value: JOINED_ROLE_LABEL[role] }] : []),
    ],
    cta: {
      label: "View the roster",
      url: `${siteUrl()}/dashboard/team/roster`,
    },
    note: "If this wasn't somebody you invited, you can remove them from the roster page.",
  };

  return {
    to,
    subject: `${name} joined ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "member_joined_owner" },
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
  input: ExpiredInviteNudgeInput,
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
    cta: {
      label: "Send a new invite",
      url: `${siteUrl()}/dashboard/team/roster`,
    },
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
  input: InviteRequestDeclinedInput,
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
