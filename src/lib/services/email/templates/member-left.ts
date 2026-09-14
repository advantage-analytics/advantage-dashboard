import { siteUrl } from "@/lib/site-url";
import {
  preferenceNote,
  renderEmail,
  renderText,
  type EmailContent,
} from "../shell";
import type { EmailMessage } from "../send";

/**
 * "A player left your program."
 *
 * Sent to the owner after `leave_program` has already dropped the membership
 * and un-claimed the profile. The mirror of `memberJoinedOwnerEmail`, and to
 * the same one recipient for the same reason: one departure should not fan out
 * into an email per coach.
 *
 * It must say what stayed behind as plainly as what went. A coach reading
 * "left" worries about the match history; the profile and its matches are
 * still on the roster, coach-managed, and a fresh invitation can hand it back.
 */
export interface MemberLeftOwnerInput {
  to: string;
  /** Null when the owner's profile has no name yet; the greeting drops it. */
  ownerName: string | null;
  programName: string;
  /** The leaver's display name — already falls back to their address. */
  memberName: string;
  memberEmail: string;
  /** False when the leaver held no roster profile, so there is nothing kept. */
  profileKept: boolean;
}

export function memberLeftOwnerEmail(
  input: MemberLeftOwnerInput,
): EmailMessage {
  const { to, programName, memberName, memberEmail, profileKept } = input;
  const owner = input.ownerName?.trim();
  const who =
    memberName.trim() && memberName.trim() !== memberEmail
      ? `${memberName.trim()} (${memberEmail})`
      : memberEmail;
  const name = memberName.trim() || memberEmail;

  const content: EmailContent = {
    preheader: `${who} left ${programName}.`,
    eyebrow: "Member left",
    heading: `${name} left ${programName}`,
    body: [
      `Hi${owner ? ` ${owner}` : ""} — ${who} left ${programName} from their team settings. Their seat is free again.`,
      profileKept
        ? "Their player profile and its matches stay on your roster, now managed by your staff. Invite them again and the same profile goes back to them."
        : "Nothing of theirs stays on your roster. Invite them again if they should be back.",
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Email", value: memberEmail },
    ],
    cta: {
      label: "View the roster",
      url: `${siteUrl()}/dashboard/team/roster`,
    },
    note: preferenceNote("Team activity"),
  };

  return {
    to,
    subject: `${name} left ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "member_left_owner" },
  };
}
