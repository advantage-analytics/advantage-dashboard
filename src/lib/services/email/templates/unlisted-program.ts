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
