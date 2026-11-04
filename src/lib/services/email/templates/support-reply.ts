import { emailOrigin } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import { SUPPORT_ADDRESS } from "../config";
import type { EmailMessage } from "../send";

/**
 * A staff reply to a player's in-app "Message Advantage" thread, by email.
 *
 * Sent only for a reply a staff member wrote — never as a receipt for the
 * player's own message. `sendStaffMessage` is the one caller and enforces that.
 * The player can answer the email itself: `replyTo` is the support address, so
 * the answer lands with the same people who read the thread.
 */
export interface SupportReplyInput {
  to: string;
  /** The player's first name; null drops it (the template does not greet). */
  playerFirstName: string | null;
  /** The staff member's first name, as the sign-off and subject show it. */
  adminFirstName: string;
  /** The reply as written. Each newline starts a new paragraph. */
  body: string;
  /** When the reply was sent. Carried for the caller's records; not rendered. */
  sentAt: Date | string;
}

export function supportReplyEmail(input: SupportReplyInput): EmailMessage {
  const { to, adminFirstName } = input;
  const admin = adminFirstName.trim() || "The team";

  const paragraphs = input.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const content: EmailContent = {
    preheader:
      paragraphs[0] ?? `${admin} at Advantage replied to your message.`,
    eyebrow: "Message from Advantage",
    heading: `${admin} replied`,
    body: [...paragraphs, `${admin} at Advantage`],
    cta: {
      label: "Reply in Advantage",
      url: `${emailOrigin()}/dashboard/messages`,
    },
    note: "You can also answer this email. It reaches the same people.",
    footer:
      "You're getting this because the Advantage team replied to your message.",
  };

  return {
    to,
    subject: `${admin} at Advantage replied`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "support_reply" },
    replyTo: SUPPORT_ADDRESS,
  };
}
