import {
  OUTREACH_FROM,
  OUTREACH_UNSUBSCRIBE_URL,
  SUPPORT_ADDRESS,
} from "../config";
import type { EmailMessage } from "../send";
import {
  ctaBlock,
  renderEmail,
  renderText,
  type EmailContent,
  type EmailFact,
} from "../shell";
import { siteUrl } from "@/lib/site-url";
import {
  COLD_EMAILS,
  COLD_REQUIRED_FIELDS,
  OUTREACH_MERGE_FIELDS,
  type OutreachRecipient,
  type OutreachTemplate,
} from "@/lib/services/outreach/types";

/**
 * The beta launch emails, one function for the whole sequence.
 *
 * Two sources of copy:
 *  - **built in** — the copy below, reviewed on the "Beta Launch Send List"
 *    page on 2026-09-30 against what the product does today;
 *  - **an admin's own version** — subject and HTML pasted or edited on
 *    /admin/outreach (`outreach_templates`), with `{{merge fields}}` filled in
 *    per recipient. "Reset to original" deletes it and the built-in copy is
 *    back.
 *
 * Program emails link each team to its own claim page,
 * `/claim/{program_key}`, so a coach lands on their program instead of a
 * search box. A school whose men's and women's teams share a head coach gets
 * one email with a button per team.
 *
 * Cold mail (6, 7, 8) always carries the List-Unsubscribe headers, and an
 * admin's version of it must contain `{{unsubscribe_url}}` and
 * `{{postal_address}}` before it can be saved.
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

const NO_ADDRESS = "[OUTREACH_POSTAL_ADDRESS is not set]";

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

function programNames(recipient: OutreachRecipient): string {
  const links = claimLinks(recipient);
  return links.length
    ? links.map((link) => `${recipient.label} ${link.team}`).join(" · ")
    : recipient.label;
}

export function outreachUnsubscribeUrl(recipient: OutreachRecipient): string {
  const params = new URLSearchParams({
    e: recipient.toEmail,
    t: recipient.programKeys.join(";") || recipient.rowKey,
  });
  return `${OUTREACH_UNSUBSCRIBE_URL}?${params.toString()}`;
}

/** Every merge field's value for one recipient, unescaped. */
function mergeValues(
  recipient: OutreachRecipient,
  postalAddress: string | null,
): Record<string, string> {
  const first =
    recipient.fields.first_name?.trim() ||
    recipient.toName?.trim().split(/\s+/)[0] ||
    "there";
  const links = claimLinks(recipient);
  return {
    school: recipient.label,
    first_name: first,
    coach: recipient.toLastName ? `Coach ${recipient.toLastName}` : "Coach",
    last_name: recipient.toLastName ?? "",
    to_name: recipient.toName ?? "",
    program: recipient.fields.program || recipient.label,
    programs: programNames(recipient),
    plan_detail:
      recipient.fields.plan === "pro"
        ? "your Pro plan"
        : "your 2 monthly processing hours",
    claim_url: links[0]?.url ?? `${siteUrl()}/claim`,
    app_url: siteUrl(),
    unsubscribe_url: outreachUnsubscribeUrl(recipient),
    postal_address: postalAddress?.trim() || NO_ADDRESS,
  };
}

/**
 * The words of each email. With `tokens` every per-recipient value is its
 * `{{merge field}}` instead, which is how the editor's starting HTML is made.
 */
function contentFor(
  emailNo: number,
  recipient: OutreachRecipient,
  tokens: boolean,
): { subject: string; content: EmailContent } {
  const app = siteUrl();
  const real = mergeValues(recipient, null);
  const v = (field: keyof typeof real) =>
    tokens ? `{{${field}}}` : real[field];
  const school = v("school");
  const coach = v("coach");
  const buttons = tokens
    ? { cta: { label: CLAIM_SENTINEL, url: CLAIM_SENTINEL_URL } }
    : programButtons(recipient);
  const facts = (): EmailFact[] => [
    {
      label:
        tokens || recipient.programKeys.length > 1 ? "Programs" : "Program",
      value: v("programs"),
    },
    ...PILOT_FACTS,
  ];

  switch (emailNo) {
    case 1:
      return {
        subject: "Advantage Analytics is open for players and teams",
        content: {
          preheader:
            "You asked to hear from us. Players and college teams can start today.",
          eyebrow: "Now open",
          heading: "Advantage Analytics is open",
          body: [
            `Hi ${v("first_name")},`,
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
        content: {
          preheader:
            "Your account stays the same. College programs can now get a team workspace.",
          eyebrow: "What's new",
          heading: "Your coach can use Advantage too",
          body: [
            `Hi ${v("first_name")},`,
            `Thanks for being one of the first players on Advantage Analytics. Your account and ${v("plan_detail")} stay exactly as they are.`,
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
        content: {
          preheader:
            "Roster, invites and lineups are yours to run whenever you like.",
          eyebrow: "Fall Season Pilot",
          heading: "Your team workspace is ready to run",
          body: [
            `Hi ${coach},`,
            "Thanks for being part of the Fall Season Pilot. Your team workspace is now fully in your hands: add players, invite assistants and set lineups whenever you like.",
            "Your program has 75 processing hours a month through December 31, 2026. We'll share what comes after the pilot well before it ends.",
          ],
          facts: [
            { label: "Program", value: v("program") },
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
        subject: `Re: Send one ${school} match, get the full breakdown back`,
        content: {
          preheader: `${school} can now run its own free team workspace.`,
          eyebrow: "Quick update",
          heading: `${school} can now run its own workspace`,
          body: [
            `${coach}, a quick update since I last wrote.`,
            `${school} can now create a free team workspace: build your roster, invite players and set dual-match lineups. Uploading a match you've already filmed is the quickest way to see what it shows.`,
          ],
          facts: facts(),
          ...buttons,
          note: "Questions? Just reply. Cj",
        },
      };
    case 7:
      return {
        subject: `Match stats for ${school} tennis this fall`,
        content: {
          preheader:
            "Shot-level stats and AI match commentary from the video you already film.",
          eyebrow: "Advantage Analytics",
          heading: `Match stats for ${school} tennis this fall`,
          body: [
            `Hi ${coach},`,
            "I'm Cj, founder of Advantage Analytics. I graduated from UCLA in 2025, where I worked with the men's tennis program through the Bruins Sports Analytics Club. We built Advantage so college programs can get shot-level stats, court visualizations and AI match commentary from the match video they already film.",
            `${school} can create a free team workspace today: build your roster, invite players and set dual-match lineups.`,
          ],
          facts: facts(),
          ...buttons,
          note: "Rather talk first? Just reply to this email. Cj",
        },
      };
    case 8:
      return {
        subject: `Re: Match stats for ${school} tennis this fall`,
        content: {
          preheader:
            "A fall match or challenge match on video is a good first upload.",
          eyebrow: "Quick follow-up",
          heading: "A good first upload",
          body: [
            `${coach}, quick follow-up.`,
            "If a fall match or challenge match is on video, it's a good first upload to see what Advantage shows.",
          ],
          ...buttons,
          note: "Cj",
        },
      };
    default:
      throw new Error(`No outreach email ${emailNo}.`);
  }
}

const CLAIM_SENTINEL = "__claim_buttons__";
const CLAIM_SENTINEL_URL = "https://claim-buttons.invalid/";

function compliance(unsubscribeUrl: string, postalAddress: string) {
  return {
    postalAddress,
    unsubscribeUrl,
    reason:
      "You received this because we're reaching out to college tennis programs.",
  };
}

/**
 * The built-in email as an editable template: the same HTML the built-in copy
 * renders, with `{{merge fields}}` where the per-recipient values go. This is
 * what the editor starts from.
 */
export function outreachTemplateSource(emailNo: number): {
  subject: string;
  html: string;
} {
  const sample: OutreachRecipient = {
    id: "",
    emailNo,
    rowKey: "",
    label: "",
    division: null,
    conference: null,
    toName: null,
    toLastName: null,
    toRole: null,
    toEmail: "",
    cc: [],
    programKeys: [],
    fields: {},
    held: false,
  };
  const { subject, content } = contentFor(emailNo, sample, true);
  const full: EmailContent = COLD_EMAILS.has(emailNo)
    ? {
        ...content,
        compliance: compliance("{{unsubscribe_url}}", "{{postal_address}}"),
      }
    : content;
  let html = renderEmail(full);
  if (content.cta?.url === CLAIM_SENTINEL_URL) {
    // Swap the sentinel button for the merge field that draws the real ones.
    html = html.replace(
      ctaBlock({ label: CLAIM_SENTINEL, url: CLAIM_SENTINEL_URL }),
      "{{claim_buttons}}",
    );
  }
  return { subject, html };
}

// ── Admin templates ────────────────────────────────────────────────────────

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;
const KNOWN = new Set(OUTREACH_MERGE_FIELDS.map((field) => field.token));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Problems that stop an admin's version from being saved. */
export function checkOutreachTemplate(
  emailNo: number,
  subject: string,
  html: string,
): string[] {
  const problems: string[] = [];
  if (!subject.trim()) problems.push("Add a subject.");
  if (!html.trim()) problems.push("Paste the email's HTML.");
  if (html.length > 300_000)
    problems.push("The HTML is over 300 KB; email clients clip long emails.");
  const unknown = new Set<string>();
  for (const match of `${subject}\n${html}`.matchAll(TOKEN_RE)) {
    if (!KNOWN.has(match[1])) unknown.add(match[1]);
  }
  if (unknown.size) {
    problems.push(
      `Unknown merge field${unknown.size > 1 ? "s" : ""}: ${[...unknown]
        .map((token) => `{{${token}}}`)
        .join(", ")}.`,
    );
  }
  if (/\{\{\s*claim_buttons\s*\}\}/.test(subject)) {
    problems.push("{{claim_buttons}} goes in the HTML, not the subject.");
  }
  if (COLD_EMAILS.has(emailNo)) {
    const missing = COLD_REQUIRED_FIELDS.filter(
      (token) => !new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`).test(html),
    );
    if (missing.length) {
      problems.push(
        `Cold email must include ${missing.map((token) => `{{${token}}}`).join(" and ")} (CAN-SPAM).`,
      );
    }
  }
  return problems;
}

/** Plain-text part for an admin's HTML: the words, without the markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, label) => {
        const words = label.replace(/<[^>]+>/g, "").trim();
        return words && words !== href ? `${words} (${href})` : href;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fillTemplate(
  template: OutreachTemplate,
  recipient: OutreachRecipient,
  postalAddress: string | null,
): { subject: string; html: string } {
  const values = mergeValues(recipient, postalAddress);
  const buttons = programButtons(recipient);
  const subject = template.subject.replace(
    TOKEN_RE,
    (whole, token: string) => values[token] ?? whole,
  );
  const html = template.html.replace(TOKEN_RE, (whole, token: string) => {
    if (token === "claim_buttons") {
      return ctaBlock(buttons.cta, buttons.secondaryCta);
    }
    const value = values[token];
    return value === undefined ? whole : escapeHtml(value);
  });
  return { subject: subject.replace(/\s+/g, " ").trim(), html };
}

/**
 * Render one recipient's email, from the admin's version when there is one.
 * `postalAddress` is required for cold mail (6, 7, 8); without one this throws
 * `OutreachConfigError` rather than send a cold email that breaks CAN-SPAM.
 * Pass `preview: true` to render a visible placeholder instead, for the admin
 * preview only.
 */
export function renderOutreachEmail(
  emailNo: number,
  recipient: OutreachRecipient,
  postalAddress: string | null,
  options: { preview?: boolean; template?: OutreachTemplate | null } = {},
): OutreachRender {
  const cold = COLD_EMAILS.has(emailNo);
  const address = postalAddress?.trim() || null;
  if (cold && !address && !options.preview) {
    throw new OutreachConfigError(
      "Set OUTREACH_POSTAL_ADDRESS before sending cold email: CAN-SPAM requires a postal address in the footer.",
    );
  }

  const unsubscribeUrl = outreachUnsubscribeUrl(recipient);
  const headers = cold
    ? {
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${SUPPORT_ADDRESS}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  let subject: string;
  let html: string;
  let text: string;
  if (options.template) {
    ({ subject, html } = fillTemplate(options.template, recipient, address));
    text = htmlToText(html);
  } else {
    const built = contentFor(emailNo, recipient, false);
    const full: EmailContent = cold
      ? {
          ...built.content,
          compliance: compliance(unsubscribeUrl, address ?? NO_ADDRESS),
        }
      : built.content;
    subject = built.subject;
    html = renderEmail(full);
    text = renderText(full);
  }

  return {
    subject,
    message: {
      subject,
      html,
      text,
      from: OUTREACH_FROM,
      replyTo: SUPPORT_ADDRESS,
      cc: recipient.cc.map((person) => person.email),
      headers,
      tags: { campaign: "beta-launch", email: `e${emailNo}` },
    },
  };
}
