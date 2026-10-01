import {
  OUTREACH_FROM,
  OUTREACH_UNSUBSCRIBE_URL,
  SUPPORT_ADDRESS,
} from "../config";
import type { EmailMessage } from "../send";
import {
  renderEmail,
  renderText,
  type EmailContent,
  type EmailFact,
} from "../shell";
import { siteUrl } from "@/lib/site-url";
import type { OutreachRecipient } from "@/lib/services/outreach/types";

/**
 * The beta launch emails, one function for the whole sequence.
 *
 * The copy is what was reviewed on the "Beta Launch Send List" page on
 * 2026-09-30, recipient by recipient. Change it there first, or at least read
 * it there: the wording was checked against what the product actually does
 * today (no "send us a match", which /send-a-match no longer takes).
 *
 * Program emails link each team to its own claim page,
 * `/claim/{program_key}`, so a coach lands on their program instead of a
 * search box. A school whose men's and women's teams share a head coach gets
 * one email with a button per team.
 */

export interface OutreachRender {
  subject: string;
  message: Omit<EmailMessage, "to">;
}

/** Thrown for a missing postal address: cold mail must not go without one. */
export class OutreachConfigError extends Error {}

const PILOT_FACTS: EmailFact[] = [
  { label: "Processing hours", value: "75 a month per program" },
  { label: "Pilot runs through", value: "December 31, 2026" },
  { label: "Cost", value: "Free. No card, no contract." },
];

function teamOf(key: string): "Men's" | "Women's" {
  // Keys end in M or W; a disambiguating suffix ("…M__usdtoreros") follows it.
  return key.split("__")[0].endsWith("M") ? "Men's" : "Women's";
}

function claimLinks(recipient: OutreachRecipient) {
  return recipient.programKeys
    .map((key) => ({
      key,
      team: teamOf(key),
      url: `${siteUrl()}/claim/${encodeURIComponent(key)}`,
    }))
    .sort((a, b) => a.team.localeCompare(b.team));
}

function coach(recipient: OutreachRecipient): string {
  return recipient.toLastName ? `Coach ${recipient.toLastName}` : "Coach";
}

function programButtons(recipient: OutreachRecipient) {
  const links = claimLinks(recipient);
  if (links.length === 0) {
    return { cta: { label: "Set up your program", url: `${siteUrl()}/claim` } };
  }
  if (links.length === 1) {
    return { cta: { label: `Set up ${recipient.label}`, url: links[0].url } };
  }
  return {
    cta: {
      label: `Set up ${links[0].team.toLowerCase()} team`,
      url: links[0].url,
    },
    secondaryCta: {
      label: `Set up ${links[1].team.toLowerCase()} team`,
      url: links[1].url,
    },
  };
}

function programFacts(recipient: OutreachRecipient): EmailFact[] {
  const links = claimLinks(recipient);
  const names = links.length
    ? links.map((link) => `${recipient.label} ${link.team}`).join(" · ")
    : recipient.label;
  return [
    { label: links.length > 1 ? "Programs" : "Program", value: names },
    ...PILOT_FACTS,
  ];
}

export function outreachUnsubscribeUrl(recipient: OutreachRecipient): string {
  const params = new URLSearchParams({
    e: recipient.toEmail,
    t: recipient.programKeys.join(";") || recipient.rowKey,
  });
  return `${OUTREACH_UNSUBSCRIBE_URL}?${params.toString()}`;
}

function contentFor(
  emailNo: number,
  recipient: OutreachRecipient,
  postalAddress: string | null,
): { subject: string; content: EmailContent; cold: boolean } {
  const app = siteUrl();
  const first = recipient.fields.first_name?.trim();
  const hi = first ? `Hi ${first},` : "Hi there,";

  switch (emailNo) {
    case 1:
      return {
        subject: "Advantage Analytics is open for players and teams",
        cold: false,
        content: {
          preheader:
            "You asked to hear from us. Players and college teams can start today.",
          eyebrow: "Now open",
          heading: "Advantage Analytics is open",
          body: [
            hi,
            "You asked to hear from us, so here it is: Advantage Analytics is open.",
            "Players and parents: create a free account, upload a match video or SwingVision export, and get stats, court visualizations and AI match commentary.",
            "College coaches: create a team workspace for your program today. Build your roster, invite players and set dual-match lineups yourself. The Free Fall Season Pilot runs through December 31, 2026.",
          ],
          cta: { label: "Start free", url: `${app}/sign-up` },
          secondaryCta: {
            label: "Set up a college program",
            url: `${app}/claim`,
          },
          note: "Questions? Just reply. Cj",
        },
      };
    case 3:
      return {
        subject: "Your coach can use Advantage too",
        cold: false,
        content: {
          preheader:
            "Your account stays the same. College programs can now get a team workspace.",
          eyebrow: "What's new",
          heading: "Your coach can use Advantage too",
          body: [
            hi,
            recipient.fields.plan === "pro"
              ? "Thanks for being one of the first on Advantage Analytics. Your account and your Pro plan stay exactly as they are."
              : "Thanks for being one of the first players on Advantage Analytics. Your account and your 2 monthly processing hours stay exactly as they are.",
            "What's new: college programs can now create a team workspace. Coaches build a roster, invite players and set dual-match lineups, with 75 processing hours a month for the program through December 31, 2026.",
            "If you play in college, forward this to your coach or send them the link below.",
          ],
          cta: { label: "Share with your coach", url: `${app}/claim` },
          note: "Cj",
        },
      };
    case 4:
      return {
        subject: "Your team workspace is ready to run",
        cold: false,
        content: {
          preheader:
            "Roster, invites and lineups are yours to run whenever you like.",
          eyebrow: "Fall Season Pilot",
          heading: "Your team workspace is ready to run",
          body: [
            `Hi ${coach(recipient)},`,
            "Thanks for being part of the Fall Season Pilot. Your team workspace is now fully in your hands: add players, invite assistants and set lineups whenever you like.",
            "Your program has 75 processing hours a month through December 31, 2026. We'll share what comes after the pilot well before it ends.",
          ],
          facts: [
            {
              label: "Program",
              value: recipient.fields.program || recipient.label,
            },
            { label: "Processing hours", value: "75 a month" },
            { label: "Pilot runs through", value: "December 31, 2026" },
          ],
          cta: {
            label: "Open your team workspace",
            url: `${app}/dashboard/team`,
          },
          note: "Cj",
        },
      };
    case 6:
      return {
        subject: `Re: Send one ${recipient.label} match, get the full breakdown back`,
        cold: true,
        content: {
          preheader: `${recipient.label} can now run its own free team workspace.`,
          eyebrow: "Quick update",
          heading: `${recipient.label} can now run its own workspace`,
          body: [
            `${coach(recipient)}, a quick update since I last wrote.`,
            `${recipient.label} can now create a free team workspace: build your roster, invite players and set dual-match lineups. Uploading a match you've already filmed is the quickest way to see what it shows.`,
          ],
          facts: programFacts(recipient),
          ...programButtons(recipient),
          note: "Questions? Just reply. Cj",
        },
      };
    case 7:
      return {
        subject: `Match stats for ${recipient.label} tennis this fall`,
        cold: true,
        content: {
          preheader:
            "Shot-level stats and AI match commentary from the video you already film.",
          eyebrow: "Advantage Analytics",
          heading: `Match stats for ${recipient.label} tennis this fall`,
          body: [
            `Hi ${coach(recipient)},`,
            "I'm Cj, founder of Advantage Analytics. I graduated from UCLA in 2025, where I worked with the men's tennis program through the Bruins Sports Analytics Club. We built Advantage so college programs can get shot-level stats, court visualizations and AI match commentary from the match video they already film.",
            `${recipient.label} can create a free team workspace today: build your roster, invite players and set dual-match lineups.`,
          ],
          facts: programFacts(recipient),
          ...programButtons(recipient),
          note: "Rather talk first? Just reply to this email. Cj",
        },
      };
    case 8:
      return {
        subject: `Re: Match stats for ${recipient.label} tennis this fall`,
        cold: true,
        content: {
          preheader:
            "A fall match or challenge match on video is a good first upload.",
          eyebrow: "Quick follow-up",
          heading: "A good first upload",
          body: [
            `${coach(recipient)}, quick follow-up.`,
            "If a fall match or challenge match is on video, it's a good first upload to see what Advantage shows.",
          ],
          ...programButtons(recipient),
          note: "Cj",
        },
      };
    default:
      throw new Error(`No outreach email ${emailNo}.`);
  }
}

/**
 * Render one recipient's email. `postalAddress` is required for cold mail
 * (6, 7, 8); without one this throws `OutreachConfigError` rather than send a
 * cold email that breaks CAN-SPAM. Pass `preview: true` to render a visible
 * placeholder instead, for the admin preview only.
 */
export function renderOutreachEmail(
  emailNo: number,
  recipient: OutreachRecipient,
  postalAddress: string | null,
  options: { preview?: boolean } = {},
): OutreachRender {
  const { subject, content, cold } = contentFor(
    emailNo,
    recipient,
    postalAddress,
  );

  let full: EmailContent = content;
  let headers: Record<string, string> | undefined;
  if (cold) {
    const address = postalAddress?.trim();
    if (!address && !options.preview) {
      throw new OutreachConfigError(
        "Set OUTREACH_POSTAL_ADDRESS before sending cold email: CAN-SPAM requires a postal address in the footer.",
      );
    }
    const unsubscribeUrl = outreachUnsubscribeUrl(recipient);
    full = {
      ...content,
      compliance: {
        postalAddress: address || "[OUTREACH_POSTAL_ADDRESS is not set]",
        unsubscribeUrl,
        reason:
          "You received this because we're reaching out to college tennis programs.",
      },
    };
    headers = {
      "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${SUPPORT_ADDRESS}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  return {
    subject,
    message: {
      subject,
      html: renderEmail(full),
      text: renderText(full),
      from: OUTREACH_FROM,
      replyTo: SUPPORT_ADDRESS,
      cc: recipient.cc.map((person) => person.email),
      headers,
      tags: { campaign: "beta-launch", email: `e${emailNo}` },
    },
  };
}
