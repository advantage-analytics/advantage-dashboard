import { siteUrl } from "@/lib/site-url";
import {
  preferenceNote,
  renderEmail,
  renderText,
  type EmailContent,
  type EmailRow,
} from "../shell";
import type { EmailMessage } from "../send";

/**
 * Monday morning, for coaches who asked for it.
 *
 * The preference calls it a "Weekly team digest — Coaches only, Monday summary
 * of the weekend's results", and this is that. Everything in it comes from
 * `getTeamHomeData()`, so the email and team home cannot disagree about what
 * happened — a digest that contradicts the screen it links to is worse than no
 * digest.
 *
 * It is the one email here nobody triggered. That raises the bar rather than
 * lowering it: an unprompted weekly mail earns its place by being worth
 * opening, and stops being sent the first week it is not. Hence the empty-week
 * rule below.
 */

export interface DigestMatch {
  /** "Alex Rivera vs. Jordan Chen" */
  title: string;
  /** "Stanford vs. Cal · Singles 3" */
  context: string;
  /** "Ready", "Stats pending", "Processing" — the same word the list shows. */
  status: string;
}

export interface TeamDigestInput {
  to: string;
  programName: string;
  /** Week covered, e.g. "11–17 August". */
  weekLabel: string;
  matches: DigestMatch[];
  /** Analysis time used this month, pre-formatted: "18h 20m of 75h". */
  allowanceUsed: string;
  /** Players who have joined, against those invited. */
  rosterJoined: number;
  rosterInvited: number;
}

/**
 * Whether this week is worth sending at all.
 *
 * Exported so the sender decides before rendering. A digest that says "no
 * matches, no new players, nothing changed" trains a coach to archive it
 * unread, and by the week something DID happen they no longer look. Silence is
 * the more useful signal.
 */
export function digestIsWorthSending(input: TeamDigestInput): boolean {
  return input.matches.length > 0;
}

export function teamDigestEmail(input: TeamDigestInput): EmailMessage {
  const {
    to,
    programName,
    weekLabel,
    matches,
    allowanceUsed,
    rosterJoined,
    rosterInvited,
  } = input;

  const rows: EmailRow[] = matches.map((match) => ({
    primary: match.title,
    secondary: match.context,
    trailing: match.status,
  }));

  const count = matches.length;
  const plural = count === 1 ? "match" : "matches";

  const outstanding = rosterInvited - rosterJoined;

  const content: EmailContent = {
    preheader: `${count} ${plural} from ${weekLabel} for ${programName}.`,
    eyebrow: "Weekly digest",
    heading: `${programName} — ${weekLabel}`,
    body: [
      `${count} ${plural} landed this week. Here's what's on the board.`,
    ],
    list: rows,
    listTitle: "Matches",
    facts: [
      { label: "Analysis time this month", value: allowanceUsed },
      {
        label: "Roster",
        value:
          outstanding > 0
            ? `${rosterJoined} joined, ${outstanding} still to accept`
            : `${rosterJoined} joined`,
      },
    ],
    cta: { label: "Open team home", url: `${siteUrl()}/dashboard/team` },
    note: preferenceNote("Weekly team digest"),
  };

  return {
    to,
    subject: `${programName} — ${count} ${plural} from ${weekLabel}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "team_digest" },
  };
}
