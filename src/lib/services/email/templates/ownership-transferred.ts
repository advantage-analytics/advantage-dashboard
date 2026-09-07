import { siteUrl } from "@/lib/site-url";
import { SUPPORT_ADDRESS } from "../config";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * "You now own this program."
 *
 * Sent to the new owner after `transfer_program_ownership` has already moved
 * both member rows and `programs.owner_user_id`. Informational, not an
 * acceptance: there is nothing to click to make it true, so the button only
 * opens the page where the new standing shows. What it must say is what
 * changed hands and who handed it — a person who did not expect to be running
 * a program on a Tuesday needs a name to go and ask.
 */
export interface OwnershipTransferredInput {
  to: string;
  /** Null when the profile has no name yet; the greeting falls back. */
  recipientName: string | null;
  programName: string;
  programId: string;
  /** Whoever pressed transfer. Null when their profile has no name. */
  previousOwnerName: string | null;
}

export function ownershipTransferredEmail(
  input: OwnershipTransferredInput
): EmailMessage {
  const { to, programName, programId } = input;
  const previous = input.previousOwnerName?.trim() || "The previous owner";

  const content: EmailContent = {
    preheader: `${previous} handed you ${programName}. Roster, invites and settings are yours now.`,
    eyebrow: "Ownership",
    heading: `You own ${programName}`,
    body: [
      `${previous} transferred ownership of ${programName} on Advantage Analytics to you.`,
      "As the owner you decide who is on the roster and who may send video, and you are the one person who can change the program's name, squad and conference. The previous owner stays on as a coach.",
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Your role", value: "Owner" },
    ],
    cta: {
      label: "Open team settings",
      url: `${siteUrl()}/dashboard/settings/teams/${encodeURIComponent(programId)}`,
    },
    note: `If you weren't expecting this, write to ${SUPPORT_ADDRESS} and we'll look into it.`,
  };

  return {
    to,
    subject: `You now own ${programName} on Advantage`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "ownership_transferred" },
  };
}
