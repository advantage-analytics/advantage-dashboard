import { emailOrigin } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * The answer to "Tell us the program", when the answer is no.
 *
 * `submitUnlistedProgram()` files a `program_requests` row with
 * `kind = 'unlisted_program'` and shows the requester a screen promising an
 * email — and until this, a dismissal sent nothing, so the promise was only
 * kept for people whose team got made. A "yes" needs no email of its own:
 * creating the team with their address as the owner sends the claim invite
 * (`programClaimInviteEmail`), and two messages about one decision is one
 * too many.
 *
 * The requester may have no account — the form takes only an address — so
 * the way forward it offers is signing up on their own, not a dashboard.
 *
 * No reason is given, because the queue records none: an admin's Dismiss is
 * a click, not a note. The copy says what is true without inventing a policy.
 */

export interface UnlistedProgramReceivedInput {
  /**
   * The caller's own verified account address — `submitUnlistedProgram()`
   * sends this only when the typed address is the signed-in session's, so the
   * form can never be used to mail an inbox its user doesn't control.
   */
  to: string;
  /** "HZCU Men's" — the school and squad as they typed them. */
  programName: string;
  /** From the form; the greeting reads without it. */
  requesterName: string | null;
}

/**
 * The receipt for "Tell us the program": the request is in, and a person will
 * answer it either way. The answer is one of two emails — the program claim
 * invite when the team is created, or `unlistedProgramDeclinedEmail` — so
 * this one promises an email, never a team.
 */
export function unlistedProgramReceivedEmail(
  input: UnlistedProgramReceivedInput,
): EmailMessage {
  const { to, programName } = input;
  const name = input.requesterName?.trim();

  const content: EmailContent = {
    preheader: `We have your request to add ${programName}.`,
    eyebrow: "Request received",
    heading: `We have your request to add ${programName}`,
    body: [
      `Thanks${name ? ` ${name}` : ""} — ${programName} isn't in our directory yet, so a person on our team will look at it.`,
      "We'll email you either way: a link to set the team up if we add it, or a note if we can't right now.",
    ],
    facts: [{ label: "Program", value: programName }],
    // No call to action: there is nothing for them to do, and a button back
    // to the form they just used invites a second request.
    note: "If you got a detail wrong, reply to this email — a person reads it.",
  };

  return {
    to,
    subject: `Your request to add ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "unlisted_program_received" },
  };
}

export interface UnlistedProgramDeclinedInput {
  /** The address recorded on the request — never anything a caller supplies. */
  to: string;
  /** "HZCU Men's" — the school and squad as they typed them. */
  programName: string;
}

export function unlistedProgramDeclinedEmail(
  input: UnlistedProgramDeclinedInput,
): EmailMessage {
  const { to, programName } = input;

  const content: EmailContent = {
    preheader: `We can't add ${programName} to Advantage right now.`,
    eyebrow: "Request closed",
    heading: `We can't add ${programName} right now`,
    body: [
      `Thanks for asking us to add ${programName}. We've looked at your request, and we aren't able to set up a team workspace for it at the moment.`,
      "You can still use Advantage on your own — your matches and statistics, no program needed.",
    ],
    facts: [{ label: "Program", value: programName }],
    cta: {
      label: "Use Advantage on your own",
      url: `${emailOrigin()}/sign-up`,
    },
    note: "If we got the school wrong, or something has changed, reply to this email — a person reads it.",
  };

  return {
    to,
    // "Update on…", the same shape as the invite-request decline: the answer
    // belongs in the mail, not on a subject line their inbox shows everyone.
    subject: `Update on your request to add ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "unlisted_program_declined" },
  };
}
