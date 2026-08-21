import { siteUrl } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * "You've been invited to a program."
 *
 * The first product email, and the one that makes a team workspace possible at
 * all — before this, `inviteMember()` wrote a row whose token it discarded, so
 * the invitee was never told and could not have accepted if they had been.
 *
 * Everything the recipient needs to decide is on the face of the mail: who
 * asked, which program, what standing they are being given, and how long they
 * have. A person who has never heard of this product is being asked to make an
 * account, so "trust us, click here" is not enough.
 */

/**
 * Mirrors `program_invites_role_check`. Owner is absent on purpose: ownership
 * moves by transfer, never by invitation.
 */
export type InviteRole = "coach" | "staff" | "player";

const ROLE_LABEL: Record<InviteRole, string> = {
  coach: "Coach",
  staff: "Staff",
  player: "Player",
};

/**
 * What each standing actually lets you do, in the recipient's terms.
 *
 * Worth the words. "Staff" tells somebody nothing, and an invite that does not
 * say what you are being handed is one a careful person declines.
 */
const ROLE_NOTE: Record<InviteRole, string> = {
  coach:
    "As a coach you'll see every match the program logs, and you can invite the rest of the team.",
  staff:
    "As staff you'll see every match the program logs.",
  player:
    "As a player you'll see your own matches, and the coaching staff will see them too.",
};

export interface ProgramInviteInput {
  to: string;
  programName: string;
  /** Whoever pressed invite. Null when their profile has no name yet. */
  inviterName: string | null;
  role: InviteRole;
  /** The RAW token. Only the hash is in the database — this is its one use. */
  token: string;
  expiresAt: Date;
}

/**
 * Dates render in UTC.
 *
 * The expiry is stored as an absolute instant and compared against `now()` in
 * Postgres, so UTC is what the rule actually runs on. Formatting in the
 * server's local zone would print a date the database disagrees with by up to
 * a day, and the day it disagrees is the one where somebody's link stops
 * working the morning the email said they still had.
 */
function formatExpiry(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function programInviteEmail(input: ProgramInviteInput): EmailMessage {
  const { to, programName, inviterName, role, token, expiresAt } = input;

  const inviter = inviterName?.trim() || null;
  const acceptUrl = `${siteUrl()}/join/${encodeURIComponent(token)}`;

  const subject = inviter
    ? `${inviter} invited you to ${programName} on Advantage`
    : `You've been invited to ${programName} on Advantage`;

  const opening = inviter
    ? `${inviter} added you to ${programName} on Advantage Analytics.`
    : `You've been added to ${programName} on Advantage Analytics.`;

  const content: EmailContent = {
    // Never left to the client to scrape — without this the preview line in
    // every inbox would read "INVITATION", which is the eyebrow.
    preheader: `Set up your account and you're on the ${programName} roster.`,
    eyebrow: "Invitation",
    heading: inviter
      ? `${inviter} invited you to ${programName}`
      : `You're invited to ${programName}`,
    body: [
      opening,
      "Advantage turns match video and match files into the numbers behind a result — serve and return patterns, how games were held and broken, where the pressure points went.",
      ROLE_NOTE[role],
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Your role", value: ROLE_LABEL[role] },
    ],
    cta: { label: "Accept invitation", url: acceptUrl },
    // Both halves matter. The expiry is the deadline; the address is the thing
    // that surprises people — the invite is bound to it, and signing in as
    // anything else is refused rather than silently re-bound. Saying so here
    // turns a dead end into an instruction.
    note: `This invitation expires on ${formatExpiry(expiresAt)} and works only for ${to}. If you weren't expecting it, you can ignore this email.`,
  };

  return {
    to,
    subject,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "program_invite", role },
  };
}
