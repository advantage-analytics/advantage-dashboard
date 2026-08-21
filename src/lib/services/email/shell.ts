/**
 * The HTML every product email is rendered into.
 *
 * This is the markup from `supabase/email-templates/*.html` extracted into a
 * function. It is deliberately a copy rather than an import: those six files
 * are uploaded to Supabase and filled by its own template engine, so they
 * cannot be read at runtime, and the only alternative to duplicating the shell
 * was letting product email look like a different company's.
 *
 * If you change the visual language here, change it there too. That is the one
 * maintenance cost of the split and it is worth paying — the alternative was
 * routing auth mail through this sender, which means owning delivery for
 * password resets, and a password reset that does not arrive is an account
 * nobody can get back into.
 *
 * ── Why the markup looks like 2004 ──────────────────────────────────────────
 * Nested tables with inline styles, VML fallbacks, and a font block that sits
 * alone at the end. Every one of those is load-bearing:
 *
 *  - Tables, because Outlook renders through Word and has no flexbox or grid.
 *  - Inline styles, because Gmail strips <style> from forwarded mail.
 *  - The @font-face block last and hidden from Outlook, because Gmail can drop
 *    the entire block a rule it dislikes lives in. Putting the expendable thing
 *    last means losing the font costs the font, not the responsive rules.
 *  - The VML roundrect, because Outlook ignores border-radius and padding on
 *    anchors — without it the button is blue underlined text.
 */

import { SUPPORT_ADDRESS } from "./config";

export interface EmailFact {
  label: string;
  value: string;
}

/**
 * One row in a repeating list — a match in the weekly digest, and whatever
 * comes after it.
 *
 * Deliberately three fields and no more. A list row that grows a fourth column
 * stops fitting a 320px phone, and a digest nobody can read on a phone on
 * Monday morning is a digest nobody reads.
 */
export interface EmailRow {
  primary: string;
  secondary: string;
  /** Right-aligned. A result, a status word, a number. */
  trailing?: string;
}

export interface EmailContent {
  /**
   * The grey line an inbox shows beside the subject. Set it, always — left
   * empty the client scrapes the first text in the document, which here is the
   * eyebrow, so the preview would read "INVITATION" for every invite ever sent.
   */
  preheader: string;
  /** Small tracked-out label above the heading. Rendered upper case. */
  eyebrow: string;
  heading: string;
  /** Body paragraphs, plain text. Escaped on the way in. */
  body: string[];
  /** A quiet panel of label/value rows, between the body and the button. */
  facts?: EmailFact[];
  /** A repeating list, rendered after the facts panel. */
  list?: EmailRow[];
  /** Heading above the list. Omit for an unlabelled list. */
  listTitle?: string;
  cta?: { label: string; url: string };
  /** Small print under the link — expiry, and what to do if unexpected. */
  note?: string;
}

/**
 * Escape text destined for HTML.
 *
 * Not optional politeness. Program names, player names and school names all
 * reach these templates from user input, and an ampersand in "Men's Tennis &
 * Golf" is enough to corrupt a document that no browser is going to render
 * forgivingly — mail clients are stricter than browsers, not looser.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Outlook's VML button cannot size to its content, so the width is computed.
 *
 * 8.2px per character at 14px/500 Inter, plus the 30px padding either side,
 * floored at 180px so a two-word label still reads as a button rather than a
 * chip. Only Outlook sees this; every other client sizes the real table.
 */
function vmlButtonWidth(label: string): number {
  return Math.max(180, Math.round(label.length * 8.2) + 60);
}

function paragraph(text: string): string {
  return `
                <tr>
                  <td class="px" style="padding:20px 44px 0 44px;">
                    <p class="ink2" style="margin:0; font-family:${FONT}; font-size:15px; line-height:26px; color:#525252;">${esc(text)}</p>
                  </td>
                </tr>`;
}

function factsPanel(facts: EmailFact[]): string {
  const rows = facts
    .map(
      (fact, index) => `
                        <tr>
                          <td style="padding:${index === 0 ? "0" : "10px"} 0 0 0; font-family:${FONT}; font-size:12px; line-height:18px; color:#71717A;" class="ink3">${esc(fact.label)}</td>
                        </tr>
                        <tr>
                          <td style="padding:2px 0 0 0; font-family:${FONT}; font-size:14px; line-height:20px; font-weight:500; color:#0D0D0D;" class="ink">${esc(fact.value)}</td>
                        </tr>`
    )
    .join("");

  return `
                <tr>
                  <td class="px" style="padding:24px 44px 0 44px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tone" style="background:#FAFAFA; border-radius:10px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

/**
 * A repeating list.
 *
 * Rows are separated by a hairline drawn as a `border-top` on every row after
 * the first, rather than by a `<hr>` between them. Outlook renders a stray
 * `<hr>` at full bleed with margins of its own invention; a border on a cell
 * it already has to lay out is the one divider every client agrees on.
 */
function listBlock(rows: EmailRow[], title?: string): string {
  const body = rows
    .map((row, index) => {
      // The first row carries no divider and no top padding, so it gets no
      // `style`/`class` attributes at all rather than empty ones. Empty
      // attributes are valid and invisible, but they read as a bug to the next
      // person to open a rendered email, which is the whole audience for the
      // source of a template.
      const divider =
        index === 0
          ? ""
          : ' style="border-top:1px solid #F3F3F3;" class="rule"';
      const pad = index === 0 ? "0" : "12px";

      return `
                        <tr>
                          <td style="padding:${pad} 0 0 0;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"${divider}>
                              <tr>
                                <td style="padding:${pad} 0 0 0;">
                                  <p class="ink" style="margin:0; font-family:${FONT}; font-size:14px; line-height:20px; font-weight:500; color:#0D0D0D;">${esc(row.primary)}</p>
                                  <p class="ink3" style="margin:2px 0 0 0; font-family:${FONT}; font-size:12px; line-height:18px; color:#71717A;">${esc(row.secondary)}</p>
                                </td>${
                                  row.trailing
                                    ? `
                                <td align="right" valign="top" style="padding:${pad} 0 0 0;">
                                  <p class="ink3" style="margin:0; font-family:${FONT}; font-size:12px; line-height:20px; color:#71717A; white-space:nowrap;">${esc(row.trailing)}</p>
                                </td>`
                                    : ""
                                }
                              </tr>
                            </table>
                          </td>
                        </tr>`;
    })
    .join("");

  return `
                <tr>
                  <td class="px" style="padding:28px 44px 0 44px;">${
                    title
                      ? `
                    <p class="ink4" style="margin:0 0 14px 0; font-family:${FONT}; font-size:10px; font-weight:500; letter-spacing:2.5px; color:#AAAAAA;">${esc(title.toUpperCase())}</p>`
                      : ""
                  }
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}
                    </table>
                  </td>
                </tr>`;
}

function ctaBlock(cta: { label: string; url: string }): string {
  const href = esc(cta.url);
  const label = esc(cta.label);

  return `
                <tr>
                  <td class="px" style="padding:28px 44px 0 44px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:45px;v-text-anchor:middle;width:${vmlButtonWidth(cta.label)}px;" arcsize="13%" strokecolor="#3B82F6" fillcolor="#3B82F6">
                    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:500;">${label}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="btn" bgcolor="#3B82F6" align="center" style="border-radius:6px; box-shadow:0 1px 3px rgba(57,134,243,0.25);">
                          <a href="${href}" target="_blank" style="display:block; padding:14px 30px; font-family:${FONT}; font-size:14px; font-weight:500; letter-spacing:0.5px; color:#FFFFFF; border-radius:6px; white-space:nowrap;">${label}</a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:26px 44px 0 44px;">
                    <p class="ink3" style="margin:0 0 6px 0; font-family:${FONT}; font-size:12px; line-height:20px; color:#71717A;">If the button doesn't work, paste this link into your browser:</p>
                    <p style="margin:0; font-family:${FONT}; font-size:12px; line-height:20px; word-break:break-all;"><a class="accent" href="${href}" style="color:#3B82F6;">${href}</a></p>
                  </td>
                </tr>`;
}

/**
 * The line that tells someone why this landed in their inbox.
 *
 * Every email driven by a switch in Settings carries one, naming the switch in
 * the same words the switch uses. Mail nobody remembers asking for is mail
 * people mark as spam, and a sender's reputation is shared across everything
 * it sends — an ignored digest can cost you an invite.
 */
export function preferenceNote(setting: string): string {
  return `You're getting this because "${setting}" is on in Settings › Preferences, where you can turn it off.`;
}

/** Render one product email to a complete HTML document. */
export function renderEmail(content: EmailContent): string {
  const { preheader, eyebrow, heading, body, facts, list, listTitle, cta, note } =
    content;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${esc(heading)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body { margin:0; padding:0; width:100% !important; background:#FAFAFA;
      -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;
      -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    .btn:hover { background:#2563EB !important; }
    @media only screen and (max-width:600px) {
      .container { width:100% !important; }
      .px { padding-left:28px !important; padding-right:28px !important; }
      .h1 { font-size:22px !important; line-height:30px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bg { background:#0A0A0B !important; }
      .card { background:#0E0E10 !important; border-color:#2E2E2E !important; box-shadow:none !important; }
      .ink { color:#F5F5F5 !important; }
      .ink2 { color:#B5B5B5 !important; }
      .ink3 { color:#9A9A9A !important; }
      .ink4 { color:#828282 !important; }
      .rule { border-color:#1F1F1F !important; }
      .tone { background:#1A1A1C !important; }
      .accent { color:#60A5FA !important; }
      /* The filled CTA keeps #3B82F6 — white text on the lifted dark blue
         would drop below 3:1. Only unfilled blue lifts. */
      .logo-light { display:none !important; }
      .logo-dark { display:inline-block !important; width:140px !important; max-height:none !important; }
    }
</style>

  <!-- Inter sits in its own <style> block, deliberately after the layout rules.
       Gmail strips @font-face and can discard the whole block it lives in, so the
       expendable thing goes last: losing this costs the font and leaves the
       responsive rules above untouched. Hidden from Outlook, which ignores
       @font-face and drops to Times New Roman when it sees one. Order relative to
       usage doesn't matter — @font-face registers at parse time.
       One file covers all three weights; Inter v20 is a variable font. -->
  <!--[if !mso]><!-->
  <style>
    @font-face { font-family:'Inter'; font-style:normal; font-weight:300; font-display:swap;
      src:url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); }
    @font-face { font-family:'Inter'; font-style:normal; font-weight:400; font-display:swap;
      src:url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); }
    @font-face { font-family:'Inter'; font-style:normal; font-weight:500; font-display:swap;
      src:url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2'); }
  </style>
  <!--<![endif]-->
</head>
<body class="bg" style="margin:0; padding:0; background:#FAFAFA;">
  <span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">${esc(preheader)}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" style="background:#FAFAFA;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px; max-width:600px;">

          <tr>
            <td class="card" style="background:#FFFFFF; border:1px solid #F3F3F3; border-radius:14px; box-shadow:0px 2px 8px 0px rgba(0,0,0,0.06);">

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="px" style="padding:44px 44px 0 44px;">
                    <img class="logo-light" src="https://advantage-analytics.com/email/advantage-wordmark.png" width="140" height="25" alt="Advantage" style="display:block; width:140px; height:auto; border:0; outline:none;">
                    <img class="logo-dark" src="https://advantage-analytics.com/email/advantage-wordmark-white.png" width="140" height="25" alt="Advantage" style="display:none; width:0; max-height:0; overflow:hidden; border:0; outline:none;">
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:36px 44px 0 44px;">
                    <p class="ink4" style="margin:0 0 12px 0; font-family:${FONT}; font-size:10px; font-weight:500; letter-spacing:2.5px; color:#AAAAAA;">${esc(eyebrow.toUpperCase())}</p>
                    <h1 class="h1 ink" style="margin:0; font-family:${FONT}; font-size:24px; line-height:32px; font-weight:300; letter-spacing:-0.5px; color:#0D0D0D;">${esc(heading)}</h1>
                  </td>
                </tr>
${body.map(paragraph).join("")}${facts && facts.length > 0 ? factsPanel(facts) : ""}${list && list.length > 0 ? listBlock(list, listTitle) : ""}${cta ? ctaBlock(cta) : ""}${
    note
      ? `
                <tr>
                  <td class="px" style="padding:20px 44px 0 44px;">
                    <p class="ink3" style="margin:0; font-family:${FONT}; font-size:12px; line-height:20px; color:#71717A;">${esc(note)}</p>
                  </td>
                </tr>`
      : ""
  }
                <tr>
                  <td class="px" style="padding:36px 44px 44px 44px;">
                    <div class="rule" style="border-top:1px solid #F3F3F3; padding-top:24px;">
                      <p class="ink3" style="margin:0; font-family:${FONT}; font-size:12px; line-height:20px; color:#71717A;">Need help? Reach us at <a class="accent" href="mailto:${SUPPORT_ADDRESS}" style="color:#3B82F6;">${SUPPORT_ADDRESS}</a>.</p>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 40px 8px 40px;">
              <p class="ink4" style="margin:0; font-family:${FONT}; font-size:11px; line-height:17px; color:#AAAAAA;">&copy; 2026 Advantage Analytics LLC &middot; advantage-analytics.com</p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * The plain-text alternative.
 *
 * Sent alongside the HTML, not instead of it. Spam filters score a
 * multipart message with only an HTML part worse than one carrying both, and
 * an invite that lands in junk is the same outcome as an invite that never
 * sent — which is the failure this whole module exists to fix.
 */
export function renderText(content: EmailContent): string {
  const lines = [content.heading, "", ...content.body];

  if (content.facts?.length) {
    lines.push("");
    for (const fact of content.facts) lines.push(`${fact.label}: ${fact.value}`);
  }

  if (content.list?.length) {
    lines.push("");
    if (content.listTitle) lines.push(content.listTitle, "");
    for (const row of content.list) {
      lines.push(
        row.trailing
          ? `- ${row.primary} — ${row.secondary} (${row.trailing})`
          : `- ${row.primary} — ${row.secondary}`
      );
    }
  }

  if (content.cta) {
    lines.push("", content.cta.label + ":", content.cta.url);
  }

  if (content.note) lines.push("", content.note);

  lines.push("", `Need help? Reach us at ${SUPPORT_ADDRESS}.`);

  return lines.join("\n");
}
